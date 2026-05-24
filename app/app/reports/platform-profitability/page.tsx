import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

import ReportSummaryCards from '@/app/app/components/reports/ReportSummaryCards'
import ReportTable from '@/app/app/components/reports/ReportTable'

type SearchParams = {
  q?: string
  platform?: string
  profitability?: string
  period?: string
  date?: string
  year?: string
  month?: string
  quarter?: string
  startDate?: string
  endDate?: string
  start?: string
  end?: string
}

type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'

type SaleRow = {
  id: string
  sale_date?: string | null
  gross_sale?: number | string | null
  platform_fees?: number | string | null
  shipping_cost?: number | string | null
  other_costs?: number | string | null
  net_proceeds?: number | string | null
  cost_of_goods_sold?: number | string | null
  profit?: number | string | null
  platform?: string | null
  notes?: string | null
  inventory_item_id?: string | null
}

type PlatformProfitabilityRow = {
  id: string
  platform: string
  saleCount: number
  grossSales: number
  platformFees: number
  shippingCosts: number
  otherCosts: number
  totalSellingCosts: number
  netProceeds: number
  realizedCogs: number
  profit: number
  averageSale: number
  averageProfit: number
  feeRate: number | null
  profitMargin: number | null
  suggestedAction: string
}

const PERIOD_OPTIONS: Array<{ value: ReportPeriod; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom Range' },
]

const PROFITABILITY_OPTIONS = [
  { value: 'all', label: 'All platforms' },
  { value: 'profitable', label: 'Profitable platforms' },
  { value: 'loss', label: 'Loss platforms' },
  { value: 'high-fee', label: 'High fee rate' },
  { value: 'low-margin', label: 'Low margin' },
  { value: 'needs-review', label: 'Needs review' },
]

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

function asString(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0

  const numeric =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/[^0-9.-]/g, ''))

  return Number.isFinite(numeric) ? numeric : 0
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function formatCurrency(value: unknown) {
  return currencyFormatter.format(asNumber(value))
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  return percentFormatter.format(value)
}

function dateToInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseInputDate(value: string | undefined | null, fallback: Date) {
  if (!value) return fallback

  const parts = value.split('-').map((part) => Number(part))
  if (parts.length !== 3) return fallback

  const [year, month, day] = parts
  if (!year || !month || !day) return fallback

  const date = new Date(year, month - 1, day)

  if (Number.isNaN(date.getTime())) return fallback

  return date
}

function getStartOfWeek(date: Date) {
  const result = new Date(date)
  const day = result.getDay()
  const diff = day === 0 ? -6 : 1 - day

  result.setDate(result.getDate() + diff)

  return result
}

function getEndOfWeek(date: Date) {
  const result = getStartOfWeek(date)
  result.setDate(result.getDate() + 6)
  return result
}

function clampYear(raw?: string) {
  const currentYear = new Date().getFullYear()
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > currentYear + 1) {
    return currentYear
  }

  return parsed
}

function clampMonth(raw?: string) {
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) {
    return new Date().getMonth() + 1
  }

  return parsed
}

function clampQuarter(raw?: string) {
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 4) {
    return Math.floor(new Date().getMonth() / 3) + 1
  }

  return parsed
}

function normalizePeriod(raw?: string): ReportPeriod {
  if (raw === 'daily' || raw === 'day') return 'daily'
  if (raw === 'weekly' || raw === 'week') return 'weekly'
  if (raw === 'monthly' || raw === 'month') return 'monthly'
  if (raw === 'quarterly' || raw === 'quarter') return 'quarterly'
  if (raw === 'yearly' || raw === 'year') return 'yearly'
  if (raw === 'custom') return 'custom'

  return 'monthly'
}

