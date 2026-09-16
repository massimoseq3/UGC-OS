import { useRef, useState } from 'react'
import { Clapperboard, EyeOff, Eye, Minus, Plus, Power } from 'lucide-react'
import Switch from './Switch'
import AnchoredPopover from './video/AnchoredPopover'
import useCloseOnEscape from '../hooks/useCloseOnEscape'
import {
  REPLAY_SECONDS_MAX,
  REPLAY_SECONDS_MIN,
  useRecordingActive,
  useRecordingStore,
} from '../stores/recordingStore'

// The operator's floating Recording Mode control, bottom-right beside the dock.
// Renders only while the mode is on AND the viewer is the operator (see
// recordingStore), so it is never on a member's screen. Desktop only: a tutorial
// is filmed on a desktop, and on a phone the dock owns the whole bottom edge.
//
// It stays out of the picture on purpose: invisible until the pointer reaches
// the corner (a 72px hover zone), and it stays up while its panel is open.
const PANEL_WIDTH = 288

export default function RecordingControl() {
  const active = useRecordingActive()
  const loop = useRecordingStore((s) => s.loop)
  const replaySeconds = useRecordingStore((s) => s.replaySeconds)
  const hiddenBefore = useRecordingStore((s) => s.hiddenBefore)
  const setLoop = useRecordingStore((s) => s.setLoop)
  const setReplaySeconds = useRecordingStore((s) => s.setReplaySeconds)
  const setEnabled = useRecordingStore((s) => s.setEnabled)
  const hideAll = useRecordingStore((s) => s.hideAll)
  const showAll = useRecordingStore((s) => s.showAll)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const close = () => setOpen(false)
  useCloseOnEscape(open, close)

  if (!active) return null
  const hiding = hiddenBefore != null

  return (
    <div className="group fixed bottom-[calc(max(env(safe-area-inset-bottom),0.5rem)+10px)] right-2 z-40 hidden p-3.5 md:block">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Recording Mode"
        aria-label="Recording Mode"
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border border-ink/10 bg-surface-2 text-ink-300 shadow-lg shadow-black/30 transition-[color,opacity] duration-200 hover:text-ink-100 focus-visible:opacity-100 group-hover:opacity-100 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <Clapperboard className="h-[18px] w-[18px]" strokeWidth={2} />
        {/* The one live signal: red while generations are faked, so a glance
            says whether a Generate press will spend anything. */}
        <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${loop ? 'bg-rose-500' : 'bg-rose-500/70'}`} />
      </button>

      <AnchoredPopover
        anchorRef={anchorRef}
        open={open}
        onClose={close}
        width={PANEL_WIDTH}
        estimatedHeight={292}
        placement="above"
      >
        <div className="overflow-hidden rounded-2xl border border-ink/10 bg-surface-2 p-4 shadow-xl shadow-black/30">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <span className="text-[13px] font-semibold tracking-tight text-ink-100">Recording Mode</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
            Generate spends nothing. It plays the loading state, then brings back your oldest hidden output.
          </p>

          <button
            type="button"
            onClick={hiding ? showAll : hideAll}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-ink/10 py-2 text-[12px] font-medium text-ink-200 transition-colors hover:bg-ink/[0.05]"
          >
            {hiding ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {hiding ? 'Show All Outputs' : 'Hide All Outputs'}
          </button>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[12px] font-medium text-ink-200">Loop Loading</span>
              <span className="block text-[11px] text-ink-500">Every generation stays mid-flight</span>
            </span>
            <Switch checked={loop} onChange={setLoop} label="Loop Loading" accent="rose" />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[12px] font-medium text-ink-200">Replay Length</span>
              <span className="block text-[11px] text-ink-500">How long a fake run takes</span>
            </span>
            <div className="flex shrink-0 items-center rounded-full border border-ink/10">
              <button
                type="button"
                onClick={() => setReplaySeconds(replaySeconds - 1)}
                disabled={replaySeconds <= REPLAY_SECONDS_MIN}
                aria-label="Shorter"
                className="flex h-8 w-8 items-center justify-center text-ink-400 hover:text-ink-100 disabled:opacity-40"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-8 text-center text-[12px] font-medium tabular-nums text-ink-200">{replaySeconds}s</span>
              <button
                type="button"
                onClick={() => setReplaySeconds(replaySeconds + 1)}
                disabled={replaySeconds >= REPLAY_SECONDS_MAX}
                aria-label="Longer"
                className="flex h-8 w-8 items-center justify-center text-ink-400 hover:text-ink-100 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { close(); setEnabled(false) }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-ink/[0.06] py-2 text-[12px] font-medium text-ink-300 transition-colors hover:bg-ink/[0.1]"
          >
            <Power className="h-3.5 w-3.5" />
            Turn Off Recording Mode
          </button>
        </div>
      </AnchoredPopover>
    </div>
  )
}
