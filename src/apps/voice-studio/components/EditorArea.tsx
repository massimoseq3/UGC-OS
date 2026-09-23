import { FileText, RefreshCw, X, ChevronRight } from 'lucide-react'
import type { Script } from '../../../stores/types'
import { MAX_CHARACTERS } from './GenerateBar'

interface EditorAreaProps {
  scriptText: string
  onScriptChange: (value: string) => void
  onSelectScript: () => void
  selectedScript: Script | null
  onClearScript: () => void
  highlightField?: string | null
}

/**
 * The script pane, and nothing else.
 *
 * It used to end in the generate footer — the batch stepper, the button and
 * the player. Generate moved to the foot of the settings column in September
 * 2026 (see `GenerateBar`), and the player became this column's own footer one
 * level up, so it spans History as well as the script.
 */
export default function EditorArea({
  scriptText,
  onScriptChange,
  onSelectScript,
  selectedScript,
  onClearScript,
  highlightField,
}: EditorAreaProps) {
  const charCount = scriptText.length
  const overLimit = charCount > MAX_CHARACTERS

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* `px-5` at every width — the inset the header band above takes, so the
          History toggle, the script row and the text share one left edge. It
          was `md:px-8`, which stood the whole body 12px in from the button
          heading it. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-5 pt-5 md:pb-6 md:pt-6">
        {/* Pull from Script bank — dashed "click to select" when empty; a
            filled pill with a hover refresh icon / X-clear once a bank script
            is loaded. Editing the textarea below reverts it to the empty state. */}
        {selectedScript ? (
          <div
            role="button"
            tabIndex={0}
            onClick={onSelectScript}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectScript() } }}
            className="group flex w-full cursor-pointer items-center gap-3 rounded-full border border-voice-500/25 bg-voice-500/[0.06] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ring-1 ring-inset ring-voice-500/10 transition-colors hover:bg-voice-500/10"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-voice-500/15 text-voice-300">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-ink-100">{selectedScript.title}</div>
              <div className="truncate text-[11px] text-ink-500">Script</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="hidden items-center rounded-md px-2 py-0.5 text-ink-500 group-hover:flex">
                <RefreshCw className="h-2.5 w-2.5" />
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
            className="group flex w-full items-center gap-3 rounded-full border border-dashed border-ink/10 bg-ink/[0.015] px-3.5 py-2.5 text-left transition-colors hover:border-ink/20 hover:bg-ink/[0.03]"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-voice-500/10 text-voice-300/80 transition-colors group-hover:bg-voice-500/15 group-hover:text-voice-300">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ink-200">Script</div>
              <div className="truncate text-[11px] text-ink-400">Click to select from bank</div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" />
          </button>
        )}

        {/* OR divider */}
        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-ink/[0.07]" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-ink-600">or paste script manually</span>
          <div className="h-px flex-1 bg-ink/[0.07]" />
        </div>

        {/* Character count — over the box it counts, rather than in the footer
            beside Generate. In the footer it was a third thing competing for a
            375px row with a batch stepper and a button, and what gave way was
            the button's own label ("Generat…"). It also belongs to the script:
            it moves as you type, and this is the panel you're typing in.

            Enhance used to share this row on the right (removed September 2026,
            Massimo's call) — it rewrote the script in place with square-bracket
            expression tags. "New" left the row before it, for the History rail.
            The row is the count alone now, so it reads as a label on the box
            rather than as a toolbar. */}
        <div className="mb-2 flex items-center">
          <div className={`shrink-0 text-[11px] tabular-nums ${overLimit ? 'text-red-400 light:text-red-600' : 'text-ink-500'}`}>
            <span className={overLimit ? 'text-red-300 light:text-red-700' : 'text-ink-300'}>{charCount.toLocaleString()}</span>
            <span> / {MAX_CHARACTERS.toLocaleString()}</span>
            <span className="hidden md:inline"> characters</span>
          </div>
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
      </div>
    </div>
  )
}
