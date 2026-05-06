import { FileText, Loader2, Mic, AlertCircle } from 'lucide-react'
import GenerationProgress from '../../../components/GenerationProgress'

interface EditorPanelProps {
  scriptText: string
  onScriptChange: (value: string) => void
  onSelectScript: () => void
  onGenerate: () => void
  isGenerating: boolean
  canGenerate: boolean
  highlightField?: string | null
  error?: string | null
}

export default function EditorPanel({
  scriptText,
  onScriptChange,
  onSelectScript,
  onGenerate,
  isGenerating,
  canGenerate,
  highlightField,
  error,
}: EditorPanelProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Script Text */}
      <div className="flex flex-1 flex-col overflow-hidden p-5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">
            Script
          </span>
          <button
            onClick={onSelectScript}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-indigo-400 transition-colors hover:bg-indigo-500/10"
          >
            <FileText className="h-3 w-3" />
            Select from Script Bank
          </button>
        </div>
        <textarea
          value={scriptText}
          onChange={(e) => onScriptChange(e.target.value)}
          placeholder="Paste or type your script here, or load one from the Script Bank..."
          className={`flex-1 rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 outline-none transition-colors focus:border-indigo-500/30 resize-none ${highlightField === 'script' ? 'animate-field-flash' : ''}`}
        />
      </div>

      {/* Error + Progress bar + Generate button */}
      <div className="border-t border-white/5 p-4">
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
            <p className="text-xs leading-relaxed text-red-300">{error}</p>
          </div>
        )}
        <GenerationProgress
          isActive={isGenerating}
          color="bg-indigo-500"
          messages={['Preparing audio...', 'Sending request...', 'Generating speech...', 'Encoding audio...']}
          className="mb-3"
        />
        <button
          onClick={onGenerate}
          disabled={!canGenerate || isGenerating}
          className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-indigo-500 px-6 py-3.5 text-[13px] font-medium tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating Audio...</span>
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              <span>Generate Audio</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
