// Reading a B-Roll session row (`brollHistory`) as Flow values: its clips in
// scene order, and its stills. A B-Roll block sourced From History hands these
// on, and a Generate block builds its own session row in the same shape so
// the finished run opens in B-Roll like any session made there.

import type { BrollHistoryItem } from '../../../stores/types'
import type { BrollResult, CardState } from '../../broll-studio/types'
import type { ClipRef } from '../types'

// A card's key in a session's `cardStates` — B-Roll's own scheme.
export function cardKey(sceneNumber: number, variationIndex: number): string {
  return `${sceneNumber}-${variationIndex}`
}

// The cover clip and still of every card, walking scenes in order. A card's
// cover is its selected output, else its latest — the same fallback the
// storyboard grid uses for a card's face.
// `inserts` are the stills no clip was made from — an Edit Pack drops them
// into the cut as pop-ups, where an animated still would only repeat its clip.
export function sessionMedia(row: Pick<BrollHistoryItem, 'result' | 'cardStates'>): { clips: ClipRef[]; stills: string[]; inserts: string[] } {
  const result = row.result as BrollResult | undefined
  const clips: ClipRef[] = []
  const stills: string[] = []
  const inserts: string[] = []
  if (!result?.scenes) return { clips, stills, inserts }
  for (const scene of result.scenes) {
    scene.variations.forEach((_, i) => {
      const card = row.cardStates?.[cardKey(scene.number, i)] as Partial<CardState> | undefined
      if (!card) return
      const images = card.images ?? []
      const videos = card.videos ?? []
      const selected = card.selected
      const video = selected?.kind === 'video' ? videos[selected.index] : videos[videos.length - 1]
      const image = selected?.kind === 'image' ? images[selected.index] : images[images.length - 1]
      if (video?.url) clips.push({ ref: video.url, durationSeconds: video.durationSeconds, prompt: video.prompt })
      if (image?.imageUrl) stills.push(image.imageUrl)
      if (image?.imageUrl && !video?.url) inserts.push(image.imageUrl)
    })
  }
  return { clips, stills, inserts }
}
