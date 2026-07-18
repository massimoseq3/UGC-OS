import { useRef } from 'react'
import { Trash2, Upload, X } from 'lucide-react'
import { useFlowStore } from '../stores/flowStore'
import { NODE_DEFS } from '../nodeDefs'
import { setNodeFile } from '../services/nodeFiles'
import type {
  AnalyzerNodeConfig,
  BrollNodeConfig,
  CharacterNodeConfig,
  FlowNode,
  ImageNodeConfig,
  ProductNodeConfig,
  ScriptNodeConfig,
  VideoNodeConfig,
  VoiceoverNodeConfig,
} from '../types'
import { useBankStore } from '../../../stores/bankStore'
import {
  estimateCredits,
  formatCredits,
  getModel,
  listModels,
  TTS_MODEL_ID,
} from '../../../utils/models'
import { WRITE_LENGTHS, WRITE_STYLE_META, type WriteLength, type WriteStyle } from '../../script-architect/types'
import { VOICE_CATEGORIES, VOICES } from '../../voice-studio/types'

const FIELD_LABEL = 'mb-1 block text-[11px] font-medium text-ink-500'
const SELECT_CLS =
  'w-full appearance-none rounded-full border border-ink/10 bg-surface-2 px-3.5 py-2 text-xs text-ink-200 outline-none transition-colors duration-150 focus:border-flows-500/50'
const TEXTAREA_CLS =
  'w-full resize-none rounded-2xl border border-ink/10 bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-ink-200 outline-none transition-colors duration-150 placeholder:text-ink-600 focus:border-flows-500/50'

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
  return <p className="text-[11px] text-ink-600">≈ {text} per run</p>
}

function ProductConfig({ node }: { node: FlowNode }) {
  const cfg = node.data.config as ProductNodeConfig
  const products = useBankStore((s) => s.products)
  const update = useFlowStore((s) => s.updateNodeConfig)
  return (
    <Field label="Product">
      <select
        className={SELECT_CLS}
        value={cfg.productId ?? ''}
        onChange={(e) => update(node.id, { productId: e.target.value || null })}
      >
        <option value="">Pick from the Bank…</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>{p.productName}</option>
        ))}
      </select>
    </Field>
  )
}

function CharacterConfig({ node }: { node: FlowNode }) {
  const cfg = node.data.config as CharacterNodeConfig
  const models = useBankStore((s) => s.models)
  const update = useFlowStore((s) => s.updateNodeConfig)
  return (
    <Field label="Character">
      <select
        className={SELECT_CLS}
        value={cfg.bankModelId ?? ''}
        onChange={(e) => update(node.id, { bankModelId: e.target.value || null })}
      >
        <option value="">Pick from the Bank…</option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    </Field>
  )
}

function AnalyzerConfig({ node }: { node: FlowNode }) {
  const cfg = node.data.config as AnalyzerNodeConfig
  const update = useFlowStore((s) => s.updateNodeConfig)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-2">
      <Field label="Ad video">
        <button
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-ink/20 px-3.5 py-2.5 text-xs text-ink-400 transition-colors duration-150 hover:border-flows-500/50 hover:text-ink-200"
        >
          <Upload className="h-3.5 w-3.5" />
          {cfg.fileName ? 'Replace video' : 'Choose a video'}
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
      </Field>
      {cfg.fileName && <p className="truncate text-[11px] text-ink-500">{cfg.fileName}</p>}
      <p className="text-[11px] leading-relaxed text-ink-600">
        The transcript feeds a connected Script node as remix material. Uploads don't survive a refresh — re-attach if you reload.
      </p>
    </div>
  )
}

function ScriptConfig({ node }: { node: FlowNode }) {
  const cfg = node.data.config as ScriptNodeConfig
  const update = useFlowStore((s) => s.updateNodeConfig)
  return (
    <div className="space-y-3">
      <Field label="Brief (used when no transcript is connected)">
        <textarea
          rows={4}
          className={TEXTAREA_CLS}
          placeholder="What should this ad sell, to whom, with what angle?"
          value={cfg.brief}
          onChange={(e) => update(node.id, { brief: e.target.value })}
        />
      </Field>
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
  )
}

