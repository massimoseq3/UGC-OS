import { ArrowUpRight, Check } from 'lucide-react'
import AppLogo from '../AppLogo'
import AppBackground from '../AppBackground'
import AppGlassTile from '../AppGlassTile'
import { LegalLinks } from './AuthShell'
import { useIsAppVisible } from '../../stores/appVisibilityStore'
import { AI_UGC_ACADEMY_URL, SKOOL_COMMUNITY_URL, dockOrderedApps } from '../../utils/constants'
import { defaultCaption } from '../../utils/team'

// NO EM DASHES IN THIS SCREEN'S COPY, for the same reason Meet Your Team has
// none: it is the first thing a stranger reads, and it should read like
// someone talking. A comma, a colon or a full stop.
//
// The signed-out landing (September 2026). The sign-in box used to sit alone
// on the wallpaper, which to anyone arriving from a link looked like a door
// with no building behind it. This wraps the SAME box in the pitch from the
// Skool community page: the offer on the left, the box on the right, the crew
// underneath, so a visitor can tell what they are signing in to. Nothing about
// signing in changed; AuthScreen still owns the form and this owns the page.
//
// It is its own shell rather than a mode of AuthShell because the other two
// signed-out screens (password reset, lapsed member) are for people who
// already know what this is, and a pitch around a "choose a new password"
// form would be noise.
//
// Copy is lifted from www.skool.com/ugcos, which is where it is maintained.
// The one thing here that goes stale on its own is the price line, so it is
// a single constant at the top of the file.

const SERIF = { fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }

const PRICE_NOTE = '$69/month · rising to $99 soon'

// The four "You'll Be Able To" lines from the community page, as prose.
const PROMISES = [
  'Create 50+ fully edited AI ads a day for pennies',
  'Keep AI characters realistic and consistent across every ad',
  'Clone any winning ad format for your product: realism, 3D Pixar, claymation, podcast and more',
  'Access the latest AI models for up to 70% off (Seedance 2.5, Gemini Omni, GPT Image 2 and more)',
]

