const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

function extFromMime(mime: string): string | null {
  const base = mime.split(';')[0].trim().toLowerCase()
  return EXT_BY_MIME[base] ?? null
}

// Sniff the blob's first bytes so we still get the right extension when the
// server (or a data: URI) reports a generic type like application/octet-stream.
async function sniffExt(blob: Blob): Promise<string | null> {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'png'
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg'
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return 'gif'
  if (
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
  ) return 'webp'
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return 'mp4'
  return null
}

export async function downloadImage(href: string, basename: string, fallbackExt = 'png'): Promise<void> {
  try {
    const res = await fetch(href)
    const blob = await res.blob()
    const ext = extFromMime(blob.type) ?? (await sniffExt(blob)) ?? fallbackExt
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${basename}.${ext}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch {
    // Fall back to the original href if fetch fails (e.g. cross-origin without CORS).
    const a = document.createElement('a')
    a.href = href
    a.download = `${basename}.${fallbackExt}`
    a.click()
  }
}
