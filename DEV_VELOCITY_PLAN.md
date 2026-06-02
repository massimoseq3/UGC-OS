# Dev Velocity Plan — making UGC OS faster to change

**Goal:** cut the time to make a "simple" change from ~20 min toward ~2–3 min, and make changes land in one place instead of four. Non-breaking, staged, verified at each step.

**Why it's slow today (verified):**
1. **Broken edit-loop** — 24 lint errors (10× setState-in-effect render storms, 9× utilities exported from component files which disables React Fast Refresh → full page reloads), typecheck only runs at build, all 8 apps loaded eagerly (no code-splitting).
2. **Duplication** — the same logic is copy-pasted across apps: generation/poll/resume flow (4 apps, ~250 lines), history grids (3 byte-identical copies), save-to-bank, error/toast handling, in-flight types, modal/badge styles.
3. **God files** — `CardDetailModal.tsx` (1,321 lines, 16 hooks, 7 jobs), `bankStore.ts` (955 lines, 60 methods).
4. **No safety net** — zero tests, so every change is verified by hand (most of the 20 min).

Each phase below is independently shippable. Verify in the browser after each item before moving on.

---

## Phase 0 — Unblock the dev loop  ✅ DONE (2026-06-02)

Mechanical wins. Result: **eslint 24 errors → 0** (7 pre-existing `exhaustive-deps` warnings left, out of scope), tsc clean, app verified across all 7 apps in-browser, production build code-splits each app into its own chunk.

- [x] **Restore Fast Refresh** — moved non-component exports into sibling modules: `variationTags.ts` (was VariationCard), `finder/bankSort.ts` (was BankList), `broll-studio/cardState.ts` (`createDefaultCardState`+`backfillCardState`+legacy migrators, was ScenesView/RightPanel), `voice-studio/components/seedColor.ts` (was VoicePickerView). All importers repointed. (Note: the audit's `PromptPanel` offenders weren't actually flagged; real list came from eslint.)
- [x] **Fixed the 10 setState-in-effect errors** — `useAssetUrl`/`useAssetUrlState` (derive + ref-keyed async), `CookieBanner` (lazy init), `GenerationProgress`/`ChipField`/`script InputPanel`/`voice RightPanel` (adjust-state-on-prop-change during render), `SlotActionMenu` (dropped redundant reset). `Finder` inter-app payload + `AuthGate` cloud-sync are legitimate external-event effects → scoped `eslint-disable` with justification (refactoring critical auth/sync was not worth the risk).
- [x] **Fixed 5 misc errors** — `playground/service.ts` (`as const`), `OutputPanel` (2× redundant regex escape), `BottomPlayer` (self-referential rAF → named function expression), `SettingsModal` (hoisted conditional `useAuthStore` hook — real rules-of-hooks bug).
- [x] **Lazy-loaded the 8 apps** in `App.tsx` with `lazy` + `<Suspense>` (AppPlaceholder fallback). Build now emits BrollStudio/Playground/CharacterStudio/etc. as separate chunks.
- [x] **Added `typecheck` + `typecheck:watch` scripts.**
- [~] **console/dead-code cleanup — SKIPPED deliberately.** The 9 `console.log` are intentional namespaced operational logs in infra (`[cloudSync]`/`[kie]`/`[ad-anatomy]`); the "132 commented lines" were mostly legitimate "why" comments. Deleting either would be destructive, not cleanup.

**Exit check:** ✅ lint 0 errors, tsc clean, all 7 apps render with no console errors, build succeeds with per-app code-splitting.

---

## Phase 1 — Kill the duplication  (reassessed after verification)

On close inspection, most of the audit's claimed duplication was over-counted (same as the Phase 0 "strip 53 console.logs" claim). What's actually here:

