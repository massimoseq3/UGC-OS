// URL slug ↔ internal app id mapping.
// App ids are stable (used in localStorage keys + folder layout); slugs are
// derived from the sidebar display names so URLs read naturally.

export const DEFAULT_SLUG = 'bank'

const APP_ID_TO_SLUG: Record<string, string> = {
  'finder': 'bank',
  'character-studio': 'characters',
  'script-architect': 'scripts',
  'voice-studio': 'voiceovers',
  'broll-studio': 'broll-images',
  'video-studio': 'broll-videos',
  'ad-anatomy': 'ad-analyzer',
  'admin': 'admin',
}

const SLUG_TO_APP_ID: Record<string, string> = Object.fromEntries(
  Object.entries(APP_ID_TO_SLUG).map(([id, slug]) => [slug, id])
)

export function getSlugForAppId(appId: string | null): string | null {
  if (!appId) return null
  return APP_ID_TO_SLUG[appId] ?? null
}

export function getAppIdForSlug(slug: string): string | null {
  return SLUG_TO_APP_ID[slug] ?? null
}

// Extracts the first path segment (e.g. "/characters" → "characters", "/" → "").
export function getSlugFromPath(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0]
  return seg ?? ''
}
