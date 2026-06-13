import { Loader2 } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import type { CharacterHistoryItem, Model } from '../../../stores/types'

// Scrollable list of saved influencers used to attach a generated character
// sheet to one of them (sheets never create a new bank entry — they ride
// along as `Model.sheetImage`). Shared by the gallery tile and the preview
// modal so both attach flows behave identically.
export default function InfluencerPickList({
  item,
  busy,
  onPick,
}: {
  item: CharacterHistoryItem
  busy: boolean
  onPick: (model: Model) => void
}) {
  const models = useBankStore((s) => s.models)

  if (models.length === 0) {
    return (
      <p className="px-3 py-2.5 text-center text-[11px] leading-relaxed text-ink-500">
        No saved influencers yet — save a portrait to the bank first, then attach this sheet to it.
      </p>
    )
  }

  return (
    <div className="max-h-44 overflow-y-auto p-1">
      {models.map((model) => (
        <PickRow
          key={model.id}
          model={model}
          attached={model.sheetImage === item.imageRef}
          busy={busy}
          onPick={() => onPick(model)}
        />
      ))}
    </div>
  )
}

function PickRow({
  model,
  attached,
  busy,
  onPick,
}: {
  model: Model
  attached: boolean
  busy: boolean
  onPick: () => void
}) {
  const thumbUrl = useAssetUrl(model.characterImage)
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy || attached}
      className={`flex w-full items-center gap-2 rounded-full px-2 py-1.5 text-left transition-colors ${
        attached ? 'bg-emerald-500/10 text-emerald-300 light:text-emerald-700' : 'text-ink-300 hover:bg-ink/[0.06] hover:text-ink-100'
      } disabled:cursor-default`}
    >
      <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-ink/10">
        {thumbUrl
          ? <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
          : <Loader2 className="m-1.5 h-4 w-4 animate-spin text-ink-600" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{model.name || 'Unnamed influencer'}</span>
      {attached && <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider">Attached</span>}
      {!attached && model.sheetImage && (
        <span className="shrink-0 text-[9px] uppercase tracking-wider text-ink-600" title="Attaching will replace this influencer's current sheet">
          Replaces sheet
        </span>
      )}
    </button>
  )
}
