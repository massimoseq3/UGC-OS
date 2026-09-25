// A block, open in its app's own window over the canvas. The window is the
// app a member already knows — its input column on the left, what it made on
// the right — working on this block's settings instead of the app's own
// draft, with what only a flow has around it: where the result comes from
// (Generate, From Bank, From History), what's wired in, Pause for Review,
// Run Field, and a Run that runs this block alone.
//
// Tier `z-[60]`, like B-Roll's card modal and the voice pickers: every
// Dropdown menu portals at that tier, so a window above it would paint over
// its own menus. Sharing it lets DOM order decide; the bank and model pickers
// it opens sit above, at z-70/80.

import { createPortal } from 'react-dom'
import { ArrowUpRight, FormInput, Hand, Power, X } from 'lucide-react'
import type { BlockSource, FlowBlock } from '../../types'
import { KINDS, sourceOf, titleOf } from '../../engine/catalog'
import { useFlowStore } from '../../store/flowStore'
import { useAppStore } from '../../../../stores/appStore'
import { getAppConfig } from '../../../../utils/constants'
import { GlassTile } from '../../../../components/AppGlassTile'
import SegmentedToggle from '../../../../components/SegmentedToggle'
import useCloseOnEscape from '../../../../hooks/useCloseOnEscape'
import { useCloseOnAppSwitch } from '../../../../hooks/useCloseOnAppSwitch'
import { useBackdropClose } from '../../../../hooks/useBackdropClose'
import { blockAccent, blockIcon, isFieldable } from '../blockMeta'
import type { WindowProps } from './runs'
import VoiceWindow from './VoiceWindow'
import CharactersWindow from './CharactersWindow'
import ScriptsWindow from './ScriptsWindow'
import BrollWindow from './BrollWindow'
import PlaygroundWindow from './PlaygroundWindow'
import ScenesWindow from './ScenesWindow'
import { AnalyzerWindow, EditWindow, OutliersWindow } from './SmallWindows'
import ReuseWindow from './ReuseWindow'

const SOURCE_LABEL: Record<BlockSource, string> = { generate: 'Generate', bank: 'From Bank', history: 'From History' }

const REVIEW_HINT: Partial<Record<FlowBlock['kind'], string>> = {
  scripts: 'When it finishes, tick the hooks to keep. Only those run on.',
  characters: 'When it finishes, pick the faces to keep.',
  voice: 'When it finishes, keep the takes you like.',
  broll: 'After the stills, pick which get animated, before any clip is paid for.',
  playground: 'When it finishes, keep the ones you like.',
  scenes: 'When it finishes, pick the best take of each scene. Only those go on to the edit.',
}

export default function BlockWindow(props: WindowProps & { onClose: () => void }) {
  const { block, onClose } = props
  const backdrop = useBackdropClose(onClose)
  useCloseOnEscape(true, onClose)
  useCloseOnAppSwitch(true, onClose)
  const portalTarget = typeof document !== 'undefined' ? document.body : null
  if (!portalTarget) return null

  return createPortal(
    <div className="modal-fade fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 lg:p-6" {...backdrop}>
      <div
        role="dialog"
        aria-label={titleOf(block)}
        className="modal-pop flex h-[min(90vh,940px)] w-full max-w-[1380px] flex-col overflow-hidden rounded-3xl border border-ink/10 bg-surface-0 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <WindowHeader block={block} onClose={onClose} />
        <div className="flex min-h-0 flex-1">
          <WindowBody {...props} />
        </div>
      </div>
    </div>,
    portalTarget,
  )
}

function WindowBody(props: WindowProps) {
  const { block } = props
  if (KINDS[block.kind]?.runnable && sourceOf(block) !== 'generate') return <ReuseWindow {...props} />
  switch (block.kind) {
    case 'voice': return <VoiceWindow {...props} />
    case 'characters': return <CharactersWindow {...props} />
    case 'scripts': return <ScriptsWindow {...props} />
    case 'broll': return <BrollWindow {...props} />
    case 'playground': return <PlaygroundWindow {...props} />
    case 'scenes': return <ScenesWindow {...props} />
    case 'analyzer': return <AnalyzerWindow {...props} />
    case 'outliers': return <OutliersWindow {...props} />
    case 'edit': return <EditWindow {...props} />
    default: return null
  }
}

