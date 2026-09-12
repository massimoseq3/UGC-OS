# CLAUDE.md — UGC OS

## What this is

**UGC OS** is a browser-based, macOS-style workspace that unifies eight tools for UGC ad production behind shared data banks. Every in-app AI call goes through **kie.ai** on one member-supplied Bearer key (chat, vision, image, video, TTS, music). The one exception is **Edit**, which generates nothing in the browser — it hands out a Claude skill the member runs locally.

Built for a private Skool community of solo creators and small teams. Access is an email allowlist synced from Skool; inference cost is on the member (BYO kie key), so the operator pays only hosting + storage.

| Section | Dock name | Folder | Job |
|---|---|---|---|
| System | Dashboard | `dashboard/` | Default landing page: value widgets on the shared gradient. → [`src/apps/dashboard/CLAUDE.md`](src/apps/dashboard/CLAUDE.md) |
| Library | Bank | `finder/` | Banks browser (Products / Characters / Scripts / Voices / B-Rolls / Visual Styles / Swipe File). → [`src/apps/finder/CLAUDE.md`](src/apps/finder/CLAUDE.md) |
| Tools | Outliers | `discover/` | Outlier Vault, tracked Accounts, paid TikTok / Instagram / Meta search on the member's ScrapeCreators key. → [`src/apps/discover/CLAUDE.md`](src/apps/discover/CLAUDE.md) |
| Tools | Ad Analyzer | `ad-anatomy/` | Ad image or video → scorecard, breakdown, transcript, scene prompts. → [`src/apps/ad-anatomy/CLAUDE.md`](src/apps/ad-anatomy/CLAUDE.md) |
| Create | Characters | `character-studio/` | Form → portrait or character sheet; reference photo → DNA extraction. → [`src/apps/character-studio/CLAUDE.md`](src/apps/character-studio/CLAUDE.md) |
| Create | Scripts | `script-architect/` | Remix a winning ad or write scripts, hooks, scene blueprints. → [`src/apps/script-architect/CLAUDE.md`](src/apps/script-architect/CLAUDE.md) |
| Create | Voiceovers | `voice-studio/` | Script → audio (Gemini TTS), 30 voices, saved presets. → [`src/apps/voice-studio/CLAUDE.md`](src/apps/voice-studio/CLAUDE.md) |
| Create | B-Roll | `broll-studio/` | Script → storyboard → stills → clips, Line-by-Line or opt-in Continuous. → [`src/apps/broll-studio/CLAUDE.md`](src/apps/broll-studio/CLAUDE.md) |
| Create | Playground | `playground/` | Free-form Image / Video / Music with reference slots and @-mentions. → [`src/apps/playground/CLAUDE.md`](src/apps/playground/CLAUDE.md) |
| Deliver | Edit | `edit-studio/` | Download + setup page for the `/video-editor` skill. → [`src/apps/edit-studio/CLAUDE.md`](src/apps/edit-studio/CLAUDE.md) |

Each app's own `CLAUDE.md` loads automatically under its folder. Read it before changing that app.

- Dock group order is `SECTION_ORDER` in `utils/constants.ts`; membership is by `category`. Meet Your Team reads the same order, so the two can't drift.
- **Folder names and the `id` strings in `constants.ts` are stable** — they key per-app model picks in localStorage. Never rename them.
- Outliers is the one app a member can switch off (`stores/appVisibilityStore.ts`, browser-local, Settings → Experimental). Hiding it takes its dock tile, planet, Team card, route, Swipe File tab and ScrapeCreators field together; nothing is deleted. `OPTIONAL_FEATURES` in the same store holds B-Roll's Continuous mode, which ships OFF.

## Role

Senior frontend engineer + product architect. Push back when something is flawed. Ask for context (kie doc URLs, exact error text) before guessing. Prefer the boring, debuggable solution. Simple > clever, obvious > terse, small single-purpose components, comments explain *why*.

## Where the reasoning lives

Every rule below is one line. The *why* — what was tried, what it measured, why it was reverted — is in one of these, and a rule you are about to change or work around is a rule whose file you read first:

