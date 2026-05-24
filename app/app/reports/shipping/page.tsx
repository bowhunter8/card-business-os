import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  buildReportCsvHref,
  buildReportPdfHref,
  buildReportPrintHref,
} from '@/lib/reports/report-url-utils'
import ReportDateFilters from '@/app/app/components/reports/ReportDateFilters'
import ReportExportButtons from '@/app/app/components/reports/ReportExportButtons'
import ReportSummaryCards from '@/app/app/components/reports/ReportSummaryCards'
import ReportTable from '@/app/app/components/reports/ReportTable'

type SearchParams = {
  q?: string
  platform?: string
  margin?: string
  period?: string
  date?: string
  year?: string
  month?: string
  quarter?: string
  startDate?: string
  endDate?: string
  dateFrom?: string
  dateTo?: string
}

type SaleRow = {
  id: string
  sale_date?: string | null
  platform?: string | null
  gross_sale?: number | string | null
  platform_fees?: number | string | null
  shipping_cost?: number | string | null
  other_costs?: number | string | null
  net_proceeds?: number | string | null
  cost_of_goods_sold?: number | string | null
  profit?: number | string | null
  notes?: string | null
  inventory_item_id?: string | null
  reversed_at?: string | null

  // Flexible shipping fields. These allow the report to work now and become
  // more detailed automatically if these columns are added/wired later.
  shipping_charged?: number | string | null
  shipping_income?: number | string | null
  buyer_shipping_charged?: number | string | null
  shipping_paid_by_buyer?: number | string | null
  postage_cost?: number | string | null
  actual_postage?: number | string | null
  actual_postage_cost?: number | string | null
  label_cost?: number | string | null
  supplies_cost?: number | string | null
  shipping_supplies_cost?: number | string | null
  packaging_cost?: number | string | null
  shipping_profile_name?: string | null
}

type ShippingReportRow = {
  id: string
  saleDate: string | null
  platform: string
  shippingProfile: string
  shippingCharged: number
  postageCost: number
  suppliesCost: number
  totalShippingCost: number
  shippingProfitLoss: number
  grossSale: number
  netProceeds: number
  notes: string
  warning: string
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
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

function formatCurrency(value: unknown) {
  return currencyFormatter.format(asNumber(value))
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return dateFormatter.format(date)
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0.0%'
  return `${value.toFixed(1)}%`
}

type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'

function normalizePeriod(raw?: string): ReportPeriod {
  if (raw === 'daily' || raw === 'day') return 'daily'
  if (raw === 'weekly' || raw === 'week') return 'weekly'
  if (raw === 'monthly' || raw === 'month') return 'monthly'
  if (raw === 'quarterly' || raw === 'quarter') return 'quarterly'
  if (raw === 'yearly' || raw === 'year') return 'yearly'
  if (raw === 'custom') return 'custom'
  return 'monthly'
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
  return Number.isNaN(date.getTime()) ? fallback : date
}

function getStartOfWeekSunday(date: Date) {
  const result = new Date(date)
  result.setDate(result.getDate() - result.getDay())
  return result
}

function getEndOfWeekSunday(date: Date) {
  const result = getStartOfWeekSunday(date)
  result.setDate(result.getDate() + 6)
  return result
}

function clampYear(raw?: string) {
  const currentYear = new Date().getFullYear()
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > currentYear + 1) return currentYear
  return parsed
}

function clampMonth(raw?: string) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) return new Date().getMonth() + 1
  return parsed
}

function clampQuarter(raw?: string) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 4) return Math.floor(new Date().getMonth() / 3) + 1
  return parsed
}

