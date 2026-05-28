import type { AnalysisResult } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import {
  createTask,
  pollTask,
  kieChatCompletions,
  fileToDataUri,
  ensureHostedUrl,
  type ChatMessage,
} from '../../../utils/kie'
import { getChatEndpointPath } from '../../../utils/models'

const CHAT_MODEL_ID = 'gemini-3-flash'
// Streaming fallback timeout — kept generous since chat completions don't
// have intermediate progress signals like the task-based flow.
const STREAM_TIMEOUT_MS = 300_000

const SYSTEM_INSTRUCTION = `You are an elite UGC ad analyst. You dissect social media video ads and produce three things: a brutally honest scorecard, an accurate timestamped transcript, and a reverse-engineered prompt that could be sent to a text-to-video model (e.g. Seedance, Veo) to recreate the ad ONE-FOR-ONE, faithfully.

You must respond with ONLY valid JSON matching this exact structure (no markdown, no code fences):

SCORECARD RULE: Be brutally honest. Do not inflate scores. Most ads are average (5/10). If a hook is boring, give it a 2 or 3. If the visuals are static, penalize it. A 9/10 or 10/10 should be reserved for big direct-to-consumer brands level.

FAITHFUL RECREATION RULE — CRITICAL: Your job is to produce prompts that, when pasted into Seedance, will recreate the original ad as accurately as possible. Therefore in every scene prompt you MUST:

1. Describe the ORIGINAL character in full visual detail. Include: apparent age range (e.g. "late 20s"), gender presentation, ethnicity cues, body type / build, hair (length, colour, styling — e.g. "shoulder-length wavy auburn hair, parted in the middle"), face shape and any distinctive features, wardrobe (every visible garment with colour and fit — e.g. "oversized cream cable-knit sweater, neutral tone"), accessories (jewellery, glasses, headwear, nail polish), and current micro-expression / gaze direction / hand position. Do NOT use placeholders. Do NOT write [CHARACTER]. Describe what you actually see.

2. Describe the ORIGINAL product in full visual detail. Include: brand name / wordmark exactly as it appears on the label if visible, container shape (dropper bottle / pump / jar / sachet / sleeve / blister pack / box / etc.), container colour and material (clear glass / matte black plastic / metallic / kraft / etc.), label colour and design cues, approximate size relative to the hand, and how the character is interacting with it (held, opened, applied, sprayed, sipped, etc.). If the product appears in more than one form across scenes (boxed → unboxed → in use), note the form for each scene. Do NOT use placeholders. Do NOT write [PRODUCT]. Describe what you actually see.

3. Embed the ORIGINAL spoken line(s) for that scene inside the prompt body. Wrap them in quotes and attribute the speaker, e.g. "She says: 'I had dark spots from years of sun damage and nothing worked.'" Keep dialogue separate from action / camera direction so the next stage can find and rewrite it cleanly.

CHUNKING RULE — CRITICAL: Read the total ad duration. If it is 15 seconds or less, produce a SINGLE scene that covers the whole ad. Otherwise break the ad into multiple scenes at natural shot/scene boundaries. Each scene MUST be 15 seconds or less. Aim for 8–12 seconds per scene. Number scenes starting at 1.

SCENE PROMPT QUALITY: Each scene's prompt field must be a fully self-contained Seedance-ready directive. Beyond the character, product, and dialogue, describe: setting (location, props, colour palette), framing (POV, close-up, medium, wide, over-the-shoulder, mirror selfie, etc.), camera movement (static, slow push, hand-held, whip pan, etc.), lighting (natural window light, warm kitchen tungsten, cool overhead bathroom, etc.), and mood. 4–8 sentences is the right length.

LABEL: Each scene's label is a short noun phrase (3–6 words) describing the shot — e.g. "Mirror reaction hook", "Product unboxing close-up", "Bathroom routine reveal".

AD TITLE: Produce a short (3–6 word) Title Case descriptor of the ad as a whole, naming the product/brand and the angle. Examples: "Dunkin Zero-Sugar Berry Energy", "Glow Skin Serum Routine Reveal", "Tarte Two-Minute Glam Tutorial". No quotes, no trailing punctuation.

{
  "adTitle": "<3-6 word Title Case descriptor>",
  "scorecard": {
    "scores": [
      { "label": "Hook Strength", "score": <1-10> },
      { "label": "Structure Clarity", "score": <1-10> },
      { "label": "Visual Variety", "score": <1-10> },
      { "label": "Persuasion Depth", "score": <1-10> },
      { "label": "Overall Execution", "score": <1-10> }
    ],
    "analystNote": "<2-3 sentence analyst summary>"
  },
  "transcript": [
    { "timestamp": "<MM:SS>", "text": "<line>" }
  ],
  "reverseEngineeredPrompt": {
    "totalDurationSeconds": <integer>,
    "isSingleClip": <boolean — true if totalDurationSeconds <= 15>,
    "scenes": [
      {
        "index": <1-based integer>,
        "startTime": "<MM:SS>",
        "endTime": "<MM:SS>",
        "durationSeconds": <integer, <= 15>,
        "label": "<short shot name>",
        "prompt": "<self-contained Seedance prompt — fully describes the original character, the original product, and embeds the original spoken line(s)>"
      }
    ]
  }
}`

const USER_PROMPT = `Analyze this UGC ad video/image thoroughly. Produce: (1) a brutally honest scorecard, (2) an accurate timestamped transcript, (3) a reverse-engineered prompt — chunked into scenes of ≤15 seconds each. Each scene prompt MUST describe the original character in full identifying detail, describe the original product in full identifying detail, and embed the original spoken dialogue for that scene. Do not use placeholder tokens. Return the analysis as JSON.`

