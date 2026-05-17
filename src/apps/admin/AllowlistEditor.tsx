import { useEffect, useRef, useState } from 'react'
import { Loader2, Trash2, Plus, RefreshCw, Upload, X } from 'lucide-react'
import { getSupabase } from '../../lib/supabase'

interface AllowlistRow {
  email: string
  source: string
  added_at: string
  notes: string | null
  first_name: string | null
  last_name: string | null
}

interface CsvEntry {
  email: string
  firstName: string | null
  lastName: string | null
}

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

// Parse one CSV line, respecting double-quoted fields with embedded commas/quotes.
// Skool's export uses simple unquoted CSV but other tools (Numbers, Excel) quote
// fields containing commas, so we handle both.
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = false }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Find the email column from a header row + body. Prefers a column literally
// named "email" (case-insensitive); falls back to the first column where the
// majority of values look like email addresses.
function detectEmailColumn(header: string[], rows: string[][]): number {
  const idxByName = header.findIndex((h) => h.toLowerCase().trim() === 'email')
  if (idxByName !== -1) return idxByName

  let bestIdx = -1
  let bestScore = 0
  for (let col = 0; col < header.length; col++) {
    let hits = 0
    for (const row of rows) {
      const v = (row[col] ?? '').trim()
      if (v && EMAIL_RE.test(v)) hits++
    }
    if (hits > bestScore) { bestScore = hits; bestIdx = col }
  }
  return bestIdx
}

// Match Skool's CSV header variants for name columns. Returns -1 if absent.
function detectNameColumn(header: string[], kind: 'first' | 'last'): number {
  const firstNames = ['first name', 'firstname', 'first', 'given name', 'givenname']
  const lastNames = ['last name', 'lastname', 'last', 'surname', 'family name', 'familyname']
  const wanted = kind === 'first' ? firstNames : lastNames
  return header.findIndex((h) => wanted.includes(h.toLowerCase().trim()))
}

interface ImportPreview {
  fileName: string
  newEntries: CsvEntry[]      // brand-new emails (with optional names)
  // Existing allowlist rows whose names we'll refresh from the CSV (no email
  // change, just name fields). Skipped when the CSV row carries no name.
  nameUpdates: CsvEntry[]
  duplicates: string[]         // already on allowlist, no name change to push
  invalid: string[]            // failed regex
  // Allowlist emails NOT present in the CSV. Only removed if the user opts in
  // to sync mode in the modal. Excludes admin sources to avoid accidentally
  // booting yourself.
  removable: string[]
}

