// A template's public page, at /t/<slug> — the link a YouTube description
// carries. It renders OUTSIDE AuthGate, like the legal pages, so it has to
// make sense to someone who has never seen UGC OS: what the template makes,
// what you pick, roughly what a run costs, the video it came from, and two
// ways on — Open in UGC OS for members, Get UGC OS for everyone else.
//
// It reads only the static gallery files in public/templates/, and nothing
// that boots a workspace: no banks, no stores that sync, no key.
//
// Open in UGC OS is a plain link, not a router navigation: the member link
// (/flow/t/<slug>) is read when the app STARTS (share.ts), so it has to be a
// fresh page load to be seen.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowRight, ExternalLink, PlayCircle, Sparkles } from 'lucide-react'
import AppLogo from '../../../components/AppLogo'
import AppBackground from '../../../components/AppBackground'
import { SKOOL_COMMUNITY_URL } from '../../../utils/constants'
import type { FlowBlock } from '../types'
import { isKnownKind } from '../engine/catalog'
import PlanChips from '../components/PlanChips'
import { isSlug, memberTemplatePath } from '../share'

interface PublicTemplate {
  name: string
  description?: string
  estimate?: number
  videoUrl?: string
  cover?: string
  blocks: FlowBlock[]
  fields: Array<{ title: string; example?: string }>
  notes: string[]
}

type State = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; template: PublicTemplate }

// The gallery entry for the headline facts, the template file for the blocks
// and fields. Only what this page shows is read, and every field is checked,
// since the page trusts nothing it didn't need.
async function loadPublicTemplate(slug: string): Promise<PublicTemplate | null> {
  const [indexRes, fileRes] = await Promise.all([
    fetch('/templates/index.json', { cache: 'no-cache' }),
    fetch(`/templates/${slug}.json`, { cache: 'no-cache' }),
  ])
  if (!fileRes.ok) return null
  const index = indexRes.ok ? ((await indexRes.json()) as { templates?: Array<Record<string, unknown>> }) : {}
  const entry = (index.templates ?? []).find((t) => t.slug === slug) ?? {}
  const file = (await fileRes.json()) as Record<string, unknown>
  if (file.format !== 'ugcflow') return null
  const blocks = (Array.isArray(file.blocks) ? file.blocks : [])
    .filter((b): b is FlowBlock => !!b && typeof b === 'object' && typeof (b as FlowBlock).kind === 'string' && isKnownKind((b as FlowBlock).kind))
    .map((b) => ({ id: String(b.id), kind: b.kind, label: typeof b.label === 'string' ? b.label : undefined, x: Number(b.x) || 0, y: Number(b.y) || 0, settings: {}, review: b.review === true || undefined }))
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  return {
    name: text(entry.name) ?? text(file.name) ?? 'Flow Template',
    description: text(entry.description) ?? text(file.description),
    estimate: typeof entry.estimate === 'number' ? entry.estimate : typeof file.estimate === 'number' ? file.estimate : undefined,
    videoUrl: [text(entry.videoUrl), text((file.template as Record<string, unknown> | undefined)?.sourceUrl)].find((u) => !!u && /^https:\/\//.test(u)),
    cover: text(entry.cover),
    blocks,
    fields: (Array.isArray(file.fields) ? file.fields : [])
      .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
      .map((f) => ({ title: text(f.title) ?? 'A pick', example: text(f.example) })),
    notes: (Array.isArray(file.notes) ? file.notes : []).map(text).filter((n): n is string => !!n),
  }
}

function roughCredits(n: number): string {
  if (n < 100) return `about ${Math.round(n)} credits`
  return `about ${(Math.round(n / 10) * 10).toLocaleString('en-US')} credits`
}

export default function TemplatePage() {
  const { slug } = useParams()
  const valid = isSlug(slug)
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    if (!valid) return
    let live = true
    loadPublicTemplate(slug).then(
      (t) => { if (live) setState(t ? { status: 'ready', template: t } : { status: 'missing' }) },
      () => { if (live) setState({ status: 'missing' }) },
    )
    return () => { live = false }
  }, [slug, valid])

  const shown: State = valid ? state : { status: 'missing' }

  return (
    // h-dvh + overflow-y-auto for the same reason as the legal pages:
    // index.css pins html/body/#root to overflow: hidden.
    <div className="relative h-dvh w-full overflow-y-auto bg-surface-0 text-ink-200 antialiased">
      <AppBackground />
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col gap-8 px-5 py-10">
        <header className="flex items-center justify-between gap-4 border-b border-ink/5 pb-6">
          <a href="/" className="flex items-center gap-2.5 text-ink-200 transition-opacity hover:opacity-80">
            <AppLogo className="h-8 w-8" />
            <span className="text-base font-semibold tracking-tight">UGC OS</span>
          </a>
          <span className="rounded-full bg-flow-500/10 px-2.5 py-1 text-[11px] font-medium text-flow-300">Flow Template</span>
        </header>

        {shown.status === 'loading' && <div className="h-64 rounded-3xl bg-ink/[0.03]" />}

        {shown.status === 'missing' && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-lg font-semibold text-ink-100">That template isn't here</p>
            <p className="max-w-sm text-sm text-ink-400">The link may be old. Members find every current template on Flow Home.</p>
            <a href="/flow" className="mt-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink-200 transition-colors hover:border-ink/20">Open UGC OS</a>
          </div>
        )}

        {shown.status === 'ready' && valid && <Ready slug={slug} template={shown.template} />}
      </div>
    </div>
  )
}

