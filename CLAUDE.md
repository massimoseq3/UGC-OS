# CLAUDE.md — UGC OS

## Project Identity

You are building **UGC OS** — a browser-based YouTube-style workspace that unifies seven AI tools for UGC ad production into a single environment with shared data banks. Every AI call goes through **kie.ai** as a unified API gateway: one user-supplied Bearer key gives access to every model the app uses (chat, vision, image gen, video gen, TTS, music).

Sidebar is grouped into three sections (LIBRARY / CREATE / TOOLS). Display names match the section context — terse nouns, not action verbs:

| Section | Sidebar entry | Folder name (stable, do not rename) | Job |
|---|---|---|---|
| Library | Bank | `finder/` | Banks browser |
| Create | Characters | `character-studio/` | Form → portrait image. Drop a reference image on the controls panel (or anywhere in the app surface) to auto-fill every field via vision-based DNA extraction. |
| Create | Scripts | `script-architect/` | Winning ad + product → new script |
| Create | Voiceovers | `voice-studio/` | Script → audio (ElevenLabs v2) |
| Create | B-Roll | `broll-studio/` | Script → scenes → still images + video clips. Each scene yields 4 variations (Character Speaking, Literal/Action, Emotional/Reaction, Product/Detail). Every variation card has both Generate Image and Generate Video buttons. Top-of-tab settings cover image model + aspect + resolution and video model + aspect + duration + resolution + audio. Video gens are fire-and-forget with refresh-safe resume. |
| Tools | Ad Analyzer | `ad-anatomy/` | Ad image or video frame → scorecard + transcript + visual playbook |
| Tools | Playground | `playground/` | Free-form Image / Video / Music surface. Single prompt bar, mode tabs, model picker, optional ref slots + drag-drop. `@`-mentions reference Products / Characters / B-Rolls and auto-attach the asset. 6 curated UGC-ad preset cards (video mode). |

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
- **Shared state** = banks (Projects, Products, Models, Scripts, Voices, B-Rolls, voiceHistory, videoHistory, musicHistory) + settings + active app. Persisted to localStorage. Asset blobs (audio, image, video) live in IndexedDB via `assetStore` and mirror to Cloudflare R2 when cloud sync is active.
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

Four transport patterns — pick the right one per task type.

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

### 4. Suno music custom endpoint
Suno doesn't use `/jobs/createTask` either. It hits:
```
POST  https://api.kie.ai/api/v1/generate                              { prompt, customMode, instrumental, model, callBackUrl } → { data: { taskId } }
GET   https://api.kie.ai/api/v1/generate/record-info?taskId=…         → { data: { status, response: { sunoData[] }, errorCode, errorMessage } }
```
Helpers: `kieMusicGenerate`, `kieMusicPoll`, `runMusicTask`. Status values are Suno-specific (`PENDING` / `TEXT_SUCCESS` / `FIRST_SUCCESS` / `SUCCESS` / `GENERATE_AUDIO_FAILED` / `SENSITIVE_WORD_ERROR`). The variant (`V5` / `V5_5`) lives in the body's `model` field. `callBackUrl` is required by the schema but we pass a no-op and poll for results. Audio URLs land at `response.sunoData[].audioUrl` (up to 2 tracks per generation — v1 uses the first).

### File upload (when models need URLs, not base64)
Image-to-image and image/frame-conditioned video models accept *public URLs only*. `ensureHostedUrl(apiKey, source)` uploads any `data:` URI via `POST /api/file-base64-upload` and returns the `downloadUrl`. http(s) URLs pass through. Hosted files expire after 3 days.

### Connection test
`kieTestConnection(apiKey)` hits `GET /api/v1/chat/credit` and returns the remaining credit balance. Used by Settings.

## Models in use (defaults)

The full list lives in `src/utils/models.ts`. Defaults below; users can swap image and video models from the picker.

