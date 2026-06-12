import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Ban, CheckCircle2, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react'
import { getSupabase } from '../../lib/supabase'

interface MemberRow {
  id: string
  email: string
  display_name: string | null
  first_name: string | null
  last_name: string | null
  is_admin: boolean
  disabled_at: string | null
  created_at: string
  last_active_at: string | null
  total_bytes: number
  asset_count: number
  // Activity counters from member_activity view
  products: number
  models: number
  scripts: number
  voices: number
  brolls: number
  voice_history: number
  video_history: number
  assets_last_7d: number
}

// Render "First Last" with whichever fields are present; falls back to
// display_name, otherwise an em-dash placeholder.
function memberName(r: Pick<MemberRow, 'first_name' | 'last_name' | 'display_name'>): string {
  const joined = [r.first_name, r.last_name].filter(Boolean).join(' ').trim()
  if (joined) return joined
  return (r.display_name ?? '').trim()
}

const QUERY_TIMEOUT_MS = 15_000

function formatBytes(n: number): string {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// "2 days ago", "3h ago", etc. Used for last_active_at.
function formatRelative(s: string | null): string {
  if (!s) return 'never'
  const d = new Date(s).getTime()
  const diff = Date.now() - d
  if (diff < 60_000) return 'just now'
  if (diff < 60 * 60_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 24 * 60 * 60_000) return `${Math.round(diff / (60 * 60_000))}h ago`
  const days = Math.round(diff / (24 * 60 * 60_000))
  if (days < 30) return `${days}d ago`
  return formatDate(s)
}

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

export default function MembersTable() {
  const [rows, setRows] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [profilesError, setProfilesError] = useState<string | null>(null)
  const [storageWarning, setStorageWarning] = useState<string | null>(null)
  const [activityWarning, setActivityWarning] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [slowHint, setSlowHint] = useState(false)

  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  async function load() {
    setLoading(true)
    setProfilesError(null)
    setStorageWarning(null)
    setActivityWarning(null)
    setSlowHint(false)
    const slowTimer = setTimeout(() => setSlowHint(true), 3000)

    try {
      const sb = getSupabase()
      // Three independent settled loads. profiles is the load-bearing one;
      // member_storage and member_activity each fall back to zeros if they
      // fail, so a single bad view doesn't blank the whole table.
      const [profilesRes, storageRes, activityRes] = await Promise.allSettled([
        withTimeout(
          sb.from('profiles').select('id, email, display_name, first_name, last_name, is_admin, disabled_at, created_at, last_active_at'),
          QUERY_TIMEOUT_MS,
          'profiles query',
        ),
        withTimeout(
          sb.from('member_storage').select('user_id, total_bytes, asset_count'),
          QUERY_TIMEOUT_MS,
          'storage view',
        ),
        withTimeout(
          sb.from('member_activity').select('user_id, products, models, scripts, voices, brolls, voice_history, video_history, assets_last_7d'),
          QUERY_TIMEOUT_MS,
          'activity view',
        ),
      ])

      if (profilesRes.status === 'rejected') {
        setProfilesError(profilesRes.reason instanceof Error ? profilesRes.reason.message : String(profilesRes.reason))
        return
      }
      if ((profilesRes.value as { error: unknown }).error) {
        const err = (profilesRes.value as { error: { message: string } }).error
        setProfilesError(err.message)
        return
      }

      const storageMap = new Map<string, { total_bytes: number; asset_count: number }>()
      if (storageRes.status === 'fulfilled' && !(storageRes.value as { error: unknown }).error) {
        const data = (storageRes.value as { data: Array<{ user_id: string; total_bytes: number; asset_count: number }> }).data ?? []
        for (const s of data) storageMap.set(s.user_id, { total_bytes: Number(s.total_bytes), asset_count: Number(s.asset_count) })
      } else {
        const reason = storageRes.status === 'rejected'
          ? (storageRes.reason instanceof Error ? storageRes.reason.message : String(storageRes.reason))
          : ((storageRes.value as { error?: { message: string } }).error?.message ?? 'unknown error')
        setStorageWarning(`Storage stats unavailable (${reason}).`)
      }

      type ActivityRow = {
        user_id: string
        products: number; models: number; scripts: number; voices: number
        brolls: number; voice_history: number; video_history: number; assets_last_7d: number
      }
      const activityMap = new Map<string, Omit<ActivityRow, 'user_id'>>()
      if (activityRes.status === 'fulfilled' && !(activityRes.value as { error: unknown }).error) {
        const data = (activityRes.value as { data: ActivityRow[] }).data ?? []
        for (const a of data) {
          activityMap.set(a.user_id, {
            products: Number(a.products), models: Number(a.models),
            scripts: Number(a.scripts), voices: Number(a.voices),
            brolls: Number(a.brolls), voice_history: Number(a.voice_history),
            video_history: Number(a.video_history), assets_last_7d: Number(a.assets_last_7d),
          })
        }
      } else {
        const reason = activityRes.status === 'rejected'
          ? (activityRes.reason instanceof Error ? activityRes.reason.message : String(activityRes.reason))
          : ((activityRes.value as { error?: { message: string } }).error?.message ?? 'unknown error')
        setActivityWarning(`Activity counts unavailable (${reason}). Did you run 0002_member_activity.sql?`)
      }

      const profilesData = (profilesRes.value as { data: Array<Pick<MemberRow, 'id' | 'email' | 'display_name' | 'first_name' | 'last_name' | 'is_admin' | 'disabled_at' | 'created_at' | 'last_active_at'>> }).data ?? []
      const merged: MemberRow[] = profilesData.map((p) => {
        const s = storageMap.get(p.id)
        const a = activityMap.get(p.id)
        return {
          ...p,
          total_bytes: s?.total_bytes ?? 0,
          asset_count: s?.asset_count ?? 0,
          products: a?.products ?? 0,
          models: a?.models ?? 0,
          scripts: a?.scripts ?? 0,
          voices: a?.voices ?? 0,
          brolls: a?.brolls ?? 0,
          voice_history: a?.voice_history ?? 0,
          video_history: a?.video_history ?? 0,
          assets_last_7d: a?.assets_last_7d ?? 0,
        }
      })
      setRows(merged)
    } catch (e) {
      setProfilesError(e instanceof Error ? e.message : String(e))
    } finally {
      clearTimeout(slowTimer)
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

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
      await load()
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

  const sortedRows = useMemo(() => {
    const arr = [...rows]
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
  }, [rows, sortKey, sortDir])

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
        <button onClick={load} className="flex items-center gap-1.5 rounded-md border border-ink/10 px-2.5 py-1 text-[11px] text-ink-300 transition-colors hover:bg-ink/[0.05]">
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
        <button onClick={load} className="flex items-center gap-1.5 rounded-md border border-ink/10 px-2.5 py-1 text-[11px] text-ink-300 transition-colors hover:bg-ink/[0.05]">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
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
            {sortedRows.map((r) => {
              const name = memberName(r)
              return (
              <tr key={r.id} className="text-ink-300">
                <td className="px-3 py-2 align-top">
                  <div className="font-medium text-ink-200">{name || <span className="text-ink-600">—</span>}</div>
                  {r.is_admin && <div className="text-[10px] uppercase tracking-wider text-amber-400 light:text-amber-600">Admin</div>}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="text-ink-300">{r.email}</div>
                  <div className="mt-1 text-[10px] text-ink-500">
                    {r.products}p · {r.models}m · {r.scripts}s · {r.voices}v · {r.brolls}b · {r.video_history}vid
                  </div>
                </td>
                <td className="px-3 py-2 align-top text-ink-400">{formatDate(r.created_at)}</td>
                <td className="px-3 py-2 align-top text-ink-400">{formatRelative(r.last_active_at)}</td>
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
        Bank counts: <span className="text-ink-500">p</span>roducts · <span className="text-ink-500">m</span>odels · <span className="text-ink-500">s</span>cripts · <span className="text-ink-500">v</span>oices · <span className="text-ink-500">b</span>-rolls · <span className="text-ink-500">vid</span>eos.
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
