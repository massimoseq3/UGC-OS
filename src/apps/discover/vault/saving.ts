// Keeping a vault reel: one way to keep an ad, and it's the Swipe File.
//
// The vault used to have its own browser-local ★, while a search result went
// to the synced swipe file — two ways to keep an ad, one of which never left
// the browser it was pressed in and was invisible to the Bank. A vault row now
// files into the same `swipes` bank a search card does, and "Saved" in the
// vault means "in the Swipe File".
//
// Building the row is free. Everything a swipe holds is already on the vault
// row (the permalink, the author, the caption, the whole transcript, likes and
// comments as harvested), and the cover is our OWN static file, so copying it
// into the member's storage costs no ScrapeCreators credit. No video url is
// stored — exactly like an Instagram swipe from a search whose link has
// expired, the Bank's "Restore Video · 1 credit" resolves one from the
// permalink when the member actually wants it.

import type { SwipeItem } from '../../../stores/types'
import { localBanksReady, useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { deleteAsset } from '../../../utils/assetStore'
import { saveRemoteImage } from '../services/handoff'
import { loadVault, thumbUrl } from './service'
import type { VaultItem } from './types'

/** Vault reels are Instagram's, and their id is the reel's shortcode. */
export const VAULT_PLATFORM = 'instagram' as const

/**
 * A vault row as a swipe.
 *
 * `outlierMultiple` is deliberately left empty: the vault's multiple is
 * engagement ÷ the LIBRARY median, and a swipe's is views ÷ the creator's own
 * following. Filed under the same field, the Bank would print one as if it
 * were the other (see `MULTIPLE_TITLE`). Views, shares and saves stay empty
 * for the reason every Instagram card leaves them empty — nobody published them.
 */
export function vaultSwipe(item: VaultItem, thumbRef: string | undefined): Omit<SwipeItem, 'id' | 'createdAt'> {
  return {
    platform: VAULT_PLATFORM,
    sourceId: item.id,
    postUrl: item.url,
    thumbRef,
    authorHandle: item.author,
    authorName: item.authorName || item.author,
    caption: item.caption,
    // Free here — every vault row was transcribed when the library was built —
    // and it's the one thing a search swipe usually has to pay a credit for.
    transcript: item.transcript.trim() || undefined,
    likes: item.likes,
    comments: item.comments,
  }
}

/** The Swipe File row holding this vault reel, if there is one. */
export function vaultSwipeRow(itemId: string): SwipeItem | undefined {
  return useBankStore.getState().getSwipeBySource(VAULT_PLATFORM, itemId)
}

/**
 * Files a vault reel in the Swipe File. Costs nothing.
 *
 * The cover is copied into our own storage first, like every swipe's: a row
 * that merely pointed at `/vault/thumbs/…` would lose its picture the day a
 * corpus rebuild drops that reel.
 */
export async function saveVaultRow(item: VaultItem): Promise<void> {
  const thumbRef = item.hasThumb ? await saveRemoteImage(thumbUrl(item)) : undefined
  // Checked AFTER the copy: a second press, or the one-time star migration,
  // can file the same reel while the cover is in flight, and a bank must never
  // hold one ad twice.
  if (vaultSwipeRow(item.id)) {
    if (thumbRef) void deleteAsset(thumbRef).catch(() => {})
    return
  }
  await useBankStore.getState().addSwipe(vaultSwipe(item, thumbRef))
}

// ── The one-time move from ★ to the Swipe File ──────────────────

/**
 * Where the vault's stars used to live — the slot
 * `useProjectScopedKey('discover:vault-stars')` wrote. Spelled out because
 * that helper is named like a hook and this runs outside a component.
 */
const LEGACY_STARS_KEY = 'ai-ugc-lab:draft:discover:vault-stars'

function readLegacyStars(): string[] {
  try {
    const raw = localStorage.getItem(LEGACY_STARS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

let migration: Promise<void> | null = null

/**
 * Moves any stars from the old browser-local slot into the Swipe File, once.
 *
 * Idempotent by construction rather than by a flag: a reel already filed is
 * skipped, and the old slot is only removed once every star in it has been
 * filed — so a migration interrupted by a closed tab simply finishes on the
 * next visit, and never files a reel twice. Waits for the local bank cache
 * first, or a member's existing swipes would look absent and be re-filed.
 */
export function migrateVaultStars(): Promise<void> {
  migration ??= runStarMigration().catch((e: unknown) => {
    // The slot stays put, so the next open retries; nothing was lost.
    console.warn('[outliers] moving vault stars to the Swipe File failed; will retry', e)
    migration = null
  })
  return migration
}

async function runStarMigration(): Promise<void> {
  const ids = readLegacyStars()
  if (ids.length === 0) {
    localStorage.removeItem(LEGACY_STARS_KEY)
    return
  }
  await localBanksReady
  const rows = await loadVault()
  const byId = new Map(rows.map((r) => [r.id, r]))

  let moved = 0
  for (const id of ids) {
    const row = byId.get(id)
    // A star on a reel a corpus rebuild dropped has nothing to file.
    if (!row || vaultSwipeRow(id)) continue
    await saveVaultRow(row)
    moved++
  }
  localStorage.removeItem(LEGACY_STARS_KEY)

  if (moved > 0) {
    // Said once, because the stars were something the member did and they
    // have visibly changed shape: the ★ is gone and a bookmark is in its place.
    useAppStore.getState().addToast(
      moved === 1
        ? 'Your starred vault hook is in your Swipe File now, where saved ads live.'
        : `Your ${moved} starred vault hooks are in your Swipe File now, where saved ads live.`,
      'info',
    )
  }
}
