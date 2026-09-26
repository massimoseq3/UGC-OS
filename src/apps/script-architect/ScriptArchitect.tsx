import { useMemo, useRef, useState, useEffect, useEffectEvent } from 'react'
import { FileText, PenLine } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import MobilePaneTabs from '../../components/MobilePaneTabs'
import { paneClass } from '../../components/paneClass'
import { useReportActivity } from '../../stores/activityStore'
import { useBankStore } from '../../stores/bankStore'
import type { Lineage, Product, ScriptHistoryItem } from '../../stores/types'
import InputPanel from './components/InputPanel'
import RightPanel from './components/RightPanel'
import { scriptRunner, resumeScriptRun, type ScriptRunInput, type ScriptTask } from './runner'
import { lineageOf } from '../../utils/blockRunner'
import { WRITE_STYLE_META, HOOK_CATEGORY_META, detectSceneBlueprint, isWriteStyle, isWriteFormat, isWriteLength, isRemixLength, isHookCategoryChoice, isHookCount, isVariationCount, parseHooks, DEFAULT_VARIATION_COUNT, DEFAULT_HOOK_COUNT, DEFAULT_REMIX_LENGTH, type ScriptMode, type ScriptUiMode, type EditableProductContext, type WriteStyle, type WriteFormat, type WriteLength, type RemixLength, type HookCategoryChoice, type HookCount, type VariationCount, type RemixAngle, type PendingScriptRun } from './types'
import { usePersistedState, useProjectScopedKey } from '../../hooks/usePersistedState'
import { useHistoryRailOpen } from '../../hooks/useHistoryRailOpen'
import { isRecordingActive, useRecordingLoop, useRecordingLoopSince, useVisibleRows } from '../../stores/recordingStore'
import { useAppVisible } from '../../stores/appVisibilityStore'
import { INVALID_KIE_KEY_MESSAGE, NO_KIE_CREDITS_MESSAGE, NO_KIE_KEY_MESSAGE } from '../../utils/friendlyError'
import { LOST_IN_RELOAD_MESSAGE, type TaskHooks } from './services/scriptCalls'
import {
  claimRun,
  hasLiveTakes,
  isClaimed,
  isJournaled,
  journalRun,
  journalTaskId,
  journaledRuns,
  releaseRun,
  unjournalRun,
  unjournalTask,
  RESUMABLE_TTL_MS,
  type JournaledRun,
} from './runJournal'

interface ReverseEngineerPayload {
  fullPrompt?: string
  scenes?: Array<{ prompt: string; index: number; label: string; startTime: string; endTime: string }>
}

// The sentences a member fixes themselves. Their toast already carries the
// button that fixes it (Connect Key / Add Credits, from the toast store), and a
// Retry beside a missing key would just fail again.
const MEMBER_FIX_MESSAGES = new Set([NO_KIE_KEY_MESSAGE, INVALID_KIE_KEY_MESSAGE, NO_KIE_CREDITS_MESSAGE])

// What a landed run says it made, off the RUN's own mode and format — never
// the live selectors, which the member may have moved while it wrote (or, for
// a run resumed after a reload, never set to match it at all).
function landedMessage(mode: ScriptMode, writeFormat: string | undefined, variations: string[]): string {
  const n = variations.length
  if (mode === 'write') {
    if (writeFormat === 'hooks') return `${parseHooks(variations[0] ?? '').length || 'Your'} hooks generated`
    return writeFormat === 'scenes' ? `${n} scene drafts generated` : `${n} scripts generated`
  }
  return mode === 'remix' ? `${n} script variations generated` : 'Scenes rewritten'
}

// A run's in-progress card, given the id its finished row will take and the
// moment it started. Minted before the call: the id names the card in History,
// it is what the Output pane is parked on while the run writes, and it becomes
// the row's id — so the card never changes identity under the member watching.
function mintRun(fields: Omit<PendingScriptRun, 'id' | 'startedAt'>): PendingScriptRun {
  return { ...fields, id: crypto.randomUUID(), startedAt: Date.now() }
}

// The runs a previous page load left in the journal, sorted once on mount:
// `live` still has a take kie is writing and is picked back up; `lost` was
// streamed (its writer model has no job route) and is offered as a Retry;
// `stale` is past the 3 days kie keeps a result, and is dropped.
function readJournal(now: number): { live: JournaledRun[]; lost: JournaledRun[]; stale: JournaledRun[] } {
  const out = { live: [] as JournaledRun[], lost: [] as JournaledRun[], stale: [] as JournaledRun[] }
  for (const entry of journaledRuns()) {
    if (isClaimed(entry.run.id)) continue
    if (now - entry.run.startedAt > RESUMABLE_TTL_MS) out.stale.push(entry)
    else if (hasLiveTakes(entry)) out.live.push(entry)
    else out.lost.push(entry)
  }
  return out
}

