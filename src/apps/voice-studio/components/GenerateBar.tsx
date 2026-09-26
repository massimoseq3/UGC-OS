import { AlertCircle, Coins, FileText, Mic, Scissors } from 'lucide-react'
import GenerationProgress from '../../../components/GenerationProgress'
import BatchCountStepper from '../../../components/BatchCountStepper'
import { clampBatchCount } from '../../../utils/batchCount'
import { formatCredits, getDefaultModel, TTS_MODEL_PRO, TTS_MODEL_SLOT } from '../../../utils/models'
import { useSettingsStore } from '../../../stores/settingsStore'
import { estimateVoiceCredits } from '../runner'

export const MAX_CHARACTERS = 5000

// Five reads of the same line (Massimo's call, September 2026 — it was three).
// TTS is the cheapest thing in the app, so the ceiling here is about what's
// useful, not what it costs, and a read is short enough that five is still a
// set you can listen through and pick from. It sits above the app-wide 4 for
// that reason.
export const VOICE_BATCH_MAX = 5

interface GenerateBarProps {
  // The words that will be read. Only the length is used here — for the
  // credit estimate and the over-limit block — but the bar owns both, so the
  // button can never quote a price for a run it would refuse.
  scriptText: string
  onGenerate: () => void
  // How many reads of the same script one press fires. Capped at 5 (see
  // VOICE_BATCH_MAX): same voice, same params, same words — the delivery still
  // lands differently each time, and picking between them is the job.
  batchCount: number
  onBatchCountChange: (value: number) => void
  isGenerating: boolean
  error?: string | null
}

/**
 * The bottom of the settings column: how many reads one press makes, and the
 * button that makes them — plus the progress bar and the error, which report on
 * that press and belong beside it. The TTS model row sat on the stepper's line
 * until September 2026 and moved into the column's More section: two models
 * that take the same request at the same price are not a decision to make on
 * every press.
 *
 * It lived at the foot of the script column until September 2026 (Massimo's
 * call). Voiceovers was the one app whose Generate wasn't at the bottom of its
 * input column, because its input column sits on the LEFT; moving it here puts
 * this app in the same shape as every other one, and the room it needed is
 * exactly what History leaving the left panel freed up.
 */
export default function GenerateBar({
  scriptText,
  onGenerate,
  batchCount,
  onBatchCountChange,
  isGenerating,
  error,
}: GenerateBarProps) {
  const charCount = scriptText.length
  // What's holding the button shut, said ON the button — the Scripts pattern.
  // The script lives in the other pane (on a phone, another tab), so a grey
  // Generate with no reason on it pointed at nothing on screen, and the
  // over-limit case was only told by a red count across the screen. Empty
  // first: an empty box is never over the limit.
  const blocker = scriptText.trim().length === 0
    ? { label: 'Paste or Pick a Script', icon: FileText }
    : charCount > MAX_CHARACTERS
      ? { label: `Shorten the Script to ${MAX_CHARACTERS.toLocaleString()} Characters`, icon: Scissors }
      : null
  // The model the More section's picker is on — read THROUGH the selector,
  // never by calling a getter pulled out of the store (see the React Compiler
  // note in CLAUDE.md), so the price follows a swap. Falls back the same way
  // resolveTtsModel does, so the button quotes what the run will actually cost.
  const pickedModel = useSettingsStore((s) => s.getAppModel(TTS_MODEL_SLOT))
  const modelId = pickedModel ?? getDefaultModel('voice-studio', 'tts')?.id ?? TTS_MODEL_PRO
  const count = clampBatchCount(batchCount, VOICE_BATCH_MAX)
  // Priced by the runner that will make the read, so the button can't quote a
  // different number from the run. TTS is billed per call, so a run of N is N
  // times one read.
  const creditsFor = (n: number) => {
    const one = estimateVoiceCredits(scriptText, modelId)
    return one === null ? null : one * n
  }
  const creditsLabel = blocker ? null : formatCredits(creditsFor(count))

  return (
    <div className="shrink-0 border-t border-ink/5 px-5 pb-3 pt-3">
      {/* How many reads one press makes, on a line of its own. It shared this
          line with the TTS model row until that moved into the column's More
          section, and it doesn't move onto the button's line instead: by
          estimate the stepper plus the credits pill leave "Generate 3
          Voiceovers" too little room even at 460px, and the noun is the one
          thing the button has to say. With the line to itself the stepper carries its label
          again — it only lost it to leave the model row room for its name. */}
      <BatchCountStepper
        size="lg"
        accent="voice"
        noun="voiceover"
        label="Voiceovers"
        max={VOICE_BATCH_MAX}
        value={count}
        onChange={onBatchCountChange}
        creditsFor={blocker ? undefined : creditsFor}
      />

      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400 light:text-red-600" />
          <p className="text-xs leading-relaxed text-red-300 light:text-red-700">{error}</p>
        </div>
      )}

      {/* Only takes space while generating, so the button sits snug under the
          settings row when idle. */}
      {isGenerating && (
        <div className="pt-2">
          <GenerationProgress
            isActive
            color="bg-voice-500"
            messages={['Preparing audio...', 'Sending request...', 'Generating speech...', 'Encoding audio...']}
            showHelper={false}
          />
        </div>
      )}

      <button
        onClick={onGenerate}
        // Stays live while a voiceover renders — a second click queues another
        // one alongside it. The progress bar above is the feedback.
        disabled={blocker !== null}
        className="mt-2 flex w-full items-center justify-center gap-2.5 glass-fill glass-fill-soft rounded-full border border-white/15 bg-voice-500 px-4 py-4 text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(255,255,255,0.08)] btn-soft-shadow transition-all hover:brightness-110 disabled:hover:brightness-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {blocker ? (
          <>
            <blocker.icon className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            <span className="truncate">{blocker.label}</span>
          </>
        ) : (
          <>
            <Mic className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            {/* The noun stays at every width here. This column is 460px on a
                desktop and the whole screen on a phone, and the button has the
                row to itself — the old editor-column footer shared a 375px
                line with the stepper and the player, which is what clipped it. */}
            <span className="truncate">
              Generate{count > 1 ? ` ${count}` : ''}
              {count === 1 ? ' Voiceover' : ' Voiceovers'}
            </span>
          </>
        )}
        {creditsLabel && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold tracking-tight">
            <Coins className="h-3 w-3" strokeWidth={2} />
            {creditsLabel}
          </span>
        )}
      </button>
    </div>
  )
}
