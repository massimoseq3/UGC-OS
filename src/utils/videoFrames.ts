// Pulls a single still frame out of a video — used by the Playground preview
// lightbox so a generated clip's first or last frame can be saved to the bank
// or downloaded. Full resolution (no downscale) since these become reusable
// start frames / references. PNG to stay lossless.
//
// 'first' seeks slightly past 0 (some encoders emit a black frame at exactly 0);
// 'last' seeks a hair before the end (seeking to exactly duration often never
// fires `seeked`).

export type FramePosition = 'first' | 'last'

export function extractVideoFrame(src: string, position: FramePosition): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    video.src = src

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
    const timeoutId = window.setTimeout(() => fail('Frame capture timed out'), 12000)

    const grab = () => {
      try {
        const w = video.videoWidth
        const h = video.videoHeight
        if (!w || !h) { fail('Video had no dimensions'); return }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { fail('Canvas 2D context unavailable'); return }
        ctx.drawImage(video, 0, 0, w, h)
        canvas.toBlob((blob) => {
          window.clearTimeout(timeoutId)
          if (!blob || blob.size === 0) { fail('Empty frame blob'); return }
          settled = true
          cleanup()
          resolve(blob)
        }, 'image/png')
      } catch (e) {
        fail(e instanceof Error ? e.message : 'Frame capture threw')
      }
    }

    video.addEventListener('error', () => fail('Video failed to decode'))
    video.addEventListener('seeked', grab)
    video.addEventListener('loadeddata', () => {
      try {
        const d = video.duration
        const t = position === 'first'
          ? Math.min(0.1, (d || 0.2) / 2)
          : Math.max(0, (Number.isFinite(d) ? d : 0) - 0.1)
        video.currentTime = t
      } catch {
        fail('Video seek failed')
      }
    })
  })
}
