import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import SettingsModal from '../../components/SettingsModal'
import { ApiKeyGuide } from '../../components/MenuBar'

// The first step: a slim neutral to-do row pinned above the metrics until a
// kie.ai key is saved (nothing can generate without one). Styled as chrome, not
// an error — an amber tick ties it to the kie.ai brand. Clicking opens the same
// ApiKeyGuide as the menu bar alert, which hands off to Settings for the paste +
// test. Dashboard owns the show/hide (it watches kieApiKey), so the row vanishes
// the moment the key lands.

export default function ConnectKeyCard() {
  const [guideOpen, setGuideOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setGuideOpen(true)}
        className="group col-span-2 flex items-center gap-3 rounded-2xl border border-ink/10 bg-surface-1/60 px-4 py-3 text-left shadow-lg shadow-black/20 transition-colors hover:border-ink/20 hover:bg-ink/[0.04] light:shadow-black/[0.08] md:col-span-12"
      >
        {/* Unchecked to-do circle — the checklist affordance */}
        <span className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-amber-400/70 light:border-amber-500/70" />
        <span className="min-w-0 flex-1">
          <span className="text-[14px] font-semibold tracking-tight text-ink-100">
            Connect your kie.ai API key to get started
          </span>
          <span className="ml-2 hidden text-[12px] text-ink-500 md:inline">
            every generation runs through your own kie.ai account
          </span>
        </span>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-ink-500 transition-colors group-hover:text-ink-300"
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
