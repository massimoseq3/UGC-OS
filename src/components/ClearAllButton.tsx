import { useState } from 'react'
import { X } from 'lucide-react'

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
        className={`flex items-center gap-1 rounded-full bg-ink/[0.03] px-2 py-0.5 text-[10px] text-ink-500 transition-colors hover:bg-ink/[0.06] hover:text-ink-300 ${className}`}
      >
        <X className="h-2.5 w-2.5" strokeWidth={2.5} />
        Clear
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl border border-ink/10 bg-surface-2 p-5 shadow-2xl"
          >
            <div className="flex flex-col items-center gap-1.5 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink/10 text-ink-200">
                <X className="h-6 w-6" strokeWidth={2} />
              </div>
              <p className="mt-1 text-sm font-semibold tracking-tight text-ink-100">Clear Inputs?</p>
              <p className="text-xs leading-relaxed text-ink-400">{confirmBody}</p>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-full border border-ink/10 py-2 text-xs font-medium text-ink-300 transition-colors hover:bg-ink/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { onClear(); setOpen(false) }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink/15 py-2 text-xs font-semibold text-ink-100 transition-colors hover:bg-ink/25"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                Clear Inputs
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
