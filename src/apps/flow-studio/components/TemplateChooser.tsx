import { ArrowRight, Workflow } from 'lucide-react'
import { TEMPLATES } from '../templates'
import { useFlowStore } from '../stores/flowStore'

// Shown instead of a blank canvas: pick a recipe and the pipeline appears
// pre-wired, ready to fill in left-to-right. "Start from scratch" is the
// power-user escape hatch into the empty canvas + palette.
export default function TemplateChooser() {
  const applyTemplate = useFlowStore((s) => s.applyTemplate)
  const setScratch = useFlowStore((s) => s.setScratch)

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-flows-500/15">
            <Workflow className="h-6 w-6 text-flows-400" strokeWidth={1.75} />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink-100">What are we making?</h1>
          <p className="mt-1 text-sm text-ink-500">
            Pick a recipe — the steps come pre-connected, you just fill them in and hit Run.
          </p>
        </div>

        <div className="space-y-3">
          {TEMPLATES.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => applyTemplate(t.id)}
                className="group flex w-full items-center gap-4 rounded-2xl border border-ink/10 bg-surface-1 p-4 text-left shadow-lg shadow-black/5 transition-all duration-200 hover:border-flows-500/40 hover:bg-surface-2"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-flows-500/15">
                  <Icon className="h-5 w-5 text-flows-400" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium tracking-tight text-ink-100">{t.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{t.description}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-1.5">
                    {t.steps.map((step, i) => (
                      <span key={step} className="flex items-center gap-1.5">
                        {i > 0 && <ArrowRight className="h-3 w-3 text-ink-600" />}
                        <span className="rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-[10px] text-ink-400">
                          {step}
                        </span>
                      </span>
                    ))}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-600 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-flows-400" />
              </button>
            )
          })}
        </div>

        <div className="mt-5 text-center">
          <button
            onClick={() => setScratch(true)}
            className="rounded-full px-4 py-2 text-xs text-ink-500 transition-colors duration-150 hover:bg-ink/5 hover:text-ink-200"
          >
            Start from scratch instead
          </button>
        </div>
      </div>
    </div>
  )
}
