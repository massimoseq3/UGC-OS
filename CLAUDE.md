# CLAUDE.md — UGC Lab

## Project Identity

You are building **UGC Lab** — a browser-based YouTube-style workspace that unifies six AI tools for UGC ad production into a single environment with shared data banks. Every AI call goes through **kie.ai** as a unified API gateway: one user-supplied Bearer key gives access to every model the app uses (chat, vision, image gen, video gen, TTS).

Sidebar is grouped into three sections (LIBRARY / CREATE / TOOLS). Display names match the section context — terse nouns, not action verbs:

| Section | Sidebar entry | Folder name (stable, do not rename) | Job |
|---|---|---|---|
| Library | Bank | `finder/` | Banks browser |
| Create | Characters | `character-studio/` | Form → portrait image. Drop a reference image on the controls panel (or anywhere in the app surface) to auto-fill every field via vision-based DNA extraction. |
| Create | Scripts | `script-architect/` | Winning ad + product → new script |
| Create | Voiceovers | `voice-studio/` | Script → audio (ElevenLabs v2) |
| Create | B-Roll Images | `broll-studio/` | Script → scenes → still images |
| Create | B-Roll Videos | `video-studio/` | Prompt + optional start/end frames + optional reference images → b-roll video. Inputs are revealed by the selected model's capabilities (no mode toggle); frame slots accept Upload or Pick from B-Roll Bank. Four parallel slots — see B-Roll Videos: 4-slot model below. |
| Tools | Ad Analyzer | `ad-anatomy/` | Ad image or video frame → scorecard + transcript + visual playbook |

Folder names and the `id` strings in `src/utils/constants.ts` are stable on purpose — they're used in localStorage keys for per-app model selections.

## Role

Senior frontend engineer + product architect. Push back when something's flawed. Ask for context (kie doc URLs, exact error text) before guessing. Prefer the boring, debuggable solution.

## Core Rules

### Code philosophy
- Simple > clever. Obvious > terse.
- Components small, single-purpose. Names say what they do.
- No premature optimisation.
- Comments only for *why* the code looks the way it does, not *what* it does.

### Architecture
- **Self-contained apps.** Each app under `src/apps/<name>/` owns its types, components, and service. Cross-app communication goes through the bank store (persistent state) or the inter-app payload (one-shot handoffs).
- **Shared state** = banks (Projects, Products, Models, Scripts, Voices, B-Rolls, voiceHistory, videoHistory) + settings + active app. Persisted to localStorage. Asset blobs (audio, image, video) live in IndexedDB via `assetStore` and mirror to Cloudflare R2 when cloud sync is active.
- **No prop drilling.** Zustand stores for global state. Local React state for ephemeral UI.
- **Model registry is single source of truth.** Add or change a model only by editing `src/utils/models.ts`. Don't sprinkle slugs through service files.

### Styling
- Tailwind only. No CSS modules, no styled-components.
- Dark-first. Backgrounds `#050505`–`#0A0A0A`. Borders `white/5`–`white/10`. Glass via `backdrop-blur-xl`.
- Tracking-tight on most text. Transitions 200–300 ms ease-out for panels, 150 ms for hover.
- Tags use `TAG_STYLES` from `models.ts` (Recommended green / New fuchsia / Fast sky / Cheap zinc).

### Errors
- Surface raw kie.ai response shape on failures. Don't wrap them in friendly text — the user has explicitly asked to see the underlying error.
- The chat completions parser falls back to JSON parsing if SSE produces nothing, then surfaces the body's first 400 chars in the thrown error.
- The kie envelope can return `{ code: 5xx, msg: "...maintained..." }` inside an HTTP 200 — common during kie's maintenance windows. Not a code bug.

## Tech Stack

