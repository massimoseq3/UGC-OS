import { useState } from 'react'
import { Download, Trash2, CornerDownLeft, Music as MusicIcon } from 'lucide-react'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import type { MusicHistoryItem } from '../../../stores/types'
import { getModel } from '../../../utils/models'

interface AudioTileProps {
  item: MusicHistoryItem
  onDownload: () => void
  onDelete: () => void
  // Load this track's prompt + settings back into the prompt panel.
  onReuse: () => void
}

// Audio history tile. Cover thumbnail (or gradient placeholder) + native
// audio player + reuse/download/delete. Sits inside the day-bucketed history grid.
export default function AudioTile({ item, onDownload, onDelete, onReuse }: AudioTileProps) {
  const audioUrl = useAssetUrl(item.audioRef)
  const coverUrl = useAssetUrl(item.coverImageRef)
  const modelLabel = getModel(item.modelId)?.displayName ?? item.modelId
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="overflow-hidden rounded-lg border border-ink/10 bg-ink/[0.02]">
      {/* Album-cover area stays dark in both themes — it stands in for media. */}
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-fuchsia-900/30 via-zinc-900 to-black">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <MusicIcon className="h-8 w-8 text-fuchsia-300/40" strokeWidth={1.5} />
          </div>
        )}
        {item.instrumental && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-zinc-200 backdrop-blur-sm">
            Instrumental
          </span>
        )}
      </div>

      <div className="p-2.5">
        <p className="line-clamp-1 text-[11px] font-medium text-ink-200">
          {item.title || modelLabel}
        </p>
        <p className="line-clamp-1 text-[10px] text-ink-500">{item.prompt}</p>

        {audioUrl && (
          <audio src={audioUrl} controls className="mt-2 h-8 w-full" preload="metadata" />
        )}

        <div className="mt-1.5 flex items-center justify-end gap-1">
          <button
            type="button"
            title="Reuse — load prompt + settings into the inputs"
            onClick={onReuse}
            className="flex h-6 w-6 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink/[0.05] hover:text-ink-200"
          >
            <CornerDownLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Download"
            onClick={onDownload}
            className="flex h-6 w-6 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink/[0.05] hover:text-ink-200"
          >
            <Download className="h-3 w-3" />
          </button>
          <button
            type="button"
            title={confirmingDelete ? 'Click again to delete' : 'Delete'}
            onClick={(e) => {
              e.stopPropagation()
              if (!confirmingDelete) {
                setConfirmingDelete(true)
                setTimeout(() => setConfirmingDelete(false), 3000)
                return
              }
              onDelete()
            }}
            className={`flex h-6 items-center justify-center gap-1 rounded-md px-1.5 transition-colors ${
              confirmingDelete
                ? 'bg-red-500/30 text-red-100 light:text-red-900 ring-1 ring-red-400/60'
                : 'text-ink-400 hover:bg-red-500/15 hover:text-red-300 light:hover:text-red-700'
            }`}
          >
            <Trash2 className="h-3 w-3" />
            {confirmingDelete && <span className="text-[9px] font-medium uppercase tracking-wider">Confirm</span>}
          </button>
        </div>
      </div>
    </div>
  )
}
