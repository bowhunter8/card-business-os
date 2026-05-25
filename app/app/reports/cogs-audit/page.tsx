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
  issue?: string
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

type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'

type SaleRow = {
  id: string
  sale_date: string | null
  gross_sale: number | string | null
  platform_fees: number | string | null
  shipping_cost: number | string | null
  other_costs: number | string | null
  net_proceeds: number | string | null
  cost_of_goods_sold: number | string | null
  profit: number | string | null
  platform: string | null
  notes: string | null
  inventory_item_id: string | null
}

type InventoryItemRow = {
  id: string
  title?: string | null
  item_name?: string | null
  player_name?: string | null
  year?: string | number | null
  set_name?: string | null
  card_number?: string | null
  item_number?: string | null
  status?: string | null
  purchase_price?: number | string | null
  cost?: number | string | null
  allocated_cost?: number | string | null
  quantity?: number | string | null
  available_quantity?: number | string | null
  unit_cost?: number | string | null
  total_cost?: number | string | null
  cost_basis_unit?: number | string | null
  cost_basis_total?: number | string | null
  estimated_value_total?: number | string | null
  current_value?: number | string | null
  estimated_value?: number | string | null
  sale_price?: number | string | null
  sold_price?: number | string | null
  created_at?: string | null
  acquired_at?: string | null
  purchase_date?: string | null
  date_added?: string | null
  notes?: string | null
}

type BreakRow = {
  id: string
  break_date: string | null
  source_name: string | null
  product_name: string | null
  order_number: string | null
  total_cost: number | string | null
}

type TaxYearSettingsRow = {
  beginning_inventory: number | string | null
  ending_inventory_snapshot: number | string | null
  ending_inventory_locked_at: string | null
  notes: string | null
}

type AuditRow = {
  id: string
  issue: string
  severity: 'ok' | 'review' | 'warning'
  area: string
  item: string
  status: string
  amount: number
  notes: string
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
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

function normalizePeriod(raw?: string | null): ReportPeriod {
  if (raw === 'day' || raw === 'daily') return 'daily'
  if (raw === 'week' || raw === 'weekly') return 'weekly'
  if (raw === 'month' || raw === 'monthly') return 'monthly'
  if (raw === 'quarter' || raw === 'quarterly') return 'quarterly'
  if (raw === 'year' || raw === 'yearly') return 'yearly'
  if (raw === 'custom') return 'custom'
  return 'yearly'
}

function clampYear(raw?: string | null) {
  const currentYear = new Date().getFullYear()
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > currentYear + 1) return currentYear
  return parsed
}

function clampMonth(raw?: string | null) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) return new Date().getMonth() + 1
  return parsed
}

function clampQuarter(raw?: string | null) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 4) return Math.floor(new Date().getMonth() / 3) + 1
  return parsed
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

