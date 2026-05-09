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

const PRESIGN_TTL_SECONDS = 300

interface SignBody {
  op: 'put' | 'get'
  assetId: string
  mimeType?: string
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
