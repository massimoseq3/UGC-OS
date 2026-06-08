// Vercel Edge function. Mints presigned R2 credentials scoped to the caller.
//
// Request body: { op: 'put' | 'get', assetId: string, mimeType?: string, byteSize?: number }
// Response:
//   get → { url: string, key: string, expiresIn: number }
//   put → { url: string, fields: Record<string,string>, key: string, expiresIn: number }
//
// GET hands back a query-signed download URL. PUT hands back a **presigned
// POST policy** (form fields the client submits as multipart/form-data). We use
// POST rather than a presigned PUT because a presigned PUT can't bind
// Content-Length or Content-Type into the SigV4 signature — a client could
// declare a tiny `byteSize` at sign time and then PUT a multi-GB body, blowing
// past the per-object and per-user caps. A POST policy CAN bind both via the
// `content-length-range` and exact `Content-Type` conditions, which R2 enforces
// at upload time.
//
// Auth: caller must include a Supabase access token in `Authorization: Bearer …`.
// We verify it against Supabase's auth API to recover the user id, then sign
// credentials keyed under `auth/<userId>/<assetId>`. Users cannot read or write
// outside their own prefix.

import { AwsClient } from 'aws4fetch'

export const config = {
  runtime: 'edge',
}

// 30 minutes — long enough that a slow upload over a flaky connection won't
// hit a signed-URL expiry mid-transfer, short enough that a leaked URL is bounded.
const PRESIGN_TTL_SECONDS = 1800

// Cap individual uploads at 200 MB. Today the largest realistic asset is a
// 30s 1080p video (~50 MB). Catches both runaway client bugs and abuse.
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

// Per-user storage cap. Enforced server-side here so a client can't bypass
// by hitting R2 directly — we never sign anything if the new upload would
// push them over.
const MAX_USER_BYTES = 10 * 1024 * 1024 * 1024 // 10 GB

// Mime allowlist for puts. We don't enforce on gets — those just hand back
// whatever R2 has — but writes must match what the app actually saves. The
// POST policy binds the exact value below as a condition, so it's enforced at
// upload time, not merely advised at sign time.
const ALLOWED_PUT_MIME_PREFIXES = ['image/', 'video/', 'audio/']

// SigV4 scope for R2. Region is always `auto`; service is `s3`.
const SIGN_REGION = 'auto'
const SIGN_SERVICE = 's3'

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

// ── SigV4 POST-policy signing (aws4fetch doesn't build POST policies) ──

const encoder = new TextEncoder()

// UTF-8 bytes of a string in a fresh, non-shared ArrayBuffer — keeps the Web
// Crypto `BufferSource` types happy (a plain `Uint8Array` is generic over
// ArrayBufferLike, which includes SharedArrayBuffer).
function utf8Bytes(str: string): ArrayBuffer {
  const view = encoder.encode(str)
  const buf = new ArrayBuffer(view.byteLength)
  new Uint8Array(buf).set(view)
  return buf
}

async function hmacSha256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, utf8Bytes(data))
}

