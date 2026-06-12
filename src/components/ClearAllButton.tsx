import { useState } from 'react'
import { XCircle } from 'lucide-react'

interface ClearAllButtonProps {
  onClear: () => void
  // Confirmation body copy — defaults to the generic inputs message.
  confirmBody?: string
  className?: string
}

// Shared "Clear All" affordance: a subtle underlined gray link that opens a
// confirmation popup before wiping the page's inputs. Used in the top-left of
// every create/tool page so the gesture is consistent across the app.
export default function ClearAllButton({
  onClear,
  confirmBody = 'Are you sure you want to clear all the inputs?',
  className = '',
}: ClearAllButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-[11px] text-zinc-500 underline decoration-zinc-600 underline-offset-2 transition-colors hover:text-zinc-300 hover:decoration-zinc-400 ${className}`}
      >
        Clear All
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl border border-white/10 bg-[#0c0c0e] p-5 shadow-2xl"
          >
            <div className="flex flex-col items-center gap-1.5 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                <XCircle className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <p className="mt-1 text-sm font-semibold tracking-tight text-zinc-100">Clear all?</p>
              <p className="text-xs leading-relaxed text-zinc-400">{confirmBody}</p>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-full border border-white/10 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { onClear(); setOpen(false) }}
                className="flex-1 rounded-full bg-red-500/90 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
