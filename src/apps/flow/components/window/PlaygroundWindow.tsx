// Playground, as a block. The left column is laid out like Playground's own —
// Image, Video or Music across the top, then References, the prompt with
// Enhance, and the model and output settings over Generate — built from the
// same parts, because Playground's own panel is bound to its drafts, its
// project and its batch count, none of which a block has.
//
// A reference added here lands on the canvas as its own block, wired in —
// an upload becomes an Image block, a bank pick a Bank block — so what feeds
// a block is always something the canvas shows. The Video tab's Start and End
// Frame are wired the same way.

import { useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Film, Image as ImageIcon, Images, Music, Pause, Play, Upload, Wand2 } from 'lucide-react'
import type { FlowValue } from '../../types'
import { blockWidth, BANK_TYPE } from '../../engine/catalog'
import { wiresInto } from '../../engine/graph'
import { playgroundInput, refOfPicture } from '../../engine/cost'
import { freeSpot } from '../../engine/layout'
import { useFlowStore } from '../../store/flowStore'
import { getDefaultModel, getModel, imageResolutionLabel, imageResolutionsFor, kieModelIds, kieOnly, videoResolutionLabel } from '../../../../utils/models'
import { useSettingsStore } from '../../../../stores/settingsStore'
import { useAppStore } from '../../../../stores/appStore'
import { saveAsset } from '../../../../utils/assetStore'
import { humanizeError } from '../../../../utils/friendlyError'
import { BANK_CONFIG, type BankType } from '../../../../utils/constants'
import { enhancePlaygroundPrompt } from '../../../playground/service'
import type { PlaygroundMode } from '../../../playground/types'
import SegmentedToggle from '../../../../components/SegmentedToggle'
import SectionCard from '../../../../components/SectionCard'
import ModelPicker from '../../../../components/ModelPicker'
import ConstraintChip from '../../../../components/ConstraintChip'
import PromptToolbar from '../../../../components/PromptToolbar'
import AutoGrowTextarea from '../../../../components/AutoGrowTextarea'
import ExpandTextModal from '../../../../components/ExpandableText'
import BankPicker from '../../../../components/BankPicker'
import Switch from '../../../../components/Switch'
import GridCanvas from '../../../../components/GridCanvas'
import VideoLightbox from '../../../../components/VideoLightbox'
import { MenuItem, MenuSurface } from '../../../../components/Menu'
import { PendingMedia } from '../../../../components/GeneratingMedia'
import { AddTile, ImageTile, RefGroup } from '../../../../components/video/refInputParts'
import { useAssetThumb, useAssetUrl } from '../../../../hooks/useAssetUrl'
import { useAudioPlayback } from '../../../../hooks/useAudioPlayback'
import { InputsBand, NothingYet, RunBand, RunChip, WiredCard } from './parts'
import { blockRuns, type BlockRun, type WindowProps } from './runs'
import DurationLabel from '../../../../components/DurationLabel'

const MODE_TABS: Array<{ value: PlaygroundMode; label: string; icon: LucideIcon }> = [
  { value: 'image', label: 'Image', icon: ImageIcon },
  { value: 'video', label: 'Video', icon: Film },
  { value: 'music', label: 'Music', icon: Music },
]

// The banks whose rows are pictures, for a reference picked from the bank.
const PICTURE_BANKS: BankType[] = ['products', 'models', 'brolls', 'styles']

