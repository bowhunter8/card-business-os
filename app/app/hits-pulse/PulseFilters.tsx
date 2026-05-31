'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'

type PulsePeriod = '7' | '30' | '90' | '365'
type PulseCategory =
  | ''
  | 'Sports Cards'
  | 'TCG / Other Cards'
  | 'Memorabilia'
  | 'Comics'
  | 'Coins / Currency / Jewelry / Watches'
  | 'LEGO / Toys'
  | 'Other'

type PeriodOption = {
  label: string
  value: PulsePeriod
  description: string
}

type PulseFiltersProps = {
  period: PulsePeriod
  category: PulseCategory
  subcategory: string
  q: string
  periodOptions: PeriodOption[]
  categoryOptions: PulseCategory[]
  subcategoryOptionsByCategory: Record<string, string[]>
}

function buildHref({
  period,
  category,
  subcategory,
  q,
}: {
  period: PulsePeriod
  category?: string
  subcategory?: string
  q?: string
}) {
  const params = new URLSearchParams()

  params.set('period', period)

  const cleanCategory = String(category ?? '').trim()
  const cleanSubcategory = String(subcategory ?? '').trim()
  const cleanSearch = String(q ?? '').trim()

  if (cleanCategory) params.set('category', cleanCategory)
  if (cleanSubcategory) params.set('subcategory', cleanSubcategory)
  if (cleanSearch) params.set('q', cleanSearch)

  return `/app/hits-pulse?${params.toString()}`
}

export default function PulseFilters({
  period,
  category,
  subcategory,
  q,
  periodOptions,
  categoryOptions,
  subcategoryOptionsByCategory,
}: PulseFiltersProps) {
  const router = useRouter()
  const [searchText, setSearchText] = useState(q)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setSearchText(q)
  }, [q])

  const subcategoryOptions = useMemo(() => {
    return category ? subcategoryOptionsByCategory[category] ?? [] : []
  }, [category, subcategoryOptionsByCategory])

  function go(next: {
    period?: PulsePeriod
    category?: PulseCategory
    subcategory?: string
    q?: string
  }) {
    const nextCategory = next.category ?? category
    const nextSubcategory = next.subcategory ?? subcategory

    startTransition(() => {
      router.replace(
        buildHref({
          period: next.period ?? period,
          category: nextCategory,
          subcategory: nextCategory ? nextSubcategory : '',
          q: next.q ?? searchText,
        }),
        { scroll: false }
      )
    })
  }

  return (
    <>
      <div>
        <div className="text-sm font-semibold text-zinc-200">Date range</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={isPending}
              onClick={() => go({ period: option.value })}
              className={`app-chip whitespace-nowrap ${
                period === option.value ? 'app-chip-active' : 'app-chip-idle'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <form
        action="/app/hits-pulse"
        className="grid gap-3 xl:grid-cols-[1fr_1fr_1.25fr_auto]"
        onSubmit={(event) => {
          event.preventDefault()
          go({ q: searchText })
        }}
      >
        <input type="hidden" name="period" value={period} />

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-300">Category</span>
          <select
            name="category"
            value={category}
            className="app-select w-full"
            disabled={isPending}
            onChange={(event) => {
              go({
                category: event.target.value as PulseCategory,
                subcategory: '',
              })
            }}
          >
            {categoryOptions.map((option) => (
              <option key={option || 'all'} value={option}>
                {option || 'All categories'}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-300">Subcategory</span>
          <select
            name="subcategory"
            value={subcategory}
            className="app-select w-full"
            disabled={!category || isPending}
            onChange={(event) => {
              go({ subcategory: event.target.value })
            }}
          >
            <option value="">
              {category ? 'All subcategories' : 'Choose a category first'}
            </option>
            {subcategoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-300">Search</span>
          <input
            name="q"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className="app-input w-full"
            placeholder="Search player, card, set, team..."
          />
        </label>

        <div className="flex items-end gap-2">
          <button className="app-button-primary whitespace-nowrap" type="submit" disabled={isPending}>
            Search
          </button>

          <button
            type="button"
            onClick={() => {
              setSearchText('')
              startTransition(() => {
                router.replace('/app/hits-pulse', { scroll: false })
              })
            }}
            className="app-button whitespace-nowrap"
            disabled={isPending}
          >
            Reset
          </button>
        </div>
      </form>
    </>
  )
}
