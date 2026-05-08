import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, RotateCcw, RotateCw, Download, X, ThumbsUp, ThumbsDown } from 'lucide-react'
import type { VoiceHistoryItem } from '../../../stores/types'
import { getUrl } from '../../../utils/assetStore'
import { seedColor } from './VoicePickerView'

interface BottomPlayerProps {
  item: VoiceHistoryItem
  onClose: () => void
}

async function resolveAudioUrl(ref: string): Promise<string> {
  if (ref.startsWith('asset-')) {
    const url = await getUrl(ref)
    if (!url) throw new Error('Audio asset not found')
    return url
  }
  return ref
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return new Date(ts).toLocaleDateString()
}

export default function BottomPlayer({ item, onClose }: BottomPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animRef = useRef<number>(0)
  const progressBarRef = useRef<HTMLDivElement>(null)

  // Reset and load when item changes
  useEffect(() => {
    let cancelled = false
    setProgress(0)
    setCurrentTime(0)
    setIsPlaying(false)

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    resolveAudioUrl(item.audioUrl).then((url) => {
      if (cancelled) return
      const audio = new Audio(url)
      audioRef.current = audio
      audio.addEventListener('play', () => setIsPlaying(true))
      audio.addEventListener('pause', () => setIsPlaying(false))
      audio.addEventListener('ended', () => {
        setIsPlaying(false)
        setProgress(0)
        setCurrentTime(0)
      })
    }).catch(() => { /* swallow — UI just stays in stopped state */ })

    return () => {
      cancelled = true
      cancelAnimationFrame(animRef.current)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [item.audioUrl, item.id])

  const tick = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.duration) {
      setProgress(audio.currentTime / audio.duration)
      setCurrentTime(audio.currentTime)
    }
    if (audio && !audio.paused) {
      animRef.current = requestAnimationFrame(tick)
    }
  }, [])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play()
      animRef.current = requestAnimationFrame(tick)
    } else {
      audio.pause()
    }
  }

  const skip = (deltaSec: number) => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + deltaSec))
    if (audio.paused) {
      setProgress(audio.currentTime / audio.duration)
      setCurrentTime(audio.currentTime)
    }
  }

  const handleScrub = (e: React.MouseEvent) => {
    const audio = audioRef.current
    if (!audio || !audio.duration || !progressBarRef.current) return
    const rect = progressBarRef.current.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audio.currentTime = fraction * audio.duration
    setProgress(fraction)
    setCurrentTime(audio.currentTime)
  }

  const handleDownload = async () => {
    const url = await resolveAudioUrl(item.audioUrl)
    const a = document.createElement('a')
    a.href = url
    a.download = `${item.voiceName}-${Date.now()}.mp3`
    a.click()
  }

  return (
    <div className="border-t border-white/5 bg-[#0A0A0A]">
      {/* Scrubber */}
      <div
        ref={progressBarRef}
        onClick={handleScrub}
        className="group h-1 cursor-pointer bg-white/5"
      >
        <div
          className="h-full bg-indigo-400 transition-[width] duration-75"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="flex items-center gap-4 px-5 py-3">
        {/* Voice avatar + meta */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className="h-9 w-9 shrink-0 rounded-full"
            style={{ background: seedColor(item.voiceId) }}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-zinc-100">
              {item.scriptPreview}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
              <span className="text-zinc-400">{item.voiceName}</span>
              <span>·</span>
              <span>Created {formatRelative(item.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Transport */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => skip(-10)}
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
            title="Back 10 seconds"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="absolute text-[7px] font-bold">10</span>
          </button>
          <button
            onClick={togglePlay}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 transition-colors hover:bg-white"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
          </button>
          <button
            onClick={() => skip(10)}
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
            title="Forward 10 seconds"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span className="absolute text-[7px] font-bold">10</span>
          </button>
        </div>

        {/* Time */}
        <div className="hidden min-w-[72px] text-right text-[11px] tabular-nums text-zinc-600 sm:block">
          {formatTime(currentTime)} / {formatTime(item.duration)}
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-1">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            title="Like"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            title="Dislike"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleDownload}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            title="Close player"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