// One-time draft migration: the merged Remix source box replaced the two
// per-mode fields (transcript / reversePrompt). Seed the new slot from
// whichever legacy draft is non-empty so nobody loses work on upgrade.
function readLegacySource(baseKey: string): string {
  try {
    const read = (key: string) => {
      const raw = localStorage.getItem(key)
      return raw ? String(JSON.parse(raw)) : ''
    }
    return read(`${baseKey}:transcript`) || read(`${baseKey}:reversePrompt`) || ''
  } catch {
    return ''
  }
}

export default function ScriptArchitect() {
  const baseKey = useProjectScopedKey('script-architect')
  const [source, setSource] = usePersistedState(`${baseKey}:source`, readLegacySource(baseKey))
  // Scripts OPENS on Write New unless there is something in the Remix box
  // (September 2026, Massimo's call). It opened on Remix, which is nothing
  // without a winning ad to rewrite — a newcomer has none, so their first sight
  // of the app was a dead end. Read at hydration only: picking Remix with an
  // empty box mid-session stays picked, and the empty Output canvas offers the
  // ways to get a source; an inter-app send still switches to Remix on arrival.
  // Drafts persisted before the merge may hold 'reverse-engineer' — fold it
  // into the merged 'remix' mode on the way.
  const [mode, setMode] = usePersistedState<ScriptUiMode>(`${baseKey}:mode`, 'write', {
    sanitize: (v) => {
      const next = (v as string) === 'reverse-engineer' ? 'remix' : v
      return next === 'remix' && !source.trim() ? 'write' : next
    },
  })
  // The rows the source box was handed from — the analysis or swipe an
  // inter-app send came out of — stamped as parents of the run it feeds. Any
  // other write to the box drops them, hand edits included: an edited source
  // is the member's own (the rule the picked-script chip follows too).
  const [sourceParents, setSourceParents] = usePersistedState<Lineage[] | null>(`${baseKey}:sourceParents`, null)
  const replaceSource = (text: string, parents: Lineage[] | null = null) => {
    setSource(text)
    setSourceParents(parents)
  }
  // Override for the blueprint auto-detect: remix the pasted blueprint as a
  // plain script (a batch of variations) instead of rewriting its scene prompts.
  const [forceTranscript, setForceTranscript] = useState(false)
  const [brief, setBrief] = usePersistedState(`${baseKey}:brief`, '')
  const [writeStyle, setWriteStyle] = usePersistedState<WriteStyle>(`${baseKey}:writeStyle`, 'pas', {
    sanitize: (v) => (isWriteStyle(v) ? v : 'pas'),
  })
  const [writeFormat, setWriteFormat] = usePersistedState<WriteFormat>(`${baseKey}:writeFormat`, 'script', {
    sanitize: (v) => (isWriteFormat(v) ? v : 'script'),
  })
  const [writeLength, setWriteLength] = usePersistedState<WriteLength>(`${baseKey}:writeLength`, 15)
  // Remix's own length, kept in its own slot: it carries a 'default' (keep the
  // source ad's length) that Write New has no meaning for, and the two modes'
  // picks shouldn't overwrite each other.
  const [remixLength, setRemixLength] = usePersistedState<RemixLength>(`${baseKey}:remixLength`, DEFAULT_REMIX_LENGTH, {
    sanitize: (v) => (isRemixLength(v) ? v : DEFAULT_REMIX_LENGTH),
  })
  // How many takes a generate returns. Applies to both modes; Hooks ignores it.
  const [variationCount, setVariationCount] = usePersistedState<VariationCount>(`${baseKey}:variationCount`, DEFAULT_VARIATION_COUNT, {
    sanitize: (v) => (isVariationCount(v) ? v : DEFAULT_VARIATION_COUNT),
  })
  // Hooks format: which formula family the pack draws from ('auto' = mixed).
  const [hookCategory, setHookCategory] = usePersistedState<HookCategoryChoice>(`${baseKey}:hookCategory`, 'auto', {
    sanitize: (v) => (isHookCategoryChoice(v) ? v : 'auto'),
  })
  // How many hooks a Hooks generate returns. Its own slot, not variationCount:
  // that one counts whole scripts, and the two lists don't overlap.
  const [hookCount, setHookCount] = usePersistedState<HookCount>(`${baseKey}:hookCount`, DEFAULT_HOOK_COUNT, {
    sanitize: (v) => (isHookCount(v) ? v : DEFAULT_HOOK_COUNT),
  })
  const [selectedProductId, setSelectedProductId] = usePersistedState<string | null>(`${baseKey}:productId`, null)
  const [additionalContext, setAdditionalContext] = usePersistedState(`${baseKey}:context`, '')

  const [variations, setVariations] = usePersistedState<string[]>(`${baseKey}:variations`, [])
  // Snapshot of the mode + style that produced the *currently shown*
  // variations. The output panel labels off these (not the live left-panel
  // selectors) so flipping the Style/mode after a generation doesn't
  // retroactively relabel the cards or their save-to-bank titles.
  const [outputMode, setOutputMode] = usePersistedState<ScriptMode>(`${baseKey}:outputMode`, 'remix')
  const [outputStyle, setOutputStyle] = usePersistedState<WriteStyle>(`${baseKey}:outputStyle`, 'pas', {
    sanitize: (v) => (isWriteStyle(v) ? v : 'pas'),
  })
  // Format pinned to the *currently shown* output, so the cards keep the labels
  // of the run that produced them when the live left-panel toggle moves on.
  const [outputFormat, setOutputFormat] = usePersistedState<WriteFormat>(`${baseKey}:outputFormat`, 'script', {
    sanitize: (v) => (isWriteFormat(v) ? v : 'script'),
  })
  // Remix only: the angle list that produced the *currently shown* cards, so
  // labels come from what actually ran rather than from re-deriving off a list
  // that may have been reordered or resized since.
  const [outputAngles, setOutputAngles] = usePersistedState<RemixAngle[] | null>(`${baseKey}:outputAngles`, null)
  // Remix only: the one voice brief the shown run came back with. Its own slot
  // rather than a line inside a variation — nothing generates it into a take,
  // and it belongs to the batch, not to any card in it.
  const [outputVoiceProfile, setOutputVoiceProfile] = usePersistedState<string>(`${baseKey}:outputVoiceProfile`, '')
  const [outputHookCategory, setOutputHookCategory] = usePersistedState<HookCategoryChoice>(`${baseKey}:outputHookCategory`, 'auto', {
    sanitize: (v) => (isHookCategoryChoice(v) ? v : 'auto'),
  })
  // The product the shown takes were written for — what Save to Bank links them
  // to and names them after. Pinned like the labels above: it used to follow the
  // live picker, so Clear (which promises the takes stay) or picking the next
  // run's product filed these takes unlinked or against the wrong product. An
  // empty slot (a draft from before this existed) starts from the persisted
  // pick, which is what those takes were being linked to all along.
  const [outputProductId, setOutputProductId] = usePersistedState<string | null>(`${baseKey}:outputProductId`, selectedProductId)
  // Runs a previous page load left writing (see runJournal.ts), read once. The
  // live ones rejoin the queue below as if they had never left it.
  const [journal] = useState(() => readJournal(Date.now()))
  // The pane was parked on a run still writing when the page went (that is the
  // only way it reloads onto an empty canvas with a run in the journal), so it
  // goes back to watching the newest one.
  const [resumeOnto] = useState(() => (variations.length === 0 ? journal.live[0]?.run.id ?? null : null))
  // What the Output pane is showing: a finished history row, or one of the runs
  // still writing (both are addressed by the same id — see PendingScriptRun).
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(resumeOnto)
  // Every run in flight, newest first — so the in-progress block and the
  // day-grouped rows under it read as one most-recent-first list rather than as
  // two orderings. They are HISTORY rows from the moment they are fired, so
  // Generate never stands down: press it again and a second card joins the
  // queue, exactly as pressing a media app's Generate twice queues two tiles.
  const [pendingRuns, setPendingRuns] = useState<PendingScriptRun[]>(() => journal.live.map((e) => e.run))
  // The failure the pane is showing, and the run its Retry acts on.
  const [failure, setFailure] = useState<{ message: string; record: JournaledRun } | null>(null)
  // The one thing a run's async tail has to read back AFTER its await, and the
  // one it can't: the closure captured the render's `activeHistoryId`, and by
  // the time a script lands the member has usually moved the pane. Holds the id
  // of the still-writing run the pane is parked on, or null when it is parked
  // on finished work — which is exactly the question "may this run take the
  // pane when it lands?" asks. See the landing guard in driveRun.
  const watchedRunIdRef = useRef<string | null>(resumeOnto)
  // Bumped to open the Remix source's Reference Script picker from the empty
  // Output canvas; the picker itself lives in InputPanel.
  const [scriptPickerSignal, setScriptPickerSignal] = useState(0)
  // Phone-only: which of the two panes is on screen (ignored from md up).
  const [pane, setPane] = useState<'input' | 'output'>('input')
  // Whether the history rail is showing. Persisted, because it is a working
  // preference rather than a per-run state — a member recording their screen
  // shuts it once, not once per session. It ships SHUT at every width: the
  // first thing this pane should show is the thing you pressed Generate for,
  // not the list of what you pressed it for before. Only ever a default — the
  // stored answer, once there is one, is the member's.
  //
  // The slot is `:historyRail`, not the `:historyOpen` this was built under:
  // renaming it once made every browser that had shut the rail while it was
  // being built re-default rather than carry a stale `false` into the finished
  // thing. That was free only while the feature was unreleased; the flip to
  // shut-by-default came after, so it ships with the one-shot reset marker in
  // `useHistoryRailOpen` instead.
  const [historyOpen, setHistoryOpen] = useHistoryRailOpen()
  // "Clear the canvas" state. Holds a signature of the output that was cleared,
  // so the next generation (or a history restore) fills the panel again on its
  // own. Nothing is deleted — every take is already a History row; this exists
  // so the last run isn't sitting on camera while a new one is filmed.
  const [clearedSig, setClearedSig] = useState<string | null>(null)
  const [highlightField, setHighlightField] = useState<string | null>(null)

  // Pulse the dock dot while any script is being written.
  // Recording Mode's Loop holds a run mid-write; the dock says so too.
  const recordingLoop = useRecordingLoop()
  useReportActivity('script-architect', pendingRuns.length > 0 || recordingLoop)

  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)
  const getProductById = useBankStore((s) => s.getProductById)
  const products = useBankStore((s) => s.products)
  // Recording Mode hides the runs that existed when it was armed; a replay
  // brings them back one at a time.
  const scriptHistory = useVisibleRows(useBankStore((s) => s.scriptHistory), 'script')
  const loopSince = useRecordingLoopSince()
  const deleteScriptHistory = useBankStore((s) => s.deleteScriptHistory)

  const selectedProduct = useMemo<Product | null>(
    () => (selectedProductId ? products.find((p) => p.id === selectedProductId) ?? null : null),
    [selectedProductId, products],
  )
  const handleProductSelect = (p: Product | null) => setSelectedProductId(p?.id ?? null)

  // The pipeline the next Generate will run. The UI toggle only offers
  // Remix / Write New; within Remix, a detected scene blueprint routes to the
  // scene-rewrite ('reverse-engineer') pipeline unless the user overrides.
  const isBlueprint = detectSceneBlueprint(source)
  const resolvedMode: ScriptMode = mode === 'write'
    ? 'write'
    : isBlueprint && !forceTranscript ? 'reverse-engineer' : 'remix'

  // The Output pane is a slot addressed by id, so "is it watching something
  // write?" is a lookup, not a flag. Non-null is the one state that draws the
  // writing face.
  // Recording Mode's Loop parks the pane on a run that never lands, built from
  // the inputs on screen, and lists it in History like any other.
  const loopRun: PendingScriptRun | null = recordingLoop
    ? {
        id: 'replay-loop',
        mode: resolvedMode,
        writeStyle,
        writeFormat,
        hookCategory,
        hookCount,
        variationCount,
        productName: selectedProduct?.productName,
        productId: selectedProduct?.id,
        inputSummary: (mode === 'write' ? brief : source).slice(0, 200),
        startedAt: loopSince,
      }
    : null
  const shownRuns = loopRun ? [loopRun, ...pendingRuns] : pendingRuns
  const watchedRun = loopRun ?? pendingRuns.find((r) => r.id === activeHistoryId) ?? null
  const outputSig = `${activeHistoryId ?? ''}|${variations.length}|${(variations[0] ?? '').slice(0, 64)}`
  const cleared = !watchedRun && variations.length > 0 && clearedSig === outputSig

  // Consume inter-app payloads. Both Ad Analyzer send actions land in the
  // same merged source box — the format detection picks the pipeline.
  // Applied from an effect EVENT rather than the effect body: it reads the
  // latest setters and bank lookup without their being dependencies, and the
  // React Compiler — which compiles this component since the run's tail lost
  // its try/finally — rejects state set synchronously in an effect body.
  const applyPayload = useEffectEvent((payload: NonNullable<typeof interAppPayload>) => {
    const { targetField, data } = payload
    if (targetField === 'reverseEngineerPrompt') {
      const sent = data as ReverseEngineerPayload | string
      const full = typeof sent === 'string'
        ? sent
        : (sent.fullPrompt ?? (sent.scenes ?? [])
            .map((s) => `--- Scene ${s.index}: ${s.label} (${s.startTime}-${s.endTime}) ---\n${s.prompt}`)
            .join('\n\n'))
      setMode('remix')
      setForceTranscript(false)
      setSource(full)
      setSourceParents(payload.parents ?? null)
      setHighlightField('source')
      setTimeout(() => setHighlightField(null), 800)
    } else if (targetField === 'winningTranscript' || targetField === 'reconstructionPrompt') {
      setMode('remix')
      setForceTranscript(false)
      setSource(data as string)
      setSourceParents(payload.parents ?? null)
      setHighlightField('source')
      setTimeout(() => setHighlightField(null), 800)
    } else if (targetField === 'productId') {
      const product = getProductById(data as string)
      if (product) setSelectedProductId(product.id)
    }
  })
  useEffect(() => {
    if (activeApp !== 'script-architect') return
    if (!interAppPayload || interAppPayload.targetApp !== 'script-architect') return
    applyPayload(interAppPayload)
    consumePayload()
  }, [interAppPayload, activeApp, consumePayload])

  // Park the Output pane on `run` and pin the labels the cards read off. Both
  // the moment a run is fired and the moment it lands go through this, so the
  // writing face and the takes it turns into can't describe the run
  // differently — and a member who browsed History mid-run, which moves every
  // one of these, gets them put back.
  const pinRun = (run: PendingScriptRun) => {
    setActiveHistoryId(run.id)
    setOutputMode(run.mode)
    setOutputStyle(run.writeStyle)
    setOutputFormat(run.writeFormat)
    setOutputHookCategory(run.hookCategory)
    setOutputProductId(run.productId ?? null)
  }

  // The same slot with nothing in it yet: the run as fired, or as clicked back
  // to from its in-progress card. Either way the pane is now watching a run
  // that is still writing, which is what the guard below reads.
  const showRunEmpty = (run: PendingScriptRun) => {
    watchedRunIdRef.current = run.id
    pinRun(run)
    setClearedSig(null)
    setVariations([])
    setOutputAngles(null)
    setOutputVoiceProfile('')
  }

  // Drive one run from its calls to its row: a fresh press, or a run picked
  // back up (after a reload, or by a Retry that still holds kie tasks). Its
  // taskIds are written to the journal as they arrive — that is what a reload
  // resumes from — and dropped as a task dies, so a Retry never waits on one.
  const driveRun = async (record: JournaledRun, how: 'fresh' | 'resume') => {
    const { run } = record
    const taskIds = { ...record.taskIds }
    const hooks: TaskHooks = {
      onTaskId: (slot, taskId) => {
        taskIds[slot] = taskId
        journalTaskId(run.id, slot, taskId)
      },
      onTaskDead: (slot) => {
        delete taskIds[slot]
        unjournalTask(run.id, slot)
      },
    }
    // Picked back up by two tabs after one reload, a run is landed by whichever
    // finishes first — it unjournals the run, and the other leaves the row to
    // it. Only a run that WAS journalled can have been taken that way; one the
    // journal couldn't store (a full quota) always lands here.
    const journaled = isJournaled(run.id)
    let task: ScriptTask | null = null
    let error: unknown = null
    try {
      task = how === 'resume'
        ? await resumeScriptRun(record.input, taskIds, { provenance: record.provenance }, hooks)
        : await scriptRunner.start(record.input, { provenance: record.provenance }, hooks)
      // The runner writes the history row, under the run's own id.
      if (how === 'resume' && journaled && !isJournaled(run.id)) task = null
      else await scriptRunner.finish(task)
    } catch (err) {
      error = err
    }
    unjournalRun(run.id)
    releaseRun(run.id)
    setPendingRuns((prev) => prev.filter((r) => r.id !== run.id))

    if (error) {
      const message = scriptRunner.describeError(error)
      const retryable: JournaledRun = { ...record, taskIds }
      // Only the pane parked on THIS run should turn into its error; anyone
      // reading something else gets the toast and keeps their page. The pane
      // the run was fired into is already empty, which is the state OutputPanel
      // renders an error in.
      if (watchedRunIdRef.current === run.id) {
        watchedRunIdRef.current = null
        setFailure({ message, record: retryable })
      }
      useAppStore.getState().addToast(
        message,
        'error',
        MEMBER_FIX_MESSAGES.has(message) ? undefined : { label: 'Retry', run: () => retryRun(retryable) },
      )
      return
    }
    if (!task) {
      if (watchedRunIdRef.current === run.id) watchedRunIdRef.current = null
      return
    }

    const { result } = task
    // The finished run takes the pane, even if the member wandered off into a
    // finished row while it wrote — that is what they pressed Generate for.
    // The one thing it will not do is steal the pane from ANOTHER run still
    // being written: watching a script arrive is the one state where being
    // yanked away loses something you can't get back with a click.
    const watchingAnotherRun =
      watchedRunIdRef.current !== null && watchedRunIdRef.current !== run.id
    if (!watchingAnotherRun) {
      watchedRunIdRef.current = null
      pinRun(run)
      setVariations(result.variations)
      setOutputAngles(result.angles ?? null)
      setOutputVoiceProfile(result.voiceProfile ?? '')
    }
    // Count what actually came back rather than the configured batch size, so
    // the toast stays honest if a take fails or the count changes again.
    useAppStore.getState().addToast(landedMessage(run.mode, run.writeFormat, result.variations), 'success')
  }

  // Put a run in the queue and the pane on it, then start it. Every way a run
  // begins goes through here — Generate, a Retry of either kind — so each gets
  // the same in-progress card, the same writing face and the same journal entry.
  const startRun = (record: JournaledRun, how: 'fresh' | 'resume') => {
    const { run } = record
    setPendingRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)])
    setFailure(null)
    // On a phone only one pane is on screen — follow the run to the takes.
    setPane('output')
    showRunEmpty(run)
    // Recording Mode: a fresh press spends nothing. A resume submits nothing
    // either way — it only waits on tasks kie already has.
    if (how === 'fresh' && isRecordingActive()) {
      void replayScriptRun(run, record.input)
      return
    }
    // Already being driven (a second Retry on the same run) — its own tail lands it.
    if (!claimRun(run.id)) return
    journalRun(record)
    void driveRun(record, how)
  }

  // Retry — from the pane's error or the failure toast. While kie still holds
  // one of the run's takes, it RESUMES that run and says so: the takes are
  // written and billed, and re-submitting would pay for them twice. Otherwise
  // it is a new run of the same inputs (a new id, so its card is a new card).
  const retryRun = (record: JournaledRun) => {
    if (hasLiveTakes(record)) {
      useAppStore.getState().addToast('Picking the script back up from kie.ai. It\'s the same run, so nothing is charged again.', 'info')
      startRun(record, 'resume')
      return
    }
    const run = mintRun(record.run)
    startRun({ run, input: { ...record.input, id: run.id }, provenance: record.provenance, taskIds: {} }, 'fresh')
  }

  // `sourceScriptId` is the Scripts bank row the source box was filled from,
  // while it's still unedited — a parent of whatever this run writes.
  const handleGenerate = (productContext: EditableProductContext | null, sourceScriptId: string | null = null) => {
    const sourceFilled = mode === 'write' ? true : source.trim()
    // A product is OPTIONAL in both modes — a member describing the product in
    // the brief or the instructions shouldn't have to bank it first. What each
    // mode still needs is a subject from SOMEWHERE: Remix has its source
    // script, and Write New needs the product or the brief (with neither, the
    // runner's open-brief stand-in would be asking for an ad about nothing).
    if (!sourceFilled) return
    if (mode === 'write' && !selectedProduct && !brief.trim()) return

    const inputSource = mode === 'write' ? brief : source
    const run = mintRun({
      mode: resolvedMode,
      writeStyle,
      writeFormat,
      hookCategory,
      hookCount,
      variationCount,
      productName: selectedProduct?.productName,
      productId: selectedProduct?.id,
      inputSummary: inputSource.slice(0, 200),
    })
    // Everything the run reads, snapshotted now: the member can keep typing.
    const input: ScriptRunInput = {
      id: run.id,
      mode: resolvedMode,
      source,
      brief,
      writeStyle,
      writeFormat,
      writeLength,
      remixLength,
      hookCategory,
      hookCount,
      variationCount,
      productId: selectedProduct?.id ?? null,
      productName: selectedProduct?.productName,
      productContext,
      additionalContext,
    }
    startRun({
      run,
      input,
      provenance: {
        parents: lineageOf(
          selectedProduct ? { bank: 'products', id: selectedProduct.id } : null,
          mode === 'remix' && sourceScriptId ? { bank: 'scripts', id: sourceScriptId } : null,
          mode === 'remix' ? sourceParents : null,
        ),
      },
      taskIds: {},
    }, 'fresh')
  }

  // Runs a previous page load left in the journal. The live ones are already
  // cards in the queue (see `journal`); this attaches their polls. The lost
  // ones — streamed, so nothing survived the reload — are said out loud with a
  // Retry rather than vanishing, which is what every run used to do on a
  // reload. The claim and the unjournal make both halves safe to run twice.
  const resumeJournal = useEffectEvent(() => {
    for (const entry of journal.stale) unjournalRun(entry.run.id)
    for (const entry of journal.live) {
      if (claimRun(entry.run.id)) void driveRun(entry, 'resume')
    }
    const lost = journal.lost.filter((entry) => unjournalRun(entry.run.id))
    if (lost.length === 0) return
    useAppStore.getState().addToast(
      lost.length === 1
        ? LOST_IN_RELOAD_MESSAGE
        : `${lost.length} scripts were being written when the page reloaded, and the model writing them can't be picked back up. Generate them again.`,
      'error',
      { label: 'Retry', run: () => { for (const entry of lost) retryRun(entry) } },
    )
  })
  useEffect(() => { resumeJournal() }, [])

  // Put a finished row's takes in the Output pane, labelled as that row. The
  // output half of opening a History row, shared with Recording Mode's replay,
  // which must not touch the inputs the member is typing on camera.
  const showRowOutput = (item: ScriptHistoryItem) => {
    setVariations(item.variations)
    setActiveHistoryId(item.id)
    setFailure(null)
    // Pin the output labels to the run we're restoring.
    setOutputMode(item.mode)
    setOutputStyle(item.writeStyle && item.writeStyle in WRITE_STYLE_META ? (item.writeStyle as WriteStyle) : 'pas')
    // A row from the retired Cinematic format restores as a plain script take.
    setOutputFormat(isWriteFormat(item.writeFormat) ? item.writeFormat : 'script')
    setOutputHookCategory(isHookCategoryChoice(item.hookCategory) ? item.hookCategory : 'auto')
    setOutputProductId(item.linkedProductId ?? null)
    // Rows saved before the count was pickable carry no angle list; OutputPanel
    // falls back to matching them by variation count.
    setOutputAngles((item.remixAngles as RemixAngle[] | undefined) ?? null)
    // Rows saved before the voice brief existed carry none, and so do runs
    // whose profile call failed — both restore to no card.
    setOutputVoiceProfile(item.voiceProfile ?? '')
  }

  // Recording Mode: the run writes for the replay length, then the oldest
  // hidden row lands in its place — same landing guard as a real run. Nothing
  // reaches kie or the bank.
  const replayScriptRun = async (run: PendingScriptRun, input: ScriptRunInput) => {
    const row = await scriptRunner.replay(input)
    setPendingRuns((prev) => prev.filter((r) => r.id !== run.id))
    const watchingAnotherRun = watchedRunIdRef.current !== null && watchedRunIdRef.current !== run.id
    if (watchedRunIdRef.current === run.id) watchedRunIdRef.current = null
    if (!row) return
    if (!watchingAnotherRun) showRowOutput(row)
    useAppStore.getState().addToast(landedMessage(row.mode, row.writeFormat, row.variations), 'success')
  }

  const handleSelectHistory = (item: ScriptHistoryItem) => {
    // The pane is on finished work now, so a run that lands may take it back.
    watchedRunIdRef.current = null
    // A click in History is a request to SEE that run, so it always uncovers
    // the canvas — including when the run picked is the one that was cleared,
    // which the signature alone reads as "still the thing I cleared" and left
    // blank. That was reported as history rows not opening at all.
    setClearedSig(null)
    // The rail covers the takes (`components/RailOverlay`), so picking a run is
    // a request to read it and hands the pane back.
    setHistoryOpen(false)
    setMode(item.mode === 'write' ? 'write' : 'remix')
    showRowOutput(item)
    if (isVariationCount(item.variationCount)) setVariationCount(item.variationCount)
    // Rows saved before Remix had a length carry none — they keep the current
    // pick rather than snapping to 'default'.
    if (item.mode === 'remix' && isRemixLength(item.remixLength)) setRemixLength(item.remixLength)
    // Restore the left-panel inputs too. Older rows (saved before these
    // fields existed) fall back to the inputSummary slice for the source so
    // something sensible reappears.
    const restoredSource = item.mode === 'reverse-engineer'
      ? (item.reversePrompt ?? item.inputSummary)
      : item.mode === 'remix'
        ? (item.winningTranscript ?? item.inputSummary)
        : (item.winningTranscript || item.reversePrompt || '')
    replaceSource(restoredSource)
    // Keep a regenerate faithful to the restored run: if this row remixed a
    // blueprint-shaped source as a plain script, restore that override too.
    setForceTranscript(item.mode === 'remix' && detectSceneBlueprint(restoredSource))
    setAdditionalContext(item.additionalContext ?? '')
    setSelectedProductId(item.linkedProductId ?? null)
    if (item.mode === 'write') {
      setBrief(item.brief ?? item.inputSummary)
      if (item.writeStyle && item.writeStyle in WRITE_STYLE_META) setWriteStyle(item.writeStyle as WriteStyle)
      if (isWriteFormat(item.writeFormat)) setWriteFormat(item.writeFormat)
      if (isWriteLength(item.writeLength)) setWriteLength(item.writeLength)
      if (item.writeFormat === 'hooks') {
        if (isHookCategoryChoice(item.hookCategory)) setHookCategory(item.hookCategory)
        // Absent on rows saved before the count was pickable — those kept the
        // fixed ten, so restoring the default is faithful to what ran.
        if (isHookCount(item.hookCount)) setHookCount(item.hookCount)
      }
    }
  }

  // Clicking an in-progress card puts the Output pane back on that run. It
  // restores no inputs: the run's own inputs are still in the left panel unless
  // the member has since loaded another row, and silently undoing that edit is
  // not what clicking a status card asks for.
  const handleWatchPending = (run: PendingScriptRun) => {
    setFailure(null)
    setHistoryOpen(false)
    showRunEmpty(run)
  }

  // "Clear" on the References card: the inputs only. Every take stays on the
  // canvas and in History — that is what the button's arm and tooltip promise,
  // and the output labels are pinned to their own snapshots, so the shown cards
  // keep their wording as the live selectors reset.
  const handleClearInputs = () => {
    replaceSource('')
    setBrief('')
    setAdditionalContext('')
    setSelectedProductId(null)
    setForceTranscript(false)
  }

  // Remix with nothing in the box: the empty Output canvas offers the three
  // ways to get a source, rather than waiting on one a newcomer doesn't have.
  // Outliers only while it's switched on — hiding it takes every door to it.
  const outliersOn = useAppVisible('discover')
  const openApp = useAppStore((s) => s.openApp)
  const findSource = mode === 'remix' && !source.trim()
    ? {
        onFindOutlier: outliersOn ? () => openApp('discover') : undefined,
        onAnalyzeAd: () => openApp('ad-anatomy'),
        onPickScript: () => {
          // On a phone the picker opens over Setup, which is where the pick
          // lands and where Generate is.
          setPane('input')
          setScriptPickerSignal((n) => n + 1)
        },
      }
    : null

  const handleDeleteHistory = (id: string) => {
    deleteScriptHistory(id)
    if (activeHistoryId === id) setActiveHistoryId(null)
  }

  // "New Script" in the history rail — the whole app back to a blank sheet:
  // the takes panel empties AND the setup column beside it resets (September
  // 2026, Massimo's call; it cleared the canvas alone before, which left the
  // last run's transcript, brief and product sitting in the inputs of a
  // "new" script). Nothing is deleted — every take is a row in the rail
  // underneath — but the inputs are the half no row holds a copy of, which is
  // why the button arms first. Output labels are pinned to
  // outputMode/outputStyle snapshots, so any cards still on screen keep their
  // wording as the live selectors reset.
  const handleNewScript = () => {
    setClearedSig(outputSig)
    handleClearInputs()
    // A failed run's error goes with the sheet it was on; its toast still
    // offers the Retry if it's wanted.
    setFailure(null)
    // New lives INSIDE the rail, and the rail covers the takes it just
    // cleared — so leaving it open reads as the press having done nothing.
    // Same rule as picking a row: acting in the rail hands the pane back.
    setHistoryOpen(false)
  }

  return (
    <div className="relative flex h-full flex-col md:flex-row">
      <MobilePaneTabs
        options={[
          { value: 'input', label: 'Setup', icon: PenLine },
          { value: 'output', label: 'Output', icon: FileText },
        ]}
        value={pane}
        onChange={setPane}
        accent="scripts"
      />

      <div className={paneClass(pane === 'input', 'md:w-1/3 md:min-w-[380px] md:shrink-0 md:border-r md:border-ink/5')}>
        <InputPanel
          mode={mode}
          onModeChange={setMode}
          onClearInputs={handleClearInputs}
          source={source}
          onSourceChange={replaceSource}
          isBlueprint={isBlueprint}
          forceTranscript={forceTranscript}
          onForceTranscriptChange={setForceTranscript}
          brief={brief}
          onBriefChange={setBrief}
          writeStyle={writeStyle}
          onWriteStyleChange={setWriteStyle}
          writeFormat={writeFormat}
          onWriteFormatChange={setWriteFormat}
          writeLength={writeLength}
          onWriteLengthChange={setWriteLength}
          remixLength={remixLength}
          onRemixLengthChange={setRemixLength}
          variationCount={variationCount}
          onVariationCountChange={setVariationCount}
          hookCategory={hookCategory}
          onHookCategoryChange={setHookCategory}
          hookCount={hookCount}
          onHookCountChange={setHookCount}
          selectedProduct={selectedProduct}
          onProductSelect={handleProductSelect}
          additionalContext={additionalContext}
          onAdditionalContextChange={setAdditionalContext}
          onGenerate={handleGenerate}
          highlightField={highlightField}
          openScriptPickerSignal={scriptPickerSignal}
        />
      </div>

      {/* `md:overflow-hidden` is load-bearing, and it is the one thing this
          pane was missing that B-Roll, Voiceovers and Playground all have. The
          history rail travels on a `translateX` from outside its host
          (`components/RailOverlay`), so without a clip on the pane it overflows
          the app shell — whose wrapper is `overflow-y-auto`, and CSS turns the
          other axis of that into `auto` too. A horizontal scrollbar therefore
          appeared for the length of the slide, took ~11px off the shell's
          height, and every bottom-anchored thing in BOTH columns jumped up and
          back down: reported as the Generate button jerking whenever History
          was opened in Remix. Clipping here means the slide never overflows and
          nothing outside the pane can feel it. */}
      <div className={paneClass(pane === 'output', 'md:min-w-0 md:flex-1 md:overflow-hidden')}>
        <RightPanel
          variations={variations}
          mode={resolvedMode}
          outputAngles={outputAngles}
          outputMode={outputMode}
          writeFormat={outputFormat}
          writeStyleLabel={WRITE_STYLE_META[outputStyle].label}
          hookCategoryLabel={HOOK_CATEGORY_META[outputHookCategory].label}
          hookCount={hookCount}
          linkedProductId={outputProductId}
          watchedRun={watchedRun}
          activeHistoryId={activeHistoryId}
          error={failure?.message ?? null}
          onRetry={failure ? () => retryRun(failure.record) : undefined}
          findSource={findSource}
          onEditVariation={(index, text) =>
            setVariations((prev) => prev.map((v, i) => (i === index ? text : v)))
          }
          voiceProfile={outputVoiceProfile}
          onEditVoiceProfile={setOutputVoiceProfile}
          cleared={cleared}
          onClearCanvas={handleNewScript}
          history={scriptHistory}
          pendingRuns={shownRuns}
          onSelectHistory={handleSelectHistory}
          onWatchPending={handleWatchPending}
          onDeleteHistory={handleDeleteHistory}
          historyOpen={historyOpen}
          onToggleHistory={() => setHistoryOpen((v) => !v)}
        />
      </div>
    </div>
  )
}
