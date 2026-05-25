import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getExpenseScheduleCArea } from '@/lib/reports/expense-categories'
import {
  buildPrintableReportHtml,
  type PrintableReportColumn,
  type PrintableReportRow,
} from '@/lib/reports/report-print-utils'
import {
  formatReportDate,
  jsonError,
  moneyString,
  unauthorizedError,
} from '@/lib/reports/report-export-utils'

export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{
    reportType: string
  }>
}

type ReportPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'

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

type SaleRow = {
  id: string
  sale_date: string | null
  gross_sale: number | null
  platform_fees: number | null
  shipping_cost: number | null
  other_costs: number | null
  net_proceeds: number | null
  cost_of_goods_sold: number | null
  profit: number | null
  platform: string | null
  notes: string | null
  inventory_item_id: string | null
  sales_tax_collected?: number | string | null
  sales_tax_responsibility?: string | null
  sales_channel_type?: string | null
  tax_state?: string | null
  tax_notes?: string | null
}

type SaleInventoryRow = {
  id: string
  title?: string | null
  item_name?: string | null
  player_name?: string | null
  year?: number | string | null
  set_name?: string | null
  card_number?: string | null
  item_number?: string | null
  notes?: string | null
  status?: string | null
}

type ExpenseRow = {
  id: string
  expense_date: string | null
  category: string | null
  vendor: string | null
  amount: number | null
  notes: string | null
  created_at: string | null
}

type BreakRow = {
  id: string
  break_date: string | null
  source_name: string | null
  product_name: string | null
  order_number: string | null
  total_cost: number | null
}

type TaxYearSettingsRow = {
  beginning_inventory: number | null
  ending_inventory_snapshot: number | null
  ending_inventory_locked_at: string | null
  business_use_of_home: number | null
  vehicle_expense: number | null
  depreciation_expense: number | null
  legal_professional: number | null
  insurance: number | null
  utilities: number | null
  taxes_licenses: number | null
  repairs_maintenance: number | null
  notes: string | null
}

type ReportConfig = Parameters<typeof buildPrintableReportHtml>[0]

const REPORT_LABELS: Record<string, string> = {
  inventory: 'Inventory Report',
  sales: 'Sales Report',
  cogs: 'Realized COGS Report',
  expenses: 'Expenses Report',
  financial: 'Financial Report',
  'profit-loss': 'Profit & Loss Statement',
  'sales-tax': 'Sales Tax Report',
  shipping: 'Shipping Report',
  'cpa-packet': 'CPA Export Packet',
  'open-lots': 'Open Lots Report',
  'write-offs': 'Write-Offs Report',
  'break-profitability': 'Break Profitability Report',
  'platform-profitability': 'Platform Profitability Report',
  'marketplace-fees': 'Marketplace Fees Report',
  operations: 'Operations Report',
}

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

function currency(value: number) {
  return `$${moneyString(value)}`
}

function normalizeStatus(status: string | null | undefined) {
  const clean = asString(status).trim()
  return clean || 'unknown'
}

function platformKey(value: string | null | undefined) {
  return String(value || 'Unknown').trim() || 'Unknown'
}

function normalizeSalesTaxResponsibility(value: string | null | undefined) {
  const clean = String(value || '').trim()

  if (
    clean === 'marketplace_collected' ||
    clean === 'seller_collected' ||
    clean === 'not_collected' ||
    clean === 'exempt_or_not_taxable'
  ) {
    return clean
  }

  return 'marketplace_collected'
}

function normalizeSalesChannelType(value: string | null | undefined) {
  const clean = String(value || '').trim()

  if (
    clean === 'marketplace' ||
    clean === 'local_sale' ||
    clean === 'card_show' ||
    clean === 'direct_private'
  ) {
    return clean
  }

  return 'marketplace'
}

function formatSalesTaxResponsibility(value: string | null | undefined) {
  const clean = normalizeSalesTaxResponsibility(value)

  if (clean === 'marketplace_collected') return 'Marketplace handled'
  if (clean === 'seller_collected') return 'Seller remit'
  if (clean === 'not_collected') return 'No tax'
  if (clean === 'exempt_or_not_taxable') return 'Exempt'

  return 'Marketplace handled'
}

function formatSalesChannelType(value: string | null | undefined) {
  const clean = normalizeSalesChannelType(value)

  if (clean === 'marketplace') return 'Marketplace'
  if (clean === 'local_sale') return 'Local sale'
  if (clean === 'card_show') return 'Card show'
  if (clean === 'direct_private') return 'Direct/private'

  return 'Marketplace'
}

function clampYear(raw?: string | null) {
  const currentYear = new Date().getFullYear()
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > currentYear + 1) {
    return currentYear
  }

  return parsed
}

function clampMonth(raw?: string | null) {
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) {
    return new Date().getMonth() + 1
  }

  return parsed
}

function clampQuarter(raw?: string | null) {
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 4) {
    return Math.floor(new Date().getMonth() / 3) + 1
  }

  return parsed
}

function normalizePeriod(raw?: string | null): ReportPeriod {
  if (raw === 'daily' || raw === 'day') return 'day'
  if (raw === 'weekly' || raw === 'week') return 'week'
  if (raw === 'monthly' || raw === 'month') return 'month'
  if (raw === 'quarterly' || raw === 'quarter') return 'quarter'
  if (raw === 'yearly' || raw === 'year') return 'year'
  if (raw === 'custom') return 'custom'

  return 'year'
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

function getPeriodReportDateRange({
  selectedYear,
  period,
  start,
  end,
  month,
  quarter,
  labelPrefix,
}: {
  selectedYear: number
  period: ReportPeriod
  start?: string | null
  end?: string | null
  month: number
  quarter: number
  labelPrefix: string
}) {
  const today = new Date()
  const defaultAnchor =
    selectedYear === today.getFullYear() ? today : new Date(selectedYear, 0, 1)

  if (period === 'day') {
    const selectedDay = parseInputDate(start, defaultAnchor)

    return {
      startDate: dateToInputValue(selectedDay),
      endDate: dateToInputValue(selectedDay),
      label: `Daily ${labelPrefix}: ${dateToInputValue(selectedDay)}`,
    }
  }

  if (period === 'week') {
    const selectedDay = parseInputDate(start, defaultAnchor)
    const weekStart = getStartOfWeek(selectedDay)
    const weekEnd = getEndOfWeek(selectedDay)

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      label: `Weekly ${labelPrefix}: ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    }
  }

  if (period === 'month') {
    const monthStart = new Date(selectedYear, month - 1, 1)
    const monthEnd = new Date(selectedYear, month, 0)

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      label: `Monthly ${labelPrefix}: ${monthStart.toLocaleString('default', {
        month: 'long',
      })} ${selectedYear}`,
    }
  }

  if (period === 'quarter') {
    const quarterStartMonth = (quarter - 1) * 3
    const quarterStart = new Date(selectedYear, quarterStartMonth, 1)
    const quarterEnd = new Date(selectedYear, quarterStartMonth + 3, 0)

    return {
      startDate: dateToInputValue(quarterStart),
      endDate: dateToInputValue(quarterEnd),
      label: `Quarterly ${labelPrefix}: Q${quarter} ${selectedYear}`,
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
      label: `Custom ${labelPrefix}: ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
    }
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
    label: `Yearly ${labelPrefix}: ${selectedYear}`,
  }
}

function getDateRange(searchParams: URLSearchParams) {
  const startDate =
    searchParams.get('startDate') || searchParams.get('dateFrom') || ''
  const endDate =
    searchParams.get('endDate') || searchParams.get('dateTo') || ''

  if (startDate && endDate) {
    return `${formatReportDate(startDate)} to ${formatReportDate(endDate)}`
  }

  if (startDate) {
    return `From ${formatReportDate(startDate)}`
  }

  if (endDate) {
    return `Through ${formatReportDate(endDate)}`
  }

  return 'All dates'
}

