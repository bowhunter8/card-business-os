'use client'

import { useMemo, useState } from 'react'

type ChecklistCardResearchProps = {
  year?: string | null
  brand?: string | null
  setName?: string | null
  playerName?: string | null
  cardNumber?: string | null
  parallel?: string | null
  variation?: string | null
  rookie?: boolean | null
  className?: string
}

function clean(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function buildSearchQuery(props: ChecklistCardResearchProps) {
  const parts = [
    clean(props.year),
    clean(props.brand),
    clean(props.setName),
    clean(props.playerName),
    clean(props.cardNumber)
      ? `#${clean(props.cardNumber).replace(/^#/, '')}`
      : '',
    clean(props.parallel),
    clean(props.variation),
    props.rookie ? 'rookie' : '',
  ].filter(Boolean)

  const seen = new Set<string>()

  return parts
    .join(' ')
    .split(/\s+/)
    .filter((word) => {
      const key = word.toLowerCase()
      if (!word || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join(' ')
}

function buildGoogleUrl(query: string) {
  const url = new URL('https://www.google.com/search')
  url.searchParams.set('q', query)
  return url.toString()
}

function buildEbaySoldUrl(query: string) {
  const url = new URL('https://www.ebay.com/sch/i.html')
  url.searchParams.set('_nkw', query)
  url.searchParams.set('LH_Sold', '1')
  url.searchParams.set('LH_Complete', '1')
  url.searchParams.set('rt', 'nc')
  return url.toString()
}

export default function ChecklistCardResearch(
  props: ChecklistCardResearchProps
) {
  const query = useMemo(
    () => buildSearchQuery(props),
    [
      props.year,
      props.brand,
      props.setName,
      props.playerName,
      props.cardNumber,
      props.parallel,
      props.variation,
      props.rookie,
    ]
  )

  const [referenceValue, setReferenceValue] = useState('')

  function openExternal(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className={[
        'rounded-xl border border-slate-800 bg-slate-950/40 p-4',
        props.className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-400">
            Card Research
          </div>

          <div className="mt-1 text-sm font-semibold text-white">
            {query || 'Not enough card details to search yet.'}
          </div>

          <div className="mt-1 text-xs text-slate-500">
            Research opens only when you choose Google or eBay Sold.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openExternal(buildGoogleUrl(query))}
            disabled={!query}
            className="app-button disabled:cursor-not-allowed disabled:opacity-50"
          >
            Google
          </button>

          <button
            type="button"
            onClick={() => openExternal(buildEbaySoldUrl(query))}
            disabled={!query}
            className="app-button disabled:cursor-not-allowed disabled:opacity-50"
          >
            eBay Sold
          </button>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-800 pt-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="block min-w-0 flex-1">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Reference Value
            </span>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={referenceValue}
                onChange={(event) => setReferenceValue(event.target.value)}
                className="app-input w-full"
                placeholder="Optional"
              />
            </div>
          </label>

          <div className="text-xs text-slate-500 md:max-w-80">
            Optional for now. This value is not saved to HITS yet.
          </div>
        </div>
      </div>
    </div>
  )
}
