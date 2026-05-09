import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Ban, CheckCircle2 } from 'lucide-react'
import { getSupabase } from '../../lib/supabase'

interface MemberRow {
  id: string
  email: string
  display_name: string | null
  is_admin: boolean
  disabled_at: string | null
  created_at: string
  last_active_at: string | null
  total_bytes: number
  asset_count: number
}

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

export default function MembersTable() {
  const [rows, setRows] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    // 15s timeout so the spinner can't hang forever — if Supabase doesn't
    // respond, surface the failure instead of leaving the user staring at
    // a wheel.
    const timeout = new Promise<never>((_, reject) => setTimeout(
      () => reject(new Error('Timed out after 15s waiting for Supabase. Open DevTools → Network to see which request stalled.')),
      15_000,
    ))
    try {
      const sb = getSupabase()
      // Run the two reads independently so a hang in one doesn't take down
      // the other — and surface them separately so we know which one broke.
      const profilesRes = await Promise.race([
        sb.from('profiles').select('id, email, display_name, is_admin, disabled_at, created_at, last_active_at').order('created_at', { ascending: false }),
        timeout,
      ])
      if (profilesRes.error) throw new Error(`profiles read failed: ${profilesRes.error.message}`)
      const storageRes = await Promise.race([
        sb.from('member_storage').select('user_id, total_bytes, asset_count'),
        timeout,
      ])
      if (storageRes.error) throw new Error(`member_storage read failed: ${storageRes.error.message}`)

      const storageMap = new Map<string, { total_bytes: number; asset_count: number }>()
      for (const s of storageRes.data ?? []) {
        storageMap.set(s.user_id as string, { total_bytes: Number(s.total_bytes), asset_count: Number(s.asset_count) })
      }
      const merged: MemberRow[] = (profilesRes.data ?? []).map((p) => ({
        ...(p as Omit<MemberRow, 'total_bytes' | 'asset_count'>),
        total_bytes: storageMap.get(p.id as string)?.total_bytes ?? 0,
        asset_count: storageMap.get(p.id as string)?.asset_count ?? 0,
      }))
      setRows(merged)
    } catch (e) {
      console.error('[admin] members load failed', e)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function toggleDisabled(row: MemberRow) {
    setBusyId(row.id)
    try {
      const sb = getSupabase()
      const next = row.disabled_at ? null : new Date().toISOString()
      const { error } = await sb.from('profiles').update({ disabled_at: next }).eq('id', row.id)
      if (error) throw error
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return <div className="flex h-32 items-center justify-center text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /></div>
  }

  if (error) {
    return <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-300">{error}</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-zinc-400">{rows.length} members</div>
        <button onClick={load} className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.05]">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/10">
        <table className="w-full text-[12px]">
          <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Email</th>
              <th className="px-3 py-2 text-left font-medium">Joined</th>
              <th className="px-3 py-2 text-left font-medium">Storage</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <tr key={r.id} className="text-zinc-300">
                <td className="px-3 py-2">
                  <div className="font-medium text-zinc-200">{r.email}</div>
                  {r.is_admin && <div className="text-[10px] uppercase tracking-wider text-amber-400">Admin</div>}
                </td>
                <td className="px-3 py-2 text-zinc-400">{formatDate(r.created_at)}</td>
                <td className="px-3 py-2 text-zinc-400">{formatBytes(r.total_bytes)} <span className="text-zinc-600">({r.asset_count})</span></td>
                <td className="px-3 py-2">
                  {r.disabled_at ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-300"><Ban className="h-2.5 w-2.5" /> Disabled</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300"><CheckCircle2 className="h-2.5 w-2.5" /> Active</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => toggleDisabled(r)}
                    disabled={busyId === r.id || r.is_admin}
                    className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.05] disabled:opacity-40"
                  >
                    {r.disabled_at ? 'Re-enable' : 'Disable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