// Upload the ad to kie's file host once and reference the returned URL in the
// chat message. Avoids inflating the createTask payload with ~66 MB of inline
// base64 on a 50 MB upload. Hosted files expire after 3 days on kie's side —
// enough to outlive any single analysis.
async function buildMessages(videoFile: File, apiKey: string): Promise<ChatMessage[]> {
  const dataUri = await fileToDataUri(videoFile)
  const hostedUrl = await ensureHostedUrl(apiKey, dataUri)
  return [
    { role: 'system', content: [{ type: 'text', text: SYSTEM_INSTRUCTION }] },
    {
      role: 'user',
      content: [
        { type: 'text', text: USER_PROMPT },
        { type: 'image_url', image_url: { url: hostedUrl } },
      ],
    },
  ]
}

// kie's chat completions response can be unwrapped into a single text blob
// through several shapes depending on whether the recordInfo route returns the
// raw OpenAI envelope, just the message string, or just `content`. Try the
// known shapes in turn and surface the raw envelope if none match.
function extractTextFromResultEnvelope(envelope: unknown): string | null {
  if (typeof envelope === 'string') return envelope
  if (!envelope || typeof envelope !== 'object') return null
  const obj = envelope as Record<string, unknown>

  // OpenAI-shape
  const choices = obj.choices
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const first = choices[0] as Record<string, unknown>
    const msg = first.message as Record<string, unknown> | undefined
    if (msg && typeof msg.content === 'string') return msg.content
    if (typeof first.text === 'string') return first.text
  }

  // Flatter shapes kie sometimes returns
  if (typeof obj.content === 'string') return obj.content
  if (typeof obj.response === 'string') return obj.response
  if (typeof obj.output === 'string') return obj.output
  if (typeof obj.text === 'string') return obj.text

  return null
}

function parseAnalysisJson(rawText: string): AnalysisResult {
  const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    throw new Error(`Bad JSON from ad analysis model: ${reason} — body: ${cleaned.slice(0, 400)}`)
  }
  if (!parsed || typeof parsed !== 'object' || !('reverseEngineeredPrompt' in parsed)) {
    throw new Error(`Analysis response missing reverseEngineeredPrompt — body: ${cleaned.slice(0, 400)}`)
  }
  return parsed as AnalysisResult
}

// ── Public API ─────────────────────────────────────────────────────

export type StartAnalysisOutcome =
  | { kind: 'task'; taskId: string }
  | { kind: 'fallback'; reason: string }

// Kick off an analysis via kie's createTask flow. The taskId returned here
// is what we persist on the history row so a refresh can resume the poll.
// If kie rejects createTask for the chat model (the endpoint is rare for
// chat), we resolve with `{ kind: 'fallback', reason }` and the queue falls
// through to the streaming transport — current behaviour, parity with the
// pre-v3 path.
export async function startAnalysisTask(videoFile: File): Promise<StartAnalysisOutcome> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const messages = await buildMessages(videoFile, apiKey)

  try {
    const taskId = await createTask(apiKey, CHAT_MODEL_ID, {
      messages,
      stream: false,
      reasoning_effort: 'low',
      include_thoughts: false,
    })
    if (!taskId || typeof taskId !== 'string') {
      return { kind: 'fallback', reason: 'createTask returned empty taskId' }
    }
    return { kind: 'task', taskId }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.warn('[ad-anatomy] createTask rejected, falling back to streaming:', reason)
    return { kind: 'fallback', reason }
  }
}

// Resume / wait on an existing kie task. Used both for new analyses (right
// after startAnalysisTask returned a taskId) and for mount-time resume after
// a refresh.
export async function pollAnalysisTask(taskId: string): Promise<AnalysisResult> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const record = await pollTask(apiKey, taskId)

  // Parse resultJson — kie sometimes returns it as a JSON string holding the
  // chat envelope, sometimes as a string holding the raw model text.
  let envelope: unknown
  try {
    envelope = JSON.parse(record.resultJson || '""')
  } catch {
    envelope = record.resultJson
  }
  const text = extractTextFromResultEnvelope(envelope)
  if (!text) {
    throw new Error(
      `Analysis task ${taskId} succeeded but no text could be extracted. Raw resultJson: ${record.resultJson?.slice(0, 400)}`,
    )
  }
  return parseAnalysisJson(text)
}

// Streaming fallback. Same transport as before — kept as a safety net when
// createTask is unavailable for the chat model. Cannot be resumed across
// refresh; the queue knows this and the reconciler flips such rows to error.
export async function streamAnalysisFallback(videoFile: File): Promise<AnalysisResult> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const endpoint = getChatEndpointPath()
  const messages = await buildMessages(videoFile, apiKey)
  const responseText = await kieChatCompletions(apiKey, endpoint, messages, {
    timeoutMs: STREAM_TIMEOUT_MS,
  })
  return parseAnalysisJson(responseText)
}

// Back-compat export: the old single-call surface. Composes start → poll →
// fallback so existing callers (none in-tree after v3, but kept for safety)
// keep working.
export async function analyzeAd(videoFile: File): Promise<AnalysisResult> {
  const outcome = await startAnalysisTask(videoFile)
  if (outcome.kind === 'task') return pollAnalysisTask(outcome.taskId)
  return streamAnalysisFallback(videoFile)
}
