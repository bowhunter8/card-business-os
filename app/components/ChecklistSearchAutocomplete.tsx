'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export type ChecklistSearchOption = {
  id: string
  sport: string
  year: string
  manufacturer: string
  brand: string
  productName: string
  name: string
}

type RankedChecklist = {
  checklist: ChecklistSearchOption
  score: number
}

function clean(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function normalize(value: string | null | undefined) {
  return clean(value)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function expandSearchAliases(value: string) {
  let normalized = normalize(value)

  const replacements: Array<[RegExp, string]> = [
    [/\ba\s*(?:and|&)\s*g\b/g, 'allen ginter'],
    [/\ballen\s+and\s+ginter\b/g, 'allen ginter'],
    [/\bb\s*(?:and|&)\s*w\b/g, 'black white'],
    [/\bblack\s+and\s+white\b/g, 'black white'],
    [/\bcosmic\b/g, 'cosmic chrome'],
  ]

  for (const [pattern, replacement] of replacements) {
    normalized = normalized.replace(pattern, replacement)
  }

  return normalized.replace(/\s+/g, ' ').trim()
}

function seasonYearTerms(year: string) {
  const raw = clean(year)
  const terms = new Set<string>()

  if (!raw) return terms

  terms.add(normalize(raw))

  const seasonMatch = raw.match(/^(\d{4})\s*[-/]\s*(\d{2}|\d{4})$/)

  if (seasonMatch) {
    const startYear = Number(seasonMatch[1])
    const endPart = seasonMatch[2]
    const endYear =
      endPart.length === 4
        ? Number(endPart)
        : Math.floor(startYear / 100) * 100 + Number(endPart)

    terms.add(String(startYear))
    terms.add(String(endYear))
  } else if (/^\d{4}$/.test(raw)) {
    terms.add(raw)
  }

  return terms
}

function checklistSearchText(checklist: ChecklistSearchOption) {
  const yearTerms = Array.from(seasonYearTerms(checklist.year))

  return expandSearchAliases(
    [
      ...yearTerms,
      checklist.sport,
      checklist.manufacturer,
      checklist.brand,
      checklist.productName,
      checklist.name,
    ]
      .filter(Boolean)
      .join(' ')
  )
}

function checklistTitle(checklist: ChecklistSearchOption) {
  return (
    clean(checklist.name) ||
    [clean(checklist.year), clean(checklist.brand), clean(checklist.productName)]
      .filter(Boolean)
      .join(' ') ||
    'Untitled Checklist'
  )
}

function checklistMeta(checklist: ChecklistSearchOption) {
  return Array.from(
    new Set(
      [
        clean(checklist.sport),
        clean(checklist.year),
        clean(checklist.manufacturer),
        clean(checklist.brand),
      ].filter(Boolean)
    )
  ).join(' • ')
}

function scoreChecklist(query: string, checklist: ChecklistSearchOption) {
  const normalizedQuery = expandSearchAliases(query)
  const tokens = normalizedQuery.split(' ').filter(Boolean)

  if (tokens.length === 0) return 0

  const text = checklistSearchText(checklist)
  const title = expandSearchAliases(checklistTitle(checklist))
  const product = expandSearchAliases(checklist.productName)
  const sport = expandSearchAliases(checklist.sport)
  const yearTerms = seasonYearTerms(checklist.year)

  for (const token of tokens) {
    if (!text.includes(token)) return 0
  }

  let score = tokens.length * 25

  if (title === normalizedQuery) score += 300
  else if (title.startsWith(normalizedQuery)) score += 180
  else if (title.includes(normalizedQuery)) score += 140

  if (product === normalizedQuery) score += 220
  else if (product.startsWith(normalizedQuery)) score += 130
  else if (product.includes(normalizedQuery)) score += 100

  for (const token of tokens) {
    if (yearTerms.has(token)) score += 60
    if (sport === token) score += 35
  }

  return score
}

export default function ChecklistSearchAutocomplete({
  checklists,
}: {
  checklists: ChecklistSearchOption[]
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const matches = useMemo<RankedChecklist[]>(() => {
    const trimmed = query.trim()

    if (!trimmed) return []

    return checklists
      .map((checklist) => ({
        checklist,
        score: scoreChecklist(trimmed, checklist),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score

        return checklistTitle(a.checklist).localeCompare(
          checklistTitle(b.checklist),
          undefined,
          {
            numeric: true,
            sensitivity: 'base',
          }
        )
      })
      .slice(0, 12)
  }, [checklists, query])

  function openChecklist(checklist: ChecklistSearchOption) {
    setOpen(false)
    setActiveIndex(-1)
    router.push(`/app/checklists/${checklist.id}`)
  }

  function submitSearch() {
    const trimmed = query.trim()
    if (!trimmed) return

    router.push(`/app/checklists/search?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <div className="relative">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setOpen(true)
              setActiveIndex(-1)
            }}
            onFocus={() => {
              if (query.trim()) setOpen(true)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && matches.length > 0) {
                event.preventDefault()
                setOpen(true)
                setActiveIndex((current) =>
                  current < matches.length - 1 ? current + 1 : 0
                )
                return
              }

              if (event.key === 'ArrowUp' && matches.length > 0) {
                event.preventDefault()
                setOpen(true)
                setActiveIndex((current) =>
                  current > 0 ? current - 1 : matches.length - 1
                )
                return
              }

              if (event.key === 'Escape') {
                setOpen(false)
                setActiveIndex(-1)
                return
              }

              if (event.key === 'Enter') {
                event.preventDefault()

                if (open && activeIndex >= 0 && matches[activeIndex]) {
                  openChecklist(matches[activeIndex].checklist)
                  return
                }

                submitSearch()
              }
            }}
            placeholder="Try: 2026 Topps Finest, Chrome, Kurtz RC, ATT-2..."
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={open && matches.length > 0}
            aria-controls="checklist-search-suggestions"
            className="min-w-0 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-cyan-600"
          />

          {open && query.trim() && matches.length > 0 ? (
            <div
              id="checklist-search-suggestions"
              role="listbox"
              className="absolute z-50 mt-2 max-h-96 w-full overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl"
            >
              {matches.map(({ checklist }, index) => {
                const active = index === activeIndex

                return (
                  <button
                    key={checklist.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      openChecklist(checklist)
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`block w-full border-b border-zinc-800 px-4 py-3 text-left last:border-b-0 ${
                      active
                        ? 'bg-cyan-950/50'
                        : 'bg-zinc-950 hover:bg-zinc-900'
                    }`}
                  >
                    <div className="font-semibold text-zinc-100">
                      {checklistTitle(checklist)}
                    </div>

                    <div className="mt-1 text-xs text-zinc-400">
                      {checklistMeta(checklist)}
                    </div>
                  </button>
                )
              })}

              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  submitSearch()
                }}
                className="block w-full px-4 py-3 text-left text-sm font-semibold text-cyan-300 hover:bg-zinc-900"
              >
                Search cards for “{query.trim()}” →
              </button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={submitSearch}
          disabled={!query.trim()}
          className="app-button-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Search Checklists
        </button>
      </div>

      <p className="mt-2 text-xs text-zinc-500">
        Matching checklist products appear as you type. Select one immediately,
        or keep typing and search cards when you need a broader lookup.
      </p>
    </div>
  )
}
