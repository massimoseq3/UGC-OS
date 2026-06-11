# CLAUDE.md — UGC OS

## Project Identity

You are building **UGC OS** — a browser-based, YouTube-style workspace that unifies seven AI tools for UGC ad production into one environment with shared data banks. Every AI call goes through **kie.ai**: one user-supplied Bearer key gives access to every model the app uses (chat, vision, image, video, TTS, music).

**Who it's for / why.** A private Skool community of solo creators and small teams producing AI UGC ads at scale — access is gated by an email allowlist synced from Skool, so non-members can't sign up even with the URL. The pitch is one workspace instead of seven tabs: the same product, character, script, voice, and B-Roll flow across every app via the shared banks. Inference cost is on the member (BYO kie.ai key), so the operator only pays for hosting + storage.

Sidebar is grouped into three sections (LIBRARY / CREATE / TOOLS). Display names are terse nouns, not action verbs. Folder names and the `id` strings in `src/utils/constants.ts` are **stable** — they key per-app model selections in localStorage. Do not rename them.

| Section | Sidebar entry | Folder | Job |
|---|---|---|---|
| Library | Bank | `finder/` | Banks browser |
| Create | Influencers | `character-studio/` | Form → portrait image. Drop a reference photo anywhere to auto-fill every field via vision-based DNA extraction. Display name rebranded from "Characters" — folder, ids, types, and LLM prompts keep the character naming. |
| Create | Scripts | `script-architect/` | Three modes: Write New (brief + style + 10/15/30/60s → 3 human-sounding takes, as plain script or scene blueprint), Remix Script (winning transcript → 3 variations), Remix Scenes (Ad Analyzer blueprint → rewritten scene prompts) |
| Create | Voiceovers | `voice-studio/` | Script → audio (ElevenLabs v2) |
| Create | B-Roll | `broll-studio/` | Script → scenes → 4 variations/scene (Speaking / Literal / Emotional / Product). Each card has Generate Image **and** Generate Video; video gens are fire-and-forget with refresh-safe resume. |
| Tools | Ad Analyzer | `ad-anatomy/` | Ad image or video frame → scorecard + transcript + visual playbook |
| Tools | Playground | `playground/` | Free-form Image / Video / Music. Prompt bar, mode tabs, model picker, ref slots + drag-drop. `@`-mentions reference Products / Influencers / B-Rolls and auto-attach the asset. |

## Role

Senior frontend engineer + product architect. Push back when something's flawed. Ask for context (kie doc URLs, exact error text) before guessing. Prefer the boring, debuggable solution.

## Core Rules

**Code philosophy.** Simple > clever. Obvious > terse. Components small and single-purpose. No premature optimisation. Comments explain *why*, not *what*.

**Architecture.**
- **Self-contained apps.** Each app under `src/apps/<name>/` owns its types, components, and service. Cross-app communication goes through the bank store (persistent) or the inter-app payload (one-shot handoffs).
- **No prop drilling.** Zustand stores for global state; local React state for ephemeral UI.
- **Model registry is the single source of truth.** Add or change a model only by editing `src/utils/models.ts`. Don't sprinkle slugs through service files.

**Styling.** Tailwind only. Per-app accent palettes are custom Tailwind families (`influencers-*`, `scripts-*`, `voice-*`, `broll-*`, `playground-*`) defined in the `@theme` block of `index.css` (Ad Analyzer uses literal `#FF5257`); the matching hexes for sidebar/bank chrome live in `constants.ts`. Change an accent there, not by sprinkling new color classes. Dark-first: backgrounds `#050505`–`#0A0A0A`, borders `white/5`–`white/10`, glass via `backdrop-blur-xl`. Tracking-tight text. Transitions 200–300 ms for panels, 150 ms for hover. Tags use `TAG_STYLES` from `models.ts` (Recommended green / New fuchsia / Fast sky / Cheap zinc).

**Errors.** End-user generation surfaces show friendly copy via `humanizeError()` (see `utils/friendlyError.ts`). Infra/admin/Settings surfaces still surface the raw kie.ai message — the operator debugs there. Note: the kie envelope can return `{ code: 5xx, msg: "...maintained..." }` inside an HTTP 200 during maintenance windows — not a code bug.

## Tech Stack

