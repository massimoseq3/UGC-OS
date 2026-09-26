// What the Ad Analyzer takes as an ad, in one place: its own drop zone and
// Flow's (an ad dropped on an Ad Analyzer block) read the same rules, so a
// file one refuses the other never accepts.

import { VIDEO_UPLOAD_BUDGET_BYTES } from './analyzeAd'

// Video only, and it always has been — the drop zone has never taken an image
// (git history back to the first commit). The analyzer's prompt and parts of
// the results view still speak of "video/image" and `mediaKind: 'image'`, but
// no image has ever run end to end: the price is estimated from a runtime and
// the scene contract chunks by seconds, so taking one is a feature to build and
// test, not a type to add to this list.
export const AD_ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
export const AD_ACCEPT_ATTR = AD_ACCEPTED_TYPES.join(',')
export const AD_MAX_SIZE_MB = 50

// The accepted formats as a member reads them.
export const AD_FORMATS_LABEL = 'MP4, MOV or WebM'

// Why a file can't be analyzed, or null when it can. A SHORT reason, and its
// exact strings are a contract: Flow's `readAd` compares against
// 'Unsupported format' to pick its own sentence. For copy a member reads
// beside the file's name, use `adFileRejection`.
export function adFileProblem(file: File): string | null {
  if (!AD_ACCEPTED_TYPES.includes(file.type)) return 'Unsupported format'
  if (file.size > AD_MAX_SIZE_MB * 1024 * 1024) return `Larger than ${AD_MAX_SIZE_MB}MB`
  return null
}

// The same verdict as a complete sentence naming the fix. "Unsupported format"
// alone read as a bug to a member who dropped a still ad, when the answer is
// that the analyzer reads video ads only.
export function adFileRejection(file: File): string | null {
  const problem = adFileProblem(file)
  if (!problem) return null
  if (problem === 'Unsupported format') {
    return file.type.startsWith('image/')
      ? `The Ad Analyzer reads video ads only, not images. Use an ${AD_FORMATS_LABEL} file.`
      : `The Ad Analyzer reads video ads only. Use an ${AD_FORMATS_LABEL} file.`
  }
  return `It’s over ${AD_MAX_SIZE_MB}MB. Export it smaller and add it again.`
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
