import { useState, useCallback, useRef } from 'react'
import type { ElementType } from 'react'
import type { BankType } from '../utils/constants'
import { useIsDesktop } from '../hooks/useBreakpoint'

interface DesktopFolderProps {
  icon: ElementType
  label: string
  count: number
  bankType: BankType
  accent?: string
  onDoubleClick: (bankType: BankType) => void
}

export default function DesktopFolder({ icon: Icon, label, count, bankType, accent, onDoubleClick }: DesktopFolderProps) {
  const [selected, setSelected] = useState(false)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDesktop = useIsDesktop()

  const handleClick = useCallback(() => {
    // Single tap on mobile — double-tap is unusable on touch
    if (!isDesktop) {
      onDoubleClick(bankType)
      return
    }
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      onDoubleClick(bankType)
      return
    }
    setSelected(true)
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
    }, 300)
  }, [bankType, onDoubleClick, isDesktop])

  const handleBlur = useCallback(() => setSelected(false), [])

  return (
    <button
      onClick={handleClick}
      onBlur={handleBlur}
      className={`group flex w-[90px] flex-col items-center gap-1.5 rounded-lg p-2 transition-all duration-150 outline-none ${selected
          ? 'bg-white/10 ring-1 ring-blue-500/60'
          : 'hover:bg-white/5'
        }`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] shadow-lg ring-1 ring-white/10 transition-transform duration-150 group-hover:scale-105">
        <Icon className="h-7 w-7 text-sky-400 drop-shadow-md" strokeWidth={1.5} />
      </div>
      <span className="text-[11px] font-medium tracking-tight text-zinc-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
        {label}
      </span>
      <span className={`flex h-4 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-medium tabular-nums ${count > 0
          ? 'bg-white/10 text-zinc-400'
          : 'bg-white/[0.04] text-zinc-700'
        }`}>
        {count}
      </span>
    </button>
  )
}
