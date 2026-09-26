import type { ImageHistoryItem, VideoHistoryItem, MusicHistoryItem } from '../../stores/types'

// The Playground history panel's shared row shape, and the per-project summary
// its project rail draws a card from.
//
// Its own module rather than a corner of `PlaygroundHistoryGrid`: a component
// file that also exports a plain function loses Fast Refresh for the whole file
// (the app-wide rule — `composePrompt.ts` exists for the same reason), and this
// is the grid that must not lose its state while the rail beside it is styled.

export type HistoryEntry =
  | { kind: 'image'; createdAt: number; data: ImageHistoryItem }
  | { kind: 'video'; createdAt: number; data: VideoHistoryItem }
  | { kind: 'music'; createdAt: number; data: MusicHistoryItem }

// One tile of a project card's cover mosaic — an asset ref plus what kind of
// media it is, because a still resolves through `useAssetThumb` and a clip
// through `useAssetPoster`. Same shape B-Roll's rail uses for the same job.
export interface CoverMedia { kind: 'image' | 'video'; ref: string }

// ── Project summaries ────────────────────────────────────────────────
//
// What a project card in the rail shows, built off the same unified list the
// grid renders. Module scope so the component stays compilable (see the
// `zipClips` note below — a function body the compiler can lower is the whole
// reason these live out here) and so the shape is testable on its own.

// How many pieces of media a project card previews. Three is B-Roll's number
// and its mosaic layout is built for it.
const MAX_COVERS = 3

export interface ProjectSummary {
  covers: CoverMedia[]
  images: number
  videos: number
  tracks: number
  // When this project was last generated into — what the card's meta line
  // dates. 0 when nothing has ever landed in it.
  latest: number
}

function emptySummary(): ProjectSummary {
  return { covers: [], images: 0, videos: 0, tracks: 0, latest: 0 }
}

// Stills lead the mosaic and clips fill what's left, the same order B-Roll's
// covers run in: a still is an <img> off a thumbnail, while a clip's face is a
// poster that may still be being made. A track contributes its Suno cover if it
// has one, last — it's artwork rather than a picture of the output.
function addCover(summary: ProjectSummary, clips: CoverMedia[], covers: CoverMedia[], entry: HistoryEntry) {
  if (entry.kind === 'image') {
    summary.images += 1
    if (covers.length < MAX_COVERS) covers.push({ kind: 'image', ref: entry.data.imageUrl })
  } else if (entry.kind === 'video') {
    summary.videos += 1
    if (clips.length < MAX_COVERS) clips.push({ kind: 'video', ref: entry.data.videoUrl })
  } else {
    summary.tracks += 1
    if (entry.data.coverImageRef && clips.length < MAX_COVERS) {
      clips.push({ kind: 'image', ref: entry.data.coverImageRef })
    }
  }
  if (entry.createdAt > summary.latest) summary.latest = entry.createdAt
}

// Keyed by project id, plus `all` for the All Projects card. `entries` is
// already newest-first, so every bucket's covers are its newest media.
export function summariseProjects(entries: HistoryEntry[]): {
  all: ProjectSummary
  byProject: Record<string, ProjectSummary>
} {
  const all = emptySummary()
  const allClips: CoverMedia[] = []
  const allCovers: CoverMedia[] = []
  const byProject: Record<string, ProjectSummary> = {}
  const clipsByProject: Record<string, CoverMedia[]> = {}
  const coversByProject: Record<string, CoverMedia[]> = {}

  for (const entry of entries) {
    addCover(all, allClips, allCovers, entry)
    const id = entry.data.projectId
    if (!id) continue
    byProject[id] ??= emptySummary()
    clipsByProject[id] ??= []
    coversByProject[id] ??= []
    addCover(byProject[id], clipsByProject[id], coversByProject[id], entry)
  }

  all.covers = [...allCovers, ...allClips].slice(0, MAX_COVERS)
  for (const id in byProject) {
    byProject[id].covers = [...coversByProject[id], ...clipsByProject[id]].slice(0, MAX_COVERS)
  }
  return { all, byProject }
}

