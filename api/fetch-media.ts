// Vercel Edge function. Streams a social-media CDN file back to the browser.
//
// Request:  GET /api/fetch-media?url=<encoded>
// Response: the upstream body, streamed, with permissive CORS for our own app.
//
// Why this exists: Outliers hands a found video to the Ad Analyzer, which needs
// the actual bytes in the browser. Meta's CDN (fbcdn.net) sends
// `access-control-allow-origin: *` so the client fetches those directly — but
// TikTok's CDN sends no CORS header at all, so the browser can't read the
// response. The client tries direct first and only falls back to this route.
//
// SECURITY: this is a server-side fetcher, i.e. a textbook SSRF primitive. Two
// controls keep it from becoming one:
//   1. Auth — a valid Supabase session from an unlocked account, same as
//      r2-sign and r2-delete.
//   2. A strict host ALLOWLIST, matched on the parsed hostname with a leading
//      dot for the suffix case. Never substring-match a URL: "evil.com/
//      ?x=tiktokcdn.com" contains an allowed host and is not one.
// Redirects are followed BY HAND (`redirect: 'manual'`), re-checking the
// allowlist on every hop before it is requested. Letting fetch() follow them
// and checking only the final URL still sent a request to every host in the
// chain — a blind SSRF through any open redirect on an allowed host.

export const config = {
  runtime: 'edge',
}

// Suffix match only (`host === entry` or `host.endsWith('.' + entry)`).
const ALLOWED_HOSTS = [
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokcdn-eu.com',
  'tiktokv.com',
  'muscdn.com',
  'fbcdn.net',
  'cdninstagram.com',
]

// A 9:16 ad is a few MB; the app's own upload ceiling is 200 MB. Matching it
// keeps one number in the member's head and bounds what a single call can pull.
const MAX_BYTES = 200 * 1024 * 1024

const FETCH_TIMEOUT_MS = 60_000

// A CDN hands back one or two hops at most; anything longer is a loop.
const MAX_REDIRECTS = 5

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function hostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}

/** Parses and validates a candidate URL. Returns null if it fails any check. */
function safeUrl(raw: string): URL | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  // http is upgraded by the CDNs anyway; refusing anything else rules out
  // file:, data:, gopher: and the rest of the SSRF toolkit.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!hostAllowed(url.hostname)) return null
  return url
}

