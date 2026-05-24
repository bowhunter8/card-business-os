import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  buildReportCsvHref,
  buildReportPdfHref,
  buildReportPrintHref,
} from '@/lib/reports/report-url-utils'

import ReportExportButtons from '@/app/app/components/reports/ReportExportButtons'
import ReportDateFilters from '@/app/app/components/reports/ReportDateFilters'
import ReportSummaryCards from '@/app/app/components/reports/ReportSummaryCards'
import ReportTable from '@/app/app/components/reports/ReportTable'

type SearchParams = {
  q?: string
  source?: string
  status?: string
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

type BreakRow = {
  id: string
  break_date?: string | null
  source_name?: string | null
  seller_name?: string | null
  breaker_name?: string | null
  product_name?: string | null
  order_number?: string | null
  total_cost?: number | string | null
  notes?: string | null
  status?: string | null
  created_at?: string | null
}

type InventoryItemRow = {
  id: string
  break_id?: string | null
  source_break_id?: string | null
  order_id?: string | null
  title?: string | null
  item_name?: string | null
  player_name?: string | null
  year?: string | number | null
  set_name?: string | null
  card_number?: string | null
  item_number?: string | null
  status?: string | null
  quantity?: number | string | null
  available_quantity?: number | string | null
  unit_cost?: number | string | null
  total_cost?: number | string | null
  cost_basis_unit?: number | string | null
  cost_basis_total?: number | string | null
  allocated_cost?: number | string | null
  purchase_price?: number | string | null
  cost?: number | string | null
  current_value?: number | string | null
  estimated_value?: number | string | null
  estimated_value_total?: number | string | null
  sale_price?: number | string | null
  sold_price?: number | string | null
  notes?: string | null
  created_at?: string | null
}

type SaleRow = {
  id: string
  sale_date?: string | null
  inventory_item_id?: string | null
  gross_sale?: number | string | null
  platform_fees?: number | string | null
  shipping_cost?: number | string | null
  other_costs?: number | string | null
  net_proceeds?: number | string | null
  cost_of_goods_sold?: number | string | null
  profit?: number | string | null
  platform?: string | null
  notes?: string | null
}

type BreakProfitabilityRow = {
  id: string
  breakDate: string
  source: string
  product: string
  orderNumber: string
  status: string
  notes: string
  breakCost: number
  itemCount: number
  soldItemCount: number
  remainingItemCount: number
  grossSales: number
  netProceeds: number
  realizedCogs: number
  realizedProfit: number
  remainingCostBasis: number
  remainingEstimatedValue: number
  projectedTotalValue: number
  projectedProfitLoss: number
  roiPercent: number | null
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

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: 'Open / active' },
  { value: 'profitable', label: 'Profitable' },
  { value: 'loss', label: 'Loss / below cost' },
  { value: 'unsold', label: 'No sales yet' },
  { value: 'partial', label: 'Partially sold' },
  { value: 'complete', label: 'Fully sold / no remaining inventory' },
]

const PROFITABILITY_OPTIONS = [
  { value: 'all', label: 'All profitability' },
  { value: 'green', label: 'Projected profitable' },
  { value: 'red', label: 'Projected loss' },
  { value: 'unrealized', label: 'Still mostly unrealized' },
  { value: 'needs-review', label: 'Needs review' },
]

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
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

