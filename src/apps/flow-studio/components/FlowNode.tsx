import { memo, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AlertCircle, Bookmark, Check, Loader2, Plus } from 'lucide-react'
import type {
  AnalyzerNodeConfig,
  BrollNodeConfig,
  CharacterNodeConfig,
  FlowNode as FlowNodeType,
  ImageNodeConfig,
  PortValue,
  ProductNodeConfig,
  ScriptNodeConfig,
  VideoNodeConfig,
  VoiceoverNodeConfig,
} from '../types'
import { PORT_COLORS } from '../types'
import { NODE_DEFS, nextStepsFor } from '../nodeDefs'
import { useFlowStore } from '../stores/flowStore'
import { useBankStore } from '../../../stores/bankStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import { getModel } from '../../../utils/models'

// Port rows are fixed-height so handle Y positions are deterministic:
// header (44px) + rowIndex * 22 + 11.
const HEADER_H = 44
const ROW_H = 22

function handleTop(rowIndex: number): number {
  return HEADER_H + rowIndex * ROW_H + ROW_H / 2
}

function AssetThumb({ assetRef }: { assetRef: string }) {
  const url = useAssetUrl(assetRef)
  return (
    <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-ink/5">
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </div>
  )
}

function AudioPreview({ assetRef }: { assetRef: string }) {
  const url = useAssetUrl(assetRef)
  if (!url) return null
  return <audio controls src={url} className="h-8 w-full" />
}

function VideoPreview({ assetRef }: { assetRef: string }) {
  const url = useAssetUrl(assetRef)
  return (
    <div className="overflow-hidden rounded-lg bg-ink/5">
      {url && <video controls src={url} className="max-h-40 w-full" />}
    </div>
  )
}

function OutputPreview({ output }: { output: Record<string, PortValue> }) {
  const values = Object.values(output)
  return (
    <div className="space-y-1.5">
      {values.map((v, i) => {
        if (v.type === 'script') {
          return (
            <p key={i} className="line-clamp-3 whitespace-pre-line text-[11px] leading-snug text-ink-300">
              {v.text}
            </p>
          )
        }
        if (v.type === 'image') {
          return (
            <div key={i} className="flex gap-1.5">
              {v.refs.slice(0, 4).map((r) => <AssetThumb key={r} assetRef={r} />)}
              {v.refs.length > 4 && (
                <span className="self-center text-[10px] text-ink-500">+{v.refs.length - 4}</span>
              )}
            </div>
          )
        }
        if (v.type === 'audio') return <AudioPreview key={i} assetRef={v.assetRef} />
        if (v.type === 'video') return <VideoPreview key={i} assetRef={v.assetRef} />
        return null
      })}
    </div>
  )
}

// One line describing the node's current setup — what you'd want to see on
// the card without opening the panel.
function ConfigSummary({ data }: { data: FlowNodeType['data'] }) {
  const { kind, config } = data
  const products = useBankStore((s) => s.products)
  const models = useBankStore((s) => s.models)
  const scripts = useBankStore((s) => s.scripts)
  const voiceHistory = useBankStore((s) => s.voiceHistory)

  let text = ''
  let fromBank = false
  if (kind === 'product') {
    const c = config as ProductNodeConfig
    text = products.find((p) => p.id === c.productId)?.productName ?? 'Tap to pick a product'
  } else if (kind === 'character') {
    const c = config as CharacterNodeConfig
    text = models.find((m) => m.id === c.bankModelId)?.name ?? 'Tap to pick a character'
  } else if (kind === 'analyzer') {
    const c = config as AnalyzerNodeConfig
    text = c.fileName ?? 'Tap to attach an ad video'
  } else if (kind === 'script') {
    const c = config as ScriptNodeConfig
    if (c.source === 'bank') {
      fromBank = true
      text = c.bankScriptId
        ? scripts.find((s) => s.id === c.bankScriptId)?.title ?? 'Tap to pick a script'
        : 'Tap to pick a script'
    } else {
      text = c.brief.trim() ? c.brief : 'Remixes a connected transcript, or writes from a brief'
    }
  } else if (kind === 'voiceover') {
    const c = config as VoiceoverNodeConfig
    if (c.source === 'bank') {
      fromBank = true
      const item = c.historyId ? voiceHistory.find((h) => h.id === c.historyId) : undefined
      text = item ? `${item.voiceName} — ${item.scriptPreview}` : 'Tap to pick a saved voiceover'
    } else {
      text = c.voiceName
    }
  } else if (kind === 'broll') {
    const c = config as BrollNodeConfig
    if (c.source === 'bank') {
      fromBank = true
      text = c.bankBrollIds.length > 0
        ? `${c.bankBrollIds.length} still${c.bankBrollIds.length === 1 ? '' : 's'} from your Bank`
        : 'Tap to pick stills'
    } else {
      text = `Up to ${c.maxScenes} scene${c.maxScenes === 1 ? '' : 's'} · ${c.aspectRatio}`
    }
  } else if (kind === 'image') {
    const c = config as ImageNodeConfig
    if (c.source === 'bank') {
      fromBank = true
      text = c.historyId ? 'Saved image' : 'Tap to pick an image'
    } else {
      const modelName = getModel(c.modelId)?.displayName ?? c.modelId
      text = c.prompt.trim() ? c.prompt : `${modelName} — write a prompt`
    }
  } else if (kind === 'video') {
    const c = config as VideoNodeConfig
    const modelName = getModel(c.modelId)?.displayName ?? c.modelId
    text = c.prompt.trim() ? c.prompt : `${modelName} — prompt or start frame`
  }

  return (
    <p className="line-clamp-2 text-[11px] leading-snug text-ink-500">
      {fromBank && (
        <span className="mr-1 inline-flex items-center gap-0.5 align-middle text-[9px] font-medium uppercase tracking-wide text-amber-400 light:text-amber-600">
          <Bookmark className="h-2.5 w-2.5" /> Bank
        </span>
      )}
      {text}
    </p>
  )
}

