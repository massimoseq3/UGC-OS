import { useMemo, useState, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useBankStore } from '../../stores/bankStore'
import type { Product, Model, Script } from '../../stores/types'
import type { BrollResult, PromptVariation, ReferenceImage, VariationTag, VariationRefs } from './types'
import { generateBroll } from './services/generateBroll'
import InputPanel from './components/InputPanel'
import OutputPanel from './components/OutputPanel'
import BankPicker from '../../components/BankPicker'
import { usePersistedState, useProjectScopedKey } from '../../hooks/usePersistedState'

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
  return { ...v, tag, label, refs }
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

  const handleAddVariation = (sceneNumber: number, variation: PromptVariation) => {
    if (!result) return
    setResult({
      ...result,
      scenes: result.scenes.map((s) =>
        s.number === sceneNumber
          ? { ...s, variations: [...s.variations, { ...variation, label: `Option ${s.variations.length + 1}` }] }
          : s
      ),
    })
  }

  const handleDeleteVariation = (sceneNumber: number, variationId: string) => {
    if (!result) return
    setResult({
      ...result,
      scenes: result.scenes.map((s) =>
        s.number === sceneNumber
          ? { ...s, variations: s.variations.filter((v) => v.id !== variationId) }
          : s
      ),
    })
  }

  // Build context strings and reference images from selected bank items
  const productContext = selectedProduct
    ? `Product: ${selectedProduct.productName}. ${selectedProduct.productDescription}. USPs: ${selectedProduct.usps}. Benefits: ${selectedProduct.benefits}.`
    : ''
  const modelContext = selectedModel
    ? `Model/Character: ${selectedModel.name}.${selectedModel.notes ? ` ${selectedModel.notes}.` : ''}${selectedModel.jsonProfile ? ` Profile: ${JSON.stringify(selectedModel.jsonProfile)}` : ''}`
    : ''
  const characterRef: ReferenceImage | undefined = selectedModel?.characterImage
    ? { dataUrl: selectedModel.characterImage, label: 'character' }
    : undefined
  const productRef: ReferenceImage | undefined = selectedProduct?.productImage
    ? { dataUrl: selectedProduct.productImage, label: 'product' }
    : undefined
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
      const msg = err instanceof Error ? err.message : 'B-Roll generation failed. Check your API key and try again.'
      setError(msg)
      useAppStore.getState().addToast(`B-roll generation failed: ${msg}`, 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex flex-col pb-28 md:flex-row md:h-full md:pb-0">
      {/* Left panel — inputs */}
      <div className="flex w-full md:w-1/4 shrink-0 flex-col border-b md:border-b-0 md:border-r border-white/5">
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
        />
      </div>

      {/* Right panel — output */}
      <div className="flex w-full md:w-3/4 flex-col overflow-hidden">
        <OutputPanel
          result={result}
          isGenerating={isGenerating}
          error={error}
          onAddVariation={handleAddVariation}
          onDeleteVariation={handleDeleteVariation}
          characterRef={characterRef}
          productRef={productRef}
          selectedProductId={selectedProduct?.id ?? undefined}
          selectedModelId={selectedModel?.id ?? undefined}
          selectedScriptId={selectedScript?.id ?? undefined}
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
