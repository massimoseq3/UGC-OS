import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Film, AlertCircle, Plus, Images, X, Palette, Download, Video as VideoIcon, Clapperboard, Coins, Pencil, Check, ChevronRight, ChevronDown, Sparkle } from 'lucide-react'
import GenerationProgress from '../../../components/GenerationProgress'
import type { BrollResult, Scene, PromptVariation, CardState, ReferenceImage, BatchVideoSettings } from '../types'
import type { Product, Model } from '../../../stores/types'
import { createDefaultCardState } from '../cardState'
import { cardClipSeconds, speaksItsLine } from '../services/clipDuration'
import type { VideoHistoryItem } from '../../../stores/types'
import { finishImageTask, resolveImageModelId } from '../services/generateBroll'
import { getContinuousStyle } from '../services/generateContinuous'
import { finishVideoTask } from '../services/generateVideo'
import { claimTask, releaseTask } from '../services/taskRegistry'
import { useReconnectTick } from '../../../hooks/useReconnectTick'
import { isPollTimeout } from '../../../utils/kie'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useCreditsStore } from '../../../stores/creditsStore'
import { getDefaultModel, getModel, estimateCredits, formatCredits, officialSavingsPercent, snapVideoDuration, videoResolutionLabel, type ImageResolution, type Mode } from '../../../utils/models'
import ModelPickerModal from '../../../components/ModelPickerModal'
import ModelTriggerLabel from '../../../components/ModelTriggerLabel'
import ProviderLogo from '../../../components/ProviderLogo'
import ConstraintChip from '../../../components/ConstraintChip'
import AspectIcon from '../../../components/AspectIcon'
import VariationCard from './VariationCard'
import { humanizeError } from '../../../utils/friendlyError'
import ClipDownloadModal, { type ClipDownloadEntry } from '../../../components/ClipDownloadModal'
import { useCloseOnAppSwitch } from '../../../hooks/useCloseOnAppSwitch'
import useCloseOnEscape from '../../../hooks/useCloseOnEscape'
import AnchoredPopover from '../../../components/video/AnchoredPopover'
import useMeasuredHeight from '../../../hooks/useMeasuredHeight'
import { MenuSurface, MenuItem, MENU_ROW_HEIGHT } from '../../../components/Menu'
import { useBackdropClose } from '../../../hooks/useBackdropClose'
import CharacterPill from './CharacterPill'
import Dropdown from '../../../components/Dropdown'
import { replayWait, useRecordingActive, useRecordingLoop, useRecordingLoopSince, useRecordingStore } from '../../../stores/recordingStore'
import {
  imageRevealKey, nextHiddenImage, nextHiddenVideo, putCard, REPLAY_ID_PREFIX, videoRevealKey, viewCard,
  type CardFilter, type CardLens, type ReplayEntry,
} from '../cardLens'
import type { GeneratedImage, GeneratedVideo } from '../types'

interface ScenesViewProps {
  result: BrollResult | null
  isGenerating?: boolean
  error?: string | null
  onAddVariation: (sceneNumber: number, variation: PromptVariation) => void
  onDeleteVariation: (sceneNumber: number, variationId: string) => void
  // Retype a scene's spoken line. Swaps the quoted words in that scene's
  // prompts — no LLM call, no credits. See services/scriptLineEdit.ts.
  onEditSceneLine?: (sceneNumber: number, line: string) => void
  // Edit the ad's shared dialogue voice profile (from a dialogue card's modal).
  onUpdateVoiceProfile?: (text: string) => void
  characterRef?: ReferenceImage
  productRef?: ReferenceImage
  productPhotos?: string[]
  onChangeStyle?: () => void
  selectedProduct?: Product | null
  selectedModel?: Model | null
  selectedProductId?: string
  selectedModelId?: string
  selectedScriptId?: string
  // Plain-text product / model context strings — passed down to VariationCard
  // so its Enhance / Regenerate-prompt service calls can ground the LLM.
  productContext?: string
  modelContext?: string
  onOpenCharacterPicker?: () => void
  onOpenProductPicker?: () => void
  // CardStates live in RightPanel so the Gallery view can see in-flight cards
  // while Scenes is hidden.
  cardStates: Record<string, CardState>
  setCardStates: React.Dispatch<React.SetStateAction<Record<string, CardState>>>
  // The shut History rail's toggle, when there is one. It rides at the RIGHT
  // END OF THIS STRIP rather than in a column of its own (September 2026,
  // Massimo's call): a laid-out column beside the storyboard narrowed it by
  // ~135px and left the button standing on bare panel next to a frosted bar.
  // In here the bar's own glass runs under it and the storyboard keeps its
  // full width. Outside the scroll port, so it can't be swiped away.
  railToggle?: React.ReactNode
  // What the cards show: everything, or only their prompts / stills / clips
  // (see cardLens.ts). The strip's toggle.
  cardFilter?: CardFilter
  onCardFilterChange?: (filter: CardFilter) => void
}

// Defaults for a bulk video run — deliberately the cheap tier. A batch here is
// one clip per card (often a dozen at once) on the member's own credits, so it
// starts at the smallest usable size rather than inheriting whatever each card
// was last left on. It clamps to the chosen model's grid.
const BATCH_VIDEO_RESOLUTION = '480p'

// Clip length is the exception on a WITH DIALOGUE storyboard, and there it
// defaults to AUTO: a dozen spoken lines are a dozen different lengths, so one
// number for all of them is exactly the flat-5s problem the per-line estimate
// exists to fix — the long lines come back gabbled and the short ones come back
// slow. Each card uses its own length (its line's estimate, or whatever the
// member pinned in its modal) unless the dialog is set to a fixed number, which
// is still one click away. A silent b-roll run never offers this row: nothing in
// it is speaking, so there are no words for a length to follow.
const AUTO_DURATION = 'auto'

// Stands in for a card that somehow has no state yet when the dialog prices the
// run. Only reachable between a fresh storyboard landing and the card-state
// rebuild, and only as a number to multiply — the card itself re-derives its
// own length when it fires.
const BATCH_VIDEO_DURATION_FALLBACK = 5

// The two ways a card's still can drive a clip: as a true first frame, or as a
// reference image (Gemini Omni's only route — it has no image-to-video mode but
// animates a still perfectly well as a reference). A model with neither can't
// use the still at all, which is what greys it out in the batch dialog.
const STILL_CAPABLE_MODES: Mode[] = ['image-to-video', 'reference-to-video']

// ─── Batch scope ─────────────────────────────────────────────────────────
// The storyboard is a grid: one row per script line, one column per option, and
// a batch dialog scopes along BOTH — the Options chips across, the line
// checklist down. Every press opens on the whole of what it reached, on both
// axes. They used to open on the leftmost column with work left, so that a
// second press picked up where the first left off — cheaper per press, but a
// button labelled "Generate all images" that quietly does a third of them is a
// button that doesn't do what it says, and members read the short run as a bug
// rather than a saving. Scoping is the deliberate act now, not the default.

interface BatchRequest {
  // Every card the press covers. BOTH scope filters are applied inside the
  // dialog, so re-scoping never reopens it — which is also why a per-scene
  // press hands over its whole row rather than one column.
  // (`scope` used to name the run under the title; that line is gone.)
  keys: string[]
  // Video runs only: animate the stills that exist, and nothing else. A plain
  // video batch also fires cards that have no image yet, rendering those from
  // the prompt alone — which is a different, blinder spend. After a
  // Generate-all-images pass, "animate what I can see" is the step the member
  // actually wants.
  stillsOnly?: boolean
}

// Card keys are `${scene.number}-${variationIndex}` — the index IS the column.
const columnOf = (key: string) => Number(key.split('-')[1])

const columnsIn = (keys: string[]) =>
  [...new Set(keys.map(columnOf))].filter((n) => Number.isFinite(n)).sort((a, b) => a - b)

// The other half of a card key: which SCENE — which line of the script — it
// belongs to. A batch is scoped along both axes, columns across and lines down.
const sceneOf = (key: string) => Number(key.split('-')[0])

const scenesIn = (keys: string[]) =>
  [...new Set(keys.map(sceneOf))].filter((n) => Number.isFinite(n)).sort((a, b) => a - b)

// The still a card is currently showing — the user's pick if they made one,
// otherwise the one on the card face. Used to resolve what the next dialogue
// card chains from.
// ─── Prompts Only / Recording Mode helpers (see cardLens.ts) ─────────────
export type CardReplayKind = 'image' | 'video' | 'animate'

const NO_REVEALS: Record<string, number> = {}

const CARD_FILTER_OPTIONS: Array<{ value: CardFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'prompts', label: 'Prompts' },
  { value: 'images', label: 'Images' },
  { value: 'videos', label: 'Videos' },
]

// One view object per persisted card for as long as neither the card nor the
// lens inputs that touch it change — the rows are memo'd on it.
const viewCache = new WeakMap<CardState, { key: string; filter: CardFilter; since: number; revealed: Record<string, number>; replays: ReplayEntry[] | undefined; view: CardState }>()
function cachedView(key: string, card: CardState, lens: CardLens): CardState {
  const replays = lens.replays[key]
  const hit = viewCache.get(card)
  if (hit && hit.key === key && hit.filter === lens.filter && hit.since === lens.since && hit.revealed === lens.revealed && hit.replays === replays) return hit.view
  const view = viewCard(key, card, lens)
  viewCache.set(card, { key, filter: lens.filter, since: lens.since, revealed: lens.revealed, replays, view })
  return view
}

function viewOrSelf(key: string, card: CardState, lens: CardLens | null): CardState {
  return lens ? cachedView(key, card, lens) : card
}

function mapOrNull<T, R>(value: T | null, fn: (v: T) => R): R | null {
  return value === null ? null : fn(value)
}

// Loop's standing tile on every card: an image render that never lands.
function loopReplayEntry(key: string, since: number): ReplayEntry {
  return {
    kind: 'image',
    entry: { id: `${REPLAY_ID_PREFIX}loop-${key}`, taskId: null, modelId: null, startedAt: since, prompt: '', aspectRatio: '9:16', resolution: '1K' },
  }
}

// A fake run's in-flight tile, shaped from the card's own settings so the
// generating face reads exactly as a real run's would.
function cardReplayEntry(kind: CardReplayKind, card: CardState | undefined): ReplayEntry {
  const id = `${REPLAY_ID_PREFIX}${crypto.randomUUID()}`
  const startedAt = Date.now()
  if (kind === 'image') {
    return {
      kind: 'image',
      entry: {
        id, taskId: null, modelId: null, startedAt,
        prompt: card?.editablePrompt ?? '',
        aspectRatio: card?.cardImageAspectRatio ?? '9:16',
        resolution: card?.cardImageResolution ?? '1K',
      },
    }
  }
  const settings = useSettingsStore.getState()
  return {
    kind: 'video',
    entry: {
      id, taskId: null, startedAt,
      modelId: settings.getAppModel('broll-studio:video') ?? getDefaultModel('broll-studio', 'video')?.id ?? '',
      prompt: (kind === 'animate' ? card?.animateMotion : card?.editablePrompt) ?? '',
      mode: kind === 'animate' ? 'image-to-video' : 'text-to-video',
      aspectRatio: card?.cardVideoAspectRatio ?? '9:16',
      durationSeconds: card?.cardVideoDurationSeconds ?? 5,
      resolution: card?.cardVideoResolution ?? '720p',
      audio: card?.cardVideoAudio ?? false,
    },
  }
}

function coverImageRef(card?: CardState): string | undefined {
  if (!card || card.images.length === 0) return undefined
  const picked = card.selected?.kind === 'image' ? card.images[card.selected.index] : undefined
  return (picked ?? card.images[card.currentImageIndex] ?? card.images[card.images.length - 1])?.imageUrl
}

// A label on the pane's header band that SHORTENS before it disappears. Full
// above the top step, one word between the steps, nothing at all below the
// bottom one — which leaves the button as its glyph, still the same 38px pill
// with the same tooltip. Two spans rather than a string picked in JS: the steps
// are CONTAINER queries on the band (`@container/bar`), so the row answers to
// the width of the output column and not to the window's, and nothing has to
// observe a resize to redraw a word. See the note on the band itself.
function BandLabel({ full, short }: { full: string; short: string }) {
  return (
    <>
      <span className="hidden whitespace-nowrap @[660px]/bar:inline @[860px]/bar:hidden">{short}</span>
      <span className="hidden whitespace-nowrap @[860px]/bar:inline">{full}</span>
    </>
  )
}

