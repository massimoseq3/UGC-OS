import { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useBankStore } from '../../stores/bankStore'
import type { Product, Model, Script } from '../../stores/types'
import type { BrollResult, PromptVariation, ReferenceImage } from './types'
import { generateBroll } from './services/generateBroll'
import InputPanel from './components/InputPanel'
import OutputPanel from './components/OutputPanel'
import BankPicker from '../../components/BankPicker'

type PickerMode = 'products' | 'models' | 'scripts' | null

export default function BrollStudio() {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [selectedScript, setSelectedScript] = useState<Script | null>(null)
  const [scriptText, setScriptText] = useState('')
  const [additionalContext, setAdditionalContext] = useState('')
  const [result, setResult] = useState<BrollResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [pickerMode, setPickerMode] = useState<PickerMode>(null)
  const [highlightField, setHighlightField] = useState<string | null>(null)

  const interAppPayload = useAppStore((s) => s.interAppPayload)
  const consumePayload = useAppStore((s) => s.consumePayload)
  const activeApp = useAppStore((s) => s.activeApp)
  const getScriptById = useBankStore((s) => s.getScriptById)

  // Consume inter-app payload (from Script Architect "Send to B-Roll Studio")
  useEffect(() => {
    if (activeApp !== 'broll-studio') return
    if (!interAppPayload || interAppPayload.targetApp !== 'broll-studio') return

    const { targetField, data } = interAppPayload

    if (targetField === 'scriptText' && typeof data === 'string') {
      setScriptText(data)
      setSelectedScript(null)
      setHighlightField('script')
      setTimeout(() => setHighlightField(null), 800)
    }

    if (targetField === 'scriptId' && typeof data === 'string') {
      const script = getScriptById(data)
      if (script) {
        setSelectedScript(script)
        setScriptText(script.scriptText)
        setHighlightField('script')
        setTimeout(() => setHighlightField(null), 800)
      }
    }

    consumePayload()
  }, [interAppPayload, activeApp, consumePayload, getScriptById])

  const handleSelectProduct = (item: unknown) => {
    setSelectedProduct(item as Product)
    setPickerMode(null)
  }

  const handleSelectModel = (item: unknown) => {
    setSelectedModel(item as Model)
    setPickerMode(null)
  }

  const handleSelectScript = (item: unknown) => {
    const script = item as Script
    setSelectedScript(script)
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

  // Build context strings and reference images from selected bank items
  const productContext = selectedProduct
    ? `Product: ${selectedProduct.productName}. ${selectedProduct.productDescription}. USPs: ${selectedProduct.usps}. Benefits: ${selectedProduct.benefits}.`
    : ''
  const modelContext = selectedModel
    ? `Model/Character: ${selectedModel.name}.${selectedModel.notes ? ` ${selectedModel.notes}.` : ''}${selectedModel.jsonProfile ? ` Profile: ${JSON.stringify(selectedModel.jsonProfile)}` : ''}`
    : ''
  const referenceImages: ReferenceImage[] = [
    ...(selectedModel?.characterImage ? [{ dataUrl: selectedModel.characterImage, label: 'model' }] : []),
    ...(selectedProduct?.productImage ? [{ dataUrl: selectedProduct.productImage, label: 'product' }] : []),
  ]

  const handleGenerate = async () => {
    if (!scriptText.trim()) return
    setIsGenerating(true)
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
    } catch {
      // Will improve with real API
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Left panel — inputs */}
      <div className="flex w-full lg:w-1/4 shrink-0 flex-col border-b lg:border-b-0 lg:border-r border-white/5">
        <InputPanel
          selectedProduct={selectedProduct}
          selectedModel={selectedModel}
          selectedScript={selectedScript}
          scriptText={scriptText}
          additionalContext={additionalContext}
          onSelectProduct={() => setPickerMode('products')}
          onSelectModel={() => setPickerMode('models')}
          onSelectScript={() => setPickerMode('scripts')}
          onScriptTextChange={(v) => { setScriptText(v); setSelectedScript(null) }}
          onAdditionalContextChange={setAdditionalContext}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          highlightField={highlightField}
        />
      </div>

      {/* Right panel — output */}
      <div className="flex w-full lg:w-3/4 flex-col overflow-hidden min-h-[400px] lg:min-h-0">
        <OutputPanel
          result={result}
          isGenerating={isGenerating}
          onAddVariation={handleAddVariation}
          referenceImages={referenceImages}
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