async function verifyUser(authHeader: string | null): Promise<{ userId: string } | { error: string; status?: number }> {
  if (!authHeader?.startsWith('Bearer ')) return { error: 'Missing bearer token' }
  const token = authHeader.slice('Bearer '.length)
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnon = process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnon) return { error: 'Server missing SUPABASE_URL/ANON_KEY' }

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnon },
  })
  // Only a 401/403 means the token itself was rejected. A 429 or 5xx is the auth
  // service failing to answer, which isn't the member's session — reporting both
  // as "Invalid session" blamed a working login for an upstream blip.
  if (!res.ok) {
    return res.status === 401 || res.status === 403
      ? { error: 'Invalid session', status: 401 }
      : { error: `Auth check unavailable (${res.status}) — try again in a moment.`, status: 503 }
  }
  const user = await res.json() as { id?: string }
  if (!user.id) return { error: 'No user id in session' }

  // Reject anyone the app itself would lock out — removed from the allowlist
  // (disabled_at), cancelled (lapsed_at) or past their renewal checkpoint
  // (migration 0025) — so a locked-but-still-valid token can't keep pulling
  // media through a proxy the operator pays for. Same check as r2-delete:
  // my_access_state() is the helper is_active() answers from, with the pre-0025
  // disabled_at read as the fallback, failing open on a lookup error.
  const headers = { apikey: supabaseAnon, Authorization: `Bearer ${token}` }
  try {
    const stateRes = await fetch(`${supabaseUrl}/rest/v1/rpc/my_access_state`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (stateRes.ok) {
      const state = await stateRes.json() as { locked?: boolean; reason?: string | null }
      if (state?.locked) {
        return {
          error: state.reason === 'disabled'
            ? 'Account access has been revoked.'
            : 'Your access needs renewing — open the app and enter the current access code.',
          status: 403,
        }
      }
    } else {
      const profRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?select=disabled_at&id=eq.${user.id}`,
        { headers },
      )
      if (profRes.ok) {
        const rows = await profRes.json() as Array<{ disabled_at: string | null }>
        if (rows[0]?.disabled_at) return { error: 'Account access has been revoked.', status: 403 }
      }
    }
  } catch { /* fail open */ }

  return { userId: user.id }
}

/** Drops a body we won't forward, so its connection is released. */
function discard(res: Response): void {
  void res.body?.cancel().catch(() => {})
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return json(405, { error: 'GET only' })

  const auth = await verifyUser(req.headers.get('authorization'))
  if ('error' in auth) return json(auth.status ?? 401, { error: auth.error })

  const raw = new URL(req.url).searchParams.get('url')
  if (!raw) return json(400, { error: 'url parameter required' })

  const target = safeUrl(raw)
  if (!target) return json(403, { error: 'That host is not allowed.' })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  // TikTok's CDN serves 403 to requests with no Referer. This is the whole
  // reason the fetch has to happen server-side. The same headers ride every
  // hop, as they did when fetch() followed the redirects itself.
  const headers = {
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    referer: `${target.protocol}//${target.hostname}/`,
    accept: '*/*',
  }

  let upstream: Response
  let current = target
  try {
    for (let hop = 0; ; hop++) {
      const res = await fetch(current.toString(), { headers, redirect: 'manual', signal: controller.signal })
      if (res.type === 'opaqueredirect' || res.status === 0) {
        // A runtime with browser-style fetch hides the redirect (status 0, no
        // Location), so there's no hop to check. Rather than fail every TikTok
        // link that redirects, fall back to the old guard: let fetch follow,
        // and refuse the body if it ended on a host that isn't allowed.
        discard(res)
        const followed = await fetch(current.toString(), { headers, redirect: 'follow', signal: controller.signal })
        if (followed.url && !safeUrl(followed.url)) {
          discard(followed)
          clearTimeout(timer)
          return json(403, { error: 'Upstream redirected to a host that is not allowed.' })
        }
        upstream = followed
        break
      }
      const location = REDIRECT_STATUSES.has(res.status) ? res.headers.get('location') : null
      if (!location) { upstream = res; break }
      discard(res)

      // Checked BEFORE the next hop is requested — the point of following by
      // hand. An allowed host that 302s to an internal address never gets its
      // request made.
      const next = hop < MAX_REDIRECTS ? safeUrl(new URL(location, current).toString()) : null
      if (!next) {
        clearTimeout(timer)
        return hop < MAX_REDIRECTS
          ? json(403, { error: 'Upstream redirected to a host that is not allowed.' })
          : json(502, { error: 'The media host redirected too many times.' })
      }
      current = next
    }
  } catch (e) {
    clearTimeout(timer)
    const aborted = e instanceof Error && e.name === 'AbortError'
    return json(504, { error: aborted ? 'Upstream timed out.' : 'Could not reach the media host.' })
  }
  clearTimeout(timer)

  if (!upstream.ok) {
    discard(upstream)
    return json(upstream.status === 404 ? 404 : 502, {
      error: `Media host returned ${upstream.status}. The link may have expired — search again to refresh it.`,
    })
  }

  const declared = Number(upstream.headers.get('content-length') ?? '0')
  if (declared > MAX_BYTES) {
    discard(upstream)
    return json(413, { error: 'That file is too large to import.' })
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'

  // The declared length is only a claim, and a chunked response makes none, so
  // the cap is also counted on the bytes actually streamed. Past it the stream
  // errors (the client sees a failed download) and the upstream is cancelled.
  let streamed = 0
  const body = upstream.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      streamed += chunk.byteLength
      if (streamed > MAX_BYTES) ctl.error(new Error('That file is too large to import.'))
      else ctl.enqueue(chunk)
    },
  })) ?? null

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': contentType,
      // Signed CDN URLs expire within hours, so caching the bytes past that is
      // pointless; the app re-searches to refresh a dead link.
      'cache-control': 'private, max-age=0, no-store',
      'access-control-allow-origin': '*',
    },
  })
}
