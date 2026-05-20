import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getExpenseScheduleCArea } from '@/lib/reports/expense-categories'
import {
  buildPrintableReportHtml,
  type PrintableReportColumn,
  type PrintableReportRow,
} from '@/lib/reports/report-print-utils'
import { formatReportDate, jsonError, moneyString, unauthorizedError } from '@/lib/reports/report-export-utils'

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
}

type SaleInventoryRow = {
  id: string
  title: string | null
  player_name: string | null
  year: number | null
  set_name: string | null
  card_number: string | null
  notes: string | null
  status: string | null
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

const REPORT_LABELS: Record<string, string> = {
  inventory: 'Inventory Report',
  sales: 'Sales Report',
  expenses: 'Expenses Report',
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

function buildSaleItemName(item: SaleInventoryRow | undefined) {
  if (!item) return 'Unlinked sale'

  const parts = [
    item.year,
    item.set_name,
    item.player_name,
    item.card_number ? `#${item.card_number}` : null,
    item.notes,
  ]

  return parts.filter(Boolean).join(' • ') || item.title || 'Untitled item'
}

function platformKey(value: string | null | undefined) {
  return String(value || 'Unknown').trim() || 'Unknown'
}

function formatDateForPrint(value: string | null | undefined) {
  if (!value) return 'Unknown'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toISOString().slice(0, 10)
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

function buildInventoryPrintConfig(items: InventoryItemRow[], reportLabel: string) {
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

function buildSalesPrintConfig({
  sales,
  inventoryById,
  reportLabel,
  platformFilter,
}: {
  sales: SaleRow[]
  inventoryById: Map<string, SaleInventoryRow>
  reportLabel: string
  platformFilter: string
}) {
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
    title: reportLabel,
    subtitle: `Printable sales report. Platform filter: ${platformFilter || 'All platforms'}.`,
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
}) {
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

    if (reportType === 'sales') {
      const selectedYear = clampYear(searchParams.get('year'))
      const selectedPeriod = normalizePeriod(searchParams.get('period'))
      const selectedMonth = clampMonth(searchParams.get('month'))
      const selectedQuarter = clampQuarter(searchParams.get('quarter'))
      const selectedPlatform = String(searchParams.get('platform') || '').trim()
      const selectedStart =
        searchParams.get('start') ||
        searchParams.get('startDate') ||
        searchParams.get('date')
      const selectedEnd = searchParams.get('end') || searchParams.get('endDate')

      const { startDate, endDate, label } = getPeriodReportDateRange({
        selectedYear,
        period: selectedPeriod,
        start: selectedStart,
        end: selectedEnd,
        month: selectedMonth,
        quarter: selectedQuarter,
        labelPrefix: 'Sales Report',
      })

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
          inventory_item_id
        `)
        .eq('user_id', user.id)
        .is('reversed_at', null)
        .gte('sale_date', startDate)
        .lte('sale_date', endDate)
        .order('sale_date', { ascending: false })

      if (selectedPlatform) {
        salesQuery = salesQuery.eq('platform', selectedPlatform)
      }

      const { data: salesData, error: salesError } = await salesQuery

      if (salesError) {
        return jsonError(`Could not build sales print view: ${salesError.message}`)
      }

      const sales = (salesData ?? []) as SaleRow[]
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
              .eq('user_id', user.id)
              .in('id', inventoryIds)
          : { data: [], error: null }

      if (inventoryRes.error) {
        return jsonError(
          `Could not load inventory item details for sales print view: ${inventoryRes.error.message}`
        )
      }

      const inventoryItems = (inventoryRes.data ?? []) as SaleInventoryRow[]
      const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]))

      const html = buildPrintableReportHtml(
        buildSalesPrintConfig({
          sales,
          inventoryById,
          reportLabel: label,
          platformFilter: selectedPlatform,
        })
      )

      return htmlResponse(withPrintScript(html))
    }

    if (reportType === 'expenses') {
      const selectedYear = clampYear(searchParams.get('year'))
      const selectedPeriod = normalizePeriod(searchParams.get('period'))
      const selectedMonth = clampMonth(searchParams.get('month'))
      const selectedQuarter = clampQuarter(searchParams.get('quarter'))
      const selectedCategory = String(searchParams.get('category') || '').trim()
      const selectedStart =
        searchParams.get('start') ||
        searchParams.get('startDate') ||
        searchParams.get('date')
      const selectedEnd = searchParams.get('end') || searchParams.get('endDate')

      const { startDate, endDate, label } = getPeriodReportDateRange({
        selectedYear,
        period: selectedPeriod,
        start: selectedStart,
        end: selectedEnd,
        month: selectedMonth,
        quarter: selectedQuarter,
        labelPrefix: 'Expenses Report',
      })

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