function getItemDate(item: InventoryItemRow) {
  return item.acquired_at || item.purchase_date || item.date_added || item.created_at || null
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

function getItemValue(item: InventoryItemRow) {
  const estimatedValueTotal = asNumber(item.estimated_value_total)
  const currentValue = asNumber(item.current_value)
  const estimatedValue = asNumber(item.estimated_value)
  const salePrice = asNumber(item.sale_price)
  const soldPrice = asNumber(item.sold_price)

  if (estimatedValueTotal > 0) return estimatedValueTotal
  if (currentValue > 0) return currentValue
  if (estimatedValue > 0) return estimatedValue
  if (salePrice > 0) return salePrice
  if (soldPrice > 0) return soldPrice

  return 0
}

function getBaseItemName(item: InventoryItemRow) {
  return item.title || item.item_name || item.player_name || 'Untitled item'
}

function getItemNumber(item: InventoryItemRow) {
  return asString(item.item_number || item.card_number)
}

function buildSaleItemName(item: SaleInventoryRow | undefined) {
  if (!item) return 'Unlinked sale'

  const directTitle = item.title || item.item_name || item.player_name || 'Untitled item'
  const parts = [
    item.year ? String(item.year) : '',
    item.set_name || '',
    item.item_number || item.card_number ? `#${item.item_number || item.card_number}` : '',
  ].filter(Boolean)

  return parts.length ? `${directTitle} — ${parts.join(' ')}` : directTitle
}

function formatDateForPrint(value: string | null | undefined) {
  if (!value) return 'Unknown'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toISOString().slice(0, 10)
}

function matchesSearch(item: InventoryItemRow, search: string) {
  if (!search) return true

  const haystack = [
    item.title,
    item.item_name,
    item.player_name,
    item.year,
    item.set_name,
    item.card_number,
    item.item_number,
    item.status,
    item.notes,
  ]
    .map(asString)
    .join(' ')
    .toLowerCase()

  return haystack.includes(search.toLowerCase())
}

function matchesDateRange(item: InventoryItemRow, startDate: string, endDate: string) {
  const rawDate = getItemDate(item)
  if (!rawDate) return true

  const itemDate = new Date(rawDate)
  if (Number.isNaN(itemDate.getTime())) return true

  if (startDate) {
    const fromDate = new Date(`${startDate}T00:00:00`)
    if (!Number.isNaN(fromDate.getTime()) && itemDate < fromDate) return false
  }

  if (endDate) {
    const toDate = new Date(`${endDate}T23:59:59`)
    if (!Number.isNaN(toDate.getTime()) && itemDate > toDate) return false
  }

  return true
}

function matchesValueFilter(item: InventoryItemRow, valueFilter: string) {
  if (!valueFilter || valueFilter === 'all') return true

  const value = getItemValue(item)

  if (valueFilter === 'no-value') return value <= 0
  if (valueFilter === 'under-10') return value > 0 && value < 10
  if (valueFilter === '10-50') return value >= 10 && value <= 50
  if (valueFilter === '50-100') return value > 50 && value <= 100
  if (valueFilter === 'over-100') return value > 100

  return true
}

function htmlResponse(html: string) {
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function withPrintScript(html: string) {
  return html.replace(
    '</body>',
    `<script>
      window.addEventListener('load', () => {
        setTimeout(() => window.print(), 250)
      })
    </script></body>`
  )
}

function getSelectedRange(searchParams: URLSearchParams, labelPrefix: string) {
  const selectedYear = clampYear(searchParams.get('year'))
  const selectedPeriod = normalizePeriod(searchParams.get('period'))
  const selectedMonth = clampMonth(searchParams.get('month'))
  const selectedQuarter = clampQuarter(searchParams.get('quarter'))

  const explicitStart =
    searchParams.get('start') ||
    searchParams.get('startDate') ||
    searchParams.get('dateFrom')
  const explicitEnd =
    searchParams.get('end') ||
    searchParams.get('endDate') ||
    searchParams.get('dateTo')
  const selectedDate = searchParams.get('date')

  const selectedStart =
    selectedPeriod === 'custom'
      ? explicitStart || selectedDate
      : selectedDate || explicitStart
  const selectedEnd =
    selectedPeriod === 'custom'
      ? explicitEnd
      : explicitEnd

  return getPeriodReportDateRange({
    selectedYear,
    period: selectedPeriod,
    start: selectedStart,
    end: selectedEnd,
    month: selectedMonth,
    quarter: selectedQuarter,
    labelPrefix,
  })
}

function buildInventoryPrintConfig(items: InventoryItemRow[], reportLabel: string): ReportConfig {
  const totalCost = items.reduce((sum, item) => sum + getItemCost(item), 0)
  const totalValue = items.reduce((sum, item) => sum + getItemValue(item), 0)
  const totalGainLoss = totalValue - totalCost

  const columns: PrintableReportColumn[] = [
    { key: 'number', label: '#', align: 'right', width: '4%' },
    { key: 'item', label: 'Item', width: '28%' },
    { key: 'status', label: 'Status', width: '8%' },
    { key: 'date', label: 'Date', width: '9%' },
    { key: 'year', label: 'Year', width: '6%' },
    { key: 'set', label: 'Set', width: '12%' },
    { key: 'itemNumber', label: 'Item #', width: '7%' },
    { key: 'cost', label: 'Cost', align: 'right', width: '8%' },
    { key: 'value', label: 'Value', align: 'right', width: '8%' },
    { key: 'gainLoss', label: 'Gain/Loss', align: 'right', width: '10%' },
  ]

  const rows: PrintableReportRow[] = items.map((item, index) => {
    const costBasis = getItemCost(item)
    const estimatedValue = getItemValue(item)

    return {
      number: index + 1,
      item: getBaseItemName(item),
      status: normalizeStatus(item.status),
      date: formatDateForPrint(getItemDate(item)),
      year: asString(item.year),
      set: asString(item.set_name),
      itemNumber: getItemNumber(item),
      cost: currency(costBasis),
      value: currency(estimatedValue),
      gainLoss: currency(estimatedValue - costBasis),
    }
  })

  return {
    title: `Inventory Report - ${reportLabel}`,
    subtitle: 'Printable read-only inventory report.',
    summary: [
      { label: 'Items in report', value: items.length },
      { label: 'Total cost basis', value: currency(totalCost) },
      { label: 'Estimated value', value: currency(totalValue) },
      { label: 'Estimated gain/loss', value: currency(totalGainLoss) },
    ],
    columns,
    rows,
    emptyMessage: 'No inventory items found for this report filter.',
  }
}

function buildOpenLotsPrintConfig({
  items,
  reportLabel,
  statusFilter,
  staleDays,
}: {
  items: InventoryItemRow[]
  reportLabel: string
  statusFilter: string
  staleDays: number
}): ReportConfig {
  const totalRemainingCost = items.reduce((sum, item) => sum + getItemCost(item), 0)
  const totalEstimatedValue = items.reduce((sum, item) => sum + getItemValue(item), 0)
  const totalSpread = totalEstimatedValue - totalRemainingCost

  const staleCount = items.filter((item) => {
    const rawDate = getItemDate(item)
    if (!rawDate) return false

    const acquiredDate = new Date(rawDate)
    if (Number.isNaN(acquiredDate.getTime())) return false

    const ageDays = Math.floor(
      (Date.now() - acquiredDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    return ageDays >= staleDays
  }).length

  const rows: PrintableReportRow[] = items.map((item, index) => {
    const costBasis = getItemCost(item)
    const estimatedValue = getItemValue(item)
    const rawDate = getItemDate(item)
    const acquiredDate = rawDate ? new Date(rawDate) : null
    const ageDays =
      acquiredDate && !Number.isNaN(acquiredDate.getTime())
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - acquiredDate.getTime()) / (1000 * 60 * 60 * 24)
            )
          )
        : null

    return {
      number: index + 1,
      item: getBaseItemName(item),
      status: normalizeStatus(item.status),
      qty: asNumber(item.available_quantity ?? item.quantity ?? 1),
      date: formatDateForPrint(rawDate),
      age: ageDays === null ? '' : `${ageDays} days`,
      year: asString(item.year),
      set: asString(item.set_name),
      itemNumber: getItemNumber(item),
      cost: currency(costBasis),
      value: currency(estimatedValue),
      spread: currency(estimatedValue - costBasis),
      notes: asString(item.notes),
    }
  })

  return {
    title: `Open Lots Report - ${reportLabel}`,
    subtitle:
      `Printable open lots report. Status filter: ${statusFilter || 'open'}. Stale threshold: ${staleDays} days. Open lots remain inventory until sold, disposed, donated, used as documented giveaways, or otherwise finalized.`,
    summary: [
      { label: 'Open lots/items', value: items.length },
      { label: 'Remaining cost basis', value: currency(totalRemainingCost) },
      { label: 'Estimated value', value: currency(totalEstimatedValue) },
      { label: 'Unrealized spread', value: currency(totalSpread) },
      { label: 'Stale lots', value: staleCount },
      { label: 'Tax status', value: 'Still inventory' },
    ],
    columns: [
      { key: 'number', label: '#', align: 'right', width: '4%' },
      { key: 'item', label: 'Item / Lot', width: '22%' },
      { key: 'status', label: 'Status', width: '8%' },
      { key: 'qty', label: 'Qty', align: 'right', width: '6%' },
      { key: 'date', label: 'Date', width: '9%' },
      { key: 'age', label: 'Age', width: '8%' },
      { key: 'year', label: 'Year', width: '6%' },
      { key: 'set', label: 'Set', width: '12%' },
      { key: 'itemNumber', label: 'Item #', width: '7%' },
      { key: 'cost', label: 'Cost', align: 'right', width: '8%' },
      { key: 'value', label: 'Value', align: 'right', width: '8%' },
      { key: 'spread', label: 'Spread', align: 'right', width: '10%' },
    ],
    rows,
    emptyMessage: 'No open lots found for this report filter.',
  }
}


function getWriteOffPrintDate(item: InventoryItemRow) {
  const row = item as Record<string, unknown>

  return (
    asString(row.disposed_at) ||
    asString(row.disposal_date) ||
    asString(row.updated_at) ||
    asString(row.created_at) ||
    getItemDate(item)
  )
}

function getWriteOffPrintReason(item: InventoryItemRow) {
  const row = item as Record<string, unknown>

  return (
    asString(row.disposal_reason) ||
    asString(row.disposed_reason) ||
    asString(row.write_off_reason) ||
    asString(row.reason) ||
    asString(item.notes) ||
    '—'
  )
}

function matchesWriteOffPrintDateRange(item: InventoryItemRow, startDate: string, endDate: string) {
  const rawDate = getWriteOffPrintDate(item)
  if (!rawDate) return true

  const itemDate = new Date(rawDate)
  if (Number.isNaN(itemDate.getTime())) return true

  if (startDate) {
    const fromDate = new Date(`${startDate}T00:00:00`)
    if (!Number.isNaN(fromDate.getTime()) && itemDate < fromDate) return false
  }

  if (endDate) {
    const toDate = new Date(`${endDate}T23:59:59`)
    if (!Number.isNaN(toDate.getTime()) && itemDate > toDate) return false
  }

  return true
}

function buildWriteOffsPrintConfig({
  items,
  reportLabel,
  statusFilter,
}: {
  items: InventoryItemRow[]
  reportLabel: string
  statusFilter: string
}): ReportConfig {
  const disposedCount = items.filter((item) => normalizeStatus(item.status).toLowerCase() === 'disposed').length
  const junkCount = items.filter((item) => normalizeStatus(item.status).toLowerCase() === 'junk').length
  const totalQuantity = items.reduce((sum, item) => sum + Math.max(asNumber(item.quantity ?? item.available_quantity ?? 1), 1), 0)
  const totalCost = items.reduce((sum, item) => sum + getItemCost(item), 0)
  const totalValue = items.reduce((sum, item) => sum + getItemValue(item), 0)

  const rows: PrintableReportRow[] = items.map((item, index) => {
    const costBasis = getItemCost(item)
    const estimatedValue = getItemValue(item)

    return {
      number: index + 1,
      item: getBaseItemName(item),
      status: normalizeStatus(item.status),
      qty: Math.max(asNumber(item.quantity ?? item.available_quantity ?? 1), 1),
      date: formatDateForPrint(getWriteOffPrintDate(item)),
      year: asString(item.year),
      set: asString(item.set_name),
      itemNumber: getItemNumber(item),
      cost: currency(costBasis),
      value: currency(estimatedValue),
      gainLoss: currency(estimatedValue - costBasis),
      reason: getWriteOffPrintReason(item),
    }
  })

  return {
    title: `Write-Off / Disposal Review - ${reportLabel}`,
    subtitle:
      `Printable write-off and disposal review. Status filter: ${statusFilter || 'all'}. Review junk, donated, giveaway, damaged, and finalized disposal records for CPA support without double counting.`,
    summary: [
      { label: 'Records in view', value: items.length },
      { label: 'Quantity', value: totalQuantity },
      { label: 'Disposed', value: disposedCount },
      { label: 'Junk', value: junkCount },
      { label: 'Cost basis', value: currency(totalCost) },
      { label: 'Estimated value', value: currency(totalValue) },
    ],
    columns: [
      { key: 'number', label: '#', align: 'right', width: '4%' },
      { key: 'item', label: 'Item', width: '24%' },
      { key: 'status', label: 'Status', width: '8%' },
      { key: 'qty', label: 'Qty', align: 'right', width: '6%' },
      { key: 'date', label: 'Review Date', width: '10%' },
      { key: 'year', label: 'Year', width: '6%' },
      { key: 'set', label: 'Set', width: '12%' },
      { key: 'itemNumber', label: 'Item #', width: '7%' },
      { key: 'cost', label: 'Cost', align: 'right', width: '8%' },
      { key: 'value', label: 'Value', align: 'right', width: '8%' },
      { key: 'reason', label: 'Reason / Notes', width: '17%' },
    ],
    rows,
    emptyMessage: 'No write-off or disposal records found for this report filter.',
  }
}

function buildSalesPrintConfig({
  sales,
  inventoryById,
  reportLabel,
  platformFilter,
  cogsMode = false,
}: {
  sales: SaleRow[]
  inventoryById: Map<string, SaleInventoryRow>
  reportLabel: string
  platformFilter: string
  cogsMode?: boolean
}): ReportConfig {
  const totalGrossSales = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.gross_sale ?? 0), 0)
  )
  const totalSellingCosts = roundMoney(
    sales.reduce(
      (sum, row) =>
        sum +
        Number(row.platform_fees ?? 0) +
        Number(row.shipping_cost ?? 0) +
        Number(row.other_costs ?? 0),
      0
    )
  )
  const totalNetProceeds = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.net_proceeds ?? 0), 0)
  )
  const totalCOGS = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.cost_of_goods_sold ?? 0), 0)
  )
  const totalProfit = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.profit ?? 0), 0)
  )

  const columns: PrintableReportColumn[] = [
    { key: 'number', label: '#', align: 'right', width: '4%' },
    { key: 'date', label: 'Date', width: '9%' },
    { key: 'item', label: 'Item', width: '25%' },
    { key: 'platform', label: 'Platform', width: '9%' },
    { key: 'gross', label: 'Gross', align: 'right', width: '8%' },
    { key: 'fees', label: 'Fees', align: 'right', width: '8%' },
    { key: 'ship', label: 'Ship', align: 'right', width: '8%' },
    { key: 'net', label: 'Net', align: 'right', width: '8%' },
    { key: 'cogs', label: 'COGS', align: 'right', width: '8%' },
    { key: 'profit', label: 'Profit', align: 'right', width: '8%' },
  ]

  const rows: PrintableReportRow[] = sales.map((sale, index) => {
    const inventoryItem = sale.inventory_item_id
      ? inventoryById.get(sale.inventory_item_id)
      : undefined

    return {
      number: index + 1,
      date: formatDateForPrint(sale.sale_date),
      item: buildSaleItemName(inventoryItem),
      platform: platformKey(sale.platform),
      gross: currency(Number(sale.gross_sale ?? 0)),
      fees: currency(Number(sale.platform_fees ?? 0)),
      ship: currency(Number(sale.shipping_cost ?? 0)),
      net: currency(Number(sale.net_proceeds ?? 0)),
      cogs: currency(Number(sale.cost_of_goods_sold ?? 0)),
      profit: currency(Number(sale.profit ?? 0)),
    }
  })

  return {
    title: cogsMode ? reportLabel.replace('Sales Report', 'Realized COGS Report') : reportLabel,
    subtitle: cogsMode
      ? 'Printable realized COGS report. Unsold inventory remains in ending inventory and is not deducted here.'
      : `Printable sales report. Platform filter: ${platformFilter || 'All platforms'}.`,
    summary: [
      { label: 'Sales count', value: sales.length },
      { label: 'Gross sales', value: currency(totalGrossSales) },
      { label: 'Selling costs', value: currency(totalSellingCosts) },
      { label: 'Net proceeds', value: currency(totalNetProceeds) },
      { label: 'Realized COGS', value: currency(totalCOGS) },
      { label: 'Profit', value: currency(totalProfit) },
    ],
    columns,
    rows,
    emptyMessage: 'No sales found for this report range.',
  }
}

