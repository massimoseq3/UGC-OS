import { useEffect, useState } from 'react'
import { Check, Info, AlertTriangle, X } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import type { Toast as ToastType } from '../stores/appStore'

const ICON_MAP = {
  success: Check,
  info: Info,
  error: AlertTriangle,
}

const STYLE_MAP = {
  success: 'border-emerald-500/20 bg-emerald-500/5',
  info: 'border-blue-500/20 bg-blue-500/5',
  error: 'border-red-500/20 bg-red-500/5',
}

const ICON_STYLE_MAP = {
  success: 'text-emerald-400',
  info: 'text-blue-400',
  error: 'text-red-400',
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

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-xl transition-all duration-200 ease-out ${STYLE_MAP[type]} ${
        visible
          ? 'translate-x-0 opacity-100'
          : 'translate-x-8 opacity-0'
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${ICON_STYLE_MAP[type]}`} strokeWidth={2} />
      <span className="text-sm font-medium text-zinc-200">{toast.message}</span>
      <button
        onClick={handleDismiss}
        className="ml-2 shrink-0 rounded-md p-2 lg:p-0.5 text-zinc-600 transition-colors hover:text-zinc-400"
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
    <div className="fixed top-14 lg:top-12 right-4 left-4 lg:left-auto z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
