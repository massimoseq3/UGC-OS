import { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useBankStore } from '../../stores/bankStore'
import type { Product, Model, Script, BrollHistoryItem } from '../../stores/types'
import type { BrollResult, PromptVariation, ReferenceImage, VariationTag, VariationRefs, CardState } from './types'
import { generateBroll } from './services/generateBroll'
import InputPanel from './components/InputPanel'
import RightPanel from './components/RightPanel'
import { backfillCardState } from './cardState'
import BankPicker from '../../components/BankPicker'
import { usePersistedState, useProjectScopedKey } from '../../hooks/usePersistedState'
import { humanizeError } from '../../utils/friendlyError'

type PickerMode = 'products' | 'models' | 'scripts' | null

// Map old slash-form tag values onto the new single-word union. Variations
// generated before iteration 3 carry strings like 'CHARACTER / SPEAKING';
// after migration they become 'DIALOGUE'. Keys are typed as `string` to
// match raw localStorage values.
const TAG_MIGRATION: Record<string, VariationTag> = {
  'CHARACTER / SPEAKING': 'DIALOGUE',
  'LITERAL / ACTION': 'ACTION',
  'EMOTIONAL / REACTION': 'EMOTIONAL',
  'PRODUCT / DETAIL': 'PRODUCT',
  // Identity entries so already-migrated tags pass through unchanged.
  'DIALOGUE': 'DIALOGUE',
  'ACTION': 'ACTION',
  'EMOTIONAL': 'EMOTIONAL',
  'PRODUCT': 'PRODUCT',
}

const DEFAULT_LABELS: Record<VariationTag, string> = {
  DIALOGUE: 'Talking to camera',
  ACTION: 'Literal action',
  EMOTIONAL: 'Emotional reaction',
  PRODUCT: 'Product detail',
}

function migrateVariation(v: PromptVariation): PromptVariation {
  const rawTag = (v.tag as unknown as string) ?? 'ACTION'
  const tag = TAG_MIGRATION[rawTag] ?? 'ACTION'
  // Old data stored a positional label like 'Option 1' — drop it for the
  // descriptive default unless the LLM already filled in something better.
  const looksPositional = !v.label || /^option\s*\d/i.test(v.label)
  const label = looksPositional ? DEFAULT_LABELS[tag] : v.label
  // Default refs to 'both' when the persisted variation didn't have any
  // reference declaration. Keeps existing card behaviour (both refs attached).
  const refs: VariationRefs = v.refs ?? 'both'
  // Strip any leftover LLM template wrappers from prompts persisted before
  // the parser fix landed. Same regex set the parser now applies.
  const prompt = (v.prompt ?? '')
    .replace(/<LABEL>[\s\S]*?<\/LABEL>/g, '')
    .replace(/<REFS>[\s\S]*?<\/REFS>/g, '')
    .replace(/<\/?(PROMPT|VAR_\d+|TAG|POSITION|VISIBILITY)>/g, '')
    .trim()
  return { ...v, tag, label, refs, prompt }
}

function newSessionId(): string {
  return crypto.randomUUID()
}

// Capped at 80 chars so the history row shows the gist without wrapping.
function buildInputSummary(productName: string | undefined, scriptText: string): string {
  const prefix = productName ? `${productName} — ` : ''
  const body = scriptText.trim().replace(/\s+/g, ' ').slice(0, 80 - prefix.length)
  return `${prefix}${body}`.trim() || 'Untitled session'
}

