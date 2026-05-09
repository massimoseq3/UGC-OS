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
| Create | B-Roll Videos | `video-studio/` | Prompt + optional start/end frames + optional reference images → b-roll video. Inputs are revealed by the selected model's capabilities (no mode toggle); frame slots accept Upload or Pick from B-Roll Bank. |
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
- **Shared state** = banks (Products, Models, Scripts, Voices, B-Rolls, voiceHistory) + settings + active app. Persisted to localStorage. Asset blobs (audio, image, video) live in IndexedDB via `assetStore`, not localStorage.
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

- React 18 + TypeScript
- Vite (`npm run dev` → http://localhost:5173)
- Tailwind CSS 4
- Zustand for global state
- IndexedDB (`assetStore.ts`) for blobs
- localStorage for everything else (bank metadata, settings, picker selections, sidebar collapsed state)
- No backend. Bearer token sent directly from the client to kie.ai.

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
Helper: `kieVeoGenerate(apiKey, body, opts)`. Variant (`veo3` / `veo3_fast` / `veo3_lite`) is selected via the `model` field in the body, not the URL.

### File upload (when models need URLs, not base64)
Image-to-image and image/frame-conditioned video models accept *public URLs only*. `ensureHostedUrl(apiKey, source)` uploads any `data:` URI via `POST /api/file-base64-upload` and returns the `downloadUrl`. http(s) URLs pass through. Hosted files expire after 3 days.

### Connection test
`kieTestConnection(apiKey)` hits `GET /api/v1/chat/credit` and returns the remaining credit balance. Used by Settings.

## Models in use (defaults)

The full list lives in `src/utils/models.ts`. Defaults below; users can swap image and video models from the picker.

| Capability | Default | Notes |
|---|---|---|
| Text + vision | Gemini 3 Flash (`gemini-3-flash`) | Hard-coded across every text-using app — no picker |
| Image (text→image) | GPT Image 2 (`gpt-image-2-text-to-image`) | Picker also exposes Nano Banana 2, Flux 2 Pro, SeeDream 5 Lite, Imagen 4 |
| Image (image→image) | GPT Image 2 Edit (`gpt-image-2-image-to-image`) | Used by B-Roll when reference images are present |
| Video (4 modes) | Seedance 2.0 (`bytedance/seedance-2`) | Picker exposes Seedance 2.0 Fast, Kling 3.0, Veo 3.1 Fast/Lite/Quality |
| TTS | ElevenLabs Multilingual v2 (`elevenlabs/text-to-speech-multilingual-v2`) | Hard-coded — no picker; ~64-voice catalog grouped by category, slide-in picker |

### Pricing model

Each `ModelEntry` declares `pricing.credits` (flat per-unit) plus an optional `priceFor(opts)` callback for models with multi-dimensional pricing (Kling: resolution × audio; Veo Quality: 4K is 2× others). `estimateCredits(modelId, params)` and `formatCredits` are the only public APIs callers need.

USD values are **not** stored — kie.ai is credit-based and we don't show dollars anywhere.

### Video modes

```ts
type VideoMode =
  | 'text-to-video'
  | 'image-to-video'        // single first frame
  | 'frames-to-video'       // start frame + end frame
  | 'reference-to-video'    // up to 9 reference images (Seedance) / 3 (Veo Fast)
```
Each video model declares `videoModes: VideoMode[]` + `videoConstraints` (allowed durations, resolutions, aspect ratios, audio support). B-Roll Videos doesn't show a mode toggle — start frame, end frame, and reference image slots reveal based on the selected model's capabilities, and the mode is **inferred at generate time** from which slots are filled (`references → reference-to-video`, `start + end → frames-to-video`, `start only → image-to-video`, none → `text-to-video`). Constraint controls (aspect / duration / resolution / audio) snap to allowed values when the model changes.

### Per-model body shaping

`buildImageInput(modelId, opts)` and `buildVideoInput(modelId, opts)` in `models.ts` produce the correct request body for each model. Callers pass a uniform options object; the builders handle the field-name differences (Seedance `first_frame_url` vs Kling `image_urls[]` vs Veo `imageUrls`).

## File structure

```
src/
├── App.tsx                        # Shell: menu bar + sidebar + active app
├── main.tsx                       # Entry point
├── index.css                      # Tailwind + scrollbar styles
│
├── components/                    # Shared UI
│   ├── MenuBar.tsx                # Top bar: hamburger + UGC Lab wordmark
│   ├── Sidebar.tsx                # Left nav (collapsible). Replaced the old Dock.
│   ├── BankPicker.tsx             # Universal sliding panel for selecting bank items (supports brolls + multiSelect)
│   ├── BankItemCard.tsx           # Reusable card for displaying bank items (incl. BRoll variant)
│   ├── ModelPicker.tsx            # Dropdown with credit estimate inline
│   ├── SettingsModal.tsx          # kie.ai API key + Test connection
│   ├── GenerationProgress.tsx     # Loading bar with percent (no seconds)
│   ├── Toast.tsx                  # Confirmation toasts
│   └── video/
│       ├── VideoInputSlot.tsx     # Frame slot (Upload | Pick from Bank); used for start/end frames
│       └── VideoRefStrip.tsx      # Reference-images grid with multi-select Bank picker
│
├── stores/
│   ├── bankStore.ts               # Banks + voiceHistory (one-shot v3 voice migration on load)
│   ├── appStore.ts                # Active app, running apps, inter-app payload, sidebar collapsed
│   ├── settingsStore.ts           # kieApiKey + perAppModel selections
│   └── types.ts                   # Bank type definitions
│
├── apps/
│   ├── finder/                    # Bank browser + edit forms
│   ├── character-studio/          # Sidebar: "Characters" (drag-photo DNA extraction is built in)
│   ├── ad-anatomy/                # Sidebar: "Ad Analyzer"
│   ├── script-architect/          # Sidebar: "Scripts"
│   ├── voice-studio/              # Sidebar: "Voiceovers" (ElevenLabs Multilingual v2)
│   ├── broll-studio/              # Sidebar: "B-Roll Images" — text → still
│   └── video-studio/              # Sidebar: "B-Roll Videos" — capability-driven slots, mode inferred at generate-time
│
├── hooks/
│   └── useAssetUrl.ts             # Resolves asset:// refs to blob URLs for <img> / <video>
│
└── utils/
    ├── kie.ts                     # Unified kie.ai client (3 transports + file upload)
    ├── models.ts                  # Model registry, ModelEntry, buildImageInput, buildVideoInput, estimateCredits
    ├── assetStore.ts              # IndexedDB-backed blob persistence
    ├── localStorage.ts            # Bank persistence helpers
    └── constants.ts               # APP_REGISTRY, BANK_CONFIG (icons, accents, display names)
```

## Banks

Persisted to `localStorage` under `ai-ugc-lab-banks`. Asset blobs (images, audio, video) are stored in IndexedDB via `assetStore`; the bank stores `asset://<id>` refs. `useAssetUrl(ref)` turns a ref into a blob URL.

| Bank | Type (in `stores/types.ts`) | Source |
|---|---|---|
| `products` | `Product` | Manually added in Finder |
| `models` | `Model` | Saved from Characters output |
| `scripts` | `Script` | Saved from Scripts output |
| `voices` | `VoicePreset` | Saved from Voiceovers history |
| `brolls` | `BRoll` | Saved from B-Roll Images + B-Roll Videos. A single record can carry both `imageUrl` (still) and `videos[]` (animations) — when B-Roll Videos generates from a bank still, it appends to the source's `videos` array instead of creating an orphan record. |
| `voiceHistory` | `VoiceHistoryItem` | Auto-pushed on every Voiceovers generation |

`VoicePreset` and `VoiceHistoryItem` carry the full Multilingual v2 parameter set: `voiceId`, `stability`, `similarityBoost`, `style`, `speed`. Legacy fields (`creativity`, `ambience`, `styleInstructions`) are stripped on load; missing v2 fields are backfilled with the model defaults (`0.75 / 0 / 1`) — see `migrateVoiceShape` in `bankStore.ts`.

## Inter-app payloads

```ts
// Sender:
sendToApp({ targetApp: 'video-studio', targetField: 'firstFrame', data: <dataUri> })

// Consumer (in target app's component):
useEffect(() => {
  if (activeApp !== 'video-studio') return
  if (!interAppPayload || interAppPayload.targetApp !== 'video-studio') return
  if (interAppPayload.targetField === 'firstFrame') { ... }
  consumePayload()
}, [interAppPayload, activeApp, consumePayload])
```

Wired today:
- Ad Analyzer → Scripts (winning transcript / reconstruction prompt)
- Ad Analyzer → Bank (productId)
- Scripts → Voiceovers (script text)
- B-Roll Images → B-Roll Videos (still as start frame; consumer drops it directly into the start-frame slot — no mode to set)

## Build phases (history)

1. OS shell + banks (initial commit, macOS-style)
2. Character Studio + Image DNA
3. Ad Anatomy + Script Architect
4. Voice Studio + B-Roll Studio
5. Polish: transitions, empty states, error handling
6. **Sidebar redesign** — YouTube-style left nav replaces bottom dock; bigger menu bar.
7. **kie.ai migration** — every app onto kie.ai. Added `kie.ts`, `models.ts`, `ModelPicker`, Video Studio Pro. Dropped `gemini.ts`. ElevenLabs Turbo 2.5 became TTS.
8. **Polish pass** — Loading bar shows percent; action-style app names; eye icon for Analyze Ads; Settings simplified; Voice Studio rebuilt on ElevenLabs v3 with 20-voice catalog + filters; Video Studio expanded to 6 models with per-model constraints, 4 modes, multi-dim pricing for Kling, Veo's custom endpoint; B-Roll → Video Studio handoff.
9. **Cleanup pass** — Drop `usd` field, split `Mode` into `ImageMode` + `VideoMode`, factor `getChatEndpointPath` into `models.ts`, delete dead `Desktop.tsx` + `DesktopFolder.tsx`, voice shape localStorage migration.
10. **DNA folded into Character Studio** — Visual DNA extraction merged into Generate Characters as a drag-photo affordance (compact drop zone in the controls panel + full-area drag overlay). Standalone `image-dna/` app removed. Bank entries with `source: 'image-dna-extractor'` continue to load.
11. **Sidebar regrouping + ModelPicker redesign** — Sidebar split into Library / Create / Tools sections. App display names switched to terse nouns (Bank / Characters / Scripts / Voiceovers / B-roll / Videos / Ad Analyzer). ModelPicker rebuilt with provider avatars, $-tier badges, and a yellow ★ on recommended models. Aspect ratio moved out of the Camera tab into a Portrait/Landscape pill toggle directly above the model picker.
12. **Voiceovers redesign + v2 swap** — Voice Studio rebuilt to mirror ElevenLabs' speech-synthesis screen: full-bleed editor, right-side `Settings | History` panel with sliding voice picker, ~64-voice catalog grouped by category, click-to-preview avatars with loading rings, sticky bottom audio player after generation. TTS model swapped from `text-to-dialogue-v3` (dialogue-array body) to `text-to-speech-multilingual-v2` (flat body). Settings now expose Speed / Stability / Similarity / Style Exaggeration; `VoicePreset` + `VoiceHistoryItem` extended with the new fields and migrated.
13. **B-Roll Videos: capability-driven UI + Bank-aware frame slots** — Mode toggle removed; start frame, end frame, and reference image slots reveal based on the selected model's capabilities, with the mode inferred at generate-time. Frame slots accept Upload **or** Pick from B-Roll Bank (BankPicker now supports `bankType="brolls"` + an optional `multiSelect` mode for adding several reference images at once). New shared components `VideoInputSlot` and `VideoRefStrip` under `src/components/video/`. Save linkage: when a generation uses a B-Roll Bank still as its source, the new video appends to that BRoll's `videos[]` instead of creating an orphan record; uploads-only saves persist the still alongside the video so the entry is paired. Settings migration `2026-05-video-studio-flatten-modes` collapses the four old per-mode model keys (`video-studio:video:image-to-video`, etc.) into a single `video-studio:video` key. Finder's BRoll card renders a video-element thumbnail for video-only BRolls (text-to-video saves) instead of the empty-film placeholder. Sidebar names finalized: B-Roll Images / B-Roll Videos.
14. **Pricing audit + Veo result-shape fix + aspect-ratio icons** — All model `pricing` blocks reverified against kie.ai's live marketing pages (`kie.ai/{slug}` and `kie.ai/pricing`, last verified 2026-05-09). Highlights: image rates corrected (Nano Banana 2 4→8 credits/1K, Flux 2 Pro 5→14, GPT Image 2 4→3 / Edit 4→6, Seedream 5 Lite 3→3.5, all with new `priceFor` lookups for 2K/4K tiers); Gemini 3 Flash chat rate 0.015→0.10 cr/1k tokens (blended input/output); ElevenLabs Multilingual v2 swapped from per-call 0.5 to **per-1k-chars 12** (new `Pricing.unit` + `PriceParams.charCount`). Veo per-(duration, resolution) lookups fixed earlier in this session continue to apply. **Veo bug**: `kieVeoGenerate` was reading `record.resultUrls` flat, but Veo's record-info actually nests them under `response.resultUrls` — successful generations were rejecting with "Veo returned no result URLs." Fix reads `record.response?.resultUrls ?? record.response?.fullResultUrls ?? record.response?.originUrls` with backward-compatible fallbacks. **Aspect-ratio icons**: B-Roll Videos' Aspect segmented control now renders a small outlined rectangle proportional to each ratio (`AspectIcon` in `VideoStudio.tsx`) so users see orientation at a glance.
15. **Image resolution toggle + Veo Fast default + slimmer frame slots** — Image generation now exposes a 1K / 2K / 4K toggle with per-tier credit cost. New shared `ResolutionToggle` component gated by each model's `imageConstraints.resolutions` — hides for single-tier models (Seedream 5 Lite), trims to `['1K','2K']` for Flux 2 Pro, full set for Nano Banana 2 / GPT Image 2 / GPT Image 2 (Edit). State lives in Characters (`CharacterStudio.tsx`) and B-Roll Images (`OutputPanel.tsx`), is plumbed through `generateCharacter` and `generateImage`, and snaps to the first supported tier when the model changes. `ImageGenOptions.sizeHint` replaced with `resolution: '1K' | '2K' | '4K'` (`ImageResolution` type) — `buildImageInput` passes it directly to each model's API field. **B-Roll Videos default** swapped from Seedance 2.0 to Veo 3.1 Fast (`defaultFor` moved); existing users keep their persisted choice via the migration. **Frame slots**: VideoInputSlot's empty Upload/Bank pad and the filled-image preview are now h-24 (was py-5 + full-natural-image height), so start/end frame slots no longer dominate the panel.

16. **Pricing re-audit + B-Roll Videos history grid + Projects feature** — Live pricing rescraped from kie.ai/pricing (2026-05-09). Several rates were materially wrong:
    - **Veo 3.1 (all variants)** is billed PER VIDEO, not per second. Duration is NOT a request parameter — kie's API spec exposes only resolution + aspect ratio + the optional image inputs. Registry entries switched to `unit: 'per-call'` with `priceFor` returning per-resolution rates (Fast 60/65/180; Lite 30/35/150; Quality 250/255/380). `videoConstraints.durations` set to `[]` so the UI hides the toggle (VideoStudio renders `grid-cols-2` instead of `grid-cols-3` and skips the duration `ChoiceControl`). `buildVideoInput`'s Veo branch already omits duration.
    - **Sora 2 / Sora 2 Pro** are also per-video. Sora 2: 10s=30, 15s=35. Sora 2 Pro: standard 10s=150 / 15s=270, high 10s=330 / 15s=630. Both moved to `unit: 'per-call'` with `priceFor` keyed on (durationSeconds, resolution).
    - **Wan 2.7** rates were off by 5×: corrected to 16 cr/s (720p) and 24 cr/s (1080p). Audio support removed — the kie spec doesn't expose a sound flag.
    - **Seedream 5 Lite** corrected from 3.5 → 5.5 cr/image.

    **B-Roll Videos right panel rebuilt with Current|History tabs.** A new `VideoHistoryGrid` component renders past generations as a Google Flow-style 2-col grid: hover plays the clip, hover buttons offer Save-to-Bank / Download / Tag-to-Project / Delete. Empty state explains the 14-day retention policy. The `Current` tab keeps the existing big preview + Save/Download buttons. Below `Save to B-Rolls Bank` there's a **green Download button** (uses fetch + blob URL + anchor download).

    **History persistence**: new `VideoHistoryItem` type + `videoHistory: VideoHistoryItem[]` on bankStore (parallel to `voiceHistory`). Every successful `generateVideo` pushes an entry with the assetId ref so blobs survive reloads. `addVideoHistory / updateVideoHistory / deleteVideoHistory / clearVideoHistory` mirror the voice CRUD. Saving a history item to the bank stamps `linkedBRollId` so the saved-state badge persists; deletion only purges the asset blob if it isn't linked.

    **Projects feature** (new top-level concept):
    - **Type** `Project { id, name, color?, createdAt }` in `stores/types.ts`. All bank items + `VideoHistoryItem` gained an optional `projectIds?: string[]`. Multi-membership tagging — items can live in many projects.
    - **Bank** `'projects'` added to `BankType` + `BANK_CONFIG` (FolderOpen icon, emerald accent). Listed first in the Finder sidebar.
    - **Active project** in `settingsStore` (`activeProjectId: string | null`). When set, every `addProduct / Model / Script / Voice / BRoll / VideoHistory` call auto-tags the new item via `autoProjectIds` helper in bankStore.
    - **Header switcher** (`components/ProjectSwitcher.tsx`) — chip + dropdown next to the credits chip. Selecting a project sets active; "All projects" clears it; "+ New project" creates inline.
    - **Finder Projects tab** (`apps/finder/ProjectsView.tsx`) — list (cards with member counts + Set active / Delete) and detail (member items grouped by type with untag buttons). Deleting a project untags items from all banks but leaves them in place; if the deleted project is active, settings clears.
    - **B-Roll Videos history tile** got a folder action → `TagToProjectPopover` to toggle membership and create new projects inline.
    - Persistence: projects + projectIds saved alongside the rest of the banks under `ai-ugc-lab-banks`. activeProjectId saved in `ai-ugc-lab-settings`.

## When making changes (going forward)

After any non-trivial change to behaviour, file structure, or model lineup:

1. Update this file (`CLAUDE.md`) so future-Claude has accurate context.
2. Update `AI_UGC_Lab_OS_Spec.md` when feature-level intent changes (not for every refactor).
3. Update the model table above if you register or remove a model.
4. Add a one-line entry to **Build phases** when shipping a coherent body of work.

The user has explicitly asked for these docs to stay in sync with reality.

## Documentation

The product spec lives in `AI_UGC_Lab_OS_Spec.md` at the project root.
