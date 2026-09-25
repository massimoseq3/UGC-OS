import { useEffect, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ClipboardCopy, EyeOff, RefreshCw, RotateCcw } from 'lucide-react'
import Spinner from '../../components/Spinner'
import SegmentedToggle from '../../components/SegmentedToggle'
import { useAppStore } from '../../stores/appStore'
import { useAuthStore } from '../../stores/authStore'
import { groupState, needsAttention, useErrorInboxStore, type ErrorGroup } from '../../stores/errorInboxStore'
import { copyToClipboard } from '../../utils/clipboard'
import type { ErrorKind, ReportContext } from '../../utils/errorReport'
import { getSupabase } from '../../lib/supabase'
import AppGlyph from './AppGlyph'
import { appName } from './appDisplay'
import { QUERY_TIMEOUT_MS, readyAdminSession, withTimeout } from './adminQuery'
import { formatDate, formatRelative, memberName, useMembers, type MemberRow } from './useMembers'

// Admin → Errors: what broke for members, grouped by bug, newest first.
//
// Reports arrive on their own (utils/errorReporter.ts): pane crashes, uncaught
// errors, and every failure a member was shown except the ones that are their
// own situation (no key, no credits, the content filter). One group is one
// bug across every member who hit it; opening it fetches the per-member
// reports with the stack and context, and "Copy for Claude" turns the lot into
// a report ready to paste into a coding session.

type Filter = 'attention' | 'resolved' | 'ignored'

const KIND_LABEL: Record<ErrorKind, string> = { crash: 'Crash', error: 'Error', failed: 'Failed' }

const KIND_HINT: Record<ErrorKind, string> = {
  crash: 'An app pane fell over and showed "Something went wrong".',
  error: 'Code threw with nothing to catch it. The member may not have noticed.',
  failed: 'The member was shown this failure.',
}

const KIND_CHIP: Record<ErrorKind, string> = {
  crash: 'bg-red-500/10 text-red-300 light:text-red-700',
  error: 'bg-amber-500/10 text-amber-300 light:text-amber-700',
  failed: 'bg-sky-500/10 text-sky-300 light:text-sky-700',
}

function inFilter(g: ErrorGroup, filter: Filter): boolean {
  const state = groupState(g)
  if (filter === 'attention') return state === 'open' || state === 'back'
  return state === filter
}