- [`src/components/CLAUDE.md`](src/components/CLAUDE.md) — every shared component, hook and CSS idiom. Loads under `src/components/`.
- [`src/utils/CLAUDE.md`](src/utils/CLAUDE.md) — the model registry, the kie.ai client, error copy, the non-obvious utils. Loads under `src/utils/`.
- [`src/lib/CLAUDE.md`](src/lib/CLAUDE.md) — auth, cloud sync, the banks, the Postgres schema. Loads under `src/lib/`.
- [`docs/mobile.md`](docs/mobile.md) — read before any responsive work.
- [`docs/performance.md`](docs/performance.md) — read before adding a `backdrop-filter`, a `sticky` bar, a forever animation, or a list beside an input.

These load only under their own folder, and several of their rules govern code elsewhere (`src/hooks/`, `src/App.tsx`, `src/apps/admin/`). Follow the link rather than assuming it loaded.

## Architecture

- **Self-contained apps.** Each `src/apps/<name>/` owns its types, components and service. Cross-app data goes through the bank store (persistent) or the inter-app payload (one-shot).
- **Zustand for global state, local React state for ephemeral UI.** No prop drilling.
- **`src/utils/models.ts` is the only place a model is added, changed or removed.** Services name a role (`CHAT_MODEL_DEFAULT`, `CHAT_MODEL_STRONG`, `resolveScriptModel`, `resolveTtsModel`), never a slug.
- **The React Compiler is on.** No hand-written `useMemo`/`useCallback`. Two things silently skip a whole component: an `eslint-disable` of a `react-hooks/*` rule, and a `try`/`finally` or catch-less `try` inside it. **Read store state through the selector** (`useSettingsStore((s) => s.getAppModel(key))`), never by calling a getter pulled out of the store — the compiler caches the call.
- **Tech.** React 19 + TypeScript + Vite (`npm run dev` → :5173), Tailwind 4, Zustand. IndexedDB twice: `assetStore.ts` for media blobs (mirrored to R2 in cloud mode) and `bankPersist.ts` for the bank boot cache. localStorage for settings, picker selections, drafts and the sync outbox. Cloud (opt-in via `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`): Supabase auth + Postgres, R2 for blobs. kie.ai is called directly from the client.

## kie.ai client (`src/utils/kie.ts`)

Five transports: async task (`createTask` → `pollTask` → `parseResult`), chat completions (streaming SSE), Veo, Suno, synchronous omni creates. Detail in `src/utils/CLAUDE.md`. The rules a new call site breaks by accident:

- **Every call that CREATES a generation goes through `submitToKie`** (`utils/kieSubmitGate.ts`). kie 429s past ~20 new requests per 10s and a rejected one never happens. Polling, uploads and chat are outside the gate.
- **Every response body is read on a deadline.** `fetch()` settles at the headers. Use `fetchWithRetry`, and `fetchGeneratedAsset` for every result download. A bare `fetch` to kie opts out of all of it.
- **A chat response cut off at the token limit throws `TruncatedResponseError`** on every transport. `xmlBlocks.ts` tolerates a missing close tag, so a truncated answer would otherwise fire paid gens against half a storyboard.
- **A chat error arrives inside an HTTP 200.** Read kie's `{ code, msg }` envelope before the content. Maintenance windows return `{ code: 5xx }` in a 200.
- **A chat call that must survive a reload goes through the async task API** (persist the taskId; `extractChatTaskText`). A model with no job route 400s, so fall back to streaming and mark the run unresumable.
- `ensureHostedUrl` uploads `data:` URIs to kie's file host (3-day expiry). `kieTestConnection` checks the balance.

## Models

Defaults (registry order IS the default — `getDefaultModel` falls back to the first entry per mode, so no image entry carries a `defaultFor`):

| Capability | Default |
|---|---|
| Text + vision, both tiers | Gemini 3.8 Flash — keep `CHAT_MODEL_DEFAULT` and `CHAT_MODEL_STRONG` as two names |
| Script / prompt writing | member's pick, two independent slots (`script-architect:chat`, `broll-studio:chat`) — a blurb may never name a default |
| Image, text→image and image→image | GPT Image 2.5 Sunburst (+ `-image-to-image` sibling via `resolveImageToImageModel`) |
| Video | Grok Imagine Video 1.5 in B-Roll and Playground; Continuous keeps Seedance 1.5 Pro |
| TTS | Gemini 2.5 Pro TTS (`TTS_MODEL_SLOT`, picker of two) |
| Music | Suno V5.5, Playground only |