export default function LandingShell({
  subtitle,
  children,
}: {
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="relative flex h-dvh w-screen flex-col overflow-hidden bg-surface-0 text-ink antialiased">
      <AppBackground />

      {/* The workspace's own menu bar, minus everything that needs a session.
          It sits outside the scroller, so it needs no glass: nothing ever
          scrolls underneath it. */}
      <header className="relative z-10 flex h-9 shrink-0 items-center gap-2 border-b border-ink/5 px-3">
        <span className="flex items-center gap-1.5">
          <AppLogo className="h-5 w-5" />
          <span className="whitespace-nowrap text-[13px] font-bold tracking-tight text-ink-100">
            UGC{' '}
            <span className="font-normal italic" style={SERIF}>
              OS
            </span>
          </span>
        </span>
        <div className="flex-1" />
        <TopLink href={SKOOL_COMMUNITY_URL} label="Community" />
        <TopLink href={AI_UGC_ACADEMY_URL} label="Academy" />
      </header>

      {/* One scroller. The hero and the crew each take an auto margin, so on
          a tall window the free space splits evenly around the hero and the
          crew settles toward the foot; on a short one everything just
          scrolls. `m-auto` rather than `justify-center` on the scroller: a
          centred flex child taller than its port clips its TOP with no way to
          scroll to it. */}
      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-6 py-10 sm:px-10 lg:px-16">
          {/* Three pieces, placed twice. DOM order is the PHONE order: the
              headline, then the sign-in box, then the promises and the join
              button, so a member on a phone reaches the box without scrolling
              past the pitch. From `lg` the grid puts the headline and the
              promises in the left column and the box beside them. */}
          <section className="mt-auto grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_384px] lg:items-center lg:gap-x-16 lg:gap-y-8 xl:gap-x-20">
            <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-1 lg:gap-6">
              <span className="inline-flex self-start rounded-full border border-ink/10 bg-ink/5 px-3.5 py-1.5 text-[12px] font-medium text-ink-400">
                Skool Community Members
              </span>
              <h1 className="text-[38px] font-bold leading-[1.02] tracking-[-0.035em] text-ink-100 sm:text-[50px] lg:text-[52px] xl:text-[60px]">
                The system for realistic AI UGC ads,{' '}
                <span className="font-normal italic text-ink" style={SERIF}>
                  at scale
                </span>
              </h1>
              <p className="max-w-[560px] text-[16px] leading-relaxed text-ink-400 lg:text-[18px]">
                Characters, scripts, voiceovers, B-roll and editing in one workspace. Built for ecom store
                owners, agencies, marketers and beginners.
              </p>
            </div>

            <div className="flex w-full max-w-sm flex-col gap-6 justify-self-center lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:justify-self-end">
              {/* The brand header the other signed-out screens carry. On a
                  phone the headline is directly above, so a second logo and
                  wordmark would be the same thing twice; the subtitle steps
                  up to a heading there instead. */}
              <div className="flex flex-col items-center gap-2">
                <AppLogo className="hidden h-12 w-12 lg:block" />
                <div className="space-y-1 text-center">
                  <h2 className="hidden text-2xl font-bold tracking-tight text-ink-100 lg:block">UGC OS</h2>
                  <p className="text-[15px] font-medium text-ink-200 lg:text-sm lg:font-normal lg:text-ink-500">{subtitle}</p>
                </div>
              </div>
              {children}
            </div>

            <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-2">
              <ul className="flex flex-col gap-3">
                {PROMISES.map((line) => (
                  <li key={line} className="flex items-start gap-3 text-[14.5px] leading-snug text-ink-300 lg:text-[15px]">
                    <span className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-dashboard-500/35 bg-dashboard-500/15">
                      <Check className="h-3 w-3 text-dashboard-400" strokeWidth={2.5} />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <a
                  href={SKOOL_COMMUNITY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-colors hover:bg-ink-100"
                >
                  Join on Skool
                  <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} />
                </a>
                <span className="text-[13px] text-ink-500">{PRICE_NOTE}</span>
              </div>
            </div>
          </section>

          <div className="mt-auto flex flex-col items-center gap-8 pt-16">
            <CrewRow />
            <LegalLinks />
          </div>
        </div>
      </div>
    </div>
  )
}

// MenuBar's MenuLink, kept visible on phones: this bar has nothing else in it.
function TopLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] text-ink-300 transition-colors hover:bg-ink/[0.06] hover:text-ink-100"
    >
      {label}
      <ArrowUpRight className="h-3 w-3 text-ink-500" strokeWidth={2} />
    </a>
  )
}

// The crew, in dock order, on Meet Your Team's rail. Read off the same list
// the dock and the intro read, so the landing can't promise a teammate the
// workspace doesn't have. An optional app a member has switched off stays off
// here too: the roster is browser-local, and a member sees the crew they kept.
function CrewRow() {
  const isVisible = useIsAppVisible()
  const crew = dockOrderedApps().filter((app) => app.category !== 'system' && isVisible(app.id))

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex flex-wrap justify-center gap-x-5 gap-y-4 sm:gap-x-8">
        {/* `sm`-only, like the intro's: below that the row wraps, and a
            straight line behind two rows draws a flow that isn't there. */}
        <span aria-hidden className="absolute left-[6%] right-[6%] top-6 hidden h-px bg-ink/10 sm:block" />
        {crew.map((app) => (
          <div key={app.id} className="relative flex w-[72px] flex-col items-center gap-2">
            <AppGlassTile app={app} />
            <span className="text-[12px] font-medium tracking-tight text-ink-200">{app.name}</span>
          </div>
        ))}
      </div>
      <p className="px-4 text-center text-[12.5px] leading-snug text-ink-400">{defaultCaption(crew.length)}</p>
    </div>
  )
}
