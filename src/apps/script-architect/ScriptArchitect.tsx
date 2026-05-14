import { useMemo, useState, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useBankStore } from '../../stores/bankStore'
import type { Product } from '../../stores/types'
import InputPanel from './components/InputPanel'
import OutputPanel from './components/OutputPanel'
import { generateScript } from './services/generateScript'
import { usePersistedState, useProjectScopedKey } from '../../hooks/usePersistedState'

export default function ScriptArchitect() {
  const baseKey = useProjectScopedKey('script-architect')
  const [winningTranscript, setWinningTranscript] = usePersistedState(`${baseKey}:transcript`, '')
  const [selectedProductId, setSelectedProductId] = usePersistedState<string | null>(`${baseKey}:productId`, null)
  const [additionalContext, setAdditionalContext] = usePersistedState(`${baseKey}:context`, '')
  const [generatedScript, setGeneratedScript] = usePersistedState(`${baseKey}:script`, '')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highlightField, setHighlightField] = useState<string | null>(null)

  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)
  const getProductById = useBankStore((s) => s.getProductById)
  const products = useBankStore((s) => s.products)

  const selectedProduct = useMemo<Product | null>(
    () => (selectedProductId ? products.find((p) => p.id === selectedProductId) ?? null : null),
    [selectedProductId, products],
  )
  const handleProductSelect = (p: Product | null) => setSelectedProductId(p?.id ?? null)

  // Consume inter-app payloads from Ad Analyzer
  useEffect(() => {
    if (activeApp !== 'script-architect') return
    if (!interAppPayload || interAppPayload.targetApp !== 'script-architect') return

    const { targetField, data } = interAppPayload

    if (targetField === 'winningTranscript' || targetField === 'reconstructionPrompt') {
      setWinningTranscript(data as string)
      setHighlightField('transcript')
      setTimeout(() => setHighlightField(null), 800)
    }

    if (targetField === 'productId') {
      const product = getProductById(data as string)
      if (product) setSelectedProductId(product.id)
    }

    consumePayload()
  }, [interAppPayload, activeApp, consumePayload, getProductById])

  const handleGenerate = async (productContext: any | null) => {
    if (!winningTranscript.trim() || !selectedProduct) return

    setIsGenerating(true)
    setError(null)
    try {
      const result = await generateScript({
        winningTranscript,
        productId: selectedProduct.id,
        productContext,
        additionalContext,
      })
      setGeneratedScript(result.scriptText)
      useAppStore.getState().addToast('Script generated', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Script generation failed. Check your API key and try again.'
      setError(msg)
      useAppStore.getState().addToast(`Script generation failed: ${msg}`, 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="relative flex flex-col pb-32 md:flex-row md:h-full md:pb-0">
      {/* Left panel — inputs */}
      <div className="flex w-full md:w-1/2 shrink-0 flex-col border-b md:border-b-0 md:border-r border-white/5">
        <InputPanel
          winningTranscript={winningTranscript}
          onTranscriptChange={setWinningTranscript}
          selectedProduct={selectedProduct}
          onProductSelect={handleProductSelect}
          additionalContext={additionalContext}
          onAdditionalContextChange={setAdditionalContext}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          highlightField={highlightField}
        />
      </div>

      {/* Right panel — output */}
      <div className="flex w-full md:w-1/2 flex-col min-h-[300px] md:min-h-0">
        <OutputPanel
          scriptText={generatedScript}
          linkedProductId={selectedProduct?.id ?? null}
          isGenerating={isGenerating}
          error={error}
        />
      </div>
    </div>
  )
}