- `estimateCredits` + `formatCredits` are the only credit APIs. Credits only, no USD, in pickers and buttons.
- `official` / `market` prices are added **only when verified**, with a source URL; `null` for a tier with no comparable rate.
- `maxReferenceImages` / `maxReferenceVideos` declared only from a verified provider cap; undeclared fall to `UNDECLARED_REFERENCE_IMAGE_CAP`.
- `mixedImageInputs` (`'merged'` / `'reference'` / `'exclusive'`) says what a model does with frames + references in one request; undeclared falls to `'exclusive'` on purpose.
- Video mode is inferred at generate time from filled inputs; `motionControl: true` fixes it. Gemini Omni Flash 1.1's extra inputs are gated by the `omniInputs` capability flag, not an id check.
- `buildImageInput` / `buildVideoInput` / `buildMusicInput` shape every request body.
- **Removing a model needs no migration** (`pruneUnknownModelIds`). A migration that must reach a signed-in member is listed twice: `MODEL_MIGRATIONS` and `PROFILE_MIGRATIONS`. The Veo transport stays after the Veo entries were removed — persisted B-Roll cards still resume through it.

## Auth + cloud sync

- `AuthGate` order is load-bearing: bootstrapping → recovery → signed-out → lapsed → workspace. `syncBlocked` stops sync in recovery and lapsed.
- **The UI never `await`s a cloud round-trip.** Local write first, push in the background; durability is the synchronous localStorage outbox replayed by `drainOutbox()`.
- **Hydrate is non-destructive** — a per-table error keeps local rows. **Every whole-table read is paged** through `selectAllRows`.
- Every cloud write awaits `ensureFreshSession()`; the client uses a custom non-blocking `auth.lock`.
- **The kie.ai and ScrapeCreators keys are browser-local only**, never in Supabase, written through `snapshot(state)`, kept across sign-out in the per-user vault `ai-ugc-lab-keys` and adopted only after any wipe.
- Signup is blocked by the `enforce_allowlist` trigger with no client bypass; the access code is compared in the trigger and never shipped to the browser. Member status is Active / Lapsed / Disabled; no status deletes anything.
- `perAppModel` is cloud-synced and hydrate replaces it.
- Every bank table has a Postgres mirror; **a new bank needs its migration run before deploy** or every hydrate errors and skips the orphan sweep.
- Announcements are the one synced table that is not a bank (`stores/announcementStore.ts`); `published_at` in the future is the scheduler.
- Admin tabs share one 60s-fresh fetch (`apps/admin/useMembers.ts`) and every admin query goes through `adminQuery.ts`.

## Banks (`stores/bankStore.ts`, types in `stores/types.ts`)

`products`, `models`, `scripts`, `voices`, `brolls`, `styles`, `swipes`, `trackedAccounts`, the history banks (`voiceHistory`, `videoHistory`, `imageHistory`, `musicHistory`, `scriptHistory`, `brollHistory`, `characterHistory`, `adAnatomyHistory`) and the `usageDays` ledger. Rows hold `asset://<id>` refs; `useAssetUrl(ref)` resolves one.

- **No bank may hold two rows with one id.** `add*History` goes through `prependRow`; `normalizeBanks` dedupes on load. A collision shows up as a React key collision, not a duplicate row.
- **Which banks reach the boot cache and the orphan sweep is a compile-time `satisfies Record<…, true>` guard** (`BANK_DATA_KEYS`, `orphanCleanup`). A bank missing from the sweep's list has its live assets deleted.
- Asset refs come as `asset-x` and `asset://asset-x`; normalise with `assetIdFromRef` before comparing against `assets.id`.
- History banks are uncapped by design; only `brollHistory` has a FIFO cap. A local cache-write failure is never a reason to drop a row.
- `usageDays` is accumulate-only, one row per local day, written inside `add*History` via `recordUsage`; deleting history never subtracts. Its `apps` half is attention time from `utils/appUsageTracker.ts`, so output metrics key off `counts`. Composite PK `(user_id, id)`.
- `brolls` saves **stills only**; videos are download-only. `videoHistory` is shared by B-Roll and Playground. `linkedBRollId` / `linkedModelId` gate blob purge on delete.
- `swipes` and `trackedAccounts` snapshot numbers as saved and copy the thumbnail / avatar into our storage; the video and the reels are deliberately not stored.
- `styles.brief` is the paragraph appended to every prompt in that look; it describes the LOOK only.
- `migrateVoiceShape` strips the legacy ElevenLabs fields off voices.