function buildExpensesPrintConfig({
  expenses,
  reportLabel,
  categoryFilter,
}: {
  expenses: ExpenseRow[]
  reportLabel: string
  categoryFilter: string
}): ReportConfig {
  const totalExpenses = roundMoney(
    expenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0)
  )

  const columns: PrintableReportColumn[] = [
    { key: 'number', label: '#', align: 'right', width: '4%' },
    { key: 'date', label: 'Date', width: '10%' },
    { key: 'category', label: 'Category', width: '18%' },
    { key: 'scheduleCArea', label: 'Schedule C Area', width: '28%' },
    { key: 'vendor', label: 'Vendor', width: '17%' },
    { key: 'amount', label: 'Amount', align: 'right', width: '10%' },
    { key: 'notes', label: 'Notes', width: '13%' },
  ]

  const rows: PrintableReportRow[] = expenses.map((expense, index) => {
    const category =
      String(expense.category || 'Uncategorized').trim() || 'Uncategorized'

    return {
      number: index + 1,
      date: formatDateForPrint(expense.expense_date),
      category,
      scheduleCArea: getExpenseScheduleCArea(category),
      vendor: asString(expense.vendor),
      amount: currency(Number(expense.amount ?? 0)),
      notes: asString(expense.notes),
    }
  })

  return {
    title: reportLabel,
    subtitle: `Printable expenses report. Category filter: ${categoryFilter || 'All categories'}.`,
    summary: [
      { label: 'Expense count', value: expenses.length },
      { label: 'Total expenses', value: currency(totalExpenses) },
      { label: 'Category filter', value: categoryFilter || 'All categories' },
    ],
    columns,
    rows,
    emptyMessage: 'No manual expenses found for this report range.',
  }
}

function buildShippingPrintConfig({
  sales,
  reportLabel,
  platformFilter,
}: {
  sales: SaleRow[]
  reportLabel: string
  platformFilter: string
}): ReportConfig {
  const shipmentCount = sales.length
  const totalGrossSales = roundMoney(
    sales.reduce((sum, sale) => sum + Number(sale.gross_sale ?? 0), 0)
  )
  const totalPostage = roundMoney(
    sales.reduce((sum, sale) => sum + Number(sale.shipping_cost ?? 0), 0)
  )
  const totalSupplies = roundMoney(
    sales.reduce((sum, sale) => sum + Number(sale.other_costs ?? 0), 0)
  )
  const totalShippingExpense = roundMoney(totalPostage + totalSupplies)
  const averageShippingExpense = shipmentCount > 0 ? roundMoney(totalShippingExpense / shipmentCount) : 0

  const platformSummary = Array.from(
    sales.reduce((map, sale) => {
      const platform = platformKey(sale.platform)
      const current = map.get(platform) ?? {
        count: 0,
        gross: 0,
        postage: 0,
        supplies: 0,
        profit: 0,
      }

      map.set(platform, {
        count: current.count + 1,
        gross: current.gross + Number(sale.gross_sale ?? 0),
        postage: current.postage + Number(sale.shipping_cost ?? 0),
        supplies: current.supplies + Number(sale.other_costs ?? 0),
        profit: current.profit + Number(sale.profit ?? 0),
      })

      return map
    }, new Map<string, { count: number; gross: number; postage: number; supplies: number; profit: number }>()),
  ).sort(([a], [b]) => a.localeCompare(b))

  const rows: PrintableReportRow[] = platformSummary.map(([platform, values], index) => {
    const totalCost = roundMoney(values.postage + values.supplies)
    const averageCost = values.count > 0 ? roundMoney(totalCost / values.count) : 0

    return {
      number: index + 1,
      platform,
      shipments: values.count,
      gross: currency(roundMoney(values.gross)),
      postage: currency(roundMoney(values.postage)),
      supplies: currency(roundMoney(values.supplies)),
      totalCost: currency(totalCost),
      averageCost: currency(averageCost),
      profit: currency(roundMoney(values.profit)),
    }
  })

  return {
    title: reportLabel,
    subtitle:
      `Printable shipping report. Platform filter: ${platformFilter || 'All platforms'}. Shipping charged is not stored separately yet, so this report uses postage/shipping cost plus other selling costs as the tracked shipping/supplies side.`,
    summary: [
      { label: 'Shipments / sales', value: shipmentCount },
      { label: 'Gross sales', value: currency(totalGrossSales) },
      { label: 'Postage / shipping cost', value: currency(totalPostage) },
      { label: 'Supplies / other costs', value: currency(totalSupplies) },
      { label: 'Tracked shipping expense', value: currency(totalShippingExpense) },
      { label: 'Avg. tracked cost', value: currency(averageShippingExpense) },
    ],
    columns: [
      { key: 'number', label: '#', align: 'right', width: '4%' },
      { key: 'platform', label: 'Platform', width: '18%' },
      { key: 'shipments', label: 'Shipments', align: 'right', width: '10%' },
      { key: 'gross', label: 'Gross', align: 'right', width: '11%' },
      { key: 'postage', label: 'Postage', align: 'right', width: '11%' },
      { key: 'supplies', label: 'Supplies', align: 'right', width: '11%' },
      { key: 'totalCost', label: 'Ship Cost', align: 'right', width: '11%' },
      { key: 'averageCost', label: 'Avg Cost', align: 'right', width: '11%' },
      { key: 'profit', label: 'Profit', align: 'right', width: '13%' },
    ],
    rows,
    emptyMessage: 'No shipping records found for this report range.',
  }
}

