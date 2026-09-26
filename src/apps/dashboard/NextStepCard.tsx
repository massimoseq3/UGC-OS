import type { ElementType } from 'react'
import { Check, ChevronRight, Zap } from 'lucide-react'
import { GlassTile } from '../../components/AppGlassTile'
import { useAppStore } from '../../stores/appStore'
import { BANK_CONFIG, getAppConfig } from '../../utils/constants'
import type { NextStepId, NextStepsDone } from './nextSteps'
import { WIDGET_SHELL, WIDGET_INTERACTIVE, riseStyle } from './widgetStyles'

// First run, in four steps, in the slot above the wall that the connect-key
// banner used to hold alone: key → product → character → script, the order the
// production line actually needs them. The banner said "do this one thing" and
// went quiet the moment the key landed, which left a new member on a wall of
// zeros with no idea the next move was the Bank. Each step is a button that
// goes straight there; a done step shows a check and recedes, the first undone
// one is the one that reads as pressable, and the whole card goes when all four
// are done (`useNextSteps` returns null).
//
// Same glass as the widgets and the same HEIGHT as the banner it replaced
// (62px): the wall's short-window logo cut-off and the fits-on-a-laptop
// measurements in CLAUDE.md were taken with the banner's height, and a taller
// card would push the wall's second row under the dock. So from `lg` it is one
// row of four, and below it — where four don't fit on one line and a second
// line costs the phone wall its last row — it is the banner again, naming only
// the next step. Nothing on it moves; the rise is the wall's own entrance.

interface StepDef {
  id: NextStepId
  label: string
  icon: ElementType
  accent: string
}

// kie.ai's gold, the mark the key guide itself opens with.
const KIE_GOLD = '#F2B231'

// Each step wears the dock tile (or bank glyph) of where it takes you, so the
// member meets the same mark again when they get there.
const STEPS: StepDef[] = [
  { id: 'key', label: 'Connect Your Key', icon: Zap, accent: KIE_GOLD },
  { id: 'product', label: 'Add Your Product', icon: BANK_CONFIG.products.icon, accent: BANK_CONFIG.products.accent },
  {
    id: 'character',
    label: 'Generate Your Character',
    icon: getAppConfig('character-studio')?.icon ?? BANK_CONFIG.models.icon,
    accent: getAppConfig('character-studio')?.accent ?? BANK_CONFIG.models.accent,
  },
  {
    id: 'script',
    label: 'Write Your Script',
    icon: getAppConfig('script-architect')?.icon ?? BANK_CONFIG.scripts.icon,
    accent: getAppConfig('script-architect')?.accent ?? BANK_CONFIG.scripts.accent,
  },
]

export default function NextStepCard({ done }: { done: NextStepsDone }) {
  const openKeyGuide = useAppStore((s) => s.openKeyGuide)
  const openApp = useAppStore((s) => s.openApp)
  const sendToApp = useAppStore((s) => s.sendToApp)

  const run = (id: NextStepId) => {
    if (id === 'key') {
      openKeyGuide()
    } else if (id === 'product') {
      // Straight into a blank product form, the way BankPicker's "Add New"
      // gets there — the Products grid would only be one more click to find it.
      sendToApp({ targetApp: 'finder', targetField: 'openCreate', data: 'products' })
      openApp('finder')
    } else {
      openApp(id === 'character' ? 'character-studio' : 'script-architect')
    }
  }

  const nextIndex = STEPS.findIndex((s) => !done[s.id])
  const next = STEPS[nextIndex]
  if (!next) return null

  return (
    <section aria-label="Next steps" style={riseStyle(0)} className={`widget-rise ${WIDGET_SHELL}`}>
      {/* Below `lg`: the banner shape, the next step only. */}
      <button
        type="button"
        onClick={() => run(next.id)}
        className={`group flex w-full items-center gap-3 rounded-[25px] px-3.5 py-3 text-left lg:hidden ${WIDGET_INTERACTIVE}`}
      >
        <GlassTile icon={next.icon} accent={next.accent} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold tracking-tight text-ink-100">{next.label}</span>
          <span className="block truncate text-[12px] text-ink-500">
            Step {nextIndex + 1} of {STEPS.length}
          </span>
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-ink-600 transition-colors group-hover:text-ink-300"
          strokeWidth={2}
        />
      </button>

      {/* From `lg`: all four in a row, in the order they're done in. */}
      <ol className="hidden grid-cols-4 gap-1.5 p-1.5 lg:grid">
        {STEPS.map((step, i) => (
          <li key={step.id} className="min-w-0">
            <StepCell
              step={step}
              index={i}
              state={done[step.id] ? 'done' : i === nextIndex ? 'next' : 'later'}
              onRun={() => run(step.id)}
            />
          </li>
        ))}
      </ol>
    </section>
  )
}

function StepCell({
  step,
  index,
  state,
  onRun,
}: {
  step: StepDef
  index: number
  state: 'done' | 'next' | 'later'
  onRun: () => void
}) {
  const body = (
    <>
      {state === 'done' ? (
        // Same footprint as the tile it replaces, so ticking a step off never
        // shifts its label.
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-dashboard-500/15">
          <Check className="h-3.5 w-3.5 text-dashboard-400" strokeWidth={3} />
        </span>
      ) : (
        <span className={`shrink-0 transition-opacity ${state === 'later' ? 'opacity-50 group-hover:opacity-100' : ''}`}>
          <GlassTile icon={step.icon} accent={step.accent} size={28} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13px] tracking-tight ${
            state === 'next' ? 'font-semibold text-ink-100' : state === 'later' ? 'font-medium text-ink-300' : 'font-medium text-ink-500'
          }`}
        >
          {step.label}
        </span>
        <span className="block truncate text-[11px] text-ink-500">
          {state === 'done' ? 'Done' : state === 'next' ? 'Next step' : `Step ${index + 1}`}
        </span>
      </span>
      {state === 'next' && <ChevronRight className="h-4 w-4 shrink-0 text-ink-400 transition-colors group-hover:text-ink-200" strokeWidth={2} />}
    </>
  )

  const cell = 'flex h-12 w-full items-center gap-2.5 rounded-[20px] px-2.5 text-left'

  // A done step is a record, not a control: its button would only reopen a
  // flow the member has already finished (the key guide would ask for the key
  // they just saved).
  if (state === 'done') return <div className={cell}>{body}</div>

  return (
    <button
      type="button"
      onClick={onRun}
      className={`group ${cell} transition-colors ${
        state === 'next' ? 'bg-ink/[0.05] ring-1 ring-inset ring-ink/10 hover:bg-ink/[0.08]' : 'hover:bg-ink/[0.04]'
      }`}
    >
      {body}
    </button>
  )
}
