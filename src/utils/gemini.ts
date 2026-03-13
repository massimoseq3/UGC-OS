const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

// Model IDs
const TEXT_MODEL = 'gemini-3-flash-preview'
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview'
const VIDEO_MODEL = 'veo-3.1-fast-generate-preview'
const TTS_MODEL = 'gemini-2.5-flash-preview-tts'

// ── Helpers ──────────────────────────────────────────────────────────

async function postGenerateContent(
  apiKey: string,
  model: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const message = (err as { error?: { message?: string } }).error?.message ?? res.statusText
    throw new Error(`Gemini API error (${res.status}): ${message}`)
  }
  return res.json()
}

function extractText(response: unknown): string {
  const r = response as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = r.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('No text in Gemini response')
  return text
}

// ── Text Generation (Gemini 3 Flash) ────────────────────────────────

export async function geminiTextGenerate(
  apiKey: string,
  prompt: string,
  systemInstruction?: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
  }
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] }
  }
  const response = await postGenerateContent(apiKey, TEXT_MODEL, body)
  return extractText(response)
}

// ── Text Generation with Image Input (Gemini 3 Flash) ───────────────

export async function geminiAnalyzeImage(
  apiKey: string,
  prompt: string,
  imageBase64: string,
  imageMimeType: string,
  systemInstruction?: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: imageMimeType, data: imageBase64 } },
      ],
    }],
  }
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] }
  }
  const response = await postGenerateContent(apiKey, TEXT_MODEL, body)
  return extractText(response)
}

// ── Text-to-Speech (Gemini 2.5 Flash TTS) ───────────────────────────

export interface TTSResult {
  audioBase64: string
  mimeType: string
}

export async function geminiTTS(
  apiKey: string,
  text: string,
  voiceName: string,
): Promise<TTSResult> {
  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName,
          },
        },
      },
    },
  }
  const response = await postGenerateContent(apiKey, TTS_MODEL, body)
  const r = response as {
    candidates?: {
      content?: {
        parts?: { inlineData?: { mimeType: string; data: string } }[]
      }
    }[]
  }
  const audioPart = r.candidates?.[0]?.content?.parts?.[0]?.inlineData
  if (!audioPart) throw new Error('No audio in TTS response')
  return {
    audioBase64: audioPart.data,
    mimeType: audioPart.mimeType,
  }
}

// ── Image Generation (Nano Banana 2 / Gemini 3.1 Flash Image) ──────

export interface GeneratedImageResult {
  base64: string
  mimeType: string
}

export async function geminiImageGenerate(
  apiKey: string,
  prompt: string,
  aspectRatio: string = '9:16',
  referenceImages?: Array<{ base64: string; mimeType: string }>,
  signal?: AbortSignal,
): Promise<GeneratedImageResult> {
  const contentParts: Record<string, unknown>[] = [{ text: prompt }]
  if (referenceImages?.length) {
    for (const ref of referenceImages) {
      contentParts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } })
    }
  }
  const body = {
    contents: [{ parts: contentParts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio,
      },
    },
  }
  const response = await postGenerateContent(apiKey, IMAGE_MODEL, body, signal)
  const r = response as {
    candidates?: {
      content?: {
        parts?: { inlineData?: { mimeType: string; data: string }; text?: string }[]
      }
    }[]
  }
  const parts = r.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((p) => p.inlineData)
  if (!imagePart?.inlineData) {
    throw new Error('No image in Gemini response')
  }
  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
  }
}

// ── Video Generation (Veo 3.1 Frame-to-Video) ──────────────────────

export async function geminiVideoGenerate(
  apiKey: string,
  prompt: string,
  imageBase64: string,
  imageMimeType: string,
  aspectRatio: string = '9:16',
  pollIntervalMs: number = 5000,
  maxPollAttempts: number = 60,
): Promise<Blob> {
  // Start the long-running operation — image is the first frame
  const startRes = await fetch(`${BASE_URL}/${VIDEO_MODEL}:predictLongRunning`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      instances: [{
        prompt,
        image: {
          inlineData: {
            mimeType: imageMimeType,
            data: imageBase64,
          },
        },
      }],
      parameters: {
        aspectRatio,
      },
    }),
  })

  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({}))
    const message = (err as { error?: { message?: string } }).error?.message ?? startRes.statusText
    throw new Error(`Veo API error (${startRes.status}): ${message}`)
  }

  const operation = await startRes.json() as { name: string }
  const operationName = operation.name

  // Poll for completion
  for (let i = 0; i < maxPollAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))

    const pollRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
      { headers: { 'x-goog-api-key': apiKey } },
    )

    if (!pollRes.ok) continue

    const pollData = await pollRes.json() as {
      done?: boolean
      response?: {
        generateVideoResponse?: {
          generatedSamples?: { video?: { uri?: string } }[]
        }
      }
      error?: { message?: string }
    }

    if (pollData.error) {
      throw new Error(`Veo generation failed: ${pollData.error.message}`)
    }

    if (pollData.done) {
      const videoUri = pollData.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
      if (!videoUri) throw new Error('No video URI in Veo response')

      // Download the video (requires API key auth) and return a blob URL
      const videoRes = await fetch(videoUri, {
        headers: { 'x-goog-api-key': apiKey },
      })
      if (!videoRes.ok) throw new Error('Failed to download generated video')
      return videoRes.blob()
    }
  }

  throw new Error('Video generation timed out')
}

// ── Utility: Convert File to base64 ─────────────────────────────────

export function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve({ base64, mimeType: file.type })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
