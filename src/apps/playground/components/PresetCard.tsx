import { useRef, useState } from 'react'
import { Film } from 'lucide-react'
import type { Preset } from '../presets'

interface PresetCardProps {
  preset: Preset
  onClick: () => void
}

// One card in the preset picker grid. Hover plays the preview video; idle
// shows the still thumbnail or a placeholder gradient. The card itself is the
// click target — title + 1-line description live in the metadata strip.
export default function PresetCard({ preset, onClick }: PresetCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hovering, setHovering] = useState(false)

  const hasVideo = !!preset.previewVideoUrl
  const hasThumbnail = !!preset.thumbnailUrl

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => {
        setHovering(true)
        videoRef.current?.play().catch(() => {})
      }}
      onMouseLeave={() => {
        setHovering(false)
        const v = videoRef.current
        if (v) { v.pause(); v.currentTime = 0 }
      }}
      className="group relative flex aspect-[4/5] flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] text-left transition-all hover:border-white/25 hover:bg-white/[0.04]"
    >
      {/* Visual layer */}
      <div className="relative flex-1 overflow-hidden">
        {hasVideo && (
          <video
            ref={videoRef}
            src={preset.previewVideoUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
              hovering ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {hasThumbnail ? (
          <img
            src={preset.thumbnailUrl}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
              hovering && hasVideo ? 'opacity-0' : 'opacity-100'
            }`}
          />
        ) : (
          // Placeholder: gradient block with film icon + title. Drop a real
          // image/video into the preset entry to replace this.
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-zinc-800/60 via-zinc-900 to-black">
            <Film className="h-6 w-6 text-zinc-600" strokeWidth={1.5} />
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">Preview</span>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="border-t border-white/5 px-3 py-2.5">
        <p className="text-[12px] font-medium tracking-tight text-zinc-100">{preset.title}</p>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">{preset.description}</p>
      </div>
    </button>
  )
}
