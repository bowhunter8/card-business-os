'use client'

import { useMemo, useState } from 'react'

type EstimateCardInput = {
  title: string | null
  playerName: string | null
  year: number | null
  brand: string | null
  setName: string | null
  cardNumber: string | null
  parallel: string | null
  team: string | null
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function cleanText(value: string | number | null | undefined) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function cleanItemNumber(value: string | null | undefined) {
  const cleaned = cleanText(value).replace(/^#/, '').trim()
  return cleaned ? `#${cleaned}` : ''
}

function buildStructuredSearchQuery(item: EstimateCardInput) {
  const itemName = cleanText(item.playerName)

  const parts = [
    itemName,
    item.year,
    item.setName,
    cleanItemNumber(item.cardNumber),
    item.parallel,
  ]

  const structured = parts.map(cleanText).filter(Boolean).join(' ')

  if (structured) return structured

  return itemName
}

function cleanSearchTitle(value: string | null | undefined) {
  return cleanText(value)
    .replace(/[•·]/g, ' ')
    .replace(/\s+-\s+/g, ' ')
    .replace(/\((?:\d+\s*)?orders?\)/gi, ' ')
    .replace(/\bcombined\b/gi, ' ')
    .replace(/\bwhatnot\b/gi, ' ')
    .replace(/\borders?\b/gi, ' ')
    .replace(/\bbreaks?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSearchQuery(item: EstimateCardInput) {
  const structuredQuery = buildStructuredSearchQuery(item)

  if (structuredQuery) {
    return structuredQuery
  }

  return cleanSearchTitle(item.title)
}

function buildEbaySoldCompsUrl(searchQuery: string) {
  const url = new URL('https://www.ebay.com/sch/i.html')
  url.searchParams.set('_nkw', searchQuery)
  url.searchParams.set('LH_Sold', '1')
  url.searchParams.set('LH_Complete', '1')
  url.searchParams.set('rt', 'nc')
  return url.toString()
}

function buildSportsCardsProUrl(searchQuery: string) {
  const url = new URL('https://www.sportscardspro.com/search-products')
  url.searchParams.set('q', searchQuery)
  url.searchParams.set('type', 'prices')
  return url.toString()
}

function parseManualValue(value: string) {
  const cleaned = value.replace(/\$/g, '').replace(/,/g, '').trim()
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export default function EstimateValueHelper({
  item,
  inputId,
}: {
  item: EstimateCardInput
  inputId: string
}) {
  const [estimatedValue, setEstimatedValue] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null)

  const searchQuery = useMemo(() => buildSearchQuery(item), [item])
  const ebaySoldCompsUrl = useMemo(() => buildEbaySoldCompsUrl(searchQuery), [searchQuery])
  const sportsCardsProUrl = useMemo(() => buildSportsCardsProUrl(searchQuery), [searchQuery])

  function handleApplyEstimate() {
    const parsed = parseManualValue(estimatedValue)

    if (parsed == null) {
      setMessageType('error')
      setMessage('Enter a valid estimated value first.')
      return
    }

    const input = document.getElementById(inputId) as HTMLInputElement | null

    if (!input) {
      setMessageType('error')
      setMessage('Estimated value input was not found on this page.')
      return
    }

    input.value = parsed.toFixed(2)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))

    setMessageType('success')
    setMessage(`Applied ${money(parsed)} to the field. Click Save Changes to keep it.`)
  }

  return (
    <div className="mt-2 border-t border-zinc-800 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={ebaySoldCompsUrl}
          target="_blank"
          rel="noreferrer"
          className="app-button whitespace-nowrap px-2.5 py-1 text-xs"
        >
          eBay Sold Comps
        </a>

        <a
          href={sportsCardsProUrl}
          target="_blank"
          rel="noreferrer"
          className="app-button whitespace-nowrap px-2.5 py-1 text-xs"
        >
          Open SportsCardsPro
        </a>
      </div>

      <div className="mt-1.5 text-[11px] leading-snug text-zinc-500">
        Search uses Item Name, Year, Set, Item #, and Parallel. If those are blank, it falls back
        to the title. This does not change cost basis, COGS, or tax calculations.
      </div>

      <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950/70 p-2">
        <label
          htmlFor={`${inputId}-manual-estimate`}
          className="text-[11px] font-medium uppercase tracking-wide text-zinc-400"
        >
          Estimated Value
        </label>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input
            id={`${inputId}-manual-estimate`}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={estimatedValue}
            onChange={(event) => {
              setEstimatedValue(event.target.value)
              setMessage(null)
              setMessageType(null)
            }}
            placeholder="Example: 1.60"
            className="app-input max-w-[160px] px-2.5 py-1 text-xs"
          />

          <button
            type="button"
            onClick={handleApplyEstimate}
            className="app-button-primary whitespace-nowrap px-2.5 py-1 text-xs"
          >
            Apply
          </button>
        </div>

        <div className="mt-1.5 text-[11px] leading-snug text-zinc-500">
          This only fills the Est. Value / Unit field. You still need to click Save Changes.
        </div>
      </div>

      {message ? (
        <div
          className={`mt-2 text-[11px] leading-snug ${
            messageType === 'success' ? 'text-emerald-300' : 'text-red-300'
          }`}
        >
          {message}
        </div>
      ) : null}
    </div>
  )
}