export default function PlaygroundWindow({ doc, block, plan, run, onRun, onReview }: WindowProps) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const addBlock = useFlowStore((s) => s.addBlock)
  const connect = useFlowStore((s) => s.connect)
  const removeWire = useFlowStore((s) => s.removeWire)
  const setSelection = useFlowStore((s) => s.setSelection)
  const addToast = useAppStore((s) => s.addToast)
  const s = block.settings
  const set = (patch: Record<string, unknown>, coalesce?: string) => patchSettings(block.id, patch, coalesce ? { coalesce: `${coalesce}:${block.id}` } : undefined)
  const mode: PlaygroundMode = s.mode === 'video' || s.mode === 'music' ? s.mode : 'image'
  const modelMode = mode === 'image' ? 'text-to-image' : mode === 'music' ? 'text-to-music' : undefined
  // Until the block picks its own, it runs on Playground's pick — the same
  // fallback its run makes (engine/cost.ts playgroundInput).
  const appPick = useSettingsStore((st) => st.getAppModel(mode === 'image' ? 'playground:image:text-to-image' : mode === 'video' ? 'playground:video' : 'playground:music:text-to-music'))
  // A Higgsfield pick in Playground is skipped: Flow runs kie models only.
  const modelId = (s.modelId as string | undefined) ?? kieOnly(appPick) ?? getDefaultModel('playground', mode, modelMode)?.id
  const model = modelId ? getModel(modelId) : undefined
  const video = model?.videoConstraints
  const bp = plan?.blocks[block.id]
  const runs = blockRuns(block, bp, run)
  const promptWired = wiresInto(doc, block.id, 'prompt').length > 0
  const count = runs.length || 1
  const noun = mode === 'image' ? 'Image' : mode === 'video' ? 'Video' : 'Music'

  // Wire a new block into one of this block's inputs, placed to its left.
  const wireIn = (make: () => string, port: string, what: string) => {
    const id = make()
    const check = connect({ from: id, fromPort: 'out', to: block.id, toPort: port })
    setSelection([block.id])
    addToast(check.ok ? `${what} is on the canvas, wired in.` : check.reason, check.ok ? 'success' : 'error')
  }
  const place = () => freeSpot(doc, { x: block.x - blockWidth('image') - 96, y: block.y }, 'image')
  const uploadInto = async (file: File | undefined, port: string) => {
    if (!file) return
    const ref = await saveAsset(file, file.type)
    wireIn(() => addBlock('image', place(), { settings: { ref, name: file.name.replace(/\.[^.]+$/, '') } }), port, 'The image')
  }
  const bankInto = (bank: BankType, id: string, port: string) => {
    wireIn(() => addBlock('bank', place(), { settings: { bank }, pick: id }), port, `The ${BANK_TYPE[bank].one.toLowerCase()}`)
  }

  // What a run of it sends, fitted to the model — what the chips show.
  const fitted = playgroundInput(block, {})
  // The chips show what runs — the saved setting fitted to the model — so a
  // saved value the model can't take shows as its fit. Picking the value
  // already shown saves nothing: saving it would change the block's key and
  // pay to make the same thing again.
  const keep = (picked: string, shown: string, patch: Record<string, unknown>) => {
    if (picked !== shown) set(patch)
  }
  const setMode = (next: PlaygroundMode) => set({ mode: next, modelId: undefined, resolution: undefined, durationSeconds: undefined })

  return (
    <>
      <div className="flex w-[440px] shrink-0 flex-col border-r border-ink/5">
        <div className="flex h-[57px] shrink-0 items-center border-b border-ink/5 px-5">
          <SegmentedToggle<PlaygroundMode> className="h-10 !p-1" value={mode} onChange={setMode} options={MODE_TABS} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2 px-5 pb-2 pt-3">
            {mode !== 'music' && (
              <SectionCard icon={Images} title="References" contentClassName="flex flex-col gap-3">
                <PictureSlot
                  label="Images"
                  runs={runs}
                  port="refs"
                  many
                  onUnwire={(wireId) => removeWire(wireId)}
                  wires={wiresInto(doc, block.id, 'refs')}
                  onUpload={(f) => void uploadInto(f, 'refs')}
                  onBank={(bank, id) => bankInto(bank, id, 'refs')}
                />
                {mode === 'video' && (
                  <div className="grid grid-cols-2 gap-3">
                    {(['start', 'end'] as const).map((port) => (
                      <PictureSlot
                        key={port}
                        label={port === 'start' ? 'Start Frame' : 'End Frame'}
                        runs={runs}
                        port={port}
                        onUnwire={(wireId) => removeWire(wireId)}
                        wires={wiresInto(doc, block.id, port)}
                        onUpload={(f) => void uploadInto(f, port)}
                        onBank={(bank, id) => bankInto(bank, id, port)}
                      />
                    ))}
                  </div>
                )}
                <p className="text-[11px] leading-relaxed text-ink-500">Each one you add lands on the canvas as its own block, wired in. Wire a still from B-Roll or a face from Characters straight into a slot.</p>
              </SectionCard>
            )}

            {promptWired ? (
              <WiredCard doc={doc} block={block} port="prompt" hint="The prompt comes in on its wire. A Batch wired here makes one per item." />
            ) : (
              <PromptBox
                value={String(s.prompt ?? '')}
                mode={mode}
                onChange={(v) => set({ prompt: v }, 'prompt')}
              />
            )}

            {mode === 'music' && (
              <div className="flex items-center gap-3 rounded-full border border-ink/10 bg-ink/[0.02] py-2 pl-4 pr-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium text-ink-200">Instrumental</span>
                  <span className="block text-[11px] text-ink-500">No vocals</span>
                </span>
                <Switch checked={!!s.instrumental} onChange={(next) => set({ instrumental: next })} label="Instrumental" accent="flow" size="sm" />
              </div>
            )}
          </div>
        </div>

        <RunBand block={block} plan={plan} run={run} onRun={onRun} icon={mode === 'image' ? ImageIcon : mode === 'video' ? Film : Music} label={`Generate ${count > 1 ? `${count} ${noun === 'Music' ? 'Tracks' : `${noun}s`}` : noun}`}>
          <ModelPicker appId="playground" task={mode} mode={modelMode} row value={modelId} onChange={(id) => set({ modelId: id })} persist={false} allowedModelIds={kieModelIds({ task: mode, mode: modelMode, appId: 'playground' })} />
          {mode === 'image' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <ConstraintChip grow size="lg" openDirection="up" options={modelId ? imageResolutionsFor(modelId) : ['1K']} value={fitted.resolution} onChange={(v) => keep(v, fitted.resolution, { resolution: v })} render={imageResolutionLabel} />
              <ConstraintChip grow size="lg" openDirection="up" options={model?.imageConstraints?.aspectRatios ?? ['9:16', '16:9', '1:1']} value={fitted.aspectRatio} onChange={(v) => keep(v, fitted.aspectRatio, { aspectRatio: v })} />
            </div>
          )}
          {mode === 'video' && video && (
            <div className="flex flex-wrap items-center gap-1.5">
              {video.resolutions.length > 0 && <ConstraintChip grow size="lg" openDirection="up" options={video.resolutions} value={fitted.resolution} onChange={(v) => keep(v, fitted.resolution, { resolution: v })} render={videoResolutionLabel} />}
              {video.aspectRatios.length > 0 && <ConstraintChip grow size="lg" openDirection="up" options={video.aspectRatios} value={fitted.aspectRatio} onChange={(v) => keep(v, fitted.aspectRatio, { aspectRatio: v })} />}
              {video.durations.length > 0 && (
                <ConstraintChip grow size="lg" openDirection="up" options={video.durations.map(String)} value={String(fitted.durationSeconds)} onChange={(v) => keep(v, String(fitted.durationSeconds), { durationSeconds: Number(v) })} render={(v) => <DurationLabel>{v}s</DurationLabel>} />
              )}
              {video.supportsAudio && (
                <ConstraintChip grow size="lg" openDirection="up" options={['Audio', 'Mute']} value={fitted.audio ? 'Audio' : 'Mute'} onChange={(v) => keep(v, fitted.audio ? 'Audio' : 'Mute', { audio: v === 'Audio' })} />
              )}
            </div>
          )}
        </RunBand>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <InputsBand doc={doc} block={block} plan={plan} run={run} onReview={onReview} />
        <GridCanvas>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {runs.length === 0 ? (
              <NothingYet icon={mode === 'music' ? Music : mode === 'video' ? Film : ImageIcon} title="Nothing made yet" hint="Each run lands here. A Batch wired into the prompt makes one per item." />
            ) : (
              <div className={`grid gap-3 px-6 py-6 ${mode === 'music' ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'}`}>
                {runs.map((r) => <OutputTile key={r.key} run={r} mode={mode} modelId={modelId} aspect={String(s.aspectRatio ?? '9:16')} />)}
              </div>
            )}
          </div>
        </GridCanvas>
      </div>
    </>
  )
}