// Standard SigV4 signing-key derivation: each step HMACs the prior result.
async function deriveSigningKey(secret: string, dateStamp: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(utf8Bytes(`AWS4${secret}`), dateStamp)
  const kRegion = await hmacSha256(kDate, SIGN_REGION)
  const kService = await hmacSha256(kRegion, SIGN_SERVICE)
  return hmacSha256(kService, 'aws4_request')
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

// base64 of a UTF-8 string. btoa only handles Latin1, so encode to bytes first.
function base64Utf8(str: string): string {
  const bytes = encoder.encode(str)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

async function verifyUser(authHeader: string | null): Promise<{ userId: string } | { error: string; status?: number }> {
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

  // A valid JWT is not enough: a member removed from the allowlist has their
  // profile stamped with `disabled_at` but keeps a refreshable token. Reject
  // disabled accounts so they can't keep minting R2 URLs after removal. We fail
  // OPEN if the profile lookup itself errors (network/REST hiccup) — same
  // philosophy as the storage-cap check below, and RLS (migration 0012) is the
  // backstop for the Postgres side regardless.
  try {
    const profRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=disabled_at&id=eq.${user.id}`,
      { headers: { apikey: supabaseAnon, Authorization: `Bearer ${token}` } },
    )
    if (profRes.ok) {
      const rows = await profRes.json() as Array<{ disabled_at: string | null }>
      if (rows[0]?.disabled_at) return { error: 'Account access has been revoked.', status: 403 }
    }
  } catch { /* fail open — see comment above */ }

  return { userId: user.id }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const auth = await verifyUser(req.headers.get('authorization'))
  if ('error' in auth) return json(auth.status ?? 401, { error: auth.error })

  let body: SignBody
  try {
    body = await req.json() as SignBody
  } catch {
    return json(400, { error: 'Invalid JSON' })
  }

  if (body.op !== 'put' && body.op !== 'get') return json(400, { error: 'op must be put|get' })
  if (!body.assetId || typeof body.assetId !== 'string') return json(400, { error: 'assetId required' })
  if (!/^[a-zA-Z0-9._-]+$/.test(body.assetId)) return json(400, { error: 'assetId has invalid characters' })

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKey = process.env.R2_ACCESS_KEY_ID
  const secretKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (!accountId || !accessKey || !secretKey || !bucket) {
    return json(500, { error: 'Server R2 env vars not configured' })
  }

  const key = `auth/${auth.userId}/${body.assetId}`

  // ── GET → query-signed download URL (presigned GET, unchanged) ──────
  if (body.op === 'get') {
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodeURIComponent(key)}`
    const aws = new AwsClient({
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      service: 's3',
      region: 'auto',
    })
    const url = new URL(endpoint)
    url.searchParams.set('X-Amz-Expires', String(PRESIGN_TTL_SECONDS))
    const signed = await aws.sign(
      new Request(url.toString(), { method: 'GET' }),
      { aws: { signQuery: true } },
    )
    return json(200, { url: signed.url, key, expiresIn: PRESIGN_TTL_SECONDS })
  }

  // ── PUT → presigned POST policy ─────────────────────────────────────
  // byteSize + mimeType are required: the POST policy binds them as conditions,
  // so they must be known and valid before we sign.
  if (typeof body.byteSize !== 'number' || !Number.isFinite(body.byteSize) || body.byteSize <= 0) {
    return json(400, { error: 'byteSize (a positive number) is required for put' })
  }
  if (body.byteSize > MAX_UPLOAD_BYTES) {
    return json(413, { error: `Upload exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit` })
  }
  if (!body.mimeType || !ALLOWED_PUT_MIME_PREFIXES.some((p) => body.mimeType!.startsWith(p))) {
    return json(415, { error: `Unsupported or missing mime type: ${body.mimeType ?? '(none)'}` })
  }

  // Per-user storage cap. Sum the user's current `assets.byte_size` and reject
  // if the new upload would push them over MAX_USER_BYTES.
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnon = process.env.SUPABASE_ANON_KEY
  if (supabaseUrl && supabaseAnon) {
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

  // Build + sign the POST policy. The `content-length-range` and exact
  // `Content-Type` conditions are enforced by R2 itself at upload time, so a
  // client can't exceed its declared size or smuggle a disallowed MIME type.
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '') // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8)                          // YYYYMMDD
  const expiration = new Date(now.getTime() + PRESIGN_TTL_SECONDS * 1000).toISOString()
  const credential = `${accessKey}/${dateStamp}/${SIGN_REGION}/${SIGN_SERVICE}/aws4_request`

  // Cap the body at the smaller of the client's declared size and the hard
  // 200 MB per-object limit. R2 rejects any body whose length falls outside it.
  const maxBytes = Math.min(body.byteSize, MAX_UPLOAD_BYTES)

  const policy = {
    expiration,
    conditions: [
      { bucket },
      { key },
      { 'Content-Type': body.mimeType },
      ['content-length-range', 0, maxBytes],
      { 'x-amz-algorithm': 'AWS4-HMAC-SHA256' },
      { 'x-amz-credential': credential },
      { 'x-amz-date': amzDate },
    ],
  }

  const policyB64 = base64Utf8(JSON.stringify(policy))
  const signingKey = await deriveSigningKey(secretKey, dateStamp)
  const signature = toHex(await hmacSha256(signingKey, policyB64))

  // Form fields the client submits alongside the file. Every field except
  // `file`, `policy`, and `x-amz-signature` must have a matching policy
  // condition above, or R2 rejects the upload.
  const fields: Record<string, string> = {
    key,
    'Content-Type': body.mimeType,
    'x-amz-algorithm': 'AWS4-HMAC-SHA256',
    'x-amz-credential': credential,
    'x-amz-date': amzDate,
    policy: policyB64,
    'x-amz-signature': signature,
  }

  const postUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`
  return json(200, { url: postUrl, fields, key, expiresIn: PRESIGN_TTL_SECONDS })
}
