import type { CardState, GeneratedImage, GeneratedVideo, InFlightImage, InFlightVideo } from './types'

// What the storyboard SHOWS of each card, as a two-way lens over its
// persisted state. Two things narrow it:
//
//   * the strip's All / Prompts / Images / Videos filter, for every member —
//     Images keeps a card on its still while its clip renders, Videos shows
//     the clips, and a card with nothing of that kind sits on its prompt;
//   * Recording Mode's Hide All (operator only), which hides the media that
//     existed when it was armed until a replay brings a take back.
//
// Nothing persisted is touched — which is the whole difficulty, because a card
// writes back through the view:
// the modal's tile delete and its cover pick both send arrays and indexes that
// were computed from what is on screen. `putCard` maps those writes back onto
// the full arrays, so a delete in the view can never drop a hidden take, and a
// cover index means the same picture on both sides.
//
// Writes made through `onUpdateStateFn` read the PERSISTED card and need no
// mapping; that is how every generation lands.

export type CardFilter = 'all' | 'prompts' | 'images' | 'videos'

export interface CardLens {
  filter: CardFilter
  /** Media created at or before this moment is hidden. */
  since: number
  /** Recording Mode's reveal list — a hidden take listed here shows again. */
  revealed: Record<string, number>
  /** Synthetic in-flight entries per card: Recording Mode's fake runs and Loop. */
  replays: Record<string, ReplayEntry[]>
}

export type ReplayEntry =
  | { kind: 'image'; entry: InFlightImage }
  | { kind: 'video'; entry: InFlightVideo }

export const REPLAY_ID_PREFIX = 'replay-'

export function imageRevealKey(cardKey: string, image: GeneratedImage): string {
  return `broll:${cardKey}:image:${image.imageUrl}`
}

export function videoRevealKey(cardKey: string, video: GeneratedVideo): string {
  return `broll:${cardKey}:video:${video.url}`
}

// A replayed take is shown dated when it was replayed, so the gallery files it
// under "Today" like a fresh result. The copy on screen maps back to the
// persisted object here, which is what every write-back compares against.
const viewToReal = new WeakMap<object, object>()

function redated<T extends { createdAt: number }>(item: T, revealedAt: number | undefined, since: number): T {
  if (revealedAt === undefined || item.createdAt > since) return item
  const copy = { ...item, createdAt: revealedAt }
  viewToReal.set(copy, item)
  return copy
}

function toReal<T>(item: T): T {
  return (viewToReal.get(item as object) as T | undefined) ?? item
}

function imageShown(cardKey: string, image: GeneratedImage, lens: CardLens): boolean {
  return image.createdAt > lens.since || lens.revealed[imageRevealKey(cardKey, image)] !== undefined
}

function videoShown(cardKey: string, video: GeneratedVideo, lens: CardLens): boolean {
  return video.createdAt > lens.since || lens.revealed[videoRevealKey(cardKey, video)] !== undefined
}

// Keep the item a real index points at if it is on screen, else fall back to
// the newest one that is.
function viewIndex<T>(real: T[], view: T[], realIndex: number): number {
  const at = view.map(toReal).indexOf(real[realIndex])
  return at !== -1 ? at : Math.max(0, view.length - 1)
}

export function viewCard(cardKey: string, card: CardState, lens: CardLens): CardState {
  const images = (lens.filter === 'all' || lens.filter === 'images' ? card.images : [])
    .filter((img) => imageShown(cardKey, img, lens))
    .map((img) => redated(img, lens.revealed[imageRevealKey(cardKey, img)], lens.since))
  const videos = (lens.filter === 'all' || lens.filter === 'videos' ? card.videos : [])
    .filter((vid) => videoShown(cardKey, vid, lens))
    .map((vid) => redated(vid, lens.revealed[videoRevealKey(cardKey, vid)], lens.since))
  const replays = lens.replays[cardKey] ?? []
  const inFlightImages = [
    ...card.inFlightImages.filter((e) => e.startedAt > lens.since),
    ...replays.flatMap((r) => (r.kind === 'image' ? [r.entry] : [])),
  ]
  const inFlightVideos = [
    ...card.inFlightVideos.filter((e) => e.startedAt > lens.since),
    ...replays.flatMap((r) => (r.kind === 'video' ? [r.entry] : [])),
  ]
  const sel = card.selected
  const selectedItem = sel?.kind === 'image' ? card.images[sel.index] : sel?.kind === 'video' ? card.videos[sel.index] : undefined
  const selectedAt = sel?.kind === 'image'
    ? images.map(toReal).indexOf(selectedItem as GeneratedImage)
    : sel?.kind === 'video' ? videos.map(toReal).indexOf(selectedItem as GeneratedVideo) : -1
  return {
    ...card,
    images,
    videos,
    inFlightImages,
    inFlightVideos,
    currentImageIndex: viewIndex(card.images, images, card.currentImageIndex),
    currentVideoIndex: viewIndex(card.videos, videos, card.currentVideoIndex),
    // A cover that is hidden is no cover: the face falls back to what shows.
    selected: sel && selectedAt !== -1 ? { kind: sel.kind, index: selectedAt } : null,
    // An error from before the switch belongs to media the view isn't showing.
    imageError: card.images.length === images.length ? card.imageError : null,
  }
}

