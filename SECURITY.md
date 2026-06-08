# Security

_Last updated: 2026-06-08 (security-hardening pass)_

## Architecture & threat model

UGC OS is a multi-tenant, cloud-hosted SPA gated to members of a
private Skool community. The platform:

- Runs as a Vite SPA on **Vercel** with a single Edge function
  (`/api/r2-sign`).
- Authenticates users via **Supabase** (email + password) and stores
  per-user state in Supabase Postgres.
- Stores asset blobs (images, audio, video) in **Cloudflare R2**.
- Syncs the access allowlist from Skool via **Zapier**.
- Calls **kie.ai** for every AI inference, using a user-supplied
  Bearer key (BYO).

Each member's data is isolated from every other member's by Postgres
RLS and by R2 key prefixes. Admins can read (not write) other
members' bank rows to support the Admin panel — those reads are
audit-able via Supabase logs.

The earlier "100% client-side, no backend" architecture (pre-phase-18)
is no longer accurate.

## Authentication

- **Provider:** Supabase Auth, email + password.
- **Allowlist gate:** new sign-ups are blocked at the database layer
  by a `before insert on auth.users` trigger
  (`enforce_allowlist`, in `supabase/migrations/0001_initial.sql`).
  Sign-up succeeds only if `lower(email)` is in the `allowlist`
  table. The trigger runs `SECURITY DEFINER` and cannot be bypassed
  client-side.
