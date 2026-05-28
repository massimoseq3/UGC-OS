// Pulls a single first-frame still out of an uploaded ad so the History
// row has a recognisable thumbnail. We deliberately don't keep the source
// video — only this small JPEG. For image uploads, the upload itself is
// already a still, so we just return it unchanged.

const MAX_WIDTH = 512
const JPEG_QUALITY = 0.85
// Seek 0.1s in rather than 0s — some encoders return a black frame at 0.
const SEEK_TIME = 0.1

export async function captureFirstFrame(file: File): Promise<Blob> {
  if (file.type.startsWith('image/')) return file

  const url = URL.createObjectURL(file)
  try {
    return await extractVideoFrame(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function extractVideoFrame(src: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = src
    video.crossOrigin = 'anonymous'

    let settled = false
    const cleanup = () => {
      video.removeAttribute('src')
      video.load()
    }
    const fail = (msg: string) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(msg))
    }
    const timeoutId = window.setTimeout(() => fail('First-frame capture timed out'), 8000)

    video.addEventListener('error', () => fail('Video failed to decode'))
    video.addEventListener('loadeddata', () => {
      try { video.currentTime = Math.min(SEEK_TIME, (video.duration || SEEK_TIME) / 2) }
      catch { fail('Video seek failed'); return }
    })
    video.addEventListener('seeked', () => {
      try {
        const naturalW = video.videoWidth
        const naturalH = video.videoHeight
        if (!naturalW || !naturalH) { fail('Video had no dimensions'); return }
        const scale = naturalW > MAX_WIDTH ? MAX_WIDTH / naturalW : 1
        const w = Math.round(naturalW * scale)
        const h = Math.round(naturalH * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { fail('Canvas 2D context unavailable'); return }
        ctx.drawImage(video, 0, 0, w, h)
        canvas.toBlob((blob) => {
          window.clearTimeout(timeoutId)
          if (!blob || blob.size === 0) { fail('Empty thumbnail blob'); return }
          settled = true
          cleanup()
          resolve(blob)
        }, 'image/jpeg', JPEG_QUALITY)
      } catch (e) {
        fail(e instanceof Error ? e.message : 'Frame capture threw')
      }
    })
  })
}
