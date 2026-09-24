// Templates From the Channel: static files in `public/templates/`, shipped
// with each deploy like the Outlier Vault and the character presets — no
// admin tool, no table. `index.json` lists them; each is a template's
// flow.json on its own.

import { FriendlyError } from '../../../utils/friendlyError'
import { validateTemplate, type LoadedTemplate } from './io'

export interface GalleryEntry {
  // Also the template's own `template.id`: a flow made from this entry is
  // matched back to it by that id, for the version check.
  slug: string
  name: string
  description: string
  blocks: number
  estimate?: number
  videoUrl?: string
  cover?: string
  // The version the gallery ships now, and what changed in it — the flows
  // made from an older one offer the update with these lines.
  version?: number
  changes?: string[]
}

let cached: Promise<GalleryEntry[]> | null = null

export function loadGallery(): Promise<GalleryEntry[]> {
  cached ??= fetch('/templates/index.json', { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : { templates: [] }))
    .then((data: { templates?: GalleryEntry[] }) => (Array.isArray(data.templates) ? data.templates : []))
    .catch(() => {
      cached = null
      return []
    })
  return cached
}

export async function loadGalleryTemplate(slug: string): Promise<LoadedTemplate> {
  const res = await fetch(`/templates/${encodeURIComponent(slug)}.json`, { cache: 'no-cache' })
  if (!res.ok) throw new FriendlyError('That template could not be loaded. Check your connection and try again.')
  const parsed = validateTemplate(await res.json())
  return { file: parsed.file, assets: {}, changes: parsed.changes }
}