function VoiceoverConfig({ node }: { node: FlowNode }) {
  const cfg = node.data.config as VoiceoverNodeConfig
  const update = useFlowStore((s) => s.updateNodeConfig)
  return (
    <div className="space-y-2">
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
    </div>
  )
}

function BrollConfig({ node }: { node: FlowNode }) {
  const cfg = node.data.config as BrollNodeConfig
  const update = useFlowStore((s) => s.updateNodeConfig)
  return (
    <div className="space-y-3">
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
      <p className="text-[11px] leading-relaxed text-ink-600">
        Generates one still per scene using your B-Roll image model. Open B-Roll for the full 5-take grid.
      </p>
    </div>
  )
}

function ImageConfig({ node }: { node: FlowNode }) {
  const cfg = node.data.config as ImageNodeConfig
  const update = useFlowStore((s) => s.updateNodeConfig)
  const models = listModels({ task: 'image', mode: 'text-to-image' })
  return (
    <div className="space-y-3">
      <Field label="Prompt">
        <textarea
          rows={4}
          className={TEXTAREA_CLS}
          placeholder="Describe the shot…"
          value={cfg.prompt}
          onChange={(e) => update(node.id, { prompt: e.target.value })}
        />
      </Field>
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
      <CostLine credits={estimateCredits(cfg.modelId, { imageCount: 1 })} />
    </div>
  )
}

function VideoConfig({ node }: { node: FlowNode }) {
  const cfg = node.data.config as VideoNodeConfig
  const update = useFlowStore((s) => s.updateNodeConfig)
  const models = listModels({ task: 'video' }).filter((m) => !m.motionControl)
  const model = getModel(cfg.modelId)
  const durations = model?.videoConstraints?.durations ?? []
  const resolutions = model?.videoConstraints?.resolutions ?? []
  return (
    <div className="space-y-3">
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
              // Snap duration/resolution to the new model's constraints.
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

const CONFIG_FORMS: Record<FlowNode['data']['kind'], React.ComponentType<{ node: FlowNode }>> = {
  product: ProductConfig,
  character: CharacterConfig,
  analyzer: AnalyzerConfig,
  script: ScriptConfig,
  voiceover: VoiceoverConfig,
  broll: BrollConfig,
  image: ImageConfig,
  video: VideoConfig,
}

export default function ConfigPanel() {
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId)
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === s.selectedNodeId))
  const setSelected = useFlowStore((s) => s.setSelected)
  const removeNode = useFlowStore((s) => s.removeNode)

  if (!selectedNodeId || !node) return null
  const def = NODE_DEFS[node.data.kind]
  const Icon = def.icon
  const Form = CONFIG_FORMS[node.data.kind]

  return (
    <div className="pointer-events-auto flex w-72 flex-col rounded-2xl border border-ink/10 bg-surface-1/95 shadow-xl shadow-black/15 backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full"
          style={{ backgroundColor: `${def.accent}26` }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: def.accent }} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium tracking-tight text-ink-100">{def.label}</p>
          <p className="truncate text-[10px] text-ink-600">{def.tagline}</p>
        </div>
        <button
          onClick={() => setSelected(null)}
          className="rounded-full p-1 text-ink-500 transition-colors duration-150 hover:bg-ink/5 hover:text-ink-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[50vh] overflow-y-auto px-4 py-3">
        <Form node={node} />
      </div>

      <div className="border-t border-ink/10 px-4 py-2.5">
        <button
          onClick={() => removeNode(node.id)}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] text-red-400 transition-colors duration-150 hover:bg-red-500/10 light:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove node
        </button>
      </div>
    </div>
  )
}
