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

function ToastItem({ toast }: { toast: ToastType }) {
  const [visible, setVisible] = useState(false)
  const removeToast = useAppStore((s) => s.removeToast)
  const type = toast.type ?? 'success'
  const Icon = ICON_MAP[type]

  useEffect(() => {
    // Trigger enter animation on next frame
    const enterFrame = requestAnimationFrame(() => setVisible(true))
    // Schedule fade-out, then unmount once the transition completes
    const fadeTimer = setTimeout(() => setVisible(false), 2800)
    const removeTimer = setTimeout(() => removeToast(toast.id), 3000)
    return () => {
      cancelAnimationFrame(enterFrame)
      clearTimeout(fadeTimer)
      clearTimeout(removeTimer)
    }
  }, [removeToast, toast.id])

  const handleDismiss = () => {
    setVisible(false)
    setTimeout(() => removeToast(toast.id), 200)
  }

  // Compact neutral pill — the type only tints the icon, so a toast reads as
  // a quiet status blip rather than a colored banner.
  return (
    <div
      className={`flex items-center gap-2 self-end rounded-full border border-ink/10 bg-surface-2/90 py-1.5 pl-3 pr-1.5 shadow-lg backdrop-blur-xl transition-all duration-200 ease-out ${
        visible
          ? 'translate-y-0 opacity-100'
          : '-translate-y-2 opacity-0'
      }`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${ICON_STYLE_MAP[type]}`} strokeWidth={2} />
      <span className="max-w-[260px] truncate text-[12px] font-medium text-ink-300" title={toast.message}>
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
