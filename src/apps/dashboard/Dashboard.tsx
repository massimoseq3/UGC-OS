import { useEffect, useMemo, useState } from 'react'
import { Clock, PiggyBank, CalendarCheck, GraduationCap, ArrowUpRight } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useAppStore } from '../../stores/appStore'
import { useBankStore, backfillUsageLedger } from '../../stores/bankStore'
import { isCloudEnabled } from '../../lib/supabase'
import { creditsToUsd } from '../../utils/models'
import { ALL_USAGE_KINDS, computeUsageMetrics, usageDayStart } from '../../utils/usage'
import { AI_UGC_ACADEMY_URL } from '../../utils/constants'
import type { UsageKind } from '../../stores/types'
import AppLogo from '../../components/AppLogo'
import ActivityHeatmap from './ActivityHeatmap'
import WhatsNewTile from './WhatsNewTile'
import NextStepCard from './NextStepCard'
import { useNextSteps } from './nextSteps'
import Widget, { WidgetLabel, WidgetFigure, WidgetDelta } from './Widget'
import { WIDGET_SHELL, WIDGET_INTERACTIVE, DISPLAY_FONT, riseStyle } from './widgetStyles'

// Dashboard — the workspace's "what you're getting out of this" screen and the
// default landing page: the value widgets laid across the same `AppBackground`
// gradient every other page shows. Everything derives from the usage ledger
// (bankStore.usageDays); nothing here writes data.
//
// The starfield wallpaper is gone (September 2026, Massimo's call) — the last
// thing this page had that no other page in the app did. The widgets sit on the
// shared canvas now, which also means the ten backdrop-filters on them have a
// flat gradient to blur rather than a tiled dot pattern.
//
// The crew used to orbit the wall as a solar system on the right — nine planets
// on nine rotating arms, hidden below xl. It is gone (September 2026, Massimo's
// call): it was a permanent animation on the app's DEFAULT landing page, and
// permanent motion under a wall of backdrop-blurred widgets is the one shape
// docs/performance.md tells you not to build. The dock is the launcher.

// Title Case: this is the page's masthead, not a sentence, and it reads as one
// beside the member's own name in the display face.
function greetingForHour(hour: number): string {
  if (hour < 5) return 'Up Late'
  if (hour < 12) return 'Good Morning'
  if (hour < 18) return 'Good Afternoon'
  return 'Good Evening'
}

// "42 min" → "6.5 hrs" → "38 hrs". Workday framing lives in the sub-line.
function formatTimeSaved(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = minutes / 60
  if (hours < 10) return `${(Math.round(hours * 10) / 10).toString()} hrs`
  return `${Math.round(hours)} hrs`
}

function formatUsd(usd: number): string {
  if (usd >= 100) return `$${Math.round(usd).toLocaleString()}`
  if (usd >= 10) return `$${usd.toFixed(0)}`
  return `$${usd.toFixed(2)}`
}

// Money saved's three dollar figures — the hero and the bar's two ends — share
// ONE precision, picked by the hero. They are a sum a member checks at a glance
// (paid + saved = elsewhere), and `formatUsd` on each printed "$6.48" and
// "$9.36" over a far end of "$16" that was really $15.84.
type UsdDigits = 0 | 2

function roundUsd(usd: number, digits: UsdDigits): number {
  const scale = 10 ** digits
  return Math.round(usd * scale) / scale
}

function formatUsdAt(usd: number, digits: UsdDigits): string {
  return digits === 2 ? `$${usd.toFixed(2)}` : `$${Math.round(usd).toLocaleString()}`
}