// Merge a view-side array back into the full one: hidden items stay where they
// were, removed visible items go, and anything new is appended.
function mergeBack<T>(real: T[], shownBefore: T[], nextView: T[]): T[] {
  const before = new Set(shownBefore.map(toReal))
  const next = nextView.map(toReal)
  const keep = new Set(next)
  const merged = real.filter((item) => !before.has(item) || keep.has(item))
  for (const item of next) if (!real.includes(item)) merged.push(item)
  return merged
}

function realIndex<T>(view: T[], realArr: T[], index: number): number {
  const at = realArr.indexOf(toReal(view[index]))
  return at !== -1 ? at : Math.max(0, realArr.length - 1)
}

export function putCard(cardKey: string, card: CardState, updates: Partial<CardState>, lens: CardLens): Partial<CardState> {
  const view = viewCard(cardKey, card, lens)
  const out: Partial<CardState> = { ...updates }
  const nextImagesView = updates.images ?? view.images
  const nextVideosView = updates.videos ?? view.videos
  const images = updates.images ? mergeBack(card.images, view.images, updates.images) : card.images
  const videos = updates.videos ? mergeBack(card.videos, view.videos, updates.videos) : card.videos
  if (updates.images) out.images = images
  if (updates.videos) out.videos = videos
  if (updates.inFlightImages) {
    const real = updates.inFlightImages.filter((e) => !e.id.startsWith(REPLAY_ID_PREFIX))
    out.inFlightImages = mergeBack(card.inFlightImages, view.inFlightImages, real)
  }
  if (updates.inFlightVideos) {
    const real = updates.inFlightVideos.filter((e) => !e.id.startsWith(REPLAY_ID_PREFIX))
    out.inFlightVideos = mergeBack(card.inFlightVideos, view.inFlightVideos, real)
  }
  if (updates.currentImageIndex !== undefined) out.currentImageIndex = realIndex(nextImagesView, images, updates.currentImageIndex)
  if (updates.currentVideoIndex !== undefined) out.currentVideoIndex = realIndex(nextVideosView, videos, updates.currentVideoIndex)
  const hiddenCover = card.selected && view.selected === null
    ? (card.selected.kind === 'image' ? card.images[card.selected.index] : card.videos[card.selected.index])
    : undefined
  // The modal's gallery picks a cover on its own when the view has none — a
  // write of `selected` and nothing else. With the real cover merely filtered
  // out (a video, under Images) that would replace a pick nobody changed, so
  // it is dropped. A member's own pick also moves the current index.
  if (hiddenCover && updates.selected && Object.keys(updates).length === 1) {
    delete out.selected
    return out
  }
  if (updates.selected !== undefined) {
    const s = updates.selected
    // The view reports no cover when the real one is hidden; writing that back
    // would clear a pick the member can't even see. Keep it, re-indexed.
    out.selected = s === null && hiddenCover && card.selected
      ? {
          kind: card.selected.kind,
          index: card.selected.kind === 'image'
            ? Math.max(0, images.indexOf(hiddenCover as GeneratedImage))
            : Math.max(0, videos.indexOf(hiddenCover as GeneratedVideo)),
        }
      : s === null ? null
      : s.kind === 'image' ? { kind: 'image', index: realIndex(nextImagesView, images, s.index) }
        : { kind: 'video', index: realIndex(nextVideosView, videos, s.index) }
  }
  return out
}

/**
 * The take a replay brings back: the card's hidden cover first, since that is
 * the one the finished ad used, then the newest hidden take.
 */
export function nextHiddenImage(cardKey: string, card: CardState, lens: CardLens): GeneratedImage | null {
  const hidden = card.images.filter((img) => !imageShown(cardKey, img, lens))
  if (hidden.length === 0) return null
  const cover = card.selected?.kind === 'image' ? card.images[card.selected.index] : undefined
  return cover && hidden.includes(cover) ? cover : hidden[hidden.length - 1]
}

export function nextHiddenVideo(cardKey: string, card: CardState, lens: CardLens, animate: boolean): GeneratedVideo | null {
  const hidden = card.videos.filter((vid) => !videoShown(cardKey, vid, lens))
  if (hidden.length === 0) return null
  const cover = card.selected?.kind === 'video' ? card.videos[card.selected.index] : undefined
  if (cover && hidden.includes(cover)) return cover
  const preferred = hidden.filter((v) => (v.mode === 'image-to-video') === animate)
  return (preferred.length > 0 ? preferred : hidden)[(preferred.length > 0 ? preferred : hidden).length - 1]
}
