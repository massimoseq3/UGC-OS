import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Check, Star } from 'lucide-react'
import {
  listModels,
  getDefaultModel,
  videoResolutionLabel,
  estimateCredits,
  formatCredits,
  TAG_STYLES,
  type Task,
  type Mode,
  type ModelEntry,
  type CostEstimateParams,
} from '../utils/models'
import { useSettingsStore } from '../stores/settingsStore'
import { useIsDesktop } from '../hooks/useBreakpoint'
import ProviderLogo from './ProviderLogo'

// Slide-in side-panel model picker (mirrors BankPicker's mechanics). Used by
// B-Roll in place of the inline ModelPicker dropdown. Selection is persisted
// through the SAME settingsStore key as ModelPicker (`appId:task[:mode]`), so
// the two pickers stay interchangeable — swapping one for the other keeps the
// user's saved choice.
interface ModelSidePanelProps {
  appId: string
  task: Task
  mode?: Mode
  isOpen: boolean
  onClose: () => void
  // Hint mode: models whose `modes` don't include this are dimmed but still
  // selectable (same semantics as ModelPicker's requireMode).
  requireMode?: Mode
  // One-line note shown in the footer when requireMode dims at least one model.
  requireModeNote?: string
  // Cost params for the per-row credit estimate (e.g. duration/resolution/audio).
  costParams?: CostEstimateParams
  // Optional controlled mode: when both are provided the panel reflects `value`
  // and reports picks through `onChange` instead of reading/writing settingsStore
  // (lets a controlled consumer like Playground reuse the same panel).
  value?: string
  onChange?: (modelId: string) => void
}

