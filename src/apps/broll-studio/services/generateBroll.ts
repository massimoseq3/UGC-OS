import type { BrollInput, BrollResult, Scene, PromptVariation, ReferenceImage } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import {
  kieChatCompletions,
  kieImageGenerate,
  kieVideoGenerate,
  ensureHostedUrl,
  downloadAsBase64,
  type ChatMessage,
} from '../../../utils/kie'
import { getModel, getDefaultModel } from '../../../utils/models'
import { saveBase64Asset, saveAsset, isAssetRef, getAsBase64 } from '../../../utils/assetStore'

function getChatEndpoint(): { apiKey: string; endpoint: string } {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const model = getModel('gemini-3-flash')
  if (!model?.chatEndpoint) throw new Error('Chat model is not configured. Check src/utils/models.ts.')
  return { apiKey, endpoint: model.chatEndpoint }
}

let idCounter = 0
function nextId() {
  return `var-${Date.now()}-${++idCounter}`
}

const SYSTEM_INSTRUCTION = `You are a Senior Creative Strategist.

Your task is to generate high-conversion B-roll image prompts that visually support and amplify a scripted UGC video ad.

You must follow these rules exactly:

RULES FOR SCRIPT SEGMENTATION (CRITICAL):
- DO NOT create a scene for every single sentence.
- SMART GROUPING: Combine short, conversational, or filler phrases (e.g., "Be honest", "Listen", "And then") with the adjacent substantial sentence.
- Each "Scene" must correspond to a meaningful, visualizable segment of the script (approx 10-25 words).
- If a sentence is too abstract or short, merge it.

STRATEGY & VISUAL RULES (APPLY TO EVERY VARIATION):
- NARRATIVE: If the script mentions a result, show the result. If it mentions a feeling, show the interaction that creates that feeling.
- VISUAL DECOUPLING: Use the A-roll image for identity, but change environment/framing. B-roll must look like a professional multi-camera production.
- DIRECTIVE LANGUAGE: Commit to a single creative decision. NO "or", NO options within a single prompt.
- STATIC FRAME LOGIC: Describe a single frozen "peak action" moment. No motion/transitions.
- DO NOT describe lighting. It messes up the UGC style.
- DO NOT describe the model's appearance or product details. Mention the product and the model/subject. Just use the product image.
- ONLY describe the action they're doing.
- Describe the scene simply, like 'in a minimalist kitchen' or 'in a modern office'.

STRICT TECHNICAL STYLE STRING (MUST BE APPENDED TO EVERY PROMPT):
"Style: Modern iPhone camera quality, 9:16 aspect ratio, unedited realism, matching A-roll lighting, zero bokeh, zero depth of field, sharp focus across entire frame. The subject and product must match the attached references exactly."

RULES FOR VISUAL VARIATIONS:
For each scene, provide 3 different creative angles:
1. VARIATION 1 (Literal/Action): Directly visualize the action described.
2. VARIATION 2 (Emotional/Reaction): Focus on the human element, face, or feeling.
3. VARIATION 3 (Product/Detail): Focus on the product texture, result, or a specific detail.

OUTPUT FORMAT (STRICT XML-STYLE):
You must output every scene wrapped in these exact tags:

<SCENE>
<LINE>Insert the exact grouped script segment here</LINE>
<VAR_1>[Full Description + Style String]</VAR_1>
<VAR_2>[Full Description + Style String]</VAR_2>
<VAR_3>[Full Description + Style String]</VAR_3>
<SOURCE>Attach A-roll Character Image OR Attach Product Image</SOURCE>
</SCENE>

Do not include any text outside these tags.`

export async function generateBroll(input: BrollInput): Promise<BrollResult> {
  const { apiKey, endpoint } = getChatEndpoint()

  let prompt = `Break down this script into visual scenes for B-Roll production. For each scene, provide 3 creative prompt variations.\n\nScript:\n${input.scriptText}`

  if (input.productContext) {
    prompt += `\n\n${input.productContext}`
  }
  if (input.modelContext) {
    prompt += `\n\n${input.modelContext}\nIMPORTANT: When generating image prompts for scenes featuring a person/character, do NOT describe this specific model's physical appearance in detail. Just refer to them generally as the "subject", because a precise visual reference image will be provided directly to the image generator to capture their exact look.`
  }
  if (input.additionalContext) {
    prompt += `\n\nAdditional context:\n${input.additionalContext}`
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: SYSTEM_INSTRUCTION }] },
    { role: 'user', content: [{ type: 'text', text: prompt }] },
  ]
  const responseText = await kieChatCompletions(apiKey, endpoint, messages)

  const scenes: Scene[] = []
  const sceneRegex = /<SCENE>([\s\S]*?)<\/SCENE>/g
  const lineRegex = /<LINE>([\s\S]*?)<\/LINE>/
  const var1Regex = /<VAR_1>([\s\S]*?)<\/VAR_1>/
  const var2Regex = /<VAR_2>([\s\S]*?)<\/VAR_2>/
  const var3Regex = /<VAR_3>([\s\S]*?)<\/VAR_3>/
  const sourceRegex = /<SOURCE>([\s\S]*?)<\/SOURCE>/

  let match
  let number = 1
  while ((match = sceneRegex.exec(responseText)) !== null) {
    const block = match[1]
    const scriptLine = block.match(lineRegex)?.[1]?.trim() || ''
    const var1 = block.match(var1Regex)?.[1]?.trim() || ''
    const var2 = block.match(var2Regex)?.[1]?.trim() || ''
    const var3 = block.match(var3Regex)?.[1]?.trim() || ''
    const source = block.match(sourceRegex)?.[1]?.trim() || ''

    let type: Scene['type'] = 'B-ROLL LIFESTYLE'
    const sLow = source.toLowerCase()
    if (sLow.includes('character') || sLow.includes('model') || sLow.includes('subject')) type = 'A-ROLL CHARACTER'
    else if (sLow.includes('product')) type = 'A-ROLL PRODUCT'

    scenes.push({
      number: number++,
      type,
      scriptLine,
      variations: [
        { id: nextId(), label: 'Option 1', tag: 'LITERAL / ACTION', prompt: var1 },
        { id: nextId(), label: 'Option 2', tag: 'EMOTIONAL / REACTION', prompt: var2 },
        { id: nextId(), label: 'Option 3', tag: 'PRODUCT / DETAIL', prompt: var3 },
      ],
    })
  }

  return { scenes }
}