| Capability | Default | Notes |
|---|---|---|
| Text + vision | Gemini 3 Flash (`gemini-3-flash`) | Hard-coded across every text-using app — no picker |
| Image (text→image) | GPT Image 2 (`gpt-image-2-text-to-image`) — B-Roll + Characters | Picker also exposes Nano Banana 2, Flux 2 Pro, Seedream 5 Lite |
| Image (image→image) | GPT Image 2 Edit (`gpt-image-2-image-to-image`) — B-Roll + Characters | Used when reference images are present |
| Video | Seedance 2.0 (`bytedance/seedance-2`) in B-Roll | Picker exposes Seedance 2.0 Fast, Veo 3.1 Fast/Lite/Quality, Kling 3.0, Wan 2.7, Sora 2, Sora 2 Pro. B-Roll card defaults to Seedance 2.0 (ref-capable); the card modal opens on the Image tab |
| TTS | ElevenLabs Multilingual v2 (`elevenlabs/text-to-speech-multilingual-v2`) | Hard-coded — no picker; ~64-voice catalog grouped by category, slide-in picker |
| Music | Suno V5 (`suno-v5`) | Playground only. Picker also exposes Suno V5.5. v1 supports `customMode: false` (no lyrics/style/title/persona knobs) plus an instrumental toggle. |

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
Each video model declares `videoModes: VideoMode[]` + `videoConstraints` (allowed durations, resolutions, aspect ratios, audio support). The B-Roll tab and Playground both infer mode at generate time from which inputs are filled (`references → reference-to-video`, `start + end → frames-to-video`, `start only → image-to-video`, none → `text-to-video`). Constraint controls (aspect / duration / resolution / audio) snap to allowed values when the model changes.

### B-Roll: per-card video gen

Every variation card in the B-Roll tab has both **Generate Image** and **Generate Video** buttons. Video generations are fire-and-forget — each card carries its own `videoStatus: 'idle' | 'generating' | 'error'` plus a persisted `videoTaskId`, so multiple cards can be generating in parallel and the user can refresh mid-flight. The video service [`broll-studio/services/generateVideo.ts`](src/apps/broll-studio/services/generateVideo.ts) exposes `startVideoTask` (resolves frames → createTask / kieVeoCreate → returns `taskId`) and `finishVideoTask` (polls → downloads → saves asset). OutputPanel's resume-on-mount effect walks every card and resumes any still-pending video task; entries older than 30 min are evicted with an error chip + Reset slot link. Each card snapshots `mode / durationSeconds / resolution / audio / aspectRatio / sourceBRollId / videoEndpoint` alongside its `videoTaskId` so resumed history items are byte-identical to in-session ones. Top-of-tab controls (image model + aspect + resolution; video model + aspect + duration + resolution + audio) are global — one set per page, persisted per project.

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
│   ├── bankStore.ts            Projects + 6 banks + voiceHistory + videoHistory + musicHistory; autoProjectIds on add
│   ├── settingsStore.ts        kieApiKey, perAppModel, activeProjectId
│   ├── authStore.ts            Supabase session + profile row
│   └── appStore.ts             Active app, running apps, inter-app payload, sidebar collapsed
│
├── apps/
│   ├── finder/                 Banks browser + Projects tab
│   ├── character-studio/       Drag-photo DNA extraction built in
│   ├── broll-studio/           Unified B-Roll tab: 4 variations per scene (Speaking + Literal + Emotional + Product); per-card Generate Image + Generate Video with refresh-resume
│   ├── playground/             Free-form Image / Video / Music (PromptBar, PresetPicker, MentionPopover, PlaygroundHistoryGrid, service.ts)
│   ├── admin/                  Members + Allowlist; only shown when profiles.is_admin
│   └── [ad-anatomy, script-architect, voice-studio]
│
├── lib/                        supabase.ts, cloudSync.ts (pull + debounced diff-push), r2.ts
│
├── hooks/useAssetUrl.ts        Resolves asset:// refs to blob URLs
│
└── utils/
    ├── kie.ts                  4 transports + file upload (Suno is the 4th)
    ├── models.ts               Registry, buildImageInput/buildVideoInput/buildMusicInput, estimateCredits, getChatEndpointPath
    ├── assetStore.ts           IndexedDB + R2 mirror
    ├── friendlyError.ts        humanizeError(err, fallback) — raw kie errors → one plain-English line for end-user surfaces
    └── constants.ts            APP_REGISTRY, BANK_CONFIG

