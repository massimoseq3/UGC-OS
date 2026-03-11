import type { VisualDNA } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { geminiAnalyzeImage, fileToBase64 } from '../../../utils/gemini'

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
  const apiKey = useSettingsStore.getState().getApiKey()
  const { base64, mimeType } = await fileToBase64(imageFile)

  const prompt = `Extract the complete visual DNA from this image. Analyze every aspect: the person's physical appearance, clothing style, pose, location, and camera settings. Return as JSON.`

  const responseText = await geminiAnalyzeImage(apiKey, prompt, base64, mimeType, SYSTEM_INSTRUCTION)

  const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const result: VisualDNA = JSON.parse(cleaned)
  return result
}