function Ready({ slug, template }: { slug: string; template: PublicTemplate }) {
  return (
    <main className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-ink-100">{template.name}</h1>
        {template.description && <p className="max-w-2xl text-[15px] leading-relaxed text-ink-300">{template.description}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <a
            href={memberTemplatePath(slug)}
            className="glass-fill glass-fill-soft flex items-center gap-2 rounded-full border border-white/15 bg-flow-500 px-6 py-3 text-sm font-semibold text-white btn-soft-shadow transition-all hover:brightness-110"
          >
            Open in UGC OS
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href={SKOOL_COMMUNITY_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-full border border-ink/10 px-5 py-3 text-sm font-medium text-ink-200 transition-colors hover:border-ink/20"
          >
            Get UGC OS
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {template.videoUrl && (
            <a
              href={template.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-full px-4 py-3 text-sm text-ink-400 transition-colors hover:text-ink-100"
            >
              <PlayCircle className="h-4 w-4" />
              Watch the Video
            </a>
          )}
        </div>
      </section>

      {template.cover && (
        <img src={template.cover} alt="" className="aspect-video w-full rounded-3xl border border-ink/5 object-cover" />
      )}

      <section className="flex flex-col gap-3 rounded-3xl border border-ink/5 bg-ink/[0.02] p-5">
        <h2 className="text-sm font-semibold text-ink-100">What It Runs</h2>
        <PlanChips blocks={template.blocks} plan={null} />
        <p className="text-[12.5px] leading-relaxed text-ink-400">
          Each block is one of the UGC OS apps. Wired together, one run takes your product from script to finished clips, and stops wherever the template asks you to pick the best before anything more is paid for.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="flex flex-col gap-2 rounded-3xl border border-ink/5 bg-ink/[0.02] p-5">
          <h2 className="text-sm font-semibold text-ink-100">You Pick</h2>
          {template.fields.length === 0 ? (
            <p className="text-[12.5px] text-ink-400">Nothing — it runs as it is.</p>
          ) : (
            template.fields.map((f) => (
              <p key={f.title} className="text-[13px] text-ink-200">
                {f.title}
                {f.example && <span className="text-ink-500"> · made with {f.example}</span>}
              </p>
            ))
          )}
        </section>
        <section className="flex flex-col gap-2 rounded-3xl border border-ink/5 bg-ink/[0.02] p-5">
          <h2 className="text-sm font-semibold text-ink-100">What a Run Costs</h2>
          <p className="text-[13px] text-ink-200">{template.estimate ? `${roughCredits(template.estimate)} a run` : 'Priced in the app before it runs'}</p>
          <p className="text-[12.5px] leading-relaxed text-ink-400">Paid on your own kie.ai key. The app shows the exact figure for your picks before anything runs.</p>
        </section>
      </div>

      {template.notes.length > 0 && (
        <section className="flex gap-3 rounded-3xl border border-ink/5 bg-ink/[0.02] p-5">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-flow-300" />
          <div className="flex flex-col gap-1.5">
            {template.notes.map((n) => <p key={n} className="text-[12.5px] leading-relaxed text-ink-300">{n}</p>)}
          </div>
        </section>
      )}

      <p className="text-center text-[12px] text-ink-500">
        UGC OS is a private workspace for the UGC OS community on Skool. Members open this template in the app, pick their own product and character, and press Run.
      </p>
    </main>
  )
}
