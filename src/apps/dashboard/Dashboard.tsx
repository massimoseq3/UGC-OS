import { useEffect, useMemo } from 'react'
import { Clock, PiggyBank, CalendarCheck, Sparkles } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useBankStore, backfillUsageLedger } from '../../stores/bankStore'
import { isCloudEnabled } from '../../lib/supabase'
import { creditsToUsd } from '../../utils/models'
import { computeUsageMetrics, dailyMinutesSaved, usageDayStart } from '../../utils/usage'
import AppLogo from '../../components/AppLogo'
import ActivityHeatmap from './ActivityHeatmap'
import WhatsNewTile from './WhatsNewTile'
import ConnectKeyCard from './ConnectKeyCard'
import StudioLine from './StudioLine'
import RecentStrip from './RecentStrip'
import { WIDGET_SHELL, DISPLAY_FONT, riseStyle } from './widgetStyles'

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

const SPARK_DAYS = 14

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

export default function Dashboard() {
  const profile = useAuthStore((s) => s.profile)
  const usageDays = useBankStore((s) => s.usageDays)
  const kieApiKey = useSettingsStore((s) => s.kieApiKey)
  const needsKey = kieApiKey.trim().length === 0

  // Cloud mode backfills after hydrate (cloudSync); local-only has no hydrate,
  // so seed the ledger from local history the first time the Dashboard opens.
  useEffect(() => {
    if (!isCloudEnabled()) backfillUsageLedger()
  }, [])

  const metrics = useMemo(() => computeUsageMetrics(usageDays, creditsToUsd), [usageDays])
  const spark = useMemo(() => dailyMinutesSaved(usageDays, SPARK_DAYS), [usageDays])

  // Prefer the name the user set in Settings ("What should we call you?"),
  // falling back to their sign-up first name.
  const displayName = profile?.display_name?.trim() || profile?.first_name?.trim()
  const now = new Date()
  const salutation = greetingForHour(now.getHours())
  const today = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  const workdays = metrics.minutesSaved / 60 / 8
  const sinceLabel = metrics.firstActiveDay
    ? new Date(usageDayStart(metrics.firstActiveDay)).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null

  const hasActivity = metrics.totalGenerations > 0

  // Widgets rise in reading order; the banner (when shown) takes slot 0.
  const slot = (n: number) => (needsKey ? n + 1 : n)

  return (
    // Studio Home. The landing page leads with the member (a masthead with
    // their numbers in it), then the work itself: the production line as the
    // launcher, and the newest things they made one click from where they were
    // made. It reads left-aligned, like an editorial front page, rather than as
    // a centred wall of equal tiles.
    <div className="relative flex min-h-full flex-col">
      <div
        className="relative mx-auto flex w-full max-w-[1240px] flex-1 flex-col px-5 py-5 md:px-8"
        style={{ justifyContent: 'safe center' }}
      >
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5 text-[12px] text-ink-400">
                <AppLogo className="h-6 w-6" />
                <span>{today}</span>
                {metrics.currentStreak > 0 && (
                  <span className="rounded-full bg-dashboard-500/15 px-2 py-0.5 text-[11px] font-semibold text-dashboard-400">
                    {metrics.currentStreak} day streak
                  </span>
                )}
              </div>
              <h1
                className="mt-2 text-[40px] font-normal italic leading-[1.02] tracking-tighter text-ink-50 md:text-[60px]"
                style={DISPLAY_FONT}
              >
                {salutation}
                {displayName && <>, {displayName}</>}
              </h1>
              {!hasActivity && (
                <p className="mt-1 text-[13px] text-ink-400">Generate your first asset and your savings start counting.</p>
              )}
            </div>

            {/* A member with no key yet has no numbers either, so the one thing
                they need — connecting it — takes the instrument's place rather
                than adding a row that pushes the page under the dock. */}
            {needsKey ? (
              <div className="w-full lg:w-[620px] lg:shrink-0">
                <ConnectKeyCard />
              </div>
            ) : (
            // The member's numbers, as one glass instrument rather than four
            // tiles: the figures are read together, so they sit together.
            <div
              className={`widget-rise grid shrink-0 grid-cols-2 overflow-hidden sm:grid-cols-4 ${WIDGET_SHELL}`}
              style={riseStyle(slot(0))}
            >
              <Figure label="Money Saved" icon={PiggyBank} value={formatUsd(metrics.usdSaved)} sub="vs official APIs">
                <SpendBar spent={metrics.kieUsd} elsewhere={metrics.officialUsd} format={formatUsd} />
              </Figure>
              <Figure
                label="Time Saved"
                icon={Clock}
                value={formatTimeSaved(metrics.minutesSaved)}
                sub={workdays >= 1 ? `${workdays < 10 ? Math.round(workdays * 10) / 10 : Math.round(workdays)} workdays` : 'vs doing it by hand'}
              >
                <Sparkline values={spark} />
              </Figure>
              <Figure
                label="Generations"
                icon={Sparkles}
                value={metrics.totalGenerations.toLocaleString()}
                sub={sinceLabel ? `since ${sinceLabel}` : 'generations'}
              />
              <div className="flex flex-col border-ink/10 px-5 py-4 max-sm:border-t sm:border-l">
                <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-ink-300">
                  <CalendarCheck className="h-[13px] w-[13px]" strokeWidth={1.75} />
                  Activity
                </span>
                <div className="mt-3 w-[150px]">
                  <ActivityHeatmap days={usageDays} />
                </div>
              </div>
            </div>
            )}
          </header>

          <StudioLine index={slot(1)} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="flex lg:col-span-8">
              <RecentStrip index={slot(2)} />
            </div>
            <WhatsNewTile index={slot(3)} rows={3} className="lg:col-span-4" />
          </div>
        </div>
      </div>
    </div>
  )
}