api/                            r2-sign.ts (Vercel Edge: Supabase JWT → 5-min presigned URLs), r2-delete.ts
supabase/migrations/0001_initial.sql           Tables, RLS, allowlist triggers
supabase/migrations/0003_music_history.sql    music_history table + RLS (mirrors video_history)
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
| `brolls` | `BRoll` | Saved from B-Roll cards. A record can carry both `imageUrl` (still) and `videos[]` (animations) — the Save button on a card appends to the source's `videos[]` when generating from a saved BRoll. Saved video-history items stamp `linkedBRollId` so the badge persists; deletion only purges the blob if not linked. |
| `voiceHistory` | `VoiceHistoryItem` | Auto-pushed on every Voiceovers generation |
| `videoHistory` | `VideoHistoryItem` | Auto-pushed on every B-Roll card video gen AND every Playground video gen — shared bank for refresh-resume, but Playground's history grid filters out entries with `sourceApp === 'broll-studio'` so B-Roll gens stay scoped to the B-Roll tab; 14-day retention |
| `musicHistory` | `MusicHistoryItem` | Auto-pushed on every Playground music generation. `audioRef` + optional `coverImageRef` are `asset://` ids; `instrumental`, `duration`, `title` are denormalized from `response.sunoData[0]` |
| `characterHistory` | `CharacterHistoryItem` | Auto-pushed on every Characters generation. Carries `imageRef` (asset://) + the full `profile` snapshot used to generate it. `linkedModelId` is set when the user saves the entry from the preview modal's "Save to Characters bank"; deletion only purges the blob when not `linkedModelId`. Presets are NOT a separate bank — to reuse an entire recipe, the user saves to the `models` bank and reloads via the Controls header's "Load Preset from Bank" dropdown. |

`VoicePreset` and `VoiceHistoryItem` carry the full Multilingual v2 parameter set: `voiceId`, `stability`, `similarityBoost`, `style`, `speed`. Legacy fields (`creativity`, `ambience`, `styleInstructions`) are stripped on load; missing v2 fields are backfilled with model defaults (`0.75 / 0 / 1`) — see `migrateVoiceShape` in `bankStore.ts`.

**Projects (multi-membership tagging).** All bank items + `VideoHistoryItem` + `MusicHistoryItem` carry an optional `projectIds?: string[]`. When `settingsStore.activeProjectId` is set, every `addProduct / Model / Script / Voice / BRoll / VideoHistory / MusicHistory` call auto-tags the new item via `autoProjectIds` in `bankStore.ts`. Deleting a project untags items from all banks but leaves them in place; if the deleted project was active, settings clears.

## Auth + cloud sync

`AuthGate` wraps the whole app. Bootstrapping → spinner; signed-out → `AuthScreen` (combined sign-in / sign-up); signed-in → workspace + `UserMenu` in sidebar bottom. When cloud env vars are absent, the app boots local-only with a small bottom banner.

- **Allowlist enforcement.** Postgres trigger `enforce_allowlist` on `auth.users` insert blocks signups not in `public.allowlist` — no client-side bypass. `on_allowlist_delete` sets `profiles.disabled_at`; on hydration the app checks this and signs the user out. `on_allowlist_insert` clears it. Zapier syncs Skool membership events into the table.
- **Cloud sync.** `src/lib/cloudSync.ts` pulls profile + all bank tables on sign-in. `bankStore` actions write local state first, then push the row to the cloud via `saveRow`/`deleteRow`. A push that fails or times out (15s, see `bankStore.ts`) is recorded in a **persistent localStorage outbox** (`ugc-lab:sync-outbox`) and replayed by `drainOutbox()` on startup and on tab focus — so a transient cloud stall can't silently drop a row. **Hydrate is non-destructive:** a per-table fetch error keeps the existing local rows (never replaces with `[]`), and outbox-pending rows are overlaid (`applyOutbox`) so an unsynced row survives a refresh. `bankStore`/`settingsStore` stay localStorage-backed — cloudSync is a bridge. First-cloud-login uploads any pre-existing local snapshot once (gated by `ugc-lab:cloud-migrated:<userId>`).
- **Session freshness.** Every cloud write awaits `ensureFreshSession()` in `src/lib/supabase.ts`. It races Supabase `getSession()` against a 3s timeout and falls back to a module-cached access token (kept current by an `onAuthStateChange` listener) when the SDK's auth lock stalls — which it can after a backgrounded tab returns. The Supabase client is also built with a custom `auth.lock` (`nonBlockingLock`) that bounds `navigator.locks` acquisition to ~2s and runs unlocked on timeout — supabase-js takes that lock internally to attach the auth header on **every** request, so without this an upsert hangs to the full 15s even though our explicit `ensureFreshSession()` returned. The `visibilitychange` handler calls `ensureFreshSession()` to recover the token proactively on tab focus.
- **Orphan asset sweep.** `src/utils/orphanCleanup.ts` purges `assets` rows not referenced by any local bank. Its bank list is built with `satisfies Record<BankKey, true>` so it **must** include every bank — a missing key would classify that bank's assets as orphans and delete them (IndexedDB + R2) on the next sign-in. This bit `imageHistory`/`musicHistory` and then `characterHistory` historically; the compile-time guard now prevents drift.
- **Assets.** `assetStore.saveAsset()` mirrors to R2 fire-and-forget via `src/lib/r2.ts`; `getBlob()` falls back to R2 when IndexedDB misses. Uploads go through `/api/r2-sign` (Vercel Edge) which verifies the Supabase JWT and mints 5-minute presigned URLs scoped to `auth/<userId>/<assetId>`. Bank rows don't know R2 exists — `asset-…` ids are stable.
- **Schema.** Bank tables are JSONB-backed (id PK, user_id FK, project_ids[] GIN-indexed, data jsonb). RLS `auth.uid() = user_id` everywhere, with admin bypass via `profiles.is_admin`. `member_storage` view aggregates `assets.byte_size` per user. Bootstrap admin via `select public.bootstrap_admin('email');`.
- **Admin app.** Sidebar entry shown only when `profiles.is_admin`. Tabs: Members (storage, last active, disable/re-enable) + Allowlist (manual add/remove).
- **kie.ai key is browser-local only.** The Bearer key lives in `localStorage` under `ai-ugc-lab-settings`. It is never written to Supabase and is never read by `cloudSync`. `saveProfile` only pushes `per_app_model`; `hydrateFromCloud` only reads `per_app_model`. Users re-paste on each new browser. Deliberate security trade-off: nothing in the database (or its backups) ever holds the key.

Full deploy stack (Vercel + Supabase + R2 + Zapier) is in `DEPLOYMENT.md`.

## Inter-app payloads

One-shot handoffs. Sender calls `sendToApp({ targetApp, targetField, data })`. Consumer reads `interAppPayload` in a `useEffect` keyed on `activeApp`, dispatches on `targetField`, then calls `consumePayload()`.

Wired today:
- Ad Analyzer → Scripts (winning transcript / reconstruction prompt)
- Ad Analyzer → Bank (productId)
- Scripts → Voiceovers (script text)
- B-Roll Bank → Playground (`videoStartFrame` carries `{ imageUrl, prompt }`; opens Playground in video mode with the still pre-loaded as start frame and the prompt prefilled)
- Anywhere → Playground (`prompt` prefill, `imageRef` as a ref slot, `videoStartFrame` as the start-frame slot + mode switch; accepts both bare data-URI strings and `{ imageUrl, prompt }` object form)

## Recent changes

Last 2–3 coherent bodies of work. Older history lives in `git log` — read it there, not here.

- **Friendly, consistent error copy across every generation surface.** Users were forwarding raw kie.ai errors (e.g. a Veo HTTP 400 "The Google model was unable to generate audio for this request") as support questions. Root cause of *that specific* error is a Google/Veo model-side limitation, not our code — we don't even send an audio flag to Veo (`buildVideoInput`'s Veo branch omits it; Veo generates audio natively), and failed rows bill 0 credits. Fix is a presentation-layer one: new [`src/utils/friendlyError.ts`](src/utils/friendlyError.ts) exports `humanizeError(err, fallback)`, a single ordered rule-table that maps raw messages → one actionable sentence (Veo audio, content-filter/sensitive-word, 401 key, 402 credits, 433 usage cap, 429 rate-limit, 455/maintenance, 5xx, timeouts, network, empty/malformed responses, 422 validation); unrecognized → caller's fallback. Wired into **every end-user generation catch** across voice-studio, script-architect, character-studio (incl. DNA extract + bank-save modals), broll-studio (`BrollStudio`, `ScenesView` resume, `VariationCard` enhance/regen/image/video, `CardDetailModal` save/copy), playground (`Playground` gen + resume, `PlaygroundHistoryGrid` save), ad-anatomy (`analysisQueue`), and finder (`ProductForm` extract). **Deliberately NOT touched:** infra/admin/Settings surfaces (`stores/*`, `lib/*`, `assetStore`, `admin/*`, `SettingsModal`) still show raw `err.message`/`String(e)` — the operator debugs there and in kie.ai's request logs. This reverses the old "always surface raw kie text to users" rule for end-user surfaces only (see the Errors section).
- **Scripts/B-Roll quality pass: smart save names, Clear buttons, B-Roll video references + sound.** Four UX fixes. **(1) Script save naming:** "Save to bank" in Scripts used to prefill the title with the variation *angle* ("Hook-led variation"). [`OutputPanel.tsx`](src/apps/script-architect/components/OutputPanel.tsx) now derives the prefill from the script content via the existing `deriveTitleFromContent(text, fallback)` helper for all branches (the on-screen card heading still shows the angle). The helper gained a configurable fallback and now strips leading bracketed section labels like `[HOOK]`. **(2) Clear buttons:** Scripts and B-Roll output areas have an `X`-icon "Clear" button that resets to a true blank slate — both the output AND the inputs/references (Scripts: `variations`/`error`/`activeHistoryId` + transcript/reversePrompt/product/context; B-Roll: `result`+`cardStates`+`sessionId`→`''` + product/model/script/scriptText/context). Resetting `sessionId` to `''` preserves the prior session's `brollHistory` row (the debounced upsert effect early-returns on null result). History tabs are untouched — scope is these two tabs only (per user). **(3) B-Roll video ignored references:** Generate Video on a card with a Character/Product selected produced a random person because the chosen model (e.g. Veo 3.1 Lite) lacks `reference-to-video`, so `runVideoTask` in [`VariationCard.tsx`](src/apps/broll-studio/components/VariationCard.tsx) dropped the refs and fell back to text-to-video. Fix is **warn-don't-switch** (per user): the B-Roll video default is **Seedance 2.0** (`bytedance/seedance-2`, ref-capable) so refs work out of the box; `runVideoTask` keeps the drop-refs→text-to-video fallback with a clear toast (`"{model} doesn't support reference images — generating text-to-video only."`) and does **not** silently swap models. The video [`ModelPicker`](src/components/ModelPicker.tsx) gained a `requireMode` prop that **mutes** (dims, still selectable) models lacking that mode plus a `requireModeNote` footer line; [`CardDetailModal.tsx`](src/apps/broll-studio/components/CardDetailModal.tsx) passes them only while a reference is armed (`hasActiveRef`), and shows an amber sentence under Reference Images when the selected model can't take refs ("…will generate text-to-video only"). The footer steers users to the Image tab (still frames) + Playground (start/end frames) for non-ref models. Reference-capable video models: `veo3_fast`, `bytedance/seedance-2`, `bytedance/seedance-2-fast`. **(4) Video had no sound:** the modal's `VideoTile` `<video>` was hard-coded `muted`. It now binds `muted={!unmuted}`, unmutes on explicit Play (a user gesture) in `togglePlay`, and has a `Volume2`/`VolumeX` toggle. Hover-autoplay previews stay muted. **(5) Follow-up — orphan sweep purged B-Roll history media:** after Clear, reopening a B-Roll session from History showed perpetual loading spinners — the once-per-sign-in orphan sweep ([`orphanCleanup.ts`](src/utils/orphanCleanup.ts) → `findOrphanAssets`) only counted asset refs from cloud `BankKey`s, but `brollHistory` (and `scriptHistory`) are **local-only banks**, not cloud BankKeys, so the guarded `satisfies Record<BankKey, true>` list never covered them. B-Roll card images live only in `brollHistory` (videos survived because they're also in the cloud `videoHistory` bank), so they were classed as orphans and deleted (IDB + R2 + assets row). Fix adds a `LOCAL_BANK_KEYS = ['brollHistory','scriptHistory']` walk in `findOrphanAssets` so on-device history refs are counted. (Cross-device is still a known limit — `brollHistory` isn't cloud-synced, so its assets can orphan on a fresh device.)
- **Cloud-sync data loss + stale-session generation failures.** Two related bugs with one root cause in the sync plumbing. **(1) Vanishing saves:** a character generated, "Save to bank" hung 15s with a "saved on this device but not synced" toast, and after a refresh the tile was *gone*. **(2) "Generation fails until I refresh":** after a tab sat backgrounded a while, generations failed; a refresh fixed it. Root cause: every cloud write awaits [`ensureFreshSession()`](src/lib/supabase.ts) → Supabase `getSession()`, whose auth lock can **stall** after a backgrounded tab returns, pinning writes until their 15–60s timeouts (bug 2). When the bank push timed out the row stayed local-only, then [`hydrateFromCloud`](src/lib/cloudSync.ts) **unconditionally replaced** local state with the cloud's (which lacked the row) on refresh — wiping it (bug 1). A third path: on a per-table fetch error, hydrate fell back to `[]` and wiped that bank. **Fix, three layers:** (a) [`ensureFreshSession`](src/lib/supabase.ts) now races `getSession()` against a 3s timeout and falls back to a module-cached token (kept current by a local `onAuthStateChange` listener — no `authStore` import cycle); the `visibilitychange` handler calls it to recover the token on focus. (b) A persistent localStorage **outbox** (`ugc-lab:sync-outbox`) in [`cloudSync.ts`](src/lib/cloudSync.ts) records every push before it's attempted (`recordPendingUpsert`/`recordPendingDelete`, cleared on success in [`bankStore.ts`](src/stores/bankStore.ts)'s `pushRow`/`dropRow`); `drainOutbox()` replays failures on startup + tab focus. (c) [`hydrateFromCloud`](src/lib/cloudSync.ts) is now non-destructive — keeps local rows on a fetch error and overlays the outbox (`applyOutbox`) so an unsynced row survives a refresh. Timeout toast copy softened to "will retry syncing automatically." **Round 2** (the row fix above wasn't enough — the *image* still vanished while the row survived, showing as a blank bank card): (1) [`orphanCleanup.ts`](src/utils/orphanCleanup.ts)'s `BANK_KEYS` was missing `characterHistory`/`adAnatomyHistory`, so the once-per-login orphan sweep deleted a generated character's asset blob from IndexedDB + R2 — rebuilt the list with a `satisfies Record<BankKey, true>` compile-time guard. (2) The 15s save hang was the supabase-js `navigator.locks` deadlock (not the user's SQL — RLS is non-recursive); [`supabase.ts`](src/lib/supabase.ts) now passes a custom `auth.lock` (`nonBlockingLock`, ~2s bound then runs unlocked). No app/UI changes.
## When making changes

After any non-trivial change to behaviour, file structure, or model lineup:

1. Update this file (`CLAUDE.md`) so future-Claude has accurate context.
2. Update `AI_UGC_Lab_OS_Spec.md` (product spec, project root) when feature-level intent changes — not for every refactor.
3. Update the model table above if you register or remove a model.
4. Update **Recent changes** for coherent bodies of work — keep it to the last 2–3 entries. Drop the oldest when you add a new one. Anything older lives in `git log`.

The user has explicitly asked for these docs to stay in sync with reality.
