import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Download, Bookmark, Check, ImagePlus, Wand2, LayoutGrid, Pencil, Upload, FolderOpen, Copy } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { getUrl } from '../../../utils/assetStore'
import { downloadImage } from '../../../utils/downloadImage'
import { copyToClipboard } from '../../../utils/clipboard'
import { humanizeError } from '../../../utils/friendlyError'
import type { CharacterHistoryItem, Product, Model, Script, VoicePreset, BRoll } from '../../../stores/types'
import {
  getModel,
  getDefaultModel,
  estimateCredits,
  formatCredits,
  type AspectRatio,
  type ImageResolution,
} from '../../../utils/models'
import ModelPicker from '../../../components/ModelPicker'
import ConstraintChip from '../../../components/ConstraintChip'
import AspectIcon from '../../../components/AspectIcon'
import SegmentedToggle from '../../../components/SegmentedToggle'
import ModelWaitNotice from '../../../components/ModelWaitNotice'
import BankPicker from '../../../components/BankPicker'
import ExpandTextModal, { ExpandButton } from '../../../components/ExpandableText'
import {
  startCharacterTask,
  startCharacterEditTask,
  finishCharacterTask,
  buildJsonPrompt,
  buildImagePrompt,
  buildSheetPrompt,
} from '../services/generateCharacter'
import { pickInfluencerName } from './nameGenerator'

// A B-Roll-style editor for an influencer image. Clicking a portrait opens this:
// the left column mirrors the B-Roll card editor — a segmented mode toggle,
// an Image Model picker + constraint chips, references / prompt, and a single
// accent Generate pill. The right column is the per-influencer outputs gallery;
// the highlighted tile is the "cover" every edit / sheet is built from.
//
// Two modes:
//   • Edit Influencer — attach square reference slots + type an edit instruction,
//     re-generate image-to-image off the cover.
//   • Influencer Sheet — image-model options only; builds a reference sheet
//     (turnaround + expressions) from the cover via image-to-image, same face.
// New outputs persist to characterHistory so nothing is lost on close.

type Mode = 'edit' | 'sheet'

// Reference-image cap — mirrors the Playground's 4-slot limit.
const MAX_REFS = 4

interface SessionOutput {
  // For the base image this is the source history id; for new gens it's the new
  // characterHistory id we stamp on generation.
  id: string
  imageRef: string
  aspectRatio: string
  kind: 'portrait' | 'sheet'
}

interface UploadedRef {
  // data: URI held in memory (too large for the persisted draft, and the modal
  // is ephemeral anyway).
  url: string
  name: string
}

interface InfluencerEditModalProps {
  item: CharacterHistoryItem
  onClose: () => void
  // Which mode to open in. The gallery's "Make Sheet" action opens straight
  // into 'sheet' so the user just hits Generate; a normal tile click is 'edit'.
  initialMode?: Mode
}

function coerceAspect(ar: string): AspectRatio {
  if (ar.includes('16:9')) return '16:9'
  if (ar.includes('1:1')) return '1:1'
  return '9:16'
}

function aspectStyle(ar: string): React.CSSProperties {
  if (ar.includes('16:9')) return { aspectRatio: '16 / 9' }
  if (ar.includes('1:1')) return { aspectRatio: '1 / 1' }
  return { aspectRatio: '9 / 16' }
}

