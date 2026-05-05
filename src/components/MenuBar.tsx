import { FlaskConical, Menu } from 'lucide-react'
import { useAppStore } from '../stores/appStore'

export default function MenuBar() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center gap-3 border-b border-white/5 bg-[#09090b]/80 px-3 backdrop-blur-xl select-none">
      <button
        onClick={toggleSidebar}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/[0.06]"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" strokeWidth={1.75} />
      </button>

      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-fuchsia-500 to-orange-500">
          <FlaskConical className="h-4 w-4 text-white" strokeWidth={2} />
        </div>
        <span className="text-[17px] font-semibold tracking-tight text-zinc-100">
          UGC Lab
        </span>
      </div>
    </header>
  )
}