function getDateRange({
  selectedYear,
  period,
  date,
  start,
  end,
  month,
  quarter,
}: {
  selectedYear: number
  period: ReportPeriod
  date?: string
  start?: string
  end?: string
  month: number
  quarter: number
}) {
  const today = new Date()
  const defaultAnchor =
    selectedYear === today.getFullYear() ? today : new Date(selectedYear, 0, 1)

  if (period === 'daily') {
    const selectedDay = parseInputDate(date || start, defaultAnchor)

    return {
      startDate: dateToInputValue(selectedDay),
      endDate: dateToInputValue(selectedDay),
      label: `Daily Platform Profitability ${dateToInputValue(selectedDay)}`,
    }
  }

  if (period === 'weekly') {
    const selectedDay = parseInputDate(date || start, defaultAnchor)
    const weekStart = getStartOfWeek(selectedDay)
    const weekEnd = getEndOfWeek(selectedDay)

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      label: `Weekly Platform Profitability ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    }
  }

  if (period === 'monthly') {
    const monthStart = new Date(selectedYear, month - 1, 1)
    const monthEnd = new Date(selectedYear, month, 0)

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      label: `Monthly Platform Profitability ${monthStart.toLocaleString('default', {
        month: 'long',
      })} ${selectedYear}`,
    }
  }

  if (period === 'quarterly') {
    const quarterStartMonth = (quarter - 1) * 3
    const quarterStart = new Date(selectedYear, quarterStartMonth, 1)
    const quarterEnd = new Date(selectedYear, quarterStartMonth + 3, 0)

    return {
      startDate: dateToInputValue(quarterStart),
      endDate: dateToInputValue(quarterEnd),
      label: `Quarterly Platform Profitability Q${quarter} ${selectedYear}`,
    }
  }

  if (period === 'custom') {
    const fallbackStart = new Date(selectedYear, 0, 1)
    const fallbackEnd = new Date(selectedYear, 11, 31)
    const customStart = parseInputDate(start, fallbackStart)
    const customEnd = parseInputDate(end, fallbackEnd)

    const normalizedStart =
      customStart.getTime() <= customEnd.getTime() ? customStart : customEnd
    const normalizedEnd =
      customStart.getTime() <= customEnd.getTime() ? customEnd : customStart

    return {
      startDate: dateToInputValue(normalizedStart),
      endDate: dateToInputValue(normalizedEnd),
      label: `Custom Platform Profitability ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
    }
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
    label: `Yearly Platform Profitability ${selectedYear}`,
  }
}

function platformKey(value: string | null | undefined) {
  return String(value || 'Unknown').trim() || 'Unknown'
}

function getSuggestedAction(row: PlatformProfitabilityRow) {
  if (row.saleCount === 0) return 'No sales'
  if (row.profit < 0) return 'Loss review'
  if ((row.feeRate ?? 0) >= 0.18) return 'Fee review'
  if ((row.profitMargin ?? 0) < 0.1) return 'Low margin review'
  if (row.shippingCosts + row.otherCosts > row.profit && row.profit > 0) return 'Shipping cost review'
  return 'Performing'
}

function actionBadgeClass(action: string) {
  const clean = action.toLowerCase()

  if (clean.includes('loss')) {
    return 'border-red-900 bg-red-950/40 text-red-200'
  }

  if (clean.includes('fee') || clean.includes('margin') || clean.includes('shipping')) {
    return 'border-amber-900 bg-amber-950/40 text-amber-200'
  }

  if (clean.includes('performing')) {
    return 'border-emerald-900 bg-emerald-950/40 text-emerald-200'
  }

  return 'border-zinc-700 bg-zinc-950 text-zinc-300'
}

function profitabilityClass(value: number) {
  if (value > 0) return 'text-emerald-300'
  if (value < 0) return 'text-red-300'
  return 'text-zinc-300'
}

function matchesSearch(row: PlatformProfitabilityRow, search: string) {
  if (!search) return true

  const haystack = [
    row.platform,
    row.suggestedAction,
    row.saleCount,
    row.grossSales,
    row.platformFees,
    row.shippingCosts,
    row.otherCosts,
    row.netProceeds,
    row.realizedCogs,
    row.profit,
  ]
    .join(' ')
    .toLowerCase()

  return haystack.includes(search.toLowerCase())
}

