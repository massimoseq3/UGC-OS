import { useMemo, useState } from 'react'
import { Loader2, RefreshCw, Ban, CheckCircle2, AlertTriangle, ChevronUp, ChevronDown, Search, Download, Clock } from 'lucide-react'
import { getSupabase } from '../../lib/supabase'
import {
  useMembers, memberName, formatBytes, formatDate, formatRelative,
  daysSinceActive, isInactive, isActivated, INACTIVE_DAYS,
  type MemberRow,
} from './useMembers'

const QUERY_TIMEOUT_MS = 15_000

function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

type SortKey = 'name' | 'email' | 'created_at' | 'last_active_at' | 'total_bytes' | 'assets_last_7d'
type SortDir = 'asc' | 'desc'
type StatusFilter = 'all' | 'active' | 'inactive' | 'unactivated' | 'disabled'

// One CSV field: quote-wrap and escape embedded quotes when needed.
function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadMembersCsv(rows: MemberRow[]) {
  const header = [
    'Name', 'Email', 'Status', 'Admin', 'Joined', 'Last active', 'Days inactive',
    'Storage bytes', 'Assets', 'Products', 'Influencers', 'Scripts', 'Voices',
    'B-rolls', 'Voiceovers', 'Videos', 'Assets last 7d',
  ]
  const lines = rows.map((r) => [
    memberName(r) || '—',
    r.email,
    r.disabled_at ? 'Disabled' : isInactive(r) ? 'Inactive' : 'Active',
    r.is_admin ? 'yes' : 'no',
    formatDate(r.created_at),
    r.last_active_at ? formatDate(r.last_active_at) : 'never',
    Number.isFinite(daysSinceActive(r)) ? daysSinceActive(r) : '',
    r.total_bytes,
    r.asset_count,
    r.products, r.models, r.scripts, r.voices, r.brolls, r.voice_history, r.video_history,
    r.assets_last_7d,
  ].map(csvCell).join(','))

  const csv = [header.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ugc-members-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function MembersTable() {
  const { rows, loading, slowHint, profilesError, storageWarning, activityWarning, reload } = useMembers()
  const [busyId, setBusyId] = useState<string | null>(null)

  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')

  async function toggleDisabled(row: MemberRow) {
    setBusyId(row.id)
    try {
      const sb = getSupabase()
      const next = row.disabled_at ? null : new Date().toISOString()
      const { error } = await withTimeout(
        sb.from('profiles').update({ disabled_at: next }).eq('id', row.id),
        QUERY_TIMEOUT_MS,
        'profile update',
      ) as { error: { message: string } | null }
      if (error) throw error
      await reload()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      // Sensible default direction per column
      setSortDir(key === 'email' || key === 'name' ? 'asc' : 'desc')
    }
  }

  const counts = useMemo(() => {
    let disabled = 0, inactive = 0, unactivated = 0
    for (const r of rows) {
      if (r.disabled_at) { disabled++; continue }
      if (isInactive(r)) inactive++
      if (!isActivated(r)) unactivated++
    }
    return { all: rows.length, active: rows.length - disabled, disabled, inactive, unactivated }
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter === 'active' && r.disabled_at) return false
      if (statusFilter === 'disabled' && !r.disabled_at) return false
      if (statusFilter === 'inactive' && !isInactive(r)) return false
      if (statusFilter === 'unactivated' && (r.disabled_at || isActivated(r))) return false
      if (q && !r.email.toLowerCase().includes(q) && !memberName(r).toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, statusFilter, query])

  const sortedRows = useMemo(() => {
    const arr = [...filteredRows]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name':
          cmp = memberName(a).localeCompare(memberName(b))
          break
        case 'email':
          cmp = a.email.localeCompare(b.email)
          break
        case 'created_at':
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'last_active_at': {
          const av = a.last_active_at ? new Date(a.last_active_at).getTime() : new Date(a.created_at).getTime()
          const bv = b.last_active_at ? new Date(b.last_active_at).getTime() : new Date(b.created_at).getTime()
          cmp = av - bv
          break
        }
        case 'total_bytes':
          cmp = a.total_bytes - b.total_bytes
          break
        case 'assets_last_7d':
          cmp = a.assets_last_7d - b.assets_last_7d
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filteredRows, sortKey, sortDir])

  // Footer aggregates — rendered independent of sort
  const totals = useMemo(() => {
    const totalBytes = rows.reduce((s, r) => s + r.total_bytes, 0)
    const totalAssets7d = rows.reduce((s, r) => s + r.assets_last_7d, 0)
    return { totalBytes, totalAssets7d }
  }, [rows])

  if (loading) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 text-ink-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {slowHint && <span className="text-[11px]">Still loading… retrying via timeout if it stalls.</span>}
      </div>
    )
  }

  if (profilesError) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-300 light:text-red-700">
          {profilesError}
        </div>
        <button onClick={reload} className="flex items-center gap-1.5 rounded-md border border-ink/10 px-2.5 py-1 text-[11px] text-ink-300 transition-colors hover:bg-ink/[0.05]">
          <RefreshCw className="h-3 w-3" /> Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-ink-400">
          <span className="text-ink-200">{rows.length}</span> {rows.length === 1 ? 'member' : 'members'}
          <span className="text-ink-600"> · {formatBytes(totals.totalBytes)} total · {totals.totalAssets7d} {totals.totalAssets7d === 1 ? 'generation' : 'generations'} this week</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadMembersCsv(sortedRows)}
            disabled={sortedRows.length === 0}
            title="Export the rows currently shown"
            className="flex items-center gap-1.5 rounded-md border border-ink/10 px-2.5 py-1 text-[11px] text-ink-300 transition-colors hover:bg-ink/[0.05] disabled:opacity-40"
          >
            <Download className="h-3 w-3" /> Export CSV
          </button>
          <button onClick={reload} className="flex items-center gap-1.5 rounded-md border border-ink/10 px-2.5 py-1 text-[11px] text-ink-300 transition-colors hover:bg-ink/[0.05]">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="w-full rounded-full border border-ink/10 bg-ink/[0.03] py-1.5 pl-8 pr-3 text-[12px] text-ink-200 outline-none transition-colors placeholder:text-ink-600 focus:border-ink/20"
          />
        </div>
        <div className="flex items-center gap-0.5 rounded-full border border-ink/10 bg-ink/[0.03] p-0.5">
          {([
            ['all', 'All', counts.all],
            ['active', 'Active', counts.active],
            ['inactive', `Inactive ${INACTIVE_DAYS}d+`, counts.inactive],
            ['unactivated', 'Never used', counts.unactivated],
            ['disabled', 'Disabled', counts.disabled],
          ] as Array<[StatusFilter, string, number]>).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                statusFilter === key ? 'bg-ink text-paper' : 'text-ink-400 hover:text-ink-200'
              }`}
            >
              {label} <span className={statusFilter === key ? 'text-paper/60' : 'text-ink-600'}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      {storageWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200 light:text-amber-800">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{storageWarning}</span>
        </div>
      )}
      {activityWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200 light:text-amber-800">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{activityWarning}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-ink/10">
        <table className="w-full text-[12px]">
          <thead className="bg-ink/[0.03] text-[11px] uppercase tracking-wider text-ink-500">
            <tr>
              <SortableTh label="Name" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortableTh label="Email" k="email" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortableTh label="Joined" k="created_at" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortableTh label="Last active" k="last_active_at" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortableTh label="Storage" k="total_bytes" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortableTh label="7-day activity" k="assets_last_7d" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-[12px] text-ink-500">
                  No members match this filter.
                </td>
              </tr>
            )}
            {sortedRows.map((r) => {
              const name = memberName(r)
              const inactive = isInactive(r)
              return (
              <tr key={r.id} className="text-ink-300">
                <td className="px-3 py-2 align-top">
                  <div className="font-medium text-ink-200">{name || <span className="text-ink-600">—</span>}</div>
                  {r.is_admin && <div className="text-[10px] uppercase tracking-wider text-amber-400 light:text-amber-600">Admin</div>}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="text-ink-300">{r.email}</div>
                  <div className="mt-1 text-[10px] text-ink-500">
                    {r.products}p · {r.models}i · {r.scripts}s · {r.voices}v · {r.brolls}b · {r.video_history}vid
                  </div>
                </td>
                <td className="px-3 py-2 align-top text-ink-400">{formatDate(r.created_at)}</td>
                <td className="px-3 py-2 align-top text-ink-400">
                  <span className={inactive ? 'text-amber-400 light:text-amber-600' : undefined}>{formatRelative(r.last_active_at)}</span>
                </td>
                <td className="px-3 py-2 align-top text-ink-400">
                  {formatBytes(r.total_bytes)}
                  <span className="text-ink-600"> ({r.asset_count})</span>
                </td>
                <td className="px-3 py-2 align-top text-ink-400">
                  {r.assets_last_7d > 0 ? (
                    <span className="text-ink-200">{r.assets_last_7d}</span>
                  ) : (
                    <span className="text-ink-600">0</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  {r.disabled_at ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-300 light:text-red-700"><Ban className="h-2.5 w-2.5" /> Disabled</span>
                  ) : inactive ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300 light:text-amber-700"><Clock className="h-2.5 w-2.5" /> Inactive</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300 light:text-emerald-700"><CheckCircle2 className="h-2.5 w-2.5" /> Active</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-right">
                  <button
                    onClick={() => toggleDisabled(r)}
                    disabled={busyId === r.id || r.is_admin}
                    className="rounded-md border border-ink/10 px-2 py-1 text-[11px] text-ink-300 transition-colors hover:bg-ink/[0.05] disabled:opacity-40"
                  >
                    {r.disabled_at ? 'Re-enable' : 'Disable'}
                  </button>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-ink-600">
        Bank counts: <span className="text-ink-500">p</span>roducts · <span className="text-ink-500">i</span>nfluencers · <span className="text-ink-500">s</span>cripts · <span className="text-ink-500">v</span>oices · <span className="text-ink-500">b</span>-rolls · <span className="text-ink-500">vid</span>eos.
      </p>
    </div>
  )
}

function SortableTh({
  label, k, sortKey, sortDir, onClick,
}: {
  label: string
  k: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onClick: (k: SortKey) => void
}) {
  const active = sortKey === k
  return (
    <th
      onClick={() => onClick(k)}
      className="cursor-pointer select-none px-3 py-2 text-left font-medium transition-colors hover:text-ink-300"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </span>
    </th>
  )
}
