import { useEffect, useRef } from 'react'
import { Bookmark, Check, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { useFlowStore } from '../stores/flowStore'
import { NODE_DEFS } from '../nodeDefs'
import { setNodeFile } from '../services/nodeFiles'
import type {
  AnalyzerNodeConfig,
  BrollNodeConfig,
  CharacterNodeConfig,
  FlowNode,
  ImageNodeConfig,
  NodeSource,
  ProductNodeConfig,
  ScriptNodeConfig,
  VideoNodeConfig,
  VoiceoverNodeConfig,
} from '../types'
import { useBankStore } from '../../../stores/bankStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import {
  estimateCredits,
  formatCredits,
  getModel,
  listModels,
  TTS_MODEL_ID,
} from '../../../utils/models'
import { WRITE_LENGTHS, WRITE_STYLE_META, type WriteLength, type WriteStyle } from '../../script-architect/types'
import { VOICE_CATEGORIES, VOICES } from '../../voice-studio/types'

const FIELD_LABEL = 'mb-1.5 block text-xs font-medium text-ink-500'
const SELECT_CLS =
  'w-full appearance-none rounded-full border border-ink/10 bg-surface-2 px-4 py-2.5 text-sm text-ink-200 outline-none transition-colors duration-150 focus:border-flows-500/50'
const TEXTAREA_CLS =
  'w-full resize-none rounded-2xl border border-ink/10 bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink-200 outline-none transition-colors duration-150 placeholder:text-ink-600 focus:border-flows-500/50'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className={FIELD_LABEL}>{label}</span>
      {children}
    </div>
  )
}

function CostLine({ credits }: { credits: number | null }) {
  const text = formatCredits(credits)
  if (!text) return null
  return <p className="text-xs text-ink-600">≈ {text} per run</p>
}