function resolveShippingDateRange(params: SearchParams) {
  const selectedPeriod = normalizePeriod(params.period)
  const selectedYear = clampYear(params.year)
  const selectedMonth = clampMonth(params.month)
  const selectedQuarter = clampQuarter(params.quarter)
  const today = new Date()
  const defaultAnchor = selectedYear === today.getFullYear() ? today : new Date(selectedYear, 0, 1)

  if (selectedPeriod === 'custom') {
    const fallbackStart = new Date(selectedYear, 0, 1)
    const fallbackEnd = new Date(selectedYear, 11, 31)
    const customStart = parseInputDate(params.startDate || params.dateFrom || '', fallbackStart)
    const customEnd = parseInputDate(params.endDate || params.dateTo || '', fallbackEnd)
    const normalizedStart = customStart.getTime() <= customEnd.getTime() ? customStart : customEnd
    const normalizedEnd = customStart.getTime() <= customEnd.getTime() ? customEnd : customStart
    return {
      period: selectedPeriod,
      date: dateToInputValue(normalizedStart),
      year: String(selectedYear),
      month: String(selectedMonth),
      quarter: String(selectedQuarter),
      startDate: dateToInputValue(normalizedStart),
      endDate: dateToInputValue(normalizedEnd),
    }
  }

  if (selectedPeriod === 'daily') {
    const selectedDay = parseInputDate(params.date, defaultAnchor)
    return {
      period: selectedPeriod,
      date: dateToInputValue(selectedDay),
      year: String(selectedDay.getFullYear()),
      month: String(selectedDay.getMonth() + 1),
      quarter: String(Math.floor(selectedDay.getMonth() / 3) + 1),
      startDate: dateToInputValue(selectedDay),
      endDate: dateToInputValue(selectedDay),
    }
  }

  if (selectedPeriod === 'weekly') {
    const selectedDay = parseInputDate(params.date, defaultAnchor)
    const weekStart = getStartOfWeekSunday(selectedDay)
    const weekEnd = getEndOfWeekSunday(selectedDay)
    return {
      period: selectedPeriod,
      date: dateToInputValue(weekStart),
      year: String(weekStart.getFullYear()),
      month: String(weekStart.getMonth() + 1),
      quarter: String(Math.floor(weekStart.getMonth() / 3) + 1),
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
    }
  }

  if (selectedPeriod === 'quarterly') {
    const quarterStartMonth = (selectedQuarter - 1) * 3
    const quarterStart = new Date(selectedYear, quarterStartMonth, 1)
    const quarterEnd = new Date(selectedYear, quarterStartMonth + 3, 0)
    return {
      period: selectedPeriod,
      date: dateToInputValue(quarterStart),
      year: String(selectedYear),
      month: String(quarterStartMonth + 1),
      quarter: String(selectedQuarter),
      startDate: dateToInputValue(quarterStart),
      endDate: dateToInputValue(quarterEnd),
    }
  }

  if (selectedPeriod === 'yearly') {
    return {
      period: selectedPeriod,
      date: `${selectedYear}-01-01`,
      year: String(selectedYear),
      month: String(new Date().getMonth() + 1),
      quarter: String(Math.floor(new Date().getMonth() / 3) + 1),
      startDate: `${selectedYear}-01-01`,
      endDate: `${selectedYear}-12-31`,
    }
  }

  const monthStart = new Date(selectedYear, selectedMonth - 1, 1)
  const monthEnd = new Date(selectedYear, selectedMonth, 0)
  return {
    period: 'monthly' as ReportPeriod,
    date: dateToInputValue(monthStart),
    year: String(selectedYear),
    month: String(selectedMonth),
    quarter: String(Math.floor((selectedMonth - 1) / 3) + 1),
    startDate: dateToInputValue(monthStart),
    endDate: dateToInputValue(monthEnd),
  }
}

function platformKey(value: string | null | undefined) {
  return String(value || 'Unknown').trim() || 'Unknown'
}

function getFirstNumber(row: SaleRow, keys: (keyof SaleRow)[]) {
  for (const key of keys) {
    const value = asNumber(row[key])

    if (value !== 0) {
      return value
    }
  }

  return 0
}

function getShippingCharged(row: SaleRow) {
  return getFirstNumber(row, [
    'shipping_charged',
    'shipping_income',
    'buyer_shipping_charged',
    'shipping_paid_by_buyer',
  ])
}

function getPostageCost(row: SaleRow) {
  return getFirstNumber(row, [
    'actual_postage',
    'actual_postage_cost',
    'postage_cost',
    'label_cost',
    'shipping_cost',
  ])
}

function getSuppliesCost(row: SaleRow) {
  return getFirstNumber(row, [
    'supplies_cost',
    'shipping_supplies_cost',
    'packaging_cost',
  ])
}

function getShippingProfile(row: SaleRow) {
  return String(row.shipping_profile_name || '').trim() || 'Not assigned'
}

