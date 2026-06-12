import { FileText, Loader2, Mic, AlertCircle, Download, RefreshCw, X } from 'lucide-react'
import type { Script } from '../../../stores/types'
import GenerationProgress from '../../../components/GenerationProgress'
import ClearAllButton from '../../../components/ClearAllButton'

const MAX_CHARACTERS = 5000

interface EditorAreaProps {
  scriptText: string
  onScriptChange: (value: string) => void
  onSelectScript: () => void
  selectedScript: Script | null
  onClearScript: () => void
  onClear: () => void
  onGenerate: () => void
  isGenerating: boolean
  canGenerate: boolean
  highlightField?: string | null
  error?: string | null
  onDownloadLatest?: () => void
  hasLatest: boolean
}

export default function EditorArea({
  scriptText,
  onScriptChange,
  onSelectScript,
  selectedScript,
  onClearScript,
  onClear,
  onGenerate,
  isGenerating,
  canGenerate,
  highlightField,
  error,
  onDownloadLatest,
  hasLatest,
}: EditorAreaProps) {
  const charCount = scriptText.length
  const overLimit = charCount > MAX_CHARACTERS

  return (
    <div className="flex flex-col md:h-full md:overflow-hidden">
      {/* Body */}
      <div className="flex flex-1 flex-col px-8 pt-8 md:overflow-hidden">
        {/* Pull from Script bank — dashed "click to select" when empty; a
            filled pill with Change / X-clear once a bank script is loaded.
            Editing the textarea below reverts it to the empty state. */}
        {selectedScript ? (
          <div
            role="button"
            tabIndex={0}
            onClick={onSelectScript}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectScript() } }}
            className="group flex w-full cursor-pointer items-center gap-3 rounded-full border border-ink/10 bg-ink/[0.02] px-4 py-3 transition-colors hover:border-ink/20 hover:bg-ink/[0.04]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-voice-500/15 text-voice-300">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink-200">{selectedScript.title}</div>
              <div className="truncate text-[11px] text-ink-500">Script</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="hidden items-center gap-1 rounded-md px-2 py-0.5 text-[10px] text-ink-500 group-hover:flex">
                <RefreshCw className="h-2.5 w-2.5" />
                Change
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClearScript() }}
                title="Remove script"
                aria-label="Remove script"
                className="flex h-6 w-6 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink/5 hover:text-red-400 light:hover:text-red-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSelectScript}
            className="group flex items-center gap-3 rounded-full border border-dashed border-ink/10 bg-ink/[0.015] px-4 py-3 text-left transition-colors hover:border-ink/20 hover:bg-ink/[0.03]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-voice-500/10 text-voice-300/80 transition-colors group-hover:bg-voice-500/15 group-hover:text-voice-300">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink-200">Script</div>
              <div className="text-xs text-ink-400">Click to select from bank</div>
            </div>
          </button>
        )}

        {/* OR divider */}
        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-ink/[0.07]" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-ink-600">or paste script manually</span>
          <div className="h-px flex-1 bg-ink/[0.07]" />
        </div>

        {/* Textarea — borderless, full-bleed, minimal aesthetic */}
        <textarea
          value={scriptText}
          onChange={(e) => onScriptChange(e.target.value)}
          placeholder="Type or paste your ad script here to turn it into a voiceover..."
          className={`flex-1 resize-none bg-transparent text-base leading-relaxed text-ink-100 placeholder-ink-600 outline-none ${
            highlightField === 'script' ? 'animate-field-flash' : ''
          }`}
        />

        {/* "Clear All" link — bottom-left of the editor, above the footer bar. */}
        <div className="pt-2">
          <ClearAllButton onClear={onClear} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mb-3 mt-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400 light:text-red-600" />
          <p className="text-xs leading-relaxed text-red-300 light:text-red-700">{error}</p>
        </div>
      )}

      {/* Progress bar */}
      <div className="px-5 pt-3">
        <GenerationProgress
          isActive={isGenerating}
          color="bg-voice-500"
          messages={['Preparing audio...', 'Sending request...', 'Generating speech...', 'Encoding audio...']}
          className="mb-3"
        />
      </div>

      {/* Footer row — pinned to viewport bottom on mobile so Generate is always reachable */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between border-t border-ink/5 bg-surface-0/95 px-5 py-5 backdrop-blur-xl md:static md:left-auto md:right-auto md:z-auto md:mt-4 md:bg-transparent md:backdrop-blur-none">
        {/* Left — character count */}
        <div className={`text-sm tabular-nums ${overLimit ? 'text-red-400 light:text-red-600' : 'text-ink-400'}`}>
          <span className={overLimit ? 'text-red-300 light:text-red-700' : 'text-ink-200'}>{charCount.toLocaleString()}</span>
          <span className="text-ink-500"> / {MAX_CHARACTERS.toLocaleString()} characters</span>
        </div>

        {/* Right — download + generate */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onDownloadLatest}
            disabled={!hasLatest}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-ink/10 text-ink-300 transition-colors hover:bg-ink/5 hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            title="Download latest"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={onGenerate}
            disabled={!canGenerate || isGenerating || overLimit}
            className="flex items-center justify-center gap-2.5 rounded-full border border-white/15 bg-voice-500 px-7 py-4 text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-voice-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" strokeWidth={2.5} />
                <span>Generate Voiceover</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
