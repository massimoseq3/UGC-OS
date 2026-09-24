# Flow — `flow/`

Automate section of UGC OS, and the one app that makes nothing of its own. This file loads when Claude works with files under `src/apps/flow/`; the app-wide rules stay in the root [CLAUDE.md](../../../CLAUDE.md). The build spec is the Claude Doc "UGC OS Flow: Build Spec"; this file records what the code settled on and why.

## Job

A canvas where each block is an existing app — Characters, Scripts, Voiceovers, B-Roll, Playground, the Ad Analyzer, Outliers, Edit Pack — plus four helpers (Bank, Image, Text, List) and a Note, wired so one run makes a batch of ads. A member meets it on **Flow Home** (templates first, then Describe It, Your Flows, Make a Flow From Your Work, and a blank canvas LAST — a member who has never seen a node editor must be able to run a template without opening one), runs a flow as a form in **Run View**, and opens the canvas only to change something. Phones get Run View and nothing else: editing the canvas stays on a computer (`useIsDesktop` in `Editor`).

It is an **optional app, OFF by default** (`OPTIONAL_APPS` in `stores/appVisibilityStore.ts`, Settings → Experimental). Hiding it takes its dock tile, its pinned flows' tiles, every tile's How It Was Made / Save as Flow entry (`components/FlowLineageItems.tsx`) and the boot-time run resume (`App.tsx`) with it; nothing is deleted. Dock group **Automate**, after Edit, where the production line ends. Accent cyan `#0891B2` (`--color-flow-*`), the one hue the dock didn't already use.

## Layout of the code

