import { useMemo, useState } from 'react'
import type { UsageDay } from '../../stores/types'
import { usageDayId } from '../../utils/usage'

// GitHub-style activity grid: one rounded cell per day, columns are weeks
// (Monday-first), intensity is a single-hue sequential ramp on the Dashboard
// amber. Empty days stay in quiet ink so the accent only ever encodes data.

const WEEKS = 26
const DAY_MS = 86_400_000

// Sequential intensity ramp — thresholds chosen so a casual day (1–2 gens)
// already lights up while heavy batch days still read distinctly darker.
const LEVELS: Array<{ min: number; className: string }> = [
  { min: 12, className: 'bg-dashboard-500' },
  { min: 6, className: 'bg-dashboard-500/70' },
  { min: 3, className: 'bg-dashboard-500/45' },
  { min: 1, className: 'bg-dashboard-500/25' },
  { min: 0, className: 'bg-ink/[0.06]' },
]

function levelClass(count: number): string {
  return LEVELS.find((l) => count >= l.min)!.className
}

function mondayOfWeek(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  const shift = (d.getDay() + 6) % 7 // Mon=0 … Sun=6
  return d.getTime() - shift * DAY_MS
}

interface WeekColumn {
  monthLabel: string | null
  days: Array<{ id: string; count: number; future: boolean; label: string }>
}

export default function ActivityHeatmap({ days }: { days: UsageDay[] }) {
  // Captured once per mount — the grid's "today" anchor. Fine to go stale
  // across a midnight while the tab sits open; a reload re-anchors it.
  const [now] = useState(() => Date.now())
  const weeks = useMemo<WeekColumn[]>(() => {
    const counts = new Map<string, number>()
    for (const day of days) {
      const total = Object.values(day.counts).reduce((sum, n) => sum + (n ?? 0), 0)
      if (total > 0) counts.set(day.id, total)
    }

    const firstMonday = mondayOfWeek(now) - (WEEKS - 1) * 7 * DAY_MS
    const out: WeekColumn[] = []
    let lastMonth = -1
    for (let w = 0; w < WEEKS; w++) {
      const weekStart = firstMonday + w * 7 * DAY_MS
      // Label a column when it starts a new month (skip the very first column
      // if the label would collide with nothing before it — GitHub-style).
      const month = new Date(weekStart).getMonth()
      const monthLabel = month !== lastMonth
        ? new Date(weekStart).toLocaleDateString(undefined, { month: 'short' })
        : null
      lastMonth = month
      const daysInWeek = Array.from({ length: 7 }, (_, i) => {
        const ts = weekStart + i * DAY_MS
        const id = usageDayId(ts)
        const count = counts.get(id) ?? 0
        return {
          id,
          count,
          future: ts > now,
          label: `${new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — ${count === 0 ? 'no generations' : `${count} generation${count === 1 ? '' : 's'}`}`,
        }
      })
      out.push({ monthLabel, days: daysInWeek })
    }
    return out
  }, [days, now])

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex flex-col gap-1.5">
        {/* Month labels row */}
        <div className="flex gap-[3px]">
          {weeks.map((week, i) => (
            <span key={i} className="w-[11px] shrink-0 overflow-visible whitespace-nowrap text-[9px] leading-none text-ink-500">
              {week.monthLabel ?? ''}
            </span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {weeks.map((week, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {week.days.map((day) =>
                day.future ? (
                  <span key={day.id} className="h-[11px] w-[11px] rounded-[3px]" />
                ) : (
                  <span
                    key={day.id}
                    title={day.label}
                    className={`h-[11px] w-[11px] rounded-[3px] ${levelClass(day.count)}`}
                  />
                ),
              )}
            </div>
          ))}
        </div>
        {/* Intensity legend */}
        <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-ink-500">
          <span>Less</span>
          {[...LEVELS].reverse().map((l) => (
            <span key={l.min} className={`h-[9px] w-[9px] rounded-[2.5px] ${l.className}`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  )
}
