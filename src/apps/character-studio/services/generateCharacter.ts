import type { CharacterProfile } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { kieImageGenerate, downloadAsBase64 } from '../../../utils/kie'
import { getDefaultModel, buildImageInput, type AspectRatio, type ImageResolution } from '../../../utils/models'
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

// Builds a structured, labeled prompt grouped by category. Values are
// preserved verbatim — never paraphrased — so chip presets and free-text
// entries land in the model unchanged. Labels + section headers help the
// image model parse the request without wading through comma soup.
export function buildImagePrompt(profile: CharacterProfile): string {
  const SKIP_VALUES = new Set(['None', 'No makeup', 'Indoor (N/A)'])
  const has = (v: string | undefined): v is string => !!v && !SKIP_VALUES.has(v)

  const sections: string[] = []

  // Identity sentence — flows as natural prose since these read as one phrase.
  const identityBits = [
    profile.gender,
    has(profile.age) && `aged ${profile.age}`,
    profile.ethnicity,
    has(profile.bodyType) && `with a ${profile.bodyType} build`,
  ].filter(Boolean) as string[]
  if (identityBits.length) {
    sections.push(`Subject: ${identityBits.join(', ')}.`)
  }

  // Physical attributes — one labeled line per facet so the model can parse
  // each independently. Skips any unset field instead of stringing empties.
  const physicalLines: string[] = []
  if (has(profile.skinTone)) physicalLines.push(`Skin tone: ${profile.skinTone}.`)
  if (has(profile.skinTexture)) physicalLines.push(`Skin texture: ${profile.skinTexture}.`)
  const eyeBits = [
    has(profile.eyeColor) && profile.eyeColor,
    has(profile.eyeShape) && `${profile.eyeShape} shape`,
  ].filter(Boolean) as string[]
  if (eyeBits.length) physicalLines.push(`Eyes: ${eyeBits.join(', ')}.`)
  const hairBits = [
    has(profile.hairColor) && profile.hairColor,
    has(profile.hairStyle) && profile.hairStyle,
    has(profile.hairTexture) && `${profile.hairTexture} texture`,
  ].filter(Boolean) as string[]
  if (hairBits.length) physicalLines.push(`Hair: ${hairBits.join(', ')}.`)
  if (has(profile.facialFeatures)) physicalLines.push(`Facial features: ${profile.facialFeatures}.`)
  if (has(profile.facialHair)) physicalLines.push(`Facial hair: ${profile.facialHair}.`)
  if (has(profile.distinguishingMarks)) physicalLines.push(`Distinguishing marks: ${profile.distinguishingMarks}.`)
  if (physicalLines.length) sections.push(physicalLines.join(' '))

  // Wardrobe & styling — one labeled line per facet.
  const wardrobeLines: string[] = []
  if (has(profile.clothingStyle)) wardrobeLines.push(`Wardrobe: ${profile.clothingStyle}.`)
  if (has(profile.accessories)) wardrobeLines.push(`Accessories: ${profile.accessories}.`)
  if (has(profile.makeup)) wardrobeLines.push(`Makeup: ${profile.makeup}.`)
  if (wardrobeLines.length) sections.push(wardrobeLines.join(' '))

  // Scene / environment.
  const sceneLines: string[] = []
  if (has(profile.location)) sceneLines.push(`Location: ${profile.location}.`)
  if (has(profile.background)) sceneLines.push(`Background: ${profile.background}.`)
  if (has(profile.lighting)) sceneLines.push(`Lighting: ${profile.lighting}.`)
  if (has(profile.weather)) sceneLines.push(`Weather: ${profile.weather}.`)
  if (has(profile.timeOfDay)) sceneLines.push(`Time of day: ${profile.timeOfDay}.`)
  if (sceneLines.length) sections.push(sceneLines.join(' '))

  // Pose & action.
  const poseLines: string[] = []
  if (has(profile.pose)) poseLines.push(`Pose: ${profile.pose}.`)
  if (has(profile.action)) poseLines.push(`Action: ${profile.action}.`)
  if (has(profile.expression)) poseLines.push(`Expression: ${profile.expression}.`)
  if (poseLines.length) sections.push(poseLines.join(' '))

  // Camera / shot style. cameraDevice carries the photorealism style string
  // verbatim — we keep it on its own line so it reads as the final directive.
  const cameraBits = [
    has(profile.shotType) && profile.shotType,
    has(profile.cameraAngle) && `${profile.cameraAngle} angle`,
  ].filter(Boolean) as string[]
  if (cameraBits.length) sections.push(`Shot: ${cameraBits.join(', ')}.`)
  if (has(profile.cameraDevice)) sections.push(`Style: ${profile.cameraDevice}`)

  return sections.join('\n\n')
}

export async function generateCharacter(
  profile: CharacterProfile,
  signal?: AbortSignal,
  modelIdOverride?: string,
  resolution?: ImageResolution,
): Promise<GenerationResult> {
  const apiKey = useSettingsStore.getState().getKieApiKey()

  const modelId = modelIdOverride
    ?? useSettingsStore.getState().getAppModel('character-studio:image:text-to-image')
    ?? getDefaultModel('character-studio', 'image', 'text-to-image')?.id
  if (!modelId) throw new Error('No image model configured for Characters.')

  const prompt = buildImagePrompt(profile)
  const aspectRatio: AspectRatio = profile.aspectRatio === 'Landscape (16:9)' ? '16:9' : '9:16'

  const body = buildImageInput(modelId, { prompt, aspectRatio, resolution })
  const urls = await kieImageGenerate(apiKey, modelId, body, { signal })

  if (urls.length === 0) throw new Error('Image generation returned no result.')

  const { base64, mimeType } = await downloadAsBase64(urls[0])
  const assetId = await saveBase64Asset(base64, mimeType)

  return {
    imageUrl: assetId,
    jsonPrompt: buildJsonPrompt(profile),
  }
}