- `engine/` — `catalog.ts` is the block set: typed ports, which output types each input `ACCEPTS`, sources, defaults. `graph.ts` answers wiring questions (`canConnect` returns the refusal as a sentence). `plan.ts` turns a graph plus what's already made into instances, counts and credits. `layout.ts` is Tidy and the layout for graphs nobody placed. Those four and `hash.ts` are pure and unit-tested (`npm test`); the plan reads the world only through the `PlanDeps` it's handed. The two deps read stores: `held.ts` builds the values a Bank / History / Image / Text block holds, and `cost.ts` prices one instance with the runners' own `estimate` where a runner has one and the registry's `estimateCredits` where it doesn't.
- `store/` — `flowStore.ts` (the open flow, edits, undo, selection, the lineage window) and `blocks.ts` (new blocks with each app's defaults, batch slots, row ↔ doc).
- `run/` — `runtime.ts` (the scheduler, run records, reviews, resume) and `executors/` (one per runnable kind, each calling its app's runner).
- `templates/` — the `.ugcflow` format and its validator (`io.ts`), the static gallery (`gallery.ts`, reading `public/templates/`), and Describe It / Ask Flow (`describe.ts`).
- `lineage/` — Save as Flow and How Was This Made: `trace.ts` walks recorded parents, `saveAsFlow.ts` turns the walk into blocks, `faces.ts` is how a traced row reads on screen.
- `components/` — `FlowHome`, `Editor` (the two-pane shell with the Edit / Run toggle), `Canvas` (React Flow), `BlockNode`, `panels/` (each block's settings column — reusing the apps' own controls wherever they exist), `RunView`, `ReviewModal`, `TemplateSetup`, `DescribeIt`, `AskFlow`, `LineageModal`, `FromYourWork`.

## Blocks call the apps' runners, never their own generation

Every executor names a Phase 0 runner (`utils/blockRunner.ts`): `voiceRunner`, `scriptRunner`, `characterRunner`, `playgroundRunner`, `brollStillRunner` / `brollClipRunner` plus B-Roll's row-free storyboard, `adAnalysisRunner`, and Outliers' `searchOutliers`. That is the whole point of Phase 0 — a Flow block and the app it stands for cannot drift into two ways of making the same thing, and every row a block writes lands in that app's own history, counted in the usage ledger, stamped with `flowId` / `flowRunId` / `flowBlockId` and its `parents`. **A new block kind gets a runner in its app first**; an executor that talks to kie directly is the thing Phase 0 exists to prevent. Model picks are the block's own (`settings.modelId`, a `ModelPicker` with `persist={false}` so choosing in a block never moves the app's own pick), falling back to the app's pick, then the registry default. Scripts and the B-Roll storyboard write with each app's own chat model — `ScriptRunInput` has no model slot.

## The run engine

- **A block runs once per trace-compatible combination of its inputs.** Every value carries a `trace` (which block made it, in which run and item); two values from the same upstream block but different items never pair. That is what makes an Edit Pack pair each ad's clips with the same ad's voiceover instead of multiplying every voiceover by every clip set. Required inputs lead a combination; optional ones join it rather than splitting it; an input that takes many (`many: true`) rides with every run. `plan.test.ts` holds the cases — read it before changing `combinations`.
- **Values not made yet are placeholders** (`pending: true`, with a size hint), so everything downstream of an unfinished block is still planned and PRICED — a Scripts block that hasn't run yet still prices the voiceovers after it, at the length its settings will write. The plan is the one source for the canvas counts, every block's estimate, the wire badges and the Run button; nothing counts on its own.
- **Results are cached per instance**, keyed by `fingerprint(kind, generation settings, input value keys)`. `generationSettings` leaves out what doesn't change the output (a batch's count, list entries, keys starting `ui`), so adding a fifth face re-runs one slot rather than all five. A block re-runs only what's missing or changed.
- **Batch blocks come in two shapes.** Characters and List are per-slot: each face is its own generation, so a run makes only the slots that are on and empty. Scripts and Outliers fill every slot in ONE call, and record the `slots` they were asked for — a finished run that came back with fewer hooks than slots is complete, not a reason to pay again. **Scripts' slot count follows the counts Scripts accepts** (`isHookCount` / `isVariationCount`): anything else runs at the default, so the slots must agree or the plan and the run disagree.
- **Test With 1** cuts the whole run to one combination and one item, for a cheap end-to-end check before the real run.
- **Reviews pause the run** (`review: true`): the block's results open in `ReviewModal` and only the kept ones run on. B-Roll's review sits BETWEEN its two phases — stills first, then clips for the stills you keep — so no clip is paid for before a still is approved. Review Later leaves it waiting on the block.
- **A block that fails hands on nothing in place of what it didn't make** (`settled`), so the rest of the flow finishes and the failure is one Retry away.

## Paying once

- **A task handle is saved before its wait** (`ctx.save`, persisted under `ai-ugc-lab:draft:flow:tasks`), so a reload, a Stop or a Retry fetches what kie already made instead of paying for it again. kie has no cancel: Stop stops the WAITING, and says so.
- **A handle is dropped only when the task is dead** (`run/errors.ts` `taskIsDead`: the task itself reported failure). A 401, a network error or a timeout keeps it — the task may well have finished — which is what a stale key on reload used to cost: handles thrown away, the same gens paid for twice.
- **Runs resume from the shell.** `resumeBoot.ts` is the only Flow module `App.tsx` imports: it reads the persisted run list and, only if something was running, lazy-loads the runtime after the local banks are ready. Importing the runtime into the shell would put the whole Flow chunk in the main bundle.
- **Run records are local-first** — the live runs, their task handles, and a log of the last 12 runs per flow (`ai-ugc-lab:draft:flow:runs` / `:tasks` / `:log`). They describe work in THIS browser; syncing them is an open question, not an oversight. Load Run puts a logged run's graph and results back as one undo step.
- **Big runs ask first.** Past 500 credits or 20 generations Run shows the bill and waits; a run the balance can't cover doesn't start.

## Recording Mode

A replay run spends nothing and persists nothing: it is never written to the run list, the task store or the log. Each executor's `replay` reveals the oldest hidden row of its bank, the way its app's Generate does. **An executor with no `replay` refuses in a replay** unless it is marked `realInReplay` — Edit Pack (it only gathers) and Outliers (ScrapeCreators, which the Outliers app itself searches for real while recording). That rule is what stops a new executor billing on camera by forgetting a replay. B-Roll's replay names the session it revealed, so its review shows that session's stills and the clips phase after the review stays in it; a replay that finds nothing hidden skips its review rather than opening an empty one. Flow Home's From Your Work reads each bank through `useVisibleRows`, so filming it never shows a hidden row.

## Templates, Describe It and Ask Flow

- **A template is data, never code**: `flow.json` (+ `assets/` + `cover.jpg`) zipped as `.ugcflow`, and the same JSON on the clipboard for copy/paste. **Export never carries a pick or an asset ref**: a bank pick becomes a field ("Your Product", with the author's own as an example name), an uploaded image travels as a downscaled JPEG under `assets/`. `validateTemplate` is the one parser for files, the gallery, paste and Describe It: an unknown block kind stays on the canvas and is skipped (a newer build made it), an unknown model falls back to the default, a wire that no longer fits is dropped, and each change is reported as a sentence. Limits: 60 blocks, 8 images at 2 MB.
- **The gallery is static files** in `public/templates/` (`index.json` + one JSON per template), shipped with the build. Estimates in `index.json` are written by hand from a real plan — regenerate them when a price moves.
- **Template Setup** lists what a template needs, checks the key and the balance, prices the run, and keeps Run grey with the reason until every field is filled.
- **Describe It and Ask Flow** are one chat call each on `CHAT_MODEL_DEFAULT`, well under a credit. The prompt carries the catalog (kinds, ports, allowed setting values), the NAMES of the member's bank rows (never images), and for Ask Flow the flow as it stands. They PROPOSE: Describe It's answer goes through the validator with `described: true` — a block kind the model invented is left out (not kept as "needs a newer build"), and each dropped wire says why. A pick that doesn't resolve becomes a field. Ask Flow's operations are applied one by one, each wire checked by `canConnect`; a new block lands one column right of whatever feeds it, the view moves to what changed, and the result stays on screen with Undo until the flow is edited again. Nothing runs until the member presses Run.

## Save as Flow and How Was This Made

Both read `parents` (`Provenance` in `stores/types.ts`), stamped by every runner. `trace.ts` walks them breadth-first; rows made before stamps existed count the ids their app kept for itself (a script's product, a session's product / character / script, a clip's still) — **only when those still resolve**, since an old id pointing nowhere can't be told apart from one that never meant "made from". Children point at parents, never the reverse, so deleting a parent never takes a child with it; a deleted parent reads as "no longer kept".

Save as Flow rebuilds each step with the settings it used. **The product and character become fields**, so the flow runs again for anything. A script made in Scripts is **written fresh each run** by default (a kept script would be about the old product) or **kept word for word** as a Text block. A Scripts block that writes several gets `review: true`, since the original result used one of them. Typed inputs become Text blocks; an uploaded ad's analysis becomes its transcript; a parent no input can take is pruned along with anything that only fed it. A B-Roll clip starts at its session, which is what was made.

Entry points: Flow Home's From Your Work (the latest six results across the history banks), and app tiles through the `lineage` payload — Playground's and Characters' ⋮ menus, Voiceovers' active row, B-Roll's history cards. Scripts' and the Ad Analyzer's rows don't carry it yet: both rows are tight and their delete positions are deliberate (see their own files).

## Canvas

React Flow (`@xyflow/react`). Nodes and edges are DERIVED from the doc on every render — the doc is the only state, React Flow holds nothing of its own beyond the drag in progress — and a drag commits positions on release, as one undo step. Measured node sizes feed Tidy and Ask Flow's placement. Undo coalesces edits to one field inside 1.2s; saves debounce at 700ms and flush on `pagehide`. Keyboard (never while typing in a field): Delete, ⌘Z / ⇧⌘Z, ⌘C / ⌘V (the clipboard carries template JSON, so a selection pastes into another flow or another member's), ⌘D, ⌘A, Escape. Dropping an image on the canvas makes an Image block; dropping a wire on empty canvas opens What Next? with the blocks that take it.

## Payloads

`openFlow` (a pinned flow's dock tile → that flow, in Run View) and `lineage` (a tile's How It Was Made / Save as Flow → the lineage window over whatever Flow shows). **Flow's consumer is keyed on the payload as well as the app**: both are pressed while Flow is already open as often as not, and then only the payload changes.

## Data

Flows are a bank: `flows` in `bankStore` (`saveFlow` / `deleteFlow`), Postgres table `flows` (migration 0026), in the boot cache and the orphan sweep's lists. **Run migration 0026 before deploying** or every hydrate errors and skips the orphan sweep. A flow row holds its blocks, wires and results (`outputs` — values pointing at the apps' own rows and their media, which the sweep therefore counts as live) plus `template` (id + version it came from) and `pinned`. Deleting a flow deletes the flow only: what it made stays in each app's history.

## Known limits

- B-Roll's history is FIFO-capped at 50, and every Flow B-Roll run is a session, so a big run pushes older sessions out.
- Flow's Playground images, clips and music appear in Playground's All Generations like any other Playground run.
- Outliers blocks spend ScrapeCreators credits on the member's key, not kie credits.
- A Characters run where some faces fail loses those slots' handles; Retry pays for those faces again.
- Deleting a row in its own app purges its media, and the flow's result for it then shows empty — it is still cached, so Run Flow won't remake it; Run Block does. Treating a missing row as unmade was weighed and left out: until the cloud hydrate lands, a row made on another device looks exactly like a deleted one, and a plan that read it that way would offer to pay for it again. There is no "hydrate finished" signal to gate on (`markCloudHydrated` fires at the START of hydrate).

## Testing

`npm test` runs `engine/plan.test.ts` and `lineage/saveAsFlow.test.ts` (vitest, CI runs it). In the browser, a kie stub that answers `createTask`, `recordInfo`, credit, file upload and streaming chat from `window.fetch` exercises a whole run for free — install it before anything polls, or real kie answers 401 and (before `taskIsDead`) dropped the handles.