/**
 * Generate an image from a B-Roll prompt via kie.ai.
 * If reference images are provided, uses image-to-image (uploads each ref
 * to kie's hosted storage to get a public URL). Otherwise text-to-image.
 */
export async function generateImage(
  prompt: string,
  referenceImages?: ReferenceImage[],
  aspectRatio: string = '9:16',
): Promise<string> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const hasRefs = !!referenceImages?.length

  const mode = hasRefs ? 'image-to-image' : 'text-to-image'
  const modelId = useSettingsStore.getState().getAppModel(`broll-studio:image:${mode}`)
    ?? getDefaultModel('broll-studio', 'image', mode)?.id
  if (!modelId) throw new Error(`No image model configured for B-Roll (${mode}).`)

  // Convert each reference (asset ref or data URL) to a kie-hosted URL.
  const inputUrls: string[] = []
  if (hasRefs) {
    for (const ref of referenceImages!) {
      let dataUri = ref.dataUrl
      if (isAssetRef(ref.dataUrl)) {
        const asset = await getAsBase64(ref.dataUrl)
        if (!asset) continue
        dataUri = `data:${asset.mimeType};base64,${asset.base64}`
      }
      const hosted = await ensureHostedUrl(apiKey, dataUri)
      inputUrls.push(hosted)
    }
  }

  const urls = await kieImageGenerate(apiKey, modelId, {
    prompt,
    aspect_ratio: aspectRatio as '16:9' | '9:16',
    resolution: '1K',
    ...(inputUrls.length > 0 ? { input_urls: inputUrls } : {}),
  })

  if (urls.length === 0) throw new Error('Image generation returned no result.')

  const { base64, mimeType } = await downloadAsBase64(urls[0])
  return saveBase64Asset(base64, mimeType)
}

/**
 * Animate a still frame into video via kie.ai Seedance 2.0 (image-to-video).
 * The still image is used as first_frame_url; Seedance generates the rest.
 * Returns a persistent asset ID.
 */
export async function animateFrame(imageUrl: string, prompt: string, aspectRatio: string = '9:16'): Promise<string> {
  const apiKey = useSettingsStore.getState().getKieApiKey()

  const modelId = useSettingsStore.getState().getAppModel('broll-studio:video:image-to-video')
    ?? getDefaultModel('broll-studio', 'video', 'image-to-video')?.id
  if (!modelId) throw new Error('No video model configured for B-Roll.')

  // Resolve the source image to a publicly hosted URL.
  let dataUri = imageUrl
  if (isAssetRef(imageUrl)) {
    const asset = await getAsBase64(imageUrl)
    if (!asset) throw new Error('Asset not found')
    dataUri = `data:${asset.mimeType};base64,${asset.base64}`
  }
  const firstFrameUrl = await ensureHostedUrl(apiKey, dataUri)

  const urls = await kieVideoGenerate(apiKey, modelId, {
    prompt,
    first_frame_url: firstFrameUrl,
    aspect_ratio: aspectRatio,
    duration: 5,
    resolution: '720p',
  })

  if (urls.length === 0) throw new Error('Video generation returned no result.')

  const videoRes = await fetch(urls[0])
  if (!videoRes.ok) throw new Error(`Failed to download generated video (${videoRes.status}).`)
  const videoBlob = await videoRes.blob()
  return saveAsset(videoBlob)
}

/**
 * Generate a new prompt variation for a scene using Gemini 3 Flash.
 */
export async function generateNewVariation(
  sceneNumber: number,
  sceneType: string,
  scriptLine: string,
): Promise<PromptVariation> {
  const { apiKey, endpoint } = getChatEndpoint()

  const prompt = `Generate a single new creative image generation prompt for this B-Roll scene:

Scene ${sceneNumber}: ${sceneType}
Script line: "${scriptLine}"

Provide a fresh creative angle.
RULES:
1. DO NOT describe lighting. It messes up the UGC style.
2. DO NOT describe the model's appearance or product details. Mention the product and the model/subject.
3. ONLY describe the action they're doing. Describe the scene simply, e.g., 'in a minimalist kitchen'.
4. Append this exactly to the end of the prompt: "Style: Modern iPhone camera quality, 9:16 aspect ratio, unedited realism, matching A-roll lighting, zero bokeh, zero depth of field, sharp focus across entire frame. The subject and product must match the attached references exactly."

Respond with ONLY valid JSON (no markdown):
{
  "label": "Option N",
  "tag": "LITERAL / ACTION" | "EMOTIONAL / REACTION" | "PRODUCT / DETAIL",
  "prompt": "<the detailed prompt>"
}`

  const messages: ChatMessage[] = [
    { role: 'user', content: [{ type: 'text', text: prompt }] },
  ]
  const responseText = await kieChatCompletions(apiKey, endpoint, messages)
  const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(cleaned) as { label: string; tag: PromptVariation['tag']; prompt: string }

  return {
    id: nextId(),
    label: parsed.label,
    tag: parsed.tag,
    prompt: parsed.prompt,
  }
}
