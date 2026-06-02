import { useState, useEffect } from 'react'
import { isAssetRef, getUrl } from '../utils/assetStore'

/**
 * Resolves an asset reference to a renderable URL.
 * - If ref is an asset ID ("asset-xxx"), loads from IndexedDB and returns an object URL.
 * - If ref is a data URL, blob URL, or http URL, returns it as-is.
 * - Returns undefined while loading or if ref is empty.
 *
 * The synchronous (pass-through / empty) cases are derived during render so we
 * never call setState inside the effect for them. The async result is stored
 * tagged with the ref it resolved, so a stale load for a previous ref is
 * ignored by the render-time comparison instead of needing a reset setState.
 */
export function useAssetUrl(ref: string | undefined | null): string | undefined {
  const [entry, setEntry] = useState<{ ref: string; url: string | undefined }>()
  const isAsset = !!ref && isAssetRef(ref)

  useEffect(() => {
    if (!isAsset) return
    let cancelled = false
    getUrl(ref!).then((resolved) => {
      if (!cancelled) setEntry({ ref: ref!, url: resolved ?? undefined })
    })
    return () => { cancelled = true }
  }, [ref, isAsset])

  if (!ref) return undefined
  if (!isAsset) return ref // data:, blob:, http: — pass through
  return entry && entry.ref === ref ? entry.url : undefined
}

export type AssetUrlStatus = 'idle' | 'loading' | 'ready' | 'failed'

/**
 * Like {@link useAssetUrl}, but returns a status flag so callers can distinguish
 * "still loading from R2" from "asset not found". Logs a console warning on
 * failure with the asset id and cloud-active state.
 */
export function useAssetUrlState(ref: string | undefined | null): { url: string | undefined; status: AssetUrlStatus } {
  const [entry, setEntry] = useState<{ ref: string; url: string | undefined; status: AssetUrlStatus }>()
  const isAsset = !!ref && isAssetRef(ref)

  useEffect(() => {
    if (!isAsset) return
    let cancelled = false
    getUrl(ref!).then((resolved) => {
      if (cancelled) return
      if (resolved) {
        setEntry({ ref: ref!, url: resolved, status: 'ready' })
      } else {
        console.warn('[useAssetUrlState] asset unresolvable', { assetId: ref })
        setEntry({ ref: ref!, url: undefined, status: 'failed' })
      }
    })
    return () => { cancelled = true }
  }, [ref, isAsset])

  if (!ref) return { url: undefined, status: 'idle' }
  if (!isAsset) return { url: ref, status: 'ready' }
  return entry && entry.ref === ref ? { url: entry.url, status: entry.status } : { url: undefined, status: 'loading' }
}