function WindowHeader({ block, onClose }: { block: FlowBlock; onClose: () => void }) {
  const patchBlock = useFlowStore((s) => s.patchBlock)
  const toggleOff = useFlowStore((s) => s.toggleOff)
  const openApp = useAppStore((s) => s.openApp)
  const spec = KINDS[block.kind]
  const source = sourceOf(block) ?? 'generate'
  const app = spec.appId ? getAppConfig(spec.appId) : undefined
  const reviewable = spec.reviewable && source === 'generate'
  const fieldable = isFieldable(block)

  return (
    <div className="grid h-[57px] shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-ink/5 px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <GlassTile icon={blockIcon(block)} accent={blockAccent(block)} size={28} />
        <input
          value={block.label ?? ''}
          placeholder={titleOf({ ...block, label: undefined })}
          onChange={(e) => patchBlock(block.id, { label: e.target.value || undefined }, { coalesce: `label:${block.id}` })}
          className="min-w-0 max-w-[240px] flex-1 rounded-full bg-transparent px-2 py-1 text-sm font-semibold tracking-tight text-ink-100 outline-none placeholder:text-ink-100 hover:bg-ink/[0.04] focus:bg-ink/[0.06]"
          aria-label="Block Name"
        />
        <span className="hidden shrink-0 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[10.5px] font-medium text-ink-400 lg:inline">In This Flow</span>
      </div>

      <div className="flex justify-center">
        {spec.sources.length > 1 && (
          <SegmentedToggle
            options={spec.sources.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))}
            value={source}
            onChange={(next) => patchBlock(block.id, { source: next, pick: undefined })}
            fitContent
            dense
            accent="flow"
          />
        )}
      </div>

      <div className="flex min-w-0 items-center justify-end gap-1.5">
        {reviewable && (
          <HeaderToggle
            icon={Hand}
            label="Pause for Review"
            on={!!block.review}
            tone="amber"
            title={`Pause for Review · ${REVIEW_HINT[block.kind] ?? 'When it finishes, keep the results worth spending more on.'}`}
            onClick={() => patchBlock(block.id, { review: !block.review || undefined })}
          />
        )}
        {fieldable && (
          <HeaderToggle
            icon={FormInput}
            label="Run Field"
            on={!!block.field}
            tone="flow"
            title="Show as a field in Run: whoever runs this flow picks their own. Yours stays as the example."
            onClick={() => patchBlock(block.id, { field: !block.field || undefined })}
          />
        )}
        <HeaderToggle
          icon={Power}
          label={block.off ? 'Turned Off' : 'Turn Off'}
          on={!!block.off}
          tone="red"
          title={block.off ? 'Turn it back on' : 'Skip it on the next run. Nothing is deleted, and nothing after it runs.'}
          onClick={() => toggleOff([block.id])}
        />
        {app && (
          <button
            type="button"
            onClick={() => {
              onClose()
              openApp(app.id)
            }}
            title={`Open ${app.name} · what this block made is in its history`}
            className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-ink/10 px-3 text-xs font-medium text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100"
          >
            <span className="hidden xl:inline">Open {app.name}</span>
            <span className="xl:hidden">{app.name}</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/5 hover:text-ink-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

const TONES = {
  amber: 'border-amber-500/35 bg-amber-500/12 text-amber-300 light:text-amber-700',
  flow: 'border-flow-500/35 bg-flow-500/12 text-flow-300',
  red: 'border-red-500/35 bg-red-500/10 text-red-300 light:text-red-700',
}

function HeaderToggle({ icon: Icon, label, on, tone, title, onClick }: {
  icon: React.ElementType
  label: string
  on: boolean
  tone: keyof typeof TONES
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${on ? TONES[tone] : 'border-ink/10 text-ink-400 hover:border-ink/20 hover:text-ink-100'}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden xl:inline">{label}</span>
    </button>
  )
}