## Errors

- End-user generation surfaces show `humanizeError(err, fallback)` verbatim — it returns a complete sentence; never prefix it. Infra, admin and Settings surfaces show kie's raw message.
- Its rule table matches substrings, so a new "timed out" is a new rule. Debug context goes behind a `DEBUG_TAIL` key (`taskId=`, `url=`, …) so digits in a payload can't match a status code.
- **Anything we raise ourselves throws `FriendlyError`** — a complete sentence naming what to do next.
- A Retry on anything we still hold a kie `taskId` for RESUMES the task, never re-submits, and says so.
- **A capability claim in UI copy names no model.** Point at the picker's greying, which is derived from `modes`.

## Styling and shared UI

Tailwind only. Semantic theme tokens from `index.css` (`ink`, `paper`, `surface-0/1/2`, `ink-50…950`, accent families that auto-flip in light mode); literal white/black only over user media, on solid accent buttons and modal backdrops. `data-theme` on `<html>`, set pre-paint by `index.html` and owned by `stores/themeStore.ts` (per-browser, default dark). Per-app accents are `@theme` families in `index.css` plus the hexes in `constants.ts`; the Products accent is sky blue and its family is still named `gold-*`. Single-line inputs, triggers, chips and buttons are `rounded-full`; textareas `rounded-2xl`. **Every label a member reads is Title Case; only prose, hints, tooltips, toasts and middot qualifiers are sentence case.** No global focus ring, on purpose.

Reach for these instead of re-implementing. One line each; the reasoning is in `src/components/CLAUDE.md`.

