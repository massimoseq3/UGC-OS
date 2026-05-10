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

export type AssetUrlStatus = 'idle' | 'loading' | 'ready' | 'failed'

/**
 * Like {@link useAssetUrl}, but returns a status flag so callers can distinguish
 * "still loading from R2" from "asset not found". Logs a console warning on
 * failure with the asset id and cloud-active state.
 */
export function useAssetUrlState(ref: string | undefined | null): { url: string | undefined; status: AssetUrlStatus } {
  const [state, setState] = useState<{ url: string | undefined; status: AssetUrlStatus }>(() => {
    if (!ref) return { url: undefined, status: 'idle' }
    if (isAssetRef(ref)) return { url: undefined, status: 'loading' }
    return { url: ref, status: 'ready' }
  })

  useEffect(() => {
    if (!ref) {
      setState({ url: undefined, status: 'idle' })
      return
    }
    if (!isAssetRef(ref)) {
      setState({ url: ref, status: 'ready' })
      return
    }

    let cancelled = false
    setState((prev) => prev.status === 'ready' && prev.url ? prev : { url: undefined, status: 'loading' })
    getUrl(ref).then((resolved) => {
      if (cancelled) return
      if (resolved) {
        setState({ url: resolved, status: 'ready' })
      } else {
        console.warn('[useAssetUrlState] asset unresolvable', { assetId: ref })
        setState({ url: undefined, status: 'failed' })
      }
    })
    return () => { cancelled = true }
  }, [ref])

  return state
}