export default function AllowlistEditor() {
  const [rows, setRows] = useState<AllowlistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draftEmail, setDraftEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [slowHint, setSlowHint] = useState(false)

  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    setSlowHint(false)
    const slowTimer = setTimeout(() => setSlowHint(true), 3000)
    try {
      const sb = getSupabase()
      const { data, error } = await withTimeout(
        sb.from('allowlist').select('email, source, added_at, notes, first_name, last_name').order('added_at', { ascending: false }),
        QUERY_TIMEOUT_MS,
        'allowlist query',
      ) as { data: AllowlistRow[] | null; error: { message: string } | null }
      if (error) throw error
      setRows(data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      clearTimeout(slowTimer)
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
      const { error } = await withTimeout(
        sb.from('allowlist').insert({ email, source: 'manual' }),
        QUERY_TIMEOUT_MS,
        'allowlist insert',
      ) as { error: { message: string } | null }
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
      const { error } = await withTimeout(
        sb.from('allowlist').delete().eq('email', email),
        QUERY_TIMEOUT_MS,
        'allowlist delete',
      ) as { error: { message: string } | null }
      if (error) throw error
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  // ── CSV bulk import ────────────────────────────────────────────────

  function pickFile() {
    fileInputRef.current?.click()
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-pick of the same file later
    if (!file) return

    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
      if (lines.length === 0) {
        alert('CSV is empty.')
        return
      }

      const header = parseCsvLine(lines[0])
      const body = lines.slice(1).map(parseCsvLine)
      const emailCol = detectEmailColumn(header, body)
      const firstCol = emailCol === -1 ? -1 : detectNameColumn(header, 'first')
      const lastCol = emailCol === -1 ? -1 : detectNameColumn(header, 'last')

      // Collect (email, firstName, lastName) tuples. If we couldn't detect an
      // email column we fall back to "every cell is a possible email" and
      // skip name columns entirely.
      let candidates: CsvEntry[] = []
      const norm = (v: string | undefined): string | null => {
        const t = (v ?? '').trim()
        return t.length > 0 ? t : null
      }
      if (emailCol === -1) {
        candidates = [header, ...body].flat()
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
          .map((email) => ({ email, firstName: null, lastName: null }))
      } else {
        candidates = body
          .map((row) => ({
            email: (row[emailCol] ?? '').trim().toLowerCase(),
            firstName: firstCol === -1 ? null : norm(row[firstCol]),
            lastName: lastCol === -1 ? null : norm(row[lastCol]),
          }))
          .filter((e) => e.email.length > 0)
      }

      // De-dupe within the file (last occurrence wins for name fields).
      const byEmail = new Map<string, CsvEntry>()
      for (const c of candidates) byEmail.set(c.email, c)
      const deduped = Array.from(byEmail.values())

      const valid: CsvEntry[] = []
      const invalid: string[] = []
      for (const c of deduped) {
        if (EMAIL_RE.test(c.email)) valid.push(c)
        else invalid.push(c.email)
      }

      const existingByEmail = new Map(rows.map((r) => [r.email.toLowerCase(), r]))
      const newEntries: CsvEntry[] = []
      const nameUpdates: CsvEntry[] = []
      const duplicates: string[] = []
      for (const v of valid) {
        const existing = existingByEmail.get(v.email)
        if (!existing) {
          newEntries.push(v)
        } else if (
          (v.firstName !== null && v.firstName !== existing.first_name) ||
          (v.lastName !== null && v.lastName !== existing.last_name)
        ) {
          nameUpdates.push(v)
        } else {
          duplicates.push(v.email)
        }
      }

      // Sync candidates: rows that are on the allowlist but NOT in the CSV.
      // Skip rows whose source is anything other than 'manual' or 'csv-import'
      // — that protects 'admin'-flagged or future Zapier-flagged seeds from
      // being clobbered by a stale CSV. If you want to remove an admin you
      // can still do it manually with the trash button.
      const csvSet = new Set(valid.map((v) => v.email))
      const removable: string[] = rows
        .filter((r) => !csvSet.has(r.email.toLowerCase()))
        .filter((r) => r.source === 'manual' || r.source === 'csv-import')
        .map((r) => r.email.toLowerCase())

      setPreview({
        fileName: file.name,
        newEntries,
        nameUpdates,
        duplicates,
        invalid,
        removable,
      })
    } catch (e) {
      alert(`Failed to read CSV: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function confirmImport(syncMode: boolean) {
    if (!preview) return
    const willAdd = preview.newEntries.length
    const willUpdate = preview.nameUpdates.length
    const willRemove = syncMode ? preview.removable.length : 0
    if (willAdd === 0 && willUpdate === 0 && willRemove === 0) { setPreview(null); return }
    setImporting(true)
    try {
      const sb = getSupabase()
      // Adds first, then name-only updates, then optional removes. RLS on
      // `allowlist` is admin-only, so each batch is a single round trip. The
      // on_allowlist_insert + on_allowlist_update_names triggers cascade
      // names into the matching profile rows.
      if (willAdd > 0) {
        const { error } = await withTimeout(
          sb.from('allowlist').upsert(
            preview.newEntries.map((e) => ({
              email: e.email,
              source: 'csv-import',
              first_name: e.firstName,
              last_name: e.lastName,
            })),
            { onConflict: 'email', ignoreDuplicates: true },
          ),
          30_000,
          'bulk import (add)',
        ) as { error: { message: string } | null }
        if (error) throw error
      }
      if (willUpdate > 0) {
        // Per-row UPDATE (not upsert) so we don't clobber source/added_at.
        // Batched in parallel for speed.
        const results = await Promise.allSettled(preview.nameUpdates.map((e) =>
          withTimeout(
            sb.from('allowlist').update({
              first_name: e.firstName,
              last_name: e.lastName,
            }).eq('email', e.email),
            30_000,
            `name update ${e.email}`,
          ) as Promise<{ error: { message: string } | null }>,
        ))
        const failures = results.filter((r) => r.status === 'rejected'
          || (r.status === 'fulfilled' && r.value.error))
        if (failures.length > 0) {
          const first = failures[0]
          const msg = first.status === 'rejected'
            ? (first.reason instanceof Error ? first.reason.message : String(first.reason))
            : (first.value.error?.message ?? 'unknown error')
          throw new Error(`${failures.length} name update(s) failed: ${msg}`)
        }
      }
      if (willRemove > 0) {
        const { error } = await withTimeout(
          sb.from('allowlist').delete().in('email', preview.removable),
          30_000,
          'bulk import (remove)',
        ) as { error: { message: string } | null }
        if (error) throw error
      }
      setPreview(null)
      await load()
    } catch (e) {
      alert(`Import failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-zinc-500">
        Emails on this list can sign up. Until your Zapier zap is wired, you can bulk-import a Skool members CSV — and re-upload it later with sync mode enabled to also remove members who left. Removing an email also signs out and disables the matching account.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={draftEmail}
          onChange={(e) => setDraftEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          placeholder="email@example.com"
          className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.07]"
        />
        <button
          onClick={handleAdd}
          disabled={!draftEmail.trim() || adding}
          className="flex items-center gap-1.5 rounded-lg bg-white py-2 px-3 text-[12px] font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-60"
        >
          {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add
        </button>
        <button
          onClick={pickFile}
          className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] py-2 px-3 text-[12px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.08]"
          title="Bulk-import emails from a CSV (e.g. Skool member export)"
        >
          <Upload className="h-3 w-3" />
          Import CSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFileChosen}
          className="hidden"
        />
        <button onClick={load} className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-2 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.05]">
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {error && (
        <div className="space-y-2">
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-300">{error}</div>
          <button onClick={load} className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.05]">
            <RefreshCw className="h-3 w-3" /> Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {slowHint && <span className="text-[11px]">Still loading… will time out if it stalls.</span>}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/10">
          <table className="w-full text-[12px]">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-left font-medium">Added</th>
                <th className="px-3 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-zinc-500">Empty — Zapier zap not yet wired, or no members yet.</td></tr>
              )}
              {rows.map((r) => {
                const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ')
                return (
                <tr key={r.email}>
                  <td className="px-3 py-2 text-zinc-200">
                    {fullName || <span className="text-zinc-600">—</span>}
                  </td>
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
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {preview && (
        <ImportPreviewModal
          preview={preview}
          importing={importing}
          onCancel={() => setPreview(null)}
          onConfirm={confirmImport}
        />
      )}
    </div>
  )
}

function ImportPreviewModal({
  preview,
  importing,
  onCancel,
  onConfirm,
}: {
  preview: ImportPreview
  importing: boolean
  onCancel: () => void
  onConfirm: (syncMode: boolean) => void
}) {
  const [syncMode, setSyncMode] = useState(false)
  const willRemove = syncMode ? preview.removable.length : 0
  const willAdd = preview.newEntries.length
  const willUpdate = preview.nameUpdates.length

  let cta: string
  if (willAdd === 0 && willUpdate === 0 && willRemove === 0) cta = 'Nothing to do'
  else {
    const bits: string[] = []
    if (willAdd > 0) bits.push(`add ${willAdd}`)
    if (willUpdate > 0) bits.push(`update ${willUpdate}`)
    if (willRemove > 0) bits.push(`remove ${willRemove}`)
    cta = bits.map((b, i) => i === 0 ? b[0].toUpperCase() + b.slice(1) : b).join(' & ')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B0B0D] p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Import preview</h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">From <span className="text-zinc-300">{preview.fileName}</span></p>
          </div>
          <button onClick={onCancel} className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <Stat color="emerald" label="New emails to add" value={preview.newEntries.length} />
          {preview.nameUpdates.length > 0 && (
            <Stat color="sky" label="Existing — name update" value={preview.nameUpdates.length} />
          )}
          <Stat color="zinc" label="Already on allowlist" value={preview.duplicates.length} />
          {preview.invalid.length > 0 && (
            <Stat color="amber" label="Invalid (skipped)" value={preview.invalid.length} />
          )}
          {preview.removable.length > 0 && (
            <Stat color="red" label="On list but not in CSV" value={preview.removable.length} dim={!syncMode} />
          )}
        </div>

        {preview.newEntries.length > 0 && (
          <details className="mt-3" open>
            <summary className="cursor-pointer text-[11px] text-zinc-400 hover:text-zinc-200">
              New emails ({preview.newEntries.length})
            </summary>
            <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.02] p-2 text-[11px] text-zinc-400">
              {preview.newEntries.map((e) => {
                const name = [e.firstName, e.lastName].filter(Boolean).join(' ')
                return (
                  <div key={e.email} className="flex items-baseline justify-between gap-2 truncate">
                    <span className="truncate">{e.email}</span>
                    {name && <span className="shrink-0 text-zinc-600">{name}</span>}
                  </div>
                )
              })}
            </div>
          </details>
        )}

        {preview.invalid.length > 0 && (
          <details className="mt-2 text-[11px] text-zinc-500">
            <summary className="cursor-pointer hover:text-zinc-300">Show invalid rows ({preview.invalid.length})</summary>
            <div className="mt-1 max-h-24 overflow-y-auto rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 font-mono text-[10px] text-amber-200/90">
              {preview.invalid.map((e, i) => <div key={i} className="truncate">{e || '<empty>'}</div>)}
            </div>
          </details>
        )}

        {preview.removable.length > 0 && (
          <div className="mt-3 space-y-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={syncMode}
                onChange={(e) => setSyncMode(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-red-400"
              />
              <div className="flex-1">
                <div className="text-[12px] font-medium text-red-200">
                  Sync mode — also remove {preview.removable.length} {preview.removable.length === 1 ? 'email' : 'emails'} not in this CSV
                </div>
                <div className="mt-0.5 text-[11px] text-red-300/70">
                  Removed members are signed out and disabled. Admin-seeded entries are protected.
                </div>
              </div>
            </label>
            {syncMode && (
              <details>
                <summary className="cursor-pointer text-[11px] text-red-300/80 hover:text-red-200">
                  Show {preview.removable.length} that would be removed
                </summary>
                <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-red-500/20 bg-red-500/[0.04] p-2 text-[11px] text-red-200/80">
                  {preview.removable.map((e) => <div key={e} className="truncate">{e}</div>)}
                </div>
              </details>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={importing}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-white/[0.05] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(syncMode)}
            disabled={importing || (willAdd === 0 && willRemove === 0)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-60 ${
              willRemove > 0
                ? 'bg-red-500 text-white hover:bg-red-400'
                : 'bg-white text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            {importing && <Loader2 className="h-3 w-3 animate-spin" />}
            {cta}
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ color, label, value, dim }: { color: 'emerald' | 'zinc' | 'amber' | 'red' | 'sky'; label: string; value: number; dim?: boolean }) {
  const dot =
    color === 'emerald' ? 'bg-emerald-400'
      : color === 'amber' ? 'bg-amber-400'
      : color === 'red' ? 'bg-red-400'
      : color === 'sky' ? 'bg-sky-400'
      : 'bg-zinc-500'
  return (
    <div className={`flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-[12px] ${dim ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2 text-zinc-300">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </div>
      <div className="font-mono tabular-nums text-zinc-200">{value}</div>
    </div>
  )
}
