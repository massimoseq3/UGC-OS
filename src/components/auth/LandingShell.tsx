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
// Copy is lifted from www.skool.com/ugcos, which is where it is maintained,
// and it keeps that page's TITLE CASE: the headline and the four claims are
// labels, not prose, so they follow the app's own casing rule. Everything
// sentence case here is genuinely prose (the sub-line, the qualifiers under
// each claim, the crew caption). The one thing that goes stale on its own is
// the price line, so it is a single constant at the top of the file.
//
// The page is SPACED, not packed: the first cut fitted the hero, the claims,
// the crew and the legal row inside one 960px window by squeezing every gap,
// and a pitch with no air around it reads as a cramped form rather than as a
// product. The hero takes the window and the crew strip sits below the fold
// on a laptop, which is where a visitor who wants it will go looking.

const SERIF = { fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }

const PRICE_NOTE = '$69/month · rising to $99 soon'

// The four "You'll Be Able To" lines from the community page. Each is a Title
// Case CLAIM plus a sentence-case qualifier: the parenthetical model and style
// lists ran to three wrapped lines apiece as one string, which is what made
// the column feel like a wall. They read as ONE column at every width — two up
// inside a left column the sign-in box has already taken 340px out of wrapped
// every claim onto three lines, which is the wall again in a different shape.
const PROMISES: [claim: string, detail: string][] = [
  ['Create 50+ Fully Edited AI Ads a Day', 'For pennies, on your own AI credits.'],
  ['Keep AI Characters Consistent', 'Realistic and the same face in every ad you book them for.'],
  ['Clone Any Winning Ad Format', 'Realism, 3D Pixar, claymation, podcast and more.'],
  ['Access The Latest Models for Up to 70% Off', 'Seedance 2.5, Gemini Omni, GPT Image 2 and more.'],
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
      <header className="relative z-10 flex h-9 shrink-0 items-center gap-2 border-b border-ink/5 px-3 sm:px-5">
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

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
        {/* A light source off the top edge, the same one Meet Your Team is lit
            by and for the same reason: it gives the page a top rather than
            starting it on a flat field. Monochrome, so it lights the crew's
            nine accents instead of competing with them, and weaker in light
            mode where a dark haze would read as a bruise. It is a painted
            gradient with nothing behind it and nothing moving, so it costs one
            paint (see docs/performance.md on backdrop-filter). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] [--page-glow:10%] bg-[radial-gradient(900px_320px_at_50%_-14%,color-mix(in_srgb,var(--color-ink)_var(--page-glow),transparent),transparent_72%)] light:[--page-glow:5%]"
        />

        <div className="relative mx-auto flex min-h-full w-full max-w-[1240px] flex-col px-6 sm:px-10 lg:px-14">
          {/* The hero centres in a tall window and sits at the top of a short
              one. `my-auto` on the CHILD is what makes that safe: an auto
              margin absorbs only POSITIVE free space, so it collapses to zero
              the moment the content is taller than the section. `items-center`
              was here first and centred the overflow too, which on a phone
              pushed the headline and the eyebrow off the top of the page with
              no way to scroll back up to them. */}
          <section className="flex flex-1 py-14 sm:py-20 lg:py-24">
            {/* DOM order is the PHONE order: the headline, then the sign-in
                box, then the claims and the join button, so a member on a
                phone reaches the box without scrolling through the pitch.
                From `lg` the grid puts the pitch in the left column and the
                box beside it. */}
            <div className="my-auto grid w-full grid-cols-1 gap-y-14 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center lg:gap-x-12 lg:gap-y-16 xl:grid-cols-[minmax(0,1fr)_384px] xl:gap-x-24">
              <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-1 lg:gap-7">
                <span className="inline-flex self-start rounded-full border border-ink/10 bg-ink/5 px-3.5 py-1.5 text-[12px] font-medium text-ink-400">
                  For Members of the Skool Community
                </span>
                <h1 className="max-w-[16ch] text-[40px] font-bold leading-[1.03] tracking-[-0.04em] text-ink-100 sm:text-[54px] lg:text-[56px] xl:text-[66px]">
                  The Ultimate System for Realistic AI UGC Ads{' '}
                  <span className="font-normal italic text-ink" style={SERIF}>
                    at Scale
                  </span>
                </h1>
                <p className="max-w-[46ch] text-[16.5px] leading-[1.6] text-ink-400 lg:text-[18px]">
                  Characters, scripts, voiceovers, B-roll and editing in one workspace. Built for ecom store
                  owners, agencies, marketers and beginners.
                </p>
              </div>

              <div className="mx-auto flex w-full max-w-sm flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mx-0 lg:justify-self-end">
                {/* The brand header the other signed-out screens carry. On a
                    phone the headline is directly above, so a second logo and
                    wordmark would be the same thing twice; the subtitle steps
                    up to a heading there instead. */}
                <div className="flex flex-col items-center gap-2">
                  <AppLogo className="hidden h-12 w-12 lg:block" />
                  <div className="space-y-1 text-center">
                    <h2 className="hidden text-2xl font-bold tracking-tight text-ink-100 lg:block">UGC OS</h2>
                    <p className="text-[15px] font-medium text-ink-200 lg:text-sm lg:font-normal lg:text-ink-500">
                      {subtitle}
                    </p>
                  </div>
                </div>
                {children}
              </div>

              <div className="flex flex-col gap-9 lg:col-start-1 lg:row-start-2">
                <div className="flex flex-col gap-6">
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">
                    You'll Be Able To
                  </span>
                  <ul className="flex max-w-[52ch] flex-col gap-5">
                    {PROMISES.map(([claim, detail]) => (
                      <li key={claim} className="flex items-start gap-3">
                        <span className="mt-[3px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-dashboard-500/35 bg-dashboard-500/15">
                          <Check className="h-3 w-3 text-dashboard-400" strokeWidth={2.5} />
                        </span>
                        <span className="flex flex-col gap-1">
                          <span className="text-[15px] font-medium leading-snug tracking-tight text-ink-100">
                            {claim}
                          </span>
                          <span className="text-[13.5px] leading-snug text-ink-500">{detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                  <a
                    href={SKOOL_COMMUNITY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-paper transition-colors hover:bg-ink-100"
                  >
                    Join on Skool
                    <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} />
                  </a>
                  <span className="text-[13px] text-ink-500">{PRICE_NOTE}</span>
                </div>
              </div>
            </div>
          </section>

          {/* The crew, on its own strip under a hairline. It is the proof that
              the pitch above is a workspace and not a landing page, so it gets
              room rather than a row crammed under the fold. */}
          <section className="flex flex-col items-center gap-12 border-t border-ink/[0.07] py-16 lg:py-20">
            <CrewRow />
            <LegalLinks />
          </section>
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
    <div className="flex flex-col items-center gap-6">
      <div className="relative flex flex-wrap justify-center gap-x-6 gap-y-7 sm:gap-x-10 lg:gap-x-12">
        {/* `sm`-only, like the intro's: below that the row wraps, and a
            straight line behind two rows draws a flow that isn't there. */}
        <span aria-hidden className="absolute left-[5%] right-[5%] top-6 hidden h-px bg-ink/10 sm:block" />
        {crew.map((app) => (
          <div key={app.id} className="relative flex w-[76px] flex-col items-center gap-2.5">
            <AppGlassTile app={app} />
            <span className="text-[12px] font-medium tracking-tight text-ink-200">{app.name}</span>
          </div>
        ))}
      </div>
      <p className="max-w-[46ch] px-4 text-center text-[13px] leading-relaxed text-ink-400">
        {defaultCaption(crew.length)}
      </p>
    </div>
  )
}