function getReportDateRange({
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
  date?: string | null
  start?: string | null
  end?: string | null
  month: number
  quarter: number
}) {
  const today = new Date()
  const defaultAnchor =
    selectedYear === today.getFullYear() ? today : new Date(selectedYear, 0, 1)

  if (period === 'daily') {
    const selectedDay = parseInputDate(date, defaultAnchor)
    return {
      startDate: dateToInputValue(selectedDay),
      endDate: dateToInputValue(selectedDay),
      date: dateToInputValue(selectedDay),
      label: `Daily COGS Audit: ${dateToInputValue(selectedDay)}`,
    }
  }

  if (period === 'weekly') {
    const selectedDay = parseInputDate(date, defaultAnchor)
    const weekStart = getStartOfWeekSunday(selectedDay)
    const weekEnd = getEndOfWeekSunday(selectedDay)
    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      date: dateToInputValue(weekStart),
      label: `Weekly COGS Audit: ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    }
  }

  if (period === 'monthly') {
    const monthStart = new Date(selectedYear, month - 1, 1)
    const monthEnd = new Date(selectedYear, month, 0)
    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      date: dateToInputValue(monthStart),
      label: `Monthly COGS Audit: ${monthStart.toLocaleString('default', { month: 'long' })} ${selectedYear}`,
    }
  }

  if (period === 'quarterly') {
    const quarterStartMonth = (quarter - 1) * 3
    const quarterStart = new Date(selectedYear, quarterStartMonth, 1)
    const quarterEnd = new Date(selectedYear, quarterStartMonth + 3, 0)
    return {
      startDate: dateToInputValue(quarterStart),
      endDate: dateToInputValue(quarterEnd),
      date: dateToInputValue(quarterStart),
      label: `Quarterly COGS Audit: Q${quarter} ${selectedYear}`,
    }
  }

  if (period === 'custom') {
    const fallbackStart = new Date(selectedYear, 0, 1)
    const fallbackEnd = new Date(selectedYear, 11, 31)
    const customStart = parseInputDate(start, fallbackStart)
    const customEnd = parseInputDate(end, fallbackEnd)
    const normalizedStart = customStart.getTime() <= customEnd.getTime() ? customStart : customEnd
    const normalizedEnd = customStart.getTime() <= customEnd.getTime() ? customEnd : customStart
    return {
      startDate: dateToInputValue(normalizedStart),
      endDate: dateToInputValue(normalizedEnd),
      date: dateToInputValue(normalizedStart),
      label: `Custom COGS Audit: ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
    }
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
    date: `${selectedYear}-01-01`,
    label: `Yearly COGS Audit: ${selectedYear}`,
  }
}

function normalizeStatus(status: string | null | undefined) {
  return asString(status).trim() || 'unknown'
}

