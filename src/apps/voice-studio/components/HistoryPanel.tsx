import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, Download, Trash2, Save, Check, Volume2 } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import type { VoiceHistoryItem } from '../../../stores/types'
import { getUrl } from '../../../utils/assetStore'

interface HistoryPanelProps {
  items: VoiceHistoryItem[]
  onDelete: (id: string) => void
}

const BAR_COUNT = 80

/**
 * Resolve an asset ref or URL to a playable URL.
 */
async function resolveAudioUrl(ref: string): Promise<string> {
  if (ref.startsWith('asset-')) {
    const url = await getUrl(ref)
    if (!url) throw new Error('Audio asset not found')
    return url
  }
  return ref
}

/**
 * Decode an audio URL into normalized waveform peaks (0–1).
 * Uses Web Audio API to get the actual audio data.
 */
async function decodeWaveform(audioRef: string, barCount: number): Promise<number[]> {
  const audioUrl = await resolveAudioUrl(audioRef)
  const ctx = new AudioContext()
  try {
    let arrayBuffer: ArrayBuffer

    if (audioUrl.startsWith('data:')) {
      const res = await fetch(audioUrl)
      arrayBuffer = await res.arrayBuffer()
    } else {
      const res = await fetch(audioUrl)
      arrayBuffer = await res.arrayBuffer()
    }

    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    const channelData = audioBuffer.getChannelData(0)
    const samplesPerBar = Math.floor(channelData.length / barCount)
    const peaks: number[] = []

    for (let i = 0; i < barCount; i++) {
      const start = i * samplesPerBar
      const end = Math.min(start + samplesPerBar, channelData.length)
      let sum = 0
      for (let j = start; j < end; j++) {
        sum += Math.abs(channelData[j])
      }
      peaks.push(sum / (end - start))
    }

    const max = Math.max(...peaks, 0.001)
    return peaks.map((p) => p / max)
  } finally {
    ctx.close()
  }
}

/**
 * AudioWaveform — renders the real decoded waveform of an audio clip.
 */
function AudioWaveform({
  audioUrl,
  itemId,
  progress,
  isPlaying,
  onSeek,
}: {
  audioUrl: string
  itemId: string
  progress: number
  isPlaying: boolean
  onSeek: (fraction: number) => void
}) {
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    decodeWaveform(audioUrl, BAR_COUNT).then((p) => {
      if (!cancelled) setPeaks(p)
    }).catch(() => {
      if (!cancelled) setPeaks(Array.from({ length: BAR_COUNT }, () => 0.3))
    })
    return () => { cancelled = true }
  }, [audioUrl, itemId])

  const handleClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const fraction = (e.clientX - rect.left) / rect.width
    onSeek(Math.max(0, Math.min(1, fraction)))
  }

  if (!peaks) {
    return (
      <div className="mt-2.5 flex h-12 w-full items-center justify-center rounded-lg bg-black/30">
        <div className="flex items-center gap-[3px]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-3 w-1 animate-pulse rounded-full bg-white/10"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="mt-2.5 flex h-12 w-full cursor-pointer items-end gap-[1.5px] rounded-lg bg-black/30 px-2 pb-1.5 pt-1.5"
    >
      {peaks.map((peak, i) => {
        const fraction = i / peaks.length
        const filled = fraction <= progress
        const minHeight = 8
        const maxHeight = 100
        const height = minHeight + peak * (maxHeight - minHeight)

        return (
          <div
            key={i}
            className={`flex-1 min-w-[1.5px] rounded-full transition-colors duration-75 ${filled
              ? isPlaying ? 'bg-indigo-400' : 'bg-indigo-400/60'
              : 'bg-white/[0.08]'
              }`}
            style={{ height: `${height}%` }}
          />
        )
      })}
    </div>
  )
}

