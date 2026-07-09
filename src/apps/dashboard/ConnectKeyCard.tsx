import { useState } from 'react'
import { ArrowUpRight, KeyRound } from 'lucide-react'
import SettingsModal from '../../components/SettingsModal'

// "Get set up" card — a single connect-your-key step shown above the metrics
// grid until a kie.ai key is saved (nothing can generate without one). Clicking
// opens the Settings modal on the key field; the card removes itself the
// moment the key lands. Dashboard owns the show/hide (it watches kieApiKey).

export default function ConnectKeyCard() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <>
      <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-400">Get set up</span>
      <button
        onClick={() => setSettingsOpen(true)}
        className="group mt-3 flex w-full items-center gap-3.5 rounded-2xl border border-ink/10 px-4 py-3.5 text-left transition-colors hover:border-ink/20 hover:bg-ink/[0.04]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/[0.05]">
          <KeyRound className="h-4 w-4 text-ink-300" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold tracking-tight text-ink-100">Connect your kie.ai API key</span>
          <span className="block text-[12px] leading-snug text-ink-500">
            Every generation runs through your own kie.ai account, nothing works without it.
          </span>
        </span>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-ink-600 transition-colors group-hover:text-ink-300"
          strokeWidth={2}
        />
      </button>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