- [x] **`src/utils/history.ts`** ✅ DONE — `startOfDay`/`formatRelative`/`sectionLabel` + day-bucketing were byte-identical across voice/broll/playground history views. Real win, ~90 lines removed, behaviour identical. (This was the genuine clean extraction.)
- [~] **`runWithToast` wrapper — SKIPPED (would be a leaky abstraction).** The only shared unit is one line (`addToast(humanizeError(err, fallback), 'error')`, already encapsulated by `humanizeError`). The surrounding handling genuinely varies per site (`setError` / `setExtractError` / Set cleanup / different prefixes). A wrapper forcing all of these through one signature would cost ~the same lines and hide the local state updates.
- [~] **Shared UI `Modal` — LOW PRIORITY (consistency, not velocity).** The 8 modal overlays legitimately differ: `z-[300]` (legal, must top everything), `z-[100]` (Settings), `z-[60]` (card modals), varying opacity/layout. Badge fragment repeats only 2×. Extracting a robust portal+Esc Modal and migrating 8 callers is real regression risk for a consistency-only payoff.
- [~] **`useSaveToBank` — MARGINAL.** The save flows share a *shape*, but the saving-state representation differs per site: `Set<string>` (playground), `boolean` (gallery/preview modal), `Set<number>` + a separate "saved" set (CardDetailModal). A shared hook fits ~2 sites awkwardly.
- [~] **Generation engine — RECOMMEND NOT BUILDING (already factored).** The shared kernel (`createTask`/`pollTask`/`parseResult`/`kieVeoCreate`/`saveAsset`/`ensureHostedUrl`) is **already** extracted into `utils/kie.ts`. The per-app `start*Task`/`finish*Task` services are legitimately *different orchestrations* of those primitives (TTS flat body + audio probe vs. frame-URL resolution + Veo branch + video probe). Wrapping them in a one-size engine = indirection over well-factored code, and it's the riskiest area (polling/resume, a past data-loss bug source).

**Conclusion:** the codebase core (`kie.ts` transport, `models.ts` registry) is *better factored than the audit implied*. The real remaining velocity lever is **Phase 2** — the two genuinely-oversized files you can't navigate (`CardDetailModal` 1321 lines, `bankStore` 955 lines) — not more de-duplication.

---

## Phase 2 — Break up the two worst files  (targeted, not exhaustive)

Only the files that actively hurt. Skip `models.ts` (big but isolated data) and `kie.ts` unless they keep causing friction.

- [x] **Split `CardDetailModal.tsx`** ✅ DONE — 1,321 → **633** (orchestration: state + handlers) + **686** (`cardDetailParts.tsx`: `ModalGallery`, `ImageTile`/`VideoTile`/`InFlightTile`, `DayPill`, `ModalTabButton`/`IconChipButton`/`ReferenceSlotCard`, `aspectStyle`, tile-download). Pure code-motion via props; also deduped a 4th copy of `startOfDay`/`dayLabel` against `utils/history`. tsc clean, 0 lint errors, modal verified rendering in-browser. (Did NOT extract a `useCardGeneration` hook — the handlers are tightly bound to local saved/saving Sets; moving them would obscure more than help.)
- [ ] **Split `bankStore.ts` (955 / 60 methods)** — factor the repeated `add/update/delete → recordPending → saveRow` CRUD into a generic `makeBankSlice(key)` helper. ⚠️ HIGHER RISK — touches the persistence + cloud-sync layer that caused past data-loss bugs, and can't be fully verified in local-only mode (no Supabase env). Recommend its own isolated PR + careful sync round-trip testing, or deferring unless it keeps causing friction.

**Exit check:** banks save/sync/hydrate identically; B-Roll modal behaves identically. Verify in-browser + confirm cloud sync round-trips.

---

## Deliberately NOT doing (now)
- **Full test suite** — lower ROI than cleanup for an AI-assisted workflow; revisit with a couple of smoke tests on the generation engine *after* Phase 1 gives clean seams.
- **Splitting `models.ts`** — large but boring/isolated; low friction.
- **Rewrites** — every step is an incremental extract-and-replace, verified live. No big-bang.

## Sequencing
Phase 0 → (ship, feel it) → Phase 1 item-by-item → (ship) → Phase 2 if the two files still bite. Each phase makes the next safer.