export default function Dashboard() {
  const profile = useAuthStore((s) => s.profile)
  const usageDays = useBankStore((s) => s.usageDays)
  // The first-run checklist above the wall, or null once all four are done.
  const nextSteps = useNextSteps()
  const showSteps = nextSteps !== null

  // Cloud mode backfills after hydrate (cloudSync); local-only has no hydrate,
  // so seed the ledger from local history the first time the Dashboard opens.
  useEffect(() => {
    if (!isCloudEnabled()) backfillUsageLedger()
  }, [])

  // The greeting's clock. A bare `new Date()` in the body is computed ONCE by
  // the compiler (it has no inputs), and this app stays mounted all session, so
  // "Good Morning" and the morning's date stood until a reload. It is re-read
  // when the member comes back to the page — the Dashboard becoming the active
  // app, or the tab returning to the front — rather than on a timer, since
  // nothing on an idle page may tick forever (docs/performance.md).
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refresh = () => setNow(new Date())
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    const unsubscribe = useAppStore.subscribe((state, prev) => {
      if (state.activeApp === 'dashboard' && prev.activeApp !== 'dashboard') refresh()
    })
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      unsubscribe()
    }
  }, [])

  const metrics = useMemo(() => computeUsageMetrics(usageDays, creditsToUsd), [usageDays])

  // Prefer the name the user set in Settings ("What should we call you?"),
  // falling back to their sign-up first name.
  const displayName = profile?.display_name?.trim() || profile?.first_name?.trim()
  const salutation = greetingForHour(now.getHours())
  const today = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  const workdays = metrics.minutesSaved / 60 / 8
  const sinceLabel = metrics.firstActiveDay
    ? new Date(usageDayStart(metrics.firstActiveDay)).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null

  const hasActivity = metrics.totalGenerations > 0

  // Whether each figure tile has floor art under its number. Both floors render
  // NOTHING before there is data (MadeRow bails with nothing made, SpendBar on
  // nothing spent elsewhere), which used to leave the figure hanging off the
  // label with the whole bottom half of the tile empty under it. Mirrors each
  // floor's own bail condition, so the tile and its floor can't disagree.
  const hasMade = hasActivity
  const hasSpend = metrics.officialUsd > 0

  // Money saved, rounded ONCE to the hero's precision (see formatUsdAt). The
  // far end is the sum of the two figures on screen rather than the ledger's
  // own total rounded separately: rounding the three independently lands the
  // total a cent (or a dollar) off paid + saved about a quarter of the time.
  // Past the floor at 0 (kie.ai dearer than elsewhere) there is no sum to keep.
  const usdDigits: UsdDigits = metrics.usdSaved < 10 ? 2 : 0
  const paidUsd = roundUsd(metrics.kieUsd, usdDigits)
  const savedUsd = roundUsd(metrics.usdSaved, usdDigits)
  const elsewhereUsd = metrics.usdSaved > 0 ? paidUsd + savedUsd : roundUsd(metrics.officialUsd, usdDigits)

  // Widgets rise in reading order; the Next Steps card (when shown) takes slot 0.
  const slot = (n: number) => (showSteps ? n + 1 : n)

  return (
    <div className="relative flex min-h-full flex-col">
      {/* `safe center` centres the desktop on a tall window without ever
          clipping the greeting off the top when the content outgrows it.
          The width cap steps up at `2xl`: at 1240px a 1920 monitor showed the
          wall as an island covering a quarter of the screen. */}
      <div
        className="relative mx-auto flex w-full max-w-[1240px] flex-1 flex-col px-5 py-4 md:px-8 2xl:max-w-[1480px]"
        style={{ justifyContent: 'safe center' }}
      >
        {/* From `lg` this column FILLS the window so the wall under it can grow
            into the height (see the wall's note), and centres what it holds
            once the wall reaches its ceiling. Below `lg` it keeps its content
            height and the container above does the centring. */}
        <div className="flex flex-col gap-3.5 lg:flex-1" style={{ justifyContent: 'safe center' }}>
          {/* Centred at EVERY width (Massimo's call, September 2026) — the
              brand mark sits over the greeting, and a logo aligned left over a
              wall of centred tiles reads as a page header rather than as the
              masthead of the desktop under it. It used to read from the left
              edge from `sm` up, like every other page in the app; this one
              isn't a working surface, it's the landing page. */}
          <header className="flex flex-col items-center text-center">
            {/* On a SHORT window the mark steps aside for the wall (September
                2026): it costs 62px, the menu bar already carries it, and at a
                laptop's ~780px the wall's second row sat under the dock with
                it in place. The cut-off is the height at which the rows would
                hit their floor with the logo shown, which the Next Steps
                card's 78px moves up. `lg` only — below it the wall is a bento
                that scrolls on to What's New by design. */}
            <AppLogo
              className={`mb-1.5 h-12 w-12 md:h-14 md:w-14 ${
                showSteps ? 'lg:[@media(max-height:880px)]:hidden' : 'lg:[@media(max-height:800px)]:hidden'
              }`}
            />
            {/* ONE face for the whole line — `DISPLAY_FONT`, italic,
                `tracking-tighter` (Massimo's call, August 2026). It was two
                for a while, Geist for the salutation and the serif for the
                name alone; the masthead reads better as a single mark.
                `font-normal` and it stays that way: Instrument Serif ships a
                single weight, so `font-bold` here only asks the browser to
                synthesize one, which thickens the strokes without the face
                ever drawing a real bold.
                30px on a phone rather than 36 so "Good afternoon, <name>"
                can't gain a second line and push the bento's last row under
                the fold. */}
            <h1
              className="text-[30px] leading-tight font-normal italic tracking-tighter text-ink-50 sm:text-4xl sm:leading-normal md:text-[46px] md:leading-[1.1] roomy:text-[54px]"
              style={DISPLAY_FONT}
            >
              {salutation}
              {displayName && <>, {displayName}</>}
            </h1>
            {/* The date, and — for a member with nothing yet — the one line
                that says where the numbers come from. "Here's what UGC OS has
                saved you so far" rode here for every OTHER member and said
                nothing the four widgets underneath don't say themselves. */}
            <p className="mt-1 text-[13px] text-ink-400">
              {today}
              {!hasActivity && (
                <>
                  <span className="mx-1.5 text-ink-700">·</span>
                  Generate your first asset and your savings start counting.
                </>
              )}
            </p>
          </header>

          {/* The key guide it opens is hosted by the menu bar, not the card,
              so the card can vanish the moment its last step is done without
              taking an open guide (and its "You're Connected" state) with it. */}
          {nextSteps && <NextStepCard done={nextSteps} />}

          {/* The widget wall — two rows on a desktop, and deliberately no
              more: the whole desktop has to sit inside one screen with the
              dock, so nothing here is allowed to push the heatmap below the
              fold.

              **From `lg` the two rows take their height from the WINDOW, not
              their content** (September 2026). They used to be as tall as the
              tallest tile's content at every window size, so the wall was a
              fixed 484px: under the dock on a ~780px laptop, a small island on
              a 1080p monitor. Now the wall is `flex-1` in a column that fills
              the window, `auto-rows-fr` splits it into two equal rows, and it
              stops growing at a ceiling (`max-h`, one step taller at `2xl`)
              past which the column centres it. The floor is still the
              content: a flex item can't shrink below its own min-content, so
              on a window too short for the rows the page scrolls rather than
              the tiles clipping. The heatmap no longer sets that floor — it
              sizes itself to the height it is handed (see ActivityHeatmap).

              **Three columns, rearranged September 2026 (Massimo's call).**
              The two figures stack down the LEFT (Money saved over Time
              saved, the pair that read as one comparison), Activity heads the
              MIDDLE with the Academy link under it, and What's New takes the
              whole RIGHT column at two rows tall. The Streak ring went with
              that rearrangement — the menu bar's flame chip still carries the
              number, and the ledger still feeds it.

              What the tall column bought is the point of it: a full-width
              16:9 hero is 196px, which does not fit in a 233px tile with a
              label, a title and a button. See WhatsNewTile.

              **Below `lg` it is a bento, two tiles across** (August 2026).
              Every widget was `col-span-12` there, so a phone got a stack of
              full-width slabs and the Dashboard became a page you scroll
              rather than a desktop you look at. What's New is the one
              exception — it keeps the full width, because its rows are
              pictures — and it takes `order-last` so the phone still ends on
              it rather than splitting the four figures around it.
              `auto-rows-fr` is `lg:` only for the same reason: equal rows are
              what make the desktop read as a wall, and below it they would
              squeeze the list into a figure tile's height. Activity fits a
              half tile because the heatmap sizes its cells to whatever box it
              is dropped in (see ActivityHeatmap). */}
          <div className="grid grid-cols-12 gap-3.5 lg:max-h-[554px] lg:flex-1 lg:auto-rows-fr 2xl:max-h-[614px]">
            {/* Money saved */}
            <Widget index={slot(0)} className="col-span-6 items-center text-center lg:col-span-4">
              <WidgetLabel icon={PiggyBank} label="Money Saved" />
              {/* Centres with no bar under it — see Time saved below. */}
              <div className={`w-full ${hasSpend ? 'pt-4' : 'flex flex-1 flex-col justify-center'}`}>
                <WidgetFigure value={formatUsdAt(savedUsd, usdDigits)} />
                <p className="mt-1.5 text-[12px] leading-snug text-ink-500">
                  vs official APIs
                  <span className="hidden sm:inline"> &amp; creator platforms</span>
                </p>
                {metrics.usdSavedLast7d >= 0.01 && (
                  <WidgetDelta>{`+${formatUsd(metrics.usdSavedLast7d)} this week`}</WidgetDelta>
                )}
              </div>
              <div className="mt-auto w-full">
                <SpendBar
                  paid={metrics.kieUsd}
                  elsewhere={metrics.officialUsd}
                  paidLabel={formatUsdAt(paidUsd, usdDigits)}
                  elsewhereLabel={formatUsdAt(elsewhereUsd, usdDigits)}
                />
              </div>
            </Widget>

            {/* Activity */}
            <Widget index={slot(1)} className="col-span-6 items-center text-center lg:col-span-4">
              <WidgetLabel icon={CalendarCheck} label="Activity" />
              {/* From `lg` this box takes whatever height the row leaves and is
                  a SIZE container, so the heatmap inside can size its cells to
                  the height as well as the width. Size containment also means
                  its content no longer counts toward the row's floor — the
                  heatmap used to be the tallest thing on the wall, and with
                  18px cells it held both rows at 234px on any window. Below
                  `lg` the rows are content-sized, so it stays a plain box. */}
              <div className="mt-auto flex w-full items-end pt-3 lg:mt-0 lg:min-h-0 lg:flex-1 lg:[container-type:size]">
                <ActivityHeatmap days={usageDays} />
              </div>
              {/* The tally reads UNDER the grid it counts, the way Streak's
                  record reads under its ring — it sat beside the label in the
                  header until the wall went to six equal centred tiles, where
                  a note in that row is what knocks the label off centre. Still
                  gone below `sm`, where the bento can't spare the line.
                  There is nothing here before there is activity: "Every
                  generation lights up a day" held the slot on the reasoning
                  that 26 weeks of blank cells read as a broken widget rather
                  than a waiting one, and came out because the label already
                  says Activity and the empty grid says there hasn't been
                  any. */}
              {hasActivity && (
                <p className="mt-2 hidden max-w-full truncate text-[11px] text-ink-500 sm:block">
                  {`${metrics.totalGenerations.toLocaleString()} generations · ${metrics.activeDays.toLocaleString()} active days${sinceLabel ? ` since ${sinceLabel}` : ''}`}
                </p>
              )}
            </Widget>
            {/* The right-hand column, two rows tall — see the note above. */}
            <WhatsNewTile index={slot(3)} className="order-last col-span-12 lg:order-none lg:col-span-4 lg:row-span-2" />
            {/* Time saved */}
            <Widget index={slot(2)} className="col-span-6 items-center text-center lg:col-span-4">
              <WidgetLabel icon={Clock} label="Time Saved" />
              {/* NOT `mt-auto`: bottom-aligning this block lands the figure
                  at a different height in each tile, because the two floors
                  (Money saved's bar plus captions, the made row here) are
                  different heights and push their blocks up by different
                  amounts. The text stacks from the label down in both, so
                  hero / caption / delta line up across the pair, and only the
                  FLOOR takes `mt-auto`.

                  With no floor art yet it CENTRES instead (Massimo's call,
                  September 2026): a "0 min" pinned under the label left the
                  bottom half of the tile visibly empty, which reads as a
                  widget missing a piece rather than one waiting for its first
                  generation. The pair still line up with each other, because
                  neither has a chart to be pushed up by — which is exactly
                  the condition the rule above is about. */}
              <div className={`w-full ${hasMade ? 'pt-4' : 'flex flex-1 flex-col justify-center'}`}>
                <WidgetFigure value={formatTimeSaved(metrics.minutesSaved)} />
                {/* The workdays line is the figure in a second unit and
                    nothing else — "≈ 7.6 workdays of production and
                    tool-hopping" was a sentence explaining a number that
                    doesn't need explaining, and the ≈ hedged a figure the
                    widget above it already states exactly. */}
                <p className="mt-1.5 text-[12px] leading-snug text-ink-500">
                  {workdays >= 1
                    ? `${workdays < 10 ? Math.round(workdays * 10) / 10 : Math.round(workdays)} workdays`
                    : hasActivity
                      ? `across ${metrics.totalGenerations.toLocaleString()} generation${metrics.totalGenerations === 1 ? '' : 's'}`
                      : 'vs doing it by hand'}
                </p>
                {metrics.minutesSavedLast7d > 0 && (
                  <WidgetDelta>{`+${formatTimeSaved(metrics.minutesSavedLast7d)} this week`}</WidgetDelta>
                )}
              </div>
              <div className="mt-auto w-full">
                <MadeRow counts={metrics.countsByKind} />
              </div>
            </Widget>

            {/* Academy — the wall's one pure LINK, and the one tile with
                nothing of the member's own in it, so it keeps the centred
                disc-over-title card rather than taking a WidgetLabel header
                like the figures that report something. What's New wore this
                same shape until it became a log; the shape lived in
                Widget.tsx as a shared constant for exactly as long as two
                cards wore it. It sits under Activity in the middle column. */}
            <a
              href={AI_UGC_ACADEMY_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={riseStyle(slot(4))}
              className={`widget-rise group relative col-span-6 flex flex-col items-center justify-center gap-3 p-4 text-center lg:col-span-4 ${WIDGET_SHELL} ${WIDGET_INTERACTIVE}`}
            >
              {/* Disc and title step up from `sm` (Massimo's call, September
                  2026): this tile carries two short words where the other
                  five carry a figure, so at the five's supporting sizes it
                  read as the quietest thing on a wall of equal squares. The
                  phone keeps the smaller pair — the tile is half a screen
                  wide there and "AI UGC Academy" is one line by a hair. */}
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-dashboard-500/15 sm:h-[52px] sm:w-[52px] sm:rounded-[17px]">
                <GraduationCap className="h-6 w-6 text-dashboard-400 sm:h-7 sm:w-7" strokeWidth={1.75} />
              </span>
              <span>
                <span
                  className="block text-[15px] italic font-normal leading-tight tracking-tight text-ink-50 sm:text-[18px]"
                  style={DISPLAY_FONT}
                >
                  AI UGC Academy
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-ink-500 sm:text-[12px]">Trainings</span>
              </span>
              {/* Out of flow — in it, the arrow costs the title 28px it
                  doesn't have. Gone entirely below `sm`, where the tile is
                  half a phone's width: out of flow it doesn't reserve the
                  space either, so it simply landed on the last letter of
                  the title. The card is the link with or without it. */}
              <ArrowUpRight
                className="absolute right-3 top-3 hidden h-3.5 w-3.5 text-ink-600 transition-colors group-hover:text-dashboard-400 sm:block"
                strokeWidth={2}
              />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// What the hours above were saved ON: the member's own output, by kind, as the
// Time saved tile's floor. It replaced a 14-day sparkline of minutes saved
// (September 2026), which drew the same days the Activity heatmap beside it
// already draws, in the same green, from what is a per-kind weighting of the
// same count — two charts of one signal, while what a member has actually MADE
// appeared nowhere on the page. It is the one figure on this wall that isn't an
// estimate.
//
// Numbers, not a chart: a handful of counts is a row of figures, and a stacked
// bar of seven kinds would need seven hues to tell apart on a page that is ink
// and one green. Top three by count; a phone keeps two, since three columns of
// "voiceovers" don't fit half its width and nothing in a half tile may wrap.
const MADE_NOUNS: Record<UsageKind, [one: string, many: string]> = {
  video: ['clip', 'clips'],
  image: ['image', 'images'],
  voice: ['voiceover', 'voiceovers'],
  script: ['script', 'scripts'],
  character: ['character', 'characters'],
  analysis: ['analysis', 'analyses'],
  music: ['track', 'tracks'],
}

function madeNoun(kind: UsageKind, count: number): string {
  return MADE_NOUNS[kind][count === 1 ? 0 : 1]
}

function MadeRow({ counts }: { counts: Record<UsageKind, number> }) {
  // `sort` is stable, so kinds on the same count keep ALL_USAGE_KINDS order
  // rather than trading places between renders.
  const made = ALL_USAGE_KINDS.filter((kind) => counts[kind] > 0).sort((a, b) => counts[b] - counts[a])
  if (made.length === 0) return null
  return (
    <div
      className="mt-3 flex w-full justify-evenly"
      // The kinds past the third still count toward the hours above; the
      // tooltip is where they're named, so none of them is simply missing.
      title={made.map((kind) => `${counts[kind].toLocaleString()} ${madeNoun(kind, counts[kind])}`).join(' · ')}
    >
      {made.slice(0, 3).map((kind, i) => (
        <span key={kind} className={`min-w-0 flex-col items-center ${i === 2 ? 'hidden sm:flex' : 'flex'}`}>
          {/* The hero's own face, a size down the scale — these are figures,
              the same kind of thing as the number above them. Kept to ~50px
              with the label so this tile never becomes the tallest on the
              row: from `lg` the tallest tile's content is the wall's floor. */}
          <span
            className="text-[18px] italic leading-none tracking-tight text-ink-200 sm:text-[20px] roomy:text-[22px]"
            style={DISPLAY_FONT}
          >
            {counts[kind].toLocaleString()}
          </span>
          <span className="mt-1 whitespace-nowrap text-[10px] leading-tight text-ink-500 sm:text-[11px]">
            {madeNoun(kind, counts[kind])}
          </span>
        </span>
      ))}
    </div>
  )
}

// What the same generations cost here against what they would cost elsewhere,
// as ONE bar the length of the elsewhere price: the grey run is what you paid on
// kie.ai and the green run is the saving — the hero number above it. It drew
// the paid sliver in green on an empty track until September 2026, so the figure
// the tile exists for was the empty part of its own chart, and a green fill
// reads as progress: the bar looked 40% of the way to something.
//
// The two labels arrive formatted (see `formatUsdAt`) so they share the hero's
// precision; the proportions use the unrounded amounts.
function SpendBar({
  paid,
  elsewhere,
  paidLabel,
  elsewhereLabel,
}: {
  paid: number
  elsewhere: number
  paidLabel: string
  elsewhereLabel: string
}) {
  if (elsewhere <= 0) return null
  const share = Math.min(1, paid / elsewhere)
  return (
    // `justify-between` survives the phone's centring: these two figures label
    // the two ENDS of the bar above them, so centring them would detach each
    // number from the thing it measures. `w-full` because a centred widget's
    // `items-center` shrinks every child to its content.
    <div className="mt-3 w-full" aria-hidden>
      {/* The runs are parted by a 2px gap of the tile's own surface, not a
          stroke, and the outer ends are rounded by the clip — so where they
          meet, each run ends square against the gap. */}
      <div className="flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full">
        {paid > 0 && (
          <div
            className="h-full shrink-0 bg-ink/25 transition-[width] duration-700 ease-out"
            // 2% floor so a sliver of spend still reads as a run, not a notch.
            style={{ width: `${Math.max(2, share * 100)}%` }}
          />
        )}
        {share < 1 && <div className="h-full min-w-0 flex-1 bg-dashboard-500" />}
      </div>
      {/* One nowrap line: at half a phone's width the pair wrapped to two lines
          each, which reads as four numbers instead of a comparison of two. The
          WORDS are a `hidden sm:inline` tail, like the sub-line above: even at
          10px "$6.78 on kie.ai  $17 elsewhere" is ~143px against a 134px box on
          a 390px phone, so it ran past the padding there and over the tile's
          own border at 375 / 360. A phone reads the bar's two ends as the two
          numbers; a desktop gets what each one is. ink-500, the same fine print
          as Activity's tally beside it on this baseline. */}
      <div className="mt-1.5 flex items-center justify-between gap-2 whitespace-nowrap text-[11px] tabular-nums text-ink-500">
        <span>
          {paidLabel}
          <span className="hidden sm:inline"> on kie.ai</span>
        </span>
        <span>
          {elsewhereLabel}
          <span className="hidden sm:inline"> elsewhere</span>
        </span>
      </div>
    </div>
  )
}
