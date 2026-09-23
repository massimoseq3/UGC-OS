import type { ReactNode } from 'react'

// The graph-paper canvas an output panel sits on (Characters' Single view,
// Scripts' Output tab, B-Roll's storyboard). The grid is a static layer behind
// the content — it never scrolls with it — and `.stage-grid` (index.css) masks
// it out toward the edges, so it reads as depth behind the work rather than a
// boxed-in texture. Children render above it; give the scroller inside them
// nothing special beyond its usual classes.
export default function GridCanvas({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`relative flex min-h-0 flex-1 flex-col ${className}`}>
      <div aria-hidden className="stage-grid pointer-events-none absolute inset-0" />
      {/* Children ride in their own positioned column: an absolutely positioned
          layer paints above in-flow content whatever the DOM order, so without
          this the grid would sit on top of the work. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  )
}

// The empty state a canvas shows before its first generation, and what the
// header's "+" leaves behind mid-session. Nothing is ever deleted to get here —
// the copy says so, because a blank panel otherwise reads as data loss. Render
// it inside a GridCanvas (or use AwaitingCanvas, which brings its own).
// `children` render under the hint, for the one thing a stage may add below
// its copy: the last run's error, which belongs on the stage it failed to fill.
export function AwaitingBody({
  icon: Icon,
  title = 'Awaiting Generation',
  hint,
  children,
}: {
  icon: React.ElementType
  title?: string
  hint: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <Icon className="h-8 w-8 text-ink-800" strokeWidth={1.5} />
      <p className="text-sm text-ink-500">{title}</p>
      {/* Balanced, so a two-line hint never ends on one stranded word. */}
      <p className="max-w-[300px] text-balance text-xs leading-relaxed text-ink-600">{hint}</p>
      {children}
    </div>
  )
}

export function AwaitingCanvas(props: React.ComponentProps<typeof AwaitingBody>) {
  return (
    <GridCanvas>
      <AwaitingBody {...props} />
    </GridCanvas>
  )
}
