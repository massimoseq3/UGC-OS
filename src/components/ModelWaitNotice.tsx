import { Clock } from 'lucide-react'

// Small advisory line shown under a generate button when the selected model is
// known to be slow under load. Currently only GPT Image 2 (text→image and edit)
// — OpenAI's image endpoint queues heavily, so we set expectations up front.
// Returns null for every other model, so call sites can drop it in
// unconditionally and pass whatever model id is currently selected.
export default function ModelWaitNotice({ modelId, className = '' }: { modelId?: string; className?: string }) {
  if (!modelId?.startsWith('gpt-image-2')) return null
  // Sized to match ClearAllButton exactly (same text size, color, icon, and a
  // single non-wrapping line) so toggling models can't change the row height.
  return (
    <p className={`flex items-center justify-center gap-1 whitespace-nowrap text-[11px] text-ink-500 ${className}`}>
      <Clock className="h-3 w-3 shrink-0" strokeWidth={2.5} />
      Estimated wait ~2 minutes due to high demand
    </p>
  )
}