function matchesProfitability(row: PlatformProfitabilityRow, profitability: string) {
  if (!profitability || profitability === 'all') return true

  if (profitability === 'profitable') return row.profit > 0
  if (profitability === 'loss') return row.profit < 0
  if (profitability === 'high-fee') return (row.feeRate ?? 0) >= 0.18
  if (profitability === 'low-margin') return (row.profitMargin ?? 0) < 0.1
  if (profitability === 'needs-review') {
    return row.profit < 0 || (row.feeRate ?? 0) >= 0.18 || (row.profitMargin ?? 0) < 0.1
  }

  return true
}

function buildQueryString(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '') return
    searchParams.set(key, String(value))
  })

  return searchParams.toString()
}

function buildPlatformRows(sales: SaleRow[]) {
  const platformMap = new Map<string, SaleRow[]>()

  sales.forEach((sale) => {
    const platform = platformKey(sale.platform)
    const existing = platformMap.get(platform) ?? []
    existing.push(sale)
    platformMap.set(platform, existing)
  })

  return Array.from(platformMap.entries())
    .map(([platform, platformSales]): PlatformProfitabilityRow => {
      const saleCount = platformSales.length
      const grossSales = roundMoney(
        platformSales.reduce((sum, row) => sum + asNumber(row.gross_sale), 0)
      )
      const platformFees = roundMoney(
        platformSales.reduce((sum, row) => sum + asNumber(row.platform_fees), 0)
      )
      const shippingCosts = roundMoney(
        platformSales.reduce((sum, row) => sum + asNumber(row.shipping_cost), 0)
      )
      const otherCosts = roundMoney(
        platformSales.reduce((sum, row) => sum + asNumber(row.other_costs), 0)
      )
      const totalSellingCosts = roundMoney(platformFees + shippingCosts + otherCosts)
      const netProceeds = roundMoney(
        platformSales.reduce((sum, row) => sum + asNumber(row.net_proceeds), 0)
      )
      const realizedCogs = roundMoney(
        platformSales.reduce((sum, row) => sum + asNumber(row.cost_of_goods_sold), 0)
      )
      const profit = roundMoney(
        platformSales.reduce((sum, row) => sum + asNumber(row.profit), 0)
      )
      const averageSale = saleCount > 0 ? roundMoney(grossSales / saleCount) : 0
      const averageProfit = saleCount > 0 ? roundMoney(profit / saleCount) : 0
      const feeRate = grossSales > 0 ? platformFees / grossSales : null
      const profitMargin = grossSales > 0 ? profit / grossSales : null

      const row: PlatformProfitabilityRow = {
        id: platform,
        platform,
        saleCount,
        grossSales,
        platformFees,
        shippingCosts,
        otherCosts,
        totalSellingCosts,
        netProceeds,
        realizedCogs,
        profit,
        averageSale,
        averageProfit,
        feeRate,
        profitMargin,
        suggestedAction: '',
      }

      return {
        ...row,
        suggestedAction: getSuggestedAction(row),
      }
    })
    .sort((a, b) => b.profit - a.profit)
}

export default async function PlatformProfitabilityReportPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const resolvedSearchParams = (await searchParams) || {}

  const selectedPeriod = normalizePeriod(resolvedSearchParams.period)
  const selectedYear = clampYear(resolvedSearchParams.year)
  const selectedMonth = clampMonth(resolvedSearchParams.month)
  const selectedQuarter = clampQuarter(resolvedSearchParams.quarter)
  const selectedPlatform = String(resolvedSearchParams.platform || 'all').trim()
  const selectedProfitability = String(
    resolvedSearchParams.profitability || 'all'
  ).trim()
  const search = resolvedSearchParams.q?.trim() || ''
  const startOverride =
    resolvedSearchParams.startDate || resolvedSearchParams.start || ''
  const endOverride =
    resolvedSearchParams.endDate || resolvedSearchParams.end || ''

  const calculatedRange = getDateRange({
    selectedYear,
    period: selectedPeriod,
    date: resolvedSearchParams.date,
    start: startOverride,
    end: endOverride,
    month: selectedMonth,
    quarter: selectedQuarter,
  })

  const startDate = startOverride || calculatedRange.startDate
  const endDate = endOverride || calculatedRange.endDate

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="app-page">
        <section className="app-section">
          <h1 className="app-title">Platform Profitability Report</h1>
          <p className="app-subtitle">
            You must be signed in to view platform profitability reports.
          </p>
        </section>
      </main>
    )
  }

  const { data, error } = await supabase
    .from('sales')
    .select(
      `
      id,
      sale_date,
      gross_sale,
      platform_fees,
      shipping_cost,
      other_costs,
      net_proceeds,
      cost_of_goods_sold,
      profit,
      platform,
      notes,
      inventory_item_id
    `
    )
    .eq('user_id', user.id)
    .is('reversed_at', null)
    .gte('sale_date', startDate)
    .lte('sale_date', endDate)
    .order('sale_date', { ascending: false })

  const allSales = (data ?? []) as SaleRow[]
  const allPlatforms = Array.from(new Set(allSales.map((row) => platformKey(row.platform)))).sort((a, b) =>
    a.localeCompare(b)
  )

  let filteredSales = allSales

  if (selectedPlatform !== 'all') {
    filteredSales = filteredSales.filter((row) => platformKey(row.platform) === selectedPlatform)
  }

  let rows = buildPlatformRows(filteredSales)

  rows = rows.filter((row) => {
    if (!matchesSearch(row, search)) return false
    if (!matchesProfitability(row, selectedProfitability)) return false
    return true
  })

  const totalSalesCount = rows.reduce((sum, row) => sum + row.saleCount, 0)
  const totalGrossSales = roundMoney(rows.reduce((sum, row) => sum + row.grossSales, 0))
  const totalPlatformFees = roundMoney(rows.reduce((sum, row) => sum + row.platformFees, 0))
  const totalShippingCosts = roundMoney(rows.reduce((sum, row) => sum + row.shippingCosts, 0))
  const totalOtherCosts = roundMoney(rows.reduce((sum, row) => sum + row.otherCosts, 0))
  const totalSellingCosts = roundMoney(
    totalPlatformFees + totalShippingCosts + totalOtherCosts
  )
  const totalNetProceeds = roundMoney(rows.reduce((sum, row) => sum + row.netProceeds, 0))
  const totalCogs = roundMoney(rows.reduce((sum, row) => sum + row.realizedCogs, 0))
  const totalProfit = roundMoney(rows.reduce((sum, row) => sum + row.profit, 0))
  const blendedFeeRate = totalGrossSales > 0 ? totalPlatformFees / totalGrossSales : null
  const blendedMargin = totalGrossSales > 0 ? totalProfit / totalGrossSales : null
  const lossPlatformCount = rows.filter((row) => row.profit < 0).length
  const highFeePlatformCount = rows.filter((row) => (row.feeRate ?? 0) >= 0.18).length

  const queryString = buildQueryString({
    q: search,
    platform: selectedPlatform,
    profitability: selectedProfitability,
    period: selectedPeriod,
    date: resolvedSearchParams.date,
    year: selectedYear,
    month: selectedMonth,
    quarter: selectedQuarter,
    startDate,
    endDate,
  })

  return (
    <main className="app-page-wide space-y-4">
      <div className="app-page-header gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Reports
          </p>
          <h1 className="app-title">Platform Profitability Report</h1>
          <p className="app-subtitle">
            Compare platforms by gross sales, fees, shipping, COGS, profit,
            average order value, and margin.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/app/reports" className="app-button">
            Back to Reports
          </Link>

          <Link href="/app/reports/sales" className="app-button">
            Sales Reports
          </Link>

          <Link href="/app/reports/shipping" className="app-button">
            Shipping Report
          </Link>

          <Link
            href={`/api/reports/platform-profitability/print?${queryString}`}
            className="app-button"
            target="_blank"
          >
            Print Report
          </Link>

          <Link
            href={`/api/reports/platform-profitability/PDF?${queryString}`}
            className="app-button"
          >
            Platform PDF
          </Link>

          <Link
            href={`/api/reports/platform-profitability?${queryString}`}
            className="app-button"
          >
            Platform CSV
          </Link>
        </div>
      </div>

      {error ? (
        <section className="app-section border-amber-900 bg-amber-950/30">
          <h2 className="text-base font-semibold text-amber-200">
            Report warning
          </h2>
          <p className="mt-1 text-sm text-amber-200">{error.message}</p>
        </section>
      ) : null}

      <section className="app-section space-y-3">
        <form action="/app/reports/platform-profitability" className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-[1fr_240px_240px]">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Search
              </span>

              <input
                name="q"
                type="search"
                defaultValue={search}
                placeholder="Platform, fees, margin, action..."
                className="app-input h-9 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Platform
              </span>

              <select
                name="platform"
                defaultValue={selectedPlatform}
                className="app-select h-9 text-sm"
              >
                <option value="all">All platforms</option>
                {allPlatforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Profitability Filter
              </span>

              <select
                name="profitability"
                defaultValue={selectedProfitability}
                className="app-select h-9 text-sm"
              >
                {PROFITABILITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 xl:grid-cols-[160px_170px_130px_170px_150px_180px_180px_auto]">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Period
              </span>

              <select
                name="period"
                defaultValue={selectedPeriod}
                className="app-select h-9 text-sm"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Date
              </span>

              <input
                name="date"
                type="date"
                defaultValue={resolvedSearchParams.date || ''}
                className="app-input h-9 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Year
              </span>

              <input
                name="year"
                type="number"
                min="2000"
                max={new Date().getFullYear() + 1}
                defaultValue={selectedYear}
                className="app-input h-9 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Month
              </span>

              <select
                name="month"
                defaultValue={String(selectedMonth)}
                className="app-select h-9 text-sm"
              >
                {[1,2,3,4,5,6,7,8,9,10,11,12].map((monthNumber) => (
                  <option key={monthNumber} value={monthNumber}>
                    {new Date(2024, monthNumber - 1, 1).toLocaleString('default', {
                      month: 'long',
                    })}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Quarter
              </span>

              <select
                name="quarter"
                defaultValue={String(selectedQuarter)}
                className="app-select h-9 text-sm"
              >
                {[1,2,3,4].map((quarterNumber) => (
                  <option key={quarterNumber} value={quarterNumber}>
                    Q{quarterNumber}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Start
              </span>

              <input
                name="startDate"
                type="date"
                defaultValue={startDate}
                className="app-input h-9 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                End
              </span>

              <input
                name="endDate"
                type="date"
                defaultValue={endDate}
                className="app-input h-9 text-sm"
              />
            </label>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="app-button-primary h-9 whitespace-nowrap px-3 text-sm"
              >
                Search
              </button>

              <Link
                href="/app/reports/platform-profitability"
                className="app-button h-9 whitespace-nowrap px-3 text-sm"
              >
                Reset
              </Link>
            </div>
          </div>
        </form>
      </section>

      <section className="app-section space-y-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              {calculatedRange.label}
            </h2>
            <p className="text-sm text-zinc-400">
              Platform: {selectedPlatform === 'all' ? 'All platforms' : selectedPlatform}. This report is read-only and does not alter sales, COGS, inventory, or tax records.
            </p>
          </div>

          <div className="rounded-full border border-blue-900 bg-blue-950/40 px-3 py-1 text-xs font-semibold text-blue-300">
            Platform ROI Review
          </div>
        </div>
      </section>

      <ReportSummaryCards
        cards={[
          {
            label: 'Platforms',
            value: rows.length.toLocaleString(),
            note: 'Filtered platform groups',
          },
          {
            label: 'Sales',
            value: totalSalesCount.toLocaleString(),
            note: 'Filtered sales count',
          },
          {
            label: 'Gross Sales',
            value: formatCurrency(totalGrossSales),
            note: 'Total sales before costs',
          },
          {
            label: 'Platform Fees',
            value: formatCurrency(totalPlatformFees),
            note: `Blended fee: ${formatPercent(blendedFeeRate)}`,
          },
          {
            label: 'Shipping / Other',
            value: formatCurrency(totalShippingCosts + totalOtherCosts),
            note: 'Postage plus other selling costs',
          },
          {
            label: 'Selling Costs',
            value: formatCurrency(totalSellingCosts),
            note: 'Fees + shipping + other',
          },
          {
            label: 'COGS',
            value: formatCurrency(totalCogs),
            note: 'Realized cost basis',
          },
          {
            label: 'Profit',
            value: formatCurrency(totalProfit),
            note: `Margin: ${formatPercent(blendedMargin)}`,
          },
        ]}
      />

      <section className="app-section space-y-3">
        <h2 className="text-base font-semibold text-zinc-100">Platform Report Notes</h2>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
            <h3 className="text-sm font-semibold text-zinc-100">Fee impact</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Platform fees are compared against gross sales so you can quickly spot high-fee channels.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
            <h3 className="text-sm font-semibold text-zinc-100">Shipping impact</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Shipping and other selling costs are included to show which platforms may be less profitable after fulfillment.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
            <h3 className="text-sm font-semibold text-zinc-100">Tax-safe report</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              This report is read-only. It summarizes completed sales and does not change COGS or Schedule C calculations.
            </p>
          </div>
        </div>
      </section>

      <section className="app-section space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Platform Profitability Detail
            </h2>
            <p className="text-sm text-zinc-400">
              Compare each platform by sales volume, fees, shipping burden, COGS, and profit margin.
            </p>
          </div>

          <div className="text-xs text-zinc-500">
            Loss platforms: {lossPlatformCount.toLocaleString()} · High-fee platforms:{' '}
            {highFeePlatformCount.toLocaleString()}
          </div>
        </div>

        <ReportTable
          rows={rows}
          emptyMessage="No platforms matched this profitability report filter."
          columns={[
            {
              key: 'platform',
              label: 'Platform',
              render: (row) => (
                <div className="min-w-[160px]">
                  <div className="font-medium text-zinc-100">{row.platform}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {row.saleCount.toLocaleString()} sale(s)
                  </div>
                </div>
              ),
            },
            {
              key: 'gross',
              label: 'Gross',
              align: 'right',
              render: (row) => formatCurrency(row.grossSales),
            },
            {
              key: 'fees',
              label: 'Fees',
              align: 'right',
              render: (row) => formatCurrency(row.platformFees),
            },
            {
              key: 'feeRate',
              label: 'Fee %',
              align: 'right',
              render: (row) => formatPercent(row.feeRate),
            },
            {
              key: 'shipping',
              label: 'Shipping',
              align: 'right',
              render: (row) => formatCurrency(row.shippingCosts),
            },
            {
              key: 'other',
              label: 'Other',
              align: 'right',
              render: (row) => formatCurrency(row.otherCosts),
            },
            {
              key: 'net',
              label: 'Net',
              align: 'right',
              render: (row) => formatCurrency(row.netProceeds),
            },
            {
              key: 'cogs',
              label: 'COGS',
              align: 'right',
              render: (row) => formatCurrency(row.realizedCogs),
            },
            {
              key: 'profit',
              label: 'Profit',
              align: 'right',
              render: (row) => (
                <span className={profitabilityClass(row.profit)}>
                  {formatCurrency(row.profit)}
                </span>
              ),
            },
            {
              key: 'margin',
              label: 'Margin',
              align: 'right',
              render: (row) => formatPercent(row.profitMargin),
            },
            {
              key: 'avgSale',
              label: 'Avg Sale',
              align: 'right',
              render: (row) => formatCurrency(row.averageSale),
            },
            {
              key: 'avgProfit',
              label: 'Avg Profit',
              align: 'right',
              render: (row) => formatCurrency(row.averageProfit),
            },
            {
              key: 'action',
              label: 'Suggested Action',
              render: (row) => (
                <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${actionBadgeClass(row.suggestedAction)}`}>
                  {row.suggestedAction}
                </span>
              ),
            },
          ]}
        />
      </section>
    </main>
  )
}