/** Format seconds as m:ss */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function HistoryPanel({ items, onDelete }: HistoryPanelProps) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [currentTime, setCurrentTime] = useState<Record<string, number>>({})
  const [saveFormId, setSaveFormId] = useState<string | null>(null)
  const [saveLabel, setSaveLabel] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animRef = useRef<number>(0)
  const playingIdRef = useRef<string | null>(null)

  const addVoice = useBankStore((s) => s.addVoice)

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    cancelAnimationFrame(animRef.current)
    setPlayingId(null)
    playingIdRef.current = null
  }, [])

  useEffect(() => {
    return () => { stopPlayback() }
  }, [stopPlayback])

  const createAudioHandlers = useCallback((audio: HTMLAudioElement, itemId: string) => {
    const updateProgress = () => {
      if (audio.duration && playingIdRef.current === itemId) {
        const prog = audio.currentTime / audio.duration
        setProgress((prev) => ({ ...prev, [itemId]: prog }))
        setCurrentTime((prev) => ({ ...prev, [itemId]: audio.currentTime }))
      }
      if (!audio.paused) {
        animRef.current = requestAnimationFrame(updateProgress)
      }
    }

    audio.onplay = () => {
      setPlayingId(itemId)
      playingIdRef.current = itemId
      updateProgress()
    }
    audio.onended = () => {
      setPlayingId(null)
      playingIdRef.current = null
      setProgress((prev) => ({ ...prev, [itemId]: 0 }))
      setCurrentTime((prev) => ({ ...prev, [itemId]: 0 }))
    }
  }, [])

  const handlePlay = async (item: VoiceHistoryItem) => {
    if (playingId === item.id) {
      stopPlayback()
      return
    }

    stopPlayback()
    const url = await resolveAudioUrl(item.audioUrl)
    const audio = new Audio(url)
    audioRef.current = audio
    playingIdRef.current = item.id
    createAudioHandlers(audio, item.id)
    audio.play()
  }

  const handleSeek = async (item: VoiceHistoryItem, fraction: number) => {
    if (audioRef.current && playingIdRef.current === item.id) {
      audioRef.current.currentTime = fraction * audioRef.current.duration
    } else {
      stopPlayback()
      const url = await resolveAudioUrl(item.audioUrl)
      const audio = new Audio(url)
      audioRef.current = audio
      playingIdRef.current = item.id

      audio.onloadedmetadata = () => {
        audio.currentTime = fraction * audio.duration
      }
      createAudioHandlers(audio, item.id)
      audio.play()
    }
  }

  const handleDownload = async (item: VoiceHistoryItem) => {
    const url = await resolveAudioUrl(item.audioUrl)
    const a = document.createElement('a')
    a.href = url
    a.download = `${item.voiceName}-${Date.now()}.wav`
    a.click()
  }

  const handleSavePreset = (item: VoiceHistoryItem) => {
    if (!saveLabel.trim()) return
    addVoice({
      label: saveLabel.trim(),
      voiceName: item.voiceName,
      gender: item.gender,
      styleInstructions: item.styleInstructions,
      creativity: item.creativity,
      ambience: item.ambience,
      linkedModelId: '',
    })
    setSaveFormId(null)
    setSaveLabel('')
    setSavedId(item.id)
    setTimeout(() => setSavedId(null), 3000)
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <Volume2 className="h-10 w-10 text-zinc-800" strokeWidth={1.5} />
        <p className="text-sm text-zinc-700">No generations yet</p>
        <p className="text-xs text-zinc-800">Generated audio will appear here</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-white/5 px-4 py-3">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-200">History</h3>
        <span className="text-[10px] text-zinc-700">{items.length} generation{items.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const isPlaying = playingId === item.id
            const prog = progress[item.id] ?? 0
            const time = currentTime[item.id] ?? 0
            const isSaved = savedId === item.id

            return (
              <div
                key={item.id}
                className="rounded-xl border border-white/5 bg-white/[0.02] p-3"
              >
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-zinc-300">{item.voiceName}</span>
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-600">
                      {item.ambience}
                    </span>
                  </div>
                  <span className="text-[10px] tabular-nums text-zinc-700">
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Script preview */}
                <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600 line-clamp-2">
                  {item.scriptPreview}
                </p>

                {/* Real audio waveform */}
                <AudioWaveform
                  audioUrl={item.audioUrl}
                  itemId={item.id}
                  progress={prog}
                  isPlaying={isPlaying}
                  onSeek={(fraction) => handleSeek(item, fraction)}
                />

                {/* Duration */}
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[10px] tabular-nums text-zinc-700">
                    {formatTime(time)} / {formatTime(item.duration)}
                  </span>
                </div>

                {/* Controls */}
                <div className="mt-2.5 flex items-center gap-1.5">
                  <button
                    onClick={() => handlePlay(item)}
                    className={`flex h-9 w-9 lg:h-7 lg:w-7 items-center justify-center rounded-full transition-colors ${isPlaying
                      ? 'bg-indigo-500/20 text-indigo-400'
                      : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                      }`}
                  >
                    {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </button>

                  <button
                    onClick={() => handleDownload(item)}
                    className="flex h-9 w-9 lg:h-7 lg:w-7 items-center justify-center rounded-full bg-white/5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
                    title="Download WAV"
                  >
                    <Download className="h-3 w-3" />
                  </button>

                  {/* Save Voice Preset */}
                  {saveFormId === item.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={saveLabel}
                        onChange={(e) => setSaveLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(item) }}
                        placeholder="Preset name..."
                        autoFocus
                        className="w-28 rounded-full border border-white/10 bg-transparent px-2.5 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-indigo-500/30"
                      />
                      <button
                        onClick={() => handleSavePreset(item)}
                        disabled={!saveLabel.trim()}
                        className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-[10px] font-medium text-indigo-400 transition-colors hover:bg-indigo-500/25 disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setSaveFormId(null); setSaveLabel('') }}
                        className="text-[10px] text-zinc-600 hover:text-zinc-400"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSaveFormId(item.id)}
                      className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-colors ${isSaved
                        ? 'text-green-400'
                        : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
                        }`}
                    >
                      {isSaved ? (
                        <><Check className="h-3 w-3" /> Saved</>
                      ) : (
                        <><Save className="h-3 w-3" /> Save Preset</>
                      )}
                    </button>
                  )}

                  <div className="flex-1" />

                  <button
                    onClick={() => onDelete(item.id)}
                    className="flex h-9 w-9 lg:h-7 lg:w-7 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