- React 18 + TypeScript + Vite (`npm run dev` → http://localhost:5173)
- Tailwind CSS 4
- Zustand for global state
- IndexedDB (`assetStore.ts`) for blobs, with Cloudflare R2 mirror when cloud sync is active
- localStorage for bank metadata, settings, picker selections, sidebar collapsed state
- **Cloud (opt-in)**: Supabase (auth + Postgres) for per-user state, Cloudflare R2 for assets. Enabled when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set; absent → local-only mode (original 100% client-side behaviour). Access gated by email allowlist synced from Skool via Zapier.
- kie.ai Bearer token sent directly from the client (no proxy).

## kie.ai client (`src/utils/kie.ts`)

Three transport patterns — pick the right one per task type.

### 1. Async task (image, video createTask flow, TTS)
```
POST  https://api.kie.ai/api/v1/jobs/createTask    { model, input } → { data: { taskId } }
GET   https://api.kie.ai/api/v1/jobs/recordInfo?taskId=…           → { data: { state, resultJson, ... } }
```
Helpers: `runTask`, `kieImageGenerate`, `kieVideoGenerate`, `kieTTS`, `parseResult`. Result URLs land in `resultJson.resultUrls` (string-encoded JSON inside the envelope). Outputs auto-expire in 3 days; always `downloadAsBase64` + `saveAsset` so user banks survive.

### 2. OpenAI-compatible chat completions (text, vision)
```
POST  https://api.kie.ai/<model-slug>/v1/chat/completions
```
Streaming SSE by default (`stream: true`). The helper accumulates `delta.content`, falls back to JSON parse if the server returned a single envelope. Vision via `image_url` content blocks; data URIs work — no upload needed.

Helper: `kieChatCompletions(apiKey, endpointPath, messages, opts)`. The endpoint path comes from `getChatEndpointPath()` in `models.ts` so callers don't hardcode slugs.

### 3. Veo custom endpoint
Veo 3.1 family doesn't use `/jobs/createTask`. It hits:
```
POST  https://api.kie.ai/api/v1/veo/generate
GET   https://api.kie.ai/api/v1/veo/record-info?taskId=…
```
Helper: `kieVeoGenerate(apiKey, body, opts)`. Variant (`veo3` / `veo3_fast` / `veo3_lite`) is selected via the `model` field in the body, not the URL. Result URLs nest under `response.resultUrls` (not flat).

### File upload (when models need URLs, not base64)
Image-to-image and image/frame-conditioned video models accept *public URLs only*. `ensureHostedUrl(apiKey, source)` uploads any `data:` URI via `POST /api/file-base64-upload` and returns the `downloadUrl`. http(s) URLs pass through. Hosted files expire after 3 days.

### Connection test
`kieTestConnection(apiKey)` hits `GET /api/v1/chat/credit` and returns the remaining credit balance. Used by Settings.

## Models in use (defaults)

The full list lives in `src/utils/models.ts`. Defaults below; users can swap image and video models from the picker.

| Capability | Default | Notes |
|---|---|---|
| Text + vision | Gemini 3 Flash (`gemini-3-flash`) | Hard-coded across every text-using app — no picker |
| Image (text→image) | GPT Image 2 (`gpt-image-2-text-to-image`) | Picker also exposes Nano Banana 2, Flux 2 Pro, Seedream 5 Lite |
| Image (image→image) | GPT Image 2 Edit (`gpt-image-2-image-to-image`) | Used by B-Roll when reference images are present |
| Video | Veo 3.1 Fast (`veo3_fast`) | Picker exposes Seedance 2.0, Seedance 2.0 Fast, Kling 3.0, Veo 3.1 Lite/Quality, Wan 2.7, Sora 2, Sora 2 Pro |
| TTS | ElevenLabs Multilingual v2 (`elevenlabs/text-to-speech-multilingual-v2`) | Hard-coded — no picker; ~64-voice catalog grouped by category, slide-in picker |

### Pricing model

Each `ModelEntry` declares `pricing.credits` (flat per-unit) plus an optional `priceFor(opts)` callback for models with multi-dimensional pricing (Kling: resolution × audio; Veo: per-resolution per-call rates; Sora 2/Pro: per (duration, resolution)). `estimateCredits(modelId, params)` and `formatCredits` are the only public APIs callers need. USD values are not stored — kie.ai is credit-based and we don't show dollars anywhere.

Some video models are billed **per call** (`unit: 'per-call'`), not per second — Veo 3.1 (all variants), Sora 2, Sora 2 Pro. Their `videoConstraints.durations` is `[]` so the UI hides the duration toggle; `buildVideoInput`'s branch for each omits duration.

### Video modes

```ts
type VideoMode =
  | 'text-to-video'
  | 'image-to-video'        // single first frame
  | 'frames-to-video'       // start frame + end frame
  | 'reference-to-video'    // up to 9 reference images (Seedance) / 3 (Veo Fast)
```
Each video model declares `videoModes: VideoMode[]` + `videoConstraints` (allowed durations, resolutions, aspect ratios, audio support). B-Roll Videos doesn't show a mode toggle — start frame, end frame, and reference image slots reveal based on the selected model's capabilities, and the mode is **inferred at generate time** from which slots are filled (`references → reference-to-video`, `start + end → frames-to-video`, `start only → image-to-video`, none → `text-to-video`). Constraint controls (aspect / duration / resolution / audio) snap to allowed values when the model changes.

### B-Roll Videos: 4-slot model

VideoStudio runs 4 independent slots. Each owns its full input set + a transient `status: 'idle' | 'generating' | 'error'`. Generate is fire-and-forget — pushes an `InFlightGen` into `inFlight[]` and returns, so the user can switch slots and start more in parallel. History tab (default) renders `InFlightTile` skeletons that swap to real `VideoHistoryItem`s on completion; auto-promote to Preview only if the user is still viewing the originating slot. `VideoHistoryItem.sourceBRollId` carries the frame source across slot switches so save-linkage survives. ModelPicker is per-slot via `value` + `onChange` (still writes through `setAppModel`).

### Per-model body shaping

`buildImageInput(modelId, opts)` and `buildVideoInput(modelId, opts)` in `models.ts` produce the correct request body for each model. Callers pass a uniform options object; the builders handle field-name differences (Seedance `first_frame_url` vs Kling `image_urls[]` vs Veo `imageUrls`).

## File structure

Files with non-obvious behaviour — others are self-explanatory.

```
src/
├── App.tsx                     Wraps app in <AuthGate>; remounts on user change via key={userId}
│
├── components/
│   ├── Sidebar.tsx             Sections, admin entry (gated), UserMenu chip at bottom
│   ├── ModelPicker.tsx         Provider avatars, $-tier badges, ★ recommended, inline credit estimate
│   ├── BankPicker.tsx          Sliding panel; brolls support + optional multiSelect
│   ├── ProjectSwitcher.tsx     Header chip; sets activeProjectId
│   ├── ResolutionToggle.tsx    1K/2K/4K gated by imageConstraints.resolutions
│   ├── auth/                   AuthGate, AuthScreen, UserMenu
│   └── video/                  VideoInputSlot (Upload | Pick from Bank), VideoRefStrip
│
├── stores/
│   ├── bankStore.ts            Projects + 6 banks + voiceHistory + videoHistory; autoProjectIds on add
│   ├── settingsStore.ts        kieApiKey, perAppModel, activeProjectId
│   ├── authStore.ts            Supabase session + profile row
│   └── appStore.ts             Active app, running apps, inter-app payload, sidebar collapsed
│
├── apps/
│   ├── finder/                 Banks browser + Projects tab
│   ├── character-studio/       Drag-photo DNA extraction built in
│   ├── video-studio/           4-slot Video Studio (VideoStudio.tsx + components/VideoHistoryGrid.tsx)
│   ├── admin/                  Members + Allowlist; only shown when profiles.is_admin
│   └── [ad-anatomy, script-architect, voice-studio, broll-studio]
│
├── lib/                        supabase.ts, cloudSync.ts (pull + debounced diff-push), r2.ts
│
├── hooks/useAssetUrl.ts        Resolves asset:// refs to blob URLs
│
└── utils/
    ├── kie.ts                  3 transports + file upload
    ├── models.ts               Registry, buildImageInput/buildVideoInput, estimateCredits, getChatEndpointPath
    ├── assetStore.ts           IndexedDB + R2 mirror
    └── constants.ts            APP_REGISTRY, BANK_CONFIG

api/                            r2-sign.ts (Vercel Edge: Supabase JWT → 5-min presigned URLs), r2-delete.ts
supabase/migrations/0001_initial.sql   Tables, RLS, allowlist triggers
```

## Banks

Persisted to `localStorage` under `ai-ugc-lab-banks`. Asset blobs live in IndexedDB via `assetStore` (mirrored to R2 in cloud mode); the bank stores `asset://<id>` refs. `useAssetUrl(ref)` turns a ref into a blob URL.

| Bank | Type (in `stores/types.ts`) | Source |
|---|---|---|
| `projects` | `Project` | Created from header `ProjectSwitcher` or Finder's Projects tab |
| `products` | `Product` | Manually added in Finder |
| `models` | `Model` | Saved from Characters output |
| `scripts` | `Script` | Saved from Scripts output |
| `voices` | `VoicePreset` | Saved from Voiceovers history |
| `brolls` | `BRoll` | Saved from B-Roll Images + B-Roll Videos. A record can carry both `imageUrl` (still) and `videos[]` (animations) — B-Roll Videos appends to the source's `videos[]` when generating from a bank still. Saved video-history items stamp `linkedBRollId` so the badge persists; deletion only purges the blob if not linked. |
| `voiceHistory` | `VoiceHistoryItem` | Auto-pushed on every Voiceovers generation |
| `videoHistory` | `VideoHistoryItem` | Auto-pushed on every B-Roll Videos generation; 14-day retention |

`VoicePreset` and `VoiceHistoryItem` carry the full Multilingual v2 parameter set: `voiceId`, `stability`, `similarityBoost`, `style`, `speed`. Legacy fields (`creativity`, `ambience`, `styleInstructions`) are stripped on load; missing v2 fields are backfilled with model defaults (`0.75 / 0 / 1`) — see `migrateVoiceShape` in `bankStore.ts`.

**Projects (multi-membership tagging).** All bank items + `VideoHistoryItem` carry an optional `projectIds?: string[]`. When `settingsStore.activeProjectId` is set, every `addProduct / Model / Script / Voice / BRoll / VideoHistory` call auto-tags the new item via `autoProjectIds` in `bankStore.ts`. Deleting a project untags items from all banks but leaves them in place; if the deleted project was active, settings clears.

## Auth + cloud sync

`AuthGate` wraps the whole app. Bootstrapping → spinner; signed-out → `AuthScreen` (combined sign-in / sign-up); signed-in → workspace + `UserMenu` in sidebar bottom. When cloud env vars are absent, the app boots local-only with a small bottom banner.

- **Allowlist enforcement.** Postgres trigger `enforce_allowlist` on `auth.users` insert blocks signups not in `public.allowlist` — no client-side bypass. `on_allowlist_delete` sets `profiles.disabled_at`; on hydration the app checks this and signs the user out. `on_allowlist_insert` clears it. Zapier syncs Skool membership events into the table.
- **Cloud sync.** `src/lib/cloudSync.ts` pulls profile + all 8 bank tables on sign-in and replaces local state, then subscribes to `bankStore` + `settingsStore` and diff-pushes (debounced 300ms, per-bank upserts/deletes). `bankStore`/`settingsStore` stay localStorage-backed — cloudSync is a bridge. First-cloud-login uploads any pre-existing local snapshot once (gated by `ugc-lab:cloud-migrated:<userId>`).
- **Assets.** `assetStore.saveAsset()` mirrors to R2 fire-and-forget via `src/lib/r2.ts`; `getBlob()` falls back to R2 when IndexedDB misses. Uploads go through `/api/r2-sign` (Vercel Edge) which verifies the Supabase JWT and mints 5-minute presigned URLs scoped to `auth/<userId>/<assetId>`. Bank rows don't know R2 exists — `asset-…` ids are stable.
- **Schema.** Bank tables are JSONB-backed (id PK, user_id FK, project_ids[] GIN-indexed, data jsonb). RLS `auth.uid() = user_id` everywhere, with admin bypass via `profiles.is_admin`. `member_storage` view aggregates `assets.byte_size` per user. Bootstrap admin via `select public.bootstrap_admin('email');`.
- **Admin app.** Sidebar entry shown only when `profiles.is_admin`. Tabs: Members (storage, last active, disable/re-enable) + Allowlist (manual add/remove).

Full deploy stack (Vercel + Supabase + R2 + Zapier) is in `DEPLOYMENT.md`.

## Inter-app payloads

One-shot handoffs. Sender calls `sendToApp({ targetApp, targetField, data })`. Consumer reads `interAppPayload` in a `useEffect` keyed on `activeApp`, dispatches on `targetField`, then calls `consumePayload()`.

Wired today:
- Ad Analyzer → Scripts (winning transcript / reconstruction prompt)
- Ad Analyzer → Bank (productId)
- Scripts → Voiceovers (script text)
- B-Roll Images → B-Roll Videos (still as start frame; consumer drops directly into the start-frame slot)

## Recent changes

Last 2–3 coherent bodies of work. Older history lives in `git log` — read it there, not here.

- **Cloud-deployable, Skool-gated multi-tenant.** App is now deployable on Vercel with Supabase (auth + Postgres) for per-user state and Cloudflare R2 for asset blobs. Access gated by an email allowlist enforced by a Postgres trigger and synced from Skool via Zapier. Local-only mode preserved when env vars are absent. See **Auth + cloud sync** for the runtime shape and `DEPLOYMENT.md` for the deploy stack.
- **B-Roll Videos: 4 parallel slots.** VideoStudio rebuilt around a 4-slot model so users can fire multiple generations in parallel without blocking. History tab is the default right-panel tab and renders in-flight tile skeletons that swap to real `VideoHistoryItem`s on completion. `VideoHistoryItem.sourceBRollId` keeps save-linkage stable across slot switches. See **B-Roll Videos: 4-slot model** for the runtime shape.
- **Projects + per-slot pricing fixes.** New `projects` bank + `activeProjectId` setting + multi-membership tagging across all banks and `videoHistory`. Pricing re-audited against kie.ai/pricing: Veo 3.1 / Sora 2 / Sora 2 Pro are billed per-video (not per-second) with `unit: 'per-call'` and `priceFor` keyed on resolution (and duration for Sora). Wan 2.7 corrected to 16/24 cr/s; audio support removed.

## When making changes

After any non-trivial change to behaviour, file structure, or model lineup:

1. Update this file (`CLAUDE.md`) so future-Claude has accurate context.
2. Update `AI_UGC_Lab_OS_Spec.md` (product spec, project root) when feature-level intent changes — not for every refactor.
3. Update the model table above if you register or remove a model.
4. Update **Recent changes** for coherent bodies of work — keep it to the last 2–3 entries. Drop the oldest when you add a new one. Anything older lives in `git log`.

The user has explicitly asked for these docs to stay in sync with reality.