- `Modal` — the one panel overlay, always centred; `fill` is the height decision. `BankPicker` — picking from a bank looks like browsing one; its rail navigates, never filters. `Menu` (`MenuSurface` + `MenuItem`) — the one popup, opaque, never `backdrop-blur`. `Dropdown` — the app's only select. `SectionRail` says where you are and filters nothing.
- Every overlay takes `useCloseOnEscape` and `useBackdropClose` (never `onClick={onClose}` on a backdrop); body-portaled ones also `useCloseOnAppSwitch`. `.modal-pop` / `.modal-fade` / `.rail-pop` are how they arrive, kept in step with `BankPicker`.
- `tileActions` — hover column [Star] → Download → Save → Copy → extras → Delete; past four, `TileMenuButton`. `TileDeleteButton` is the only delete idiom: two-click, reverts after 3s, never a confirm modal, never resizes. **A card never moves on hover.**
- `GeneratingMedia` / `GeneratingChip` / `Spinner` (a ring, not a spinning icon) are the only in-flight faces; a card mid-generation and its detail modal look identical. **Generate buttons never disable while a gen is in flight** — guard duplicate fires with a `startingRef` set.
- `VideoLightbox` + `ExpandVideoButton`, `useInlineVideo` (one clip plays at a time; `hoverProps` on the tile root), `posterVideoProps` on every grid `<video>`, `useAssetThumb` / `useAssetPoster` — **a grid tile renders the thumbnail, never the original**, and `useNearViewport` resolves media near the window; `release: true` is for clips only.
- `SectionCard` (don't card a lone control), `SectionPresetPill`, `VoiceCard` (two shells on purpose), `StatusDot` (red means exactly "this is why Generate is grey"), `AutoGrowTextarea` and `BracketHighlightArea` (a field in a scrolling form grows, never scrolls), `PromptToolbar`, `ConstraintChip` (click-only), `BatchCountStepper` (cap 4, the total rides on the Generate button), `ClearAllButton` (inputs only), `DropOverlay`, `DayPill` (every list section label), `ModelPill`, `AppGlassTile`, `GridCanvas` (an empty stage, not a backdrop), `refInputParts` (a 64px `ImageTile` in a wrap row, never an aspect-square grid), `scriptBadge` (solid fills).
- History rails: `RailNewButton` (arms only when it clears inputs; armed state is monochrome), `HistoryRailHandle` + `HistoryRailToggle` (lip when open, circle when shut), state in `useHistoryRailOpen`, shut by default, column only from 980px with `min-[980px]:` and `useMinWidth(980)` kept in step. **A history panel beside an input is `memo`'d with stable props.**
- Panel headers are `h-[57px] border-b border-ink/5 px-5`, a hairline not a surface, rendered on both panes. An output panel's own top bar is pinned OVER its scroller (`app-backdrop-frost`, `absolute`) with the scroller's `pt-` reserving it. The gap above a generate band is on the band (`pt-2`), not the scroller. Picker rows 58px, pills 48px, Generate `px-7 py-4`, rows 8px apart. Picker titles are "Choose a …" with no subtitle.
- `.glass-fill` is the one frosted glass (dock tiles, primary Generate CTAs); the rim is not in the class and the light-mode pair is repeated in `btn-soft-shadow`. A solid accent CTA hovers with `hover:brightness-110`, never a tint token.
- `AppErrorBoundary` wraps each app pane and offers Reload, never retry; `BUILD_ID` + uncached `/version.json` get in front of it.
- Audio: `audioPlayback.ts` + `AudioScrubber` + `useAudioPlayback`, one transport, never native `<audio controls>`, no waveform.
- Performance: **`backdrop-filter` is for small chrome, never a full-window container, never over something that animates; `filter: blur()` never animates; nothing on the generating backdrop moves; nothing animates forever on an idle page.** Chrome that must not move lives outside the scroller. An app is `h-full` in its wrapper with one scroller and no layout floor; no fixed footers. Skeletons breathe as a group.
- Mobile: `MobilePaneTabs` shows one pane at a time and Generate flips to output; the dock auto-hides on scroll and nothing else moves (`suspendChromeAutoHide` around programmatic scrolls); `touch:` keeps hover affordances reachable; `max-lg:flex-none` + a real floor where a box stops sharing height; tables become card lists below `md`; always declare `grid-cols-1`; batch strips are one scrolling line; fields render at 13px under `md` paired with `maximum-scale=1`; no scrollbar gutter on touch; nothing rubber-bands; bottom-anchored chrome holds `env(safe-area-inset-bottom)`; the PWA manifest keeps `scope: "/"` and a `black` status bar.

## Inter-app payloads

`sendToApp({ targetApp, targetField, data })`; the consumer reads `interAppPayload` in a `useEffect` keyed on `activeApp`, dispatches on `targetField`, then `consumePayload()`. Wired: Ad Analyzer → Scripts (transcript) / Bank (productId) / B-Roll (`adBlueprint`, the only source of `sceneStaging`); Scripts → Voiceovers (text) and → Playground (`videoPrompt`); B-Roll Bank → Playground (`videoStartFrame`); anywhere → Playground (`prompt`, `imageRef`). Playground still consumes `videoSourceClip` and nothing sends it — kept so re-wiring the redub loop is one button.

## Non-obvious files

One line each; detail in the sub-file named beside it.

- `utils/appUsageTracker.ts` — the only signal for which app a member is in. Attention time, sampled, buffered; the buffer is discarded on user change on purpose. → utils
- `utils/orphanCleanup.ts` — once-per-sign-in asset sweep; its bank list and its paged `assets` read must both stay complete. → utils
- `utils/assetStore.ts` — neither the memory fallback nor a failed `openDB` may latch; `openDB` has a deadline and `onblocked`; writes handle `onabort`. → utils
- `lib/r2.ts` — three retried hops under an upload cap and a download cap; a retry never re-PUTs a landed binary. → lib
- `lib/cloudSync.ts` — per-row serialised saves, token-guarded outbox markers, `walkAssetRefs`. → lib
- `utils/friendlyError.ts` — the ordered rule table. → utils
- `api/fetch-media.ts` — the only server-side URL fetcher; suffix-matched host allowlist re-checked after redirects. → discover
- `utils/team.ts`, `utils/voiceProfile.ts` (`VOICE_PROFILE_SPEC`, shared by Scripts and the Ad Analyzer), `utils/mockData.ts` (seeds every tab, reversible by manifest), `utils/channelVideos.ts` (hand-maintained YouTube log) → utils / dashboard
- `scripts/build-vault.py`, `scripts/build-character-presets.py` — read a corpus outside the repo; the committed output is the source of truth. → discover / character-studio

## Editing this file

Add a line here only for a trap a session can't learn from the code — something that costs money, data or a member's session when broken. One line, imperative, no date, no story. The reasoning goes in the sub-file that loads with the code, one line there too unless a measurement or a reverted attempt genuinely needs recording. History is `git log`. When you touch this file, look for a line to remove before you add one.
