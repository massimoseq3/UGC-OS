import { ArrowUpRight, ImageIcon } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useBankStore } from '../../stores/bankStore'
import { useAssetThumb, useAssetPoster } from '../../hooks/useAssetUrl'
import { getAppConfig } from '../../utils/constants'
import { formatRelative } from '../../utils/history'
import { WIDGET_SHELL, riseStyle } from './widgetStyles'

// "Jump back in": the newest things this member made, across every app that
// makes a picture, one click from the app that made them. The landing page used
// to report on the work (what it saved, how often) without ever showing any of
// it; this is the half that shows it.

const SHOWN = 6

type Recent = {
  id: string
  appId: string
  createdAt: number
  label: string
} & ({ kind: 'image'; ref: string } | { kind: 'video'; thumbRef?: string; videoRef: string })

export default function RecentStrip({ index }: { index: number }) {
  const characterHistory = useBankStore((s) => s.characterHistory)
  const imageHistory = useBankStore((s) => s.imageHistory)
  const videoHistory = useBankStore((s) => s.videoHistory)

  const items: Recent[] = [
    ...characterHistory.map((c) => ({
      id: `c-${c.id}`, appId: 'character-studio', createdAt: c.createdAt,
      label: c.profile?.name || (c.kind === 'sheet' ? 'Character sheet' : 'Portrait'),
      kind: 'image' as const, ref: c.imageRef,
    })),
    ...imageHistory.map((i) => ({
      id: `i-${i.id}`, appId: 'playground', createdAt: i.createdAt,
      label: i.prompt, kind: 'image' as const, ref: i.imageUrl,
    })),
    ...videoHistory.map((v) => ({
      id: `v-${v.id}`, appId: v.sourceApp === 'broll-studio' ? 'broll-studio' : 'playground', createdAt: v.createdAt,
      label: v.prompt, kind: 'video' as const, thumbRef: v.thumbnailUrl, videoRef: v.videoUrl,
    })),
  ]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, SHOWN)

  return (
    <section className={`widget-rise relative flex min-h-0 w-full flex-col ${WIDGET_SHELL} px-5 pb-5 pt-4`} style={riseStyle(index)}>
      <h2 className="text-[11px] font-medium uppercase tracking-[0.07em] text-ink-300">Jump Back In</h2>
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <ImageIcon className="h-7 w-7 text-ink-700" strokeWidth={1.5} />
          <p className="text-sm text-ink-500">Nothing Made Yet</p>
          <p className="max-w-[280px] text-balance text-xs leading-relaxed text-ink-600">
            Your newest characters, stills and clips will wait for you here.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-3 content-center gap-3 sm:grid-cols-6">
          {items.map((item) => <RecentTile key={item.id} item={item} />)}
        </div>
      )}
    </section>
  )
}

function RecentTile({ item }: { item: Recent }) {
  return item.kind === 'image'
    ? <ImageFace item={item} refId={item.ref} />
    : item.thumbRef
      ? <ImageFace item={item} refId={item.thumbRef} />
      : <PosterFace item={item} videoRef={item.videoRef} />
}

function ImageFace({ item, refId }: { item: Recent; refId: string }) {
  const { url } = useAssetThumb(refId)
  return <Face item={item} url={url} />
}

function PosterFace({ item, videoRef }: { item: Recent; videoRef: string }) {
  const { url } = useAssetPoster(videoRef)
  return <Face item={item} url={url} />
}

function Face({ item, url }: { item: Recent; url: string | undefined }) {
  const openApp = useAppStore((s) => s.openApp)
  const app = getAppConfig(item.appId)
  return (
    <button
      type="button"
      onClick={() => openApp(item.appId)}
      title={item.label}
      className="group relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-ink/10 bg-black text-left"
    >
      <div className="relative aspect-[9/14] w-full overflow-hidden">
        {url && <img src={url} alt="" draggable={false} className="h-full w-full object-cover" />}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/85 to-transparent" />
        {app && (
          <span
            className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: app.accent }}
          >
            {app.name}
          </span>
        )}
        <ArrowUpRight className="absolute right-2 top-2 h-3.5 w-3.5 text-white/0 transition-colors group-hover:text-white/80" strokeWidth={2} />
        <span className="absolute inset-x-2 bottom-2 text-[10.5px] text-white/70">{formatRelative(item.createdAt)}</span>
      </div>
    </button>
  )
}