export default function ErrorReports({ active }: { active: boolean }) {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const groups = useErrorInboxStore((s) => s.groups)
  const loading = useErrorInboxStore((s) => s.loading)
  const refreshing = useErrorInboxStore((s) => s.refreshing)
  const error = useErrorInboxStore((s) => s.error)
  const loadedAt = useErrorInboxStore((s) => s.loadedAt)
  const highlightSince = useErrorInboxStore((s) => s.highlightSince)
  const load = useErrorInboxStore((s) => s.load)
  const openInbox = useErrorInboxStore((s) => s.openInbox)
  const touchSeen = useErrorInboxStore((s) => s.touchSeen)
  // Names for the "who hit it" list — the directory Members and Insights
  // already share, so this costs nothing when either has been opened.
  const { rows: members } = useMembers()
  const [filter, setFilter] = useState<Filter>('attention')
  const [expanded, setExpanded] = useState<string | null>(null)

  // Every visit to the tab is a look: the dock's dot clears, and what came in
  // since the last visit keeps its "New" marker until the next one.
  useEffect(() => {
    if (active && userId) openInbox(userId)
  }, [active, userId, openInbox])

  // A refresh while the tab is on screen is seen too.
  useEffect(() => {
    if (active && userId && loadedAt !== null) touchSeen(userId)
  }, [active, userId, loadedAt, touchSeen])

  const counts = { attention: 0, resolved: 0, ignored: 0 }
  for (const g of groups) {
    const state = groupState(g)
    if (state === 'open' || state === 'back') counts.attention++
    else counts[state]++
  }

  // Came-back bugs lead: a fix that didn't hold is the most urgent thing here.
  const visible = groups
    .filter((g) => inFilter(g, filter))
    .sort((a, b) => {
      const back = Number(groupState(b) === 'back') - Number(groupState(a) === 'back')
      return back || Date.parse(b.last_seen) - Date.parse(a.last_seen)
    })

  const reload = () => { if (userId) void load({ userId, force: true }) }

  if (loading && groups.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-ink-500">
        <Spinner className="h-4 w-4" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-300 light:text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{groups.length > 0 ? `Refresh failed. Showing the last loaded reports. ${error}` : error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedToggle<Filter>
          fitContent
          dense
          value={filter}
          onChange={(next) => { setFilter(next); setExpanded(null) }}
          options={[
            { value: 'attention', label: 'Needs Attention', badge: counts.attention || undefined },
            { value: 'resolved', label: 'Resolved', badge: counts.resolved || undefined },
            { value: 'ignored', label: 'Ignored', badge: counts.ignored || undefined },
          ]}
        />
        <button onClick={reload} className="flex items-center gap-1.5 rounded-md border border-ink/10 px-2.5 py-1 text-[11px] text-ink-300 transition-colors hover:bg-ink/[0.05]">
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-ink-500">
        Reports come in from members' browsers on their own, within seconds. A member's own situation (no key, out of credits, the content filter) isn't reported. Members can switch this off in Settings → Account.
      </p>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-ink/10 bg-ink/[0.02] py-10 text-center text-[12px] text-ink-500">
          {filter === 'attention'
            ? 'Nothing needs attention. New reports land here as they happen.'
            : filter === 'resolved'
              ? 'Nothing resolved yet.'
              : 'Nothing ignored.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((g) => (
            <GroupRow
              key={g.fingerprint}
              group={g}
              isNew={needsAttention(g) && Date.parse(g.last_seen) > highlightSince}
              open={expanded === g.fingerprint}
              onToggle={() => setExpanded((cur) => (cur === g.fingerprint ? null : g.fingerprint))}
              members={members}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function GroupRow({
  group: g,
  isNew,
  open,
  onToggle,
  members,
}: {
  group: ErrorGroup
  isNew: boolean
  open: boolean
  onToggle: () => void
  members: MemberRow[]
}) {
  const state = groupState(g)
  // A failure is best named by what the member read; everything else by the
  // error itself.
  const title = g.kind === 'failed' && g.shown ? g.shown : g.message

  return (
    <li className="overflow-hidden rounded-xl border border-ink/10 bg-ink/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-ink/[0.03]"
      >
        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <span title={KIND_HINT[g.kind]} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${KIND_CHIP[g.kind]}`}>
              {KIND_LABEL[g.kind]}
            </span>
            {state === 'back' && (
              <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-300 light:text-orange-700" title="Resolved, then reported again">
                Came Back
              </span>
            )}
            {isNew && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-red-300 light:text-red-700">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                New
              </span>
            )}
          </span>
          <span className={`block text-[13px] font-medium text-ink-100 ${open ? 'break-words' : 'line-clamp-2'}`}>{title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-500">
            {g.app_id && (
              <span className="flex items-center gap-1 text-ink-400">
                <AppGlyph appId={g.app_id} className="h-3 w-3" />
                {appName(g.app_id)}
              </span>
            )}
            {g.operation && <span className="text-ink-400">{g.operation}</span>}
            <span className="tabular-nums">{g.occurrences.toLocaleString()}×</span>
            <span className="tabular-nums">{g.members} {g.members === 1 ? 'member' : 'members'}</span>
            <span>last {formatRelative(g.last_seen)}</span>
          </span>
        </span>
        <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-ink-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <GroupDetail group={g} members={members} />}
    </li>
  )
}

// One member's report for a group — the per-member row behind the aggregate.
interface ReportRow {
  user_id: string
  occurrences: number
  first_seen: string
  last_seen: string
  message: string
  shown: string | null
  stack: string | null
  context: ReportContext | null
  build_id: string | null
  app_id: string | null
}

type DetailState =
  | { phase: 'loading' }
  | { phase: 'ready'; rows: ReportRow[] }
  | { phase: 'error'; message: string }

// Never rejects: whatever goes wrong comes back as the error state, so the
// panel can't sit on "Loading reports…" forever.
async function fetchReports(fingerprint: string): Promise<DetailState> {
  try {
    await readyAdminSession()
    const sb = getSupabase()
    const { data, error } = await withTimeout(
      (signal) => sb.from('error_reports')
        .select('user_id, occurrences, first_seen, last_seen, message, shown, stack, context, build_id, app_id')
        .eq('fingerprint', fingerprint)
        .order('last_seen', { ascending: false })
        .limit(50)
        .abortSignal(signal),
      QUERY_TIMEOUT_MS,
      'error details',
    )
    if (error) return { phase: 'error', message: error.message }
    return { phase: 'ready', rows: (data ?? []) as ReportRow[] }
  } catch (e) {
    return { phase: 'error', message: e instanceof Error ? e.message : String(e) }
  }
}

function GroupDetail({ group: g, members }: { group: ErrorGroup; members: MemberRow[] }) {
  const setStatus = useErrorInboxStore((s) => s.setStatus)
  const addToast = useAppStore((s) => s.addToast)
  const [detail, setDetail] = useState<DetailState>({ phase: 'loading' })
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    void fetchReports(g.fingerprint).then((next) => { if (live) setDetail(next) })
    return () => { live = false }
  }, [g.fingerprint])

  const latest = detail.phase === 'ready' ? detail.rows[0] ?? null : null
  const state = groupState(g)
  const byId = new Map(members.map((m) => [m.id, m]))

  const changeStatus = (status: 'resolved' | 'ignored' | null) => {
    setBusy(true)
    setStatus(g.fingerprint, status).then(
      () => setBusy(false),
      (e: unknown) => {
        setBusy(false)
        addToast(`Couldn't update that report: ${e instanceof Error ? e.message : String(e)}`, 'error')
      },
    )
  }

  const copy = () => {
    void copyToClipboard(reportForClaude(g, latest, detail.phase === 'ready' ? detail.rows.length : null)).then((ok) => {
      if (!ok) {
        addToast("Couldn't reach the clipboard.", 'error')
        return
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="space-y-4 border-t border-ink/5 px-4 py-4">
      {detail.phase === 'loading' && (
        <div className="flex items-center gap-2 text-[11px] text-ink-500">
          <Spinner className="h-3 w-3" /> Loading reports…
        </div>
      )}
      {detail.phase === 'error' && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-[11px] text-red-300 light:text-red-700">{detail.message}</div>
      )}

      {g.kind === 'failed' && g.shown && g.shown !== g.message && (
        <Field label="What They Saw">
          <p className="text-[12px] leading-relaxed text-ink-300">{g.shown}</p>
        </Field>
      )}

      <Field label="Error">
        <Mono>{latest?.message ?? g.message}</Mono>
      </Field>

      {latest?.stack && (
        <Field label="Stack">
          <Mono scroll>{latest.stack}</Mono>
        </Field>
      )}

      {latest?.context?.component_stack && (
        <Field label="Component Stack">
          <Mono scroll>{latest.context.component_stack}</Mono>
        </Field>
      )}

      {latest && (
        <Field label="Latest Report">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[11px] sm:grid-cols-2">
            <Fact term="Build" value={latest.build_id ?? '—'} />
            <Fact term="Browser" value={describeBrowser(latest.context?.browser)} />
            <Fact term="Screen" value={latest.context?.viewport ?? '—'} />
            <Fact term="Page" value={latest.context?.path ?? '—'} />
            <Fact term="Online" value={latest.context?.online === false ? 'No, offline' : latest.context?.online ? 'Yes' : '—'} />
            <Fact term="Into Session" value={latest.context?.session_s !== undefined ? formatSeconds(latest.context.session_s) : '—'} />
            <Fact term="Error Type" value={latest.context?.name ?? '—'} />
            <Fact term="Recent Apps" value={describeTrail(latest.context?.trail)} />
          </dl>
        </Field>
      )}

      {detail.phase === 'ready' && detail.rows.length > 0 && (
        <Field label={`Who Hit It · ${g.members}`}>
          <ul className="divide-y divide-ink/5 rounded-lg border border-ink/5">
            {detail.rows.map((r) => {
              const m = byId.get(r.user_id)
              return (
                <li key={r.user_id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-[11px]">
                  <span className="min-w-0 truncate text-ink-200">{m ? memberName(m) || m.email : `${r.user_id.slice(0, 8)}…`}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-ink-500">
                    <span className="tabular-nums">{r.occurrences.toLocaleString()}×</span>
                    <span>{describeBrowser(r.context?.browser)}</span>
                    <span title={formatDate(r.last_seen)}>{formatRelative(r.last_seen)}</span>
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-1.5 text-[10px] text-ink-600">First seen {formatDate(g.first_seen)}.</p>
        </Field>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ActionButton onClick={copy} icon={copied ? Check : ClipboardCopy}>{copied ? 'Copied' : 'Copy for Claude'}</ActionButton>
        {state === 'open' || state === 'back' ? (
          <>
            <ActionButton onClick={() => changeStatus('resolved')} disabled={busy} icon={Check}>Resolve</ActionButton>
            <ActionButton onClick={() => changeStatus('ignored')} disabled={busy} icon={EyeOff}>Ignore</ActionButton>
          </>
        ) : (
          <ActionButton onClick={() => changeStatus(null)} disabled={busy} icon={RotateCcw}>Reopen</ActionButton>
        )}
        {busy && <Spinner className="h-3 w-3 text-ink-500" />}
      </div>
      <p className="text-[10px] leading-relaxed text-ink-600">
        {state === 'ignored'
          ? 'Ignored stays hidden even if it happens again.'
          : 'Resolve once the fix is live. If it happens again after that, it comes back to the top.'}
      </p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium text-ink-400">{label}</div>
      {children}
    </div>
  )
}

function Mono({ children, scroll = false }: { children: React.ReactNode; scroll?: boolean }) {
  return (
    <pre className={`whitespace-pre-wrap break-words rounded-lg border border-ink/5 bg-ink/[0.03] p-2.5 font-mono text-[11px] leading-relaxed text-ink-300 ${scroll ? 'max-h-60 overflow-auto' : ''}`}>
      {children}
    </pre>
  )
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="shrink-0 text-ink-500">{term}</dt>
      <dd className="min-w-0 truncate text-ink-300" title={value}>{value}</dd>
    </div>
  )
}

function ActionButton({
  onClick,
  disabled,
  icon: Icon,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-[11px] font-medium text-ink-300 transition-colors hover:bg-ink/[0.05] disabled:opacity-50"
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  )
}

// "Chrome 140 · macOS". Good enough to spot "only ever Safari" at a glance;
// the raw string is in the copied report for anything finer.
function describeBrowser(ua: string | undefined): string {
  if (!ua) return '—'
  const os = /iPad/.test(ua) ? 'iPad'
    : /iPhone/.test(ua) ? 'iPhone'
      : /Android/.test(ua) ? 'Android'
        : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
          : /Windows/.test(ua) ? 'Windows'
            : /Linux/.test(ua) ? 'Linux'
              : ''
  const browsers: Array<[RegExp, string]> = [
    [/Edg\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)/, 'Opera'],
    [/CriOS\/(\d+)/, 'Chrome'],
    [/FxiOS\/(\d+)/, 'Firefox'],
    [/Firefox\/(\d+)/, 'Firefox'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+)[\d.]* .*Safari/, 'Safari'],
  ]
  for (const [re, name] of browsers) {
    const m = ua.match(re)
    if (m) return [`${name} ${m[1]}`, os].filter(Boolean).join(' · ')
  }
  return os || ua.slice(0, 40)
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${(s / 3600).toFixed(1)}h`
}

function describeTrail(trail: ReportContext['trail']): string {
  if (!trail || trail.length === 0) return '—'
  return trail.map(([app, ago]) => `${appName(app)} (${formatSeconds(ago)} before)`).join(' → ')
}

// The whole group as a Markdown bug report, ready to paste into Claude Code.
// Everything a fix needs and nothing that identifies a member: counts, not names.
function reportForClaude(g: ErrorGroup, latest: ReportRow | null, rowsLoaded: number | null): string {
  const ctx = latest?.context ?? null
  const fence = (text: string) => `\`\`\`\n${text.replace(/```/g, "'''")}\n\`\`\``
  const lines = [
    `## Bug report from UGC OS (Admin → Errors)`,
    '',
    `- **Kind:** ${KIND_LABEL[g.kind]}. ${KIND_HINT[g.kind]}`,
    g.app_id ? `- **App:** ${appName(g.app_id)} (\`${g.app_id}\`, the app the member was in)` : null,
    g.operation ? `- **Operation:** ${g.operation}` : null,
    `- **Hit by:** ${g.members} ${g.members === 1 ? 'member' : 'members'}, ${g.occurrences.toLocaleString()} times`,
    `- **First seen:** ${g.first_seen} · **Last seen:** ${g.last_seen}`,
    `- **Build:** ${latest?.build_id ?? g.build_id ?? 'unknown'}`,
    ctx ? `- **Browser:** ${ctx.browser ?? 'unknown'}` : null,
    ctx ? `- **Screen:** ${ctx.viewport ?? '?'} · **Page:** ${ctx.path ?? '?'} · **Online:** ${ctx.online === false ? 'no' : 'yes'} · **Into session:** ${ctx.session_s !== undefined ? formatSeconds(ctx.session_s) : '?'}` : null,
    ctx?.trail?.length ? `- **Recent apps:** ${describeTrail(ctx.trail)}` : null,
    rowsLoaded !== null && rowsLoaded > 1 ? `- Stack and context below are from the most recent of ${rowsLoaded} reports.` : null,
    '',
    g.kind === 'failed' && g.shown ? `**What the member saw:**\n\n> ${g.shown}\n` : null,
    `**Error${ctx?.name ? ` (${ctx.name})` : ''}:**`,
    '',
    fence(latest?.message ?? g.message),
    latest?.stack ? `\n**Stack:**\n\n${fence(latest.stack)}` : null,
    ctx?.component_stack ? `\n**Component stack:**\n\n${fence(ctx.component_stack)}` : null,
    '',
    'The build is a production bundle, so function names in the stack are minified. Find the cause in the source, fix it, and say how to confirm the fix.',
  ]
  return lines.filter((l) => l !== null).join('\n')
}
