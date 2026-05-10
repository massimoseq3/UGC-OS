import { useState, useRef, useEffect } from 'react'
import { LogOut, User } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

interface UserMenuProps {
  collapsed: boolean
}

// Sidebar account chip. The pill itself never shows the email — that lives
// behind a click-to-open dropdown so users (and screenshots) don't leak it
// at a glance. Sign-out is also in here for quick access from the sidebar.
export default function UserMenu({ collapsed }: UserMenuProps) {
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!profile) return null

  const initial = (profile.email[0] || '?').toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center rounded-lg transition-colors hover:bg-white/[0.04] ${
          collapsed ? 'flex-col gap-1 px-1 py-2' : 'gap-3 px-3 py-2'
        }`}
        title="My account"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-500 text-[12px] font-semibold text-white">
          {initial}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-left text-[12px] text-zinc-300">
            My account
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute z-50 ${collapsed ? 'bottom-full left-1/2 mb-2 -translate-x-1/2' : 'bottom-full left-0 mb-2'} w-56 rounded-lg border border-white/10 bg-[#0a0a0a] p-1 shadow-xl`}>
          <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5">
            <User className="h-3.5 w-3.5 text-zinc-500" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Signed in as</div>
              <div className="truncate text-[12px] font-medium text-zinc-200">{profile.email}</div>
            </div>
          </div>
          <button
            onClick={() => { setOpen(false); signOut() }}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[12px] text-zinc-300 transition-colors hover:bg-white/[0.06]"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