function getShippingWarning(row: ShippingReportRow) {
  if (row.shippingCharged <= 0 && row.totalShippingCost > 0) {
    return 'No shipping charged'
  }

  if (row.shippingProfitLoss < 0) {
    return 'Undercharged'
  }

  if (row.postageCost <= 0 && row.shippingCharged > 0) {
    return 'Missing actual postage'
  }

  if (row.suppliesCost <= 0) {
    return 'No supplies cost'
  }

  return 'OK'
}

function buildShippingRows(sales: SaleRow[]) {
  return sales.map((sale) => {
    const shippingCharged = getShippingCharged(sale)
    const postageCost = getPostageCost(sale)
    const suppliesCost = getSuppliesCost(sale)
    const totalShippingCost = postageCost + suppliesCost
    const baseRow = {
      id: sale.id,
      saleDate: sale.sale_date || null,
      platform: platformKey(sale.platform),
      shippingProfile: getShippingProfile(sale),
      shippingCharged,
      postageCost,
      suppliesCost,
      totalShippingCost,
      shippingProfitLoss: shippingCharged - totalShippingCost,
      grossSale: asNumber(sale.gross_sale),
      netProceeds: asNumber(sale.net_proceeds),
      notes: sale.notes || '',
      warning: '',
    }

    return {
      ...baseRow,
      warning: getShippingWarning(baseRow),
    }
  })
}

function matchesSearch(row: ShippingReportRow, search: string) {
  if (!search) return true

  const haystack = [
    row.saleDate,
    row.platform,
    row.shippingProfile,
    row.shippingCharged,
    row.postageCost,
    row.suppliesCost,
    row.totalShippingCost,
    row.shippingProfitLoss,
    row.notes,
    row.warning,
  ]
    .map(asString)
    .join(' ')
    .toLowerCase()

  return haystack.includes(search.toLowerCase())
}

function matchesPlatform(row: ShippingReportRow, platform: string) {
  if (!platform || platform === 'all') return true
  return row.platform === platform
}

function matchesMarginFilter(row: ShippingReportRow, margin: string) {
  if (!margin || margin === 'all') return true

  if (margin === 'undercharged') return row.shippingProfitLoss < 0
  if (margin === 'profitable') return row.shippingProfitLoss > 0
  if (margin === 'break-even') return row.shippingProfitLoss === 0
  if (margin === 'missing-charged') return row.shippingCharged <= 0 && row.totalShippingCost > 0
  if (margin === 'missing-postage') return row.postageCost <= 0 && row.shippingCharged > 0
  if (margin === 'missing-supplies') return row.suppliesCost <= 0

  return true
}

function buildShippingCsvHref(params: SearchParams) {
  return buildReportCsvHref('shipping', {
    q: params.q,
    platform: params.platform,
    margin: params.margin,
    period: params.period,
    date: params.date,
    year: params.year,
    month: params.month,
    quarter: params.quarter,
    startDate: params.startDate || params.dateFrom,
    endDate: params.endDate || params.dateTo,
    dateFrom: params.dateFrom || params.startDate,
    dateTo: params.dateTo || params.endDate,
  })
}

function buildSalesHref(row: ShippingReportRow) {
  return `/app/sales${row.id ? `?q=${encodeURIComponent(row.id)}` : ''}`
}

function warningBadgeClass(warning: string) {
  if (warning === 'OK') {
    return 'inline-flex items-center rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-200'
  }

  if (warning === 'Undercharged' || warning === 'No shipping charged') {
    return 'inline-flex items-center rounded-full border border-red-800 bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-200'
  }

  return 'inline-flex items-center rounded-full border border-amber-800 bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-200'
}