export default function ScenesView({
  result,
  isGenerating,
  error,
  onAddVariation,
  onDeleteVariation,
  onEditSceneLine,
  onUpdateVoiceProfile,
  characterRef,
  productRef,
  productPhotos,
  onChangeStyle,
  selectedProduct,
  selectedModel,
  selectedProductId,
  selectedModelId,
  selectedScriptId,
  productContext,
  modelContext,
  onOpenCharacterPicker,
  onOpenProductPicker,
  cardStates,
  setCardStates,
  railToggle,
  cardFilter = 'all',
  onCardFilterChange,
}: ScenesViewProps) {
  // The storyboard bar wraps, so the scroll port under it reserves its MEASURED
  // height rather than a hard-coded one. 57 is its one-line height, which is
  // what the first paint uses.
  const [barRef, barHeight] = useMeasuredHeight<HTMLDivElement>(57)
  const handleUpdateCardState = useCallback((key: string, updates: Partial<CardState>) => {
    setCardStates((prev) => {
      const existing = prev[key]
      if (!existing) {
        const placeholder: PromptVariation = { id: key, tag: 'ACTION', label: '', refs: 'both', prompt: '' }
        return { ...prev, [key]: { ...createDefaultCardState(placeholder), ...updates } }
      }
      // A write made through the Prompts Only view carries view-side arrays and
      // indexes; map them onto the full card so nothing hidden is lost.
      const lens = lensRef.current
      return { ...prev, [key]: { ...existing, ...(lens ? putCard(key, existing, updates, lens) : updates) } }
    })
  }, [setCardStates])

  // Functional variant for atomic array updates (parallel in-flight gens).
  // Plain onUpdateState captures `cardState` at call time, so rapid fires
  // race; this version always operates on the latest persisted card.
  const handleUpdateCardStateFn = useCallback(
    (key: string, updater: (prev: CardState) => Partial<CardState>) => {
      setCardStates((prev) => {
        const existing = prev[key]
        if (!existing) return prev
        return { ...prev, [key]: { ...existing, ...updater(existing) } }
      })
    },
    [setCardStates],
  )

  // ─── Card filter + Recording Mode ──────────────────────────────────────
  // One lens over every card (cardLens.ts): the strip's filter, the media
  // Recording Mode's Hide All covers and the takes its replays bring back,
  // and the fake in-flight tiles those replays and Loop draw. Null when none
  // of that is live, so a normal session renders the persisted cards untouched. Memoized by hand: this component is outside
  // the compiler (the resume effect's eslint-disable), and the rows below are
  // memo'd on their card objects.
  const recordingActive = useRecordingActive()
  const recordingLoop = useRecordingLoop()
  const loopSince = useRecordingLoopSince()
  const recordingRevealed = useRecordingStore((st) => st.revealed)
  const recordingHiddenBefore = useRecordingStore((st) => st.hiddenBefore)
  const hideSince = recordingActive && recordingHiddenBefore != null ? recordingHiddenBefore : null
  const [replays, setReplays] = useState<Record<string, ReplayEntry[]>>({})
  const allCardKeys = useMemo(
    () => (result?.scenes ?? []).flatMap((sc) => sc.variations.map((_, i) => `${sc.number}-${i}`)),
    [result],
  )
  const loopEntries = useMemo<Record<string, ReplayEntry[]>>(
    () => (recordingLoop
      ? Object.fromEntries(allCardKeys.map((k) => [k, [loopReplayEntry(k, loopSince)]]))
      : {}),
    [recordingLoop, allCardKeys, loopSince],
  )
  const lens = useMemo<CardLens | null>(() => {
    if (cardFilter === 'all' && hideSince == null && !recordingLoop && Object.keys(replays).length === 0) return null
    return {
      filter: cardFilter,
      since: hideSince ?? Number.NEGATIVE_INFINITY,
      revealed: recordingActive ? recordingRevealed : NO_REVEALS,
      // A card's own replays win over Loop's standing tile.
      replays: recordingLoop ? { ...loopEntries, ...replays } : replays,
    }
  }, [cardFilter, hideSince, recordingLoop, replays, loopEntries, recordingActive, recordingRevealed])
  const lensRef = useRef(lens)
  useEffect(() => { lensRef.current = lens }, [lens])
  const cardStatesRef = useRef(cardStates)
  useEffect(() => { cardStatesRef.current = cardStates }, [cardStates])
  // What every card, batch count and download list reads: the persisted
  // cards seen through the lens. Unchanged cards keep their view object.
  const shownCardStates = useMemo(() => {
    if (!lens) return cardStates
    const out: Record<string, CardState> = {}
    for (const [k, card] of Object.entries(cardStates)) out[k] = cachedView(k, card, lens)
    return out
  }, [cardStates, lens])

  // Recording Mode: a card "generates" for the replay length, then its hidden
  // take comes back — the cover first. Nothing reaches kie. A batch fires every
  // card at once, so each replay waits a little longer than the one before.
  const replaysRunningRef = useRef(0)
  const handleReplayCard = useCallback((key: string, kind: 'image' | 'video' | 'animate') => {
    const stagger = replaysRunningRef.current * 300
    replaysRunningRef.current += 1
    const card = cardStatesRef.current[key]
    const entry = cardReplayEntry(kind, card)
    setReplays((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), entry] }))
    void replayWait(stagger).then(() => {
      replaysRunningRef.current = Math.max(0, replaysRunningRef.current - 1)
      setReplays((prev) => {
        const rest = (prev[key] ?? []).filter((r) => r.entry.id !== entry.entry.id)
        const next = { ...prev }
        if (rest.length > 0) next[key] = rest
        else delete next[key]
        return next
      })
      const current = lensRef.current
      const real = cardStatesRef.current[key]
      if (!current || !real) return
      const revealKey = kind === 'image'
        ? mapOrNull(nextHiddenImage(key, real, current), (img: GeneratedImage) => imageRevealKey(key, img))
        : mapOrNull(nextHiddenVideo(key, real, current, kind === 'animate'), (vid: GeneratedVideo) => videoRevealKey(key, vid))
      if (revealKey) useRecordingStore.getState().reveal([revealKey])
    })
  }, [])

  // ─── Dialogue chain ────────────────────────────────────────────────────
  // In "Dialogue Clips" delivery each scene carries one talking-to-camera card,
  // and those cards chain: card N generates with card N-1's chosen still
  // attached, so the whole ad reads as one continuous piece to camera cut into
  // pieces rather than a new setup every line. Resolved here (the parent owns
  // every card's state) and handed down per card.
  const dialogueKeys = (result?.scenes ?? []).flatMap((s) => {
    const i = s.variations.findIndex((v) => v.tag === 'DIALOGUE')
    return i === -1 ? [] : [`${s.number}-${i}`]
  })
  // Each dialogue card chains from the nearest EARLIER dialogue card that
  // actually has an image — so generating out of order (or after one failed)
  // still finds an anchor instead of silently dropping the chain.
  const dialogueChainRefs: Record<string, string> = {}
  {
    let previous: string | undefined
    for (const key of dialogueKeys) {
      if (previous) dialogueChainRefs[key] = previous
      const own = coverImageRef(cardStates[key])
      if (own) previous = own
    }
  }

  // ─── Batch image generation ────────────────────────────────────────────
  // Fire image gen for many cards at once. Rather than lift the gen logic out
  // of VariationCard (it reads the latest card state at fire time), we bump a
  // per-card token; each card's own effect then runs handleGenerateImage. A
  // confirm step shows the aggregate cost against the live balance first.
  const balance = useCreditsStore((s) => s.balance)
  // Reactive global B-Roll image model so the picker, cost, and valid
  // resolutions/aspects in the confirm dialog all update as the user changes it.
  const batchImageModelId =
    useSettingsStore((s) => s.perAppModel['broll-studio:image:text-to-image']) ??
    getDefaultModel('broll-studio', 'image', 'text-to-image')?.id
  const [batchTokens, setBatchTokens] = useState<Record<string, number>>({})
  const [batchConfirm, setBatchConfirm] = useState<BatchRequest | null>(null)
  // Which OPTION columns this run covers — a set, not one pick, and every
  // option in it on open. See the note on ColumnChips.
  const [batchColumns, setBatchColumns] = useState<Set<number>>(() => new Set())
  // Which LINES of the script this run covers. Every line the press reached is
  // ticked when the dialog opens — the run is still "all scenes" unless the
  // member says otherwise — and unticking one drops its whole row from the
  // targets, the count and the price. Scene numbers, so it survives a storyboard
  // whose scenes aren't 1..N.
  const [batchLines, setBatchLines] = useState<Set<number>>(() => new Set())
  const [includeExisting, setIncludeExisting] = useState(false)
  // The model panel opened from this dialog's trigger. It is a CENTRED modal
  // (`ModelPickerModal`), not the inline dropdown this used to be (September
  // 2026, Massimo's call): the dropdown opened a scrolling list inside a dialog
  // that is itself a scrolling stack, and the picker is the one control here
  // that wants room — provider rail, search, per-model prices. It writes the
  // SAME settingsStore key the dropdown did, so nobody's saved pick moved.
  const [batchModelOpen, setBatchModelOpen] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  // The batch menu: one "Generate all" opening the three passes, rather than
  // three pills competing on the bar. See the note where it renders.
  const generateAllRef = useRef<HTMLButtonElement>(null)
  const [generateAllOpen, setGenerateAllOpen] = useState(false)
  // The confirm dialog portals to document.body, so it would outlive an app
  // switch — dismiss it when the user docks away.
  useCloseOnAppSwitch(!!batchConfirm, () => setBatchConfirm(null))
  const batchBackdrop = useBackdropClose(() => setBatchConfirm(null))
  // Not while the model panel is over it: that panel closes on Escape too, and
  // one press would otherwise take the run you were configuring with it.
  useCloseOnEscape(!!batchConfirm && !batchModelOpen, () => setBatchConfirm(null))
  // Resolution + aspect chosen for the run (model lives in the global setting).
  const [batchResolution, setBatchResolution] = useState<ImageResolution | undefined>(undefined)
  const [batchAspect, setBatchAspect] = useState<string | undefined>(undefined)
  // The settings the in-flight batch chose, read by each card's batch effect.
  const [batchImageOverride, setBatchImageOverride] = useState<
    { aspectRatio: string; resolution?: ImageResolution } | null
  >(null)

  // Clamp the picked resolution/aspect to what the current model supports, so
  // switching models in the dialog never leaves an invalid selection.
  const batchImgConstraints = batchImageModelId ? getModel(batchImageModelId)?.imageConstraints : undefined
  const batchResOptions = (batchImgConstraints?.resolutions ?? []) as ImageResolution[]
  const batchAspectOptions = batchImgConstraints?.aspectRatios ?? []
  const effectiveBatchRes =
    batchResolution && batchResOptions.includes(batchResolution) ? batchResolution : batchResOptions[0]
  const effectiveBatchAspect =
    batchAspect && batchAspectOptions.includes(batchAspect)
      ? batchAspect
      : batchAspectOptions.includes('9:16')
        ? '9:16'
        : batchAspectOptions[0]
  // Only cards with a prompt can generate — everything else is skipped
  // silently, here and in the target maths below.
  const promptReady = (key: string) => (cardStates[key]?.editablePrompt ?? '').trim().length > 0
  const hasImage = (key: string) => (shownCardStates[key]?.images.length ?? 0) > 0

  // The cards this press covers, narrowed to the picked option column.
  // Every option and every line the press reached — the two axes the dialog
  // scopes along. Both are offered whenever there is more than one of them, so
  // a PER-SCENE press gets the option chips too (September 2026, Massimo's
  // call): one scene is still three deliveries, and picking among them is the
  // only scoping that dialog has to offer.
  const batchColumnNumbers = batchConfirm ? columnsIn(batchConfirm.keys) : []
  const batchSceneNumbers = batchConfirm ? scenesIn(batchConfirm.keys) : []
  const batchScoped = batchConfirm
    ? batchConfirm.keys.filter(
        (k) => promptReady(k) && batchColumns.has(columnOf(k)) && batchLines.has(sceneOf(k)),
      )
    : []
  // `fresh` = prompt-ready cards with no image yet; `done` = cards already
  // generated. Kept apart so a second press doesn't silently re-bill work the
  // user already paid for and picked through — see includeExisting.
  const batchFresh = batchScoped.filter((k) => !hasImage(k))
  const batchDone = batchScoped.filter(hasImage)
  // What this run will actually fire: the untouched cards, plus the already-
  // generated ones only when the user explicitly opts in.
  const batchTargets = includeExisting ? [...batchFresh, ...batchDone] : batchFresh
  // A card with references attached doesn't fire on the picked text-to-image
  // model — startImageTask swaps in the image-to-image sibling, which can be
  // priced differently. Cost each card against the model that will really run,
  // or the dialog quotes one price and kie bills another.
  const batchTotalCredits = batchConfirm
    ? batchTargets.reduce<number | null>((sum, key) => {
        if (sum === null) return null
        const card = cardStates[key]
        const hasRefs = !!(
          (characterRef && card?.refsCharacter !== false) ||
          (productRef && card?.refsProduct !== false)
        )
        const modelId = resolveImageModelId(hasRefs) ?? batchImageModelId
        const credits = modelId
          ? estimateCredits(modelId, { imageCount: 1, resolution: effectiveBatchRes })
          : null
        return credits == null ? null : sum + credits
      }, 0)
    : null
  const batchOverBudget = batchTotalCredits != null && balance !== null && batchTotalCredits > balance

  const requestBatch = (keys: string[]) => {
    const targets = keys.filter(promptReady)
    if (targets.length === 0) {
      useAppStore.getState().addToast('No prompts ready to generate.', 'error')
      return
    }
    // Default to skipping what's already generated. When everything is done the
    // dialog still opens — with the toggle as the only way forward — so
    // "regenerate the lot" stays possible but never accidental.
    setIncludeExisting(false)
    // Cards that already hold an image are still held back by the toggle in
    // the dialog, so an all-options run is "every option that has no still
    // yet", not a re-render of the storyboard.
    // Every option and every line this press reached, ticked. The dialog opens
    // on the whole run; narrowing it is the deliberate act.
    setBatchColumns(new Set(columnsIn(keys)))
    setBatchLines(new Set(scenesIn(keys)))
    setBatchConfirm({ keys })
  }

  // Every card in the run is armed in the same tick — the anchor-take cards
  // included. They used to run as a queue instead, one armed each time the
  // previous one's still landed, so that card N could chain from card N-1's
  // picture. The cost of that was the whole run: `dialogueChainRefs` only ever
  // feeds the FIRST variation of each scene, which is the anchor column, so a
  // member scoping the batch to Option 1 (the common case — one card per line)
  // got a run that rendered one card, waited a minute for it, then started the
  // next. Twelve lines took twenty minutes, and eleven of the twelve cards sat
  // showing nothing at all, which reads as a batch that never fired.
  //
  // So the chain is best-effort now: a card still attaches the nearest earlier
  // anchor still that EXISTS when it fires (an earlier run's, or one generated
  // from the card itself), and a fresh run simply has none to attach. What
  // holds the anchor column together in a fresh run is the prompt, which
  // already restates the same place, wardrobe, light and camera in every
  // scene's VAR_1 — see the anchor-take clause in generateBroll's dialogue
  // addendum. The backend stagger nobody has to think about is `submitToKie`:
  // the POSTs drip out under kie's rate limit while every tile shows generating
  // from the press.
  const confirmBatch = () => {
    if (!batchConfirm || batchTargets.length === 0) return
    setBatchImageOverride({ aspectRatio: effectiveBatchAspect ?? '9:16', resolution: effectiveBatchRes })
    setBatchTokens((prev) => {
      const next = { ...prev }
      for (const k of batchTargets) next[k] = (next[k] ?? 0) + 1
      return next
    })
    setBatchConfirm(null)
  }

  // ─── Batch video generation ────────────────────────────────────────────
  // Same machinery as the image batch: a per-card token, bumped once per run,
  // fires exactly one clip inside each card (which knows whether to animate its
  // still or render from the prompt). Clips are independent — no chaining — so
  // the whole run goes in parallel.
  const batchVideoModelId =
    useSettingsStore((s) => s.perAppModel['broll-studio:video']) ??
    getDefaultModel('broll-studio', 'video')?.id
  const [videoTokens, setVideoTokens] = useState<Record<string, number>>({})
  const [videoConfirm, setVideoConfirm] = useState<BatchRequest | null>(null)
  const [videoColumns, setVideoColumns] = useState<Set<number>>(() => new Set())
  // The same line scoping the image dialog has — the two are a pair.
  const [videoLines, setVideoLines] = useState<Set<number>>(() => new Set())
  const [includeExistingVideos, setIncludeExistingVideos] = useState(false)
  const [videoModelOpen, setVideoModelOpen] = useState(false)
  const [batchVideoOverride, setBatchVideoOverride] = useState<BatchVideoSettings | null>(null)
  const [batchVideoResolution, setBatchVideoResolution] = useState<string | undefined>(undefined)
  // undefined = untouched (→ Auto); a number = a length pinned for the whole run.
  const [batchVideoDuration, setBatchVideoDuration] = useState<number | undefined>(undefined)
  useCloseOnAppSwitch(!!videoConfirm, () => setVideoConfirm(null))
  useCloseOnEscape(!!videoConfirm && !videoModelOpen, () => setVideoConfirm(null))
  const videoBackdrop = useBackdropClose(() => setVideoConfirm(null))

  // Clamp resolution + duration to the picked model, so swapping models inside
  // the dialog never leaves a value kie would reject (or silently re-tier).
  const batchVideoConstraints = batchVideoModelId ? getModel(batchVideoModelId)?.videoConstraints : undefined
  const batchVideoResOptions = batchVideoConstraints?.resolutions ?? []
  const batchVideoDurationOptions = batchVideoConstraints?.durations ?? []
  const effectiveVideoRes =
    batchVideoResolution && batchVideoResOptions.includes(batchVideoResolution)
      ? batchVideoResolution
      : batchVideoResOptions.includes(BATCH_VIDEO_RESOLUTION)
        ? BATCH_VIDEO_RESOLUTION
        : batchVideoConstraints?.default ?? batchVideoResOptions[0] ?? '720p'
  // Card key → the script line that card's clip has to hold, and whether that
  // card SPEAKS it, so an Auto run can price each card at its own length.
  const scriptLineByKey: Record<string, string> = {}
  const spokenByKey: Record<string, boolean> = {}
  // Scene number → its line, for the batch dialogs' line checklist: the rows are
  // scenes, and the words are what a member recognises one by.
  const scriptLineByScene: Record<number, string> = {}
  for (const scene of result?.scenes ?? []) {
    scriptLineByScene[scene.number] = scene.scriptLine
    for (let i = 0; i < scene.variations.length; i++) {
      scriptLineByKey[`${scene.number}-${i}`] = scene.scriptLine
      spokenByKey[`${scene.number}-${i}`] = speaksItsLine(scene.variations[i])
    }
  }
  // Auto is only on this menu when some card in the storyboard speaks its line —
  // i.e. this is a Dialogue Clips session. A silent b-roll run has no words to
  // fit anywhere in it, so the run pins one length exactly as it did before Auto
  // existed. Derived from the storyboard rather than from the ticked targets, so
  // the chip doesn't change shape as options are scoped in and out.
  const runHasSpokenCard = Object.values(spokenByKey).some(Boolean)
  const defaultPinnedDuration = batchVideoDurationOptions.length > 0
    ? snapVideoDuration(BATCH_VIDEO_DURATION_FALLBACK, batchVideoDurationOptions)
    : BATCH_VIDEO_DURATION_FALLBACK
  // The length pinned for the whole run, or undefined for Auto. A pin the
  // picked model doesn't offer falls back to Auto rather than snapping to some
  // other number — a model swap inside the dialog shouldn't quietly re-tier a
  // dozen clips to a length nobody chose. With no Auto to fall back to, it
  // lands on the flat default instead.
  const pinnedVideoDuration =
    batchVideoDuration && batchVideoDurationOptions.includes(batchVideoDuration)
      ? batchVideoDuration
      : runHasSpokenCard
        ? undefined
        : defaultPinnedDuration
  const clipSecondsFor = (key: string) =>
    pinnedVideoDuration
      ?? cardClipSeconds(
        cardStates[key] ?? { cardVideoDurationSeconds: BATCH_VIDEO_DURATION_FALLBACK },
        scriptLineByKey[key] ?? '',
        batchVideoModelId,
        { spoken: spokenByKey[key] ?? false },
      )
  const hasVideo = (key: string) => (shownCardStates[key]?.videos.length ?? 0) > 0
  // What makes a card eligible for this run: a still to animate, or (for a
  // plain video batch) just a prompt to render from.
  const videoEligible = videoConfirm?.stillsOnly ? hasImage : promptReady
  const videoColumnNumbers = videoConfirm ? columnsIn(videoConfirm.keys) : []
  const videoSceneNumbers = videoConfirm ? scenesIn(videoConfirm.keys) : []
  const videoScoped = videoConfirm
    ? videoConfirm.keys.filter(
        (k) => videoEligible(k) && videoColumns.has(columnOf(k)) && videoLines.has(sceneOf(k)),
      )
    : []
  const videoFresh = videoScoped.filter((k) => !hasVideo(k))
  const videoDone = videoScoped.filter(hasVideo)
  const videoTargets = includeExistingVideos ? [...videoFresh, ...videoDone] : videoFresh
  // How many of this run animate a still they already have. The rest render
  // from the prompt alone. It used to be printed as a qualifier under the title
  // ("from the card stills"); that line is gone, and this survives because it
  // decides which models the picker greys out and whether the run is held.
  const videoAnimateCount = videoTargets.filter((k) => (shownCardStates[k]?.images.length ?? 0) > 0).length
  const videoBatchCredits = batchVideoModelId
    ? videoTargets.reduce<number | null>((sum, key) => {
        if (sum === null) return null
        const credits = estimateCredits(batchVideoModelId, {
          durationSeconds: clipSecondsFor(key),
          resolution: effectiveVideoRes,
          audio: cardStates[key]?.cardVideoAudio ?? true,
        })
        return credits == null ? null : sum + credits
      }, 0)
    : null
  // What the run's clip lengths actually come out as, for the Auto chip: one
  // number when every line lands the same, a range otherwise. Every clip in the
  // run is billed, so the spread it's paying for belongs on screen.
  const videoTargetSeconds = videoTargets.map(clipSecondsFor)
  const autoDurationLabel = videoTargetSeconds.length === 0
    ? 'Auto'
    : (() => {
        const lo = Math.min(...videoTargetSeconds)
        const hi = Math.max(...videoTargetSeconds)
        return lo === hi ? `Auto · ${lo}s` : `Auto · ${lo}–${hi}s`
      })()
  // A single representative length for the model picker's price comparison —
  // it ranks models against each other, so the run's average is enough.
  const representativeSeconds = videoTargetSeconds.length > 0
    ? Math.round(videoTargetSeconds.reduce((a, b) => a + b, 0) / videoTargetSeconds.length)
    : pinnedVideoDuration ?? BATCH_VIDEO_DURATION_FALLBACK
  const videoOverBudget = videoBatchCredits != null && balance !== null && videoBatchCredits > balance
  // A model that takes neither a start frame nor reference images can't animate
  // a still, so every card holding one would fail at fire time — a dozen
  // identical error toasts and nothing rendered. Say so here and hold the run.
  const videoModelModes = batchVideoModelId ? getModel(batchVideoModelId)?.modes ?? [] : []
  const videoModelCantAnimate =
    videoAnimateCount > 0 &&
    !videoModelModes.includes('image-to-video') &&
    !videoModelModes.includes('reference-to-video')

  const requestVideoBatch = (keys: string[], stillsOnly = false) => {
    const eligible = stillsOnly ? hasImage : promptReady
    const targets = keys.filter(eligible)
    if (targets.length === 0) {
      useAppStore.getState().addToast(
        stillsOnly ? 'No stills to animate yet.' : 'No prompts ready to generate.',
        'error',
      )
      return
    }
    // Cards that already have a clip are held back by default — a video is the
    // expensive half of this app, so re-billing one takes an explicit tick.
    setIncludeExistingVideos(false)
    // Cards that already hold a clip are still held back, so an all-options run
    // is "every option that has no video yet", not a re-bill of the
    // storyboard.
    setVideoColumns(new Set(columnsIn(keys)))
    setVideoLines(new Set(scenesIn(keys)))
    setVideoConfirm({ keys, stillsOnly })
  }

  const confirmVideoBatch = () => {
    if (!videoConfirm || videoTargets.length === 0 || !batchVideoModelId) return
    setBatchVideoOverride({
      modelId: batchVideoModelId,
      resolution: effectiveVideoRes,
      // Absent on an Auto run — each card then uses its own per-line length.
      ...(pinnedVideoDuration ? { durationSeconds: pinnedVideoDuration } : {}),
    })
    setVideoTokens((prev) => {
      const next = { ...prev }
      for (const k of videoTargets) next[k] = (next[k] ?? 0) + 1
      return next
    })
    setVideoConfirm(null)
  }

  // Rebuild card states from the current result. Carries existing state
  // forward when prompts match (same generation, re-render); drops orphaned
  // slots when a fresh Generate produces a shorter script.
  useEffect(() => {
    if (!result) return
    setCardStates((prev) => {
      const next: Record<string, CardState> = {}
      for (const scene of result.scenes) {
        for (let i = 0; i < scene.variations.length; i++) {
          const key = `${scene.number}-${i}`
          const v = scene.variations[i]
          const existing = prev[key]
          // Preserve state across re-renders by matching the live prompt
          // against any entry in the card's history (not just `editablePrompt`).
          // That way Regenerate / Enhance / Undo / typed edits don't trip the
          // rebuilder into discarding the card's generated images.
          const matchesHistory = existing && (
            existing.editablePrompt === v.prompt
            || existing.promptHistory?.includes(v.prompt)
          )
          next[key] = matchesHistory ? existing : createDefaultCardState(v, scene.scriptLine)
        }
      }
      return next
    })
  }, [result, setCardStates])

  // Refresh-resume: walk every card's in-flight queues on mount and finish
  // any kie task whose taskId survived the refresh. Drains parallel queues.
  // Entries older than 30 min — or in-flight entries that never received a
  // taskId (refresh during createTask) — are evicted with an error chip so the
  // gallery doesn't stay stuck on a phantom spinner.
  //
  // It runs again whenever the connection comes back, because that is the
  // other way a paid-for clip goes missing: kie renders it, the download dies
  // with the Wi-Fi, and the entry sits on a Failed tile. Entries that already
  // errored are walked too (they keep their taskId), and `claimTask` stops an
  // extra pass from double-polling anything a live promise still owns.
  const reconnectTick = useReconnectTick()
  const INFLIGHT_TTL_MS = 30 * 60 * 1000
  useEffect(() => {
    const now = Date.now()
    // First pass: evict stale entries that can't be resumed.
    setCardStates((prev) => {
      const next = { ...prev }
      let changed = false
      for (const [key, card] of Object.entries(prev)) {
        const stalledImages = card.inFlightImages.filter(
          (e) => (!e.taskId || !e.modelId) && now - e.startedAt > INFLIGHT_TTL_MS,
        )
        const stalledVideos = card.inFlightVideos.filter(
          (e) => !e.taskId && now - e.startedAt > INFLIGHT_TTL_MS,
        )
        if (stalledImages.length === 0 && stalledVideos.length === 0) continue
        changed = true
        next[key] = {
          ...card,
          inFlightImages: card.inFlightImages.map((e) =>
            stalledImages.includes(e) ? { ...e, error: 'Generation stalled before kie returned a task id. Reset and try again.' } : e,
          ),
          inFlightVideos: card.inFlightVideos.map((e) =>
            stalledVideos.includes(e) ? { ...e, error: 'Generation stalled before kie returned a task id. Reset and try again.' } : e,
          ),
        }
      }
      return changed ? next : prev
    })

    for (const [key, card] of Object.entries(cardStates)) {
      // ── Image queue ────────────────────────────────────────────────
      for (const entry of card.inFlightImages) {
        if (!entry.taskId || !entry.modelId) continue
        // Skip tasks a live generation promise still owns — a view unmounted by
        // a History/mode switch keeps polling, so resuming here would duplicate.
        if (!claimTask('image', entry.taskId)) continue
        const inFlightId = entry.id
        const taskId = entry.taskId
        const modelId = entry.modelId
        const prompt = entry.prompt
        const resolution = entry.resolution || undefined
        ;(async () => {
          try {
            const imageUrl = await finishImageTask(taskId, modelId, resolution)
            const newImage = { imageUrl, prompt, modelId, createdAt: Date.now() }
            setCardStates((prev) => {
              const existing = prev[key]
              if (!existing) return prev
              const newImages = [...existing.images, newImage]
              return {
                ...prev,
                [key]: {
                  ...existing,
                  images: newImages,
                  currentImageIndex: newImages.length - 1,
                  selected: { kind: 'image', index: newImages.length - 1 },
                  inFlightImages: existing.inFlightImages.filter((e) => e.id !== inFlightId),
                },
              }
            })
          } catch (err) {
            const msg = humanizeError(err, 'Image generation failed. Try again.')
            setCardStates((prev) => {
              const existing = prev[key]
              if (!existing) return prev
              return {
                ...prev,
                [key]: {
                  ...existing,
                  inFlightImages: existing.inFlightImages.map((e) =>
                    e.id === inFlightId ? { ...e, error: msg } : e,
                  ),
                },
              }
            })
          } finally {
            releaseTask('image', taskId)
          }
        })()
      }

      // ── Video queue ────────────────────────────────────────────────
      for (const entry of card.inFlightVideos) {
        if (!entry.taskId) continue
        if (!claimTask('video', entry.taskId)) continue
        const inFlightId = entry.id
        const taskId = entry.taskId
        const modelId = entry.modelId
        const endpoint = entry.endpoint
        const duration = entry.durationSeconds
        const aspect = entry.aspectRatio
        const resolution = entry.resolution
        const audio = entry.audio
        const promptText = entry.prompt
        const mode = entry.mode
        const sourceBRollId = entry.sourceBRollId
        ;(async () => {
          try {
            const res = await finishVideoTask(taskId, modelId, endpoint, duration, aspect)
            const assetRef = `asset://${res.assetId}`
            const newVideo = {
              url: assetRef,
              modelId,
              prompt: promptText,
              aspectRatio: res.aspectRatio,
              durationSeconds: res.durationSeconds,
              resolution,
              audio,
              mode,
              sourceBRollId,
              createdAt: Date.now(),
            }
            setCardStates((prev) => {
              const existing = prev[key]
              if (!existing) return prev
              const newVideos = [...existing.videos, newVideo]
              return {
                ...prev,
                [key]: {
                  ...existing,
                  videos: newVideos,
                  currentVideoIndex: newVideos.length - 1,
                  selected: { kind: 'video', index: newVideos.length - 1 },
                  inFlightVideos: existing.inFlightVideos.filter((e) => e.id !== inFlightId),
                },
              }
            })
            const historyEntry: VideoHistoryItem = {
              id: crypto.randomUUID(),
              modelId,
              prompt: promptText,
              mode,
              aspectRatio: res.aspectRatio,
              durationSeconds: res.durationSeconds,
              resolution,
              audio,
              videoUrl: assetRef,
              sourceBRollId,
              sourceApp: 'broll-studio',
              createdAt: Date.now(),
            }
            await useBankStore.getState().addVideoHistory(historyEntry)
            useAppStore.getState().addToast('B-Roll video ready', 'success')
          } catch (err) {
            if (isPollTimeout(err)) {
              // Still rendering past the poll budget — keep the entry in-flight
              // so a later refresh resumes it, rather than flipping it to a
              // Failed/Retry that would re-bill a clip already on its way.
              return
            }
            const msg = humanizeError(err, 'Video resume failed.')
            setCardStates((prev) => {
              const existing = prev[key]
              if (!existing) return prev
              return {
                ...prev,
                [key]: {
                  ...existing,
                  inFlightVideos: existing.inFlightVideos.map((e) =>
                    e.id === inFlightId ? { ...e, error: msg } : e,
                  ),
                },
              }
            })
            useAppStore.getState().addToast(msg, 'error')
          } finally {
            releaseTask('video', taskId)
          }
        })()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnectTick])

  if (isGenerating) {
    return (
      <div className="flex h-full flex-col overflow-hidden p-5">
        <GenerationProgress
          isActive
          color="bg-broll-500"
          messages={['Analyzing script scenes...', 'Sending request...', 'Generating B-Roll prompts...', 'Finalizing scene breakdowns...']}
          className="mb-6"
          showHelper={false}
        />
        <div className="flex-1 overflow-y-auto">
          {/* One breathe for the whole block — see `.skeleton-group` in
              index.css. Eighteen individually-shimmering skeletons is eighteen
              composited layers inside rounded clips; the bar above already says
              the work is running. */}
          <div className="skeleton-group flex flex-col gap-8">
            {[1, 2, 3].map((i) => (
              <SkeletonScene key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!result) {
    // The never-generated stage wears the SAME face as the cleared one (the
    // `AwaitingBody` RightPanel shows after New Storyboard): one title, one
    // hint, the shared type ramp. It was a shape of its own — a bigger glyph
    // over two lines at ink-700 / ink-800, dim enough to read as disabled —
    // and it still called the output "B-Roll prompts" beside a button that
    // says Generate Storyboard. Written out rather than the component only
    // because the error has to sit under the hint.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Film className="h-8 w-8 text-ink-800" strokeWidth={1.5} />
        <p className="text-sm text-ink-500">Awaiting Storyboard</p>
        <p className="max-w-[300px] text-xs leading-relaxed text-ink-600">
          Your storyboard lands here. Pick a character, a product and a script, then press Generate Storyboard.
        </p>
        {error && (
          <div className="mt-2 flex max-w-sm items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-left">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400 light:text-red-600" />
            <p className="text-xs leading-relaxed text-red-300 light:text-red-700">{error}</p>
          </div>
        )}
      </div>
    )
  }

  const allKeys = result.scenes.flatMap((s) => s.variations.map((_, i) => `${s.number}-${i}`))
  // Cards holding a still — what the Animate action works on, and the reason
  // its button only appears once there's something to animate.
  const animatableKeys = allKeys.filter(hasImage)

  // Every rendered clip across every scene, for the download picker — parity
  // with Continuous. This is the mode that produces the most clips and where
  // videos are download-only, so bulk export matters most here; without it the
  // only way out was opening each card in turn. Each card's COVER take (the
  // one its face plays — `selected` when the user picked one, else the newest)
  // opens ticked, so the zip is one clip per card unless the member says
  // otherwise.
  const allClipEntries: ClipDownloadEntry[] = result.scenes.flatMap((s) =>
    s.variations.flatMap((_, i) => {
      const card = shownCardStates[`${s.number}-${i}`]
      const vids = card?.videos ?? []
      const cover = Math.min(
        card?.selected?.kind === 'video' ? card.selected.index : card?.currentVideoIndex ?? 0,
        Math.max(0, vids.length - 1),
      )
      const scene = String(s.number).padStart(2, '0')
      return vids.map((v, vi) => ({
        id: `${s.number}-${i}:${vi}`,
        ref: v.url,
        name: `scene${scene}-option${i + 1}${vids.length > 1 ? `-take${vi + 1}` : ''}`,
        label: `Scene ${s.number} · Option ${i + 1}`,
        meta: vids.length > 1 ? `Take ${vi + 1} of ${vids.length}` : undefined,
        preselected: vi === cover,
        badge: vi === cover ? 'Cover' : undefined,
        aspectRatio: v.aspectRatio,
      }))
    }),
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* The strip is an OVERLAY pinned to the panel's top edge, and the
          storyboard scrolls UNDER it, blurred (September 2026, Massimo's call).
          Getting here took three shapes and the difference between them is the
          whole note.

          It was `sticky top-0` INSIDE the scroll port until August 2026, and it
          visibly came loose from the top edge on the way back up a long
          storyboard: a backdrop-filter element re-samples its backdrop on the
          main thread while the scroller itself is scrolled by the compositor,
          so the bar lagged its own container by a frame or two and snapped
          back. The fix then was to lift it OUT of the scroller as a plain
          static sibling — which cured the lag, and cost the picture: nothing
          passed under it any more. That is why the glass tried in between was
          reverted on sight. A wash over a panel that never moves has nothing to
          frost; it just lifts a 57px band a shade off the panel it belongs to
          and reads as a seam.

          Absolute is both halves at once. The bar is NOT in the scroller, so it
          cannot lag it by construction — it is laid out against this panel and
          nothing about a scroll moves it — and the scroller now runs the full
          height of the panel behind it, so cards really do pass underneath. The
          scroll port pays for it with `pt-[77px]` (the bar's 57px plus the 20px
          the content already stood off by), which is what keeps scene one clear
          of the bar at scroll-top. Those two numbers move together.

          The fill is `.app-backdrop-frost` (index.css), which is the PAGE
          GRADIENT at 72% and viewport-anchored, over a 40px blur — not a flat
          token. That distinction is the whole of two bug reports. It shipped as
          `bg-surface-0/72` and read DARKER than the columns either side of it,
          and the panel's left divider — a neutral hairline with the page
          gradient on one side and this band on the other — read as changing
          colour, "glowing" as saturated cards passed beneath. `index.css`
          already had the finding written down for the opaque case: a flat token
          cannot match a radial gradient that moves ~10 units across one bar's
          width, and at 72% it was still 72% of the wrong colour. Matched to the
          gradient the bar is pixel-identical to its surroundings at rest, so
          the divider reads the same above, inside and below the band, and the
          only thing that ever tints it is the storyboard actually showing
          through — which is the point. No `backdrop-saturate` for the same
          reason: saturating whatever card is underneath is what made that wash
          read as coloured. `z-20` so a card's own positioned hover chrome can't
          paint over it. */}
      {/* The pane's header band — and, since September 2026 (Massimo's call),
          the ONE bar this pane has. It carries the way into the history rail and
          then what this storyboard IS: the look, the character. On the right,
          what you can do to it as a whole: what the cards show, the export of
          everything rendered, and the generate passes.

          The look, the character and Generate All rode a FLOATING toolbar until
          now — a centred, blurred, sticky group of pills that followed you down
          the wall of stills, which was the point of it. What it cost was a
          second frosted bar 12px under this one, both of them about the
          storyboard, saying between them what one line says here.

          What lets one line hold six controls is that only TWO things on it can
          shrink, and they shrink in the right order. The style and character
          NAMES truncate — those two pills are `min-w-0`, not `shrink-0` like
          everything else on the row — so a long custom style name gives its
          width back before anything is hidden. Under that the two action labels
          shorten and then go: "Download Clips" → "Clips" → the glyph and its
          count, "Generate All" → "Generate" → the sparkle. The names drop last.

          They drop EARLY, though — at the step where a full pair would still
          just about fit, not at the step where the pills run out of room. Left
          to truncate the whole way down they reached "U…" and "M…" on a 745px
          pane, which is a stump saying less than the palette glyph and the face
          already beside it. So a name is either near enough to whole to read,
          or it isn't there.

          Those steps are CONTAINER queries on the band, never viewport ones, for
          the same reason the card grid's column count is: what squeezes this row
          is the output column, which is ~70% of the window on a desktop and the
          whole of it on a phone, so a `lg:` here would shorten a label on a pane
          with 300px to spare. `@container/bar` is on the band and the row inside
          it does the querying, because a container can't style itself.

          At the bottom of the ladder the row may WRAP onto a second line, and
          the right-hand group stops being pushed to the far edge at the same
          step — a wrapped second row hanging right, under a hole, reads as two
          bars rather than as one that ran out. Wrapping is OFF above that step
          on purpose: flex breaks lines on an item's UNSHRUNK width, so a row
          whose pills truncate would wrap while it still had room to truncate
          instead. That is also why the two ends are held apart by `ml-auto` and
          not a `flex-1` spacer. Down there the names are already gone, every
          pill is at its natural size, and the break is honest.

          `min-h-[57px]` is the app-wide panel-header height, so on one line this
          reads level with the History rail's own band across the seam; on two
          the port below reserves the MEASURED height (`useMeasuredHeight`) and
          pays for it. */}
      <div
        ref={barRef}
        className="absolute inset-x-0 top-0 z-20 flex min-h-[57px] border-b border-ink/5 app-backdrop-frost px-5"
      >
        {/* A box whose ONLY job is to be the query container, and it is separate
            from the band above it on purpose. `container-type: inline-size`
            brings layout containment, which makes an element a containing block
            for fixed-position descendants — and both engines apply that same
            rule to the element's own `background-attachment: fixed`. Put it on
            the band and `.app-backdrop-frost`'s viewport-anchored gradient would
            be squeezed into a 57px box instead of being a 57px window onto a
            viewport-sized one: a pale strip, and the divider down its left edge
            losing the contrast it has above and below. `index.css` carries that
            finding at length, from the time `backdrop-filter` did it.

            The queries therefore measure the band's CONTENT box — the pane less
            its `px-5` — so every step below is the pane width minus 40. */}
        <div className="@container/bar flex min-w-0 flex-1">
          {/* The `min-h` is on the BAND, not on this row: the band carries the
              hairline, and `border-box` puts that 1px inside a stated height —
              stating it down here made the band 58px and dropped the seam a
              pixel below the History rail's own band beside it. */}
          <div className="flex w-full flex-wrap items-center gap-2 py-2 @[560px]/bar:flex-nowrap">
            {railToggle}
            {/* The look every clip in this storyboard renders in. `min-w-0` rather
                than `shrink-0`: a custom style can be titled anything, and this
                name is the first width the row asks for back. */}
            <button
              type="button"
              onClick={onChangeStyle}
              title="Change the visual style every clip renders in"
              className="inline-flex h-[38px] min-w-0 items-center gap-1.5 rounded-full border border-broll-500/25 bg-broll-500/10 px-3.5 text-[13px] font-semibold tracking-tight text-broll-300 transition-colors hover:border-broll-500/45 hover:bg-broll-500/[0.18]"
            >
              <Palette className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span className="hidden max-w-[180px] truncate @[740px]/bar:block">
                {result.styleBrief ? (result.styleName?.trim() || 'Custom style') : getContinuousStyle(result.styleId ?? 'ugc').label}
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" strokeWidth={2.5} />
            </button>
            <CharacterPill
              model={selectedModel}
              onClick={onOpenCharacterPicker}
              nameClassName="hidden max-w-[160px] truncate @[740px]/bar:block"
              className="min-w-0"
            />
            {/* The split — what the storyboard IS on the left, what you can do to
                it pushed to the far edge — holds only while the row is ONE line.
                Below 600 it packs in behind the pills instead: the row is about
                to wrap there, and a right-aligned second line leaves a hole under
                the first one and reads as two bars rather than one that ran out
                of width. Same 600 as the wrap, so there is one number. */}
            <div className="flex shrink-0 items-center gap-2 @[560px]/bar:ml-auto">
              {/* What every card shows. Images keeps a card on its still while
                  the clip it animates into renders; a card with nothing of the
                  picked kind sits on its prompt. Nothing is hidden for good. */}
              {onCardFilterChange && (
                // A DROPDOWN, not a four-segment toggle (September 2026, Massimo's
                // call): the toggle spent ~250px showing three options nobody had
                // picked. One pill naming the current view is the same control in a
                // fifth of the width, and it is the shape every other filter in the
                // app already takes.
                <Dropdown
                  value={cardFilter}
                  options={CARD_FILTER_OPTIONS}
                  onChange={(v: string) => onCardFilterChange(v as CardFilter)}
                  accent="broll"
                  label="Show"
                  fitContent
                  dense
                  className="h-[38px] shrink-0"
                />
              )}
              {/* Download clips stays its own pill and stays neutral: it's the
                  export, not a generate pass, and it spends nothing. */}
              {allClipEntries.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDownloadOpen(true)}
                  title="Pick which clips to download as a zip"
                  className="flex h-[38px] shrink-0 items-center gap-1.5 rounded-full border border-ink/10 px-3.5 text-[13px] font-medium text-ink-400 transition-colors hover:bg-ink/5 hover:text-ink-200"
                >
                  <Download className="h-3.5 w-3.5 shrink-0" />
                  <BandLabel full="Download Clips" short="Clips" />
                  {/* The count is a PILL, not `(8)` in the label (September 2026,
                      Massimo's call). Parenthesised it read as part of the button's
                      name and the one number on the row that changes was the least
                      visible thing on it; as its own chip it is a count beside a
                      verb, the way every other tally in the app is written. Same
                      `rounded-full` as the button around it — `tabular-nums` so the
                      pill holds its width as clips land rather than twitching the
                      band's right edge on every completion. It survives every step
                      of the ladder: with the label gone it is the only thing left
                      saying how much there is to export. */}
                  <span className="shrink-0 rounded-full bg-ink/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-ink-200">
                    {allClipEntries.length}
                  </span>
                </button>
              )}
              {/* ONE "Generate all", opening the three passes as a menu (August
                  2026, Massimo's call). They were three pills side by side —
                  images, the animate pass, videos — tinted as one family in three
                  depths so the row read as a sequence getting more expensive. What
                  that cost is the whole bar: three long labels are ~450px, which is
                  most of the panel at every width the right pane actually gets. The
                  passes are also mutually exclusive in practice — you run one, wait
                  for it, then run the next — so they are a choice, not three things
                  to reach for.

                  The menu is the same anchored popover the constraint chips use, so
                  it escapes the band's own box and can't be cut off by it. */}
              <button
                ref={generateAllRef}
                type="button"
                onClick={() => setGenerateAllOpen((v) => !v)}
                title="Run a generation pass across every scene"
                // Playground's own header-pill colours (Massimo's call, September
                // 2026): a neutral outline that lights up on hover, the same as the
                // Download Clips beside it. Both were tinted — this one broll, that
                // one emerald — which put two saturated pills on a bar whose actual
                // subject is the storyboard underneath, and made the row read as
                // three competing accents once the style pill is counted.
                className="flex h-[38px] shrink-0 items-center gap-1.5 rounded-full border border-ink/10 px-3.5 text-[13px] font-medium text-ink-400 transition-colors hover:bg-ink/5 hover:text-ink-200"
              >
                <Sparkle className="h-3.5 w-3.5 shrink-0" />
                <BandLabel full="Generate All" short="Generate" />
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-200 ${generateAllOpen ? 'rotate-180' : ''}`}
                  strokeWidth={2.5}
                />
              </button>
              <AnchoredPopover
                anchorRef={generateAllRef}
                open={generateAllOpen}
                onClose={() => setGenerateAllOpen(false)}
                width={222}
                estimatedHeight={(animatableKeys.length > 0 ? 3 : 2) * MENU_ROW_HEIGHT + 2}
              >
                <MenuSurface className="whitespace-nowrap">
                  {/* In the order the work happens: stills, then the animate pass
                      over whatever has one, then clips from the prompts. */}
                  <MenuItem
                    icon={Images}
                    iconClassName="text-broll-300"
                    onClick={() => {
                      setGenerateAllOpen(false)
                      requestBatch(allKeys)
                    }}
                  >
                    Generate All Images
                  </MenuItem>
                  {/* Only once there's a still to animate — nothing should render
                      from a prompt the member hasn't seen a frame of. */}
                  {animatableKeys.length > 0 && (
                    <MenuItem
                      icon={Clapperboard}
                      iconClassName="text-broll-300"
                      onClick={() => {
                        setGenerateAllOpen(false)
                        requestVideoBatch(allKeys)
                      }}
                    >
                      Animate All Stills
                    </MenuItem>
                  )}
                  <MenuItem
                    icon={VideoIcon}
                    iconClassName="text-broll-300"
                    onClick={() => {
                      setGenerateAllOpen(false)
                      requestVideoBatch(allKeys)
                    }}
                  >
                    Generate All Videos
                  </MenuItem>
                </MenuSurface>
              </AnchoredPopover>
            </div>
          </div>
        </div>
      </div>
      {/* The scroll port runs the FULL height of the panel, behind the absolute
          bar, which is what lets cards pass under it blurred. `barHeight` is
          measured (`useMeasuredHeight`) rather than written down twice: the band
          wraps onto a second line on a narrow pane, and a hard-coded reserve is
          right on one line and a row short on two — the first scene landing
          under the bar exactly when the pane can least afford it.

          +20, not +12. The floating toolbar used to stand in this gap and carry
          its own `mb-6`; with it gone, 12px put scene one's 48px numeral hard up
          against the hairline. 20 is the stand-off every other pinned bar in the
          app reserves over its content. */}
      <div className="flex-1 overflow-y-auto px-5 pb-4" style={{ paddingTop: barHeight + 20 }}>
      <div className="flex flex-col gap-10">
        {result.scenes.map((scene) => (
          <SceneSection
            key={scene.number}
            scene={scene}
            cardStates={shownCardStates}
            cardLens={lens}
            onReplayCard={recordingActive ? handleReplayCard : undefined}
            onUpdateCardState={handleUpdateCardState}
            onUpdateCardStateFn={handleUpdateCardStateFn}
            onAddVariation={onAddVariation}
            onDeleteVariation={onDeleteVariation}
            onEditSceneLine={onEditSceneLine}
            characterRef={characterRef}
            productRef={productRef}
            productPhotos={productPhotos}
            onChangeStyle={onChangeStyle}
            selectedProduct={selectedProduct}
            selectedModel={selectedModel}
            selectedProductId={selectedProductId}
            selectedModelId={selectedModelId}
            selectedScriptId={selectedScriptId}
            productContext={productContext}
            modelContext={modelContext}
            onOpenCharacterPicker={onOpenCharacterPicker}
            onOpenProductPicker={onOpenProductPicker}
            batchTokens={batchTokens}
            batchImageOverride={batchImageOverride}
            videoTokens={videoTokens}
            batchVideoOverride={batchVideoOverride}
            dialogueChainRefs={dialogueChainRefs}
            onGenerateScene={() =>
              requestBatch(scene.variations.map((_, i) => `${scene.number}-${i}`))
            }
            onGenerateSceneVideos={() =>
              requestVideoBatch(scene.variations.map((_, i) => `${scene.number}-${i}`))
            }
            resultStyle={result.style}
            resultRealism={result.realism}
            resultVoiceProfile={result.voiceProfile}
            onUpdateVoiceProfile={onUpdateVoiceProfile}
          />
        ))}
      </div>
      </div>

      {batchConfirm && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm modal-fade"
          {...batchBackdrop}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-ink/10 bg-ink-950/95 shadow-2xl modal-pop"
          >
            {/* Same shape as the video dialog below — the two open from
                buttons sitting side by side and must read as a pair. */}
            {/* The heading is a BAND with its own padding, not a line sitting
                in the dialog's `p-5` under a bled rule (September 2026,
                Massimo's call). The rule was `-mx-5 mt-3.5` below a row that
                `items-start` had top-aligned against a 32px close button, so a
                20px title left 12px of nothing under it and the margin added 14
                more: ~30px of blank band. A band centres the two against each
                other and states the gap once. Same shape and the same hairline
                as the clip-download modal's header. */}
            {/* The title alone — NO subtext (September 2026, Massimo's call).
                The scope, the option and the line count all went first as
                repeats of the controls below; "from the card stills" went with
                them. What a run is made of is on the cards and on the button,
                and a heading band with a second line under it in one dialog and
                not the other never read as a pair.

                A PER-SCENE press keeps its one piece of context, and it is the
                storyboard's own identity header rather than a sentence: the
                italic serif numeral, a vertical rule, the title. The same three
                marks a card's detail modal opens with, so "01 │ Generate
                Videos" reads as the scene you pressed rather than as a line of
                prose saying so. A run spanning more than one scene draws no
                numeral — there is a checklist under it naming every line. */}
            <div className="flex items-center justify-between gap-3 border-b border-ink/5 px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
              {batchSceneNumbers.length === 1 && (
                <>
                  <span
                    className="shrink-0 text-2xl font-normal italic leading-none tabular-nums text-ink-600"
                    style={{ fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }}
                  >
                    {String(batchSceneNumbers[0]).padStart(2, '0')}
                  </span>
                  <div className="h-6 w-px shrink-0 bg-ink/10" />
                </>
              )}
                <h3 className="min-w-0 truncate text-sm font-medium text-ink-100">
                  {batchTargets.length === 0 ? 'Nothing to Generate' : 'Generate Images'}
                </h3>
              </div>
              {/* The way out is the CORNER X, not a Cancel beside Generate
                  (September 2026, Massimo's call). Cancel and Generate were a
                  pair of equal-looking pills at the foot of a dialog whose
                  whole job is one decision — and the dismissive half of that
                  pair is already on the backdrop and on Escape. Out of the
                  footer, Generate takes the full width, which is the shape
                  every primary CTA in this app has. Same corner button the
                  clip-download modal wears, so the two read as one family. */}
              <button
                type="button"
                onClick={() => setBatchConfirm(null)}
                title="Close (Esc)"
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/10 text-ink-400 transition-colors hover:bg-ink/10 hover:text-ink-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* ONE gap for the whole stack (September 2026, Massimo's call).
                Every block in here used to bring its own top margin — `mt-3` on
                the chips, the checklist and the regenerate toggle, `mt-4` on
                the settings group and again on the footer, `gap-2.5` inside the
                settings group, `mt-1.5` between the two warnings — so the
                spacing stepped 12, 12, 12, 16, 10, 16 down a stack of blocks
                that are all peers. A flex column with one `gap-3` is the whole
                rule, and it costs nothing when a block renders null. Nothing in
                here may carry a `mt-`. */}
            <div className="flex flex-col gap-3 px-5 py-4">
            <ColumnChips
              columns={batchColumnNumbers}
              selected={batchColumns}
              onChange={setBatchColumns}
            />

            <LineChecklist
              scenes={batchSceneNumbers}
              lineOf={(n) => scriptLineByScene[n] ?? ''}
              selected={batchLines}
              onChange={setBatchLines}
            />

            {batchDone.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-ink/10 bg-ink/[0.03] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={includeExisting}
                  onChange={(e) => setIncludeExisting(e.target.checked)}
                  className="h-3.5 w-3.5 shrink-0 accent-broll-500"
                />
                <span className="text-xs text-ink-300">
                  Also regenerate the {batchDone.length} card
                  {batchDone.length === 1 ? '' : 's'} that already {batchDone.length === 1 ? 'has' : 'have'} an image
                </span>
              </label>
            )}

            {/* Run settings — model is the shared B-Roll image model; resolution
                and aspect apply to every card in this batch. The trigger is the
                house one (provider mark, name, star, "% off", chevron), and it
                opens the centred panel rather than a list inside this dialog. */}
            <button
              type="button"
              onClick={() => setBatchModelOpen(true)}
              className="flex h-12 w-full items-center gap-2.5 rounded-full border border-ink/10 bg-ink/[0.02] px-3 text-left transition-colors hover:bg-ink/[0.05]"
            >
              {batchImageModelId ? (
                <>
                  <ProviderLogo provider={getModel(batchImageModelId)?.provider ?? ''} />
                  <ModelTriggerLabel
                    name={getModel(batchImageModelId)?.displayName ?? batchImageModelId}
                    recommended={!!getModel(batchImageModelId)?.tags.includes('recommended')}
                    savings={officialSavingsPercent(batchImageModelId)}
                  />
                </>
              ) : (
                <span className="flex-1 truncate text-sm text-ink-400">Select Model</span>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" />
            </button>
            <ModelPickerModal
              appId="broll-studio"
              task="image"
              mode="text-to-image"
              isOpen={batchModelOpen}
              onClose={() => setBatchModelOpen(false)}
              costParams={{ imageCount: 1, resolution: effectiveBatchRes }}
            />
            {(batchAspectOptions.length > 0 || batchResOptions.length > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {batchAspectOptions.length > 0 && (
                  <ConstraintChip
                    grow
                    openDirection="up"
                    options={batchAspectOptions}
                    value={effectiveBatchAspect ?? batchAspectOptions[0]}
                    onChange={(v) => setBatchAspect(v)}
                    render={(v) => (
                      <span className="flex items-center gap-1.5">
                        <AspectIcon ratio={v} />
                        <span>{v}</span>
                      </span>
                    )}
                  />
                )}
                {batchResOptions.length > 0 && (
                  <ConstraintChip
                    grow
                    openDirection="up"
                    options={batchResOptions as string[]}
                    value={(effectiveBatchRes ?? batchResOptions[0]) as string}
                    onChange={(v) => setBatchResolution(v as ImageResolution)}
                    renderOption={(v) => {
                      const credits = formatCredits(estimateCredits(batchImageModelId, { imageCount: 1, resolution: v as ImageResolution }))
                      return (
                        <span className="flex w-full items-center justify-between gap-6">
                          <span>{v}</span>
                          {credits && <span className="text-ink-500">{credits}</span>}
                        </span>
                      )
                    }}
                  />
                )}
              </div>
            )}

            {balance !== null && batchOverBudget && (
              <p className="text-[11px] text-red-400 light:text-red-600">
                Not enough credits. Your balance is {balance.toLocaleString()}.
              </p>
            )}
            {/* One control, the full width, and it is the one that spends
                (September 2026, Massimo's call). `h-[46px]`, a step up again
                from the pair this replaced: with nothing beside it the button
                is the dialog's whole last line, and the app's own primary CTAs
                are this tall. Cancel went to the corner X — see the note on the
                heading. Both dialogs move together. */}
            <button
              type="button"
              onClick={confirmBatch}
              disabled={batchTargets.length === 0}
              className="flex h-[46px] w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-broll-500 px-4 text-[13px] font-bold tracking-tight text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
            >
              <Images className="h-3.5 w-3.5" />
              {batchTargets.length === 0
                ? 'Generate'
                : `Generate ${batchTargets.length} Image${batchTargets.length === 1 ? '' : 's'}`}
              <span className="flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                <Coins className="h-3 w-3" strokeWidth={2} />
                {/* An empty run costs nothing — formatCredits(0) would read
                    "< 1 credit", which looks like a real charge. */}
                {batchTargets.length === 0 ? '—' : formatCredits(batchTotalCredits) ?? '—'}
              </span>
            </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Video-batch confirm. Clips are the expensive half of this app, so the
          run is priced, counted and settled here before a single task fires. */}
      {videoConfirm && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm modal-fade"
          {...videoBackdrop}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-ink/10 bg-ink-950/95 shadow-2xl modal-pop"
          >
            {/* One title, one line of context. The count and the price live on
                the Generate button — everything else this dialog used to
                explain (parallel rendering, refresh-safety, why some cards are
                skipped) is either obvious from the storyboard behind it or
                already said by the controls below. The band and the one-gap
                body below are the image dialog's — see the notes there. */}
            <div className="flex items-center justify-between gap-3 border-b border-ink/5 px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
              {videoSceneNumbers.length === 1 && (
                <>
                  <span
                    className="shrink-0 text-2xl font-normal italic leading-none tabular-nums text-ink-600"
                    style={{ fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }}
                  >
                    {String(videoSceneNumbers[0]).padStart(2, '0')}
                  </span>
                  <div className="h-6 w-px shrink-0 bg-ink/10" />
                </>
              )}
                <h3 className="min-w-0 truncate text-sm font-medium text-ink-100">
                  {videoTargets.length === 0
                    ? (videoConfirm.stillsOnly ? 'Nothing to Animate' : 'Nothing to Generate')
                    : (videoConfirm.stillsOnly ? 'Animate Stills' : 'Generate Videos')}
                </h3>
              </div>
              {/* The way out is the CORNER X, not a Cancel beside Generate
                  (September 2026, Massimo's call). Cancel and Generate were a
                  pair of equal-looking pills at the foot of a dialog whose
                  whole job is one decision — and the dismissive half of that
                  pair is already on the backdrop and on Escape. Out of the
                  footer, Generate takes the full width, which is the shape
                  every primary CTA in this app has. Same corner button the
                  clip-download modal wears, so the two read as one family. */}
              <button
                type="button"
                onClick={() => setVideoConfirm(null)}
                title="Close (Esc)"
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/10 text-ink-400 transition-colors hover:bg-ink/10 hover:text-ink-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3 px-5 py-4">
            <ColumnChips
              columns={videoColumnNumbers}
              selected={videoColumns}
              onChange={setVideoColumns}
            />

            <LineChecklist
              scenes={videoSceneNumbers}
              lineOf={(n) => scriptLineByScene[n] ?? ''}
              selected={videoLines}
              onChange={setVideoLines}
            />

            {videoDone.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-ink/10 bg-ink/[0.03] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={includeExistingVideos}
                  onChange={(e) => setIncludeExistingVideos(e.target.checked)}
                  className="h-3.5 w-3.5 shrink-0 accent-broll-500"
                />
                <span className="text-xs text-ink-300">
                  Also regenerate the {videoDone.length} card
                  {videoDone.length === 1 ? '' : 's'} that already {videoDone.length === 1 ? 'has' : 'have'} a clip
                </span>
              </label>
            )}

            {/* Run settings — the shared B-Roll video model (same setting the
                card modal's picker writes), plus one resolution and one clip
                length for every video in the batch. */}
            <button
              type="button"
              onClick={() => setVideoModelOpen(true)}
              className="flex h-12 w-full items-center gap-2.5 rounded-full border border-ink/10 bg-ink/[0.02] px-3 text-left transition-colors hover:bg-ink/[0.05]"
            >
              {batchVideoModelId ? (
                <>
                  <ProviderLogo provider={getModel(batchVideoModelId)?.provider ?? ''} />
                  <ModelTriggerLabel
                    name={getModel(batchVideoModelId)?.displayName ?? batchVideoModelId}
                    recommended={!!getModel(batchVideoModelId)?.tags.includes('recommended')}
                    savings={officialSavingsPercent(batchVideoModelId)}
                  />
                </>
              ) : (
                <span className="flex-1 truncate text-sm text-ink-400">Select Model</span>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" />
            </button>
            <ModelPickerModal
              appId="broll-studio"
              task="video"
              isOpen={videoModelOpen}
              onClose={() => setVideoModelOpen(false)}
              costParams={{ durationSeconds: representativeSeconds, resolution: effectiveVideoRes }}
              requireAnyModes={videoAnimateCount > 0 ? STILL_CAPABLE_MODES : undefined}
              requireModeNote="Greyed-out models can't animate a still. They take neither a start frame nor reference images."
            />
            {(batchVideoResOptions.length > 0 || batchVideoDurationOptions.length > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {batchVideoResOptions.length > 0 && (
                  <ConstraintChip
                    grow
                    openDirection="up"
                    options={batchVideoResOptions}
                    value={effectiveVideoRes}
                    onChange={(v) => setBatchVideoResolution(v)}
                    render={videoResolutionLabel}
                  />
                )}
                {/* Clip length. On a Dialogue Clips storyboard it defaults to
                    Auto — one length per spoken line rather than one length
                    for the whole run — and the trigger reads back the run's
                    real spread ("Auto · 5–10s"), since every one of those
                    seconds is billed on the button below. A silent b-roll run
                    has no words to fit, so it's the plain ladder pinned for
                    the run, as it was before Auto existed. */}
                {batchVideoDurationOptions.length > 0 && (
                  <ConstraintChip
                    grow
                    openDirection="up"
                    options={[
                      ...(runHasSpokenCard ? [AUTO_DURATION] : []),
                      ...batchVideoDurationOptions.map(String),
                    ]}
                    value={pinnedVideoDuration ? String(pinnedVideoDuration) : AUTO_DURATION}
                    onChange={(v) => setBatchVideoDuration(v === AUTO_DURATION ? undefined : Number(v))}
                    render={(v) => (
                      <span>{v === AUTO_DURATION ? autoDurationLabel : `${v}s`}</span>
                    )}
                    renderOption={(v) => (
                      v === AUTO_DURATION ? (
                        <span className="flex w-full items-center justify-between gap-6">
                          <span>Auto</span>
                          <span className="text-ink-500">fits each line</span>
                        </span>
                      ) : (
                        <span>{v}s</span>
                      )
                    )}
                />
              )}
              </div>
            )}

            {/* Balance only when it's in the way — the price itself rides on
                the button. */}
            {balance !== null && videoOverBudget && (
              <p className="text-[11px] text-red-400 light:text-red-600">
                Not enough credits. Your balance is {balance.toLocaleString()}.
              </p>
            )}
            {videoModelCantAnimate && (
              <p className="text-[11px] text-red-300 light:text-red-700">
                {getModel(batchVideoModelId ?? '')?.displayName ?? 'This model'} can&rsquo;t animate a still. Every card with an image would fail. Pick a model that takes a start frame or reference images.
              </p>
            )}
              <button
                type="button"
                onClick={confirmVideoBatch}
                disabled={videoTargets.length === 0 || videoModelCantAnimate}
                className="flex h-[46px] w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-broll-500 px-4 text-[13px] font-bold tracking-tight text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
              >
                {videoConfirm.stillsOnly
                  ? <Clapperboard className="h-3.5 w-3.5" />
                  : <VideoIcon className="h-3.5 w-3.5" />}
                {videoTargets.length === 0
                  ? (videoConfirm.stillsOnly ? 'Animate' : 'Generate')
                  : videoConfirm.stillsOnly
                    ? `Animate ${videoTargets.length} Still${videoTargets.length === 1 ? '' : 's'}`
                    : `Generate ${videoTargets.length} Video${videoTargets.length === 1 ? '' : 's'}`}
                {/* The price sits on the button that spends it. */}
                <span className="flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                  <Coins className="h-3 w-3" strokeWidth={2} />
                  {videoTargets.length === 0 ? '—' : formatCredits(videoBatchCredits) ?? '—'}
                </span>
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {downloadOpen && (
        <ClipDownloadModal
          entries={allClipEntries}
          zipBasename="broll-clips"
          onClose={() => setDownloadOpen(false)}
        />
      )}
    </div>
  )
}

// The option-column picker inside both batch dialogs. Renders nothing for a
// single-scene batch (one card per column — the choice would be meaningless).
function ColumnChips({
  columns,
  selected,
  onChange,
}: {
  columns: number[]
  selected: Set<number>
  onChange: (next: Set<number>) => void
}) {
  if (columns.length < 2) return null
  const allOn = columns.every((c) => selected.has(c))
  const toggle = (col: number) => {
    const next = new Set(selected)
    if (next.has(col)) next.delete(col)
    else next.add(col)
    onChange(next)
  }
  const chip = (active: boolean) =>
    `flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
      active
        ? 'border-broll-400/40 bg-broll-500/15 text-broll-200'
        : 'border-ink/10 bg-ink/[0.03] text-ink-400 hover:border-ink/20 hover:bg-ink/[0.06] hover:text-ink-200'
    }`
  return (
    <div>
      {/* No eyebrow and no hint paragraph: the chips say "Option 1 / All
          Options" in full, and a dialog that has to teach on every open is a
          dialog nobody reads.

          **All Options LEADS the row** (September 2026, Massimo's call). It is
          the state the dialog opens in and the one you come back to, and it sat
          at the far end, past a row that grows with the storyboard — so the
          selected chip was the last thing on the line and the way back to it
          moved every time the deliveries changed. First, it is where the eye
          already is.

          **They MULTI-SELECT, every option ticked on open** (September 2026,
          Massimo's call). They were one-of-N — pick Option 2 and you lost
          Option 1 — so a member wanting two of three deliveries had to run the
          dialog twice and pay two round trips of attention for one decision.
          Ticked-by-default is the same promise the line checklist makes: the
          dialog opens on the whole run, and narrowing it is the deliberate act.
          "All Options" is the way back to that state and lights only when it IS
          the state; it never clears, because a run of nothing is not a thing to
          offer a shortcut to.

          The tick inside a chip means SELECTED now. It used to mean "this
          column has nothing left to generate", which was already ambiguous
          beside a filled chip and would be unreadable with every chip ticked on
          open. What it was telling you is said in words directly below — "Also
          regenerate the N cards that already have an image" — and in the count
          on the Generate button. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(new Set(columns))}
          className={chip(allOn)}
          title="Cover every option"
        >
          All Options
        </button>
        {columns.map((col) => (
          <button key={col} type="button" onClick={() => toggle(col)} className={chip(selected.has(col))}>
            {selected.has(col) && <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} />}
            Option {col + 1}
          </button>
        ))}
      </div>
    </div>
  )
}

// The other axis of the same scoping: which LINES of the script the run covers.
// The option chips pick a column across the storyboard; this picks the rows down
// it. Every line is ticked when the dialog opens, so the default is still the
// whole run and narrowing it is a deliberate act — the same promise the chips
// make (September 2026, Massimo's call: *"allow the user to list out all the
// lines of their script with a checkbox ... they can select which lines they
// want to generate for"*).
//
// A checklist and not more chips: a storyboard is routinely a dozen lines, the
// picks are not mutually exclusive, and the thing a member recognises a line by
// is the WORDS — so each row has to be wide enough to print them. The list caps
// its own height and scrolls; the dialog must not grow with the script.
//
// It renders only for a run that spans more than one line. A per-scene press
// already names its one line in the dialog's subtitle, and a checklist of one
// is a control with nothing to choose.
function LineChecklist({
  scenes,
  lineOf,
  selected,
  onChange,
}: {
  scenes: number[]
  lineOf: (scene: number) => string
  selected: Set<number>
  onChange: (next: Set<number>) => void
}) {
  if (scenes.length < 2) return null
  const allOn = scenes.every((n) => selected.has(n))
  const toggle = (scene: number) => {
    const next = new Set(selected)
    if (next.has(scene)) next.delete(scene)
    else next.add(scene)
    onChange(next)
  }
  // No `mt-` here or on the chips above: both dialogs stack their blocks in a
  // flex column with one gap, and a block that also brings a margin of its own
  // is exactly the unevenness that stack exists to stop.
  return (
    <div className="overflow-hidden rounded-xl border border-ink/10 bg-ink/[0.03]">
      {/* A count, not a label. "Lines" on its own would be an eyebrow over a
          list that is self-evidently a list of lines; the count is the one
          thing here that changes as you tick, and it is what the Generate
          button's own number is derived from. */}
      <div className="flex items-center justify-between gap-2 border-b border-ink/5 px-3 py-2">
        <span className="text-[11px] font-medium text-ink-400">
          {selected.size} of {scenes.length} Lines
        </span>
        <button
          type="button"
          onClick={() => onChange(allOn ? new Set() : new Set(scenes))}
          className="rounded-full px-2 py-0.5 text-[11px] font-medium text-ink-400 transition-colors hover:bg-ink/[0.06] hover:text-ink-200"
        >
          {allOn ? 'Clear' : 'Select All'}
        </button>
      </div>
      {/* ~5 rows before it scrolls. Tall enough that a short storyboard never
          scrolls at all, short enough that a twenty-line one can't push the
          model picker and the Generate button off a laptop screen. */}
      <div className="max-h-[188px] overflow-y-auto p-1">
        {scenes.map((scene) => (
          <label
            key={scene}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-ink/[0.05]"
          >
            <input
              type="checkbox"
              checked={selected.has(scene)}
              onChange={() => toggle(scene)}
              className="h-3.5 w-3.5 shrink-0 accent-broll-500"
            />
            <span
              className="shrink-0 text-base italic leading-none tabular-nums text-ink-500"
              style={{ fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }}
            >
              {String(scene).padStart(2, '0')}
            </span>
            {/* Truncated, never wrapped: the rows have to stay one height or
                the list's own cap means a different number of lines each time
                it opens. The full sentence is in the `title`. */}
            <span
              className="min-w-0 flex-1 truncate pr-[0.15em] text-sm italic tracking-normal text-ink-300"
              style={{ fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }}
              title={lineOf(scene)}
            >
              &ldquo;{lineOf(scene)}&rdquo;
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

// Memoized per-card row. Binds the key-taking parent callbacks into the
// per-card closures VariationCard expects, with stable identity — so one
// card's state change no longer re-renders every other card in every scene.
// Effective only because the props from BrollStudio (refs, handlers) are
// referentially stable (useMemo/useCallback there) and cardStates[key] keeps
// the same reference for cards that didn't change.
const VariationCardRow = memo(function VariationCardRow({
  cardKey,
  sceneNumber,
  optionNumber,
  scriptLine,
  variation,
  cardState,
  onUpdateCardState,
  onUpdateCardStateFn,
  onDeleteVariation,
  characterRef,
  productRef,
  productPhotos,
  onChangeStyle,
  selectedProduct,
  selectedModel,
  selectedProductId,
  selectedModelId,
  selectedScriptId,
  productContext,
  modelContext,
  onOpenCharacterPicker,
  onOpenProductPicker,
  generateImageToken,
  batchImageOverride,
  generateVideoToken,
  batchVideoOverride,
  chainImageRef,
  onReplayCard,
  resultStyle,
  resultRealism,
  resultVoiceProfile,
  onUpdateVoiceProfile,
}: {
  cardKey: string
  sceneNumber: number
  optionNumber: number
  scriptLine: string
  variation: PromptVariation
  cardState: CardState
  onUpdateCardState: (key: string, updates: Partial<CardState>) => void
  onUpdateCardStateFn: (key: string, updater: (prev: CardState) => Partial<CardState>) => void
  onDeleteVariation: (sceneNumber: number, variationId: string) => void
  characterRef?: ReferenceImage
  productRef?: ReferenceImage
  productPhotos?: string[]
  onChangeStyle?: () => void
  selectedProduct?: Product | null
  selectedModel?: Model | null
  selectedProductId?: string
  selectedModelId?: string
  selectedScriptId?: string
  productContext?: string
  modelContext?: string
  onOpenCharacterPicker?: () => void
  onOpenProductPicker?: () => void
  generateImageToken?: number
  batchImageOverride?: { aspectRatio: string; resolution?: ImageResolution } | null
  generateVideoToken?: number
  batchVideoOverride?: BatchVideoSettings | null
  chainImageRef?: string
  onReplayCard?: (key: string, kind: CardReplayKind) => void
  resultStyle?: string
  resultRealism?: boolean
  resultVoiceProfile?: string
  onUpdateVoiceProfile?: (text: string) => void
}) {
  const variationId = variation.id
  const onUpdateState = useCallback(
    (updates: Partial<CardState>) => onUpdateCardState(cardKey, updates),
    [onUpdateCardState, cardKey],
  )
  const onUpdateStateFn = useCallback(
    (updater: (prev: CardState) => Partial<CardState>) => onUpdateCardStateFn(cardKey, updater),
    [onUpdateCardStateFn, cardKey],
  )
  const onDelete = useCallback(
    () => onDeleteVariation(sceneNumber, variationId),
    [onDeleteVariation, sceneNumber, variationId],
  )
  const onReplay = useMemo(
    () => (onReplayCard ? (kind: CardReplayKind) => onReplayCard(cardKey, kind) : undefined),
    [onReplayCard, cardKey],
  )
  return (
    <VariationCard
      sceneNumber={sceneNumber}
      optionNumber={optionNumber}
      scriptLine={scriptLine}
      variation={variation}
      cardState={cardState}
      onUpdateState={onUpdateState}
      onUpdateStateFn={onUpdateStateFn}
      onDelete={onDelete}
      onReplay={onReplay}
      characterRef={characterRef}
      productRef={productRef}
      productPhotos={productPhotos}
      onChangeStyle={onChangeStyle}
      selectedProduct={selectedProduct}
      selectedModel={selectedModel}
      selectedProductId={selectedProductId}
      selectedModelId={selectedModelId}
      selectedScriptId={selectedScriptId}
      productContext={productContext}
      modelContext={modelContext}
      onOpenCharacterPicker={onOpenCharacterPicker}
      onOpenProductPicker={onOpenProductPicker}
      generateImageToken={generateImageToken}
      batchImageOverride={batchImageOverride}
      generateVideoToken={generateVideoToken}
      batchVideoOverride={batchVideoOverride}
      chainImageRef={chainImageRef}
      resultStyle={resultStyle}
      resultRealism={resultRealism}
      voiceProfile={resultVoiceProfile}
      onUpdateVoiceProfile={onUpdateVoiceProfile}
    />
  )
})

// Retype a scene's spoken line. Same shape as Continuous' SceneEditModal, with
// none of its structural operations: a per-line storyboard's scenes come from
// the LLM's own segmentation of the script, so there's nothing to split or
// merge here — just the words.
//
// Saving is instant and free. A dialogue prompt embeds the line verbatim in
// quotes, so the new words are swapped into every prompt of the scene without
// an LLM call; the room, the gesture and the light stay exactly as written.
function SceneLineEditModal({
  sceneNumber,
  scriptLine,
  speaks,
  onSave,
  onClose,
}: {
  sceneNumber: number
  scriptLine: string
  // Whether this scene's cards actually say the line. Only changes the copy —
  // in silent b-roll the line is the voiceover laid over the footage, so
  // editing it changes what the shots are meant to illustrate, not their words.
  speaks: boolean
  onSave: (line: string) => void
  onClose: () => void
}) {
  const [line, setLine] = useState(scriptLine)
  useCloseOnEscape(true, onClose)
  useCloseOnAppSwitch(true, onClose)
  // Selecting the line and releasing the mouse over the backdrop fires a click
  // on the common ancestor — a bare onClick={onClose} would throw the edit away.
  const backdrop = useBackdropClose(onClose)

  const trimmed = line.trim()
  const dirty = trimmed !== scriptLine.trim()

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm modal-fade" {...backdrop}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-ink/10 bg-ink-950/95 p-5 shadow-2xl modal-pop">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-ink-100">Line {sceneNumber}</h3>
            <p className="mt-1 text-xs text-ink-500">
              {speaks
                ? 'What the character says in this scene.'
                : 'The voiceover heard over this scene, and what its shots have to show.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-ink-500 transition-colors hover:bg-ink/5 hover:text-ink-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        <textarea
          value={line}
          onChange={(e) => setLine(e.target.value)}
          rows={3}
          autoFocus
          className="mt-4 w-full resize-none rounded-2xl border border-ink/10 bg-ink/[0.03] px-3.5 py-3 text-sm leading-relaxed text-ink-100 placeholder:text-ink-600 focus:border-ink/20 focus:outline-none"
          placeholder={speaks ? 'What the character says here' : 'What the voiceover says over this scene'}
        />

        {/* No explainer under the box. It ran to three lines to say that saving
            is free, instant and doesn't touch the shots — which is what saving
            a line has always done, and reading it every time you fix a typo is
            the clutter, not the reassurance. */}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-ink/10 bg-ink/[0.03] px-4 py-1.5 text-[11px] font-medium text-ink-300 transition-colors hover:border-ink/20 hover:bg-ink/[0.06] hover:text-ink-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!dirty || !trimmed}
            onClick={() => { onSave(trimmed); onClose() }}
            className="rounded-full bg-broll-500 px-4 py-1.5 text-[11px] font-medium text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
          >
            Save Line
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SceneSection({
  scene,
  cardStates,
  cardLens,
  onReplayCard,
  onUpdateCardState,
  onUpdateCardStateFn,
  onAddVariation,
  onDeleteVariation,
  onEditSceneLine,
  characterRef,
  productRef,
  productPhotos,
  onChangeStyle,
  selectedProduct,
  selectedModel,
  selectedProductId,
  selectedModelId,
  selectedScriptId,
  productContext,
  modelContext,
  onOpenCharacterPicker,
  onOpenProductPicker,
  batchTokens,
  batchImageOverride,
  videoTokens,
  batchVideoOverride,
  dialogueChainRefs,
  onGenerateScene,
  onGenerateSceneVideos,
  resultStyle,
  resultRealism,
  resultVoiceProfile,
  onUpdateVoiceProfile,
}: {
  scene: Scene
  cardStates: Record<string, CardState>
  cardLens: CardLens | null
  onReplayCard?: (key: string, kind: CardReplayKind) => void
  onUpdateCardState: (key: string, updates: Partial<CardState>) => void
  onUpdateCardStateFn: (key: string, updater: (prev: CardState) => Partial<CardState>) => void
  onAddVariation: (sceneNumber: number, variation: PromptVariation) => void
  onDeleteVariation: (sceneNumber: number, variationId: string) => void
  onEditSceneLine?: (sceneNumber: number, line: string) => void
  characterRef?: ReferenceImage
  productRef?: ReferenceImage
  productPhotos?: string[]
  onChangeStyle?: () => void
  selectedProduct?: Product | null
  selectedModel?: Model | null
  selectedProductId?: string
  selectedModelId?: string
  selectedScriptId?: string
  productContext?: string
  modelContext?: string
  onOpenCharacterPicker?: () => void
  onOpenProductPicker?: () => void
  batchTokens: Record<string, number>
  batchImageOverride?: { aspectRatio: string; resolution?: ImageResolution } | null
  videoTokens: Record<string, number>
  batchVideoOverride?: BatchVideoSettings | null
  // Card key → the still that card's talking-head shot chains from. Only
  // DIALOGUE cards have an entry, and only from the second one onward.
  dialogueChainRefs: Record<string, string>
  onGenerateScene: () => void
  onGenerateSceneVideos: () => void
  resultStyle?: string
  resultRealism?: boolean
  resultVoiceProfile?: string
  onUpdateVoiceProfile?: (text: string) => void
}) {
  const [lineEditorOpen, setLineEditorOpen] = useState(false)
  return (
    // `content-visibility: auto` brings paint containment, which clips the
    // cards' soft drop shadow at this box's edges. The `-m-4 p-4` bleed gives
    // the shadow 16px of room inside the contained box; the negative margin
    // cancels against the parent's flex `gap-10`, so layout is unchanged.
    <div className="-m-4 p-4" style={{ contentVisibility: 'auto', containIntrinsicSize: '700px' }}>
      {/* Scene header — the take number, the line, then the two per-scene batch
          buttons, CENTRED and stacked at EVERY width (August 2026, Massimo's
          call: match how it looks on a phone). It used to be a masthead on a
          desktop — number, hairline rule, the line running away to the right,
          the buttons parked on the far edge — a shape a phone had already given
          up, because ~330px of shrink-0 buttons left the line a column two
          characters wide. Centred, one header serves both, and it stacks under
          the storyboard's own centred batch strip instead of reading as a
          second bar aligned a different way. The rule went with the split (it
          divided a row that no longer exists) and so did the `LINE N` chip: it
          printed the scene's number two inches under the 48px numeral that is
          the header's own first line. The spoken-duration chip was removed
          earlier — its estimate was unreliable. */}
      <div className="mb-5 flex flex-col items-center gap-3">
        {/* `w-full`, not a shrink-to-fit column. Under `items-center` alone this
            block sized itself to fit-content and landed at ~470px inside an
            845px panel — with a `w-full` chain under it the percentage can't
            resolve until the parent has a width, and the parent was waiting on
            the content — so the line wrapped onto a second row with 180px of
            empty panel either side of it. Full width, `text-center` inside, and
            it wraps only when the words genuinely run out of room. */}
        <div className="flex w-full min-w-0 flex-col items-center gap-1">
          <span
            className="text-5xl font-normal italic tabular-nums text-ink-700"
            style={{ fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }}
          >
            {String(scene.number).padStart(2, '0')}
          </span>
          {/* No reading-measure cap. A `max-w-2xl` was tried and came straight
              off: the panel is ~1000px wide and the line is the one thing here
              worth reading, so capping it wrapped a quote onto a second line
              with one word alone on it while 300px sat empty either side. It
              takes the width it has and wraps only when it genuinely runs out. */}
          <div className="flex w-full min-w-0 flex-col items-center gap-1.5">
            {/* The line itself, and the place you retype it. Clicking it opens
                the editor; saving swaps the quoted words in this scene's
                prompts, so a dialogue card says the new sentence without a
                regeneration. Read-only when the host doesn't hand us a handler.

                **Instrument Serif italic**, the app's own display face, same
                face and slant as the numeral over it (September 2026, Massimo's
                call). It is `font-normal` and has to stay there: the face ships
                ONE weight,
                so a `font-light` or a `font-bold` only asks the browser to
                synthesize one — see the Dashboard's masthead, where that was
                tried and reverted. It is also set a step LARGER than the sans
                it replaced (20px against 18, 17 against 15 in the detail
                modals), because a serif's smaller x-height reads a size down at
                the same number.

                `tracking-normal`, and that number walked (Massimo's call,
                September 2026). It was `tracking-tight` while the line was a
                sans, went to -0.035em to tighten it, came BACK to -0.015em when
                the face changed (Instrument Serif is already tightly set, so a
                negative meant for Geist crowded it), and went to zero when the
                line went italic. Zero has to be stated: the body's -0.01em for
                Geist inherits as a fixed -0.16px. Tighten the sans, loosen the serif — the
                number belongs to the face, not to the taste. `leading-tight`
                because a quote that wraps should read as one block, not as two
                lines. A truncated copy takes `pr-[0.15em]` or `overflow:
                hidden` slices the italic closing quote in half. `text-ink-300`
                (#D4D4D8), with no hover colour: the wash and the pencil say
                it is editable. Face, weight, size,
                tracking and colour are ONE
                decision across the five places a script line is printed — the storyboard header here, the batch dialogs' line
                checklist, both detail modals, Continuous — because they are one
                voice, and a quote set differently in one of them shows up as
                five different lines. */}
            {onEditSceneLine ? (
              <button
                type="button"
                onClick={() => setLineEditorOpen(true)}
                title="Edit this line"
                className="group/line -mx-1.5 flex w-full items-start justify-center gap-2 rounded-lg px-1.5 py-0.5 text-center transition-colors hover:bg-ink/[0.04]"
              >
                <p
                  className="text-center text-xl leading-tight text-ink-300 font-normal italic tracking-normal"
                  style={{ fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }}
                >
                  &ldquo;{scene.scriptLine}&rdquo;
                </p>
                <Pencil className="mt-1.5 h-3 w-3 shrink-0 text-ink-600 opacity-0 transition-opacity group-hover/line:opacity-100" strokeWidth={2} />
              </button>
            ) : (
              <p
                className="text-center text-xl leading-tight text-ink-300 font-normal italic tracking-normal"
                style={{ fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }}
              >
                &ldquo;{scene.scriptLine}&rdquo;
              </p>
            )}
          </div>
        </div>
        {/* Per-scene batches — one row's worth of images or clips, so a member
            can work scene by scene instead of committing the whole storyboard's
            credits in one press. */}
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onGenerateScene}
            title="Generate images for every variation in this scene"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-ink/10 bg-ink/[0.03] px-3 py-1.5 text-[11px] font-medium text-ink-300 transition-colors hover:border-ink/20 hover:bg-ink/[0.06] hover:text-ink-100"
          >
            <Images className="h-3.5 w-3.5" />
            Generate Images
          </button>
          <button
            type="button"
            onClick={onGenerateSceneVideos}
            title="Generate a clip for every variation in this scene"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-ink/10 bg-ink/[0.03] px-3 py-1.5 text-[11px] font-medium text-ink-300 transition-colors hover:border-ink/20 hover:bg-ink/[0.06] hover:text-ink-100"
          >
            <VideoIcon className="h-3.5 w-3.5" />
            Generate Videos
          </button>
        </div>
      </div>

      {/* The scene's variations plus the Add-option card across one row when
          there is room — the Add card is just another cell in the grid. Both
          deliveries are three variations (a four-column row); a scene that
          carries four — an added option, or a session generated back when
          Dialogue Clips emitted a fourth card — runs five wide rather than
          wrapping the Add card onto a line of its own.

          The column count is a CONTAINER query, never a viewport one: what
          squeezes this grid is the OUTPUT COLUMN, which loses ~340px the moment
          the History rail opens. On `xl:` the four cells stayed four on a 2000px
          screen with the rail out, dropping every card to ~170px — so the tiles
          a member is actually judging got small to keep an empty Add card on
          their line. Below the four-up threshold the row narrows to three and
          the Add card wraps onto a line of its own, which is the cell we can
          afford to lose.

          The Add card is a FULL cell, not a half one. It was halved for a day
          (doubled tracks, each variation spanning two) to hand its width back to
          the stills, and reverted the same day — Massimo's call. */}
      <div className="@container">
        <div className={`grid grid-cols-2 gap-3 @[560px]:grid-cols-3 @[840px]:grid-cols-4 ${scene.variations.length >= 4 ? '@[1040px]:grid-cols-5' : ''}`}>
          {scene.variations.map((variation, i) => {
            const key = `${scene.number}-${i}`
            const state = cardStates[key] ?? viewOrSelf(key, createDefaultCardState(variation, scene.scriptLine), cardLens)
            return (
              <VariationCardRow
                key={variation.id}
                cardKey={key}
                sceneNumber={scene.number}
                optionNumber={i + 1}
                scriptLine={scene.scriptLine}
                variation={variation}
                cardState={state}
                onUpdateCardState={onUpdateCardState}
                onUpdateCardStateFn={onUpdateCardStateFn}
                onDeleteVariation={onDeleteVariation}
                characterRef={characterRef}
                productRef={productRef}
                productPhotos={productPhotos}
                onChangeStyle={onChangeStyle}
                selectedProduct={selectedProduct}
                selectedModel={selectedModel}
                selectedProductId={selectedProductId}
                selectedModelId={selectedModelId}
                selectedScriptId={selectedScriptId}
                productContext={productContext}
                modelContext={modelContext}
                onOpenCharacterPicker={onOpenCharacterPicker}
                onOpenProductPicker={onOpenProductPicker}
                generateImageToken={batchTokens[key]}
                batchImageOverride={batchImageOverride}
                generateVideoToken={videoTokens[key]}
                batchVideoOverride={batchVideoOverride}
                chainImageRef={dialogueChainRefs[key]}
                onReplayCard={onReplayCard}
                resultStyle={resultStyle}
                resultRealism={resultRealism}
                resultVoiceProfile={resultVoiceProfile}
                onUpdateVoiceProfile={onUpdateVoiceProfile}
              />
            )
          })}
          <AddNewCard onAdd={(variation) => onAddVariation(scene.number, variation)} productVisible={scene.productVisible} />
        </div>
      </div>

      {lineEditorOpen && onEditSceneLine && (
        <SceneLineEditModal
          sceneNumber={scene.number}
          scriptLine={scene.scriptLine}
          speaks={scene.variations.some((v) => v.tag === 'DIALOGUE')}
          onSave={(line) => onEditSceneLine(scene.number, line)}
          onClose={() => setLineEditorOpen(false)}
        />
      )}
    </div>
  )
}

function AddNewCard({
  onAdd,
  productVisible,
}: {
  onAdd: (variation: PromptVariation) => void
  productVisible?: boolean
}) {
  const handleAdd = () => {
    onAdd({
      id: `manual-${Date.now()}`,
      label: 'Manual Option',
      tag: 'ACTION',
      // Follow the scene's product visibility: on a line that attacks the
      // category, attaching the product reference renders the advertised
      // product as the thing being criticised. The user can flip it back on
      // from the card's ref pills.
      refs: productVisible === false ? 'character' : 'both',
      prompt: '',
    })
  }
  return (
    // A normal card in the grid: same 9/16 footprint as the variation cards, so
    // the three variations plus this Add card fill the four-column row evenly.
    <button
      onClick={handleAdd}
      title="Add a blank option to this scene"
      className="group/add flex aspect-[9/16] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink/20 bg-ink/[0.03] transition-colors hover:border-broll-400/60 hover:bg-broll-500/10"
    >
      <Plus className="h-5 w-5 shrink-0 text-ink-400 transition-colors group-hover/add:text-broll-300" />
      <span className="text-[10px] font-medium text-ink-300 transition-colors group-hover/add:text-broll-300">
        Add Option
      </span>
    </button>
  )
}

// The storyboard in outline, at the shape it will land in. The header is the
// scene masthead's own — numeral over the line over the two per-scene pills,
// CENTRED — because that is what replaces it; it was still the left-aligned
// number-beside-two-lines the masthead gave up in August 2026, so the landing
// storyboard jumped sideways out of its own placeholder.
function SkeletonScene() {
  return (
    <div>
      <div className="mb-5 flex flex-col items-center gap-3">
        <div className="flex w-full flex-col items-center gap-2">
          <div className="skeleton h-11 w-14" />
          <div className="skeleton h-5 w-full max-w-[420px]" />
        </div>
        <div className="flex items-center gap-2">
          <div className="skeleton h-7 w-[124px]" style={{ borderRadius: 9999 }} />
          <div className="skeleton h-7 w-[124px]" style={{ borderRadius: 9999 }} />
        </div>
      </div>
      <div className="@container">
        <div className="grid grid-cols-2 gap-3 @[560px]:grid-cols-3 @[840px]:grid-cols-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton skeleton-card aspect-[9/16]" />
          ))}
        </div>
      </div>
    </div>
  )
}
