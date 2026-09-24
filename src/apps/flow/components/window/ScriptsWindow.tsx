// Scripts, as a block. The left column is the Scripts app's own panel — Write
// New or Remix, the format, the style or hook family, the product, the brief,
// length and count, who writes — working on this block; a product, brief or
// winning ad wired in stands in the panel where that field would be. The
// right is the takes it wrote, on Scripts' own output cards, one run at a
// time.

import { useState } from 'react'
import { PenLine } from 'lucide-react'
import type { Product, ScriptHistoryItem } from '../../../../stores/types'
import type { FlowBlock } from '../../types'
import { wiresInto } from '../../engine/graph'
import { useFlowStore } from '../../store/flowStore'
import { useBankStore } from '../../../../stores/bankStore'
import InputPanel from '../../../script-architect/components/InputPanel'
import OutputPanel from '../../../script-architect/components/OutputPanel'
import {
  DEFAULT_HOOK_COUNT,
  DEFAULT_VARIATION_COUNT,
  HOOK_CATEGORY_META,
  WRITE_STYLE_META,
  detectSceneBlueprint,
  isHookCategoryChoice,
  isHookCount,
  isRemixLength,
  isVariationCount,
  isWriteFormat,
  isWriteLength,
  isWriteStyle,
  type RemixAngle,
  type ScriptMode,
} from '../../../script-architect/types'
import GridCanvas from '../../../../components/GridCanvas'
import { InputsBand, NothingYet, RunChip, WiredCard } from './parts'
import { arrivingLabels, blockRuns, blockTitle, type BlockRun, type WindowProps } from './runs'

export default function ScriptsWindow({ doc, block, plan, run, onRun, onReview }: WindowProps) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const s = block.settings
  const set = (patch: Record<string, unknown>, coalesce?: string) => patchSettings(block.id, patch, coalesce ? { coalesce: `${coalesce}:${block.id}` } : undefined)
  const productId = typeof s.productId === 'string' ? s.productId : null
  const product = useBankStore((st) => (productId ? st.products.find((p) => p.id === productId) ?? null : null))
  const bp = plan?.blocks[block.id]
  const runs = blockRuns(block, bp, run)
  const mode = s.mode === 'remix' ? 'remix' : 'write'
  const source = String(s.source ?? '')
  const writeFormat = isWriteFormat(s.writeFormat) ? s.writeFormat : 'hooks'
  const hookCount = isHookCount(s.hookCount) ? s.hookCount : DEFAULT_HOOK_COUNT
  const variationCount = isVariationCount(s.variationCount) ? s.variationCount : DEFAULT_VARIATION_COUNT

  // A wired field reads what's arriving on it, run by run.
  const wiredCard = (port: 'product' | 'brief' | 'source', hint: string) => {
    const wires = wiresInto(doc, block.id, port)
    if (!wires.length) return undefined
    const arriving = [...new Set(runs.flatMap((r) => arrivingLabels(r.inputs[port], blockTitle(doc, wires[0].from))))]
    return (
      <WiredCard doc={doc} block={block} port={port} hint={hint}>
        {arriving.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {arriving.slice(0, 6).map((a) => (
              <span key={a} className="max-w-full truncate rounded-full bg-ink/[0.06] px-2.5 py-1 text-[11px] text-ink-300">{a}</span>
            ))}
            {arriving.length > 6 && <span className="px-1 py-1 text-[11px] text-ink-500">+{arriving.length - 6} more</span>}
          </div>
        )}
      </WiredCard>
    )
  }

  const baseLabel = mode === 'write'
    ? (writeFormat === 'scenes' ? `Generate ${variationCount} Scene Drafts` : writeFormat === 'hooks' ? `Generate ${hookCount} Hooks` : `Generate ${variationCount} Scripts`)
    : `Generate ${variationCount} Script Variations`
  const runCount = bp?.instances.length ?? 0

  return (
    <>
      <div className="flex w-[440px] shrink-0 flex-col border-r border-ink/5">
        <InputPanel
          mode={mode}
          onModeChange={(v) => set({ mode: v })}
          onClearInputs={() => set({ brief: '', source: '', additionalContext: '', productId: undefined })}
          source={source}
          onSourceChange={(v) => set({ source: v }, 'source')}
          isBlueprint={detectSceneBlueprint(source)}
          forceTranscript={!!s.forceTranscript}
          onForceTranscriptChange={(v) => set({ forceTranscript: v || undefined })}
          brief={String(s.brief ?? '')}
          onBriefChange={(v) => set({ brief: v }, 'brief')}
          writeStyle={isWriteStyle(s.writeStyle) ? s.writeStyle : 'pas'}
          onWriteStyleChange={(v) => set({ writeStyle: v })}
          writeFormat={writeFormat}
          onWriteFormatChange={(v) => set({ writeFormat: v })}
          writeLength={isWriteLength(s.writeLength) ? s.writeLength : 30}
          onWriteLengthChange={(v) => set({ writeLength: v })}
          remixLength={isRemixLength(s.remixLength) ? s.remixLength : 'default'}
          onRemixLengthChange={(v) => set({ remixLength: v })}
          variationCount={variationCount}
          onVariationCountChange={(v) => set({ variationCount: v })}
          hookCategory={isHookCategoryChoice(s.hookCategory) ? s.hookCategory : 'auto'}
          onHookCategoryChange={(v) => set({ hookCategory: v })}
          hookCount={hookCount}
          onHookCountChange={(v) => set({ hookCount: v })}
          selectedProduct={product as Product | null}
          onProductSelect={(p) => set({ productId: p?.id })}
          additionalContext={String(s.additionalContext ?? '')}
          onAdditionalContextChange={(v) => set({ additionalContext: v }, 'context')}
          onGenerate={() => onRun({ only: block.id })}
          flow={{
            wired: {
              product: wiredCard('product', 'Each product that comes in gets its own run of this block.'),
              brief: wiredCard('brief', 'The brief comes in on its wire. A List wired here writes once per item.'),
              source: wiredCard('source', "The winning ad's transcript comes in on its wire, from the Ad Analyzer or any text."),
            },
            actionLabel: runCount > 1 ? `${baseLabel} × ${runCount}` : undefined,
          }}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <InputsBand doc={doc} block={block} plan={plan} run={run} onReview={onReview} />
        <Output block={block} runs={runs} startedAt={run?.blocks[block.id]?.startedAt ?? 0} />
      </div>
    </>
  )
}

