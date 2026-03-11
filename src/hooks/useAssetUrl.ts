import { useState, useEffect } from 'react'
import { isAssetRef, getUrl } from '../utils/assetStore'

/**
 * Resolves an asset reference to a renderable URL.
 * - If ref is an asset ID ("asset-xxx"), loads from IndexedDB and returns an object URL.
 * - If ref is a data URL, blob URL, or http URL, returns it as-is.
 * - Returns undefined while loading or if ref is empty.
 */
export function useAssetUrl(ref: string | undefined | null): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => {
    if (!ref) return undefined
    if (isAssetRef(ref)) return undefined // will load async
    return ref // data:, blob:, http: — pass through
  })

  useEffect(() => {
    if (!ref) {
      setUrl(undefined)
      return
    }

    if (!isAssetRef(ref)) {
      setUrl(ref)
      return
    }

    let cancelled = false
    getUrl(ref).then((resolved) => {
      if (!cancelled) setUrl(resolved ?? undefined)
    })
    return () => { cancelled = true }
  }, [ref])

  return url
}
