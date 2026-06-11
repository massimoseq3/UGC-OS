import { useState, useRef, useEffect, useMemo } from 'react'
import { ArrowLeft, Search, Play, Pause, Check } from 'lucide-react'
import type { VoiceOption, VoiceCategory } from '../types'
import { VOICES, VOICE_CATEGORIES } from '../types'

import { seedColor } from './seedColor'

const PREVIEW_BASE = 'https://static.aiquickdraw.com/elevenlabs/voice'

interface VoicePickerViewProps {
  selectedId: string
  onSelect: (voice: VoiceOption) => void
  onClose: () => void
}

type CategoryFilter = VoiceCategory | 'All'

export default function VoicePickerView({ selectedId, onSelect, onClose }: VoicePickerViewProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('All')
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return VOICES.filter((v) => {
      if (category !== 'All' && v.category !== category) return false
      if (!q) return true
      return (
        v.name.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q)
      )
    })
  }, [query, category])

  const handlePreview = (voice: VoiceOption, e: React.MouseEvent) => {
    e.stopPropagation()

    // Toggle off if same voice
    if (previewingId === voice.id || loadingId === voice.id) {
      audioRef.current?.pause()
      audioRef.current = null
      setPreviewingId(null)
      setLoadingId(null)
      return
    }

    audioRef.current?.pause()
    const audio = new Audio(`${PREVIEW_BASE}/${voice.id}.mp3`)
    audioRef.current = audio
    setLoadingId(voice.id)
    setPreviewingId(null)

    audio.addEventListener('playing', () => {
      setPreviewingId(voice.id)
      setLoadingId(null)
    })
    audio.addEventListener('ended', () => {
      setPreviewingId(null)
      setLoadingId(null)
    })
    audio.addEventListener('error', () => {
      setPreviewingId(null)
      setLoadingId(null)
    })

    audio.play().catch(() => {
      setLoadingId(null)
      setPreviewingId(null)
    })
  }

  const filters: CategoryFilter[] = ['All', ...VOICE_CATEGORIES]

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/5 hover:text-zinc-100"
          aria-label="Back to settings"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold tracking-tight text-zinc-100">Select a voice</div>
          <div className="text-xs text-zinc-400">Voices tuned for AI UGC ads</div>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-white/5 px-5 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search voices..."
            className="w-full rounded-full border border-white/10 bg-transparent py-2 pl-10 pr-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-voice-500/40"
          />
        </div>

        {/* Category chips */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {filters.map((c) => {
            const active = category === c
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-voice-500/25 text-voice-200'
                    : 'bg-white/[0.05] text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100'
                }`}
              >
                {c}
              </button>
            )
          })}
        </div>
      </div>

      {/* Voice list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <span className="text-sm text-zinc-500">No voices match these filters.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {filtered.map((voice) => {
              const isSelected = voice.id === selectedId
              const isPlaying = previewingId === voice.id
              const isLoading = loadingId === voice.id

              return (
                <div
                  key={voice.id}
                  onClick={() => onSelect(voice)}
                  className={`group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 transition-colors ${
                    isSelected ? 'bg-voice-500/15' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  {/* Avatar with loading ring */}
                  <button
                    type="button"
                    onClick={(e) => handlePreview(voice, e)}
                    className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    aria-label={isPlaying ? 'Stop preview' : 'Preview voice'}
                  >
                    {/* The avatar circle */}
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{ background: seedColor(voice.id) }}
                    />
                    {/* Loading ring (spinner) */}
                    {isLoading && (
                      <span className="absolute -inset-[3px] rounded-full border-2 border-white/10 border-t-white animate-spin" />
                    )}
                    {/* Static playing ring */}
                    {isPlaying && (
                      <span className="absolute -inset-[3px] rounded-full border-2 border-voice-400" />
                    )}
                    {/* Play/Pause icon overlay (visible on hover, or while playing/loading) */}
                    <span
                      className={`relative flex h-full w-full items-center justify-center rounded-full bg-black/40 text-white transition-opacity ${
                        isPlaying || isLoading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </span>
                  </button>

                  {/* Text */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className={`truncate text-sm font-medium ${isSelected ? 'text-zinc-50' : 'text-zinc-100'}`}>
                        {voice.name}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-500">
                        {voice.category}
                      </span>
                    </div>
                    <div className="truncate text-xs text-zinc-400">
                      {voice.description}
                    </div>
                  </div>

                  {/* Selected check */}
                  {isSelected && (
                    <Check className="h-4 w-4 shrink-0 text-voice-300" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
