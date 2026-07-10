import type { PromptVariation, CardState } from './types'
import { refsToToggles } from './types'
import { type ImageResolution } from '../../utils/models'

// Card-state factory + legacy-shape migration. Lives in its own module (not
// inside ScenesView / RightPanel) so those component files only export
// components — keeps React Fast Refresh working when editing the B-Roll UI.

// Initial CardState for a freshly-mounted variation. Per-card settings
// default to 9:16 / 1K / 5s / 720p / audio-on — same defaults the old global
// SettingsPopover used as seed values.
export function createDefaultCardState(variation: PromptVariation): CardState {
  const { refsCharacter, refsProduct } = refsToToggles(variation.refs ?? 'both')
  const initialPrompt = variation.prompt ?? ''
  return {
    editablePrompt: initialPrompt,
    promptHistory: [initialPrompt],
    promptHistoryIndex: 0,
    images: [],
    currentImageIndex: 0,
    videos: [],
    currentVideoIndex: 0,
    selected: null,
    inFlightImages: [],
    inFlightVideos: [],
    isGeneratingImage: false,
    imageError: null,
    pendingTaskId: null,
    pendingModelId: null,
    pendingStartedAt: null,
    refsCharacter,
    refsProduct,
    cardImageAspectRatio: '9:16',
    cardImageResolution: '1K',
    cardVideoAspectRatio: '9:16',
    cardVideoDurationSeconds: 5,
    cardVideoResolution: '720p',
    cardVideoAudio: true,
    isPromptWorking: false,
    promptError: null,
    videoStatus: 'idle',
    videoUrl: null,
    videoError: null,
    videoTaskId: null,
    videoModelId: null,
    videoEndpoint: undefined,
    videoStartedAt: null,
    videoSourceBRollId: undefined,
    videoAspectRatio: null,
    videoDurationSeconds: null,
    videoResolution: null,
    videoAudio: null,
    videoMode: null,
    videoPrompt: null,
  }
}

// Backfill new fields on legacy persisted card entries so older B-Roll runs
// keep working after this rev. Defaults match what createDefaultCardState
// produces for a fresh variation. Exported so BrollStudio's sanitize hook
// shares the same logic when hoisting cardStates up.
export function backfillCardState(card: Partial<CardState> & Record<string, unknown>): CardState {
  const editablePrompt = (card.editablePrompt as string) ?? ''
  const promptHistory = Array.isArray(card.promptHistory) && (card.promptHistory as string[]).length > 0
    ? (card.promptHistory as string[])
    : [editablePrompt]
  const promptHistoryIndex = typeof card.promptHistoryIndex === 'number'
    ? Math.max(0, Math.min(card.promptHistoryIndex as number, promptHistory.length - 1))
    : promptHistory.length - 1

  // Migrate legacy single `videoUrl` → first entry in `videos[]`. Earlier
  // sessions persisted exactly one video per card; on hydrate we lift it
  // into the new array shape so the user doesn't lose anything.
  const persistedVideos = Array.isArray(card.videos) ? (card.videos as CardState['videos']) : []
  const legacyVideoUrl = card.videoUrl as string | null | undefined
  const videos: CardState['videos'] = persistedVideos.length > 0
    ? persistedVideos
    : legacyVideoUrl
      ? [{
          url: legacyVideoUrl,
          modelId: (card.videoModelId as string | null) ?? '',
          prompt: (card.videoPrompt as string | null) ?? editablePrompt,
          aspectRatio: (card.videoAspectRatio as string | null) ?? '9:16',
          durationSeconds: (card.videoDurationSeconds as number | null) ?? 5,
          resolution: (card.videoResolution as string | null) ?? '720p',
          audio: (card.videoAudio as boolean | null) ?? true,
          mode: (card.videoMode as CardState['videoMode']) ?? 'text-to-video',
          sourceBRollId: card.videoSourceBRollId as string | undefined,
          createdAt: (card.videoStartedAt as number | null) ?? Date.now(),
        }]
      : []
  const currentVideoIndex = typeof card.currentVideoIndex === 'number'
    ? Math.max(0, Math.min(card.currentVideoIndex as number, Math.max(0, videos.length - 1)))
    : Math.max(0, videos.length - 1)
  const selected = (card.selected as CardState['selected']) ?? null

  return {
    editablePrompt,
    promptHistory,
    promptHistoryIndex,
    images: ((card.images as CardState['images']) ?? []).map((img) => ({
      ...img,
      // Legacy images persisted before iteration 3 didn't carry createdAt.
      // Backfill with "now" so they all land in the modal's "Today" bucket.
      createdAt: img.createdAt ?? Date.now(),
    })),
    currentImageIndex: (card.currentImageIndex as number) ?? 0,
    // Migrate legacy single-slot pending image into the new in-flight
    // array. Same with the in-flight video slot. After this hop the
    // resume effect drives both as parallel queues.
    inFlightImages: legacyInFlightImages(card),
    inFlightVideos: legacyInFlightVideos(card),
    videos,
    currentVideoIndex,
    selected,
    isGeneratingImage: !!card.isGeneratingImage,
    imageError: (card.imageError as string | null) ?? null,
    pendingTaskId: (card.pendingTaskId as string | null) ?? null,
    pendingModelId: (card.pendingModelId as string | null) ?? null,
    pendingStartedAt: (card.pendingStartedAt as number | null) ?? null,
    refsCharacter: card.refsCharacter !== false,
    refsProduct: card.refsProduct !== false,
    cardImageAspectRatio: (card.cardImageAspectRatio as string) ?? '9:16',
    cardImageResolution: (card.cardImageResolution as ImageResolution) ?? '1K',
    cardVideoAspectRatio: (card.cardVideoAspectRatio as string) ?? '9:16',
    cardVideoDurationSeconds: (card.cardVideoDurationSeconds as number) ?? 5,
    cardVideoResolution: (card.cardVideoResolution as string) ?? '720p',
    cardVideoAudio: card.cardVideoAudio !== false,
    isPromptWorking: false,
    promptError: null,
    videoStatus: (card.videoStatus as CardState['videoStatus']) ?? 'idle',
    videoUrl: (card.videoUrl as string | null) ?? null,
    videoError: (card.videoError as string | null) ?? null,
    videoTaskId: (card.videoTaskId as string | null) ?? null,
    videoModelId: (card.videoModelId as string | null) ?? null,
    videoEndpoint: card.videoEndpoint as CardState['videoEndpoint'],
    videoStartedAt: (card.videoStartedAt as number | null) ?? null,
    videoSourceBRollId: card.videoSourceBRollId as string | undefined,
    videoAspectRatio: (card.videoAspectRatio as string | null) ?? null,
    videoDurationSeconds: (card.videoDurationSeconds as number | null) ?? null,
    videoResolution: (card.videoResolution as string | null) ?? null,
    videoAudio: (card.videoAudio as boolean | null) ?? null,
    videoMode: (card.videoMode as CardState['videoMode']) ?? null,
    videoPrompt: (card.videoPrompt as string | null) ?? null,
  }
}

