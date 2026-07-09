import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { getAppConfig } from '../utils/constants'
import { TEAM } from '../utils/team'
import CrabSprite from './CrabSprite'

// "Meet the team" onboarding — frames the dock apps as a production crew,
// one crab per role. Auto-opens once per browser (appStore.teamIntroOpen),
// reopenable from the empty desktop. Clicking a card visits that teammate's
// desk (opens the app) and dismisses the intro.

// The setup steps in the "fuel" row — the crew is useless without a kie.ai
// key, so the intro doubles as the get-started checklist. One short line
// each; the row must not push the modal into scrolling.
const FUEL_STEPS = [
  {
    body: (
      <>
        Grab your API key at{' '}
        <a
          href="https://kie.ai/api-key"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-ink-200 underline decoration-ink/30 underline-offset-2 hover:text-ink-100"
        >
          kie.ai
        </a>
      </>
    ),
  },
  {
    body: <>Paste it in Settings (the gear in the dock) and Save</>,
  },
  {
    body: (
      <>
        Top up anytime via{' '}
        <a
          href="https://kie.ai/billing"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-ink-200 underline decoration-ink/30 underline-offset-2 hover:text-ink-100"
        >
          Get Credits
        </a>{' '}
        in the menu bar
      </>
    ),
  },
]

export default function MeetTheTeam() {
  const open = useAppStore((s) => s.teamIntroOpen)
  const close = useAppStore((s) => s.closeTeamIntro)
  const openApp = useAppStore((s) => s.openApp)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  const visit = (appId: string) => {
    close()
    openApp(appId)
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-ink/10 bg-surface-1 p-5 shadow-2xl sm:p-6"
      >
        <button
          onClick={close}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-ink-500 transition-colors hover:bg-ink/[0.06] hover:text-ink-200"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>

        <div className="mb-4 text-center">
          <CrabSprite variant="plain" className="mx-auto mb-2 h-9 w-12" />
          <h2 className="text-2xl font-bold tracking-tight text-ink-100">
            Meet your{' '}
            <span
              className="font-normal italic"
              style={{ fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }}
            >
              Team
            </span>
          </h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-snug text-ink-500">
            Seven specialists, one studio. They share the same banks and pass
            work to each other, so you don't have to.
          </p>
        </div>

        {/* gap-2.5: four 10.75rem cards + gaps must fit the max-w-3xl content
            box, or the grid drops to an ugly 3+3+1. */}
        <div className="flex flex-wrap justify-center gap-2.5">
          {TEAM.map((member) => {
            const app = getAppConfig(member.appId)
            if (!app) return null
            return (
              <button
                key={member.appId}
                onClick={() => visit(member.appId)}
                title={`Open ${app.name}`}
                className="group flex w-[10.25rem] flex-col items-center rounded-2xl border border-ink/5 bg-ink/[0.03] px-3 pb-3 pt-2.5 text-center transition-colors duration-200 hover:border-ink/10 hover:bg-ink/[0.06]"
              >
                <span
                  className="mb-2 flex h-16 w-full items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${app.accent}1F` }}
                >
                  <CrabSprite
                    variant={member.appId}
                    className="h-11 w-[3.75rem] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-0.5"
                  />
                </span>
                {/* whitespace-nowrap: "Sebastian · Creative Director" must
                    hold one line — a wrapped name line looks broken. */}
                <span
                  className="whitespace-nowrap text-[10px] font-semibold tracking-tight"
                  style={{ color: member.roleColor ?? app.accent }}
                >
                  {member.name} · {member.role}
                </span>
                <span className="mt-0.5 text-[13px] font-semibold tracking-tight text-ink-100">
                  {app.name}
                </span>
                <span className="mt-0.5 text-[11px] leading-snug text-ink-500">
                  {member.blurb}
                </span>
              </button>
            )
          })}
        </div>

        {/* The fuel row — the crew works for kie.ai credits; no credits, no
            output. Kept to one compact horizontal strip so the modal never
            needs scrolling. */}
        <div className="mt-4 flex items-center gap-4 rounded-2xl border border-ink/5 bg-ink/[0.03] px-4 py-3">
          <span className="flex h-14 w-[4.5rem] shrink-0 items-center justify-center rounded-xl bg-amber-400/10">
            <CrabSprite variant="kie" className="h-10 w-[3.4rem]" />
          </span>
          <div className="min-w-0">
            <span className="text-[12px] font-semibold tracking-tight text-ink-100">
              kie.ai credits keep your team fed
            </span>
            <ol className="mt-1 flex flex-col gap-x-4 gap-y-1 md:flex-row">
              {FUEL_STEPS.map((step, i) => (
                <li key={i} className="flex items-center gap-1.5 text-[11px] leading-snug text-ink-500">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink/[0.07] text-[9px] font-semibold text-ink-300 ring-1 ring-inset ring-ink/10">
                    {i + 1}
                  </span>
                  <span>{step.body}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-4 flex justify-center">
          <button
            onClick={close}
            className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink-100"
          >
            Let's get to work
          </button>
        </div>
      </div>
    </div>
  )
}
