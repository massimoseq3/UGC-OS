import { useMemo, useState, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useBankStore } from '../../stores/bankStore'
import type { Model, Product, ScriptHistoryItem } from '../../stores/types'
import InputPanel from './components/InputPanel'
import RightPanel from './components/RightPanel'
import { generateScript } from './services/generateScript'
import { humanizeError } from '../../utils/friendlyError'
import { WRITE_STYLE_META, type ScriptMode, type EditableProductContext, type WriteStyle, type WriteFormat, type WriteLength } from './types'
import { usePersistedState, useProjectScopedKey } from '../../hooks/usePersistedState'

interface ReverseEngineerPayload {
  fullPrompt?: string
  scenes?: Array<{ prompt: string; index: number; label: string; startTime: string; endTime: string }>
}

// Substituted for an empty Write New brief so the model takes creative license
// instead of the user hitting a hard "brief required" wall.
const OPEN_BRIEF = "I'm open to seeing what you can come up with."

export default function ScriptArchitect() {
  const baseKey = useProjectScopedKey('script-architect')
  const [mode, setMode] = usePersistedState<ScriptMode>(`${baseKey}:mode`, 'remix')
  const [winningTranscript, setWinningTranscript] = usePersistedState(`${baseKey}:transcript`, '')
  const [reversePrompt, setReversePrompt] = usePersistedState(`${baseKey}:reversePrompt`, '')
  const [brief, setBrief] = usePersistedState(`${baseKey}:brief`, '')
  const [writeStyle, setWriteStyle] = usePersistedState<WriteStyle>(`${baseKey}:writeStyle`, 'pas')
  const [writeFormat, setWriteFormat] = usePersistedState<WriteFormat>(`${baseKey}:writeFormat`, 'script')
  const [writeLength, setWriteLength] = usePersistedState<WriteLength>(`${baseKey}:writeLength`, 15)
  const [selectedProductId, setSelectedProductId] = usePersistedState<string | null>(`${baseKey}:productId`, null)
  // Influencer (Bank → Influencers / models) for the cinematic 'prompt' format.
  // Optional, only used by that format: its portrait rides the Playground
  // handoff as the @INFLUENCER reference image.
  const [selectedInfluencerId, setSelectedInfluencerId] = usePersistedState<string | null>(`${baseKey}:influencerId`, null)
  const [additionalContext, setAdditionalContext] = usePersistedState(`${baseKey}:context`, '')
  const [variations, setVariations] = usePersistedState<string[]>(`${baseKey}:variations`, [])
  // Snapshot of the mode + style that produced the *currently shown*
  // variations. The output panel labels off these (not the live left-panel
  // selectors) so flipping the Style/mode after a generation doesn't
  // retroactively relabel the cards or their save-to-bank titles.
  const [outputMode, setOutputMode] = usePersistedState<ScriptMode>(`${baseKey}:outputMode`, 'remix')
  const [outputStyle, setOutputStyle] = usePersistedState<WriteStyle>(`${baseKey}:outputStyle`, 'pas')
  // Format + length pinned to the *currently shown* output, so the cinematic
  // "Send to Playground" handoff uses the duration that actually produced the
  // prompt — not whatever the live left-panel toggles read now.
  const [outputFormat, setOutputFormat] = usePersistedState<WriteFormat>(`${baseKey}:outputFormat`, 'script')
  const [outputLength, setOutputLength] = usePersistedState<WriteLength>(`${baseKey}:outputLength`, 15)
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highlightField, setHighlightField] = useState<string | null>(null)

  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)
  const getProductById = useBankStore((s) => s.getProductById)
  const products = useBankStore((s) => s.products)
  const models = useBankStore((s) => s.models)
  const scriptHistory = useBankStore((s) => s.scriptHistory)
  const addScriptHistory = useBankStore((s) => s.addScriptHistory)
  const deleteScriptHistory = useBankStore((s) => s.deleteScriptHistory)

  const selectedProduct = useMemo<Product | null>(
    () => (selectedProductId ? products.find((p) => p.id === selectedProductId) ?? null : null),
    [selectedProductId, products],
  )
  const handleProductSelect = (p: Product | null) => setSelectedProductId(p?.id ?? null)

  const selectedInfluencer = useMemo<Model | null>(
    () => (selectedInfluencerId ? models.find((m) => m.id === selectedInfluencerId) ?? null : null),
    [selectedInfluencerId, models],
  )
  const handleInfluencerSelect = (m: Model | null) => setSelectedInfluencerId(m?.id ?? null)

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
    // Write New's brief is optional: an empty brief hands the model creative
    // license rather than blocking generation (avoids decision paralysis for
    // users who don't know what to write).
    const effectiveBrief = mode === 'write' && !brief.trim() ? OPEN_BRIEF : brief
    const sourceFilled = mode === 'write' ? true : mode === 'remix' ? winningTranscript.trim() : reversePrompt.trim()
    if (!sourceFilled || !selectedProduct) return

    setIsGenerating(true)
    setError(null)
    setActiveHistoryId(null)
    // Lock the output's labelling context to this run up front, so the
    // loading copy and the resulting cards reflect what was generated.
    setOutputMode(mode)
    setOutputStyle(writeStyle)
    setOutputFormat(writeFormat)
    setOutputLength(writeLength)
    try {
      const result = await generateScript({
        mode,
        winningTranscript,
        reversePrompt,
        brief: effectiveBrief,
        writeStyle,
        writeFormat,
        writeLength,
        productId: selectedProduct.id,
        productName: selectedProduct.productName,
        productContext,
        additionalContext,
      })
      setVariations(result.variations)

      const inputSource = mode === 'write' ? brief : mode === 'remix' ? winningTranscript : reversePrompt
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
        brief,
        writeStyle,
        writeFormat,
        writeLength,
        createdAt: Date.now(),
      }
      addScriptHistory(item)
      setActiveHistoryId(item.id)

      useAppStore.getState().addToast(
        mode === 'write'
          ? (writeFormat === 'prompt' ? '3 cinematic concepts generated' : writeFormat === 'scenes' ? '3 scene drafts generated' : '3 scripts generated')
          : mode === 'remix' ? '3 script variations generated' : 'Script rewritten',
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
    // Pin the output labels to the run we're restoring.
    setOutputMode(item.mode)
    setOutputStyle(item.writeStyle && item.writeStyle in WRITE_STYLE_META ? (item.writeStyle as WriteStyle) : 'pas')
    setOutputFormat(item.writeFormat ?? 'script')
    setOutputLength(item.writeLength === 10 || item.writeLength === 15 || item.writeLength === 30 || item.writeLength === 60 ? item.writeLength : 15)
    // Restore the left-panel inputs too. Older rows (saved before these
    // fields existed) fall back to the inputSummary slice for the source so
    // something sensible reappears.
    setWinningTranscript(item.winningTranscript ?? (item.mode === 'remix' ? item.inputSummary : ''))
    setReversePrompt(item.reversePrompt ?? (item.mode === 'reverse-engineer' ? item.inputSummary : ''))
    setAdditionalContext(item.additionalContext ?? '')
    setSelectedProductId(item.linkedProductId ?? null)
    if (item.mode === 'write') {
      setBrief(item.brief ?? item.inputSummary)
      if (item.writeStyle && item.writeStyle in WRITE_STYLE_META) setWriteStyle(item.writeStyle as WriteStyle)
      if (item.writeFormat) setWriteFormat(item.writeFormat)
      if (item.writeLength === 10 || item.writeLength === 15 || item.writeLength === 30 || item.writeLength === 60) {
        setWriteLength(item.writeLength)
      }
    }
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
    setBrief('')
    setSelectedProductId(null)
    setSelectedInfluencerId(null)
    setAdditionalContext('')
  }

  return (
    <div className="relative flex flex-col pb-32 md:flex-row md:h-full md:pb-0">
      <div className="flex w-full md:w-1/2 shrink-0 flex-col border-b md:border-b-0 md:border-r border-ink/5">
        <InputPanel
          mode={mode}
          onModeChange={setMode}
          winningTranscript={winningTranscript}
          onTranscriptChange={setWinningTranscript}
          reversePrompt={reversePrompt}
          onReversePromptChange={setReversePrompt}
          brief={brief}
          onBriefChange={setBrief}
          writeStyle={writeStyle}
          onWriteStyleChange={setWriteStyle}
          writeFormat={writeFormat}
          onWriteFormatChange={setWriteFormat}
          writeLength={writeLength}
          onWriteLengthChange={setWriteLength}
          selectedProduct={selectedProduct}
          onProductSelect={handleProductSelect}
          selectedInfluencer={selectedInfluencer}
          onInfluencerSelect={handleInfluencerSelect}
          additionalContext={additionalContext}
          onAdditionalContextChange={setAdditionalContext}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          highlightField={highlightField}
          onClear={handleClearOutput}
        />
      </div>

      <div className="flex w-full md:w-1/2 flex-col min-h-[300px] md:min-h-0">
        <RightPanel
          variations={variations}
          mode={mode}
          outputMode={outputMode}
          writeFormat={outputFormat}
          writeStyleLabel={WRITE_STYLE_META[outputStyle].label}
          linkedProductId={selectedProduct?.id ?? null}
          influencer={selectedInfluencer}
          cinematicDuration={outputLength}
          isGenerating={isGenerating}
          error={error}
          history={scriptHistory}
          activeHistoryId={activeHistoryId}
          onSelectHistory={handleSelectHistory}
          onDeleteHistory={handleDeleteHistory}
        />
      </div>
    </div>
  )
}
