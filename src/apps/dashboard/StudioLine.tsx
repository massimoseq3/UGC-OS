import { Fragment } from 'react'
import { ArrowUpRight, ChevronRight, GraduationCap } from 'lucide-react'
import AppGlassTile from '../../components/AppGlassTile'
import { useAppStore } from '../../stores/appStore'
import { useBankStore } from '../../stores/bankStore'
import { useIsAppVisible } from '../../stores/appVisibilityStore'
import { AI_UGC_ACADEMY_URL, APP_REGISTRY, CATEGORY_LABELS, type AppCategory } from '../../utils/constants'
import { WIDGET_SHELL, riseStyle } from './widgetStyles'

// The production line: every app that makes something, in the order the work
// runs — research, then the create line, then the edit. It is the dock's own
// order (SECTION_ORDER) laid out as a pipeline, with what each station has
// already made underneath it, so the landing page answers "where was I?" as
// well as "what have I saved?". Each station opens its app.

const LINE: AppCategory[] = ['tools', 'create', 'deliver']

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

export default function StudioLine({ index }: { index: number }) {
  const openApp = useAppStore((s) => s.openApp)
  const isVisible = useIsAppVisible()
  const swipes = useBankStore((s) => s.swipes.length)
  const analyses = useBankStore((s) => s.adAnatomyHistory.length)
  const characters = useBankStore((s) => s.models.length)
  const scripts = useBankStore((s) => s.scriptHistory.length)
  const voiceovers = useBankStore((s) => s.voiceHistory.length)
  const storyboards = useBankStore((s) => s.brollHistory.length)
  const playground = useBankStore((s) => s.imageHistory.length + s.videoHistory.length + s.musicHistory.length)

  const tally: Record<string, string> = {
    discover: plural(swipes, 'saved ad'),
    'ad-anatomy': plural(analyses, 'analysis', 'analyses'),
    'character-studio': plural(characters, 'character'),
    'script-architect': plural(scripts, 'script'),
    'voice-studio': plural(voiceovers, 'voiceover'),
    'broll-studio': plural(storyboards, 'storyboard'),
    playground: plural(playground, 'generation'),
    'edit-studio': 'Claude skill',
  }

  const groups = LINE.map((category) => ({
    category,
    apps: APP_REGISTRY.filter((a) => a.category === category && isVisible(a.id)),
  })).filter((g) => g.apps.length > 0)

  return (
    <section className={`widget-rise relative ${WIDGET_SHELL} px-5 pb-5 pt-4`} style={riseStyle(index)}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.07em] text-ink-300">Production Line</h2>
        <div className="flex items-center gap-3">
          <p className="hidden text-[12px] text-ink-500 md:block">From a winning ad to a finished one, left to right.</p>
          <a
            href={AI_UGC_ACADEMY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ink/10 px-2.5 py-1 text-[11px] font-medium text-ink-300 transition-colors hover:border-ink/20 hover:text-ink-100"
          >
            <GraduationCap className="h-3.5 w-3.5" strokeWidth={1.75} />
            Learn the Line
            <ArrowUpRight className="h-3 w-3 text-ink-500" strokeWidth={2} />
          </a>
        </div>
      </div>

      {/* One row on a desktop; a wrapping grid below `lg`, where eight
          stations can't share a line. The connector chevrons only draw on the
          row version — in a wrapped grid they would point at nothing. */}
      <div className="mt-4 grid grid-cols-4 gap-y-5 sm:grid-cols-4 lg:flex lg:items-start lg:justify-between lg:gap-0">
        {groups.map((group, gi) => (
          <Fragment key={group.category}>
            {gi > 0 && <span aria-hidden className="mt-7 hidden h-10 w-px shrink-0 bg-ink/10 lg:block" />}
            {/* Each group grows by how many stations it holds, so the gap
                between two stations is the same in every group — equal
                shares put Research's pair a third of the row apart and
                squeezed the create line's five together. */}
            <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:items-stretch" style={{ flex: `${group.apps.length} 1 0%` }}>
              <span className="hidden pb-3 text-center text-[10px] font-medium uppercase tracking-[0.12em] text-ink-600 lg:block">
                {CATEGORY_LABELS[group.category] === 'Tools' ? 'Research' : CATEGORY_LABELS[group.category]}
              </span>
              <div className="contents lg:flex lg:items-start lg:justify-evenly">
                {group.apps.map((app, ai) => (
                  <Fragment key={app.id}>
                    {ai > 0 && (
                      <ChevronRight aria-hidden className="mt-4 hidden h-4 w-4 shrink-0 text-ink-700 lg:block" strokeWidth={2} />
                    )}
                    <button
                      type="button"
                      onClick={() => openApp(app.id)}
                      className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl px-0.5 py-1 text-center transition-colors hover:bg-ink/[0.04] sm:px-2"
                    >
                      <span className="sm:hidden"><AppGlassTile app={app} size={44} /></span>
                      <span className="hidden sm:block"><AppGlassTile app={app} size={52} /></span>
                      {/* A quarter of a phone is ~77px: the name steps down
                          and the button gives up its side padding so
                          "Playground" fits whole there, and the tally (a second
                          line nobody can read at that size) waits for `sm`. */}
                      <span className="max-w-full truncate text-[11.5px] font-medium tracking-tight text-ink-100 sm:text-[13px]">{app.name}</span>
                      <span className="-mt-1.5 hidden max-w-full truncate text-[11px] text-ink-500 transition-colors group-hover:text-ink-300 sm:block">
                        {tally[app.id]}
                      </span>
                    </button>
                  </Fragment>
                ))}
              </div>
            </div>
          </Fragment>
        ))}
      </div>
    </section>
  )
}
