interface ProviderChipProps {
  provider: string
}

export default function ProviderChip({ provider }: ProviderChipProps) {
  return (
    <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-zinc-400 backdrop-blur">
      Powered by <span className="text-zinc-200">{provider}</span>
    </div>
  )
}
