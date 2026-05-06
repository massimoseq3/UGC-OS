import type { CharacterProfile } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { kieImageGenerate, downloadAsBase64 } from '../../../utils/kie'
import { getDefaultModel, buildImageInput, type AspectRatio } from '../../../utils/models'
import { saveBase64Asset } from '../../../utils/assetStore'

export interface GenerationResult {
  imageUrl: string
  jsonPrompt: Record<string, Record<string, string>>
}

/**
 * Groups a flat profile into tab-based JSON sections for display.
 */
export function buildJsonPrompt(profile: CharacterProfile): Record<string, Record<string, string>> {
  const physical: Record<string, string> = {}
  const style: Record<string, string> = {}
  const scene: Record<string, string> = {}
  const pose: Record<string, string> = {}
  const camera: Record<string, string> = {}

  const mapping: Record<string, Record<string, string>> = {
    gender: physical, age: physical, ethnicity: physical, bodyType: physical,
    skinTone: physical, skinTexture: physical, eyeColor: physical, eyeShape: physical,
    hairColor: physical, hairStyle: physical, hairTexture: physical,
    facialFeatures: physical, facialHair: physical, distinguishingMarks: physical,
    clothingStyle: style, accessories: style, makeup: style,
    location: scene, background: scene, lighting: scene, weather: scene, timeOfDay: scene,
    pose: pose, action: pose, expression: pose,
    shotType: camera, cameraAngle: camera, cameraDevice: camera,
  }

  for (const [key, value] of Object.entries(profile)) {
    if (value && mapping[key]) {
      mapping[key][key] = value
    }
  }

  const result: Record<string, Record<string, string>> = {}
  if (Object.keys(physical).length) result['Physical'] = physical
  if (Object.keys(style).length) result['Style'] = style
  if (Object.keys(scene).length) result['Scene'] = scene
  if (Object.keys(pose).length) result['Pose & Action'] = pose
  if (Object.keys(camera).length) result['Camera'] = camera
  return result
}

/**
 * Builds a natural language image generation prompt from the character profile.
 */
function buildImagePrompt(profile: CharacterProfile): string {
  const parts: string[] = []

  // Physical description
  const physicalParts = [
    profile.gender,
    profile.age && `aged ${profile.age}`,
    profile.ethnicity,
    profile.bodyType && `${profile.bodyType} build`,
    profile.skinTone && `${profile.skinTone} skin tone`,
    profile.skinTexture,
    profile.eyeColor && `${profile.eyeColor} eyes`,
    profile.eyeShape && `${profile.eyeShape} eye shape`,
    profile.hairColor && `${profile.hairColor} hair`,
    profile.hairStyle && `${profile.hairStyle}`,
    profile.hairTexture && `${profile.hairTexture} texture`,
    profile.facialFeatures,
    profile.facialHair && profile.facialHair !== 'None' && profile.facialHair,
    profile.distinguishingMarks && profile.distinguishingMarks !== 'None' && profile.distinguishingMarks,
  ].filter(Boolean)
  if (physicalParts.length) parts.push(`A ${physicalParts.join(', ')}.`)

  // Style
  const styleParts = [
    profile.clothingStyle && `Wearing ${profile.clothingStyle} style`,
    profile.accessories && profile.accessories !== 'None' && `with ${profile.accessories}`,
    profile.makeup && profile.makeup !== 'No makeup' && `${profile.makeup} makeup`,
  ].filter(Boolean)
  if (styleParts.length) parts.push(styleParts.join(', ') + '.')

  // Pose & action
  const poseParts = [
    profile.pose,
    profile.action,
    profile.expression && `${profile.expression} expression`,
  ].filter(Boolean)
  if (poseParts.length) parts.push(poseParts.join(', ') + '.')

  // Scene
  const sceneParts = [
    profile.location,
    profile.background,
    profile.lighting,
    profile.weather && profile.weather !== 'Indoor (N/A)' && profile.weather,
    profile.timeOfDay,
  ].filter(Boolean)
  if (sceneParts.length) parts.push(sceneParts.join(', ') + '.')

  // Camera
  const cameraParts = [
    profile.shotType,
    profile.cameraAngle && `${profile.cameraAngle} angle`,
    profile.cameraDevice && `shot on ${profile.cameraDevice}`,
  ].filter(Boolean)
  if (cameraParts.length) parts.push(cameraParts.join(', ') + '.')

  return parts.join(' ')
}

export async function generateCharacter(
  profile: CharacterProfile,
  signal?: AbortSignal,
  modelIdOverride?: string,
): Promise<GenerationResult> {
  const apiKey = useSettingsStore.getState().getKieApiKey()

  const modelId = modelIdOverride
    ?? useSettingsStore.getState().getAppModel('character-studio:image:text-to-image')
    ?? getDefaultModel('character-studio', 'image', 'text-to-image')?.id
  if (!modelId) throw new Error('No image model configured for Character Studio.')

  const prompt = buildImagePrompt(profile)
  const aspectRatio: AspectRatio = profile.aspectRatio === 'Landscape (16:9)' ? '16:9' : '9:16'

  const body = buildImageInput(modelId, { prompt, aspectRatio })
  const urls = await kieImageGenerate(apiKey, modelId, body, { signal })

  if (urls.length === 0) throw new Error('Image generation returned no result.')

  const { base64, mimeType } = await downloadAsBase64(urls[0])
  const assetId = await saveBase64Asset(base64, mimeType)

  return {
    imageUrl: assetId,
    jsonPrompt: buildJsonPrompt(profile),
  }
}