export default function BrollStudio() {
  const baseKey = useProjectScopedKey('broll-studio')
  const [selectedProductId, setSelectedProductId] = usePersistedState<string | null>(`${baseKey}:productId`, null)
  const [selectedModelId, setSelectedModelId] = usePersistedState<string | null>(`${baseKey}:modelId`, null)
  const [selectedScriptId, setSelectedScriptId] = usePersistedState<string | null>(`${baseKey}:scriptId`, null)
  const [scriptText, setScriptText] = usePersistedState(`${baseKey}:scriptText`, '')
  const [additionalContext, setAdditionalContext] = usePersistedState(`${baseKey}:context`, '')
  const [result, setResult] = usePersistedState<BrollResult | null>(
    `${baseKey}:result`,
    null,
    {
      // Migrate persisted scenes from the legacy slash-form tag union
      // (CHARACTER / SPEAKING etc) into the new clean union (DIALOGUE etc).
      // Also backfill new fields (label, refs) on older variations so the
      // UI doesn't render undefined chips. Runs once on hydrate.
      sanitize: (raw) => {
        if (!raw || !raw.scenes) return raw
        return {
          ...raw,
          scenes: raw.scenes.map((s) => ({
            ...s,
            variations: s.variations.map(migrateVariation),
          })),
        }
      },
    },
  )

  // Per-card state — lifted from RightPanel so BrollStudio can snapshot it
  // into the brollHistory bank whenever it changes. Sanitized on hydrate to
  // clear transient flags + backfill legacy fields.
  const [cardStates, setCardStates] = usePersistedState<Record<string, CardState>>(
    `${baseKey}:cardStates`,
    {},
    {
      sanitize: (raw) => {
        const next: Record<string, CardState> = {}
        const stripTags = (s: string) => s
          .replace(/<LABEL>[\s\S]*?<\/LABEL>/g, '')
          .replace(/<REFS>[\s\S]*?<\/REFS>/g, '')
          .replace(/<\/?(PROMPT|VAR_\d+|TAG|POSITION|VISIBILITY)>/g, '')
          .trim()
        for (const k in raw) {
          const card = raw[k] as Partial<CardState> & Record<string, unknown>
          const patched: CardState = backfillCardState(card)
          patched.isGeneratingImage = false
          patched.pendingTaskId = null
          patched.pendingModelId = null
          patched.pendingStartedAt = null
          patched.videoStatus = 'idle'
          patched.videoTaskId = null
          patched.videoStartedAt = null
          patched.isPromptWorking = false
          patched.promptError = null
          // Clean leftover LLM template wrappers from anything the user typed
          // before the parser fix shipped. Same regex set as the parser.
          patched.editablePrompt = stripTags(patched.editablePrompt ?? '')
          patched.promptHistory = (patched.promptHistory ?? []).map(stripTags)
          next[k] = patched
        }
        return next
      },
    },
  )

  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerMode, setPickerMode] = useState<PickerMode>(null)
  const [highlightField, setHighlightField] = useState<string | null>(null)

  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)
  const getScriptById = useBankStore((s) => s.getScriptById)
  const products = useBankStore((s) => s.products)
  const models = useBankStore((s) => s.models)
  const scripts = useBankStore((s) => s.scripts)
  const upsertBrollHistory = useBankStore((s) => s.upsertBrollHistory)

  // Active session id for the brollHistory upsert. Persisted so a refresh
  // mid-session keeps editing the same history row instead of forking a new
  // one. Cleared (= regenerated) whenever the user runs a fresh generation.
  const [sessionId, setSessionId] = usePersistedState<string>(`${baseKey}:sessionId`, '')
  const sessionIdRef = useRef(sessionId)
  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])

  // Active history row in the History tab — highlights the row that's
  // currently being edited / restored.
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(sessionId || null)
  useEffect(() => { setActiveHistoryId(sessionId || null) }, [sessionId])

  const selectedProduct = useMemo<Product | null>(
    () => (selectedProductId ? products.find((p) => p.id === selectedProductId) ?? null : null),
    [selectedProductId, products],
  )
  const selectedModel = useMemo<Model | null>(
    () => (selectedModelId ? models.find((m) => m.id === selectedModelId) ?? null : null),
    [selectedModelId, models],
  )
  const selectedScript = useMemo<Script | null>(
    () => (selectedScriptId ? scripts.find((s) => s.id === selectedScriptId) ?? null : null),
    [selectedScriptId, scripts],
  )

  // Consume inter-app payload (from Scripts "Send to B-Roll Images")
  useEffect(() => {
    if (activeApp !== 'broll-studio') return
    if (!interAppPayload || interAppPayload.targetApp !== 'broll-studio') return

    const { targetField, data } = interAppPayload

    if (targetField === 'scriptText' && typeof data === 'string') {
      setScriptText(data)
      setSelectedScriptId(null)
      setHighlightField('script')
      setTimeout(() => setHighlightField(null), 800)
    }

    if (targetField === 'scriptId' && typeof data === 'string') {
      const script = getScriptById(data)
      if (script) {
        setSelectedScriptId(script.id)
        setScriptText(script.scriptText)
        setHighlightField('script')
        setTimeout(() => setHighlightField(null), 800)
      }
    }

    consumePayload()
  }, [interAppPayload, activeApp, consumePayload, getScriptById])

  // Persist the current session into brollHistory whenever the result or
  // card states change. Debounced ~1s so rapid edits (e.g. typing into a
  // prompt) don't thrash localStorage. Only writes when there's actually a
  // result to snapshot.
  useEffect(() => {
    if (!result || !sessionIdRef.current) return
    const handle = setTimeout(() => {
      const item: BrollHistoryItem = {
        id: sessionIdRef.current,
        createdAt: Date.now(),
        inputSummary: buildInputSummary(selectedProduct?.productName, scriptText),
        productId: selectedProductId ?? undefined,
        modelId: selectedModelId ?? undefined,
        scriptId: selectedScriptId ?? undefined,
        scriptText: scriptText || undefined,
        context: additionalContext || undefined,
        result,
        cardStates,
      }
      upsertBrollHistory(item)
    }, 1000)
    return () => clearTimeout(handle)
  }, [result, cardStates, selectedProductId, selectedModelId, selectedScriptId, scriptText, additionalContext, selectedProduct, upsertBrollHistory])

  // Wipe the visible scenes for a blank slate. The prior session is already
  // saved as its own brollHistory row (keyed by the old sessionId); clearing
  // the sessionId here means the next generation forks a fresh row and the
  // History upsert effect skips (it early-returns when result/sessionId is
  // empty), so nothing is overwritten.
  const handleClearOutput = () => {
    setResult(null)
    setCardStates({})
    setSessionId('')
    setError(null)
    // Also clear the inputs / references so the workspace is a true blank
    // slate (the prior session is preserved as its own brollHistory row).
    setSelectedProductId(null)
    setSelectedModelId(null)
    setSelectedScriptId(null)
    setScriptText('')
    setAdditionalContext('')
  }

  const handleSelectProduct = (item: unknown) => {
    setSelectedProductId((item as Product).id)
    setPickerMode(null)
  }

  const handleSelectModel = (item: unknown) => {
    setSelectedModelId((item as Model).id)
    setPickerMode(null)
  }

  const handleSelectScript = (item: unknown) => {
    const script = item as Script
    setSelectedScriptId(script.id)
    setScriptText(script.scriptText)
    setPickerMode(null)
  }

  // Functional setResult + useCallback keeps these referentially stable so the
  // memoized VariationCardRow doesn't re-render every card on each render.
  const handleAddVariation = useCallback((sceneNumber: number, variation: PromptVariation) => {
    setResult((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        scenes: prev.scenes.map((s) =>
          s.number === sceneNumber
            ? { ...s, variations: [...s.variations, { ...variation, label: `Option ${s.variations.length + 1}` }] }
            : s
        ),
      }
    })
  }, [setResult])

  const handleDeleteVariation = useCallback((sceneNumber: number, variationId: string) => {
    setResult((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        scenes: prev.scenes.map((s) =>
          s.number === sceneNumber
            ? { ...s, variations: s.variations.filter((v) => v.id !== variationId) }
            : s
        ),
      }
    })
  }, [setResult])

  const handleOpenCharacterPicker = useCallback(() => setPickerMode('models'), [])
  const handleOpenProductPicker = useCallback(() => setPickerMode('products'), [])

  // Build context strings and reference images from selected bank items
  const productContext = selectedProduct
    ? `Product: ${selectedProduct.productName}. ${selectedProduct.productDescription}. USPs: ${selectedProduct.usps}. Benefits: ${selectedProduct.benefits}.`
    : ''
  const modelContext = selectedModel
    ? `Model/Character: ${selectedModel.name}.${selectedModel.notes ? ` ${selectedModel.notes}.` : ''}${selectedModel.jsonProfile ? ` Profile: ${JSON.stringify(selectedModel.jsonProfile)}` : ''}`
    : ''
  const characterRef = useMemo<ReferenceImage | undefined>(
    () => (selectedModel?.characterImage ? { dataUrl: selectedModel.characterImage, label: 'character' } : undefined),
    [selectedModel?.characterImage],
  )
  const productRef = useMemo<ReferenceImage | undefined>(
    () => (selectedProduct?.productImage ? { dataUrl: selectedProduct.productImage, label: 'product' } : undefined),
    [selectedProduct?.productImage],
  )
  // Combined ref bundle passed to the scene-generation LLM call — gives it
  // visibility into which reference images the user has selected so it can
  // emit sensible <REFS> tags per variation.
  const referenceImages: ReferenceImage[] = [
    ...(characterRef ? [characterRef] : []),
    ...(productRef ? [productRef] : []),
  ]

  const handleGenerate = async () => {
    if (!scriptText.trim()) return
    setIsGenerating(true)
    setError(null)
    // Fresh session — clear any prior cardStates and stamp a new id so the
    // History upsert lands as a new row.
    const id = newSessionId()
    setSessionId(id)
    setCardStates({})
    try {
      const res = await generateBroll({
        productId: selectedProduct?.id ?? null,
        modelId: selectedModel?.id ?? null,
        scriptId: selectedScript?.id ?? null,
        scriptText,
        additionalContext,
        productContext,
        modelContext,
        referenceImages,
      })
      setResult(res)
      useAppStore.getState().addToast('B-roll image generated', 'success')
    } catch (err) {
      const msg = humanizeError(err, 'B-Roll generation failed. Check your API key and try again.')
      setError(msg)
      useAppStore.getState().addToast(`B-roll generation failed: ${msg}`, 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  // Restore a B-Roll session from history. Loads all inputs + result +
  // cardStates back into the workspace. Images/videos resume from their
  // asset:// refs (IndexedDB / R2). Sets sessionId so further edits update
  // the same history row instead of forking a new one.
  const handleSelectHistory = (item: BrollHistoryItem) => {
    setSessionId(item.id)
    setSelectedProductId(item.productId ?? null)
    setSelectedModelId(item.modelId ?? null)
    setSelectedScriptId(item.scriptId ?? null)
    setScriptText(item.scriptText ?? '')
    setAdditionalContext(item.context ?? '')
    setResult(item.result as BrollResult)
    const restored: Record<string, CardState> = {}
    for (const k in item.cardStates as Record<string, unknown>) {
      restored[k] = backfillCardState(
        (item.cardStates as Record<string, Partial<CardState> & Record<string, unknown>>)[k],
      )
    }
    setCardStates(restored)
    setActiveHistoryId(item.id)
  }

  return (
    <div className="flex flex-col pb-28 md:flex-row md:h-full md:pb-0">
      {/* Left panel — inputs */}
      <div className="flex w-full md:w-1/4 shrink-0 flex-col border-b md:border-b-0 md:border-r border-ink/5">
        <InputPanel
          selectedProduct={selectedProduct}
          selectedModel={selectedModel}
          selectedScript={selectedScript}
          scriptText={scriptText}
          additionalContext={additionalContext}
          onSelectProduct={() => setPickerMode('products')}
          onSelectModel={() => setPickerMode('models')}
          onSelectScript={() => setPickerMode('scripts')}
          onClearProduct={() => setSelectedProductId(null)}
          onClearModel={() => setSelectedModelId(null)}
          onClearScript={() => setSelectedScriptId(null)}
          onScriptTextChange={(v) => { setScriptText(v); setSelectedScriptId(null) }}
          onAdditionalContextChange={setAdditionalContext}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          highlightField={highlightField}
          onClearOutput={handleClearOutput}
        />
      </div>

      {/* Right panel — output */}
      <div className="flex w-full md:w-3/4 flex-col overflow-hidden">
        <RightPanel
          result={result}
          isGenerating={isGenerating}
          error={error}
          onAddVariation={handleAddVariation}
          onDeleteVariation={handleDeleteVariation}
          characterRef={characterRef}
          productRef={productRef}
          selectedProduct={selectedProduct}
          selectedModel={selectedModel}
          selectedProductId={selectedProduct?.id ?? undefined}
          selectedModelId={selectedModel?.id ?? undefined}
          selectedScriptId={selectedScript?.id ?? undefined}
          productContext={productContext}
          modelContext={modelContext}
          onOpenCharacterPicker={handleOpenCharacterPicker}
          onOpenProductPicker={handleOpenProductPicker}
          cardStates={cardStates}
          setCardStates={setCardStates}
          activeHistoryId={activeHistoryId}
          onSelectHistory={handleSelectHistory}
        />
      </div>

      {/* Bank Pickers */}
      <BankPicker
        bankType="products"
        isOpen={pickerMode === 'products'}
        onSelect={handleSelectProduct}
        onClose={() => setPickerMode(null)}
      />
      <BankPicker
        bankType="models"
        isOpen={pickerMode === 'models'}
        onSelect={handleSelectModel}
        onClose={() => setPickerMode(null)}
      />
      <BankPicker
        bankType="scripts"
        isOpen={pickerMode === 'scripts'}
        onSelect={handleSelectScript}
        onClose={() => setPickerMode(null)}
      />
    </div>
  )
}
