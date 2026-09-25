// What the Ad Analyzer takes as an ad, in one place: its own drop zone and
// Flow's (an ad dropped on an Ad Analyzer block) read the same rules, so a
// file one refuses the other never accepts.

import { VIDEO_UPLOAD_BUDGET_BYTES } from './analyzeAd'

export const AD_ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
export const AD_ACCEPT_ATTR = AD_ACCEPTED_TYPES.join(',')
export const AD_MAX_SIZE_MB = 50

// Why a file can't be analyzed, or null when it can.
export function adFileProblem(file: File): string | null {
  if (!AD_ACCEPTED_TYPES.includes(file.type)) return 'Unsupported format'
  if (file.size > AD_MAX_SIZE_MB * 1024 * 1024) return `Larger than ${AD_MAX_SIZE_MB}MB`
  return null
}

// The clip is uploaded to kie's file host, and anything over the upload budget
// is re-encoded first (see services/analysisQueue.ts). Said wherever an ad is
// staged as well as on the analyzing screen: the pass runs in realtime, and a
// member who was told to expect "a couple of minutes" should know before they
// commit which of their clips is buying an extra one.
export function adNeedsCompressing(file: Pick<File, 'type' | 'size'>): boolean {
  return file.type.startsWith('video/') && file.size > VIDEO_UPLOAD_BUDGET_BYTES
}

export const COMPRESS_FIRST_HINT = `This ad is over the ${Math.round(VIDEO_UPLOAD_BUDGET_BYTES / (1024 * 1024))}MB the analyzer can upload, so it gets compressed first, which takes about as long as the ad runs.`
