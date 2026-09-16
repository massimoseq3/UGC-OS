import { useRef, useState } from 'react'
import { Clapperboard, EyeOff, Eye, Minus, Plus, X } from 'lucide-react'
import Switch from './Switch'
import AnchoredPopover from './video/AnchoredPopover'
import useCloseOnEscape from '../hooks/useCloseOnEscape'
import {
  REPLAY_SECONDS_MAX,
  REPLAY_SECONDS_MIN,
  useRecordingActive,
  useRecordingStore,
} from '../stores/recordingStore'
import { useAuthStore } from '../stores/authStore'

// The admin's floating Recording Mode control, bottom-right beside the dock.
// It renders for admins only — on or off — so the mode can be switched from the
// corner rather than from Settings, and never on a member's screen. Desktop
// only: a tutorial is filmed on a desktop, and on a phone the dock owns the
// whole bottom edge.
//
// It stays out of the picture on purpose: invisible until the pointer reaches
// the corner (a 72px hover zone), and it stays up while its panel is open. Only
// its red dot shows the rest of the time, and only while the mode is on, so the
// mode being on is never a surprise.
const PANEL_WIDTH = 288
// The panel opens ABOVE the button, so AnchoredPopover places it from these.
// Measured: the header alone while off, the full set of controls while on.
const PANEL_HEIGHT_OFF = 58
const PANEL_HEIGHT_ON = 246

export default function RecordingControl() {
  const isAdmin = useAuthStore((s) => s.profile?.is_admin === true)
  const active = useRecordingActive()
  const loop = useRecordingStore((s) => s.loop)
  const replaySeconds = useRecordingStore((s) => s.replaySeconds)
  const hiddenBefore = useRecordingStore((s) => s.hiddenBefore)
  const setLoop = useRecordingStore((s) => s.setLoop)
  const setReplaySeconds = useRecordingStore((s) => s.setReplaySeconds)
  const replayFrom = useRecordingStore((s) => s.replayFrom)
  const setReplayFrom = useRecordingStore((s) => s.setReplayFrom)
  const setEnabled = useRecordingStore((s) => s.setEnabled)
  const hideAll = useRecordingStore((s) => s.hideAll)
  const showAll = useRecordingStore((s) => s.showAll)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const close = () => setOpen(false)
  useCloseOnEscape(open, close)

  if (!isAdmin) return null
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
      </button>
      {/* The one live signal, and the one thing here that never fades: a red
          dot for as long as the mode is on, so a glance says a Generate press
          will spend nothing even while the button itself is hidden. It sits
          on the button's top-right corner (the container's 14px padding plus
          the badge's 4px inset), so on hover it reads as the button's badge.
          Static on purpose — nothing animates forever on an idle page. */}
      {active && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-[18px] top-[18px] h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]"
        />
      )}

      <AnchoredPopover
        anchorRef={anchorRef}
        open={open}
        onClose={close}
        width={PANEL_WIDTH}
        estimatedHeight={active ? PANEL_HEIGHT_ON : PANEL_HEIGHT_OFF}
        placement="above"
      >
        <div className="overflow-hidden rounded-2xl border border-ink/10 bg-surface-2 p-4 shadow-xl shadow-black/30">
          {/* The mode's own switch leads the panel: this is where it is turned
              on and off. Everything under it only means something while it's on. */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {active && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
              <span className="text-[13px] font-semibold tracking-tight text-ink-100">Recording Mode</span>
            </div>
            <Switch checked={active} onChange={setEnabled} label="Recording Mode" accent="rose" />
          </div>

          {active && (
            <>
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

              {/* Where replays start: outputs made before this day stay hidden
                  and are skipped, so filming can pick up partway through the
                  history. A native date field is fine here — this panel is an
                  admin tool, like the Announcements scheduler. */}
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-ink-200">Replay From</span>
                  <span className="block text-[11px] text-ink-500">{replayFrom ? 'Skips older days' : 'From the oldest'}</span>
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <input
                    type="date"
                    value={replayFrom ?? ''}
                    onChange={(e) => setReplayFrom(e.target.value || null)}
                    aria-label="Replay From"
                    className="h-8 w-[122px] rounded-full border border-ink/10 bg-transparent px-2.5 text-[12px] font-medium text-ink-200 [color-scheme:dark] focus:outline-none light:[color-scheme:light]"
                  />
                  {replayFrom && (
                    <button
                      type="button"
                      onClick={() => setReplayFrom(null)}
                      title="Replay from the oldest output"
                      aria-label="Clear Replay From"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-ink-500 hover:bg-ink/[0.06] hover:text-ink-200"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </AnchoredPopover>
    </div>
  )
}