function buildSalesTaxPrintConfig({
  sales,
  reportLabel,
  platformFilter,
  responsibilityFilter,
  channelFilter,
  taxStateFilter,
}: {
  sales: SaleRow[]
  reportLabel: string
  platformFilter: string
  responsibilityFilter: string
  channelFilter: string
  taxStateFilter: string
}): ReportConfig {
  const totalGrossSales = roundMoney(
    sales.reduce((sum, sale) => sum + asNumber(sale.gross_sale), 0)
  )
  const totalNetProceeds = roundMoney(
    sales.reduce((sum, sale) => sum + asNumber(sale.net_proceeds), 0)
  )
  const totalSalesTaxCollected = roundMoney(
    sales.reduce((sum, sale) => sum + asNumber(sale.sales_tax_collected), 0)
  )
  const marketplaceHandledTax = roundMoney(
    sales
      .filter(
        (sale) =>
          normalizeSalesTaxResponsibility(sale.sales_tax_responsibility) ===
          'marketplace_collected'
      )
      .reduce((sum, sale) => sum + asNumber(sale.sales_tax_collected), 0)
  )
  const sellerReviewTax = roundMoney(
    sales
      .filter(
        (sale) =>
          normalizeSalesTaxResponsibility(sale.sales_tax_responsibility) ===
          'seller_collected'
      )
      .reduce((sum, sale) => sum + asNumber(sale.sales_tax_collected), 0)
  )
  const noTaxCount = sales.filter(
    (sale) =>
      normalizeSalesTaxResponsibility(sale.sales_tax_responsibility) ===
      'not_collected'
  ).length
  const exemptCount = sales.filter(
    (sale) =>
      normalizeSalesTaxResponsibility(sale.sales_tax_responsibility) ===
      'exempt_or_not_taxable'
  ).length

  const rows: PrintableReportRow[] = sales.map((sale, index) => ({
    number: index + 1,
    date: formatDateForPrint(sale.sale_date),
    platform: platformKey(sale.platform),
    channel: formatSalesChannelType(sale.sales_channel_type),
    responsibility: formatSalesTaxResponsibility(sale.sales_tax_responsibility),
    state: asString(sale.tax_state) || '—',
    tax: currency(asNumber(sale.sales_tax_collected)),
    gross: currency(asNumber(sale.gross_sale)),
    net: currency(asNumber(sale.net_proceeds)),
    notes: asString(sale.tax_notes || sale.notes),
  }))

  return {
    title: reportLabel,
    subtitle:
      `Printable sales tax report. Platform: ${platformFilter || 'All platforms'}. Responsibility: ${responsibilityFilter || 'All'}. Channel: ${channelFilter || 'All'}. State: ${taxStateFilter || 'All'}. Marketplace handled tax is separated from seller-collected tax that may need remittance review.`,
    summary: [
      { label: 'Sales count', value: sales.length },
      { label: 'Gross sales', value: currency(totalGrossSales) },
      { label: 'Total sales tax', value: currency(totalSalesTaxCollected) },
      { label: 'Marketplace handled', value: currency(marketplaceHandledTax) },
      { label: 'Seller review / possible remit', value: currency(sellerReviewTax) },
      { label: 'No tax collected', value: noTaxCount },
      { label: 'Exempt / not taxable', value: exemptCount },
      { label: 'Net proceeds', value: currency(totalNetProceeds) },
    ],
    columns: [
      { key: 'number', label: '#', align: 'right', width: '4%' },
      { key: 'date', label: 'Date', width: '8%' },
      { key: 'platform', label: 'Platform', width: '11%' },
      { key: 'channel', label: 'Channel', width: '11%' },
      { key: 'responsibility', label: 'Responsibility', width: '13%' },
      { key: 'state', label: 'State', width: '5%' },
      { key: 'tax', label: 'Tax', align: 'right', width: '8%' },
      { key: 'gross', label: 'Gross', align: 'right', width: '9%' },
      { key: 'net', label: 'Net', align: 'right', width: '9%' },
      { key: 'notes', label: 'Notes', width: '22%' },
    ],
    rows,
    emptyMessage: 'No sales tax records found for this report range.',
  }
}

function buildFinancialPrintConfig({
  reportLabel,
  sales,
  expenses,
  breaks,
  inventoryItems,
  taxSettings,
  cpaMode = false,
}: {
  reportLabel: string
  sales: SaleRow[]
  expenses: ExpenseRow[]
  breaks: BreakRow[]
  inventoryItems: InventoryItemRow[]
  taxSettings: TaxYearSettingsRow | null
  cpaMode?: boolean
}): ReportConfig {
  const totalGrossSales = roundMoney(
    sales.reduce((sum, sale) => sum + Number(sale.gross_sale ?? 0), 0)
  )
  const totalPlatformFees = roundMoney(
    sales.reduce((sum, sale) => sum + Number(sale.platform_fees ?? 0), 0)
  )
  const totalShippingCosts = roundMoney(
    sales.reduce((sum, sale) => sum + Number(sale.shipping_cost ?? 0), 0)
  )
  const totalOtherCosts = roundMoney(
    sales.reduce((sum, sale) => sum + Number(sale.other_costs ?? 0), 0)
  )
  const totalSellingCosts = roundMoney(totalPlatformFees + totalShippingCosts + totalOtherCosts)
  const totalNetProceeds = roundMoney(
    sales.reduce((sum, sale) => sum + Number(sale.net_proceeds ?? 0), 0)
  )
  const totalCOGS = roundMoney(
    sales.reduce((sum, sale) => sum + Number(sale.cost_of_goods_sold ?? 0), 0)
  )
  const totalProfit = roundMoney(
    sales.reduce((sum, sale) => sum + Number(sale.profit ?? 0), 0)
  )
  const totalExpenses = roundMoney(
    expenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0)
  )
  const totalBreakPurchases = roundMoney(
    breaks.reduce((sum, row) => sum + Number(row.total_cost ?? 0), 0)
  )
  const beginningInventory = roundMoney(Number(taxSettings?.beginning_inventory ?? 0))
  const endingInventory = roundMoney(
    inventoryItems
      .filter((item) => normalizeStatus(item.status).toLowerCase() !== 'sold')
      .filter((item) => normalizeStatus(item.status).toLowerCase() !== 'disposed')
      .reduce((sum, item) => sum + getItemCost(item), 0)
  )
  const scheduleCExtra = roundMoney(
    Number(taxSettings?.business_use_of_home ?? 0) +
      Number(taxSettings?.vehicle_expense ?? 0) +
      Number(taxSettings?.depreciation_expense ?? 0) +
      Number(taxSettings?.legal_professional ?? 0) +
      Number(taxSettings?.insurance ?? 0) +
      Number(taxSettings?.utilities ?? 0) +
      Number(taxSettings?.taxes_licenses ?? 0) +
      Number(taxSettings?.repairs_maintenance ?? 0)
  )
  const netAfterTrackedExpenses = roundMoney(
    totalGrossSales - totalCOGS - totalSellingCosts - totalExpenses - scheduleCExtra
  )

  const rows: PrintableReportRow[] = [
    { section: 'Sales', metric: 'Gross sales / receipts', amount: currency(totalGrossSales), notes: 'Completed, non-reversed sales.' },
    { section: 'Sales', metric: 'Net proceeds', amount: currency(totalNetProceeds), notes: 'After platform/selling costs as recorded.' },
    { section: 'COGS', metric: 'Realized COGS', amount: currency(totalCOGS), notes: 'Sold item cost basis.' },
    { section: 'Selling costs', metric: 'Platform fees', amount: currency(totalPlatformFees), notes: 'Marketplace/platform fees from sales.' },
    { section: 'Selling costs', metric: 'Shipping/postage costs', amount: currency(totalShippingCosts), notes: 'Shipping cost field from sales.' },
    { section: 'Selling costs', metric: 'Other selling/supplies costs', amount: currency(totalOtherCosts), notes: 'Other cost field from sales.' },
    { section: 'Expenses', metric: 'Manual expenses', amount: currency(totalExpenses), notes: 'Expenses table records.' },
    { section: 'Purchases', metric: 'Break purchases', amount: currency(totalBreakPurchases), notes: 'Break/acquisition records.' },
    { section: 'Inventory', metric: 'Beginning inventory', amount: currency(beginningInventory), notes: 'Tax year settings.' },
    { section: 'Inventory', metric: 'Ending inventory cost', amount: currency(endingInventory), notes: taxSettings?.ending_inventory_snapshot != null ? 'Tax settings snapshot exists.' : 'Live inventory cost basis.' },
    { section: 'Schedule C', metric: 'Extra Schedule C settings', amount: currency(scheduleCExtra), notes: 'Home office, vehicle, depreciation, insurance, utilities, licenses, repairs, professional fees.' },
    { section: 'Profit', metric: 'Tracked profit from sales', amount: currency(totalProfit), notes: 'Sales profit field.' },
    { section: 'Profit', metric: 'Net after tracked expenses', amount: currency(netAfterTrackedExpenses), notes: 'Gross sales - COGS - selling costs - expenses - extra Schedule C settings.' },
  ]

  return {
    title: cpaMode ? reportLabel : `Financial Report - ${reportLabel}`,
    subtitle: cpaMode
      ? 'Printable CPA packet summary. Use the CPA PDF/CSV packet for full accountant backup details.'
      : 'Printable financial summary for sales, COGS, expenses, purchases, inventory, and Schedule C support.',
    summary: [
      { label: 'Gross sales', value: currency(totalGrossSales) },
      { label: 'Realized COGS', value: currency(totalCOGS) },
      { label: 'Selling costs', value: currency(totalSellingCosts) },
      { label: 'Manual expenses', value: currency(totalExpenses) },
      { label: 'Ending inventory', value: currency(endingInventory) },
      { label: 'Net after tracked expenses', value: currency(netAfterTrackedExpenses) },
    ],
    columns: [
      { key: 'section', label: 'Section', width: '14%' },
      { key: 'metric', label: 'Metric', width: '30%' },
      { key: 'amount', label: 'Amount', align: 'right', width: '14%' },
      { key: 'notes', label: 'Notes', width: '42%' },
    ],
    rows,
    emptyMessage: 'No financial rows found for this report range.',
  }
}

