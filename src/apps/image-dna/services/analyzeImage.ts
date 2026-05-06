import type { VisualDNA } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { kieChatCompletions, fileToDataUri, type ChatMessage } from '../../../utils/kie'
import { getChatEndpointPath } from '../../../utils/models'

const SYSTEM_INSTRUCTION = `You are a visual DNA extractor for UGC ad production. You analyze images of people and extract every visual detail that would be needed to recreate the exact same look in an AI image generation tool.

You must respond with ONLY valid JSON matching this exact structure (no markdown, no code fences):

{
  "model": {
    "gender": "<Male/Female/Non-binary>",
    "age": "<age range e.g. 22-26>",
    "ethnicity": "<ethnicity>",
    "bodyType": "<body type>",
    "skinTone": "<specific skin tone>",
    "skinTexture": "<detailed skin texture description>",
    "eyeColor": "<eye color>",
    "eyeShape": "<eye shape>",
    "hairColor": "<hair color>",
    "hairStyle": "<hair style>",
    "hairTexture": "<hair texture>",
    "facialFeatures": "<notable facial features>",
    "facialHair": "<facial hair or None>",
    "distinguishingMarks": "<marks or None>"
  },
  "style": {
    "clothingStyle": "<overall style>",
    "accessories": "<accessories>",
    "makeup": "<makeup level and style>"
  },
  "pose": {
    "pose": "<body position>",
    "action": "<what they're doing>",
    "expression": "<facial expression>"
  },
  "location": {
    "location": "<general location>",
    "background": "<detailed background description>",
    "lighting": "<lighting description>",
    "weather": "<weather or Indoor (N/A)>",
    "timeOfDay": "<time of day>"
  },
  "camera": {
    "shotType": "<shot type>",
    "cameraAngle": "<camera angle>",
    "cameraDevice": "<likely camera device>"
  }
}

Be extremely specific and detailed. Every field should have a value — use your best assessment from the image.`

export async function analyzeImage(imageFile: File): Promise<VisualDNA> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const endpoint = getChatEndpointPath()

  const dataUri = await fileToDataUri(imageFile)

  const prompt = `Extract the complete visual DNA from this image. Analyze every aspect: the person's physical appearance, clothing style, pose, location, and camera settings. Return as JSON.`

  const messages: ChatMessage[] = [
    { role: 'system', content: [{ type: 'text', text: SYSTEM_INSTRUCTION }] },
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUri } },
      ],
    },
  ]

  const responseText = await kieChatCompletions(apiKey, endpoint, messages)

  const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const result: VisualDNA = JSON.parse(cleaned)
  return result
}
