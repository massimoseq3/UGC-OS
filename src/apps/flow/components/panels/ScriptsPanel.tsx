// The Scripts block: Scripts' own choices — Write New or Remix, the format,
// the style, the hook family, the length and how many — laid out for a
// column beside a canvas. A product, brief or winning ad wired in stands in
// for the field of the same name here.

import { useState } from 'react'
import type { FlowBlock, FlowDoc } from '../../types'
import { useFlowStore } from '../../store/flowStore'
import { wiresInto } from '../../engine/graph'
import {
  HOOK_CATEGORY_META,
  HOOK_COUNTS,
  REMIX_LENGTHS,
  VARIATION_COUNTS,
  WRITE_LENGTHS,
  WRITE_STYLE_GROUP_META,
  WRITE_STYLE_META,
  writeStylesInGroup,
  type WriteStyleGroup,
} from '../../../script-architect/types'
import SegmentedToggle from '../../../../components/SegmentedToggle'
import Dropdown from '../../../../components/Dropdown'
import AutoGrowTextarea from '../../../../components/AutoGrowTextarea'
import ScriptModelRow from '../../../../components/ScriptModelRow'
import BankPicker from '../../../../components/BankPicker'
import { useBankStore } from '../../../../stores/bankStore'
import { FieldLabel } from './common'
import { ChevronRight, X } from 'lucide-react'

const TEXTAREA = 'w-full resize-none rounded-2xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-[13px] text-ink-100 placeholder-ink-600 outline-none transition-colors focus:border-ink/20'

