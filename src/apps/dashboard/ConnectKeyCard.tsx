import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import SettingsModal from '../../components/SettingsModal'
import { ApiKeyGuide } from '../../components/MenuBar'

// The unmissable first step: a slim red to-do row pinned above the metrics
// until a kie.ai key is saved (nothing can generate without one). Clicking
// opens the same 4-step ApiKeyGuide as the menu bar's red alert, which hands
// off to Settings for the paste + test. Dashboard owns the show/hide (it
// watches kieApiKey), so the row vanishes the moment the key lands.

export default function ConnectKeyCard() {
  const [guideOpen, setGuideOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setGuideOpen(true)}
        className="group col-span-2 flex items-center gap-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-left shadow-lg shadow-black/20 transition-colors hover:bg-red-500/15 light:shadow-black/[0.08] md:col-span-12"
      >
        {/* Unchecked to-do circle — the checklist affordance */}
        <span className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-red-400/80 light:border-red-600/80" />
        <span className="min-w-0 flex-1">
          <span className="text-[14px] font-semibold tracking-tight text-red-300 light:text-red-700">
            Connect your kie.ai API key to get started
          </span>
          <span className="ml-2 hidden text-[12px] text-red-300/70 light:text-red-700/70 md:inline">
            every generation runs through your own kie.ai account
          </span>
        </span>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-red-400/70 transition-colors group-hover:text-red-300 light:text-red-600/70 light:group-hover:text-red-700"
          strokeWidth={2}
        />
      </button>

      {guideOpen && (
        <ApiKeyGuide
          onClose={() => setGuideOpen(false)}
          onOpenSettings={() => {
            setGuideOpen(false)
            setSettingsOpen(true)
          }}
        />
      )}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