// A picture input: what's wired in (a tile each, × unwires it) and an Add
// that lays a new Image or Bank block on the canvas, wired to it.
function PictureSlot({ label, runs, port, many = false, wires, onUnwire, onUpload, onBank }: {
  label: string
  runs: BlockRun[]
  port: string
  many?: boolean
  wires: Array<{ id: string; from: string }>
  onUnwire: (wireId: string) => void
  onUpload: (file: File | undefined) => void
  onBank: (bank: BankType, id: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [bank, setBank] = useState<BankType | null>(null)
  // What arrives on the input, across the runs, each picture once.
  const pictures: FlowValue[] = []
  for (const r of runs) {
    for (const v of r.inputs[port] ?? []) if (!pictures.some((p) => p.key === v.key)) pictures.push(v)
  }
  const canAdd = many || !wires.length
  return (
    <RefGroup label={label} filled={wires.length > 0}>
      <div className="flex flex-wrap gap-1.5">
        {pictures.slice(0, 9).map((v) => {
          // The wire a picture came in on: the one from the block its trace names.
          const wire = wires.find((w) => w.from in v.trace) ?? wires[0]
          return <PictureTile key={v.key} value={v} onRemove={() => wire && onUnwire(wire.id)} />
        })}
        {wires.length > 0 && !pictures.length && (
          <span className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-ink/15 px-1 text-center text-[9px] text-ink-500">Wired · not made yet</span>
        )}
        {canAdd && (
          <AddTile
            label="Add"
            triggerRef={addRef}
            onClick={() => {
              const rect = addRef.current?.getBoundingClientRect()
              setMenu({ x: rect?.left ?? 0, y: (rect?.bottom ?? 0) + 6 })
            }}
          />
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          onUpload(file)
        }}
      />
      {menu && (
        <>
          <div className="fixed inset-0 z-[62]" onClick={() => setMenu(null)} />
          <div className="fixed z-[63]" style={{ left: menu.x, top: menu.y }}>
            <MenuSurface className="w-56">
              <MenuItem icon={Upload} onClick={() => { setMenu(null); fileRef.current?.click() }}>Upload an Image</MenuItem>
              {PICTURE_BANKS.map((b) => (
                <MenuItem key={b} icon={BANK_CONFIG[b].icon as LucideIcon} onClick={() => { setMenu(null); setBank(b) }}>
                  From {BANK_CONFIG[b].label}
                </MenuItem>
              ))}
            </MenuSurface>
          </div>
        </>
      )}
      {bank && (
        <BankPicker
          bankType={bank}
          isOpen
          onClose={() => setBank(null)}
          onSelect={(item) => {
            onBank(bank, item.id)
            setBank(null)
          }}
        />
      )}
    </RefGroup>
  )
}

function PictureTile({ value, onRemove }: { value: FlowValue; onRemove: () => void }) {
  const ref = value.pending ? undefined : refOfPicture(value)
  const thumb = useAssetThumb(ref)
  if (!thumb.url) {
    return <span className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-ink/15 px-1 text-center text-[9px] text-ink-500">{value.pending ? 'Not made yet' : value.label}</span>
  }
  return <ImageTile src={thumb.url} label={value.label} accent onRemove={onRemove} />
}

// The prompt, in Playground's own box: its name inside the top edge, the
// field, and Enhance / Clear / Undo / Redo along the foot.
function PromptBox({ value, mode, onChange }: { value: string; mode: PlaygroundMode; onChange: (v: string) => void }) {
  const addToast = useAppStore((s) => s.addToast)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [past, setPast] = useState<string[]>([])
  const [future, setFuture] = useState<string[]>([])
  const commit = (next: string) => {
    setPast((p) => [...p, value])
    setFuture([])
    onChange(next)
  }
  const enhance = async () => {
    if (!value.trim() || busy) return
    setBusy(true)
    const rewritten = await enhancePlaygroundPrompt(value, mode).catch((err: unknown) => {
      addToast(humanizeError(err, 'Enhance failed.'), 'error')
      return null
    })
    if (rewritten) commit(rewritten)
    setBusy(false)
  }
  return (
    <div className="flex flex-col overflow-hidden rounded-3xl border border-ink/10 bg-ink/[0.02] transition-colors focus-within:border-playground-500/30">
      <div className="flex items-center justify-center gap-1.5 px-4 pt-2.5">
        <Wand2 className="h-3.5 w-3.5 text-ink-500" />
        <span className="text-[13px] font-medium text-ink-200">Prompt</span>
      </div>
      <AutoGrowTextarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={mode === 'music' ? 'Describe the track: the mood, the instruments, the tempo.' : 'Describe what to make. Pictures wired into References come along.'}
        rows={5}
        className="w-full resize-none border-0 bg-transparent px-4 pb-3 pt-1.5 text-sm leading-relaxed text-ink-200 placeholder-ink-600 outline-none"
      />
      <PromptToolbar
        accent="playground"
        onEnhance={() => void enhance()}
        enhanceTitle="Enhance prompt"
        enhanceDisabled={!value.trim()}
        busy={busy}
        onClear={() => commit('')}
        clearDisabled={!value.trim()}
        onUndo={() => {
          const prev = past[past.length - 1]
          if (prev === undefined) return
          setPast((p) => p.slice(0, -1))
          setFuture((f) => [value, ...f])
          onChange(prev)
        }}
        canUndo={past.length > 0}
        onRedo={() => {
          const [next, ...rest] = future
          if (next === undefined) return
          setFuture(rest)
          setPast((p) => [...p, value])
          onChange(next)
        }}
        canRedo={future.length > 0}
        onExpand={() => setExpanded(true)}
      />
      <ExpandTextModal
        open={expanded}
        onClose={() => setExpanded(false)}
        value={value}
        onChange={onChange}
        title="Prompt"
        accent="playground"
        placeholder="Describe what to make."
      />
    </div>
  )
}

// One run's result, as Playground's grid shows it: the image, the clip (a
// press plays it), or the track.
function OutputTile({ run, mode, modelId, aspect }: { run: BlockRun; mode: PlaygroundMode; modelId?: string; aspect: string }) {
  const value = run.result && !run.result.off ? run.result.outputs.out?.[0] : undefined
  if (run.status === 'running' || run.status === 'queued') {
    return mode === 'music'
      ? <div className="flex h-14 items-center gap-3 rounded-2xl border border-ink/5 bg-surface-1/80 px-4"><RunChip status={run.status} note={run.note} /><span className="truncate text-[12px] text-ink-400">{run.label}</span></div>
      : <PendingMedia kind={mode === 'video' ? 'video' : 'image'} family="playground" modelId={modelId} aspectRatio={aspect} prompt={run.label} />
  }
  if (!value) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink/15 p-3 text-center ${mode === 'music' ? 'h-14 flex-row' : ''}`} style={mode === 'music' ? undefined : { aspectRatio: aspect.replace(':', ' / ') }}>
        <RunChip status={run.status} note={run.note} />
        {run.error && <span className="line-clamp-3 text-[10.5px] text-red-400">{run.error}</span>}
      </div>
    )
  }
  if (value.type === 'music') return <TrackRow value={value} label={run.label} />
  return <MediaTile value={value} aspect={aspect} />
}

function MediaTile({ value, aspect }: { value: FlowValue; aspect: string }) {
  const [open, setOpen] = useState(false)
  const still = value.type === 'image' ? value.payload.ref : undefined
  const clip = value.type === 'video' ? value.payload.clips[0] : undefined
  const thumb = useAssetThumb(still ?? clip?.ref)
  const clipUrl = useAssetUrl(open ? clip?.ref : undefined)
  return (
    <>
      <button
        type="button"
        onClick={() => clip && setOpen(true)}
        className={`relative overflow-hidden rounded-xl border border-ink/10 ${clip ? 'cursor-pointer' : 'cursor-default'}`}
        style={{ aspectRatio: aspect.replace(':', ' / ') }}
        title={value.label}
      >
        {thumb.url ? <img src={thumb.url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 bg-ink/10" />}
        {clip && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"><Play className="ml-0.5 h-4 w-4" /></span>
          </span>
        )}
      </button>
      {open && clipUrl && <VideoLightbox videoUrl={clipUrl} prompt={clip?.prompt} fileStem="playground-clip" aspectRatio={aspect} sourceApp="playground" accentClass="border-playground-500/40 bg-playground-500/20 text-playground-100 hover:bg-playground-500/30" onClose={() => setOpen(false)} />}
    </>
  )
}

function TrackRow({ value, label }: { value: FlowValue; label: string }) {
  const ref = value.type === 'music' ? value.payload.ref : null
  const player = useAudioPlayback(ref, value.type === 'music' ? value.payload.durationSeconds ?? 0 : 0)
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink/5 bg-surface-1/80 px-3 py-2.5">
      <button type="button" onClick={player.toggle} aria-label={player.isPlaying ? 'Pause' : 'Play'} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-playground-500 text-white transition-all hover:brightness-110">
        {player.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-ink-100">{value.label}</span>
        <span className="block truncate text-[11px] text-ink-500">{label}</span>
      </span>
    </div>
  )
}
