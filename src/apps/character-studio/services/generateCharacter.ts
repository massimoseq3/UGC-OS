import type { CharacterProfile } from '../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { createTask, pollTask, parseResult, downloadAsBase64, IMAGE_POLL_ATTEMPTS } from '../../../utils/kie'
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

const SKIP_VALUES = new Set(['None', 'No makeup', 'Indoor (N/A)'])
const has = (v: string | undefined): v is string => !!v && !SKIP_VALUES.has(v)

// Identity + physical + wardrobe sections — who the person *is*, independent
// of any scene. Shared by the portrait prompt and the character-sheet prompt
// (a sheet describes the same person but ignores scene/pose/camera fields).
function buildIdentitySections(profile: CharacterProfile): string[] {
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

  return sections
}

// Builds a structured, labeled prompt grouped by category. Values are
// preserved verbatim — never paraphrased — so chip presets and free-text
// entries land in the model unchanged. Labels + section headers help the
// image model parse the request without wading through comma soup.
export function buildImagePrompt(profile: CharacterProfile): string {
  const sections: string[] = buildIdentitySections(profile)

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

// Sheet layout directive — leads the prompt so the model commits to the
// panel composition before reading identity details. Scene/pose/camera form
// fields are deliberately ignored: a reference sheet lives on a neutral
// studio background, and its job is identity consistency, not a vibe.
const SHEET_LAYOUT_HORIZONTAL = `Character reference sheet: one single 16:9 image divided into clean panels on a flat, seamless light-gray studio background with even, shadowless softbox lighting. The exact same person appears in every panel — identical face, hair, skin, and wardrobe throughout.

Layout — left third of the frame: one tall panel with a full-body standing shot, head to toe, arms relaxed at the sides, facing forward. Right two-thirds: a grid of six panels in two rows. Top row: head-and-shoulders front view facing the camera directly; head-and-shoulders three-quarter view (45 degrees); head-and-shoulders true side profile. Bottom row, three expression close-ups: neutral and relaxed; warm genuine smile; mid-laugh.

No text, no labels, no logos, no watermarks. Panels separated only by the plain background.`

const SHEET_LAYOUT_VERTICAL = `Character reference sheet: one single 9:16 vertical image divided into clean panels on a flat, seamless light-gray studio background with even, shadowless softbox lighting. The exact same person appears in every panel — identical face, hair, skin, and wardrobe throughout.

Layout — top section: one wide panel with a full-body standing shot, head to toe, arms relaxed at the sides, facing forward. Middle section, a row of three head-and-shoulders panels: front view facing the camera directly; three-quarter view (45 degrees); true side profile. Bottom section, a row of three expression close-ups: neutral and relaxed; warm genuine smile; mid-laugh.

No text, no labels, no logos, no watermarks. Panels separated only by the plain background.`

// Character-sheet prompt: layout directive + identity/physical/wardrobe
// sections from the form. The photorealism style string still applies so the
// sheet matches the look of the portraits it will be used alongside. The
// layout swaps with orientation — horizontal turnaround strip vs stacked rows.
export function buildSheetPrompt(profile: CharacterProfile, aspect = '16:9'): string {
  const layout = aspect.includes('9:16') ? SHEET_LAYOUT_VERTICAL : SHEET_LAYOUT_HORIZONTAL
  const sections = [layout, ...buildIdentitySections(profile)]
  if (has(profile.cameraDevice)) sections.push(`Style: ${profile.cameraDevice}`)
  return sections.join('\n\n')
}

export type GenerationKind = 'portrait' | 'sheet'

// Phase 1: build the prompt, POST createTask, return the taskId so the caller
// can persist it before awaiting completion. A mid-flight refresh can resume
// polling by calling finishCharacterTask with the stored taskId.
export async function startCharacterTask(
  profile: CharacterProfile,
  modelIdOverride?: string,
  resolution?: ImageResolution,
  signal?: AbortSignal,
  kind: GenerationKind = 'portrait',
  sheetAspect = '16:9',
): Promise<{ taskId: string; modelId: string }> {
  const apiKey = useSettingsStore.getState().getKieApiKey()

  const modelId = modelIdOverride
    ?? useSettingsStore.getState().getAppModel('character-studio:image:text-to-image')
    ?? getDefaultModel('character-studio', 'image', 'text-to-image')?.id
  if (!modelId) throw new Error('No image model configured for Characters.')

  // Sheets render in their own orientation (16:9 turnaround or 9:16 stacked);
  // the prompt layout follows the same axis. Portraits tolerate both legacy
  // verbose values ('Landscape (16:9)') and raw ratios.
  const sheetIsVertical = sheetAspect.includes('9:16')
  const prompt = kind === 'sheet' ? buildSheetPrompt(profile, sheetAspect) : buildImagePrompt(profile)
  const ar = profile.aspectRatio ?? ''
  const aspectRatio: AspectRatio = kind === 'sheet' ? (sheetIsVertical ? '9:16' : '16:9')
    : ar.includes('16:9') ? '16:9' : ar.includes('1:1') ? '1:1' : '9:16'

  const body = buildImageInput(modelId, { prompt, aspectRatio, resolution })
  const taskId = await createTask(apiKey, modelId, body, signal)
  return { taskId, modelId }
}

// Phase 2: poll the taskId, download the result, save as an asset. Resumable
// across refreshes — call with the taskId returned by startCharacterTask
// (possibly persisted from a prior session).
export async function finishCharacterTask(
  taskId: string,
  modelId: string,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = useSettingsStore.getState().getKieApiKey()
  const record = await pollTask(apiKey, taskId, { signal, maxPollAttempts: IMAGE_POLL_ATTEMPTS })
  const urls = parseResult(record).resultUrls
  if (urls.length === 0) {
    throw new Error(
      `${modelId}: kie.ai returned no resultUrls. taskId=${taskId} record=${JSON.stringify(record).slice(0, 400)}`,
    )
  }
  const { base64, mimeType } = await downloadAsBase64(urls[0])
  return saveBase64Asset(base64, mimeType)
}

export async function generateCharacter(
  profile: CharacterProfile,
  signal?: AbortSignal,
  modelIdOverride?: string,
  resolution?: ImageResolution,
): Promise<GenerationResult> {
  const { taskId, modelId } = await startCharacterTask(profile, modelIdOverride, resolution, signal)
  const assetId = await finishCharacterTask(taskId, modelId, signal)
  return {
    imageUrl: assetId,
    jsonPrompt: buildJsonPrompt(profile),
  }
}