- React 19 + TypeScript + Vite (`npm run dev` → http://localhost:5173). Tailwind CSS 4. Zustand for global state.
- IndexedDB (`assetStore.ts`) for blobs, mirrored to Cloudflare R2 when cloud sync is active. localStorage for bank metadata, settings, picker selections.
- **Cloud (opt-in):** Supabase (auth + Postgres) + R2. Enabled when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set; absent → local-only mode (100% client-side). Access gated by email allowlist synced from Skool via Zapier.
- kie.ai Bearer token sent directly from the client (no proxy).

## kie.ai client (`src/utils/kie.ts`)

Four transports — pick by task type. Endpoints and result shapes live in `kie.ts`; the gotchas worth knowing here:

1. **Async task** (`runTask`, `kieImageGenerate`, `kieVideoGenerate`, `kieTTS`) — `POST /jobs/createTask` → poll `GET /jobs/recordInfo`. Result URLs are string-encoded JSON inside `resultJson.resultUrls`. Outputs expire in 3 days — always `downloadAsBase64` + `saveAsset`.
2. **Chat completions** (`kieChatCompletions`) — `POST /<slug>/v1/chat/completions`, streaming SSE, falls back to JSON parse then surfaces the body's first 400 chars on failure. Vision via `image_url` blocks (data URIs work, no upload). Get the endpoint path from `getChatEndpointPath()` — never hardcode slugs.
3. **Veo** (`kieVeoGenerate`) — custom `/veo/generate` + `/veo/record-info`. Variant (`veo3` / `veo3_fast` / `veo3_lite`) via the `model` field, not the URL. Results nest under `response.resultUrls`.
4. **Suno music** (`kieMusicGenerate` / `kieMusicPoll` / `runMusicTask`) — custom `/generate` + `/generate/record-info`. Suno-specific status values; `callBackUrl` is required by the schema but we pass a no-op and poll. Audio at `response.sunoData[].audioUrl` (v1 uses the first track).

`ensureHostedUrl(apiKey, source)` uploads `data:` URIs to kie's file host (image→image and frame-conditioned video models need public URLs; hosted files expire in 3 days). `kieTestConnection` checks the credit balance (Settings).

## Models (defaults)

Full list in `src/utils/models.ts`. Defaults below; users can swap image and video models from the picker.

| Capability | Default | Notes |
|---|---|---|
| Text + vision | Gemini 3 Flash (`gemini-3-flash`) | Hard-coded everywhere — no picker |
| Image (text→image) | Nano Banana 2 (`nano-banana-2`) | App-wide default (leads the registry). Picker also: GPT Image 2, Seedream 5 Lite |
| Image (image→image) | Nano Banana 2 (`nano-banana-2`) | Used when reference images are present. Picker also: GPT Image 2 Edit |
| Video | Seedance 2.0 (`bytedance/seedance-2`); B-Roll defaults to Veo 3.1 Fast (`veo3_fast`) | Ref-capable. Picker also: Seedance 2.0 Fast, Veo 3.1 Fast/Lite/Quality, Kling 3.0, Wan 2.7, Sora 2, Sora 2 Pro |
| TTS | ElevenLabs Multilingual v2 (`elevenlabs/text-to-speech-multilingual-v2`) | Hard-coded; ~64-voice catalog, slide-in picker |
| Music | Suno V5 (`suno-v5`) | Playground only. Picker also: Suno V5.5 |

- **Pricing.** `estimateCredits(modelId, params)` + `formatCredits` are the only public APIs. Each `ModelEntry` declares flat `pricing.credits` or a `priceFor(opts)` callback for multi-dimensional models (Kling, Veo, Sora). No USD is shown anywhere. Per-call models (Veo all variants, Sora 2/Pro) have `videoConstraints.durations: []` so the duration toggle hides.
- **Video modes** (`text-to-video` / `image-to-video` / `frames-to-video` / `reference-to-video`). Each model declares `videoModes` + `videoConstraints`. B-Roll and Playground infer the mode at generate time from which inputs are filled (references → reference-to-video; start+end → frames; start only → image; none → text). Ref-capable models: `veo3_fast`, `bytedance/seedance-2`, `bytedance/seedance-2-fast`.
- **Body shaping.** `buildImageInput` / `buildVideoInput` / `buildMusicInput` produce the correct per-model request body from a uniform options object (handling field-name differences like Seedance `first_frame_url` vs Veo `imageUrls`).
- **B-Roll per-card video.** Each card carries its own `videoStatus` + persisted `videoTaskId`, so cards generate in parallel and survive a refresh. `services/generateVideo.ts` splits into `startVideoTask` (→ taskId) and `finishVideoTask` (poll → download → save). OutputPanel resumes pending tasks on mount; entries older than 30 min are evicted with a Reset link.

## Non-obvious files

Most files are self-explanatory. These carry behaviour worth knowing before you touch them:

- `stores/bankStore.ts` — all banks + history + `migrateVoiceShape`.
- `utils/orphanCleanup.ts` — once-per-sign-in asset sweep. Its bank list **must** cover every bank (compile-time `satisfies Record<BankKey, true>` guard) or it deletes that bank's live assets from IDB + R2. Local-only banks (`brollHistory`, `scriptHistory`) are walked separately via `LOCAL_BANK_KEYS`.
- `utils/assetStore.ts` — IndexedDB blobs + fire-and-forget R2 mirror; `getBlob()` falls back to R2 on miss.
- `utils/friendlyError.ts` — `humanizeError(err, fallback)`, the ordered rule table for end-user error copy.
- `lib/cloudSync.ts` — pull on sign-in + debounced diff-push + persistent localStorage outbox + non-destructive hydrate.
- `lib/supabase.ts` — `ensureFreshSession()` (3s race + cached-token fallback) and a custom non-blocking `auth.lock`.
- `hooks/useAssetUrl.ts` — resolves `asset://` refs to blob URLs.

## Banks

Persisted to `localStorage` under `ai-ugc-lab-banks`. Asset blobs live in IndexedDB (mirrored to R2 in cloud mode); rows store `asset://<id>` refs. `useAssetUrl(ref)` turns a ref into a blob URL. Types are in `stores/types.ts`.

`products`, `models` (from Influencers), `scripts`, `voices`, `brolls`, plus auto-pushed history banks: `voiceHistory`, `videoHistory`, `musicHistory`, `characterHistory`. Gotchas:

- **`brolls`** can carry both `imageUrl` (still) and `videos[]` (animations); saving a card appends to the source's `videos[]`. Saved video-history items stamp `linkedBRollId`; deletion only purges the blob if not linked.
- **`videoHistory`** is shared by B-Roll and Playground (for refresh-resume); Playground's grid filters out `sourceApp === 'broll-studio'`. 14-day retention.
- **`characterHistory`** carries `imageRef` + the full `profile` snapshot; `linkedModelId` is set on save-to-bank and gates blob purge. Presets aren't a bank — reuse a recipe by saving to `models` and reloading via the Controls header dropdown.
- **`VoicePreset` / `VoiceHistoryItem`** carry the full v2 param set (`voiceId`, `stability`, `similarityBoost`, `style`, `speed`). Legacy fields are stripped and missing v2 fields backfilled (`0.75 / 0 / 1`) by `migrateVoiceShape`.

## Auth + cloud sync

`AuthGate` wraps the app: bootstrapping → spinner; signed-out → `AuthScreen`; signed-in → workspace + `UserMenu`. No cloud env vars → local-only mode with a bottom banner. Full deploy stack is in `DEPLOYMENT.md`; threat model in `SECURITY.md`.

- **Allowlist.** Postgres trigger `enforce_allowlist` blocks signups not in `public.allowlist` (no client bypass). `on_allowlist_delete` sets `profiles.disabled_at` → app signs the user out on hydration; `on_allowlist_insert` clears it. Zapier syncs Skool events in.
- **Cloud sync** (`cloudSync.ts`). Pulls profile + all bank tables on sign-in. `bankStore` writes local first, then pushes the row. A failed/timed-out push (15s) is recorded in a persistent localStorage outbox (`ugc-lab:sync-outbox`) and replayed by `drainOutbox()` on startup + tab focus. **Hydrate is non-destructive:** a per-table fetch error keeps local rows (never `[]`), and outbox-pending rows are overlaid so an unsynced row survives a refresh.
- **Session freshness** (`supabase.ts`). Every cloud write awaits `ensureFreshSession()`, which races `getSession()` against a 3s timeout and falls back to a module-cached token (kept current by an `onAuthStateChange` listener) when the SDK's auth lock stalls after a backgrounded tab returns. The client also uses a custom `auth.lock` (`nonBlockingLock`, ~2s bound then runs unlocked) because supabase-js takes that lock on every request. `visibilitychange` recovers the token on focus.
- **kie.ai key is browser-local only.** Lives in `localStorage` under `ai-ugc-lab-settings`, never written to or read by Supabase/cloudSync. Users re-paste on each new browser. Deliberate trade-off: nothing in the DB ever holds the key.
- **Schema.** Bank tables are JSONB (id PK, user_id FK, project_ids[] GIN-indexed, data jsonb). RLS `auth.uid() = user_id` everywhere, admin bypass via `profiles.is_admin`. Admin app (Members + Allowlist) only renders for admins.

## Inter-app payloads

One-shot handoffs. Sender calls `sendToApp({ targetApp, targetField, data })`. Consumer reads `interAppPayload` in a `useEffect` keyed on `activeApp`, dispatches on `targetField`, then calls `consumePayload()`. Wired: Ad Analyzer → Scripts (transcript) / Bank (productId); Scripts → Voiceovers (script text); B-Roll Bank → Playground (`videoStartFrame` opens video mode with the still as start frame + prompt prefilled); Anywhere → Playground (`prompt`, `imageRef`, `videoStartFrame`).

## Recent changes

This file no longer keeps a changelog — read `git log` for history. Most recent coherent work: friendly, consistent end-user error copy via `utils/friendlyError.ts`, wired into every generation catch across the apps.

## When making changes

After non-trivial changes to behaviour, file structure, or the model lineup:

1. Keep this file accurate — it's both your guardrail and per-session context, so keep it **lean**. Don't add a changelog; that's what `git log` is for.
2. Update the model table when you register or remove a model.