// The takes of one run at a time, on Scripts' own cards.
function Output({ block, runs, startedAt }: { block: FlowBlock; runs: BlockRun[]; startedAt: number }) {
  const [picked, setPicked] = useState<string | null>(null)
  const history = useBankStore((st) => st.scriptHistory)
  const shown = runs.find((r) => r.key === picked) ?? runs.find((r) => r.result) ?? runs[0]
  const rowId = shown?.result?.rows?.find((r) => r.bank === 'scriptHistory')?.id
  const row: ScriptHistoryItem | undefined = rowId ? history.find((h) => h.id === rowId) : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {runs.length > 1 && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-ink/5 px-5 py-2.5 [scrollbar-width:none]">
          {runs.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setPicked(r.key)}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-colors ${r.key === shown?.key ? 'border-scripts-500/40 bg-scripts-500/10 text-ink-100' : 'border-ink/10 text-ink-400 hover:border-ink/20 hover:text-ink-200'}`}
            >
              <span className="max-w-[180px] truncate">{r.label}</span>
              <RunChip status={r.status} note={r.note} />
            </button>
          ))}
        </div>
      )}
      {row ? (
        <OutputPanel
          variations={row.variations}
          outputAngles={(row.remixAngles as RemixAngle[] | undefined) ?? null}
          mode={row.mode as ScriptMode}
          writeFormat={isWriteFormat(row.writeFormat) ? row.writeFormat : 'script'}
          writeStyleLabel={row.writeStyle && row.writeStyle in WRITE_STYLE_META ? WRITE_STYLE_META[row.writeStyle as keyof typeof WRITE_STYLE_META].label : undefined}
          hookCategoryLabel={isHookCategoryChoice(row.hookCategory) ? HOOK_CATEGORY_META[row.hookCategory].label : undefined}
          hookCount={row.hookCount}
          linkedProductId={row.linkedProductId ?? null}
          runId={row.id}
          voiceProfile={row.voiceProfile}
        />
      ) : shown?.status === 'running' || shown?.status === 'queued' ? (
        // Scripts' own writing face, described by this block's settings.
        <OutputPanel
          variations={[]}
          mode={writingMode(block)}
          writeFormat={isWriteFormat(block.settings.writeFormat) ? block.settings.writeFormat : 'hooks'}
          linkedProductId={null}
          pendingRun={{
            id: shown.key,
            mode: writingMode(block),
            writeStyle: isWriteStyle(block.settings.writeStyle) ? block.settings.writeStyle : 'pas',
            writeFormat: isWriteFormat(block.settings.writeFormat) ? block.settings.writeFormat : 'hooks',
            hookCategory: isHookCategoryChoice(block.settings.hookCategory) ? block.settings.hookCategory : 'auto',
            hookCount: isHookCount(block.settings.hookCount) ? block.settings.hookCount : DEFAULT_HOOK_COUNT,
            variationCount: isVariationCount(block.settings.variationCount) ? block.settings.variationCount : DEFAULT_VARIATION_COUNT,
            inputSummary: shown.label,
            startedAt,
          }}
        />
      ) : (
        <GridCanvas>
          <NothingYet
            icon={PenLine}
            title={shown?.status === 'failed' ? 'That run failed' : 'Nothing written yet'}
            hint={shown?.error ?? (block.settings.mode === 'write' && block.settings.writeFormat === 'hooks'
              ? 'Generate writes every hook in one go. Each one has its own dot on the block, so one hook can go down its own path.'
              : 'Generate writes every take in one go. Each one has its own dot on the block, so one take can go down its own path.')}
          />
        </GridCanvas>
      )}
    </div>
  )
}

// The pipeline a run of this block takes — a winning ad that's a scene
// blueprint is rebuilt scene by scene, the way Scripts reads one.
function writingMode(block: FlowBlock): ScriptMode {
  if (block.settings.mode !== 'remix') return 'write'
  return detectSceneBlueprint(String(block.settings.source ?? '')) && !block.settings.forceTranscript ? 'reverse-engineer' : 'remix'
}
