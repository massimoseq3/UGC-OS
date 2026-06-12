// Reads an audio/video clip's duration from its metadata without fully
// decoding it. Used to enforce kie.ai's reference-clip length caps client-side
// before burning an upload + a failed task on an over-long file.
export function readMediaDuration(src: string, kind: 'audio' | 'video'): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind)
    el.preload = 'metadata'
    el.onloadedmetadata = () => resolve(el.duration)
    el.onerror = () => reject(new Error('Could not read media metadata.'))
    el.src = src
  })
}