// Bank ↔ Generate switch. Tinted accent fill on the active side (never a
// solid block — house toggle style).
function SourceToggle({
  value,
  accent,
  bankLabel,
  onChange,
}: {
  value: NodeSource
  accent: string
  bankLabel: string
  onChange: (source: NodeSource) => void
}) {
  const options: Array<{ id: NodeSource; label: string; icon: typeof Bookmark }> = [
    { id: 'bank', label: bankLabel, icon: Bookmark },
    { id: 'generate', label: 'Generate new', icon: Sparkles },
  ]
  return (
    <div className="flex gap-1.5 rounded-full border border-ink/10 bg-surface-2 p-1">
      {options.map((opt) => {
        const active = value === opt.id
        const OptIcon = opt.icon
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors duration-150 ${
              active ? '' : 'text-ink-500 hover:bg-ink/5 hover:text-ink-300'
            }`}
            style={active ? { backgroundColor: `${accent}20`, color: accent } : undefined}
          >
            <OptIcon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Visual pickers ─────────────────────────────────────────────────

function Thumb({ imageRef }: { imageRef: string | undefined }) {
  const url = useAssetUrl(imageRef)
  return url
    ? <img src={url} alt="" className="h-full w-full object-cover" />
    : <span className="flex h-full w-full items-center justify-center bg-ink/5" />
}

interface ThumbItem {
  id: string
  imageRef?: string
  label: string
  starred?: boolean
}

// Thumbnail grid over bank items — the friendly replacement for a <select>.
function ThumbGrid({
  items,
  selectedIds,
  multi,
  emptyText,
  onPick,
}: {
  items: ThumbItem[]
  selectedIds: string[]
  multi?: boolean
  emptyText: string
  onPick: (id: string) => void
}) {
  if (items.length === 0) {
    return <p className="rounded-2xl border border-dashed border-ink/15 px-4 py-6 text-center text-xs leading-relaxed text-ink-600">{emptyText}</p>
  }
  const sorted = [...items].sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0))
  return (
    <div className="grid grid-cols-3 gap-2">
      {sorted.map((item) => {
        const active = selectedIds.includes(item.id)
        return (
          <button
            key={item.id}
            onClick={() => onPick(item.id)}
            className={`group relative overflow-hidden rounded-xl border text-left transition-all duration-150 ${
              active ? 'border-flows-500 ring-2 ring-flows-500/30' : 'border-ink/10 hover:border-ink/25'
            }`}
          >
            <div className="aspect-[3/4] w-full overflow-hidden">
              <Thumb imageRef={item.imageRef} />
            </div>
            {active && (
              <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-flows-500">
                <Check className="h-3 w-3 text-white" strokeWidth={3} />
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-5 text-[11px] font-medium leading-tight text-white">
              {item.label}
            </span>
          </button>
        )
      })}
      {multi && <span className="sr-only">multi-select</span>}
    </div>
  )
}

interface RowItem {
  id: string
  title: string
  preview: string
  meta?: string
}

// Text rows (scripts, saved voiceovers) with a preview line.
function RowList({
  items,
  selectedId,
  emptyText,
  onPick,
}: {
  items: RowItem[]
  selectedId: string | null
  emptyText: string
  onPick: (id: string) => void
}) {
  if (items.length === 0) {
    return <p className="rounded-2xl border border-dashed border-ink/15 px-4 py-6 text-center text-xs leading-relaxed text-ink-600">{emptyText}</p>
  }
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const active = item.id === selectedId
        return (
          <button
            key={item.id}
            onClick={() => onPick(item.id)}
            className={`w-full rounded-2xl border px-4 py-3 text-left transition-all duration-150 ${
              active ? 'border-flows-500 bg-flows-500/5 ring-2 ring-flows-500/20' : 'border-ink/10 hover:border-ink/25'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-ink-200">{item.title}</span>
              {item.meta && <span className="shrink-0 text-[10px] text-ink-600">{item.meta}</span>}
            </span>
            <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-ink-500">{item.preview}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Per-kind sheet bodies ──────────────────────────────────────────

function ProductBody({ node }: { node: FlowNode }) {
  const cfg = node.data.config as ProductNodeConfig
  const products = useBankStore((s) => s.products)
  const update = useFlowStore((s) => s.updateNodeConfig)
  return (
    <ThumbGrid
      items={products.map((p) => ({ id: p.id, imageRef: p.productImage, label: p.productName, starred: p.starred }))}
      selectedIds={cfg.productId ? [cfg.productId] : []}
      emptyText="Your Product Bank is empty. Add a product in the Bank app first — drop a photo and it fills itself in."
      onPick={(id) => update(node.id, { productId: id === cfg.productId ? null : id })}
    />
  )
}

function CharacterBody({ node }: { node: FlowNode }) {
  const cfg = node.data.config as CharacterNodeConfig
  const models = useBankStore((s) => s.models)
  const update = useFlowStore((s) => s.updateNodeConfig)
  return (
    <ThumbGrid
      items={models.map((m) => ({ id: m.id, imageRef: m.characterImage, label: m.name, starred: m.starred }))}
      selectedIds={cfg.bankModelId ? [cfg.bankModelId] : []}
      emptyText="No characters yet. Create one in the Characters app — it lands in your Bank automatically when you save it."
      onPick={(id) => update(node.id, { bankModelId: id === cfg.bankModelId ? null : id })}
    />
  )
}

function AnalyzerBody({ node }: { node: FlowNode }) {
  const cfg = node.data.config as AnalyzerNodeConfig
  const update = useFlowStore((s) => s.updateNodeConfig)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-3">
      <button
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-ink/20 px-4 py-8 text-sm text-ink-400 transition-colors duration-150 hover:border-flows-500/50 hover:text-ink-200"
      >
        <Upload className="h-4 w-4" />
        {cfg.fileName ? 'Replace the ad video' : 'Choose an ad video'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          setNodeFile(node.id, file)
          update(node.id, { fileName: file.name })
          e.target.value = ''
        }}
      />
      {cfg.fileName && <p className="truncate text-center text-xs text-ink-500">{cfg.fileName}</p>}
      <p className="text-xs leading-relaxed text-ink-600">
        The ad gets analyzed and its transcript flows into the next step as remix material. Videos don't survive a page refresh — re-attach if you reload.
      </p>
    </div>
  )
}

function ScriptBody({ node, accent }: { node: FlowNode; accent: string }) {
  const cfg = node.data.config as ScriptNodeConfig
  const scripts = useBankStore((s) => s.scripts)
  const update = useFlowStore((s) => s.updateNodeConfig)
  return (
    <div className="space-y-4">
      <SourceToggle
        value={cfg.source}
        accent={accent}
        bankLabel="Use a saved script"
        onChange={(source) => update(node.id, { source })}
      />
      {cfg.source === 'bank' ? (
        <RowList
          items={scripts
            .filter((s) => s.kind !== 'style')
            .map((s) => ({ id: s.id, title: s.title, preview: s.scriptText }))}
          selectedId={cfg.bankScriptId}
          emptyText="No saved scripts yet. Generate one below, or write and save scripts in the Scripts app."
          onPick={(id) => update(node.id, { bankScriptId: id === cfg.bankScriptId ? null : id })}
        />
      ) : (
        <>
          <Field label="Brief (used when no transcript is connected)">
            <textarea
              rows={4}
              className={TEXTAREA_CLS}
              placeholder="What should this ad sell, to whom, with what angle?"
              value={cfg.brief}
              onChange={(e) => update(node.id, { brief: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Style">
              <select
                className={SELECT_CLS}
                value={cfg.style}
                onChange={(e) => update(node.id, { style: e.target.value as WriteStyle })}
              >
                {(Object.keys(WRITE_STYLE_META) as WriteStyle[]).map((s) => (
                  <option key={s} value={s}>{WRITE_STYLE_META[s].label}</option>
                ))}
              </select>
            </Field>
            <Field label="Length">
              <select
                className={SELECT_CLS}
                value={cfg.length}
                onChange={(e) => update(node.id, { length: Number(e.target.value) as WriteLength })}
              >
                {WRITE_LENGTHS.map((l) => (
                  <option key={l} value={l}>{l} seconds</option>
                ))}
              </select>
            </Field>
          </div>
        </>
      )}
    </div>
  )
}

function VoiceoverBody({ node, accent }: { node: FlowNode; accent: string }) {
  const cfg = node.data.config as VoiceoverNodeConfig
  const voiceHistory = useBankStore((s) => s.voiceHistory)
  const update = useFlowStore((s) => s.updateNodeConfig)
  return (
    <div className="space-y-4">
      <SourceToggle
        value={cfg.source}
        accent={accent}
        bankLabel="Use a saved voiceover"
        onChange={(source) => update(node.id, { source })}
      />
      {cfg.source === 'bank' ? (
        <RowList
          items={voiceHistory.map((h) => ({
            id: h.id,
            title: h.voiceName,
            preview: h.scriptPreview,
            meta: h.duration ? `${h.duration}s` : undefined,
          }))}
          selectedId={cfg.historyId}
          emptyText="No voiceovers yet. Generate one below, or record some in the Voiceovers app first."
          onPick={(id) => update(node.id, { historyId: id === cfg.historyId ? null : id })}
        />
      ) : (
        <>
          <Field label="Voice">
            <select
              className={SELECT_CLS}
              value={cfg.voiceId}
              onChange={(e) => {
                const voice = VOICES.find((v) => v.id === e.target.value)
                if (voice) update(node.id, { voiceId: voice.id, voiceName: voice.name })
              }}
            >
              {VOICE_CATEGORIES.map((cat) => (
                <optgroup key={cat} label={cat}>
                  {VOICES.filter((v) => v.category === cat).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} — {v.description}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <CostLine credits={estimateCredits(TTS_MODEL_ID, { charCount: 400 })} />
        </>
      )}
    </div>
  )
}

function BrollBody({ node, accent }: { node: FlowNode; accent: string }) {
  const cfg = node.data.config as BrollNodeConfig
  const brolls = useBankStore((s) => s.brolls)
  const update = useFlowStore((s) => s.updateNodeConfig)
  return (
    <div className="space-y-4">
      <SourceToggle
        value={cfg.source}
        accent={accent}
        bankLabel="Use saved stills"
        onChange={(source) => update(node.id, { source })}
      />
      {cfg.source === 'bank' ? (
        <ThumbGrid
          items={brolls
            .filter((b) => b.imageUrl)
            .map((b) => ({ id: b.id, imageRef: b.imageUrl, label: b.prompt.slice(0, 40), starred: b.starred }))}
          selectedIds={cfg.bankBrollIds}
          multi
          emptyText="No stills in your B-Rolls bank yet. Generate scenes below, or save stills from the B-Roll app."
          onPick={(id) =>
            update(node.id, {
              bankBrollIds: cfg.bankBrollIds.includes(id)
                ? cfg.bankBrollIds.filter((x) => x !== id)
                : [...cfg.bankBrollIds, id],
            })
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max scenes">
              <select
                className={SELECT_CLS}
                value={cfg.maxScenes}
                onChange={(e) => update(node.id, { maxScenes: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </Field>
            <Field label="Aspect ratio">
              <select
                className={SELECT_CLS}
                value={cfg.aspectRatio}
                onChange={(e) => update(node.id, { aspectRatio: e.target.value as BrollNodeConfig['aspectRatio'] })}
              >
                <option value="9:16">9:16 vertical</option>
                <option value="16:9">16:9 horizontal</option>
              </select>
            </Field>
          </div>
          <p className="text-xs leading-relaxed text-ink-600">
            Breaks the connected script into scenes and shoots one still per scene with your B-Roll image model. Open the B-Roll app for the full 5-take grid.
          </p>
        </>
      )}
    </div>
  )
}

function ImageBody({ node, accent }: { node: FlowNode; accent: string }) {
  const cfg = node.data.config as ImageNodeConfig
  const imageHistory = useBankStore((s) => s.imageHistory)
  const update = useFlowStore((s) => s.updateNodeConfig)
  const models = listModels({ task: 'image', mode: 'text-to-image' })
  return (
    <div className="space-y-4">
      <SourceToggle
        value={cfg.source}
        accent={accent}
        bankLabel="Use a saved image"
        onChange={(source) => update(node.id, { source })}
      />
      {cfg.source === 'bank' ? (
        <ThumbGrid
          items={imageHistory.map((i) => ({ id: i.id, imageRef: i.imageUrl, label: i.prompt.slice(0, 40) }))}
          selectedIds={cfg.historyId ? [cfg.historyId] : []}
          emptyText="No images in your history yet. Generate one below, or in the Playground."
          onPick={(id) => update(node.id, { historyId: id === cfg.historyId ? null : id })}
        />
      ) : (
        <>
          <Field label="Prompt">
            <textarea
              rows={4}
              className={TEXTAREA_CLS}
              placeholder="Describe the shot…"
              value={cfg.prompt}
              onChange={(e) => update(node.id, { prompt: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Model">
              <select
                className={SELECT_CLS}
                value={cfg.modelId}
                onChange={(e) => update(node.id, { modelId: e.target.value })}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.displayName}</option>
                ))}
              </select>
            </Field>
            <Field label="Aspect ratio">
              <select
                className={SELECT_CLS}
                value={cfg.aspectRatio}
                onChange={(e) => update(node.id, { aspectRatio: e.target.value as ImageNodeConfig['aspectRatio'] })}
              >
                {['9:16', '16:9', '1:1', '4:3', '3:4'].map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </Field>
          </div>
          <CostLine credits={estimateCredits(cfg.modelId, { imageCount: 1 })} />
        </>
      )}
    </div>
  )
}

function VideoBody({ node }: { node: FlowNode }) {
  const cfg = node.data.config as VideoNodeConfig
  const update = useFlowStore((s) => s.updateNodeConfig)
  const models = listModels({ task: 'video' }).filter((m) => !m.motionControl)
  const model = getModel(cfg.modelId)
  const durations = model?.videoConstraints?.durations ?? []
  const resolutions = model?.videoConstraints?.resolutions ?? []
  return (
    <div className="space-y-4">
      <Field label="Prompt">
        <textarea
          rows={4}
          className={TEXTAREA_CLS}
          placeholder="Describe the motion — or leave blank to animate the start frame"
          value={cfg.prompt}
          onChange={(e) => update(node.id, { prompt: e.target.value })}
        />
      </Field>
      <Field label="Model">
        <select
          className={SELECT_CLS}
          value={cfg.modelId}
          onChange={(e) => {
            const next = getModel(e.target.value)
            const vc = next?.videoConstraints
            update(node.id, {
              modelId: e.target.value,
              durationSeconds: vc?.durations?.includes(cfg.durationSeconds)
                ? cfg.durationSeconds
                : vc?.durations?.[0] ?? cfg.durationSeconds,
              resolution: vc?.resolutions?.includes(cfg.resolution)
                ? cfg.resolution
                : vc?.default ?? vc?.resolutions?.[0] ?? cfg.resolution,
            })
          }}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.displayName}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {durations.length > 0 && (
          <Field label="Duration">
            <select
              className={SELECT_CLS}
              value={cfg.durationSeconds}
              onChange={(e) => update(node.id, { durationSeconds: Number(e.target.value) })}
            >
              {durations.map((d) => (
                <option key={d} value={d}>{d} seconds</option>
              ))}
            </select>
          </Field>
        )}
        {resolutions.length > 0 && (
          <Field label="Resolution">
            <select
              className={SELECT_CLS}
              value={cfg.resolution}
              onChange={(e) => update(node.id, { resolution: e.target.value })}
            >
              {resolutions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field label="Aspect ratio">
        <select
          className={SELECT_CLS}
          value={cfg.aspectRatio}
          onChange={(e) => update(node.id, { aspectRatio: e.target.value as VideoNodeConfig['aspectRatio'] })}
        >
          <option value="9:16">9:16 vertical</option>
          <option value="16:9">16:9 horizontal</option>
        </select>
      </Field>
      <CostLine
        credits={estimateCredits(cfg.modelId, {
          durationSeconds: cfg.durationSeconds,
          resolution: cfg.resolution,
          audio: true,
        })}
      />
    </div>
  )
}

const BODIES: Record<FlowNode['data']['kind'], React.ComponentType<{ node: FlowNode; accent: string }>> = {
  product: ProductBody,
  character: CharacterBody,
  analyzer: AnalyzerBody,
  script: ScriptBody,
  voiceover: VoiceoverBody,
  broll: BrollBody,
  image: ImageBody,
  video: VideoBody,
}

// Centered edit sheet, styled in the node's app accent — opens on card click.
// Rendered inside the app frame (not body-portaled), so it never leaks over
// another app after a dock switch.
export default function NodeSheet() {
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === s.sheetNodeId))
  const setSheetNode = useFlowStore((s) => s.setSheetNode)
  const removeNode = useFlowStore((s) => s.removeNode)

  useEffect(() => {
    if (!node) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetNode(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [node, setSheetNode])

  if (!node) return null
  const def = NODE_DEFS[node.data.kind]
  const Icon = def.icon
  const Body = BODIES[node.data.kind]

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => setSheetNode(null)}
    >
      <div
        className="flex max-h-[88%] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-ink/10 bg-surface-1 shadow-2xl shadow-black/30"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-ink/10 px-5 py-4">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: `${def.accent}26` }}
          >
            <Icon className="h-4.5 w-4.5" style={{ color: def.accent }} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold tracking-tight text-ink-100">{def.label}</p>
            <p className="truncate text-xs text-ink-500">{def.tagline}</p>
          </div>
          <button
            onClick={() => setSheetNode(null)}
            className="rounded-full p-1.5 text-ink-500 transition-colors duration-150 hover:bg-ink/5 hover:text-ink-200"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <Body node={node} accent={def.accent} />
        </div>

        <div className="flex items-center justify-between border-t border-ink/10 px-5 py-3">
          <button
            onClick={() => removeNode(node.id)}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs text-red-400 transition-colors duration-150 hover:bg-red-500/10 light:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove step
          </button>
          <button
            onClick={() => setSheetNode(null)}
            className="rounded-full bg-ink px-5 py-2 text-xs font-medium text-paper transition-opacity duration-150 hover:opacity-85"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
