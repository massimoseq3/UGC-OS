import { FileText, Loader2, Mic, AlertCircle, Download } from 'lucide-react'
import GenerationProgress from '../../../components/GenerationProgress'
import ClearAllButton from '../../../components/ClearAllButton'

const MAX_CHARACTERS = 5000

interface EditorAreaProps {
  scriptText: string
  onScriptChange: (value: string) => void
  onSelectScript: () => void
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
      <div className="flex flex-1 flex-col px-8 pt-6 md:overflow-hidden">
        {/* Top-left "Clear All" link. */}
        <div className="pb-2">
          <ClearAllButton onClear={onClear} />
        </div>

        {/* Pull from Script bank — subtle dashed-border affordance */}
        <button
          type="button"
          onClick={onSelectScript}
          className="group flex items-center gap-3 rounded-full border border-dashed border-white/10 bg-white/[0.015] px-4 py-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.03]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-voice-500/10 text-voice-300/80 transition-colors group-hover:bg-voice-500/15 group-hover:text-voice-300">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-zinc-200">Script</div>
            <div className="text-xs text-zinc-400">Click to select from bank</div>
          </div>
        </button>

        {/* OR divider */}
        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/[0.07]" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">or paste script manually</span>
          <div className="h-px flex-1 bg-white/[0.07]" />
        </div>

        {/* Textarea — borderless, full-bleed, minimal aesthetic */}
        <textarea
          value={scriptText}
          onChange={(e) => onScriptChange(e.target.value)}
          placeholder="Type or paste your ad script here to turn it into a voiceover..."
          className={`flex-1 resize-none bg-transparent text-base leading-relaxed text-zinc-100 placeholder-zinc-600 outline-none ${
            highlightField === 'script' ? 'animate-field-flash' : ''
          }`}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mb-3 mt-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
          <p className="text-xs leading-relaxed text-red-300">{error}</p>
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
      <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between border-t border-white/5 bg-[#050505]/95 px-5 py-5 backdrop-blur-xl md:static md:left-auto md:right-auto md:z-auto md:mt-4 md:bg-transparent md:backdrop-blur-none">
        {/* Left — character count */}
        <div className={`text-sm tabular-nums ${overLimit ? 'text-red-400' : 'text-zinc-400'}`}>
          <span className={overLimit ? 'text-red-300' : 'text-zinc-200'}>{charCount.toLocaleString()}</span>
          <span className="text-zinc-500"> / {MAX_CHARACTERS.toLocaleString()} characters</span>
        </div>

        {/* Right — download + generate */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onDownloadLatest}
            disabled={!hasLatest}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-zinc-300 transition-colors hover:bg-white/5 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            title="Download latest"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={onGenerate}
            disabled={!canGenerate || isGenerating || overLimit}
            className="flex items-center justify-center gap-2.5 rounded-full border border-white/15 bg-voice-500 px-6 py-3.5 text-[13px] font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-voice-400 disabled:cursor-not-allowed disabled:opacity-40"
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
