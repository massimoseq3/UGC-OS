// The member's own ad, dropped into a flow instead of picked from the Swipe
// File. It's read the Ad Analyzer's way — its formats, its 50MB cap — and kept
// in the asset store with its first frame and its length.
//
// The ad lives on the ad block that feeds an Ad Analyzer (a Bank block on the
// Swipe File, `settings.upload`): the one a template asks for as "The Winning
// Ad", so Run View's field for it takes an upload too, or a new one laid to
// the Analyzer's left, wired in. Never on the Analyzer itself, the way a
// picture added in a window lands as its own block: the canvas stays the one
// picture of what feeds what.

import { useRef, useState } from 'react'
import type { AdUpload, FlowBlock, FlowGraph } from '../types'
import { AD_MAX_SIZE_MB, adFileProblem } from '../../ad-anatomy/services/adUpload'
import { captureFirstFrame } from '../../ad-anatomy/utils/captureFirstFrame'
import { readMediaDuration } from '../../../utils/media'
import { saveAsset } from '../../../utils/assetStore'
import { FriendlyError, humanizeError } from '../../../utils/friendlyError'
import { blockById, wiresInto } from '../engine/graph'
import { blockWidth, titleOf } from '../engine/catalog'
import { freeSpot } from '../engine/layout'
import { useFlowStore } from '../store/flowStore'

export async function readAd(file: File): Promise<AdUpload> {
  const problem = adFileProblem(file)
  if (problem) {
    throw new FriendlyError(problem === 'Unsupported format'
      ? `${file.name} isn't a video the Ad Analyzer reads. Drop an MP4, MOV or WebM.`
      : `${file.name} is over ${AD_MAX_SIZE_MB}MB. Export it smaller, then drop it in again.`)
  }
  const ref = await saveAsset(file, file.type)
  const [thumb, seconds] = await Promise.all([
    // The face's picture; an ad whose first frame won't decode just shows none.
    captureFirstFrame(file).then((jpeg) => saveAsset(jpeg, 'image/jpeg')).catch(() => undefined),
    durationOf(file),
  ])
  return { ref, name: file.name, seconds, size: file.size, thumb }
}

async function durationOf(file: File): Promise<number | undefined> {
  const url = URL.createObjectURL(file)
  try {
    return await readMediaDuration(url, 'video')
  } catch {
    return undefined
  } finally {
    URL.revokeObjectURL(url)
  }
}

// A block that can hold the member's ad.
export function isAdHolder(block: Pick<FlowBlock, 'kind' | 'settings'>): boolean {
  return block.kind === 'bank' && block.settings.bank === 'swipes'
}

// Where an Ad Analyzer's ad comes from: nothing yet, an ad block a dropped ad
// goes into, or another block (an Outliers search) that decides it.
export type AdFeed = { kind: 'none' } | { kind: 'holder'; holder: FlowBlock } | { kind: 'other'; from: string }

export function adFeedOf(graph: FlowGraph, analyzer: FlowBlock): AdFeed {
  const wires = wiresInto(graph, analyzer.id, 'ad')
  if (!wires.length) return { kind: 'none' }
  const from = blockById(graph, wires[0].from)
  if (wires.length === 1 && from && isAdHolder(from)) return { kind: 'holder', holder: from }
  return { kind: 'other', from: from ? titleOf(from) : 'another block' }
}

// Why an Analyzer won't take the member's ad, or null when it will: one fed
// by a search reads what the search finds. Asked before a dropped file is
// stored, so a refusal leaves nothing behind.
export function adRefusal(graph: FlowGraph, analyzer: FlowBlock): string | null {
  const feed = adFeedOf(graph, analyzer)
  return feed.kind === 'other' ? `This Ad Analyzer reads the ads ${feed.from} finds. Unwire it to analyze your own.` : null
}

function openDoc() {
  const s = useFlowStore.getState()
  return s.openId ? s.docs[s.openId] : undefined
}

