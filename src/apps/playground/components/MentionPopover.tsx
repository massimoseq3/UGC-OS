import { useMemo } from 'react'
import { Package, UserRound, Film, FileText } from 'lucide-react'
import { useBankStore } from '../../../stores/bankStore'
import { useAssetUrl } from '../../../hooks/useAssetUrl'
import type { BankReference } from '../types'
import type { Product, Model as Character, BRoll, Script } from '../../../stores/types'

interface MentionPopoverProps {
  query: string  // text after the @ that should narrow results
  onSelect: (ref: BankReference) => void
  // Positioning is owned by the parent (it wraps this in a positioned box so
  // the list floats ABOVE the prompt field and never covers what's typed).
}

// Lightweight @-mention popover, sectioned by kind. Uses the BankPicker filter
// semantics: case-insensitive substring against the primary name field. The
// list shows every matching bank item (the popover scrolls); typing after the
// @ narrows it. We only cap per-section when the query is empty, so a huge bank
// doesn't render hundreds of rows on the bare "@" — start typing to reach the
// rest.
const EMPTY_QUERY_CAP = 50

export default function MentionPopover({ query, onSelect }: MentionPopoverProps) {
  const products = useBankStore((s) => s.products)
  const characters = useBankStore((s) => s.models)
  const brolls = useBankStore((s) => s.brolls)
  const scripts = useBankStore((s) => s.scripts)

  const q = query.toLowerCase().trim()
  const cap = q ? Infinity : EMPTY_QUERY_CAP

  const matchedProducts = useMemo(() => {
    return products
      .filter((p) => !q || p.productName.toLowerCase().includes(q))
      .slice(0, cap)
  }, [products, q, cap])

  const matchedCharacters = useMemo(() => {
    return characters
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .slice(0, cap)
  }, [characters, q, cap])

  const matchedBrolls = useMemo(() => {
    return brolls
      .filter((b) => !q || b.prompt.toLowerCase().includes(q))
      .slice(0, cap)
  }, [brolls, q, cap])

  const matchedScripts = useMemo(() => {
    return scripts
      .filter((s) => !q || s.title.toLowerCase().includes(q) || s.scriptText.toLowerCase().includes(q))
      .slice(0, cap)
  }, [scripts, q, cap])

  const total =
    matchedProducts.length + matchedCharacters.length + matchedBrolls.length + matchedScripts.length

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-ink/10 bg-surface-2/95 shadow-2xl backdrop-blur-xl">
      {total === 0 ? (
        <div className="px-3 py-4 text-center text-[12px] text-ink-500">
          {q ? `No matches for "${query}"` : 'No bank items yet.'}
        </div>
      ) : (
        <div className="max-h-[280px] overflow-y-auto p-1">
          {matchedProducts.length > 0 && (
            <Section label="Products" icon={Package}>
              {matchedProducts.map((p) => (
                <MentionRow
                  key={p.id}
                  imageRef={p.productImage}
                  title={p.productName}
                  subtitle="Product"
                  onClick={() => onSelect({ kind: 'product', item: p as Product })}
                />
              ))}
            </Section>
          )}
          {matchedCharacters.length > 0 && (
            <Section label="Characters" icon={UserRound}>
              {matchedCharacters.map((c) => (
                <MentionRow
                  key={c.id}
                  imageRef={c.characterImage}
                  title={c.name}
                  subtitle="Character"
                  onClick={() => onSelect({ kind: 'character', item: c as Character })}
                />
              ))}
            </Section>
          )}
          {matchedBrolls.length > 0 && (
            <Section label="B-Rolls" icon={Film}>
              {matchedBrolls.map((b) => (
                <MentionRow
                  key={b.id}
                  imageRef={b.imageUrl}
                  title={b.prompt.slice(0, 40) || 'Untitled b-roll'}
                  subtitle="B-roll"
                  onClick={() => onSelect({ kind: 'broll', item: b as BRoll })}
                />
              ))}
            </Section>
          )}
          {matchedScripts.length > 0 && (
            <Section label="Scripts" icon={FileText}>
              {matchedScripts.map((s) => (
                <MentionRow
                  key={s.id}
                  fallbackIcon={FileText}
                  title={s.title || s.scriptText.slice(0, 40) || 'Untitled script'}
                  subtitle="Inserts script text"
                  onClick={() => onSelect({ kind: 'script', item: s as Script })}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1">
        <Icon className="h-3 w-3 text-ink-600" />
        <span className="text-[10px] uppercase tracking-wider text-ink-600">{label}</span>
      </div>
      {children}
    </div>
  )
}

function MentionRow({
  imageRef,
  title,
  subtitle,
  onClick,
  fallbackIcon: FallbackIcon,
}: {
  imageRef?: string
  title: string
  subtitle: string
  onClick: () => void
  // Shown in the thumbnail slot when there's no image (e.g. scripts).
  fallbackIcon?: React.ComponentType<{ className?: string }>
}) {
  const url = useAssetUrl(imageRef)
  return (
    <button
      type="button"
      // Use mousedown so we fire before the textarea's blur handler closes
      // the popover; click would never reach us.
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-ink/[0.05]"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ink/10 bg-ink/[0.04]">
        {url
          ? <img src={url} alt="" className="h-full w-full object-cover" />
          : FallbackIcon && <FallbackIcon className="h-3.5 w-3.5 text-ink-500" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-ink-200">{title}</p>
        <p className="truncate text-[10px] text-ink-500">{subtitle}</p>
      </div>
    </button>
  )
}