function formatDate(value: string | null | undefined) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return dateFormatter.format(date)
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
  result.setDate(result.getDate() - result.getDay())

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
      label: `Daily Break Profitability ${dateToInputValue(selectedDay)}`,
    }
  }

  if (period === 'weekly') {
    const selectedDay = parseInputDate(date || start, defaultAnchor)
    const weekStart = getStartOfWeek(selectedDay)
    const weekEnd = getEndOfWeek(selectedDay)

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      label: `Weekly Break Profitability ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    }
  }

  if (period === 'monthly') {
    const monthStart = new Date(selectedYear, month - 1, 1)
    const monthEnd = new Date(selectedYear, month, 0)

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      label: `Monthly Break Profitability ${monthStart.toLocaleString('default', {
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
      label: `Quarterly Break Profitability Q${quarter} ${selectedYear}`,
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
      label: `Custom Break Profitability ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
    }
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
    label: `Yearly Break Profitability ${selectedYear}`,
  }
}

function getBreakDate(row: BreakRow) {
  return row.break_date || row.created_at || null
}

function getBreakSource(row: BreakRow) {
  return row.source_name || row.seller_name || row.breaker_name || 'Unknown source'
}

function getBreakProduct(row: BreakRow) {
  return row.product_name || row.order_number || 'Untitled break'
}

function getInventoryBreakId(row: InventoryItemRow) {
  return row.break_id || row.source_break_id || row.order_id || ''
}

function getItemCost(row: InventoryItemRow) {
  const quantity = asNumber(row.quantity ?? row.available_quantity ?? 1)
  const costBasisTotal = asNumber(row.cost_basis_total)
  const totalCost = asNumber(row.total_cost)
  const allocatedCost = asNumber(row.allocated_cost)
  const costBasisUnit = asNumber(row.cost_basis_unit)
  const unitCost = asNumber(row.unit_cost)
  const purchasePrice = asNumber(row.purchase_price)
  const legacyCost = asNumber(row.cost)

  if (costBasisTotal > 0) return costBasisTotal
  if (totalCost > 0) return totalCost
  if (allocatedCost > 0) return allocatedCost
  if (costBasisUnit > 0) return costBasisUnit * Math.max(quantity, 1)
  if (unitCost > 0) return unitCost * Math.max(quantity, 1)
  if (purchasePrice > 0) return purchasePrice
  if (legacyCost > 0) return legacyCost

  return 0
}

function getItemValue(row: InventoryItemRow) {
  const estimatedValueTotal = asNumber(row.estimated_value_total)
  const currentValue = asNumber(row.current_value)
  const estimatedValue = asNumber(row.estimated_value)
  const salePrice = asNumber(row.sale_price)
  const soldPrice = asNumber(row.sold_price)

  if (estimatedValueTotal > 0) return estimatedValueTotal
  if (currentValue > 0) return currentValue
  if (estimatedValue > 0) return estimatedValue
  if (salePrice > 0) return salePrice
  if (soldPrice > 0) return soldPrice

  return 0
}

function getItemRemainingQuantity(row: InventoryItemRow) {
  const availableQuantity = asNumber(row.available_quantity)
  const quantity = asNumber(row.quantity)

  if (availableQuantity > 0) return availableQuantity
  if (quantity > 0 && String(row.status || '').toLowerCase() !== 'sold') return quantity

  return 0
}

function getSuggestedAction(row: BreakProfitabilityRow) {
  if (row.itemCount === 0) return 'No inventory linked'
  if (row.soldItemCount === 0 && row.remainingItemCount > 0) return 'No sales yet'
  if (row.projectedProfitLoss < 0 && row.remainingItemCount > 0) return 'Reprice / sell remaining'
  if (row.projectedProfitLoss < 0) return 'Loss review'
  if (row.remainingItemCount > 0 && row.realizedProfit > 0) return 'Profit locked / review remaining'
  if (row.remainingItemCount > 0) return 'Monitor remaining inventory'
  return 'Completed break review'
}

function actionBadgeClass(action: string) {
  const clean = action.toLowerCase()

  if (clean.includes('loss') || clean.includes('reprice')) {
    return 'border-red-900 bg-red-950/40 text-red-200'
  }

  if (clean.includes('no sales') || clean.includes('no inventory')) {
    return 'border-amber-900 bg-amber-950/40 text-amber-200'
  }

  if (clean.includes('profit')) {
    return 'border-emerald-900 bg-emerald-950/40 text-emerald-200'
  }

  return 'border-zinc-700 bg-zinc-950 text-zinc-300'
}

function profitabilityBadgeClass(value: number) {
  if (value > 0) return 'text-emerald-300'
  if (value < 0) return 'text-red-300'
  return 'text-zinc-300'
}

function matchesSearch(row: BreakProfitabilityRow, search: string) {
  if (!search) return true

  const haystack = [
    row.breakDate,
    row.source,
    row.product,
    row.orderNumber,
    row.status,
    row.notes,
    row.suggestedAction,
  ]
    .join(' ')
    .toLowerCase()

  return haystack.includes(search.toLowerCase())
}

function matchesStatus(row: BreakProfitabilityRow, status: string) {
  if (!status || status === 'all') return true

  if (status === 'open') return row.remainingItemCount > 0
  if (status === 'profitable') return row.projectedProfitLoss > 0
  if (status === 'loss') return row.projectedProfitLoss < 0
  if (status === 'unsold') return row.soldItemCount === 0
  if (status === 'partial') return row.soldItemCount > 0 && row.remainingItemCount > 0
  if (status === 'complete') return row.remainingItemCount <= 0 && row.itemCount > 0

  return row.status.toLowerCase() === status.toLowerCase()
}

function matchesProfitability(row: BreakProfitabilityRow, profitability: string) {
  if (!profitability || profitability === 'all') return true

  if (profitability === 'green') return row.projectedProfitLoss > 0
  if (profitability === 'red') return row.projectedProfitLoss < 0
  if (profitability === 'unrealized') return row.remainingItemCount > row.soldItemCount
  if (profitability === 'needs-review') {
    return row.itemCount === 0 || row.projectedProfitLoss < 0 || row.soldItemCount === 0
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

function buildBreakRows({
  breaks,
  inventoryItems,
  sales,
}: {
  breaks: BreakRow[]
  inventoryItems: InventoryItemRow[]
  sales: SaleRow[]
}) {
  const inventoryByBreakId = new Map<string, InventoryItemRow[]>()

  inventoryItems.forEach((item) => {
    const breakId = getInventoryBreakId(item)
    if (!breakId) return

    const existing = inventoryByBreakId.get(breakId) ?? []
    existing.push(item)
    inventoryByBreakId.set(breakId, existing)
  })

  const salesByInventoryId = new Map<string, SaleRow[]>()

  sales.forEach((sale) => {
    const inventoryId = sale.inventory_item_id
    if (!inventoryId) return

    const existing = salesByInventoryId.get(inventoryId) ?? []
    existing.push(sale)
    salesByInventoryId.set(inventoryId, existing)
  })

  return breaks.map((breakRow): BreakProfitabilityRow => {
    const linkedItems = inventoryByBreakId.get(breakRow.id) ?? []
    const linkedSales = linkedItems.flatMap((item) => salesByInventoryId.get(item.id) ?? [])

    const breakCost = asNumber(breakRow.total_cost)
    const grossSales = roundMoney(
      linkedSales.reduce((sum, sale) => sum + asNumber(sale.gross_sale), 0)
    )
    const netProceeds = roundMoney(
      linkedSales.reduce((sum, sale) => sum + asNumber(sale.net_proceeds), 0)
    )
    const realizedCogs = roundMoney(
      linkedSales.reduce((sum, sale) => sum + asNumber(sale.cost_of_goods_sold), 0)
    )
    const realizedProfit = roundMoney(
      linkedSales.reduce((sum, sale) => sum + asNumber(sale.profit), 0)
    )

    const soldItemIds = new Set(
      linkedSales
        .map((sale) => sale.inventory_item_id)
        .filter((id): id is string => Boolean(id))
    )

    const remainingItems = linkedItems.filter((item) => {
      const status = String(item.status || '').toLowerCase()
      return status !== 'sold' && status !== 'disposed' && getItemRemainingQuantity(item) > 0
    })

    const remainingCostBasis = roundMoney(
      remainingItems.reduce((sum, item) => sum + getItemCost(item), 0)
    )
    const remainingEstimatedValue = roundMoney(
      remainingItems.reduce((sum, item) => sum + getItemValue(item), 0)
    )
    const projectedTotalValue = roundMoney(netProceeds + remainingEstimatedValue)
    const projectedProfitLoss = roundMoney(projectedTotalValue - breakCost)
    const roiPercent = breakCost > 0 ? projectedProfitLoss / breakCost : null

    const initialRow: BreakProfitabilityRow = {
      id: breakRow.id,
      breakDate: getBreakDate(breakRow) || '',
      source: getBreakSource(breakRow),
      product: getBreakProduct(breakRow),
      orderNumber: breakRow.order_number || '',
      status: breakRow.status || 'open',
      notes: breakRow.notes || '',
      breakCost,
      itemCount: linkedItems.length,
      soldItemCount: soldItemIds.size,
      remainingItemCount: remainingItems.length,
      grossSales,
      netProceeds,
      realizedCogs,
      realizedProfit,
      remainingCostBasis,
      remainingEstimatedValue,
      projectedTotalValue,
      projectedProfitLoss,
      roiPercent,
      suggestedAction: '',
    }

    return {
      ...initialRow,
      suggestedAction: getSuggestedAction(initialRow),
    }
  })
}

export default async function BreakProfitabilityReportPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const resolvedSearchParams = (await searchParams) || {}

  const selectedPeriod = normalizePeriod(resolvedSearchParams.period)
  const selectedYear = clampYear(resolvedSearchParams.year)
  const selectedMonth = clampMonth(resolvedSearchParams.month)
  const selectedQuarter = clampQuarter(resolvedSearchParams.quarter)
  const selectedSource = String(resolvedSearchParams.source || 'all').trim()
  const selectedStatus = String(resolvedSearchParams.status || 'all').trim()
  const selectedProfitability = String(
    resolvedSearchParams.profitability || 'all'
  ).trim()
  const search = resolvedSearchParams.q?.trim() || ''
  const rawStartOverride =
    resolvedSearchParams.startDate || resolvedSearchParams.start || ''
  const rawEndOverride =
    resolvedSearchParams.endDate || resolvedSearchParams.end || ''
  const startOverride = selectedPeriod === 'custom' ? rawStartOverride : ''
  const endOverride = selectedPeriod === 'custom' ? rawEndOverride : ''

  const calculatedRange = getDateRange({
    selectedYear,
    period: selectedPeriod,
    date: resolvedSearchParams.date,
    start: startOverride,
    end: endOverride,
    month: selectedMonth,
    quarter: selectedQuarter,
  })

  const startDate = calculatedRange.startDate
  const endDate = calculatedRange.endDate

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="app-page">
        <section className="app-section">
          <h1 className="app-title">Break Profitability Report</h1>
          <p className="app-subtitle">
            You must be signed in to view break profitability reports.
          </p>
        </section>
      </main>
    )
  }

  const [breaksRes, inventoryRes, salesRes] = await Promise.all([
    supabase
      .from('breaks')
      .select('*')
      .eq('user_id', user.id)
      .gte('break_date', startDate)
      .lte('break_date', endDate)
      .order('break_date', { ascending: false }),

    supabase
      .from('inventory_items')
      .select('*')
      .eq('user_id', user.id),

    supabase
      .from('sales')
      .select('*')
      .eq('user_id', user.id)
      .is('reversed_at', null),
  ])

  const breaks = (breaksRes.data ?? []) as BreakRow[]
  const inventoryItems = (inventoryRes.data ?? []) as InventoryItemRow[]
  const sales = (salesRes.data ?? []) as SaleRow[]

  const allSources = Array.from(new Set(breaks.map(getBreakSource))).sort((a, b) =>
    a.localeCompare(b)
  )

  let rows = buildBreakRows({ breaks, inventoryItems, sales })

  rows = rows.filter((row) => {
    if (selectedSource !== 'all' && row.source !== selectedSource) return false
    if (!matchesSearch(row, search)) return false
    if (!matchesStatus(row, selectedStatus)) return false
    if (!matchesProfitability(row, selectedProfitability)) return false

    return true
  })

  const totalBreakCost = roundMoney(rows.reduce((sum, row) => sum + row.breakCost, 0))
  const totalNetProceeds = roundMoney(rows.reduce((sum, row) => sum + row.netProceeds, 0))
  const totalRealizedProfit = roundMoney(
    rows.reduce((sum, row) => sum + row.realizedProfit, 0)
  )
  const totalRemainingBasis = roundMoney(
    rows.reduce((sum, row) => sum + row.remainingCostBasis, 0)
  )
  const totalRemainingEstimatedValue = roundMoney(
    rows.reduce((sum, row) => sum + row.remainingEstimatedValue, 0)
  )
  const projectedProfitLoss = roundMoney(
    rows.reduce((sum, row) => sum + row.projectedProfitLoss, 0)
  )
  const lossBreakCount = rows.filter((row) => row.projectedProfitLoss < 0).length
  const noSalesCount = rows.filter((row) => row.soldItemCount === 0).length
  const remainingInventoryCount = rows.reduce(
    (sum, row) => sum + row.remainingItemCount,
    0
  )

  const exportParams = {
    q: search,
    source: selectedSource,
    status: selectedStatus,
    profitability: selectedProfitability,
    period: selectedPeriod,
    date:
      selectedPeriod === 'daily' || selectedPeriod === 'weekly'
        ? resolvedSearchParams.date || startDate
        : undefined,
    year: String(selectedYear),
    month: selectedPeriod === 'monthly' ? String(selectedMonth) : undefined,
    quarter: selectedPeriod === 'quarterly' ? String(selectedQuarter) : undefined,
    startDate: selectedPeriod === 'custom' ? startDate : undefined,
    endDate: selectedPeriod === 'custom' ? endDate : undefined,
  }

  const csvHref = buildReportCsvHref('break-profitability', exportParams)
  const pdfHref = buildReportPdfHref('break-profitability', exportParams)
  const printHref = buildReportPrintHref('break-profitability', exportParams)

  return (
    <main className="app-page-wide space-y-4">
      <div className="app-page-header gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Reports
          </p>
          <h1 className="app-title">Break Profitability Report</h1>
          <p className="app-subtitle">
            Review break cost, realized sales, remaining inventory value,
            projected profit/loss, and action-needed break cleanup.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/app/reports" className="app-button" prefetch={false}>
            Back to Reports
          </Link>

          <Link href="/app/reports/open-lots" className="app-button" prefetch={false}>
            Open Lots
          </Link>

          <Link href="/app/reports/operations" className="app-button" prefetch={false}>
            Daily Operations
          </Link>

          <ReportExportButtons
            csvHref={csvHref}
            pdfHref={pdfHref}
            printHref={printHref}
          />
        </div>
      </div>

      {(breaksRes.error || inventoryRes.error || salesRes.error) ? (
        <section className="app-section border-amber-900 bg-amber-950/30">
          <h2 className="text-base font-semibold text-amber-200">
            Report warning
          </h2>
          {breaksRes.error ? (
            <p className="mt-1 text-sm text-amber-200">
              Breaks: {breaksRes.error.message}
            </p>
          ) : null}
          {inventoryRes.error ? (
            <p className="mt-1 text-sm text-amber-200">
              Inventory: {inventoryRes.error.message}
            </p>
          ) : null}
          {salesRes.error ? (
            <p className="mt-1 text-sm text-amber-200">
              Sales: {salesRes.error.message}
            </p>
          ) : null}
        </section>
      ) : null}

      <form action="/app/reports/break-profitability" className="space-y-3">
        <ReportDateFilters
          period={selectedPeriod}
          date={
            selectedPeriod === 'daily' || selectedPeriod === 'weekly'
              ? resolvedSearchParams.date || startDate
              : ''
          }
          year={selectedYear}
          month={selectedMonth}
          quarter={selectedQuarter}
          startDate={selectedPeriod === 'custom' ? startDate : ''}
          endDate={selectedPeriod === 'custom' ? endDate : ''}
          resetHref="/app/reports/break-profitability"
        >
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Search
            </span>

            <input
              name="q"
              type="search"
              defaultValue={search}
              placeholder="Product, seller, breaker, order #, notes..."
              className="app-input h-9 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Source
            </span>

            <select
              name="source"
              defaultValue={selectedSource}
              className="app-select h-9 text-sm"
            >
              <option value="all">All sources</option>
              {allSources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Status
            </span>

            <select
              name="status"
              defaultValue={selectedStatus}
              className="app-select h-9 text-sm"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Profitability
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
        </ReportDateFilters>
      </form>

      <section className="app-section space-y-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              {calculatedRange.label}
            </h2>
            <p className="text-sm text-zinc-400">
              Source: {selectedSource === 'all' ? 'All sources' : selectedSource}. This report is read-only and does not modify COGS, inventory, or tax records.
            </p>
          </div>

          <div className="rounded-full border border-blue-900 bg-blue-950/40 px-3 py-1 text-xs font-semibold text-blue-300">
            Break ROI Review
          </div>
        </div>
      </section>

      <ReportSummaryCards
        cards={[
          {
            label: 'Breaks',
            value: rows.length.toLocaleString(),
            note: 'Filtered break records',
          },
          {
            label: 'Break Cost',
            value: formatCurrency(totalBreakCost),
            note: 'Total acquisition cost',
          },
          {
            label: 'Net Proceeds',
            value: formatCurrency(totalNetProceeds),
            note: 'Realized sale proceeds',
          },
          {
            label: 'Realized Profit',
            value: formatCurrency(totalRealizedProfit),
            note: 'Sold items only',
          },
          {
            label: 'Remaining Basis',
            value: formatCurrency(totalRemainingBasis),
            note: 'Unsold linked inventory',
          },
          {
            label: 'Remaining Value',
            value: formatCurrency(totalRemainingEstimatedValue),
            note: 'Estimated unsold value',
          },
          {
            label: 'Projected P/L',
            value: formatCurrency(projectedProfitLoss),
            note: 'Net proceeds + remaining value - cost',
          },
          {
            label: 'Loss Breaks',
            value: lossBreakCount.toLocaleString(),
            note: 'Projected below cost',
          },
        ]}
      />

      <section className="app-section space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Break Profitability Detail
            </h2>
            <p className="text-sm text-zinc-400">
              Click a break row to open the break detail page and review linked inventory.
            </p>
          </div>

          <div className="text-xs text-zinc-500">
            No sales: {noSalesCount.toLocaleString()} · Remaining inventory:{' '}
            {remainingInventoryCount.toLocaleString()}
          </div>
        </div>

        <ReportTable
          rows={rows}
          rowHref={(row) => `/app/breaks/${row.id}`}
          emptyMessage="No breaks matched this profitability report filter."
          columns={[
            {
              key: 'break',
              label: 'Break',
              render: (row) => (
                <div className="min-w-[260px]">
                  <div className="font-medium text-zinc-100">{row.product}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {row.source} · {row.orderNumber || 'No order #'}
                  </div>
                </div>
              ),
            },
            {
              key: 'date',
              label: 'Date',
              render: (row) => formatDate(row.breakDate),
            },
            {
              key: 'cost',
              label: 'Cost',
              align: 'right',
              render: (row) => formatCurrency(row.breakCost),
            },
            {
              key: 'items',
              label: 'Items',
              align: 'right',
              render: (row) => `${row.soldItemCount}/${row.itemCount}`,
            },
            {
              key: 'remaining',
              label: 'Remaining',
              align: 'right',
              render: (row) => row.remainingItemCount.toLocaleString(),
            },
            {
              key: 'net',
              label: 'Net Sales',
              align: 'right',
              render: (row) => formatCurrency(row.netProceeds),
            },
            {
              key: 'realizedProfit',
              label: 'Realized Profit',
              align: 'right',
              render: (row) => (
                <span className={profitabilityBadgeClass(row.realizedProfit)}>
                  {formatCurrency(row.realizedProfit)}
                </span>
              ),
            },
            {
              key: 'remainingBasis',
              label: 'Remain Basis',
              align: 'right',
              render: (row) => formatCurrency(row.remainingCostBasis),
            },
            {
              key: 'remainingValue',
              label: 'Remain Value',
              align: 'right',
              render: (row) => formatCurrency(row.remainingEstimatedValue),
            },
            {
              key: 'projected',
              label: 'Projected P/L',
              align: 'right',
              render: (row) => (
                <span className={profitabilityBadgeClass(row.projectedProfitLoss)}>
                  {formatCurrency(row.projectedProfitLoss)}
                </span>
              ),
            },
            {
              key: 'roi',
              label: 'ROI',
              align: 'right',
              render: (row) => formatPercent(row.roiPercent),
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
      <section className="app-section space-y-3">
        <h2 className="text-base font-semibold text-zinc-100">Break Report Notes</h2>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
            <h3 className="text-sm font-semibold text-zinc-100">Realized vs projected</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Realized profit is based on completed linked sales. Projected profit adds estimated value from remaining linked inventory.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
            <h3 className="text-sm font-semibold text-zinc-100">IRS-safe treatment</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Unsold items remain inventory. Their remaining cost basis should not be deducted until sold, disposed, given away with documentation, or otherwise finalized.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
            <h3 className="text-sm font-semibold text-zinc-100">Data linkage</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              This report depends on inventory items being linked to breaks and sales being linked to inventory items.
            </p>
          </div>
        </div>
      </section>

    </main>
  )
}