// The ad block now holds this ad in place of whatever it held — a saved pick
// included — as one undo step. Null takes the dropped ad out.
export function holdAd(holderId: string, upload: AdUpload | null): void {
  const b = openDoc()?.blocks.find((x) => x.id === holderId)
  if (!b) return
  const settings = { ...b.settings }
  if (upload) settings.upload = upload
  else delete settings.upload
  useFlowStore.getState().patchBlock(holderId, upload ? { pick: undefined, settings } : { settings })
}

// The ad block picks a saved ad instead of the one dropped in.
export function pickSavedAd(holderId: string, swipeId: string): void {
  const b = openDoc()?.blocks.find((x) => x.id === holderId)
  if (!b) return
  const settings = { ...b.settings }
  delete settings.upload
  useFlowStore.getState().patchBlock(holderId, { pick: swipeId, settings })
}

export type GiveResult = { ok: true; message: string } | { ok: false; reason: string }

// Hands the member's ad to an Ad Analyzer: into the ad block that feeds it,
// or a new one to its left, wired in (adRefusal says when neither).
export function giveAdTo(analyzerId: string, upload: AdUpload): GiveResult {
  const doc = openDoc()
  const analyzer = doc?.blocks.find((b) => b.id === analyzerId)
  if (!doc || !analyzer) return { ok: false, reason: 'That Ad Analyzer is gone.' }
  const refused = adRefusal(doc, analyzer)
  if (refused) return { ok: false, reason: refused }
  const feed = adFeedOf(doc, analyzer)
  if (feed.kind === 'holder') {
    holdAd(feed.holder.id, upload)
    return { ok: true, message: `Your ad is in ${feed.holder.label ?? 'the ad block'} now, ready to analyze.` }
  }
  const store = useFlowStore.getState()
  const at = freeSpot(doc, { x: analyzer.x - blockWidth('bank') - 96, y: analyzer.y }, 'bank')
  const id = store.addBlock('bank', at, { settings: { bank: 'swipes', upload } })
  store.connect({ from: id, fromPort: 'out', to: analyzerId, toPort: 'ad' })
  return { ok: true, message: 'Your ad is on the canvas, wired into the Ad Analyzer.' }
}

// Reading a dropped ad takes a moment (the file is stored whole, then its
// first frame is drawn): `busy` for the drop zone's face meanwhile, and why a
// file was turned away.
export function useAdReader(onRead: (upload: AdUpload) => void) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const take = (file: File | undefined) => {
    if (!file) return
    setProblem(null)
    setBusy(true)
    readAd(file).then(
      (upload) => {
        setBusy(false)
        onRead(upload)
      },
      (err: unknown) => {
        setBusy(false)
        setProblem(humanizeError(err, "That ad couldn't be read. Try another file."))
      },
    )
  }
  return { busy, problem, take }
}

// A surface a file can be dropped on: `active` while one is dragged over it
// (a counter, so crossing its children doesn't flicker). With `onFiles` it
// takes the drop itself, and nothing inside it may have an onDrop of its own
// — both would fire, and every file would land twice (the Ad Analyzer's
// UploadView learned that). Without, it only lights up, and the drop goes on
// to whatever handles it above: a block's tile, whose drop is the canvas's.
export function useFileDrag(onFiles: ((files: File[]) => void) | null, enabled = true) {
  const [active, setActive] = useState(false)
  const depth = useRef(0)
  const files = (e: React.DragEvent) => enabled && Array.from(e.dataTransfer.types).includes('Files')
  const handlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!files(e)) return
      e.preventDefault()
      depth.current += 1
      setActive(true)
    },
    onDragOver: (e: React.DragEvent) => {
      if (!files(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!files(e)) return
      depth.current -= 1
      if (depth.current <= 0) {
        depth.current = 0
        setActive(false)
      }
    },
    onDrop: (e: React.DragEvent) => {
      depth.current = 0
      setActive(false)
      if (!onFiles || !files(e)) return
      e.preventDefault()
      e.stopPropagation()
      const dropped = Array.from(e.dataTransfer.files ?? [])
      if (dropped.length) onFiles(dropped)
    },
  }
  return { active: enabled && active, handlers }
}
