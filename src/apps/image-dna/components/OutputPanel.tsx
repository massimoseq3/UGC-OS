import { useState } from 'react'
import { Copy, Check, Save, ChevronDown, ChevronUp, Dna, ArrowUpRight, User, Shirt, Move, MapPin, Camera } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useAppStore } from '../../../stores/appStore'
import type { VisualDNA, DNASectionName } from '../types'

const SECTION_CONFIG: Record<DNASectionName, { label: string; icon: React.ElementType }> = {
  model: { label: 'Model', icon: User },
  style: { label: 'Style', icon: Shirt },
  pose: { label: 'Pose & Action', icon: Move },
  location: { label: 'Location & Scene', icon: MapPin },
  camera: { label: 'Camera', icon: Camera },
}

// Human-readable labels for camelCase field keys
const FIELD_LABELS: Record<string, string> = {
  gender: 'Gender',
  age: 'Age Range',
  ethnicity: 'Ethnicity',
  bodyType: 'Body Type',
  skinTone: 'Skin Tone',
  skinTexture: 'Skin Texture',
  eyeColor: 'Eye Color',
  eyeShape: 'Eye Shape',
  hairColor: 'Hair Color',
  hairStyle: 'Hair Style',
  hairTexture: 'Hair Texture',
  facialFeatures: 'Facial Features',
  facialHair: 'Facial Hair',
  distinguishingMarks: 'Distinguishing Marks',
  clothingStyle: 'Clothing Style',
  accessories: 'Accessories',
  makeup: 'Makeup',
  pose: 'Pose',
  action: 'Action',
  expression: 'Expression',
  location: 'Location',
  background: 'Background',
  lighting: 'Lighting',
  weather: 'Weather',
  timeOfDay: 'Time of Day',
  shotType: 'Shot Type',
  cameraAngle: 'Camera Angle',
  cameraDevice: 'Camera Device',
}

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key
}

interface OutputPanelProps {
  dna: VisualDNA | null
  imageUrl: string | null
}

export default function OutputPanel({ dna, imageUrl }: OutputPanelProps) {
  const [copied, setCopied] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['model']))
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saved, setSaved] = useState(false)
  const [sentToStudio, setSentToStudio] = useState(false)

  const addModel = useBankStore((s) => s.addModel)
  const sendToApp = useAppStore((s) => s.sendToApp)
  const openApp = useAppStore((s) => s.openApp)
  const addToast = useAppStore((s) => s.addToast)

  if (!dna) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <Dna className="h-10 w-10 text-zinc-800" strokeWidth={1.5} />
        <p className="text-sm text-zinc-700">Upload an image to extract its Visual DNA</p>
        <p className="text-xs text-zinc-800">Structured JSON output will appear here</p>
      </div>
    )
  }

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  // Flatten DNA into UGC Character Studio's flat profile format
  const flattenDna = (): Record<string, string> => {
    const flat: Record<string, string> = {}
    for (const fields of Object.values(dna)) {
      for (const [key, value] of Object.entries(fields as Record<string, string>)) {
        flat[key] = value
      }
    }
    return flat
  }

  // Build flat prompt string for copying
  const buildPromptString = (): string => {
    const lines: string[] = []
    for (const [sectionKey, fields] of Object.entries(dna)) {
      const config = SECTION_CONFIG[sectionKey as DNASectionName]
      lines.push(`[${config?.label ?? sectionKey}]`)
      for (const [key, value] of Object.entries(fields as Record<string, string>)) {
        lines.push(`  ${fieldLabel(key)}: ${value}`)
      }
      lines.push('')
    }
    return lines.join('\n')
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(buildPromptString())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSave = () => {
    if (!saveName.trim()) return
    addModel({
      characterImage: imageUrl ?? '',
      name: saveName.trim(),
      notes: '',
      jsonProfile: dna as unknown as Record<string, unknown>,
      source: 'image-dna-extractor',
    })
    setShowSaveForm(false)
    setSaveName('')
    setSaved(true)
    addToast('Model saved to bank')
    setTimeout(() => setSaved(false), 3000)
  }

  const handleSendToCharacterStudio = () => {
    sendToApp({
      targetApp: 'character-studio',
      targetField: 'profile',
      data: flattenDna(),
    })
    openApp('character-studio')
    addToast('DNA sent to UGC Character Studio')
    setSentToStudio(true)
    setTimeout(() => setSentToStudio(false), 3000)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-5">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-200">Visual DNA</h3>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
        >
          {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy Prompt'}
        </button>
      </div>

      {/* Collapsible JSON sections */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-white/5 bg-black/20">
        {(Object.keys(dna) as DNASectionName[]).map((sectionKey) => {
          const fields = dna[sectionKey]
          const isExpanded = expandedSections.has(sectionKey)
          const config = SECTION_CONFIG[sectionKey]
          const Icon = config.icon
          return (
            <div key={sectionKey} className="border-b border-white/[0.03] last:border-0">
              <button
                onClick={() => toggleSection(sectionKey)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-green-400/60" strokeWidth={1.5} />
                  <span className="text-xs font-medium text-zinc-400">
                    {config.label}
                  </span>
                  <span className="text-[10px] tabular-nums text-zinc-700">
                    {Object.keys(fields).length} fields
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-3 w-3 text-zinc-600" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-zinc-600" />
                )}
              </button>
              {isExpanded && (
                <div className="px-4 pb-3">
                  {Object.entries(fields).map(([key, value]) => (
                    <div key={key} className="flex items-baseline gap-2 py-1">
                      <span className="shrink-0 text-[10px] font-medium text-zinc-600">{fieldLabel(key)}</span>
                      <span className="text-xs text-zinc-400">{value as string}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Action buttons */}
      <div className="mt-4 flex flex-col gap-2">
        {/* Save to Model Bank */}
        {showSaveForm ? (
          <div className="flex gap-2">
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              placeholder='e.g. "Sarah — Golden Hour"'
              autoFocus
              className="flex-1 rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-green-500/30"
            />
            <button
              onClick={handleSave}
              disabled={!saveName.trim()}
              className="rounded-full bg-green-500/15 px-4 py-2 text-xs font-medium text-green-400 transition-colors hover:bg-green-500/25 disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={() => { setShowSaveForm(false); setSaveName('') }}
              className="rounded-full px-4 py-2 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSaveForm(true)}
            className={`flex w-full items-center justify-center gap-2 rounded-full border px-6 py-3.5 text-[13px] font-medium tracking-tight transition-colors ${saved
              ? 'border-green-500/20 bg-green-500/10 text-green-400'
              : 'border-white/15 text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100'
              }`}
          >
            {saved ? (
              <><Check className="h-4 w-4" /> Saved to Model Bank</>
            ) : (
              <><Save className="h-4 w-4" /> Save to Model Bank</>
            )}
          </button>
        )}

        {/* Use in UGC Character Studio */}
        <button
          onClick={handleSendToCharacterStudio}
          className={`flex w-full items-center justify-center gap-2 rounded-full border px-6 py-3.5 text-[13px] font-medium tracking-tight transition-colors ${sentToStudio
            ? 'border-green-500/20 bg-green-500/10 text-green-400'
            : 'border-green-500/20 bg-green-500/10 text-green-400 hover:bg-green-500/20'
            }`}
        >
          {sentToStudio ? (
            <><Check className="h-4 w-4" /> Sent to UGC Character Studio</>
          ) : (
            <>Send to UGC Character Studio <ArrowUpRight className="h-3.5 w-3.5" /></>
          )}
        </button>
      </div>
    </div>
  )
}