export default async function ShippingReportPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const resolvedSearchParams = (await searchParams) || {}

  const search = resolvedSearchParams.q?.trim() || ''
  const selectedPlatform = resolvedSearchParams.platform || 'all'
  const selectedMargin = resolvedSearchParams.margin || 'all'
  const resolvedDateRange = resolveShippingDateRange(resolvedSearchParams)
  const startDate = resolvedDateRange.startDate
  const endDate = resolvedDateRange.endDate

  const csvHref = buildShippingCsvHref({
    ...resolvedSearchParams,
    q: search,
    platform: selectedPlatform,
    margin: selectedMargin,
    period: resolvedDateRange.period,
    date:
      resolvedDateRange.period === 'daily' || resolvedDateRange.period === 'weekly'
        ? resolvedDateRange.date
        : undefined,
    year: resolvedDateRange.year,
    month: resolvedDateRange.period === 'monthly' ? resolvedDateRange.month : undefined,
    quarter: resolvedDateRange.period === 'quarterly' ? resolvedDateRange.quarter : undefined,
    startDate: resolvedDateRange.period === 'custom' ? startDate : undefined,
    endDate: resolvedDateRange.period === 'custom' ? endDate : undefined,
  })

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  let salesQuery = supabase
    .from('sales')
    .select('*')
    .eq('user_id', user.id)
    .is('reversed_at', null)
    .order('sale_date', { ascending: false })

  if (startDate) {
    salesQuery = salesQuery.gte('sale_date', startDate)
  }

  if (endDate) {
    salesQuery = salesQuery.lte('sale_date', endDate)
  }

  const { data: salesRaw, error } = await salesQuery

  const allShippingRows = buildShippingRows((salesRaw || []) as SaleRow[])
  const shippingRows = allShippingRows.filter((row) => {
    if (!matchesSearch(row, search)) return false
    if (!matchesPlatform(row, selectedPlatform)) return false
    if (!matchesMarginFilter(row, selectedMargin)) return false

    return true
  })

  const platforms = Array.from(
    new Set(allShippingRows.map((row) => row.platform).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b))

  const shipmentCount = shippingRows.length
  const totalShippingCharged = shippingRows.reduce((sum, row) => sum + row.shippingCharged, 0)
  const totalPostageCost = shippingRows.reduce((sum, row) => sum + row.postageCost, 0)
  const totalSuppliesCost = shippingRows.reduce((sum, row) => sum + row.suppliesCost, 0)
  const totalShippingCost = shippingRows.reduce((sum, row) => sum + row.totalShippingCost, 0)
  const totalShippingProfitLoss = shippingRows.reduce((sum, row) => sum + row.shippingProfitLoss, 0)
  const underchargedCount = shippingRows.filter((row) => row.shippingProfitLoss < 0).length
  const missingChargedCount = shippingRows.filter((row) => row.shippingCharged <= 0 && row.totalShippingCost > 0).length
  const missingPostageCount = shippingRows.filter((row) => row.postageCost <= 0 && row.shippingCharged > 0).length
  const missingSuppliesCount = shippingRows.filter((row) => row.suppliesCost <= 0).length
  const averageMargin = shipmentCount > 0 ? totalShippingProfitLoss / shipmentCount : 0
  const shippingCostRatio =
    totalShippingCharged > 0 ? (totalShippingCost / totalShippingCharged) * 100 : 0

  const platformSummary = Array.from(
    shippingRows.reduce((map, row) => {
      const current = map.get(row.platform) ?? {
        count: 0,
        charged: 0,
        postage: 0,
        supplies: 0,
        totalCost: 0,
        profitLoss: 0,
      }

      map.set(row.platform, {
        count: current.count + 1,
        charged: current.charged + row.shippingCharged,
        postage: current.postage + row.postageCost,
        supplies: current.supplies + row.suppliesCost,
        totalCost: current.totalCost + row.totalShippingCost,
        profitLoss: current.profitLoss + row.shippingProfitLoss,
      })

      return map
    }, new Map<string, { count: number; charged: number; postage: number; supplies: number; totalCost: number; profitLoss: number }>())
  )
    .map(([platform, values]) => ({
      platform,
      ...values,
    }))
    .sort((a, b) => b.profitLoss - a.profitLoss)

  return (
    <main className="app-page space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Reports</p>
          <h1 className="app-title">Shipping Profitability Report</h1>
          <p className="app-subtitle">
            Read-only shipping analysis for shipping charged, actual postage, supplies cost, undercharged shipments, and platform comparison.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/reports" className="app-button">
            Back to Reports
          </Link>

          <Link href="/app/reports/operations" className="app-button">
            Back to Daily Operations
          </Link>

          <ReportExportButtons
            csvHref={csvHref}
            pdfHref={buildReportPdfHref('shipping', {
              ...(search ? { q: search } : {}),
              ...(selectedPlatform !== 'all' ? { platform: selectedPlatform } : {}),
              ...(selectedMargin !== 'all' ? { margin: selectedMargin } : {}),
              period: resolvedDateRange.period,
              year: resolvedDateRange.year,
              ...(resolvedDateRange.period === 'daily' || resolvedDateRange.period === 'weekly'
                ? { date: resolvedDateRange.date }
                : {}),
              ...(resolvedDateRange.period === 'monthly'
                ? { month: resolvedDateRange.month }
                : {}),
              ...(resolvedDateRange.period === 'quarterly'
                ? { quarter: resolvedDateRange.quarter }
                : {}),
              ...(resolvedDateRange.period === 'custom'
                ? { startDate, endDate }
                : {}),
            })}
            printHref={buildReportPrintHref('shipping', {
              ...(search ? { q: search } : {}),
              ...(selectedPlatform !== 'all' ? { platform: selectedPlatform } : {}),
              ...(selectedMargin !== 'all' ? { margin: selectedMargin } : {}),
              period: resolvedDateRange.period,
              year: resolvedDateRange.year,
              ...(resolvedDateRange.period === 'daily' || resolvedDateRange.period === 'weekly'
                ? { date: resolvedDateRange.date }
                : {}),
              ...(resolvedDateRange.period === 'monthly'
                ? { month: resolvedDateRange.month }
                : {}),
              ...(resolvedDateRange.period === 'quarterly'
                ? { quarter: resolvedDateRange.quarter }
                : {}),
              ...(resolvedDateRange.period === 'custom'
                ? { startDate, endDate }
                : {}),
            })}
          />
        </div>
      </div>

      {error ? (
        <section className="app-section border-red-900 bg-red-950/30">
          <h2 className="text-lg font-semibold text-red-100">Shipping report could not load</h2>
          <p className="mt-1 text-sm text-red-200">
            Supabase returned an error while loading sales: {error.message}
          </p>
        </section>
      ) : null}

      <form action="/app/reports/shipping" method="get" className="space-y-3">
        <ReportDateFilters
          period={resolvedDateRange.period}
          date={
            resolvedDateRange.period === 'daily' || resolvedDateRange.period === 'weekly'
              ? resolvedDateRange.date
              : ''
          }
          year={resolvedDateRange.year}
          month={resolvedDateRange.month}
          quarter={resolvedDateRange.quarter}
          startDate={resolvedDateRange.period === 'custom' ? startDate : ''}
          endDate={resolvedDateRange.period === 'custom' ? endDate : ''}
          resetHref="/app/reports/shipping"
        >
          <>
            <label className="block xl:col-span-2">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Search
              </span>

              <input
                name="q"
                type="search"
                defaultValue={search}
                placeholder="Platform, shipping profile, notes, warning..."
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

                {platforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Shipping Status
              </span>

              <select
                name="margin"
                defaultValue={selectedMargin}
                className="app-select h-9 text-sm"
              >
                <option value="all">All shipping results</option>
                <option value="undercharged">Undercharged only</option>
                <option value="profitable">Profitable only</option>
                <option value="break-even">Break-even only</option>
                <option value="missing-charged">No shipping charged</option>
                <option value="missing-postage">Missing actual postage</option>
                <option value="missing-supplies">Missing supplies cost</option>
              </select>
            </label>
          </>
        </ReportDateFilters>
      </form>

      <ReportSummaryCards
        cards={[
          {
            label: 'Shipments',
            value: shipmentCount.toLocaleString(),
            note: 'Sales in filtered view',
          },
          {
            label: 'Shipping Charged',
            value: formatCurrency(totalShippingCharged),
            note: 'Amount charged to buyers',
          },
          {
            label: 'Actual Postage',
            value: formatCurrency(totalPostageCost),
            note: 'Postage / label cost',
          },
          {
            label: 'Supplies Cost',
            value: formatCurrency(totalSuppliesCost),
            note: 'Packaging supplies',
          },
          {
            label: 'Total Ship Cost',
            value: formatCurrency(totalShippingCost),
            note: 'Postage + supplies',
          },
          {
            label: 'Shipping P/L',
            value: formatCurrency(totalShippingProfitLoss),
            note: 'Charged minus cost',
          },
          {
            label: 'Avg Margin',
            value: formatCurrency(averageMargin),
            note: 'Per shipment',
          },
          {
            label: 'Cost Ratio',
            value: formatPercent(shippingCostRatio),
            note: 'Cost as % of charged',
          },
          {
            label: 'Undercharged',
            value: underchargedCount.toLocaleString(),
            note: 'Shipping loss rows',
          },
          {
            label: 'No Charge',
            value: missingChargedCount.toLocaleString(),
            note: 'Cost exists, no charge',
          },
          {
            label: 'Missing Postage',
            value: missingPostageCount.toLocaleString(),
            note: 'Needs actual postage',
          },
          {
            label: 'Missing Supplies',
            value: missingSuppliesCount.toLocaleString(),
            note: 'Needs supplies cost',
          },
        ]}
      />

      <section className="app-section space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Platform Shipping Summary</h2>
            <p className="text-sm text-zinc-400">
              Compare shipping margin across marketplaces and sales channels.
            </p>
          </div>
        </div>

        <ReportTable
          rows={platformSummary}
          emptyMessage="No platform shipping summary rows matched those filters."
          columns={[
            {
              key: 'platform',
              label: 'Platform',
              render: (row) => (
                <div className="font-medium text-zinc-100">{row.platform}</div>
              ),
            },
            {
              key: 'count',
              label: 'Shipments',
              align: 'right',
              render: (row) => row.count.toLocaleString(),
            },
            {
              key: 'charged',
              label: 'Charged',
              align: 'right',
              render: (row) => formatCurrency(row.charged),
            },
            {
              key: 'postage',
              label: 'Postage',
              align: 'right',
              render: (row) => formatCurrency(row.postage),
            },
            {
              key: 'supplies',
              label: 'Supplies',
              align: 'right',
              render: (row) => formatCurrency(row.supplies),
            },
            {
              key: 'cost',
              label: 'Total Cost',
              align: 'right',
              render: (row) => formatCurrency(row.totalCost),
            },
            {
              key: 'profitLoss',
              label: 'Shipping P/L',
              align: 'right',
              render: (row) => formatCurrency(row.profitLoss),
            },
          ]}
        />
      </section>

      <section className="app-section space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Shipment Detail</h2>
            <p className="text-sm text-zinc-400">
              Report-only table. Open the sale record to adjust shipping charged, actual postage, or supplies cost.
            </p>
          </div>

          <Link href="/app/sales" className="app-button">
            Open Sales
          </Link>
        </div>

        <ReportTable
          rows={shippingRows}
          rowHref={(row) => buildSalesHref(row)}
          emptyMessage="No shipping rows matched those filters."
          columns={[
            {
              key: 'date',
              label: 'Sale Date',
              render: (row) => formatDate(row.saleDate),
            },
            {
              key: 'platform',
              label: 'Platform',
              render: (row) => (
                <div>
                  <div className="font-medium text-zinc-100">{row.platform}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {row.shippingProfile}
                  </div>
                </div>
              ),
            },
            {
              key: 'charged',
              label: 'Charged',
              align: 'right',
              render: (row) => formatCurrency(row.shippingCharged),
            },
            {
              key: 'postage',
              label: 'Postage',
              align: 'right',
              render: (row) => formatCurrency(row.postageCost),
            },
            {
              key: 'supplies',
              label: 'Supplies',
              align: 'right',
              render: (row) => formatCurrency(row.suppliesCost),
            },
            {
              key: 'totalCost',
              label: 'Total Cost',
              align: 'right',
              render: (row) => formatCurrency(row.totalShippingCost),
            },
            {
              key: 'profitLoss',
              label: 'Shipping P/L',
              align: 'right',
              render: (row) => formatCurrency(row.shippingProfitLoss),
            },
            {
              key: 'warning',
              label: 'Status',
              render: (row) => (
                <span className={warningBadgeClass(row.warning)}>
                  {row.warning}
                </span>
              ),
            },
            {
              key: 'notes',
              label: 'Notes',
              className: 'max-w-[260px]',
              render: (row) => (
                <div>
                  <div className="line-clamp-2 text-zinc-300">{row.notes || '—'}</div>
                  <div className="mt-1 text-xs text-blue-300">
                    Open sale
                  </div>
                </div>
              ),
            },
          ]}
        />
      </section>
    </main>
  )
}
