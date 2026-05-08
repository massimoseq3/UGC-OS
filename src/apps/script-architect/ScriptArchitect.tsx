import { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useBankStore } from '../../stores/bankStore'
import type { Product } from '../../stores/types'
import InputPanel from './components/InputPanel'
import OutputPanel from './components/OutputPanel'
import { generateScript } from './services/generateScript'

export default function ScriptArchitect() {
  const [winningTranscript, setWinningTranscript] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [additionalContext, setAdditionalContext] = useState('')
  const [generatedScript, setGeneratedScript] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highlightField, setHighlightField] = useState<string | null>(null)

  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)
  const getProductById = useBankStore((s) => s.getProductById)

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
      if (product) setSelectedProduct(product)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Script generation failed. Check your API key and try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Left panel — inputs */}
      <div className="flex w-full lg:w-1/2 shrink-0 flex-col border-b lg:border-b-0 lg:border-r border-white/5">
        <InputPanel
          winningTranscript={winningTranscript}
          onTranscriptChange={setWinningTranscript}
          selectedProduct={selectedProduct}
          onProductSelect={setSelectedProduct}
          additionalContext={additionalContext}
          onAdditionalContextChange={setAdditionalContext}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          highlightField={highlightField}
        />
      </div>

      {/* Right panel — output */}
      <div className="flex w-full lg:w-1/2 flex-col min-h-[300px] lg:min-h-0">
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
