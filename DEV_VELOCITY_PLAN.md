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

## Phase 1 — Kill the duplication  (the real velocity win)

Extract shared layers, one at a time, each verified before the next. After this, a logic change happens in ONE file.

- [ ] **`src/utils/history.ts`** — shared `startOfDay`, `formatRelative`, `sectionLabel`, day-bucketing. Replace the 3 copies in `voice-studio/HistoryView`, `broll-studio/BrollHistoryView`, `playground/PlaygroundHistoryGrid`. *(smallest, safest — do first to prove the pattern)*
- [ ] **`src/utils/asyncToast.ts`** — one `runWithToast(fn, { success, fallback })` wrapper around the try/catch → `humanizeError` → `addToast` pattern repeated 6+ times. Adopt across apps.
- [ ] **Shared UI primitives** in `src/components/ui/` — `Modal` (backdrop + portal + Esc), `Badge`/`Chip`, `IconButton`. Replace the copy-pasted Tailwind strings in the modals/cards. → design tweaks happen once.
- [ ] **`useSaveToBank` hook** — unify the "save generation → add to bank → set linkedId → toast, with double-tap guard" flow used in character-studio, playground, broll-studio.
- [ ] **Generation engine** `src/utils/generation.ts` (or a `useGeneration` hook) — one `startTask`/`finishTask`/`resumeTasks` abstraction over the create→poll→download→saveAsset→resume-on-mount flow. Migrate the 4 app services to call it. *(biggest item in this phase — do last, migrate one app at a time)*

**Exit check:** each generation surface (Characters, Voiceovers, B-Roll, Playground) still generates, saves, and resumes-after-refresh identically. Verify each in-browser.

---

## Phase 2 — Break up the two worst files  (targeted, not exhaustive)

Only the files that actively hurt. Skip `models.ts` (big but isolated data) and `kie.ts` unless they keep causing friction.

- [ ] **Split `CardDetailModal.tsx` (1,321 → ~5 files)** — extract `ModalGallery`, `ImageTile`/`VideoTile`/`InFlightTile`, the reference-slot panel, and move generation handlers into a `useCardGeneration` hook. Phase 1's engine makes this much smaller.
- [ ] **Split `bankStore.ts` (955 / 60 methods)** — factor the repeated `add/update/delete → recordPending → saveRow` CRUD into a generic `makeBankSlice(key)` helper so the 5 entity banks + history banks share one implementation instead of 5 copies. (Keep it one store; just stop hand-writing each method.)

**Exit check:** banks save/sync/hydrate identically; B-Roll modal behaves identically. Verify in-browser + confirm cloud sync round-trips.

---

## Deliberately NOT doing (now)
- **Full test suite** — lower ROI than cleanup for an AI-assisted workflow; revisit with a couple of smoke tests on the generation engine *after* Phase 1 gives clean seams.
- **Splitting `models.ts`** — large but boring/isolated; low friction.
- **Rewrites** — every step is an incremental extract-and-replace, verified live. No big-bang.

## Sequencing
Phase 0 → (ship, feel it) → Phase 1 item-by-item → (ship) → Phase 2 if the two files still bite. Each phase makes the next safer.