export default function ScriptsPanel({ block, doc }: { block: FlowBlock; doc: FlowDoc }) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const s = block.settings
  const set = (patch: Record<string, unknown>, coalesce?: string) => patchSettings(block.id, patch, coalesce ? { coalesce: `${coalesce}:${block.id}` } : undefined)
  const wired = (port: string) => wiresInto(doc, block.id, port).length > 0
  const remix = s.mode === 'remix'
  const format = String(s.writeFormat ?? 'hooks')

  const styleOptions = (['structure', 'format'] as WriteStyleGroup[]).flatMap((g) =>
    writeStylesInGroup(g).map((st) => ({ value: st, label: `${WRITE_STYLE_META[st].label} · ${WRITE_STYLE_GROUP_META[g].label}` })))

  return (
    <div className="flex flex-col gap-3 px-5 pb-4 pt-4">
      <SegmentedToggle
        options={[{ value: 'write', label: 'Write New' }, { value: 'remix', label: 'Remix a Winner' }]}
        value={remix ? 'remix' : 'write'}
        onChange={(v) => set({ mode: v })}
        accent="scripts"
      />

      {!remix && (
        <>
          <SegmentedToggle
            options={[{ value: 'hooks', label: 'Hooks' }, { value: 'script', label: 'Scripts' }, { value: 'scenes', label: 'Scenes' }]}
            value={format}
            onChange={(v) => set({ writeFormat: v })}
            accent="scripts"
          />
          <ProductField block={block} disabled={wired('product')} />
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Brief</FieldLabel>
            {wired('brief') ? (
              <p className="rounded-2xl border border-dashed border-ink/10 px-4 py-3 text-xs text-ink-500">Comes in on its wire.</p>
            ) : (
              <AutoGrowTextarea
                value={String(s.brief ?? '')}
                onChange={(e) => set({ brief: e.target.value }, 'brief')}
                placeholder="What should these say? Leave it empty and the writer takes it from the product."
                className={TEXTAREA}
                rows={3}
              />
            )}
          </div>
          {format === 'hooks' ? (
            <div className="grid grid-cols-2 gap-2">
              <Dropdown
                label="Family"
                accent="scripts"
                value={String(s.hookCategory ?? 'auto')}
                options={Object.entries(HOOK_CATEGORY_META).map(([value, m]) => ({ value, label: m.label }))}
                onChange={(v) => set({ hookCategory: v })}
              />
              <Dropdown
                label="Hooks"
                accent="scripts"
                value={String(s.hookCount ?? 10)}
                options={HOOK_COUNTS.map((n) => String(n))}
                onChange={(v) => set({ hookCount: Number(v) })}
              />
            </div>
          ) : (
            <>
              <Dropdown
                label="Style"
                accent="scripts"
                value={String(s.writeStyle ?? 'pas')}
                options={styleOptions}
                onChange={(v) => set({ writeStyle: v })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Dropdown
                  label="Length"
                  accent="scripts"
                  value={String(s.writeLength ?? 30)}
                  options={WRITE_LENGTHS.map((n) => ({ value: String(n), label: `${n}s` }))}
                  onChange={(v) => set({ writeLength: Number(v) })}
                />
                <Dropdown
                  label="Takes"
                  accent="scripts"
                  value={String(s.variationCount ?? 3)}
                  options={VARIATION_COUNTS.map((n) => String(n))}
                  onChange={(v) => set({ variationCount: Number(v) })}
                />
              </div>
            </>
          )}
        </>
      )}

      {remix && (
        <>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Winning Ad</FieldLabel>
            {wired('source') ? (
              <p className="rounded-2xl border border-dashed border-ink/10 px-4 py-3 text-xs text-ink-500">Comes in on its wire — an Ad Analyzer transcript, or any text.</p>
            ) : (
              <AutoGrowTextarea
                value={String(s.source ?? '')}
                onChange={(e) => set({ source: e.target.value }, 'source')}
                placeholder="Paste the winning ad's transcript, or wire one in."
                className={TEXTAREA}
                rows={4}
              />
            )}
          </div>
          <ProductField block={block} disabled={wired('product')} />
          <div className="grid grid-cols-2 gap-2">
            <Dropdown
              label="Length"
              accent="scripts"
              value={String(s.remixLength ?? 'default')}
              options={REMIX_LENGTHS.map((n) => ({ value: String(n), label: n === 'default' ? 'Same as the Ad' : `${n}s` }))}
              onChange={(v) => set({ remixLength: v === 'default' ? 'default' : Number(v) })}
            />
            <Dropdown
              label="Takes"
              accent="scripts"
              value={String(s.variationCount ?? 3)}
              options={VARIATION_COUNTS.map((n) => String(n))}
              onChange={(v) => set({ variationCount: Number(v) })}
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <FieldLabel>Anything Else</FieldLabel>
        <AutoGrowTextarea
          value={String(s.additionalContext ?? '')}
          onChange={(e) => set({ additionalContext: e.target.value }, 'context')}
          placeholder="Optional. The offer, words to avoid, a tone."
          className={TEXTAREA}
          rows={2}
        />
      </div>

      <ScriptModelRow appId="script-architect" className="mb-0" />
      <p className="px-1 text-[11px] text-ink-500">Writes with the same model as the Scripts app.</p>
    </div>
  )
}

// The product the scripts are for, when none is wired in.
function ProductField({ block, disabled }: { block: FlowBlock; disabled: boolean }) {
  const patchSettings = useFlowStore((s) => s.patchSettings)
  const [open, setOpen] = useState(false)
  const productId = block.settings.productId as string | undefined
  const product = useBankStore((s) => (productId ? s.products.find((p) => p.id === productId) : undefined))
  if (disabled) return <p className="rounded-2xl border border-dashed border-ink/10 px-4 py-3 text-xs text-ink-500">The product comes in on its wire.</p>
  return (
    <>
      <div className="flex h-[52px] items-center gap-3 rounded-2xl border border-ink/10 bg-ink/[0.03] px-4">
        <button type="button" onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-100">{product?.productName ?? 'Choose a Product'}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" />
        </button>
        {product && (
          <button type="button" onClick={() => patchSettings(block.id, { productId: undefined })} className="flex h-6 w-6 items-center justify-center rounded-full text-ink-500 hover:bg-ink/10 hover:text-ink-100" title="Clear Product">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <BankPicker
        bankType="products"
        isOpen={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => {
          patchSettings(block.id, { productId: item.id })
          setOpen(false)
        }}
      />
    </>
  )
}
