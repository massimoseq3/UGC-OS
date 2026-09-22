import { AlertCircle, CheckCircle2 } from 'lucide-react'
import AppLogo from '../AppLogo'
import AppBackground from '../AppBackground'
import Spinner from '../Spinner'

// The chrome every signed-out screen shares: wallpaper, brand, one centred
// max-w-sm column, and the legal row at the foot. Extracted when password
// recovery and the lapsed-member gate arrived — three copies of this markup
// would have drifted the way every other near-duplicate in this app did.
export default function AuthShell({
  subtitle,
  children,
}: {
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-surface-0 text-ink antialiased">
      <AppBackground />

      <div className="relative z-10 flex h-full w-full items-center justify-center overflow-y-auto px-6 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-2">
            <AppLogo className="h-12 w-12" />
            <div className="space-y-1 text-center">
              {/* The same wordmark the menu bar carries — "OS" in the display
                  serif — so the front door and the workspace behind it read as
                  one product. */}
              <h1 className="whitespace-nowrap text-3xl font-bold tracking-tight text-ink-100">
                UGC{' '}
                <span className="font-normal italic" style={{ fontFamily: "'Instrument Serif', Georgia, 'Times New Roman', serif" }}>
                  OS
                </span>
              </h1>
              <p className="text-sm text-ink-500">{subtitle}</p>
            </div>
          </div>

          {children}

          <div className="flex items-center justify-center gap-3 text-[11px] text-ink-600">
            <a href="/legal/terms" className="transition-colors hover:text-ink-300">Terms</a>
            <span aria-hidden>·</span>
            <a href="/legal/privacy" className="transition-colors hover:text-ink-300">Privacy</a>
            <span aria-hidden>·</span>
            <a href="/legal/aup" className="transition-colors hover:text-ink-300">AUP</a>
          </div>
        </div>
      </div>
    </div>
  )
}

// The card every signed-out form sits in: the house panel radius, so the one
// screen a member sees before the workspace is cut from the same material.
export function AuthForm({ onSubmit, children }: { onSubmit: (e: React.FormEvent) => void; children: React.ReactNode }) {
  return (
    <form onSubmit={onSubmit} className="space-y-3.5 rounded-3xl border border-ink/10 bg-ink/[0.03] p-6 backdrop-blur-xl">
      {children}
    </form>
  )
}

// The one field shape these screens use. Single-line inputs are `rounded-full`
// app-wide — the Settings key fields and every Characters form row are the same
// kind of stacked, labelled field — so the sign-in form wears them too.
export function AuthField({
  label,
  hint,
  ...input
}: { label: string; hint?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="mb-1.5 block px-1 text-[11px] font-medium uppercase tracking-wider text-ink-500">
        {label}
      </label>
      <input
        {...input}
        className="w-full rounded-full border border-ink/10 bg-ink/5 px-4 py-2.5 text-sm text-ink-200 placeholder-ink-600 outline-none transition-colors focus:border-ink/20 focus:bg-ink/[0.07]"
      />
      {hint && <p className="mt-1.5 px-1 text-[11px] text-ink-600">{hint}</p>}
    </div>
  )
}

// The form's one primary action. Three screens had drifted copies of this.
export function AuthSubmit({ busy, disabled, children }: { busy: boolean; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-ink"
    >
      {busy && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  )
}

// An inline result under the fields: what went wrong, or what happens next.
const NOTICE_TONE = {
  ok: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300 light:text-emerald-700',
  warn: 'border-amber-500/20 bg-amber-500/10 text-amber-300 light:text-amber-700',
  error: 'border-red-500/20 bg-red-500/10 text-red-300 light:text-red-700',
}

export function AuthNotice({ tone, children }: { tone: keyof typeof NOTICE_TONE; children: React.ReactNode }) {
  const Icon = tone === 'ok' ? CheckCircle2 : AlertCircle
  return (
    <div className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-[11px] leading-relaxed ${NOTICE_TONE[tone]}`}>
      <Icon className="mt-0.5 h-3 w-3 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
