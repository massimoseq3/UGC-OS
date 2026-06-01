import { useMemo, useState, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useBankStore } from '../../stores/bankStore'
import type { Product, ScriptHistoryItem } from '../../stores/types'
import InputPanel from './components/InputPanel'
import RightPanel from './components/RightPanel'
import { generateScript } from './services/generateScript'
import { humanizeError } from '../../utils/friendlyError'
import type { ScriptMode, EditableProductContext } from './types'
import { usePersistedState, useProjectScopedKey } from '../../hooks/usePersistedState'

interface ReverseEngineerPayload {
  fullPrompt?: string
  scenes?: Array<{ prompt: string; index: number; label: string; startTime: string; endTime: string }>
}

export default function ScriptArchitect() {
  const baseKey = useProjectScopedKey('script-architect')
  const [mode, setMode] = usePersistedState<ScriptMode>(`${baseKey}:mode`, 'remix')
  const [winningTranscript, setWinningTranscript] = usePersistedState(`${baseKey}:transcript`, '')
  const [reversePrompt, setReversePrompt] = usePersistedState(`${baseKey}:reversePrompt`, '')
  const [selectedProductId, setSelectedProductId] = usePersistedState<string | null>(`${baseKey}:productId`, null)
  const [additionalContext, setAdditionalContext] = usePersistedState(`${baseKey}:context`, '')
  const [variations, setVariations] = usePersistedState<string[]>(`${baseKey}:variations`, [])
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highlightField, setHighlightField] = useState<string | null>(null)

  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)
  const getProductById = useBankStore((s) => s.getProductById)
  const products = useBankStore((s) => s.products)
  const scriptHistory = useBankStore((s) => s.scriptHistory)
  const addScriptHistory = useBankStore((s) => s.addScriptHistory)
  const deleteScriptHistory = useBankStore((s) => s.deleteScriptHistory)

  const selectedProduct = useMemo<Product | null>(
    () => (selectedProductId ? products.find((p) => p.id === selectedProductId) ?? null : null),
    [selectedProductId, products],
  )
  const handleProductSelect = (p: Product | null) => setSelectedProductId(p?.id ?? null)

  // Consume inter-app payloads
  useEffect(() => {
    if (activeApp !== 'script-architect') return
    if (!interAppPayload || interAppPayload.targetApp !== 'script-architect') return

    const { targetField, data } = interAppPayload

    if (targetField === 'reverseEngineerPrompt') {
      const payload = data as ReverseEngineerPayload | string
      const full = typeof payload === 'string'
        ? payload
        : (payload.fullPrompt ?? (payload.scenes ?? [])
            .map((s) => `--- Scene ${s.index}: ${s.label} (${s.startTime}-${s.endTime}) ---\n${s.prompt}`)
            .join('\n\n'))
      setMode('reverse-engineer')
      setReversePrompt(full)
      setHighlightField('reverse-prompt')
      setTimeout(() => setHighlightField(null), 800)
    } else if (targetField === 'winningTranscript' || targetField === 'reconstructionPrompt') {
      setMode('remix')
      setWinningTranscript(data as string)
      setHighlightField('transcript')
      setTimeout(() => setHighlightField(null), 800)
    } else if (targetField === 'productId') {
      const product = getProductById(data as string)
      if (product) setSelectedProductId(product.id)
    }

    consumePayload()
  }, [interAppPayload, activeApp, consumePayload, getProductById, setMode, setReversePrompt, setWinningTranscript, setSelectedProductId])

  const handleGenerate = async (productContext: EditableProductContext | null) => {
    const sourceFilled = mode === 'remix' ? winningTranscript.trim() : reversePrompt.trim()
    if (!sourceFilled || !selectedProduct) return

    setIsGenerating(true)
    setError(null)
    setActiveHistoryId(null)
    try {
      const result = await generateScript({
        mode,
        winningTranscript,
        reversePrompt,
        productId: selectedProduct.id,
        productContext,
        additionalContext,
      })
      setVariations(result.variations)

      const inputSource = mode === 'remix' ? winningTranscript : reversePrompt
      const item: ScriptHistoryItem = {
        id: crypto.randomUUID(),
        mode,
        variations: result.variations,
        inputSummary: inputSource.slice(0, 200),
        linkedProductId: selectedProduct.id,
        productName: selectedProduct.productName,
        winningTranscript,
        reversePrompt,
        additionalContext,
        createdAt: Date.now(),
      }
      addScriptHistory(item)
      setActiveHistoryId(item.id)

      useAppStore.getState().addToast(
        mode === 'remix' ? '3 script variations generated' : 'Script rewritten',
        'success',
      )
    } catch (err) {
      const msg = humanizeError(err, 'Script generation failed. Check your API key and try again.')
      setError(msg)
      useAppStore.getState().addToast(`Script generation failed: ${msg}`, 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSelectHistory = (item: ScriptHistoryItem) => {
    setMode(item.mode)
    setVariations(item.variations)
    setActiveHistoryId(item.id)
    setError(null)
    // Restore the left-panel inputs too. Older rows (saved before these
    // fields existed) fall back to the inputSummary slice for the source so
    // something sensible reappears.
    setWinningTranscript(item.winningTranscript ?? (item.mode === 'remix' ? item.inputSummary : ''))
    setReversePrompt(item.reversePrompt ?? (item.mode === 'reverse-engineer' ? item.inputSummary : ''))
    setAdditionalContext(item.additionalContext ?? '')
    setSelectedProductId(item.linkedProductId ?? null)
  }

  const handleDeleteHistory = (id: string) => {
    deleteScriptHistory(id)
    if (activeHistoryId === id) setActiveHistoryId(null)
  }

  // Full blank slate: wipe the visible output AND the inputs (source text +
  // selected product + context). Generated runs already live in the History
  // tab (auto-pushed on generate), so nothing is lost.
  const handleClearOutput = () => {
    setVariations([])
    setActiveHistoryId(null)
    setError(null)
    setWinningTranscript('')
    setReversePrompt('')
    setSelectedProductId(null)
    setAdditionalContext('')
  }

  return (
    <div className="relative flex flex-col pb-32 md:flex-row md:h-full md:pb-0">
      <div className="flex w-full md:w-1/2 shrink-0 flex-col border-b md:border-b-0 md:border-r border-white/5">
        <InputPanel
          mode={mode}
          onModeChange={setMode}
          winningTranscript={winningTranscript}
          onTranscriptChange={setWinningTranscript}
          reversePrompt={reversePrompt}
          onReversePromptChange={setReversePrompt}
          selectedProduct={selectedProduct}
          onProductSelect={handleProductSelect}
          additionalContext={additionalContext}
          onAdditionalContextChange={setAdditionalContext}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          highlightField={highlightField}
        />
      </div>

      <div className="flex w-full md:w-1/2 flex-col min-h-[300px] md:min-h-0">
        <RightPanel
          variations={variations}
          mode={mode}
          linkedProductId={selectedProduct?.id ?? null}
          isGenerating={isGenerating}
          error={error}
          history={scriptHistory}
          activeHistoryId={activeHistoryId}
          onSelectHistory={handleSelectHistory}
          onDeleteHistory={handleDeleteHistory}
          onClearOutput={handleClearOutput}
        />
      </div>
    </div>
  )
}
