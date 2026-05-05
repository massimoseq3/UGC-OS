import { Coins } from 'lucide-react'
import { estimateCost, formatCost, type CostEstimateParams } from '../utils/models'

interface CostPreviewProps {
  modelId: string | undefined
  params?: CostEstimateParams
  className?: string
}

export default function CostPreview({ modelId, params, className = '' }: CostPreviewProps) {
  if (!modelId) return null
  const usd = estimateCost(modelId, params)
  const formatted = formatCost(usd)
  if (!formatted) return null

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-400 ${className}`}
      title="Estimated cost — actuals may vary based on duration, output size, and provider pricing changes."
    >
      <Coins className="h-3 w-3 text-zinc-500" />
      <span className="font-medium">≈ {formatted}</span>
    </div>
  )
}
