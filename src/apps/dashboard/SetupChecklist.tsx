import { useState } from 'react'
import { Check, ArrowUpRight, KeyRound, Package, UserRound } from 'lucide-react'
import type { ElementType } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useBankStore } from '../../stores/bankStore'
import { useAppStore } from '../../stores/appStore'
import SettingsModal from '../../components/SettingsModal'

// First-run checklist — what the Dashboard shows instead of all-zero metrics.
// Three steps to a first generation; each row checks itself off from live
// store state and deep-links to where the step happens. The moment anything
// generates, the usage ledger gets its first row and Dashboard swaps this out
// for the real metrics grid (see `hasActivity` in Dashboard.tsx).

interface Step {
  done: boolean
  icon: ElementType
  title: string
  sub: string
  onClick: () => void
}

export default function SetupChecklist() {
  const kieApiKey = useSettingsStore((s) => s.kieApiKey)
  const products = useBankStore((s) => s.products)
  const models = useBankStore((s) => s.models)
  const characterHistory = useBankStore((s) => s.characterHistory)
  const openApp = useAppStore((s) => s.openApp)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const steps: Step[] = [
    {
      done: kieApiKey.trim().length > 0,
      icon: KeyRound,
      title: 'Connect your kie.ai API key',
      sub: 'Every generation runs through your own kie.ai account — nothing works without it.',
      onClick: () => setSettingsOpen(true),
    },
    {
      done: products.length > 0,
      icon: Package,
      title: 'Add your product to the Bank',
      sub: 'Name, benefits, pain points — every app reuses it, so you only fill it in once.',
      onClick: () => openApp('finder'),
    },
    {
      done: models.length > 0 || characterHistory.length > 0,
      icon: UserRound,
      title: 'Create your first character',
      sub: 'A consistent face for your ads — and your first generation, which starts your savings counter.',
      onClick: () => openApp('character-studio'),
    },
  ]
  const doneCount = steps.filter((s) => s.done).length

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-400">Get set up</span>
        <p className="text-[12px] text-ink-500">{doneCount} of {steps.length} done</p>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {steps.map((step) => {
          const Icon = step.icon
          return (
            <button
              key={step.title}
              onClick={step.onClick}
              className={`group flex items-center gap-3.5 rounded-2xl border border-ink/10 px-4 py-3.5 text-left transition-colors hover:border-ink/20 hover:bg-ink/[0.04] ${
                step.done ? 'opacity-60' : ''
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  step.done ? 'bg-dashboard-500/15' : 'bg-ink/[0.05]'
                }`}
              >
                {step.done ? (
                  <Check className="h-4 w-4 text-dashboard-400" strokeWidth={2.25} />
                ) : (
                  <Icon className="h-4 w-4 text-ink-300" strokeWidth={1.75} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold tracking-tight text-ink-100">{step.title}</span>
                <span className="block text-[12px] leading-snug text-ink-500">{step.sub}</span>
              </span>
              {!step.done && (
                <ArrowUpRight
                  className="h-4 w-4 shrink-0 text-ink-600 transition-colors group-hover:text-ink-300"
                  strokeWidth={2}
                />
              )}
            </button>
          )
        })}
      </div>

      <p className="mt-4 text-[12px] text-ink-500">
        From there it's automatic — every script, image, voiceover, and video counts toward your
        time and money saved.
      </p>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
