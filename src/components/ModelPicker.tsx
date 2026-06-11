import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check, Star } from 'lucide-react'
import {
  listModels,
  getDefaultModel,
  estimateCredits,
  formatCredits,
  type Task,
  type Mode,
  type ModelEntry,
  type CostEstimateParams,
} from '../utils/models'
import { useSettingsStore } from '../stores/settingsStore'
import ProviderLogo from './ProviderLogo'

interface ModelPickerProps {
  appId: string
  task: Task
  mode?: Mode
  value?: string
  onChange?: (modelId: string) => void
  // Used to compute credits-per-generation estimate shown inline.
  costParams?: CostEstimateParams
  // When set, models whose `modes` don't include this are greyed out (muted)
  // but still selectable — a hint, not a hard block (e.g. B-Roll passes
  // 'reference-to-video' so non-reference-capable video models dim while a
  // ref is attached, but the user can still pick one for text-to-video).
  requireMode?: Mode
  // One-line explanation shown as a footer under the dropdown list when
  // requireMode dims at least one model.
  requireModeNote?: string
  // Slim single-line trigger (h-9, no provider sub-line) so the picker can
  // sit inline with ConstraintChips in a footer row.
  compact?: boolean
  // Roomier trigger (more padding, larger type) for footer rows where the
  // picker is the primary control. Ignored when `compact` is set.
  large?: boolean
}

export default function ModelPicker({ appId, task, mode, value, onChange, costParams, requireMode, requireModeNote, compact, large }: ModelPickerProps) {
  const setAppModel = useSettingsStore((s) => s.setAppModel)
  const getAppModel = useSettingsStore((s) => s.getAppModel)
  const persistedKey = `${appId}:${task}${mode ? `:${mode}` : ''}`

  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const models = listModels({ task, mode })
  const fallback = getDefaultModel(appId, task, mode)
  const persisted = getAppModel(persistedKey)
  const resolved = value ?? persisted ?? fallback?.id
  const selected = models.find((m) => m.id === resolved)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function pick(modelId: string) {
    setAppModel(persistedKey, modelId)
    onChange?.(modelId)
    setOpen(false)
  }

  if (models.length === 0) {
    return (
      <div className="text-[11px] text-zinc-600">
        No models available for {task}{mode ? ` / ${mode}` : ''}.
      </div>
    )
  }

  const selectedCredits = selected ? estimateCredits(selected.id, costParams) : null

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect()
            const spaceBelow = window.innerHeight - rect.bottom
            const spaceAbove = rect.top
            // Dropdown is up to ~360px tall. Flip up if there's not enough room below.
            setOpenUpward(spaceBelow < 360 && spaceAbove > spaceBelow)
          }
          setOpen((v) => !v)
        }}
        className={
          compact
            ? 'flex h-9 w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-2 text-left transition-colors hover:bg-white/[0.05]'
            : large
            ? 'flex h-12 w-full items-center gap-3 rounded-full border border-white/10 bg-white/[0.02] px-4 text-left transition-colors hover:bg-white/[0.05]'
            : 'flex h-12 w-full items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.02] px-3 text-left transition-colors hover:bg-white/[0.05]'
        }
      >
        {selected ? (
          compact ? (
            <>
              <ProviderLogo provider={selected.provider} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-100">{selected.displayName}</span>
              {selected.tags.includes('recommended') && (
                <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400" strokeWidth={1.5} />
              )}
              {selectedCredits != null && (
                <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">{formatCredits(selectedCredits)}</span>
              )}
            </>
          ) : (
            <>
              <ProviderLogo provider={selected.provider} />
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className={`truncate font-medium text-zinc-100 ${large ? 'text-[14px]' : 'text-[13px]'}`}>{selected.displayName}</span>
                {selected.tags.includes('recommended') && (
                  <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400" strokeWidth={1.5} />
                )}
              </div>
              {selectedCredits != null && (
                <span className={`shrink-0 tabular-nums text-zinc-500 ${large ? 'text-[12px]' : 'text-[11px]'}`}>{formatCredits(selectedCredits)}</span>
              )}
            </>
          )
        ) : (
          <span className="flex-1 truncate text-sm text-zinc-400">Select model</span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={`absolute left-0 right-0 z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#0B0B0D]/95 shadow-2xl backdrop-blur-xl ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          <div className="max-h-[min(360px,60vh)] overflow-y-auto p-1">
            {models.map((m) => {
              const muted = requireMode ? !m.modes?.includes(requireMode) : false
              return (
                <ModelRow
                  key={m.id}
                  model={m}
                  active={m.id === resolved}
                  costParams={costParams}
                  muted={muted}
                  onClick={() => pick(m.id)}
                />
              )
            })}
          </div>
          {requireMode && requireModeNote && models.some((m) => !m.modes?.includes(requireMode)) && (
            <p className="border-t border-white/5 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
              {requireModeNote}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

interface ModelRowProps {
  model: ModelEntry
  active: boolean
  costParams?: CostEstimateParams
  muted?: boolean
  onClick: () => void
}

function ModelRow({ model, active, costParams, muted, onClick }: ModelRowProps) {
  const credits = estimateCredits(model.id, costParams)
  const creditsLabel = formatCredits(credits)
  const isRecommended = model.tags.includes('recommended')

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 w-full items-center gap-3 rounded-full px-2.5 text-left transition-colors ${
        muted ? 'opacity-45 hover:opacity-70' : ''
      } ${active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
    >
      <ProviderLogo provider={model.provider} />

      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-[13px] font-semibold text-zinc-100">{model.displayName}</span>
        {isRecommended && (
          <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400" strokeWidth={1.5} />
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {creditsLabel && (
          <span className="text-[11px] tabular-nums text-zinc-400">{creditsLabel}</span>
        )}
        {active ? (
          <Check className="h-4 w-4 text-sky-400" />
        ) : (
          <span className="h-4 w-4" />
        )}
      </div>
    </button>
  )
}