export default function InfluencerEditModal({ item, onClose, initialMode = 'edit' }: InfluencerEditModalProps) {
  const addCharacterHistory = useBankStore((s) => s.addCharacterHistory)
  const addModel = useBankStore((s) => s.addModel)
  const updateCharacterHistory = useBankStore((s) => s.updateCharacterHistory)
  const models = useBankStore((s) => s.models)
  const addToast = useAppStore((s) => s.addToast)

  const [mode, setMode] = useState<Mode>(initialMode)
  const [promptExpanded, setPromptExpanded] = useState(false)
  // Add-reference affordance: the "+" tile opens a tiny Upload / From bank menu.
  const [refMenuOpen, setRefMenuOpen] = useState(false)
  const [bankPickerOpen, setBankPickerOpen] = useState(false)
  // The reference add-tile menu opens on hover; a short close delay bridges the
  // gap between the tile and the menu so moving onto it doesn't dismiss it.
  const refMenuTimer = useRef<number | null>(null)
  const openRefMenu = () => { if (refMenuTimer.current) window.clearTimeout(refMenuTimer.current); setRefMenuOpen(true) }
  const closeRefMenuSoon = () => { refMenuTimer.current = window.setTimeout(() => setRefMenuOpen(false), 120) }
  const [outputs, setOutputs] = useState<SessionOutput[]>([
    { id: item.id, imageRef: item.imageRef, aspectRatio: item.aspectRatio, kind: item.kind ?? 'portrait' },
  ])
  const [selectedId, setSelectedId] = useState(item.id)
  const [prompt, setPrompt] = useState('')
  const [refs, setRefs] = useState<UploadedRef[]>([])
  const [generating, setGenerating] = useState(false)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  const [savingId, setSavingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const selected = outputs.find((o) => o.id === selectedId) ?? outputs[0]
  const selectedUrl = useAssetUrl(selected?.imageRef)

  // The influencer's display name for the sheet-mode reference card. Prefer the
  // bank name when this generation is saved; otherwise a stable generated one
  // (matches how the gallery names an influencer at save time).
  const linkedModelName = item.linkedModelId ? models.find((m) => m.id === item.linkedModelId)?.name : undefined
  const fallbackName = useMemo(() => pickInfluencerName(item.profile.gender), [item.id])
  const influencerName = linkedModelName ?? fallbackName

  // The Image Model the picker resolves to (same persisted key the form uses),
  // so its constraint chips and credit estimate stay in sync with the picker.
  const persistedImageModel = useSettingsStore((s) => s.getAppModel('character-studio:image:text-to-image'))
  const imageModelId = persistedImageModel ?? getDefaultModel('character-studio', 'image', 'text-to-image')?.id
  const imageConstraints = imageModelId ? getModel(imageModelId)?.imageConstraints : undefined
  const resolutionOptions = (imageConstraints?.resolutions ?? []) as string[]
  const aspectOptions = imageConstraints?.aspectRatios ?? []
  // A sheet only makes sense in a turnaround (16:9) or stacked (9:16) layout.
  const sheetAspectOptions = aspectOptions.filter((a) => a === '16:9' || a === '9:16')

  // Resolution is shared across modes; flipping to Sheet bumps to a crisp tier
  // (sheets pack many panels into one frame) and flipping back restores it.
  const itemResolution = (item.resolution as ImageResolution) ?? '1K'
  const [resolution, setResolution] = useState<ImageResolution>(initialMode === 'sheet' ? '2K' : itemResolution)
  const [preSheetResolution, setPreSheetResolution] = useState<ImageResolution>(itemResolution)
  // Aspect is per-mode: edits keep the source framing; sheets pick an orientation.
  const [editAspect, setEditAspect] = useState<string>(coerceAspect(item.aspectRatio))
  const [sheetAspect, setSheetAspect] = useState<string>('16:9')

  // Clamp the per-mode settings to whatever the chosen model supports when the
  // user swaps models (mirrors the B-Roll card editor).
  useEffect(() => {
    if (!imageConstraints) return
    if (resolutionOptions.length > 0 && !resolutionOptions.includes(resolution)) {
      setResolution(resolutionOptions[0] as ImageResolution)
    }
    if (aspectOptions.length > 0 && !aspectOptions.includes(editAspect)) {
      setEditAspect(aspectOptions[0])
    }
    if (sheetAspectOptions.length > 0 && !sheetAspectOptions.includes(sheetAspect)) {
      setSheetAspect(sheetAspectOptions[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageModelId])

  function handleModeChange(next: Mode) {
    if (next === mode) return
    if (next === 'sheet') {
      setPreSheetResolution(resolution)
      const sheetRes = (resolutionOptions.includes('2K') ? '2K' : resolutionOptions[resolutionOptions.length - 1] ?? '2K') as ImageResolution
      setResolution(sheetRes)
    } else {
      setResolution(preSheetResolution)
    }
    setMode(next)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !generating) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, generating])

  function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setRefs((prev) => (prev.length >= MAX_REFS ? prev : [...prev, { url: reader.result as string, name: file.name }]))
        }
      }
      reader.readAsDataURL(file)
    }
  }

  // Add a reference from the bank — pull the image ref + a label off whichever
  // bank item the user picked (product / influencer / b-roll still). hostReference
  // in the service resolves asset:// refs at gen time, so we store the ref as-is.
  function handlePickFromBank(item: Product | Model | Script | VoicePreset | BRoll) {
    let url: string | undefined
    let name = 'Reference'
    if ('productImage' in item) { url = item.productImage; name = item.productName }
    else if ('characterImage' in item) { url = item.sheetImage || item.characterImage; name = item.name }
    else if ('imageUrl' in item) { url = (item as BRoll).imageUrl; name = (item as BRoll).prompt || 'B-Roll' }
    if (url) setRefs((prev) => (prev.length >= MAX_REFS ? prev : [...prev, { url: url as string, name }]))
  }

  // Stamp a finished generation: persist to characterHistory (so it survives the
  // modal close and shows in the main gallery), prepend to the outputs strip,
  // and select it as the new cover.
  function recordOutput(assetId: string, kind: 'portrait' | 'sheet', aspect: string) {
    const newId = crypto.randomUUID()
    addCharacterHistory({
      id: newId,
      imageRef: assetId,
      profile: item.profile,
      modelId: imageModelId ?? item.modelId,
      aspectRatio: aspect,
      resolution,
      kind,
      createdAt: Date.now(),
    })
    setOutputs((prev) => [{ id: newId, imageRef: assetId, aspectRatio: aspect, kind }, ...prev])
    setSelectedId(newId)
  }

  async function handleEdit() {
    const instruction = prompt.trim()
    if (!instruction || generating || !selected) return
    setGenerating(true)
    try {
      const { taskId, modelId } = await startCharacterEditTask({
        prompt: instruction,
        baseImageRef: selected.imageRef,
        referenceRefs: refs.map((r) => r.url),
        aspectRatio: coerceAspect(editAspect),
        resolution,
      })
      const assetId = await finishCharacterTask(taskId, modelId)
      recordOutput(assetId, 'portrait', editAspect)
      setPrompt('')
      addToast('Edit generated', 'success')
    } catch (err) {
      addToast(humanizeError(err, 'Edit failed. Check your API key and try again.'), 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSheet() {
    if (generating || !selected) return
    setGenerating(true)
    try {
      // Image-to-image off the cover so the sheet keeps the exact same person —
      // startCharacterTask swaps to an i2i model and leads with an identity lock.
      const { taskId, modelId } = await startCharacterTask(
        item.profile,
        undefined,
        resolution,
        undefined,
        'sheet',
        sheetAspect,
        selected.imageRef,
      )
      const assetId = await finishCharacterTask(taskId, modelId)
      recordOutput(assetId, 'sheet', sheetAspect)
      addToast('Influencer sheet generated', 'success')
    } catch (err) {
      addToast(humanizeError(err, 'Sheet generation failed. Check your API key and try again.'), 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave(output: SessionOutput) {
    if (savingId || savedIds.has(output.id)) return
    setSavingId(output.id)
    try {
      const name = pickInfluencerName(item.profile.gender)
      await addModel({
        name,
        characterImage: output.imageRef,
        // A saved sheet doubles as its own reference, so stamp it as sheetImage
        // too — downstream apps prefer it for consistency.
        ...(output.kind === 'sheet' ? { sheetImage: output.imageRef } : {}),
        notes: '',
        source: 'character-studio',
        jsonProfile: buildJsonPrompt(item.profile) as Record<string, unknown>,
      })
      // Link back to the history row (base or persisted gen) so the main
      // gallery shows the saved badge too.
      const justAdded = useBankStore.getState().models.find(
        (m) => m.characterImage === output.imageRef && m.name === name,
      )
      if (justAdded) await updateCharacterHistory(output.id, { linkedModelId: justAdded.id })
      setSavedIds((prev) => new Set(prev).add(output.id))
      addToast(`Saved to bank as ${name}`, 'success')
    } catch (err) {
      addToast(humanizeError(err, 'Save failed'), 'error')
    } finally {
      setSavingId(null)
    }
  }

  async function handleDownload(output: SessionOutput) {
    const url = await getUrl(output.imageRef)
    if (url) await downloadImage(url, `${output.kind === 'sheet' ? 'character-sheet' : 'influencer'}-${output.id}`)
  }

  const creditsLabel = imageModelId
    ? formatCredits(estimateCredits(imageModelId, { imageCount: 1, resolution }))
    : null

  const modal = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={() => { if (!generating) onClose() }}
    >
      {/* Floating close — anchored to the screen corner (like every other
          pop-up) so it never overlaps an output tile. */}
      <button
        type="button"
        onClick={onClose}
        title="Close (Esc)"
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white transition-colors hover:bg-black/60"
      >
        <X className="h-4 w-4" />
      </button>

      <div
        className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-ink/10 bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Body — 50/50 grid; each column scrolls. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
          {/* LEFT — mode toggle + model + refs/prompt + generate */}
          <div className="col-span-1 flex min-h-0 flex-col overflow-y-auto border-b border-ink/5 md:border-b-0 md:border-r">
            <div className="flex grow flex-col gap-6 px-5 pb-6 pt-5">
              {/* Edit Influencer / Influencer Sheet — full-width segmented toggle. */}
              <SegmentedToggle<Mode>
                value={mode}
                onChange={handleModeChange}
                accent="influencers"
                options={[
                  { value: 'edit', label: 'Edit Influencer', icon: Pencil },
                  { value: 'sheet', label: 'Influencer Sheet', icon: LayoutGrid },
                ]}
              />

              {/* Separator between the toggle and the controls below. */}
              <div className="-mt-2 -mb-4 border-b border-ink/5" />

              {/* Image Model picker + constraint chips (resolution + aspect). */}
              <div>
                <span className="text-sm font-medium text-ink-200">Image Model</span>
                <div className="mt-2">
                  <ModelPicker
                    appId="character-studio"
                    task="image"
                    mode="text-to-image"
                    costParams={{ imageCount: 1, resolution }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {resolutionOptions.length > 0 && (
                    <ConstraintChip
                      grow
                      openDirection="down"
                      options={resolutionOptions}
                      value={resolution}
                      onChange={(v) => setResolution(v as ImageResolution)}
                    />
                  )}
                  {mode === 'edit'
                    ? aspectOptions.length > 0 && (
                        <ConstraintChip
                          grow
                          openDirection="down"
                          options={aspectOptions}
                          value={editAspect}
                          onChange={setEditAspect}
                          render={(v) => (
                            <span className="flex items-center gap-1.5">
                              <AspectIcon ratio={v} />
                              <span>{v}</span>
                            </span>
                          )}
                        />
                      )
                    : sheetAspectOptions.length > 0 && (
                        <ConstraintChip
                          grow
                          openDirection="down"
                          options={sheetAspectOptions}
                          value={sheetAspect}
                          onChange={setSheetAspect}
                          render={(v) => (
                            <span className="flex items-center gap-1.5">
                              <AspectIcon ratio={v} />
                              <span>{v}</span>
                            </span>
                          )}
                        />
                      )}
                </div>
              </div>

              {mode === 'edit' ? (
                <>
                  {/* Reference images — square Playground-style slots, capped at 4. */}
                  <div>
                    <span className="text-sm font-medium text-ink-200">Reference images</span>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
                      ({refs.length}/{MAX_REFS}) — optional. Add a product, outfit, or pose to guide the edit.
                    </p>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {refs.map((r, i) => (
                        <div key={i} className="group/ref relative aspect-square overflow-hidden rounded-xl border border-ink/10">
                          <img src={r.url} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            title="Remove"
                            onClick={() => setRefs((prev) => prev.filter((_, idx) => idx !== i))}
                            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-red-500/60 group-hover/ref:opacity-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {refs.length < MAX_REFS && (
                      <div className="relative" onMouseEnter={openRefMenu} onMouseLeave={closeRefMenuSoon}>
                        <button
                          type="button"
                          onClick={() => setRefMenuOpen((v) => !v)}
                          className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-ink/15 bg-ink/[0.02] text-ink-500 transition-colors hover:border-ink/30 hover:text-ink-300"
                        >
                          <ImagePlus className="h-5 w-5" />
                        </button>
                        {refMenuOpen && (
                          <div
                            className="absolute left-0 top-full z-[62] mt-1 w-40 overflow-hidden rounded-xl border border-ink/10 bg-surface-2/95 p-1 shadow-xl backdrop-blur-xl"
                            onMouseEnter={openRefMenu}
                            onMouseLeave={closeRefMenuSoon}
                          >
                            <button
                              type="button"
                              onClick={() => { setRefMenuOpen(false); fileInputRef.current?.click() }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-ink-300 transition-colors hover:bg-ink/[0.06]"
                            >
                              <Upload className="h-3.5 w-3.5" />
                              Upload Image
                            </button>
                            <button
                              type="button"
                              onClick={() => { setRefMenuOpen(false); setBankPickerOpen(true) }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-ink-300 transition-colors hover:bg-ink/[0.06]"
                            >
                              <FolderOpen className="h-3.5 w-3.5" />
                              Pick from Bank
                            </button>
                          </div>
                        )}
                      </div>
                      )}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePickFiles} />
                  </div>

                  {/* Edit prompt — grows to absorb the column's leftover height. */}
                  <div className="flex grow flex-col">
                    <span className="text-sm font-medium text-ink-200">Edit instruction</span>
                    <div className="relative mt-2 flex grow flex-col">
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={4}
                        placeholder="Describe the change — e.g. 'change the top to a red hoodie', 'add round glasses', 'softer warm lighting'…"
                        className="min-h-[96px] w-full grow resize-none rounded-2xl border border-ink/10 bg-ink/[0.03] px-3.5 py-3 text-[13px] leading-[1.5] text-ink-200 placeholder-ink-600 outline-none transition-colors focus:border-ink/20 focus:bg-ink/[0.05]"
                      />
                      <ExpandButton onClick={() => setPromptExpanded(true)} className="absolute bottom-2 right-2" />
                    </div>
                  </div>
                </>
              ) : (
                /* Sheet mode — no prompt; the sheet is built from the source. */
                <div className="flex grow flex-col">
                  <span className="text-sm font-medium text-ink-200">Reference influencer</span>
                  <div className="mt-2 flex items-center gap-3 rounded-full border border-ink/10 bg-ink/[0.02] px-3 py-2">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-ink/10 bg-black">
                      {selectedUrl
                        ? <img src={selectedUrl} alt="" className="h-full w-full object-cover" />
                        : <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-ink-500" /></div>}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink-100">{influencerName}</p>
                      <p className="text-[11px] text-ink-500">Influencer</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                    Builds a turnaround + expressions sheet from this influencer — same face, neutral studio background. Pick a different output on the right to change the source.
                  </p>
                </div>
              )}

              {/* Generate — single accent pill (B-Roll style). */}
              <div className="mt-2 flex flex-col gap-1.5">
                {mode === 'edit' ? (
                  <button
                    type="button"
                    onClick={handleEdit}
                    disabled={!prompt.trim() || generating || !selected}
                    className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-influencers-500 px-7 py-4 text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-influencers-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    {generating ? 'Generating edit…' : `Generate Edit${creditsLabel ? ` (${creditsLabel})` : ''}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSheet}
                    disabled={generating || !selected}
                    className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-influencers-500 px-7 py-4 text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-influencers-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutGrid className="h-4 w-4" />}
                    {generating ? 'Generating sheet…' : `Generate Sheet${creditsLabel ? ` (${creditsLabel})` : ''}`}
                  </button>
                )}
                <div className="min-h-[16px]">
                  <ModelWaitNotice modelId={imageModelId} />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — outputs gallery: portraits pack 3-up; landscapes span the row. */}
          <div className="col-span-1 flex min-h-0 flex-col overflow-y-auto">
            <div className="px-4 py-4">
              <div className="grid grid-cols-3 gap-2 [grid-auto-flow:dense]">
                {generating && (
                  <div
                    className={`flex items-center justify-center rounded-lg border border-influencers-500/30 bg-influencers-500/[0.06] ${
                      (mode === 'sheet' ? sheetAspect : selected?.aspectRatio ?? '9:16').includes('16:9') ? 'col-span-3' : ''
                    }`}
                    style={aspectStyle(mode === 'sheet' ? sheetAspect : selected?.aspectRatio ?? '9:16')}
                  >
                    <Loader2 className="h-5 w-5 animate-spin text-influencers-300" />
                  </div>
                )}
                {outputs.map((o) => (
                  <OutputTile
                    key={o.id}
                    output={o}
                    selected={o.id === selectedId}
                    saved={savedIds.has(o.id)}
                    saving={savingId === o.id}
                    promptText={o.kind === 'sheet' ? buildSheetPrompt(item.profile, o.aspectRatio) : buildImagePrompt(item.profile)}
                    onSelect={() => setSelectedId(o.id)}
                    onSave={() => handleSave(o)}
                    onDownload={() => handleDownload(o)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // BankPicker + ExpandTextModal portal to <body> themselves; rendering them as
  // SIBLINGS of the overlay (not children) keeps their clicks from bubbling
  // through the React tree to the overlay's close-on-click handler.
  return createPortal(
    <>
      {modal}
      <BankPicker
        bankType="products"
        isOpen={bankPickerOpen}
        onClose={() => setBankPickerOpen(false)}
        onSelect={handlePickFromBank}
        tabs={['products', 'models', { type: 'brolls', filter: (it) => !!(it as BRoll).imageUrl }]}
      />
      <ExpandTextModal
        open={promptExpanded}
        onClose={() => setPromptExpanded(false)}
        value={prompt}
        onChange={setPrompt}
        title="Edit instruction"
        placeholder="Describe the change — e.g. 'change the top to a red hoodie', 'add round glasses', 'softer warm lighting'…"
        accent="ink"
      />
    </>,
    document.body,
  )
}

function OutputTile({
  output,
  selected,
  saved,
  saving,
  promptText,
  onSelect,
  onSave,
  onDownload,
}: {
  output: SessionOutput
  selected: boolean
  saved: boolean
  saving: boolean
  promptText: string
  onSelect: () => void
  onSave: () => void
  onDownload: () => void
}) {
  const url = useAssetUrl(output.imageRef)
  const [copied, setCopied] = useState(false)
  const handleCopyPrompt = async () => {
    if (await copyToClipboard(promptText)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
  }
  // Landscape outputs (sheets / 16:9 portraits) span the full row; portraits
  // pack three to a row.
  const isWide = output.aspectRatio.includes('16:9')
  return (
    <div
      onClick={onSelect}
      className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-black transition-all ${
        isWide ? 'col-span-3' : ''
      } ${
        selected ? 'border-influencers-500/70 ring-2 ring-influencers-500/40' : 'border-ink/10 hover:border-ink/25'
      }`}
    >
      {url
        ? <img src={url} alt="" className="block h-auto w-full" />
        : <div className="flex w-full items-center justify-center" style={aspectStyle(output.aspectRatio)}><Loader2 className="h-5 w-5 animate-spin text-ink-500" /></div>}

      {output.kind === 'sheet' && (
        <span className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-medium text-zinc-200 backdrop-blur">
          <LayoutGrid className="h-3 w-3" strokeWidth={2} />
          Sheet
        </span>
      )}

      {selected && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-influencers-500/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white backdrop-blur">
          Source
        </span>
      )}

      {/* Hover actions: Copy Prompt · Save to Bank · Download */}
      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <TileButton
          title={copied ? 'Prompt copied' : 'Copy Prompt'}
          tone={copied ? 'saved' : 'default'}
          onClick={(e) => { e.stopPropagation(); void handleCopyPrompt() }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </TileButton>
        <TileButton
          title={saved ? 'Saved to bank' : saving ? 'Saving…' : 'Save to Bank'}
          tone={saved ? 'saved' : 'default'}
          onClick={(e) => { e.stopPropagation(); if (!saved && !saving) onSave() }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </TileButton>
        <TileButton title="Download image" onClick={(e) => { e.stopPropagation(); onDownload() }}>
          <Download className="h-4 w-4" />
        </TileButton>
      </div>
    </div>
  )
}

function TileButton({
  children,
  onClick,
  title,
  tone = 'default',
}: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  title: string
  tone?: 'default' | 'saved'
}) {
  const toneClass = tone === 'saved'
    ? 'border-emerald-400/50 bg-emerald-500/45 text-emerald-100'
    : 'border-white/20 bg-black/55 text-white hover:bg-black/70'
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${toneClass}`}
    >
      {children}
    </button>
  )
}
