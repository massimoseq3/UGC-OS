// Bundle several stored assets (clips, images) into a single .zip so a
// "Download all" action lands one folder instead of a scatter of individual
// files. Blobs come from the IndexedDB asset store (mirrored to R2), so this
// works offline once the assets are cached.

import { getBlob } from './assetStore'

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  // Voiceovers and music — Flow's Edit Pack zips both beside the clips.
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
}

function extFor(blob: Blob, fallback: string): string {
  const base = blob.type.split(';')[0].trim().toLowerCase()
  return EXT_BY_MIME[base] ?? fallback
}

export type ZipEntry =
  | {
      // Asset ref (`asset://…` or bare id) resolved through the asset store.
      ref: string
      // File name inside the zip, WITHOUT extension — the real extension is
      // picked from the blob's mime type. Kept unique by the caller (add an
      // index). A `/` in it makes a folder.
      name: string
      // The extension when the blob's type names none this file knows.
      fallbackExt?: string
    }
  | {
      // A text file written as it is — Flow's Edit Pack script. Its `name`
      // carries its own extension.
      text: string
      name: string
    }

// Zips every resolvable entry and triggers a download. Returns the count that
// actually made it in — the caller can warn when some assets couldn't load
// (e.g. evicted from cache and not yet mirrored). Throws only when nothing at
// all resolved, so the caller can surface a single clean error.
export async function downloadAssetsZip(
  entries: ZipEntry[],
  zipBasename: string,
  fallbackExt = 'mp4',
): Promise<number> {
  // Fetched on the press, not imported at the top: this module rides in the
  // chunk B-Roll and Playground share with the model picker and the lightbox,
  // so a static import put ~95 KB of zip library on the first open of both
  // for a button most sessions never press.
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  let added = 0
  for (const entry of entries) {
    if ('text' in entry) {
      zip.file(entry.name, entry.text)
      added += 1
      continue
    }
    const blob = await getBlob(entry.ref)
    if (!blob) continue
    zip.file(`${entry.name}.${extFor(blob, entry.fallbackExt ?? fallbackExt)}`, blob)
    added += 1
  }
  if (added === 0) throw new Error('None of the clips could be loaded to download.')

  const archive = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(archive)
  const a = document.createElement('a')
  a.href = url
  a.download = `${zipBasename}.zip`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return added
}
