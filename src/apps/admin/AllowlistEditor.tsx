import { useEffect, useState } from 'react'
import { Loader2, Trash2, Plus, RefreshCw } from 'lucide-react'
import { getSupabase } from '../../lib/supabase'

interface AllowlistRow {
  email: string
  source: string
  added_at: string
  notes: string | null
}

export default function AllowlistEditor() {
  const [rows, setRows] = useState<AllowlistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draftEmail, setDraftEmail] = useState('')
  const [adding, setAdding] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const sb = getSupabase()
      const { data, error } = await sb.from('allowlist').select('email, source, added_at, notes').order('added_at', { ascending: false })
      if (error) throw error
      setRows((data ?? []) as AllowlistRow[])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleAdd() {
    const email = draftEmail.trim().toLowerCase()
    if (!email) return
    setAdding(true)
    try {
      const sb = getSupabase()
      const { error } = await sb.from('allowlist').insert({ email, source: 'manual' })
      if (error) throw error
      setDraftEmail('')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(email: string) {
    if (!confirm(`Remove ${email} from the allowlist? They will be signed out and disabled.`)) return
    try {
      const sb = getSupabase()
      const { error } = await sb.from('allowlist').delete().eq('email', email)
      if (error) throw error
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-zinc-500">
        Emails on this list can sign up. Zapier writes here when members join your Skool. Removing an email also disables the matching account.
      </p>

      <div className="flex items-center gap-2">
        <input
          type="email"
          value={draftEmail}
          onChange={(e) => setDraftEmail(e.target.value)}
          placeholder="email@example.com"
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.07]"
        />
        <button
          onClick={handleAdd}
          disabled={!draftEmail.trim() || adding}
          className="flex items-center gap-1.5 rounded-lg bg-white py-2 px-3 text-[12px] font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-60"
        >
          {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add
        </button>
        <button onClick={load} className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-2 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.05]">
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-300">{error}</div>}

      {loading ? (
        <div className="flex h-32 items-center justify-center text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/10">
          <table className="w-full text-[12px]">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-left font-medium">Added</th>
                <th className="px-3 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-zinc-500">Empty — Zapier zap not yet wired, or no members yet.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.email}>
                  <td className="px-3 py-2 text-zinc-200">{r.email}</td>
                  <td className="px-3 py-2 text-zinc-400">{r.source}</td>
                  <td className="px-3 py-2 text-zinc-400">{new Date(r.added_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => handleDelete(r.email)}
                      className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
