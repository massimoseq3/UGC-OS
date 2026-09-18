import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, FolderOpen, Layers, Pencil } from 'lucide-react'
import Modal from '../../../components/Modal'
import RailNewButton from '../../../components/RailNewButton'
import DayPill from '../../../components/DayPill'
import { TileActionStack, TileActionButton, TileDeleteButton } from '../../../components/tileActions'
import { useAssetThumb, useAssetPoster, useAssetUrl } from '../../../hooks/useAssetUrl'
import { formatRelative, sectionLabel, groupByDay } from '../../../utils/history'
import type { PlaygroundProject } from '../../../stores/types'
import type { CoverMedia, ProjectSummary } from '../projectSummary'

interface ProjectRailProps {
  projects: PlaygroundProject[]
  // null = All Generations.
  activeProjectId: string | null
  onChange: (id: string | null) => void
  // What each card previews and counts — built by the grid in one pass over the
  // list it already has. `all` is the All Generations card.
  summaries: { all: ProjectSummary; byProject: Record<string, ProjectSummary> }
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

/**
 * The Playground history panel's project rail — the list of projects, and the
 * one place they are made, renamed and deleted.
 *
 * It is **B-Roll's history rail, for projects** (Massimo's call, September
 * 2026), down to the card: the same 280px column popping out of the pane's
 * right edge, the same `h-[57px]` band led by a `RailNewButton`, the same
 * slide-in arrival, dismissed the same way — by clicking away from it — and
 * the same cover-mosaic card underneath — so a project reads as what is IN it rather
 * than as a name in a list. B-Roll's lists the sessions you made and heads them
 * with New Storyboard; this lists the projects you keep and heads them with New
 * Project. Two lists of the same kind of thing in two apps should not be a rail
 * in one and a dropdown in the other.
 *
 * It replaced the mode filter that used to slice this history by whichever tab
 * the prompt panel was standing on. That cut is wrong: one piece of work is the
 * stills AND the clips AND the track for an ad, so flipping Image → Video
 * shouldn't swap the panel for a different list. A project is the cut that
 * makes sense instead — the same one Google Flow makes.
 */
export default function ProjectRail({
  projects,
  activeProjectId,
  onChange,
  summaries,
  onCreate,
  onRename,
  onDelete,
}: ProjectRailProps) {
  // 'create' / 'rename' share one panel — same field, same validation, one
  // word different on the button. `rename` carries the project it acts on
  // rather than reading the active one: the pencil is on a CARD, so it can be
  // pressed on a project that isn't the one currently open.
  const [naming, setNaming] = useState<{ kind: 'create' } | { kind: 'rename'; project: PlaygroundProject } | null>(null)
  const [draftName, setDraftName] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  // Take the caret every time the name panel opens, and select what's in it.
  // `autoFocus` can't do this job here: `Modal` NEVER UNMOUNTS — it animates
  // open and shut in place, so the attribute fires once on the app's first
  // paint and never again, and Rename opened with its field cold every time
  // after that. Selecting matters on Rename specifically, where the field
  // arrives holding the old name and typing is meant to replace it. The short
  // delay lets the panel's open transition start before the caret lands.
  useEffect(() => {
    if (!naming) return
    const t = setTimeout(() => {
      nameRef.current?.focus()
      nameRef.current?.select()
    }, 60)
    return () => clearTimeout(t)
  }, [naming])

  // Projects are bucketed under a day pill, the shape B-Roll's rail already
  // has — "Today", "Yesterday", then the date. What dates a project is the last
  // time it was GENERATED INTO, falling back to when it was made: a folder you
  // worked in this morning belongs under Today whenever you happened to create
  // it, and an empty one has nothing else to be dated by. Sorted on the same
  // number, so the pills come out newest-first with their rows already in
  // order.
  const dayGroups = useMemo(() => {
    const dated = projects
      .map((p) => ({ project: p, ts: summaries.byProject[p.id]?.latest || p.createdAt }))
      .sort((a, b) => b.ts - a.ts)
    return groupByDay(dated, (d) => d.ts)
  }, [projects, summaries])

  function openNaming(next: { kind: 'create' } | { kind: 'rename'; project: PlaygroundProject }) {
    setDraftName(next.kind === 'rename' ? next.project.name : '')
    setNaming(next)
  }

  function commitName() {
    const name = draftName.trim()
    if (!name) return
    if (naming?.kind === 'rename') onRename(naming.project.id, name)
    else if (naming?.kind === 'create') onCreate(name)
    setNaming(null)
    setDraftName('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* New gets the WHOLE band: the rail is dismissed by clicking away from
          it (`RailOverlay`), so no close needs a slot up here. The band takes
          the app-wide h-[57px] so its hairline lines up with the history header
          across the seam.

          No `confirm` on this one, unlike B-Roll's: that button clears a
          storyboard and the setup column that produced it, while this one opens
          an empty panel and throws away nothing. */}
      <div className="flex h-[57px] shrink-0 items-center border-b border-ink/5 px-3">
        <RailNewButton
          label="New Project"
          accentClass="bg-playground-500"
          title="Start a new project. Everything you generate while it's open is filed under it"
          onClick={() => openNaming({ kind: 'create' })}
          className="flex-1"
        />
      </div>

      {/* A CONTAINER query, not a viewport one: this list is 280px wide as a
          rail and most of the pane when it stands in front of the grid, and a
          `sm:grid-cols-2` viewport rule would put two 130px cards side by side
          inside the rail. Same reasoning as B-Roll's list. */}
      <div className="@container min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {/* All Generations leads the list and sits OUTSIDE the day pills: it is
            everything in every project plus everything never filed under one,
            so it belongs to every day and to none. (It is also where a deleted
            project's generations come back to, and it has no rename or delete
            for the same reason it has no date — it is not a project.) */}
        <div className="grid grid-cols-1 gap-3 @min-[520px]:grid-cols-2 @min-[820px]:grid-cols-3 @min-[1100px]:grid-cols-4">
          <ProjectCard
            icon={Layers}
            name="All Generations"
            summary={summaries.all}
            active={!activeProjectId}
            onSelect={() => onChange(null)}
          />
        </div>
        {dayGroups.map(([dayTs, dayItems]) => (
          <div key={dayTs} className="mt-4 flex flex-col gap-3">
            <DayPill label={sectionLabel(dayTs)} />
            <div className="grid grid-cols-1 gap-3 @min-[520px]:grid-cols-2 @min-[820px]:grid-cols-3 @min-[1100px]:grid-cols-4">
              {dayItems.map(({ project: p }) => (
                <ProjectCard
                  key={p.id}
                  icon={FolderOpen}
                  name={p.name}
                  summary={summaries.byProject[p.id]}
                  fallbackTs={p.createdAt}
                  active={p.id === activeProjectId}
                  onSelect={() => onChange(p.id)}
                  onRename={() => openNaming({ kind: 'rename', project: p })}
                  onDelete={() => onDelete(p.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={naming !== null}
        onClose={() => setNaming(null)}
        title={naming?.kind === 'rename' ? 'Rename Project' : 'New Project'}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setNaming(null)}
              className="rounded-full px-4 py-2 text-[12px] font-medium text-ink-400 transition-colors hover:bg-ink/[0.06] hover:text-ink-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commitName}
              disabled={!draftName.trim()}
              className="flex items-center gap-1.5 rounded-full bg-playground-500 px-4 py-2 text-[12px] font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
            >
              {naming?.kind === 'rename' ? 'Rename' : 'Create Project'}
            </button>
          </div>
        }
      >
        <div className="px-5 py-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink-600">Name</span>
            <input
              ref={nameRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              // Enter commits: this panel is one field and a button, and
              // reaching for the mouse to finish naming a folder is a step.
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitName() } }}
              placeholder='e.g. "Hydration Serum Launch"'
              className="rounded-full border border-ink/10 bg-ink/[0.03] px-4 py-2.5 text-[13px] text-ink-200 placeholder-ink-600 outline-none transition-colors focus:border-ink/20"
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}

/**
 * One project, as a card: a mosaic of its newest media over its name and what
 * it holds. B-Roll's `HistoryCard` shape and its geometry — `aspect-[16/10]`
 * cover, scrims only where text sits, centred caption — because the two rails
 * are the same surface answering the same question, and a project you can see
 * into is worth more than a project you can read the name of.
 *
 * `onRename` / `onDelete` omitted is what makes All Generations a plain card:
 * it is not a project and there is nothing on it to rename or throw away.
 */
function ProjectCard({
  icon: Icon,
  name,
  summary,
  fallbackTs,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  icon: typeof Layers
  name: string
  // Absent when nothing has ever been generated into this project.
  summary?: ProjectSummary
  // What to date an empty project by — when it was made. The All Generations
  // card has no such date and simply shows nothing.
  fallbackTs?: number
  active: boolean
  onSelect: () => void
  onRename?: () => void
  onDelete?: () => void
}) {
  const covers = summary?.covers ?? []
  const images = summary?.images ?? 0
  const videos = summary?.videos ?? 0
  const tracks = summary?.tracks ?? 0
  const total = images + videos + tracks
  const ts = summary?.latest || fallbackTs || 0
  const tally = [
    images > 0 ? `${images} still${images === 1 ? '' : 's'}` : null,
    videos > 0 ? `${videos} clip${videos === 1 ? '' : 's'}` : null,
    tracks > 0 ? `${tracks} track${tracks === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div
      onClick={onSelect}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border text-left transition-all ${
        active
          ? 'border-playground-500/50 bg-playground-500/[0.08] ring-1 ring-playground-500/40'
          : 'border-ink/5 bg-ink/[0.03] hover:border-ink/15 hover:bg-ink/[0.05]'
      }`}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <CardCover covers={covers} icon={Icon} />

        {/* Scrim only where text sits, so the media stays the loudest thing on
            the card. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/60 to-transparent" />

        {(onRename || onDelete) && (
          <TileActionStack forceVisible={active}>
            {/* Both buttons are the stack's DEFAULT 32px circle with a 16px
                glyph. The delete wore `size='sm'` (28px / 14px) for a day,
                copied off B-Roll's card — which carries a delete and nothing
                else, so nothing over there was a different size from it. Two
                circles in one column have to match. */}
            {onRename && (
              <TileActionButton title="Rename project" onClick={onRename}>
                <Pencil className="h-4 w-4" />
              </TileActionButton>
            )}
            {onDelete && (
              <TileDeleteButton
                variant="media"
                title="Delete project. Its generations stay in All Generations"
                onDelete={onDelete}
              />
            )}
          </TileActionStack>
        )}
      </div>

      {/* Centred, matching B-Roll's rail card: under a full-bleed cover the
          name and its meta line read as the card's caption rather than as the
          start of a left-hand column. */}
      <div className="flex min-h-0 flex-col items-center gap-1 px-3 py-2.5 text-center">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-ink-100">{name}</p>
        <div className="flex max-w-full items-center justify-center gap-1.5 overflow-hidden text-[11px] text-ink-500">
          {total > 0 ? (
            <>
              <span className="truncate">{tally}</span>
              {ts > 0 && <span className="shrink-0">·</span>}
            </>
          ) : (
            // A project with nothing in it yet says so, rather than showing a
            // date with no subject. This is the state you land in the second
            // after making one, so it has to read as new and not as broken.
            <span className="shrink-0">Empty</span>
          )}
          {ts > 0 && total > 0 && <span className="shrink-0">{formatRelative(ts)}</span>}
        </div>
      </div>
    </div>
  )
}

// The mosaic. One cover fills the frame, two split it, three give the newest
// the big half — B-Roll's layout, so a card reads the same in both rails.
function CardCover({ covers, icon: Icon }: { covers: CoverMedia[]; icon: typeof Layers }) {
  if (covers.length === 0) {
    return (
      <span className="flex h-full w-full items-center justify-center bg-ink/[0.04] text-playground-300/50">
        <Icon className="h-7 w-7" strokeWidth={1.5} />
      </span>
    )
  }
  if (covers.length === 1) return <CoverTile media={covers[0]} />
  if (covers.length === 2) {
    return (
      <div className="grid h-full w-full grid-cols-2 gap-px">
        {covers.map((m, i) => <CoverTile key={i} media={m} />)}
      </div>
    )
  }
  return (
    <div className="grid h-full w-full grid-cols-3 grid-rows-2 gap-px">
      <CoverTile media={covers[0]} className="col-span-2 row-span-2" />
      <CoverTile media={covers[1]} />
      <CoverTile media={covers[2]} />
    </div>
  )
}

// One tile of the mosaic. Each resolves its own asset ref, so a card can show
// several without a hook loop.
function CoverTile({ media, className = '' }: { media: CoverMedia; className?: string }) {
  // A still shows its grid-sized thumbnail (utils/mediaThumbs), never the
  // original: these are ~100px tiles and a full-size render decoded into one is
  // pure waste. A clip shows its poster frame — a picture, where a <video> is a
  // decoder — made off screen the first time this browser sees the clip. The
  // element below is only mounted for a clip no poster will ever come for.
  const still = useAssetThumb(media.kind === 'image' ? media.ref : null)
  const poster = useAssetPoster(media.kind === 'video' ? media.ref : null)
  const clip = useAssetUrl(media.kind === 'video' && poster.status === 'missing' ? media.ref : null)
  if (media.kind === 'video') {
    if (poster.url) {
      return <img src={poster.url} alt="" loading="lazy" decoding="async" className={`${className} h-full w-full object-cover`} />
    }
    if (!clip) return <span className={`${className} h-full w-full bg-ink/[0.05]`} />
    // The <video> paints its first frame as the poster; `#t=0.1` nudges the
    // browser to decode and show that frame instead of a blank element — and
    // that decoded frame is what `capture` keeps as the poster.
    return (
      <video
        src={`${clip}#t=0.1`}
        onLoadedData={(e) => poster.capture(e.currentTarget)}
        muted
        playsInline
        preload="metadata"
        className={`${className} h-full w-full object-cover`}
      />
    )
  }
  if (!still.url) return <span className={`${className} h-full w-full bg-ink/[0.05]`} />
  return <img src={still.url} alt="" loading="lazy" decoding="async" className={`${className} h-full w-full object-cover`} />
}

/**
 * The control that opens the rail, in the history header.
 *
 * It is NOT `HistoryRailToggle`, and the difference is the one thing this bar
 * has to say that B-Roll's doesn't: which project you are looking at. Over
 * there the storyboard on screen IS the open session, so a button reading
 * "History" loses nothing; here the grid under a project and the grid under
 * All Generations are both just a wall of tiles, and nothing else on the pane
 * tells them apart. So the opener carries the name — one control that answers
 * "where am I" and opens the list in the same press — built on the same ring
 * and wash at the same `h-[38px]`, and wearing a right-pointing chevron
 * (Massimo's call, September 2026): it wore `PanelRightOpen` first, which draws
 * the chrome — a drawer coming out of the right edge — where a chevron draws
 * the DIRECTION, which is the half a member reads off a pill they are about to
 * press. It points right because that is where the rail comes from.
 */
export function ProjectRailToggle({
  activeProject,
  onExpand,
}: {
  activeProject: PlaygroundProject | null
  onExpand: () => void
}) {
  const title = activeProject
    ? `Project · ${activeProject.name} · show projects`
    : 'Every generation, in every project · show projects'
  return (
    <button
      type="button"
      onClick={onExpand}
      title={title}
      aria-expanded={false}
      className="flex h-[38px] min-w-0 shrink items-center gap-2 rounded-full border border-ink/10 bg-ink/[0.03] px-3 text-[13px] font-medium text-ink-200 transition-colors hover:bg-ink/[0.08] hover:text-ink-100"
    >
      {activeProject
        ? <FolderOpen className="h-4 w-4 shrink-0 text-playground-300 light:text-playground-600" />
        : <Layers className="h-4 w-4 shrink-0 text-ink-500" />}
      <span className="truncate">{activeProject ? activeProject.name : 'All Generations'}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={2} />
    </button>
  )
}