function buildProfitLossPrintConfig({
  reportLabel,
  sales,
  expenses,
}: {
  reportLabel: string
  sales: SaleRow[]
  expenses: ExpenseRow[]
}): ReportConfig {
  const grossSales = roundMoney(
    sales.reduce((sum, sale) => sum + asNumber(sale.gross_sale), 0)
  )
  const platformFees = roundMoney(
    sales.reduce((sum, sale) => sum + asNumber(sale.platform_fees), 0)
  )
  const shippingCosts = roundMoney(
    sales.reduce((sum, sale) => sum + asNumber(sale.shipping_cost), 0)
  )
  const otherSellingCosts = roundMoney(
    sales.reduce((sum, sale) => sum + asNumber(sale.other_costs), 0)
  )
  const sellingCosts = roundMoney(platformFees + shippingCosts + otherSellingCosts)
  const cogs = roundMoney(
    sales.reduce((sum, sale) => sum + asNumber(sale.cost_of_goods_sold), 0)
  )
  const manualExpenses = roundMoney(
    expenses.reduce((sum, expense) => sum + asNumber(expense.amount), 0)
  )
  const grossProfit = roundMoney(grossSales - cogs)
  const netProfit = roundMoney(grossProfit - sellingCosts - manualExpenses)
  const netMargin = grossSales > 0 ? roundMoney((netProfit / grossSales) * 100) : 0

  const expenseCategoryRows: PrintableReportRow[] = Array.from(
    expenses.reduce((map, expense) => {
      const category =
        String(expense.category || 'Uncategorized').trim() || 'Uncategorized'
      const current = map.get(category) ?? { count: 0, amount: 0 }

      map.set(category, {
        count: current.count + 1,
        amount: current.amount + asNumber(expense.amount),
      })

      return map
    }, new Map<string, { count: number; amount: number }>())
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, values]) => ({
      section: 'Expense Detail',
      line: category,
      amount: currency(roundMoney(-values.amount)),
      notes: `${values.count} expense record(s). Schedule C area: ${getExpenseScheduleCArea(category)}.`,
    }))

  const rows: PrintableReportRow[] = [
    {
      section: 'Income',
      line: 'Gross sales / receipts',
      amount: currency(grossSales),
      notes: 'Completed, non-reversed sales in the selected range.',
    },
    {
      section: 'COGS',
      line: 'Cost of goods sold',
      amount: currency(-cogs),
      notes: 'Realized cost basis from sold items only.',
    },
    {
      section: 'Gross Profit',
      line: 'Gross profit after COGS',
      amount: currency(grossProfit),
      notes: 'Gross sales minus realized COGS.',
    },
    {
      section: 'Selling Costs',
      line: 'Platform fees',
      amount: currency(-platformFees),
      notes: 'Marketplace/platform fee fields from sales records.',
    },
    {
      section: 'Selling Costs',
      line: 'Shipping / postage costs',
      amount: currency(-shippingCosts),
      notes: 'Sale-level shipping_cost values.',
    },
    {
      section: 'Selling Costs',
      line: 'Other direct selling costs',
      amount: currency(-otherSellingCosts),
      notes: 'Sale-level other_costs values, commonly supplies/packing costs.',
    },
    {
      section: 'Expenses',
      line: 'Manual expenses',
      amount: currency(-manualExpenses),
      notes: 'Expense tracker entries in the selected range.',
    },
    ...expenseCategoryRows,
    {
      section: 'Net Profit',
      line: 'Net profit / loss',
      amount: currency(netProfit),
      notes: 'Gross profit minus selling costs and manual expenses.',
    },
  ]

  return {
    title: `Profit & Loss Statement - ${reportLabel}`,
    subtitle:
      'Printable read-only Profit & Loss statement. This separates gross sales, realized COGS, selling costs, manual expenses, and net profit/loss for business review and CPA support.',
    summary: [
      { label: 'Gross sales', value: currency(grossSales) },
      { label: 'Realized COGS', value: currency(cogs) },
      { label: 'Gross profit', value: currency(grossProfit) },
      { label: 'Selling costs', value: currency(sellingCosts) },
      { label: 'Manual expenses', value: currency(manualExpenses) },
      { label: 'Net profit / loss', value: currency(netProfit) },
      { label: 'Sales records', value: sales.length },
      { label: 'Expense records', value: expenses.length },
      { label: 'Net margin', value: `${netMargin.toFixed(1)}%` },
    ],
    columns: [
      { key: 'section', label: 'Section', width: '16%' },
      { key: 'line', label: 'Line', width: '30%' },
      { key: 'amount', label: 'Amount', align: 'right', width: '14%' },
      { key: 'notes', label: 'Notes', width: '40%' },
    ],
    rows,
    emptyMessage: 'No profit and loss rows found for this report range.',
  }
}

function getInventoryBreakId(item: InventoryItemRow) {
  const row = item as Record<string, unknown>

  return (
    asString(row.break_id) ||
    asString(row.source_break_id) ||
    asString(row.order_id)
  )
}

function getRemainingQuantity(item: InventoryItemRow) {
  const status = normalizeStatus(item.status).toLowerCase()
  const availableQuantity = asNumber(item.available_quantity)
  const quantity = asNumber(item.quantity)

  if (availableQuantity > 0) return availableQuantity
  if (quantity > 0 && status !== 'sold' && status !== 'disposed') return quantity

  return 0
}

