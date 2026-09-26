// A pasted ad link, read: which platform, which ad. For the Ad Analyzer's
// upload screen — "or paste a TikTok, Instagram or Meta Ad Library link".
//
// Pure on purpose (types only), so the field can check a link before anything
// is billed and a test can pin the shapes without loading the stores. The fetch
// that spends the credit is `fetchAdFromLink` in `handoff.ts`.

import type { DiscoverPlatform } from '../types'

/** What a pasted link names: the platform, the ad's own id where the link carries one, and the link itself. */
export interface AdLink {
  platform: DiscoverPlatform
  /** TikTok's video id or Meta's ad archive id. Empty for a short link, where the vendor resolves the url. */
  sourceId: string
  url: string
}

/**
 * Reads a pasted link, or returns null when it isn't one of the three.
 *
 * Deliberately forgiving about the SHAPE — share sheets hand out short links,
 * tracking parameters and profile-prefixed paths — and strict about the host,
 * since the host is what decides which endpoint gets billed.
 */
export function parseAdLink(input: string): AdLink | null {
  const raw = input.trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '')

  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    // tiktok.com/@creator/video/7412… carries the id; vm.tiktok.com/… and
    // tiktok.com/t/… don't, and the vendor follows the url for those.
    const id = /\/video\/(\d+)/.exec(url.pathname)?.[1] ?? ''
    return { platform: 'tiktok', sourceId: id, url: url.toString() }
  }

  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    // /reel/ABC, /reels/ABC, /p/ABC, /tv/ABC, or any of them after a handle.
    // A bare profile link names no post, and resolving one would spend a
    // credit to find that out.
    const code = /\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1]
    if (!code) return null
    return { platform: 'instagram', sourceId: code, url: `https://www.instagram.com/reel/${code}/` }
  }

  if (host === 'facebook.com' || host.endsWith('.facebook.com')) {
    // facebook.com/ads/library/?id=1234… — the archive id IS the ad.
    const id = url.searchParams.get('id')
    if (!url.pathname.startsWith('/ads/library') || !id || !/^\d+$/.test(id)) return null
    return { platform: 'meta', sourceId: id, url: url.toString() }
  }

  return null
}
