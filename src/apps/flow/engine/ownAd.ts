// The member's own ad, dropped into a flow in place of one from the Swipe
// File: how an ad block (a Bank block on the Swipe File) reads it off its
// settings, and the value it hands the Ad Analyzer. Pure, like the rest of the
// engine; reading the file and storing it is components/yourAd.ts.

import type { AdUpload, FlowBlock } from '../types'
import type { HeldValue } from './plan'

// The ad dropped into an ad block. Anything else, or a malformed one, is none.
export function adUploadOf(block: Pick<FlowBlock, 'kind' | 'settings'>): AdUpload | null {
  if (block.kind !== 'bank' || block.settings.bank !== 'swipes') return null
  const u = block.settings.upload as Partial<AdUpload> | undefined
  if (!u || typeof u.ref !== 'string' || !u.ref) return null
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  return {
    ref: u.ref,
    name: typeof u.name === 'string' && u.name ? u.name : 'Your Ad',
    seconds: n(u.seconds),
    size: n(u.size),
    thumb: typeof u.thumb === 'string' && u.thumb ? u.thumb : undefined,
  }
}

// The member's own ad, as the value a saved one would be. It is no bank row,
// so it has no lineage; its key is the file, so dropping in another ad is what
// makes the Ad Analyzer run again, and the same one never pays twice.
export function uploadedAdValue(u: AdUpload): HeldValue {
  return {
    type: 'ad',
    key: `upload:${u.ref}`,
    label: u.name.replace(/\.[^.]+$/, '') || 'Your Ad',
    payload: { uploadRef: u.ref, fileName: u.name, durationSeconds: u.seconds, thumbUrl: u.thumb, mediaKind: 'video' },
  }
}
