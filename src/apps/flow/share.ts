// Share links for the gallery's templates. Two addresses, one per audience:
//
//   /t/<slug>       the public page, outside AuthGate: what the template makes,
//                   with Open in UGC OS and Get UGC OS. This is the link for a
//                   YouTube description — it has to say something to a
//                   visitor who isn't a member yet.
//   /flow/t/<slug>  the member link, which Open in UGC OS goes to: Template
//                   Setup, in the app.
//
// The member link is read at STARTUP, before RouterSync has run: RouterSync
// rewrites every path under an app to the app's own slug, and a hidden app's
// to the Dashboard. So the slug is kept in sessionStorage (it survives the
// sign-in screen, which is the same tab), and Flow is switched on there and
// then if it was off — following a link to a Flow template is asking for Flow,
// and switching it on after RouterSync had already bounced the path would
// start the URL and the dock chasing each other (see RouterSync's own note).
//
// App.tsx imports this at startup, so it stays free of the Flow chunk.

import { isAppVisible, useAppVisibilityStore } from '../../stores/appVisibilityStore'

const KEY = 'ugc-os:flow:share'
const SLUG = '[a-z0-9][a-z0-9-]{0,79}'
const MEMBER_PATH = new RegExp(`^/flow/t/(${SLUG})/?$`)

interface Pending {
  slug: string
  // Flow was off and the link switched it on, which the member is told.
  switchedOn?: boolean
}

export function captureShareLink(): void {
  const m = MEMBER_PATH.exec(window.location.pathname)
  if (!m) return
  const pending: Pending = { slug: m[1] }
  if (!isAppVisible('flow')) {
    useAppVisibilityStore.getState().setOptionalEnabled('flow', true)
    pending.switchedOn = true
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(pending))
  } catch { /* a link that can't be kept still lands on Flow */ }
}

// The link the page was opened with, once — reading it clears it.
export function takeShareLink(): Pending | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    sessionStorage.removeItem(KEY)
    const parsed = JSON.parse(raw) as Partial<Pending>
    return isSlug(parsed.slug) ? { slug: parsed.slug, switchedOn: parsed.switchedOn === true } : null
  } catch {
    return null
  }
}

export function isSlug(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^${SLUG}$`).test(value)
}

export function publicTemplateUrl(slug: string): string {
  return `${window.location.origin}/t/${slug}`
}

export function memberTemplatePath(slug: string): string {
  return `/flow/t/${slug}`
}