export default function ModelSidePanel({
  appId,
  task,
  mode,
  isOpen,
  onClose,
  requireMode,
  requireModeNote,
  costParams = {},
  value,
  onChange,
}: ModelSidePanelProps) {
  const setAppModel = useSettingsStore((s) => s.setAppModel)
  const getAppModel = useSettingsStore((s) => s.getAppModel)
  const persistedKey = `${appId}:${task}${mode ? `:${mode}` : ''}`

  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const isDesktop = useIsDesktop()

  const models = listModels({ task, mode })
  const fallback = getDefaultModel(appId, task, mode)
  const resolved = value ?? getAppModel(persistedKey) ?? fallback?.id

  // Filter by display name, then split into Featured (recommended) + the rest.
  const filtered = search.trim()
    ? models.filter((m) => m.displayName.toLowerCase().includes(search.toLowerCase()))
    : models
  const featured = filtered.filter((m) => m.tags.includes('recommended'))
  const rest = filtered.filter((m) => !m.tags.includes('recommended'))

  // Reset search + focus the input on open.
  useEffect(() => {
    if (isOpen) {
      setSearch('')
      setTimeout(() => searchRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  function pick(modelId: string) {
    if (onChange) onChange(modelId)
    else setAppModel(persistedKey, modelId)
    onClose()
  }

  const showRequireNote =
    requireMode && requireModeNote && models.some((m) => !m.modes?.includes(requireMode))

  // Render through a portal so the panel parents at document root, not inside
  // the B-Roll CardDetailModal (which has its own transform/backdrop context).
  const portalTarget = typeof document !== 'undefined' ? document.body : null
  if (!portalTarget) return null

  const panel = (
    <>
      {/* Backdrop — z-[70] sits above the sidebar (z-40) and the B-Roll
          CardDetailModal (z-[60]) it's opened from. */}
      <div
        className={`fixed inset-0 z-[70] bg-black/50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed z-[80] flex flex-col border-ink/5 bg-surface-1/95 backdrop-blur-2xl transition-transform duration-300 ease-out ${
          isDesktop
            ? `right-0 top-0 bottom-0 w-[380px] border-l ${isOpen ? 'translate-x-0' : 'translate-x-full'}`
            : `inset-x-0 bottom-0 top-14 border-t rounded-t-2xl ${isOpen ? 'translate-y-0' : 'translate-y-full'}`
        }`}
      >
        {/* Drag handle — mobile only */}
        {!isDesktop && (
          <div className="flex justify-center pt-2 pb-1">
            <div className="h-1 w-10 rounded-full bg-ink/20" />
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink/5 px-5 py-3.5">
          <h3 className="text-sm font-semibold tracking-tight text-ink-200">Video Model</h3>
          <button
            onClick={onClose}
            className="rounded-full p-2 lg:p-1 text-ink-500 transition-colors hover:bg-ink/5 hover:text-ink-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 border-b border-ink/5 px-4 py-3">
          <div className="flex h-10 flex-1 items-center gap-2 rounded-full border border-ink/10 bg-ink/[0.03] px-3.5 focus-within:border-broll-500/40">
            <Search className="h-3.5 w-3.5 shrink-0 text-ink-600" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full bg-transparent text-sm text-ink-200 placeholder-ink-600 outline-none"
            />
          </div>
        </div>

        {/* Model list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
              <span className="text-sm text-ink-600">No matches found</span>
              <span className="text-xs text-ink-700">Try a different search</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {featured.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="px-1 text-[11px] font-semibold uppercase tracking-tight text-ink-600">
                    Featured models
                  </span>
                  {featured.map((m) => (
                    <ModelCard
                      key={`feat-${m.id}`}
                      model={m}
                      active={m.id === resolved}
                      muted={requireMode ? !m.modes?.includes(requireMode) : false}
                      credits={formatCredits(estimateCredits(m.id, costParams))}
                      onClick={() => pick(m.id)}
                    />
                  ))}
                </div>
              )}
              {rest.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {featured.length > 0 && (
                    <span className="px-1 text-[11px] font-semibold uppercase tracking-tight text-ink-600">
                      All models
                    </span>
                  )}
                  {rest.map((m) => (
                    <ModelCard
                      key={m.id}
                      model={m}
                      active={m.id === resolved}
                      muted={requireMode ? !m.modes?.includes(requireMode) : false}
                      credits={formatCredits(estimateCredits(m.id, costParams))}
                      onClick={() => pick(m.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — requireMode caveat, mirrors ModelPicker's dropdown footer. */}
        {showRequireNote && (
          <p className="border-t border-ink/5 px-4 py-3 text-[11px] leading-relaxed text-ink-500">
            {requireModeNote}
          </p>
        )}
      </div>
    </>
  )

  return createPortal(panel, portalTarget)
}

interface ModelCardProps {
  model: ModelEntry
  active: boolean
  muted: boolean
  credits: string | null
  onClick: () => void
}

function ModelCard({ model, active, muted, credits, onClick }: ModelCardProps) {
  const isRecommended = model.tags.includes('recommended')
  const c = model.videoConstraints
  // Resolution chip: min → max range (ascending, e.g. "480p–1080p"), or a single
  // tier. Per-call models with no duration toggle (durations === []) show "per
  // clip" instead of a range.
  const resolutionChip = c?.resolutions.length
    ? c.resolutions.length > 1
      ? `${videoResolutionLabel(c.resolutions[0])}–${videoResolutionLabel(c.resolutions[c.resolutions.length - 1])}`
      : videoResolutionLabel(c.resolutions[0])
    : null
  const durationChip = c
    ? c.durations.length > 1
      ? `${c.durations[0]}s–${c.durations[c.durations.length - 1]}s`
      : c.durations.length === 1
      ? `${c.durations[0]}s`
      : 'per clip'
    : null
  const hasSpecs = !!(resolutionChip || durationChip || credits)
  const hasMeta = model.tags.length > 0 || hasSpecs

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={muted}
      aria-disabled={muted}
      className={`flex w-full flex-col gap-2 rounded-[1.75rem] border px-3.5 py-3 text-left transition-colors ${
        muted
          ? 'cursor-not-allowed border-ink/10 bg-ink/[0.01] opacity-30 grayscale'
          : active
          ? 'border-broll-500/50 bg-broll-500/10'
          : 'border-ink/10 bg-ink/[0.02] hover:bg-ink/[0.05]'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <ProviderLogo provider={model.provider} />
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className={`truncate text-[13px] font-semibold text-ink-100 ${muted ? 'line-through decoration-ink-400' : ''}`}>{model.displayName}</span>
          {isRecommended && (
            <Star className="h-3 w-3 shrink-0 fill-broll-400 text-broll-400" strokeWidth={1.5} />
          )}
        </div>
        {active && <Check className="h-4 w-4 shrink-0 text-broll-400" />}
      </div>

      {hasMeta && (
        <>
          {/* Inset hairline between the name and the chips (not full width). */}
          <div className="mx-3 border-b border-ink/10" />
          {/* One chip line: tags · vertical divider · spec chips. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {model.tags.map((t) => (
              <span
                key={t}
                className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${TAG_STYLES[t].className}`}
              >
                {TAG_STYLES[t].label}
              </span>
            ))}
            {model.tags.length > 0 && hasSpecs && (
              <span aria-hidden className="mx-0.5 h-3 w-px shrink-0 bg-ink/15" />
            )}
            {resolutionChip && (
              <span className="rounded-full border border-ink/10 bg-ink/[0.03] px-2 py-0.5 text-[10px] text-ink-400">{resolutionChip}</span>
            )}
            {durationChip && (
              <span className="rounded-full border border-ink/10 bg-ink/[0.03] px-2 py-0.5 text-[10px] text-ink-400">{durationChip}</span>
            )}
            {credits && (
              <span className="rounded-full border border-ink/10 bg-ink/[0.03] px-2 py-0.5 text-[10px] text-ink-400">{credits}</span>
            )}
          </div>
        </>
      )}
    </button>
  )
}