- **Disable on removal:** when an email is deleted from `allowlist`,
  the `on_allowlist_delete` trigger stamps the matching profile's
  `disabled_at`. Enforcement is now **server-side**: the
  `is_active()` SECURITY DEFINER helper is folded into every per-user
  `*_self_all` RLS policy (migration `0012`), so a disabled member's
  JWT no longer satisfies row access; the Edge functions
  (`r2-sign`, `r2-delete`) also reject a disabled profile. The client
  still signs the user out on hydration for a clean UX. (The auth
  session itself is not revoked, so the server-side checks — not the
  token's validity — are the enforcement boundary.)
- **Session:** standard Supabase JWT sessions, refreshed by the
  Supabase SDK. Sign-out clears the session and the Zustand stores
  (`bankStore`, `settingsStore`, `authStore`) for a clean remount.
- **Email confirmation:** optional in Supabase Auth → Providers.
  Operators of a Skool-vetted community may disable it for smoother
  UX; doing so does not relax the allowlist gate.

## Authorization (data isolation)

- **RLS everywhere.** Every per-user table — `projects`, `products`,
  `models`, `scripts`, `voices`, `brolls`, `voice_history`,
  `video_history`, `assets` — has the policy
  `auth.uid() = user_id` for `for all` (read + write). The
  policies are created in `supabase/migrations/0001_initial.sql`.
- **Admin reads.** Admin-only `for select` policies use a
  `is_admin()` helper marked `SECURITY DEFINER` with a fixed
  `search_path = public`. The helper reads the caller's
  `profiles.is_admin` flag while bypassing RLS to avoid self-recursion
  on the `profiles` table.
- **Admins cannot write other users' bank rows.** Only `for select`
  is granted to admin; `for update/delete` remains scoped to `self`.
- **Bootstrap.** The first admin is promoted manually via
  `select public.bootstrap_admin('email@example.com');`.

## Asset storage (Cloudflare R2)

- **Per-user key prefix.** Every object is stored at
  `auth/<userId>/<assetId>` in the bucket. The user id is taken
  exclusively from the **Supabase JWT**, never from request body —
  see `verifyUser()` in `api/r2-sign.ts`.
- **Presigned URLs only.** Members never receive R2 bucket
  credentials. Uploads and downloads go through short-lived
  (30-minute) presigned URLs minted by `/api/r2-sign`.
- **Path-traversal hardening.** `assetId` is regex-validated
  against `/^[a-zA-Z0-9._-]+$/`; slashes, dots, and URL-encoding
  tricks are rejected at the edge before any signing happens.
- **Upload guards:** 200 MB per-object cap, 10 GB per-user cap
  (enforced against `assets.byte_size`), MIME allowlist
  (`image/`, `video/`, `audio/` prefixes only). `byteSize` is
  **required** on a `put` presign — omitting it no longer skips the
  caps. Caveat: a presigned PUT can't bind `Content-Length` into the
  signature, so a client that declares a small `byteSize` could still
  PUT a larger object; pinning the size needs a presigned POST policy
  (`content-length-range`) — tracked below.
- **CORS.** The bucket's CORS policy must restrict
  `AllowedOrigins` to the production Vercel domain and (optionally)
  `http://localhost:5173` for development. See
  [DEPLOYMENT.md](DEPLOYMENT.md) for the exact policy.

## kie.ai API key handling

- **BYO key.** Each member provides their own kie.ai Bearer key in
  Settings. The user — not the operator — pays for inference.
- **Storage.** The key is kept in browser `localStorage` **only** —
  it is never written to or read from Supabase. (An earlier design
  mirrored it to `profiles.kie_api_key`; that column was dropped in
  migration `0008`, so the database never holds the key. Members
  re-paste it on each new browser.) Because it never reaches the DB,
  no admin read path can expose it.
- **Transport.** All kie.ai calls go directly from the browser to
  kie.ai over HTTPS, with the key in the `Authorization: Bearer`
  header.
- **Known limitation.** Because the key is held in the browser,
  any XSS, malicious dependency, or browser extension on the same
  origin can read it. Operators and members should treat the key
  as a credential that lives on the client device, not a server
  secret. See "Known limitations" below.
- **Mitigations members should apply:** scope the kie.ai key
  to the minimum credit balance you want to expose, set
  spend/usage alerts in kie.ai, and rotate the key immediately if
  you suspect compromise.

## Data at rest

| Layer | Where | Lifetime | Encryption |
|---|---|---|---|
| Bank rows | Supabase Postgres | Until deleted | At rest (Supabase-managed) |
| Asset blobs | Cloudflare R2 | Until deleted | At rest (Cloudflare-managed) |
| Asset cache | Browser IndexedDB | Until cleared / signed out | Browser-managed |
| Settings | Browser localStorage | Until cleared / signed out | None — treat as plaintext |
| Profile (per-app model, consent — **no** kie.ai key) | Supabase Postgres | Until account deleted | At rest (Supabase-managed) |

Sign-out clears IndexedDB asset cache and Zustand state; localStorage
keys for settings persist by design so the kie.ai key isn't lost on a
casual sign-out / sign-in.

## Edge function: `/api/r2-sign`

The only server-side surface area beyond Supabase. It:

1. Verifies the caller's Supabase JWT by calling `${SUPABASE_URL}/auth/v1/user`
   with the bearer token. Anonymous or invalid tokens get 401.
2. Validates the request body (`op` ∈ {put, get}, `assetId` regex,
   `mimeType` allowlist on PUT, `byteSize` ≤ 200 MB on PUT).
3. On PUT, checks the user's current `assets.byte_size` sum vs the
   10 GB cap and rejects if exceeded.
4. Mints an aws4-signed URL via `aws4fetch` scoped to
   `auth/<userId>/<assetId>` with a 30-minute TTL.

The function never returns object data — only signed URLs. R2 access
keys are kept in Vercel environment variables and never leave the
edge runtime.

## Allowlist + Skool sync

Two Zapier zaps keep `public.allowlist` in step with Skool:

- **New Member → `INSERT` into `allowlist`** (re-enables a previously
  disabled profile via `on_allowlist_insert`).
- **Member Removed → `DELETE` from `allowlist`** (disables the
  profile on next hydrate via `on_allowlist_delete`).

The Zapier service account uses Supabase's REST API with a
service-role-scoped row-level grant — operators should rotate that
service role key periodically and confine it to the `allowlist` table.

## Admin panel

The Admin entry in the sidebar renders only when `profiles.is_admin`
is `true` in the client store. **This is a UX-only gate.** A
sufficiently motivated user could mutate the store flag in devtools
to make the entry appear; their queries would then be rejected by
RLS. No data leaks from this, but admin pages should treat
authorization errors as a first-class state and avoid surfacing
internal table names.

Admin actions available:

- View per-member storage usage (`member_storage` view).
- Disable / re-enable a member (sets/clears `profiles.disabled_at`).
- Add / remove emails from `allowlist` (complementing Zapier sync).

## Known limitations

These are accepted today and tracked as future work:

1. **No Origin/Referer check on `/api/r2-sign`** — any origin can
   call it with a valid JWT. JWT exfiltration is a separate
   prerequisite, but an Origin check would shrink the blast radius.
2. **No rate limiting on `/api/r2-sign`** — an authenticated user
   can mint URLs in a tight loop. Per-user rate limiting (e.g.
   60 req/min via Vercel KV) is planned.
3. **Storage cap fails open on Supabase REST error** — if the
   per-user usage query fails, the upload is allowed through to
   avoid perma-blocking. Tracked failures + periodic reconciliation
   are planned.
4. **Presigned PUT can't pin `Content-Length`/`Content-Type`** — the
   caps and MIME allowlist are checked against the client-declared
   `byteSize`/`mimeType` at sign time, but the signature doesn't bind
   them, so a client can declare a small object and PUT a larger /
   different-typed one (scoped to its own `auth/<userId>/` prefix —
   a storage-cost abuse, not a cross-tenant break). Closing it fully
   means moving uploads to a presigned POST policy with
   `content-length-range`.
5. **kie.ai key is browser-visible** — see §"kie.ai API key handling"
   above. A future option is to proxy kie.ai through a server-side
   edge function so the key stays on the server.
6. **Admin gate is RLS-only on the read side, plus client-side hide
   on the navigation side** — the gate is sound for data, but the
   client-side hide leaks the existence of the Admin app.
7. **No full Content-Security-Policy** — `vercel.json` sets
   clickjacking/MIME/referrer/HSTS headers and `frame-ancestors
   'none'`, but not a `script-src`/`connect-src` allowlist (which
   would bound XSS exfiltration of the localStorage kie.ai key). A
   scoped CSP — validated in `Content-Security-Policy-Report-Only`
   against real Supabase/kie.ai/R2 traffic first — is the next step.

## Reporting vulnerabilities

If you discover a security issue, please **do not** open a public
GitHub issue. Email the maintainer directly with reproduction steps
and we'll respond within 72 hours. After a fix ships, a write-up
can go in the repo's issue tracker with credit.