function prettyStatus(status: string | null | undefined) {
  return normalizeStatus(status)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function getItemName(item: InventoryItemRow | undefined) {
  if (!item) return 'Unlinked sale'
  const directTitle = item.title || item.item_name || item.player_name || 'Untitled item'
  const details = [
    item.year ? String(item.year) : '',
    item.set_name || '',
    item.item_number || item.card_number ? `#${item.item_number || item.card_number}` : '',
  ].filter(Boolean)
  return details.length ? `${directTitle} — ${details.join(' ')}` : directTitle
}

function getItemCost(item: InventoryItemRow) {
  const quantity = asNumber(item.quantity ?? item.available_quantity ?? 1)
  const costBasisTotal = asNumber(item.cost_basis_total)
  const totalCost = asNumber(item.total_cost)
  const allocatedCost = asNumber(item.allocated_cost)
  const costBasisUnit = asNumber(item.cost_basis_unit)
  const unitCost = asNumber(item.unit_cost)
  const purchasePrice = asNumber(item.purchase_price)
  const legacyCost = asNumber(item.cost)

  if (costBasisTotal > 0) return costBasisTotal
  if (totalCost > 0) return totalCost
  if (allocatedCost > 0) return allocatedCost
  if (costBasisUnit > 0) return costBasisUnit * Math.max(quantity, 1)
  if (unitCost > 0) return unitCost * Math.max(quantity, 1)
  if (purchasePrice > 0) return purchasePrice
  if (legacyCost > 0) return legacyCost
  return 0
}

function getOpenQuantity(item: InventoryItemRow) {
  const status = normalizeStatus(item.status).toLowerCase()
  const available = asNumber(item.available_quantity)
  const quantity = asNumber(item.quantity)
  if (available > 0) return available
  if (quantity > 0 && status !== 'sold' && status !== 'disposed') return quantity
  return 0
}

function matchesAuditSearch(row: AuditRow, search: string) {
  if (!search) return true
  const haystack = [row.issue, row.severity, row.area, row.item, row.status, row.amount, row.notes]
    .map(asString)
    .join(' ')
    .toLowerCase()
  return haystack.includes(search.toLowerCase())
}

function issueBadgeClass(severity: AuditRow['severity']) {
  if (severity === 'warning') {
    return 'inline-flex items-center rounded-full border border-red-800 bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-200'
  }
  if (severity === 'review') {
    return 'inline-flex items-center rounded-full border border-amber-800 bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-200'
  }
  return 'inline-flex items-center rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-200'
}

export default async function CogsAuditReportPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const resolvedSearchParams = (await searchParams) || {}

  const search = resolvedSearchParams.q?.trim() || ''
  const selectedIssue = resolvedSearchParams.issue || 'all'
  const selectedPeriod = normalizePeriod(resolvedSearchParams.period)
  const selectedYear = clampYear(resolvedSearchParams.year)
  const selectedMonth = clampMonth(resolvedSearchParams.month)
  const selectedQuarter = clampQuarter(resolvedSearchParams.quarter)
  const selectedDate =
    selectedPeriod === 'daily' || selectedPeriod === 'weekly'
      ? resolvedSearchParams.date || ''
      : ''
  const selectedStart =
    selectedPeriod === 'custom'
      ? resolvedSearchParams.startDate || resolvedSearchParams.dateFrom || ''
      : ''
  const selectedEnd =
    selectedPeriod === 'custom'
      ? resolvedSearchParams.endDate || resolvedSearchParams.dateTo || ''
      : ''

  const resolvedDateRange = getReportDateRange({
    selectedYear,
    period: selectedPeriod,
    date: selectedDate,
    start: selectedStart,
    end: selectedEnd,
    month: selectedMonth,
    quarter: selectedQuarter,
  })

  const exportParams = {
    ...(search ? { q: search } : {}),
    ...(selectedIssue !== 'all' ? { issue: selectedIssue } : {}),
    period: selectedPeriod,
    year: String(selectedYear),
    ...(selectedPeriod === 'daily' || selectedPeriod === 'weekly'
      ? { date: selectedDate || resolvedDateRange.date }
      : {}),
    ...(selectedPeriod === 'monthly' ? { month: String(selectedMonth) } : {}),
    ...(selectedPeriod === 'quarterly' ? { quarter: String(selectedQuarter) } : {}),
    ...(selectedPeriod === 'custom'
      ? {
          startDate: resolvedDateRange.startDate,
          endDate: resolvedDateRange.endDate,
          dateFrom: resolvedDateRange.startDate,
          dateTo: resolvedDateRange.endDate,
        }
      : {}),
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let sales: SaleRow[] = []
  let inventoryItems: InventoryItemRow[] = []
  let breaks: BreakRow[] = []
  let taxSettings: TaxYearSettingsRow | null = null
  let loadError = ''

  if (!user) {
    loadError = 'You must be signed in to view this report.'
  } else {
    const [salesRes, inventoryRes, breaksRes, taxSettingsRes] = await Promise.all([
      supabase
        .from('sales')
        .select(`
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
        `)
        .eq('user_id', user.id)
        .is('reversed_at', null)
        .gte('sale_date', resolvedDateRange.startDate)
        .lte('sale_date', resolvedDateRange.endDate)
        .order('sale_date', { ascending: false }),

      supabase
        .from('inventory_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),

      supabase
        .from('breaks')
        .select('id, break_date, source_name, product_name, order_number, total_cost')
        .eq('user_id', user.id)
        .gte('break_date', resolvedDateRange.startDate)
        .lte('break_date', resolvedDateRange.endDate)
        .order('break_date', { ascending: false }),

      supabase
        .from('tax_year_settings')
        .select('beginning_inventory, ending_inventory_snapshot, ending_inventory_locked_at, notes')
        .eq('user_id', user.id)
        .eq('tax_year', selectedYear)
        .maybeSingle(),
    ])

    if (salesRes.error) loadError = salesRes.error.message
    else if (inventoryRes.error) loadError = inventoryRes.error.message
    else if (breaksRes.error) loadError = breaksRes.error.message
    else if (taxSettingsRes.error) loadError = taxSettingsRes.error.message
    else {
      sales = (salesRes.data ?? []) as SaleRow[]
      inventoryItems = (inventoryRes.data ?? []) as InventoryItemRow[]
      breaks = (breaksRes.data ?? []) as BreakRow[]
      taxSettings = (taxSettingsRes.data ?? null) as TaxYearSettingsRow | null
    }
  }

  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]))
  const beginningInventory = roundMoney(asNumber(taxSettings?.beginning_inventory))
  const endingInventorySnapshot =
    taxSettings?.ending_inventory_snapshot === null ||
    taxSettings?.ending_inventory_snapshot === undefined
      ? null
      : roundMoney(asNumber(taxSettings.ending_inventory_snapshot))

  const openInventoryItems = inventoryItems.filter((item) => {
    const status = normalizeStatus(item.status).toLowerCase()
    return status !== 'sold' && status !== 'disposed' && getOpenQuantity(item) > 0
  })
  const liveEndingInventory = roundMoney(
    openInventoryItems.reduce((sum, item) => sum + getItemCost(item), 0)
  )
  const endingInventory = endingInventorySnapshot ?? liveEndingInventory
  const purchases = roundMoney(breaks.reduce((sum, row) => sum + asNumber(row.total_cost), 0))
  const realizedCogs = roundMoney(
    sales.reduce((sum, sale) => sum + asNumber(sale.cost_of_goods_sold), 0)
  )
  const formulaCogs = roundMoney(beginningInventory + purchases - endingInventory)
  const reconciliationDifference = roundMoney(formulaCogs - realizedCogs)

  const soldInventoryIds = new Set(
    sales.map((sale) => sale.inventory_item_id).filter((id): id is string => Boolean(id))
  )
  const unlinkedSales = sales.filter((sale) => !sale.inventory_item_id)
  const missingCogsSales = sales.filter((sale) => asNumber(sale.cost_of_goods_sold) <= 0)
  const missingCostInventory = openInventoryItems.filter((item) => getItemCost(item) <= 0)
  const disposedItems = inventoryItems.filter((item) => normalizeStatus(item.status).toLowerCase() === 'disposed')
  const junkItems = inventoryItems.filter((item) => normalizeStatus(item.status).toLowerCase() === 'junk')
  const personalItems = inventoryItems.filter((item) => normalizeStatus(item.status).toLowerCase() === 'personal')
  const soldStatusStillOpen = inventoryItems.filter((item) => {
    const status = normalizeStatus(item.status).toLowerCase()
    return status !== 'sold' && soldInventoryIds.has(item.id)
  })

  const auditRows: AuditRow[] = [
    {
      id: 'reconciliation',
      issue: Math.abs(reconciliationDifference) > 0.01 ? 'COGS reconciliation difference' : 'COGS reconciliation balanced',
      severity: Math.abs(reconciliationDifference) > 0.01 ? 'review' : 'ok',
      area: 'COGS Formula',
      item: 'Beginning inventory + purchases - ending inventory',
      status: Math.abs(reconciliationDifference) > 0.01 ? 'Review' : 'OK',
      amount: reconciliationDifference,
      notes:
        'Compares formula COGS against sale-level realized COGS. Differences can be normal if purchases/imports are incomplete or beginning/ending inventory is not finalized.',
    },
    {
      id: 'ending-inventory-lock',
      issue: endingInventorySnapshot === null ? 'Ending inventory not locked' : 'Ending inventory snapshot exists',
      severity: endingInventorySnapshot === null ? 'review' : 'ok',
      area: 'Year-End Inventory',
      item: `${selectedYear} ending inventory`,
      status: endingInventorySnapshot === null ? 'Live value' : 'Locked snapshot',
      amount: endingInventory,
      notes:
        endingInventorySnapshot === null
          ? 'For final tax filing, lock/review the year-end inventory snapshot so numbers do not change later.'
          : 'Ending inventory is using the tax-year snapshot.',
    },
    ...unlinkedSales.map((sale) => ({
      id: `unlinked-sale-${sale.id}`,
      issue: 'Sale missing linked inventory',
      severity: 'warning' as const,
      area: 'Sales',
      item: getItemName(undefined),
      status: 'Unlinked',
      amount: asNumber(sale.gross_sale),
      notes: `Sale ${sale.id} has no inventory_item_id, so COGS traceability should be reviewed.`,
    })),
    ...missingCogsSales.map((sale) => ({
      id: `missing-cogs-${sale.id}`,
      issue: 'Sale has missing or zero COGS',
      severity: 'warning' as const,
      area: 'COGS',
      item: getItemName(sale.inventory_item_id ? inventoryById.get(sale.inventory_item_id) : undefined),
      status: 'Missing COGS',
      amount: asNumber(sale.gross_sale),
      notes: `Sale ${sale.id} has zero cost_of_goods_sold. Confirm this is correct before using final tax totals.`,
    })),
    ...missingCostInventory.slice(0, 100).map((item) => ({
      id: `missing-cost-${item.id}`,
      issue: 'Open inventory missing cost basis',
      severity: 'review' as const,
      area: 'Inventory',
      item: getItemName(item),
      status: prettyStatus(item.status),
      amount: getItemCost(item),
      notes: 'Open inventory has no detectable cost basis. This may affect ending inventory and COGS reconciliation.',
    })),
    ...soldStatusStillOpen.map((item) => ({
      id: `sold-status-open-${item.id}`,
      issue: 'Sold item status may need review',
      severity: 'review' as const,
      area: 'Inventory Status',
      item: getItemName(item),
      status: prettyStatus(item.status),
      amount: getItemCost(item),
      notes: 'This item appears linked to a sale but is not marked sold. Review status/quantity if needed.',
    })),
  ]

  const filteredAuditRows = auditRows.filter((row) => {
    if (selectedIssue !== 'all' && row.severity !== selectedIssue) return false
    if (!matchesAuditSearch(row, search)) return false
    return true
  })

  return (
    <main className="app-page space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Reports</p>
          <h1 className="app-title">COGS Audit & Reconciliation</h1>
          <p className="app-subtitle">
            Audit-style COGS support for beginning inventory, purchases, realized COGS, ending inventory, open inventory, and review warnings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/reports" className="app-button" prefetch={false}>
            Back to Reports
          </Link>

          <Link href="/app/reports/cogs" className="app-button" prefetch={false}>
            Realized COGS
          </Link>

          <ReportExportButtons
            csvHref={buildReportCsvHref('cogs-audit', exportParams)}
            pdfHref={buildReportPdfHref('cogs-audit', exportParams)}
            printHref={buildReportPrintHref('cogs-audit', exportParams)}
          />
        </div>
      </div>

      {loadError ? (
        <section className="app-section border-red-900 bg-red-950/30">
          <h2 className="text-lg font-semibold text-red-100">COGS audit report could not load</h2>
          <p className="mt-1 text-sm text-red-200">{loadError}</p>
        </section>
      ) : null}

      <section className="app-alert-info">
        This report is additive audit support. It does not replace the existing Realized COGS report. Formula COGS can differ from sale-level COGS until beginning inventory, purchases, imports, disposals, and ending inventory are fully reviewed.
      </section>

      <form action="/app/reports/cogs-audit" method="get" className="space-y-3">
        <ReportDateFilters
          period={selectedPeriod}
          date={
            selectedPeriod === 'daily' || selectedPeriod === 'weekly'
              ? selectedDate || resolvedDateRange.date
              : ''
          }
          year={String(selectedYear)}
          month={String(selectedMonth)}
          quarter={String(selectedQuarter)}
          startDate={selectedPeriod === 'custom' ? resolvedDateRange.startDate : ''}
          endDate={selectedPeriod === 'custom' ? resolvedDateRange.endDate : ''}
          resetHref="/app/reports/cogs-audit"
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
                placeholder="Issue, item, status, notes..."
                className="app-input h-9 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Issue Level
              </span>

              <select name="issue" defaultValue={selectedIssue} className="app-select h-9 text-sm">
                <option value="all">All issue levels</option>
                <option value="warning">Warnings only</option>
                <option value="review">Review only</option>
                <option value="ok">OK only</option>
              </select>
            </label>
          </>
        </ReportDateFilters>
      </form>

      <section className="app-section px-3 py-3">
        <div className="text-sm font-semibold text-zinc-100">
          {resolvedDateRange.label}
        </div>

        <div className="mt-1 text-xs text-zinc-400">
          Reconciliation range: {resolvedDateRange.startDate} through {resolvedDateRange.endDate}.
          {search ? ` Search filter: ${search}.` : ' Search filter: none.'}
        </div>
      </section>

      <ReportSummaryCards
        cards={[
          {
            label: 'Beginning Inventory',
            value: formatCurrency(beginningInventory),
            note: 'Tax year setting',
          },
          {
            label: 'Purchases / Breaks',
            value: formatCurrency(purchases),
            note: `${breaks.length.toLocaleString()} purchase record(s) in range`,
          },
          {
            label: 'Ending Inventory',
            value: formatCurrency(endingInventory),
            note: endingInventorySnapshot === null ? 'Live open inventory' : 'Locked snapshot',
          },
          {
            label: 'Formula COGS',
            value: formatCurrency(formulaCogs),
            note: 'Beginning + purchases - ending',
          },
          {
            label: 'Realized COGS',
            value: formatCurrency(realizedCogs),
            note: `${sales.length.toLocaleString()} sale record(s) in range`,
          },
          {
            label: 'Difference',
            value: formatCurrency(reconciliationDifference),
            note: 'Formula COGS minus realized COGS',
          },
          {
            label: 'Missing COGS',
            value: missingCogsSales.length.toLocaleString(),
            note: 'Sales with zero cost basis',
          },
          {
            label: 'Unlinked Sales',
            value: unlinkedSales.length.toLocaleString(),
            note: 'Sales missing inventory link',
          },
          {
            label: 'Open Missing Cost',
            value: missingCostInventory.length.toLocaleString(),
            note: 'Open inventory cost review',
          },
          {
            label: 'Disposed / Junk / PC',
            value: `${disposedItems.length}/${junkItems.length}/${personalItems.length}`,
            note: 'Status review counts',
          },
        ]}
      />

      <section className="app-section space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Audit Review Table
            </h2>
            <p className="text-sm text-zinc-400">
              Review reconciliation differences, missing COGS, unlinked sales, unlocked inventory snapshots, and cost-basis issues.
            </p>
          </div>

          <Link href="/app/reports/cogs" className="app-button" prefetch={false}>
            Open Realized COGS
          </Link>
        </div>

        <ReportTable
          rows={filteredAuditRows}
          emptyMessage="No COGS audit issues matched those filters."
          columns={[
            {
              key: 'issue',
              label: 'Issue',
              render: (row) => (
                <div className="min-w-[240px]">
                  <div className="font-medium text-zinc-100">{row.issue}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">{row.area}</div>
                </div>
              ),
            },
            {
              key: 'severity',
              label: 'Level',
              render: (row) => (
                <span className={issueBadgeClass(row.severity)}>
                  {row.severity.toUpperCase()}
                </span>
              ),
            },
            {
              key: 'item',
              label: 'Item / Area',
              render: (row) => row.item,
            },
            {
              key: 'status',
              label: 'Status',
              render: (row) => row.status,
            },
            {
              key: 'amount',
              label: 'Amount',
              align: 'right',
              render: (row) => formatCurrency(row.amount),
            },
            {
              key: 'notes',
              label: 'Notes',
              className: 'max-w-[360px]',
              render: (row) => (
                <div className="line-clamp-3 text-zinc-300">{row.notes || '—'}</div>
              ),
            },
          ]}
        />
      </section>
    </main>
  )
}