function buildBreakProfitabilityPrintConfig({
  breaks,
  inventoryItems,
  sales,
  reportLabel,
  sourceFilter,
  statusFilter,
  profitabilityFilter,
  search,
}: {
  breaks: BreakRow[]
  inventoryItems: InventoryItemRow[]
  sales: SaleRow[]
  reportLabel: string
  sourceFilter: string
  statusFilter: string
  profitabilityFilter: string
  search: string
}): ReportConfig {
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

  const computedRows = breaks.map((breakRow) => {
    const linkedItems = inventoryByBreakId.get(breakRow.id) ?? []
    const linkedSales = linkedItems.flatMap((item) => salesByInventoryId.get(item.id) ?? [])
    const breakCost = roundMoney(asNumber(breakRow.total_cost))
    const netProceeds = roundMoney(linkedSales.reduce((sum, sale) => sum + asNumber(sale.net_proceeds), 0))
    const realizedProfit = roundMoney(linkedSales.reduce((sum, sale) => sum + asNumber(sale.profit), 0))

    const soldItemIds = new Set(
      linkedSales
        .map((sale) => sale.inventory_item_id)
        .filter((id): id is string => Boolean(id))
    )

    const remainingItems = linkedItems.filter((item) => {
      const status = normalizeStatus(item.status).toLowerCase()
      return status !== 'sold' && status !== 'disposed' && getRemainingQuantity(item) > 0
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

    let suggestedAction = 'Completed break review'
    if (linkedItems.length === 0) suggestedAction = 'No inventory linked'
    else if (soldItemIds.size === 0 && remainingItems.length > 0) suggestedAction = 'No sales yet'
    else if (projectedProfitLoss < 0 && remainingItems.length > 0) suggestedAction = 'Reprice / sell remaining'
    else if (projectedProfitLoss < 0) suggestedAction = 'Loss review'
    else if (remainingItems.length > 0 && realizedProfit > 0) suggestedAction = 'Profit locked / review remaining'
    else if (remainingItems.length > 0) suggestedAction = 'Monitor remaining inventory'

    return {
      id: breakRow.id,
      breakDate: breakRow.break_date || '',
      source: breakRow.source_name || 'Unknown source',
      product: breakRow.product_name || breakRow.order_number || 'Untitled break',
      orderNumber: breakRow.order_number || '',
      breakCost,
      itemCount: linkedItems.length,
      soldItemCount: soldItemIds.size,
      remainingItemCount: remainingItems.length,
      netProceeds,
      realizedProfit,
      remainingCostBasis,
      remainingEstimatedValue,
      projectedTotalValue,
      projectedProfitLoss,
      roiPercent,
      suggestedAction,
    }
  })

  const filteredRows = computedRows.filter((row) => {
    if (sourceFilter !== 'all' && row.source !== sourceFilter) return false
    if (statusFilter === 'open' && row.remainingItemCount <= 0) return false
    if (statusFilter === 'profitable' && row.projectedProfitLoss <= 0) return false
    if (statusFilter === 'loss' && row.projectedProfitLoss >= 0) return false
    if (statusFilter === 'unsold' && row.soldItemCount !== 0) return false
    if (statusFilter === 'partial' && !(row.soldItemCount > 0 && row.remainingItemCount > 0)) return false
    if (statusFilter === 'complete' && !(row.remainingItemCount <= 0 && row.itemCount > 0)) return false
    if (profitabilityFilter === 'green' && row.projectedProfitLoss <= 0) return false
    if (profitabilityFilter === 'red' && row.projectedProfitLoss >= 0) return false
    if (profitabilityFilter === 'unrealized' && row.remainingItemCount <= row.soldItemCount) return false
    if (
      profitabilityFilter === 'needs-review' &&
      !(row.itemCount === 0 || row.projectedProfitLoss < 0 || row.soldItemCount === 0)
    ) return false

    if (search) {
      const haystack = [
        row.breakDate,
        row.source,
        row.product,
        row.orderNumber,
        row.suggestedAction,
      ]
        .map(asString)
        .join(' ')
        .toLowerCase()

      if (!haystack.includes(search.toLowerCase())) return false
    }

    return true
  })

  const totalBreakCost = roundMoney(filteredRows.reduce((sum, row) => sum + row.breakCost, 0))
  const totalNetProceeds = roundMoney(filteredRows.reduce((sum, row) => sum + row.netProceeds, 0))
  const totalRealizedProfit = roundMoney(filteredRows.reduce((sum, row) => sum + row.realizedProfit, 0))
  const totalRemainingBasis = roundMoney(filteredRows.reduce((sum, row) => sum + row.remainingCostBasis, 0))
  const totalRemainingValue = roundMoney(filteredRows.reduce((sum, row) => sum + row.remainingEstimatedValue, 0))
  const totalProjectedProfitLoss = roundMoney(filteredRows.reduce((sum, row) => sum + row.projectedProfitLoss, 0))
  const lossBreakCount = filteredRows.filter((row) => row.projectedProfitLoss < 0).length

  const rows: PrintableReportRow[] = filteredRows.map((row, index) => ({
    number: index + 1,
    date: formatDateForPrint(row.breakDate),
    source: row.source,
    product: row.product,
    cost: currency(row.breakCost),
    items: `${row.soldItemCount}/${row.itemCount}`,
    remaining: row.remainingItemCount,
    net: currency(row.netProceeds),
    realized: currency(row.realizedProfit),
    basis: currency(row.remainingCostBasis),
    value: currency(row.remainingEstimatedValue),
    projected: currency(row.projectedProfitLoss),
    roi: row.roiPercent === null ? '' : `${(row.roiPercent * 100).toFixed(1)}%`,
  }))

  return {
    title: `Break Profitability Report - ${reportLabel}`,
    subtitle:
      `Printable break profitability report. Source: ${sourceFilter || 'all'}. Status: ${statusFilter || 'all'}. Profitability: ${profitabilityFilter || 'all'}. Unsold linked items remain inventory until sold, disposed, given away with documentation, or otherwise finalized.`,
    summary: [
      { label: 'Breaks', value: filteredRows.length },
      { label: 'Break cost', value: currency(totalBreakCost) },
      { label: 'Net proceeds', value: currency(totalNetProceeds) },
      { label: 'Realized profit', value: currency(totalRealizedProfit) },
      { label: 'Remaining basis', value: currency(totalRemainingBasis) },
      { label: 'Remaining value', value: currency(totalRemainingValue) },
      { label: 'Projected P/L', value: currency(totalProjectedProfitLoss) },
      { label: 'Loss breaks', value: lossBreakCount },
    ],
    columns: [
      { key: 'number', label: '#', align: 'right', width: '4%' },
      { key: 'date', label: 'Date', width: '8%' },
      { key: 'source', label: 'Source', width: '11%' },
      { key: 'product', label: 'Break', width: '18%' },
      { key: 'cost', label: 'Cost', align: 'right', width: '8%' },
      { key: 'items', label: 'Items', align: 'right', width: '6%' },
      { key: 'remaining', label: 'Remain', align: 'right', width: '7%' },
      { key: 'net', label: 'Net', align: 'right', width: '8%' },
      { key: 'realized', label: 'Realized', align: 'right', width: '8%' },
      { key: 'basis', label: 'Basis', align: 'right', width: '8%' },
      { key: 'value', label: 'Value', align: 'right', width: '8%' },
      { key: 'projected', label: 'Proj P/L', align: 'right', width: '8%' },
    ],
    rows,
    emptyMessage: 'No breaks matched this profitability report filter.',
  }
}

function buildPlatformProfitabilityPrintConfig({
  sales,
  reportLabel,
  platformFilter,
}: {
  sales: SaleRow[]
  reportLabel: string
  platformFilter: string
}): ReportConfig {
  const totalGrossSales = roundMoney(sales.reduce((sum, sale) => sum + asNumber(sale.gross_sale), 0))
  const totalProfit = roundMoney(sales.reduce((sum, sale) => sum + asNumber(sale.profit), 0))

  const rows: PrintableReportRow[] = Array.from(
    sales.reduce((map, sale) => {
      const platform = platformKey(sale.platform)
      const current = map.get(platform) ?? {
        count: 0,
        gross: 0,
        fees: 0,
        shipping: 0,
        other: 0,
        net: 0,
        cogs: 0,
        profit: 0,
      }

      map.set(platform, {
        count: current.count + 1,
        gross: current.gross + asNumber(sale.gross_sale),
        fees: current.fees + asNumber(sale.platform_fees),
        shipping: current.shipping + asNumber(sale.shipping_cost),
        other: current.other + asNumber(sale.other_costs),
        net: current.net + asNumber(sale.net_proceeds),
        cogs: current.cogs + asNumber(sale.cost_of_goods_sold),
        profit: current.profit + asNumber(sale.profit),
      })

      return map
    }, new Map<string, { count: number; gross: number; fees: number; shipping: number; other: number; net: number; cogs: number; profit: number }>())
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([platform, values], index) => ({
      number: index + 1,
      platform,
      sales: values.count,
      gross: currency(roundMoney(values.gross)),
      fees: currency(roundMoney(values.fees)),
      shipping: currency(roundMoney(values.shipping)),
      other: currency(roundMoney(values.other)),
      net: currency(roundMoney(values.net)),
      cogs: currency(roundMoney(values.cogs)),
      profit: currency(roundMoney(values.profit)),
    }))

  return {
    title: `Platform Profitability Report - ${reportLabel}`,
    subtitle: `Printable platform profitability report. Platform filter: ${platformFilter || 'All platforms'}.`,
    summary: [
      { label: 'Sales count', value: sales.length },
      { label: 'Gross sales', value: currency(totalGrossSales) },
      { label: 'Platform fees', value: currency(roundMoney(sales.reduce((sum, sale) => sum + asNumber(sale.platform_fees), 0))) },
      { label: 'Shipping / other', value: currency(roundMoney(sales.reduce((sum, sale) => sum + asNumber(sale.shipping_cost) + asNumber(sale.other_costs), 0))) },
      { label: 'COGS', value: currency(roundMoney(sales.reduce((sum, sale) => sum + asNumber(sale.cost_of_goods_sold), 0))) },
      { label: 'Profit', value: currency(totalProfit) },
    ],
    columns: [
      { key: 'number', label: '#', align: 'right', width: '4%' },
      { key: 'platform', label: 'Platform', width: '17%' },
      { key: 'sales', label: 'Sales', align: 'right', width: '7%' },
      { key: 'gross', label: 'Gross', align: 'right', width: '10%' },
      { key: 'fees', label: 'Fees', align: 'right', width: '9%' },
      { key: 'shipping', label: 'Ship', align: 'right', width: '9%' },
      { key: 'other', label: 'Other', align: 'right', width: '9%' },
      { key: 'net', label: 'Net', align: 'right', width: '10%' },
      { key: 'cogs', label: 'COGS', align: 'right', width: '10%' },
      { key: 'profit', label: 'Profit', align: 'right', width: '10%' },
    ],
    rows,
    emptyMessage: 'No platform profitability records found for this report range.',
  }
}

function buildOperationsPrintConfig({
  reportLabel,
  sales,
  expenses,
  breaks,
  inventoryItems,
}: {
  reportLabel: string
  sales: SaleRow[]
  expenses: ExpenseRow[]
  breaks: BreakRow[]
  inventoryItems: InventoryItemRow[]
}): ReportConfig {
  const openInventory = inventoryItems.filter((item) => {
    const status = normalizeStatus(item.status).toLowerCase()
    return status !== 'sold' && status !== 'disposed' && status !== 'archived'
  })

  const totalGrossSales = roundMoney(sales.reduce((sum, sale) => sum + asNumber(sale.gross_sale), 0))
  const totalProfit = roundMoney(sales.reduce((sum, sale) => sum + asNumber(sale.profit), 0))
  const totalExpenses = roundMoney(expenses.reduce((sum, expense) => sum + asNumber(expense.amount), 0))
  const totalBreakCost = roundMoney(breaks.reduce((sum, row) => sum + asNumber(row.total_cost), 0))
  const openInventoryCost = roundMoney(openInventory.reduce((sum, item) => sum + getItemCost(item), 0))

  const rows: PrintableReportRow[] = [
    { section: 'Sales', metric: 'Completed sales', count: sales.length, amount: currency(totalGrossSales), notes: 'Gross sales in selected range.' },
    { section: 'Sales', metric: 'Profit', count: sales.length, amount: currency(totalProfit), notes: 'Profit from completed non-reversed sales.' },
    { section: 'Expenses', metric: 'Manual expenses', count: expenses.length, amount: currency(totalExpenses), notes: 'Expenses in selected range.' },
    { section: 'Purchases', metric: 'Break purchases', count: breaks.length, amount: currency(totalBreakCost), notes: 'Break/acquisition records in selected range.' },
    { section: 'Inventory', metric: 'Open inventory', count: openInventory.length, amount: currency(openInventoryCost), notes: 'Current non-sold inventory cost basis.' },
  ]

  return {
    title: `Operations Report - ${reportLabel}`,
    subtitle: 'Printable operations report. Read-only workflow overview for daily business review.',
    summary: [
      { label: 'Sales', value: sales.length },
      { label: 'Breaks', value: breaks.length },
      { label: 'Expenses', value: expenses.length },
      { label: 'Open inventory', value: openInventory.length },
      { label: 'Gross sales', value: currency(totalGrossSales) },
      { label: 'Profit', value: currency(totalProfit) },
      { label: 'Expenses total', value: currency(totalExpenses) },
      { label: 'Open cost basis', value: currency(openInventoryCost) },
    ],
    columns: [
      { key: 'section', label: 'Section', width: '14%' },
      { key: 'metric', label: 'Metric', width: '28%' },
      { key: 'count', label: 'Count', align: 'right', width: '10%' },
      { key: 'amount', label: 'Amount', align: 'right', width: '14%' },
      { key: 'notes', label: 'Notes', width: '34%' },
    ],
    rows,
    emptyMessage: 'No operations records found for this report range.',
  }
}

async function loadSalesForPrint({
  supabase,
  userId,
  startDate,
  endDate,
  platform,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  startDate: string
  endDate: string
  platform: string
}) {
  let salesQuery = supabase
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
      inventory_item_id,
      sales_tax_collected,
      sales_tax_responsibility,
      sales_channel_type,
      tax_state,
      tax_notes
    `)
    .eq('user_id', userId)
    .is('reversed_at', null)
    .gte('sale_date', startDate)
    .lte('sale_date', endDate)
    .order('sale_date', { ascending: false })

  if (platform) {
    salesQuery = salesQuery.ilike('platform', `%${platform}%`)
  }

  return salesQuery
}

async function loadInventoryMapForSales({
  supabase,
  userId,
  sales,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  sales: SaleRow[]
}) {
  const inventoryIds = Array.from(
    new Set(
      sales
        .map((sale) => sale.inventory_item_id)
        .filter((id): id is string => Boolean(id))
    )
  )

  const inventoryRes =
    inventoryIds.length > 0
      ? await supabase
          .from('inventory_items')
          .select('id, title, player_name, year, set_name, card_number, notes, status')
          .eq('user_id', userId)
          .in('id', inventoryIds)
      : { data: [], error: null }

  if (inventoryRes.error) {
    throw new Error(inventoryRes.error.message)
  }

  const inventoryItems = (inventoryRes.data ?? []) as SaleInventoryRow[]
  return new Map(inventoryItems.map((item) => [item.id, item]))
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { reportType } = await context.params

    if (reportType === 'tax') {
      return jsonError('Tax print routes use their existing dedicated tax reporting pages.', 400)
    }

    const reportName = REPORT_LABELS[reportType]

    if (!reportName) {
      return jsonError('Unsupported report type.', 404)
    }

    const searchParams = request.nextUrl.searchParams
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return unauthorizedError()
    }

    if (reportType === 'sales' || reportType === 'cogs' || reportType === 'sales-tax' || reportType === 'shipping') {
      const selectedPlatformRaw = String(searchParams.get('platform') || '').trim()
      const selectedPlatform =
        selectedPlatformRaw && selectedPlatformRaw !== 'all' ? selectedPlatformRaw : ''
      const selectedResponsibility = String(searchParams.get('responsibility') || '').trim()
      const selectedChannel = String(searchParams.get('channel') || '').trim()
      const selectedTaxState = String(searchParams.get('taxState') || '')
        .trim()
        .toUpperCase()
      const search = String(searchParams.get('q') || '').trim()
      const labelPrefix =
        reportType === 'cogs'
          ? 'Realized COGS Report'
          : reportType === 'sales-tax'
            ? 'Sales Tax Report'
            : reportType === 'shipping'
              ? 'Shipping Report'
              : 'Sales Report'

      const { startDate, endDate, label } = getSelectedRange(searchParams, labelPrefix)

      const salesRes = await loadSalesForPrint({
        supabase,
        userId: user.id,
        startDate,
        endDate,
        platform: selectedPlatform,
      })

      if (salesRes.error) {
        return jsonError(`Could not build ${labelPrefix.toLowerCase()} print view: ${salesRes.error.message}`)
      }

      const loadedSales = (salesRes.data ?? []) as SaleRow[]
      const sales =
        reportType === 'sales-tax'
          ? loadedSales.filter((sale) => {
              if (
                selectedResponsibility &&
                sale.sales_tax_responsibility !== selectedResponsibility
              ) {
                return false
              }

              if (selectedChannel && sale.sales_channel_type !== selectedChannel) {
                return false
              }

              if (selectedTaxState && sale.tax_state !== selectedTaxState) {
                return false
              }

              if (!search) return true

              const haystack = [
                sale.sale_date,
                sale.platform,
                sale.gross_sale,
                sale.net_proceeds,
                sale.sales_tax_collected,
                sale.sales_tax_responsibility,
                sale.sales_channel_type,
                sale.tax_state,
                sale.tax_notes,
                sale.notes,
              ]
                .map(asString)
                .join(' ')
                .toLowerCase()

              return haystack.includes(search.toLowerCase())
            })
          : loadedSales

      if (reportType === 'shipping') {
        const html = buildPrintableReportHtml(
          buildShippingPrintConfig({
            sales,
            reportLabel: label,
            platformFilter: selectedPlatform,
          })
        )

        return htmlResponse(withPrintScript(html))
      }

      if (reportType === 'sales-tax') {
        const html = buildPrintableReportHtml(
          buildSalesTaxPrintConfig({
            sales,
            reportLabel: label,
            platformFilter: selectedPlatform,
            responsibilityFilter: selectedResponsibility,
            channelFilter: selectedChannel,
            taxStateFilter: selectedTaxState,
          })
        )

        return htmlResponse(withPrintScript(html))
      }

      let inventoryById: Map<string, SaleInventoryRow>

      try {
        inventoryById = await loadInventoryMapForSales({
          supabase,
          userId: user.id,
          sales,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown inventory lookup error.'
        return jsonError(`Could not load inventory item details for sales print view: ${message}`)
      }

      const html = buildPrintableReportHtml(
        buildSalesPrintConfig({
          sales,
          inventoryById,
          reportLabel: label,
          platformFilter: selectedPlatform,
          cogsMode: reportType === 'cogs',
        })
      )

      return htmlResponse(withPrintScript(html))
    }

    if (reportType === 'expenses') {
      const selectedCategory = String(searchParams.get('category') || '').trim()
      const { startDate, endDate, label } = getSelectedRange(searchParams, 'Expenses Report')

      let expensesQuery = supabase
        .from('expenses')
        .select(`
          id,
          expense_date,
          category,
          vendor,
          amount,
          notes,
          created_at
        `)
        .eq('user_id', user.id)
        .gte('expense_date', startDate)
        .lte('expense_date', endDate)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (selectedCategory) {
        expensesQuery = expensesQuery.eq('category', selectedCategory)
      }

      const { data, error } = await expensesQuery

      if (error) {
        return jsonError(`Could not build expenses print view: ${error.message}`)
      }

      const expenses = (data ?? []) as ExpenseRow[]
      const html = buildPrintableReportHtml(
        buildExpensesPrintConfig({
          expenses,
          reportLabel: label,
          categoryFilter: selectedCategory,
        })
      )

      return htmlResponse(withPrintScript(html))
    }


    if (reportType === 'profit-loss') {
      const { startDate, endDate, label } = getSelectedRange(searchParams, 'Profit & Loss Statement')
      const search = String(searchParams.get('q') || '').trim()

      const [salesRes, expensesRes] = await Promise.all([
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
          .gte('sale_date', startDate)
          .lte('sale_date', endDate)
          .order('sale_date', { ascending: false }),

        supabase
          .from('expenses')
          .select('id, expense_date, category, vendor, amount, notes, created_at')
          .eq('user_id', user.id)
          .gte('expense_date', startDate)
          .lte('expense_date', endDate)
          .order('expense_date', { ascending: false })
          .order('created_at', { ascending: false }),
      ])

      if (salesRes.error) return jsonError(`Could not build Profit & Loss print view sales: ${salesRes.error.message}`)
      if (expensesRes.error) return jsonError(`Could not build Profit & Loss print view expenses: ${expensesRes.error.message}`)

      const sales = ((salesRes.data ?? []) as SaleRow[]).filter((sale) => {
        if (!search) return true

        const haystack = [
          sale.sale_date,
          sale.platform,
          sale.gross_sale,
          sale.platform_fees,
          sale.shipping_cost,
          sale.other_costs,
          sale.net_proceeds,
          sale.cost_of_goods_sold,
          sale.profit,
          sale.notes,
        ]
          .map(asString)
          .join(' ')
          .toLowerCase()

        return haystack.includes(search.toLowerCase())
      })

      const expenses = ((expensesRes.data ?? []) as ExpenseRow[]).filter((expense) => {
        if (!search) return true

        const haystack = [
          expense.expense_date,
          expense.category,
          expense.vendor,
          expense.amount,
          expense.notes,
        ]
          .map(asString)
          .join(' ')
          .toLowerCase()

        return haystack.includes(search.toLowerCase())
      })

      const html = buildPrintableReportHtml(
        buildProfitLossPrintConfig({
          reportLabel: label,
          sales,
          expenses,
        })
      )

      return htmlResponse(withPrintScript(html))
    }

    if (reportType === 'financial' || reportType === 'cpa-packet') {
      const selectedYear = clampYear(searchParams.get('year'))
      const { startDate, endDate, label } =
        reportType === 'cpa-packet'
          ? {
              startDate: `${selectedYear}-01-01`,
              endDate: `${selectedYear}-12-31`,
              label: `HITS™ CPA Export Packet ${selectedYear}`,
            }
          : getSelectedRange(searchParams, 'Financial Report')

      const [salesRes, expensesRes, breaksRes, inventoryRes, taxSettingsRes] = await Promise.all([
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
          .gte('sale_date', startDate)
          .lte('sale_date', endDate)
          .order('sale_date', { ascending: false }),

        supabase
          .from('expenses')
          .select('id, expense_date, category, vendor, amount, notes, created_at')
          .eq('user_id', user.id)
          .gte('expense_date', startDate)
          .lte('expense_date', endDate)
          .order('expense_date', { ascending: false })
          .order('created_at', { ascending: false }),

        supabase
          .from('breaks')
          .select('id, break_date, source_name, product_name, order_number, total_cost')
          .eq('user_id', user.id)
          .gte('break_date', startDate)
          .lte('break_date', endDate)
          .order('break_date', { ascending: false }),

        supabase
          .from('inventory_items')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),

        supabase
          .from('tax_year_settings')
          .select(`
            beginning_inventory,
            ending_inventory_snapshot,
            ending_inventory_locked_at,
            business_use_of_home,
            vehicle_expense,
            depreciation_expense,
            legal_professional,
            insurance,
            utilities,
            taxes_licenses,
            repairs_maintenance,
            notes
          `)
          .eq('user_id', user.id)
          .eq('tax_year', selectedYear)
          .maybeSingle(),
      ])

      if (salesRes.error) return jsonError(`Could not build ${reportName} print view sales: ${salesRes.error.message}`)
      if (expensesRes.error) return jsonError(`Could not build ${reportName} print view expenses: ${expensesRes.error.message}`)
      if (breaksRes.error) return jsonError(`Could not build ${reportName} print view purchases: ${breaksRes.error.message}`)
      if (inventoryRes.error) return jsonError(`Could not build ${reportName} print view inventory: ${inventoryRes.error.message}`)
      if (taxSettingsRes.error) return jsonError(`Could not build ${reportName} print view tax settings: ${taxSettingsRes.error.message}`)

      const html = buildPrintableReportHtml(
        buildFinancialPrintConfig({
          reportLabel: label,
          sales: (salesRes.data ?? []) as SaleRow[],
          expenses: (expensesRes.data ?? []) as ExpenseRow[],
          breaks: (breaksRes.data ?? []) as BreakRow[],
          inventoryItems: (inventoryRes.data ?? []) as InventoryItemRow[],
          taxSettings: (taxSettingsRes.data ?? null) as TaxYearSettingsRow | null,
          cpaMode: reportType === 'cpa-packet',
        })
      )

      return htmlResponse(withPrintScript(html))
    }


    if (reportType === 'open-lots') {
      const period = String(searchParams.get('period') || 'all').trim()
      const selectedStatus = String(searchParams.get('status') || 'open').trim()
      const staleDays = Math.max(Number(searchParams.get('staleDays') || '90'), 1)
      const search = String(searchParams.get('q') || '').trim()
      const startDate =
        String(
          searchParams.get('start') ||
            searchParams.get('startDate') ||
            searchParams.get('dateFrom') ||
            ''
        ).trim()
      const endDate =
        String(
          searchParams.get('end') ||
            searchParams.get('endDate') ||
            searchParams.get('dateTo') ||
            ''
        ).trim()

      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        return jsonError(`Could not build open lots print view: ${error.message}`)
      }

      const allInventoryItems = (data ?? []) as InventoryItemRow[]

      const openLotItems = allInventoryItems.filter((item) => {
        const status = normalizeStatus(item.status).toLowerCase()
        const quantity = asNumber(item.available_quantity ?? item.quantity ?? 1)

        if (quantity <= 0) return false
        if (['sold', 'disposed', 'archived'].includes(status)) return false

        if (
          selectedStatus !== 'all' &&
          selectedStatus !== 'open' &&
          status !== selectedStatus
        ) {
          return false
        }

        if (!matchesSearch(item, search)) return false
        if (!matchesDateRange(item, startDate, endDate)) return false

        return true
      })

      const label =
        startDate || endDate
          ? `${formatReportDate(startDate || 'Beginning')} to ${formatReportDate(endDate || 'Today')}`
          : period === 'all'
            ? 'All dates'
            : `${period.charAt(0).toUpperCase()}${period.slice(1)} view`

      const html = buildPrintableReportHtml(
        buildOpenLotsPrintConfig({
          items: openLotItems,
          reportLabel: label,
          statusFilter: selectedStatus,
          staleDays,
        })
      )

      return htmlResponse(withPrintScript(html))
    }



    if (reportType === 'write-offs') {
      const selectedStatus = String(searchParams.get('status') || 'all').trim()
      const search = String(searchParams.get('q') || '').trim()
      const { startDate, endDate, label } = getSelectedRange(searchParams, 'Write-Offs Report')

      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['disposed', 'junk'])
        .order('updated_at', { ascending: false })

      if (error) {
        return jsonError(`Could not build write-offs print view: ${error.message}`)
      }

      const allItems = (data ?? []) as InventoryItemRow[]

      const items = allItems.filter((item) => {
        const status = normalizeStatus(item.status).toLowerCase()

        if (selectedStatus !== 'all' && status !== selectedStatus.toLowerCase()) return false
        if (!matchesSearch(item, search)) return false
        if (!matchesWriteOffPrintDateRange(item, startDate, endDate)) return false

        return true
      })

      const html = buildPrintableReportHtml(
        buildWriteOffsPrintConfig({
          items,
          reportLabel: label,
          statusFilter: selectedStatus,
        })
      )

      return htmlResponse(withPrintScript(html))
    }

    if (reportType === 'break-profitability') {
      const selectedSource = String(searchParams.get('source') || 'all').trim()
      const selectedStatus = String(searchParams.get('status') || 'all').trim()
      const selectedProfitability = String(searchParams.get('profitability') || 'all').trim()
      const search = String(searchParams.get('q') || '').trim()
      const { startDate, endDate, label } = getSelectedRange(searchParams, 'Break Profitability Report')

      const [breaksRes, inventoryRes, salesRes] = await Promise.all([
        supabase
          .from('breaks')
          .select('id, break_date, source_name, product_name, order_number, total_cost')
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
          .is('reversed_at', null),
      ])

      if (breaksRes.error) return jsonError(`Could not build break profitability print view breaks: ${breaksRes.error.message}`)
      if (inventoryRes.error) return jsonError(`Could not build break profitability print view inventory: ${inventoryRes.error.message}`)
      if (salesRes.error) return jsonError(`Could not build break profitability print view sales: ${salesRes.error.message}`)

      const html = buildPrintableReportHtml(
        buildBreakProfitabilityPrintConfig({
          breaks: (breaksRes.data ?? []) as BreakRow[],
          inventoryItems: (inventoryRes.data ?? []) as InventoryItemRow[],
          sales: (salesRes.data ?? []) as SaleRow[],
          reportLabel: label,
          sourceFilter: selectedSource,
          statusFilter: selectedStatus,
          profitabilityFilter: selectedProfitability,
          search,
        })
      )

      return htmlResponse(withPrintScript(html))
    }

    if (reportType === 'platform-profitability' || reportType === 'marketplace-fees') {
      const selectedPlatformRaw = String(searchParams.get('platform') || '').trim()
      const selectedPlatform =
        selectedPlatformRaw && selectedPlatformRaw !== 'all' ? selectedPlatformRaw : ''
      const { startDate, endDate, label } = getSelectedRange(
        searchParams,
        reportType === 'marketplace-fees'
          ? 'Marketplace Fees Report'
          : 'Platform Profitability Report'
      )

      const salesRes = await loadSalesForPrint({
        supabase,
        userId: user.id,
        startDate,
        endDate,
        platform: selectedPlatform,
      })

      if (salesRes.error) {
        return jsonError(`Could not build platform profitability print view: ${salesRes.error.message}`)
      }

      const html = buildPrintableReportHtml(
        buildPlatformProfitabilityPrintConfig({
          sales: (salesRes.data ?? []) as SaleRow[],
          reportLabel: label,
          platformFilter: selectedPlatform,
        })
      )

      return htmlResponse(withPrintScript(html))
    }

    if (reportType === 'operations') {
      const { startDate, endDate, label } = getSelectedRange(searchParams, 'Operations Report')

      const [salesRes, expensesRes, breaksRes, inventoryRes] = await Promise.all([
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
          .gte('sale_date', startDate)
          .lte('sale_date', endDate)
          .order('sale_date', { ascending: false }),

        supabase
          .from('expenses')
          .select('id, expense_date, category, vendor, amount, notes, created_at')
          .eq('user_id', user.id)
          .gte('expense_date', startDate)
          .lte('expense_date', endDate)
          .order('expense_date', { ascending: false })
          .order('created_at', { ascending: false }),

        supabase
          .from('breaks')
          .select('id, break_date, source_name, product_name, order_number, total_cost')
          .eq('user_id', user.id)
          .gte('break_date', startDate)
          .lte('break_date', endDate)
          .order('break_date', { ascending: false }),

        supabase
          .from('inventory_items')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ])

      if (salesRes.error) return jsonError(`Could not build operations print view sales: ${salesRes.error.message}`)
      if (expensesRes.error) return jsonError(`Could not build operations print view expenses: ${expensesRes.error.message}`)
      if (breaksRes.error) return jsonError(`Could not build operations print view purchases: ${breaksRes.error.message}`)
      if (inventoryRes.error) return jsonError(`Could not build operations print view inventory: ${inventoryRes.error.message}`)

      const html = buildPrintableReportHtml(
        buildOperationsPrintConfig({
          reportLabel: label,
          sales: (salesRes.data ?? []) as SaleRow[],
          expenses: (expensesRes.data ?? []) as ExpenseRow[],
          breaks: (breaksRes.data ?? []) as BreakRow[],
          inventoryItems: (inventoryRes.data ?? []) as InventoryItemRow[],
        })
      )

      return htmlResponse(withPrintScript(html))
    }

    const reportLabel = getDateRange(searchParams)
    const startDate =
      String(searchParams.get('startDate') || searchParams.get('dateFrom') || '').trim()
    const endDate =
      String(searchParams.get('endDate') || searchParams.get('dateTo') || '').trim()
    const search = String(searchParams.get('q') || '').trim()
    const selectedStatus = String(searchParams.get('status') || 'all').trim()
    const selectedValue = String(searchParams.get('value') || 'all').trim()

    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return jsonError(`Could not build inventory print view: ${error.message}`)
    }

    const allInventoryItems = (data ?? []) as InventoryItemRow[]

    const inventoryItems = allInventoryItems.filter((item) => {
      const status = normalizeStatus(item.status)

      if (selectedStatus !== 'all' && status !== selectedStatus) return false
      if (!matchesSearch(item, search)) return false
      if (!matchesDateRange(item, startDate, endDate)) return false
      if (!matchesValueFilter(item, selectedValue)) return false

      return true
    })

    const html = buildPrintableReportHtml(
      buildInventoryPrintConfig(inventoryItems, reportLabel)
    )

    return htmlResponse(withPrintScript(html))
  } catch (error) {
    console.error('Dynamic report print view failed:', error)
    return jsonError('Unable to build report print view.')
  }
}
