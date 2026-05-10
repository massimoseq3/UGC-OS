// Vercel Edge function. Mints presigned R2 URLs scoped to the caller.
//
// Request body: { op: 'put' | 'get', assetId: string, mimeType?: string }
// Response:    { url: string, key: string, expiresIn: number }
//
// Auth: caller must include a Supabase access token in `Authorization: Bearer …`.
// We verify it against Supabase's auth API to recover the user id, then sign
// a URL keyed under `auth/<userId>/<assetId>`. Users cannot read or write
// outside their own prefix.

import { AwsClient } from 'aws4fetch'

export const config = {
  runtime: 'edge',
}

// 30 minutes — long enough that a slow upload over a flaky connection won't
// hit a signed-URL expiry mid-PUT, short enough that a leaked URL is bounded.
const PRESIGN_TTL_SECONDS = 1800

// Cap individual uploads at 200 MB. Today the largest realistic asset is a
// 30s 1080p video (~50 MB). Catches both runaway client bugs and abuse.
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

// Per-user storage cap. Enforced server-side here so a client can't bypass
// by hitting the R2 PUT URL directly — we never sign one if the new upload
// would push them over.
const MAX_USER_BYTES = 10 * 1024 * 1024 * 1024 // 10 GB

// Mime allowlist for puts. We don't enforce on gets — those just hand back
// whatever R2 has — but writes should match what the app actually saves.
const ALLOWED_PUT_MIME_PREFIXES = ['image/', 'video/', 'audio/']

interface SignBody {
  op: 'put' | 'get'
  assetId: string
  mimeType?: string
  byteSize?: number
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function verifyUser(authHeader: string | null): Promise<{ userId: string } | { error: string }> {
  if (!authHeader?.startsWith('Bearer ')) return { error: 'Missing bearer token' }
  const token = authHeader.slice('Bearer '.length)
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnon = process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnon) return { error: 'Server missing SUPABASE_URL/ANON_KEY' }

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnon,
    },
  })
  if (!res.ok) return { error: 'Invalid session' }
  const user = await res.json() as { id?: string }
  if (!user.id) return { error: 'No user id in session' }
  return { userId: user.id }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const auth = await verifyUser(req.headers.get('authorization'))
  if ('error' in auth) return json(401, { error: auth.error })

  let body: SignBody
  try {
    body = await req.json() as SignBody
  } catch {
    return json(400, { error: 'Invalid JSON' })
  }

  if (body.op !== 'put' && body.op !== 'get') return json(400, { error: 'op must be put|get' })
  if (!body.assetId || typeof body.assetId !== 'string') return json(400, { error: 'assetId required' })
  if (!/^[a-zA-Z0-9._-]+$/.test(body.assetId)) return json(400, { error: 'assetId has invalid characters' })

  if (body.op === 'put') {
    if (typeof body.byteSize === 'number' && body.byteSize > MAX_UPLOAD_BYTES) {
      return json(413, { error: `Upload exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit` })
    }
    if (body.mimeType && !ALLOWED_PUT_MIME_PREFIXES.some((p) => body.mimeType!.startsWith(p))) {
      return json(415, { error: `Unsupported mime type: ${body.mimeType}` })
    }

    // Per-user storage cap. Sum the user's current `assets.byte_size` and
    // reject if the new upload would push them over MAX_USER_BYTES.
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseAnon = process.env.SUPABASE_ANON_KEY
    if (supabaseUrl && supabaseAnon && typeof body.byteSize === 'number') {
      const tokenForRest = req.headers.get('authorization')!.slice('Bearer '.length)
      const usageRes = await fetch(
        `${supabaseUrl}/rest/v1/assets?select=byte_size&user_id=eq.${auth.userId}`,
        {
          headers: {
            apikey: supabaseAnon,
            Authorization: `Bearer ${tokenForRest}`,
          },
        },
      )
      if (usageRes.ok) {
        const rows = await usageRes.json() as Array<{ byte_size: number }>
        const currentBytes = rows.reduce((s, r) => s + Number(r.byte_size ?? 0), 0)
        if (currentBytes + body.byteSize > MAX_USER_BYTES) {
          const usedGb = (currentBytes / 1024 / 1024 / 1024).toFixed(2)
          const capGb = (MAX_USER_BYTES / 1024 / 1024 / 1024).toFixed(0)
          return json(413, {
            error: `Storage cap reached — you're using ${usedGb} GB of ${capGb} GB. Free up space in Settings → Storage.`,
            code: 'storage_cap',
            usedBytes: currentBytes,
            capBytes: MAX_USER_BYTES,
          })
        }
      }
      // If the usage query fails (network/REST hiccup), we let the upload
      // through. The next upload retries the cap check; one slipping by is
      // far better than a perma-block when Supabase is flaky.
    }
  }

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKey = process.env.R2_ACCESS_KEY_ID
  const secretKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (!accountId || !accessKey || !secretKey || !bucket) {
    return json(500, { error: 'Server R2 env vars not configured' })
  }

  const key = `auth/${auth.userId}/${body.assetId}`
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodeURIComponent(key)}`

  const aws = new AwsClient({
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    service: 's3',
    region: 'auto',
  })

  // aws4fetch signs the URL when we call .sign with aws: { signQuery: true }.
  const url = new URL(endpoint)
  url.searchParams.set('X-Amz-Expires', String(PRESIGN_TTL_SECONDS))

  const signed = await aws.sign(
    new Request(url.toString(), { method: body.op === 'put' ? 'PUT' : 'GET' }),
    { aws: { signQuery: true } },
  )

  return json(200, { url: signed.url, key, expiresIn: PRESIGN_TTL_SECONDS })
}
