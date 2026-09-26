import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, Check, X } from 'lucide-react'
import Spinner from '../../components/Spinner'
import type { AutosaveState } from './useBankAutosave'

// The chrome every Bank form shares now that they all save themselves: what
// the autosave is doing, the ✕, the Done button, and the line under a required
// field that says why nothing is being saved. Products has its own footer bar
// (`ProductFormFooter`) but draws its status with the same `AutosaveStatus`.

/** "Saving…" / "Saved" — or, while a required field blocks the write, the honest "Not saved yet". */
export function AutosaveStatus({ state, blocked = false }: { state: AutosaveState; blocked?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-ink-500">
      {blocked ? (
        'Not saved yet'
      ) : state === 'saving' ? (
        <><Spinner className="h-3 w-3" />Saving…</>
      ) : state === 'saved' ? (
        <><Check className="h-3 w-3" />Saved</>
      ) : null}
    </span>
  )
}

/**
 * The line under an empty required field. It says so where the member is
 * looking, rather than in a toast or only as a grey button: a form that
 * autosaves and then quietly doesn't is worse than one with a Save button.
 */
export function RequiredNote({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null
  return (
    <p className="flex items-center gap-1.5 px-1 text-[11px] leading-snug text-red-300 light:text-red-700">
      <AlertCircle className="h-3 w-3 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

// How long the ✕ stays armed — TileDeleteButton's window, so the two
// two-click controls in the Bank keep one rhythm.
const DISCARD_WINDOW_MS = 3000

/**
 * The form's ✕. Everything is saved as it's typed, so ordinarily it just
 * closes. The one case where closing would lose work is a form holding changes
 * a required field is blocking — and there it asks twice, the TileDeleteButton
 * way: the first press shows what's missing (`onBlocked`) and arms, the second
 * within three seconds discards (`onDiscard`, which also tells the saver not to
 * offer the draft back). One circle at both sizes, so arming never shifts the
 * header.
 */
export function FormCloseButton({
  onClose,
  onDiscard,
  wouldDiscard,
  onBlocked,
  className = '',
}: {
  onClose: () => void
  onDiscard: () => void
  wouldDiscard: boolean
  onBlocked: () => void
  className?: string
}) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  const isArmed = armed && wouldDiscard
  return (
    <button
      type="button"
      onClick={() => {
        if (!wouldDiscard) {
          onClose()
          return
        }
        if (isArmed) {
          onDiscard()
          return
        }
        onBlocked()
        setArmed(true)
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => { setArmed(false); timer.current = null }, DISCARD_WINDOW_MS)
      }}
      title={isArmed ? 'Click again to discard these changes' : wouldDiscard ? 'Close · this isn’t saved yet' : 'Close · everything is already saved'}
      aria-label={isArmed ? 'Discard changes' : 'Close'}
      className={`-m-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
        isArmed ? 'bg-red-500 text-white hover:brightness-110' : 'text-ink-500 hover:text-ink-300'
      } ${className}`}
    >
      <X className="h-4 w-4" />
    </button>
  )
}

/**
 * The form's primary action. The row is already saved, so it is always Done —
 * except while a required field is empty, when it names what's missing the way
 * a Generate button does ("Name This Style"), and pressing it takes the member
 * to that field instead of closing.
 */
export function DoneButton({
  blocker,
  onDone,
  onBlocked,
  className = '',
}: {
  blocker: string | null
  onDone: () => void
  onBlocked: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={blocker ? onBlocked : onDone}
      className={`flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
        blocker
          ? 'bg-ink/[0.08] text-ink-300 hover:bg-ink/[0.12]'
          : 'bg-ink text-ink-900 hover:bg-ink-100'
      } ${className}`}
    >
      {blocker ?? 'Done'}
    </button>
  )
}
