import { useEffect, useState } from 'react'
import { Check, Info, AlertTriangle, X } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import type { Toast as ToastType } from '../stores/appStore'

const ICON_MAP = {
  success: Check,
  info: Info,
  error: AlertTriangle,
}

const ICON_STYLE_MAP = {
  success: 'text-emerald-400 light:text-emerald-600',
  info: 'text-blue-400 light:text-blue-600',
  error: 'text-red-400 light:text-red-600',
}

// How long a toast holds before it starts fading. A success is a status blip,
// but an error carries text worth reading and often worth copying (raw kie/R2
// messages, storage caps) — 3s wasn't enough to finish reading one, let alone
// select it. Hovering pauses the countdown so a long message can't escape
// mid-copy.
const LINGER_MS = {
  success: 3000,
  info: 3000,
  error: 10000,
}

// Matches the transition duration below, so the fade finishes exactly as the
// toast unmounts.
const EXIT_MS = 200

function ToastItem({ toast }: { toast: ToastType }) {
  const [visible, setVisible] = useState(false)
  const [paused, setPaused] = useState(false)
  const removeToast = useAppStore((s) => s.removeToast)
  const type = toast.type ?? 'success'
  const Icon = ICON_MAP[type]
  const isError = type === 'error'

  useEffect(() => {
    // Trigger enter animation on next frame
    const enterFrame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(enterFrame)
  }, [])

  useEffect(() => {
    // Re-runs on unpause, which restarts the full linger — a toast the user
    // just finished reading shouldn't vanish the instant they look away.
    if (paused) return
    const linger = LINGER_MS[type]
    const fadeTimer = setTimeout(() => setVisible(false), linger - EXIT_MS)
    const removeTimer = setTimeout(() => removeToast(toast.id), linger)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(removeTimer)
    }
  }, [paused, type, removeToast, toast.id])

  const handleDismiss = () => {
    setVisible(false)
    setTimeout(() => removeToast(toast.id), EXIT_MS)
  }

  const handlePause = () => {
    setPaused(true)
    setVisible(true) // Restore opacity if the hover landed mid-fade.
  }

  // Compact neutral pill — the type only tints the icon, so a toast reads as
  // a quiet status blip rather than a colored banner. Errors take the wider
  // wrapping variant: truncating a message at 260px hid the part that says
  // what actually went wrong, and there was no way to copy it out.
  return (
    <div
      onMouseEnter={handlePause}
      onMouseLeave={() => setPaused(false)}
      className={`flex gap-2 self-end border border-ink/10 bg-surface-2/90 shadow-lg backdrop-blur-xl transition-all duration-200 ease-out ${
        isError
          ? 'max-w-[360px] items-start rounded-2xl py-2 pl-3 pr-1.5'
          : 'items-center rounded-full py-1.5 pl-3 pr-1.5'
      } ${
        visible
          ? 'translate-y-0 opacity-100'
          : '-translate-y-2 opacity-0'
      }`}
    >
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${isError ? 'mt-[3px]' : ''} ${ICON_STYLE_MAP[type]}`}
        strokeWidth={2}
      />
      <span
        className={`text-[12px] font-medium text-ink-300 ${
          isError
            // min-w-0 lets break-words act on the flex child — R2/kie errors
            // embed long unbroken hostnames that would otherwise overflow.
            ? 'min-w-0 flex-1 select-text whitespace-pre-wrap break-words'
            : 'max-w-[260px] truncate'
        }`}
        title={isError ? undefined : toast.message}
      >
        {toast.message}
      </span>
      <button
        onClick={handleDismiss}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-ink/[0.06] hover:text-ink-300"
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

export default function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div className="fixed right-4 top-4 z-[100] flex flex-col items-end gap-1.5">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