// One figure in the masthead instrument: eyebrow, the number in the display
// face, what it is measured against, and its chart underneath.
function Figure({
  label,
  icon: Icon,
  value,
  sub,
  children,
}: {
  label: string
  icon: React.ElementType
  value: string
  sub: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex min-w-[150px] flex-col border-ink/10 px-5 py-4 [&:nth-child(2)]:border-l [&:nth-child(3)]:max-sm:border-t [&:nth-child(3)]:sm:border-l">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-ink-300">
        <Icon className="h-[13px] w-[13px]" strokeWidth={1.75} />
        {label}
      </span>
      <span className="mt-1 text-[40px] font-normal italic leading-none tracking-tight text-ink-50" style={DISPLAY_FONT}>
        {value}
      </span>
      <span className="mt-1 text-[11.5px] text-ink-500">{sub}</span>
      <div className="mt-auto">{children}</div>
    </div>
  )
}

// Last 14 days of time saved, as a bar per day. It answers a question the
// running total can't: whether this week looked like the ones before it.
function Sparkline({ values }: { values: number[] }) {
  const peak = Math.max(...values)
  if (peak === 0) return null
  return (
    <div className="mt-2.5 flex h-6 items-end gap-[3px]" aria-hidden>
      {values.map((minutes, i) => {
        const last = i === values.length - 1
        return (
          <span
            key={i}
            className={`flex-1 rounded-[2px] ${
              minutes === 0
                ? 'bg-ink/[0.08] light:bg-black/[0.07]'
                : last
                  ? 'bg-dashboard-400'
                  : 'bg-dashboard-500/70'
            }`}
            // 3px floor so a quiet day still reads as a day, not a gap.
            style={{ height: `${Math.max(3, Math.round((minutes / peak) * 24))}px` }}
          />
        )
      })}
    </div>
  )
}

// What the same generations cost here versus on the providers' own APIs. The
// filled sliver is what you actually paid — the widget's number is the rest.
function SpendBar({ spent, elsewhere, format }: { spent: number; elsewhere: number; format: (usd: number) => string }) {
  if (elsewhere <= 0) return null
  const share = Math.min(1, spent / elsewhere)
  return (
    // `justify-between` survives the phone's centring: these two figures label
    // the two ENDS of the bar above them, so centring them would detach each
    // number from the thing it measures. `w-full` because a centred widget's
    // `items-center` shrinks every child to its content.
    <div className="mt-3 w-full" aria-hidden>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08] light:bg-black/[0.07]">
        <div
          className="h-full rounded-full bg-dashboard-500 transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(2, share * 100)}%` }}
        />
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
          {format(spent)}
          <span className="hidden sm:inline"> on kie.ai</span>
        </span>
        <span>
          {format(elsewhere)}
          <span className="hidden sm:inline"> elsewhere</span>
        </span>
      </div>
    </div>
  )
}