// Migrate the legacy single-slot pending-image fields onto the new
// inFlightImages array, preserving any persisted entries already in the
// new shape. Drops stale entries (>30 min) so refreshing doesn't try to
// resume a long-dead kie task.
function legacyInFlightImages(card: Partial<CardState> & Record<string, unknown>): CardState['inFlightImages'] {
  const STALE_MS = 30 * 60_000
  const persisted = Array.isArray(card.inFlightImages) ? (card.inFlightImages as CardState['inFlightImages']) : []
  const filtered = persisted.filter((e) => Date.now() - (e.startedAt ?? 0) < STALE_MS)
  if (filtered.length > 0) return filtered
  // Promote legacy single-slot pending into the array if it's fresh.
  const taskId = card.pendingTaskId as string | null | undefined
  const modelId = card.pendingModelId as string | null | undefined
  const startedAt = card.pendingStartedAt as number | null | undefined
  if (taskId && modelId && startedAt && Date.now() - startedAt < STALE_MS) {
    return [{
      id: 'legacy-image',
      taskId,
      modelId,
      startedAt,
      prompt: (card.editablePrompt as string) ?? '',
      aspectRatio: (card.cardImageAspectRatio as string) ?? '9:16',
      resolution: (card.cardImageResolution as string) ?? '1K',
    }]
  }
  return []
}

function legacyInFlightVideos(card: Partial<CardState> & Record<string, unknown>): CardState['inFlightVideos'] {
  // 60 min (vs images' 30): a video whose poll budget (~20 min) ran out is kept
  // in-flight so a refresh resumes it, and slow models (Seedance 2 / Veo
  // Quality) can render well past 30 min. Matches Playground's STALE_TASK_MS.
  const STALE_MS = 60 * 60_000
  const persisted = Array.isArray(card.inFlightVideos) ? (card.inFlightVideos as CardState['inFlightVideos']) : []
  const filtered = persisted.filter((e) => Date.now() - (e.startedAt ?? 0) < STALE_MS)
  if (filtered.length > 0) return filtered
  const taskId = card.videoTaskId as string | null | undefined
  const modelId = card.videoModelId as string | null | undefined
  const startedAt = card.videoStartedAt as number | null | undefined
  if (taskId && modelId && startedAt && Date.now() - startedAt < STALE_MS) {
    return [{
      id: 'legacy-video',
      taskId,
      modelId,
      endpoint: card.videoEndpoint as 'veo' | undefined,
      startedAt,
      prompt: (card.videoPrompt as string) ?? (card.editablePrompt as string) ?? '',
      mode: (card.videoMode as CardState['videoMode']) ?? 'text-to-video',
      aspectRatio: (card.videoAspectRatio as string) ?? '9:16',
      durationSeconds: (card.videoDurationSeconds as number) ?? 5,
      resolution: (card.videoResolution as string) ?? '720p',
      audio: (card.videoAudio as boolean) ?? true,
      sourceBRollId: card.videoSourceBRollId as string | undefined,
    }]
  }
  return []
}