function StatusChip({ status }: { status: FlowNodeType['data']['status'] }) {
  if (status === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin text-flows-400" />
  if (status === 'done') return <Check className="h-3.5 w-3.5 text-emerald-400 light:text-emerald-600" strokeWidth={2.5} />
  if (status === 'error') return <AlertCircle className="h-3.5 w-3.5 text-red-400 light:text-red-600" />
  if (status === 'skipped') return <span className="text-[9px] font-medium uppercase tracking-wide text-ink-600">skipped</span>
  return null
}

// "+ Next step" — the no-wire way to grow the flow: lists only the steps that
// can accept this node's output, adds them pre-wired and auto-placed.
function NextStepButton({ nodeId, kind }: { nodeId: string; kind: FlowNodeType['data']['kind'] }) {
  const [open, setOpen] = useState(false)
  const addNodeAfter = useFlowStore((s) => s.addNodeAfter)
  const steps = nextStepsFor(kind)
  if (steps.length === 0) return null

  return (
    <div className="nodrag nopan relative border-t border-ink/10">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="flex w-full items-center justify-center gap-1 rounded-b-2xl py-1.5 text-[10px] font-medium text-ink-500 transition-colors duration-150 hover:bg-ink/5 hover:text-ink-200"
      >
        <Plus className="h-3 w-3" />
        Next step
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-10 mt-1 w-44 -translate-x-1/2 space-y-0.5 rounded-2xl border border-ink/10 bg-surface-2 p-1.5 shadow-xl shadow-black/20">
          {steps.map((step) => {
            const stepDef = NODE_DEFS[step.kind]
            const StepIcon = stepDef.icon
            return (
              <button
                key={`${step.sourcePort}-${step.kind}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  addNodeAfter(nodeId, step.sourcePort, step.kind, step.targetPort)
                }}
                className="flex w-full items-center gap-2 rounded-full px-2 py-1.5 text-left transition-colors duration-150 hover:bg-ink/5"
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${stepDef.accent}26` }}
                >
                  <StepIcon className="h-3 w-3" style={{ color: stepDef.accent }} strokeWidth={2} />
                </span>
                <span className="text-xs text-ink-300">{stepDef.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FlowNodeCard({ id, data, selected }: NodeProps<FlowNodeType>) {
  const def = NODE_DEFS[data.kind]
  const Icon = def.icon
  const rows = [
    ...def.inputs.map((p) => ({ port: p, dir: 'in' as const })),
    ...def.outputs.map((p) => ({ port: p, dir: 'out' as const })),
  ]

  return (
    <div
      className={`w-60 rounded-2xl border bg-surface-1 shadow-lg shadow-black/10 transition-colors duration-200 ${
        selected ? 'border-flows-500/60' : 'border-ink/10'
      } ${data.status === 'running' ? 'ring-2 ring-flows-500/30' : ''}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3" style={{ height: HEADER_H }}>
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full"
          style={{ backgroundColor: `${def.accent}26` }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: def.accent }} strokeWidth={2} />
        </span>
        <span className="flex-1 truncate text-[13px] font-medium tracking-tight text-ink-100">
          {def.label}
        </span>
        <StatusChip status={data.status} />
      </div>

      {/* Port rows — fixed height, handles absolutely positioned to match */}
      {rows.map(({ port, dir }) => (
        <div
          key={`${dir}-${port.id}`}
          className={`flex items-center px-3 text-[10px] text-ink-500 ${dir === 'out' ? 'justify-end' : ''}`}
          style={{ height: ROW_H }}
        >
          {port.label}
          {port.required && dir === 'in' && <span className="ml-0.5 text-red-400 light:text-red-600">*</span>}
        </div>
      ))}
      {def.inputs.map((p, i) => (
        <Handle
          key={`h-in-${p.id}`}
          id={p.id}
          type="target"
          position={Position.Left}
          style={{
            top: handleTop(i),
            width: 10,
            height: 10,
            border: '2px solid var(--color-surface-1)',
            backgroundColor: PORT_COLORS[p.type],
          }}
        />
      ))}
      {def.outputs.map((p, i) => (
        <Handle
          key={`h-out-${p.id}`}
          id={p.id}
          type="source"
          position={Position.Right}
          style={{
            top: handleTop(def.inputs.length + i),
            width: 10,
            height: 10,
            border: '2px solid var(--color-surface-1)',
            backgroundColor: PORT_COLORS[p.type],
          }}
        />
      ))}

      {/* Body */}
      <div className="space-y-1.5 px-3 pb-3 pt-1">
        {data.status === 'running' && data.note ? (
          <p className="text-[11px] text-flows-300">{data.note}</p>
        ) : data.status === 'error' && data.error ? (
          <p className="text-[11px] leading-snug text-red-300 light:text-red-700">{data.error}</p>
        ) : data.output ? (
          <OutputPreview output={data.output} />
        ) : (
          <ConfigSummary data={data} />
        )}
      </div>

      <NextStepButton nodeId={id} kind={data.kind} />
    </div>
  )
}

export default memo(FlowNodeCard)
