import { createClient } from '@/lib/supabase/server'
import { getExpenseScheduleCArea } from '@/lib/reports/expense-categories'
import {
  buildCsv,
  buildReportFilename,
  csvDownloadResponse,
  jsonError,
  moneyString,
  unauthorizedError,
} from '@/lib/reports/report-export-utils'

type RouteContext = {
  params: Promise<{ reportType: string }> | { reportType: string }
}

type ReportPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'

type SalesRow = {
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

type SalesInventoryRow = {
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

function excelSafeCsv(csv: string) {
  return csv.startsWith('\uFEFF') ? csv : `\uFEFF${csv}`
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

function getReportDateRange({
  selectedYear,
  period,
  start,
  end,
  month,
  quarter,
  reportLabel,
}: {
  selectedYear: number
  period: ReportPeriod
  start?: string | null
  end?: string | null
  month: number
  quarter: number
  reportLabel: string
}) {
  const today = new Date()
  const defaultAnchor =
    selectedYear === today.getFullYear() ? today : new Date(selectedYear, 0, 1)

  if (period === 'day') {
    const selectedDay = parseInputDate(start, defaultAnchor)

    return {
      startDate: dateToInputValue(selectedDay),
      endDate: dateToInputValue(selectedDay),
      label: `Daily ${reportLabel} Report ${dateToInputValue(selectedDay)}`,
    }
  }

  if (period === 'week') {
    const selectedDay = parseInputDate(start, defaultAnchor)
    const weekStart = getStartOfWeek(selectedDay)
    const weekEnd = getEndOfWeek(selectedDay)

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      label: `Weekly ${reportLabel} Report ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    }
  }

  if (period === 'month') {
    const monthStart = new Date(selectedYear, month - 1, 1)
    const monthEnd = new Date(selectedYear, month, 0)

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      label: `Monthly ${reportLabel} Report ${monthStart.toLocaleString('default', {
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
      label: `Quarterly ${reportLabel} Report Q${quarter} ${selectedYear}`,
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
      label: `Custom ${reportLabel} Report ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
    }
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
    label: `Yearly ${reportLabel} Report ${selectedYear}`,
  }
}

function platformKey(value: string | null | undefined) {
  return String(value || 'Unknown').trim() || 'Unknown'
}

function normalizeStatus(status: string | null | undefined) {
  const clean = asString(status).trim()
  return clean || 'unknown'
}

function getInventoryItemDate(item: InventoryItemRow) {
  return item.acquired_at || item.purchase_date || item.date_added || item.created_at || null
}

function getInventoryItemCost(item: InventoryItemRow) {
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

function getInventoryItemValue(item: InventoryItemRow) {
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

function getInventoryDaysHeld(item: InventoryItemRow) {
  const rawDate = getInventoryItemDate(item)
  if (!rawDate) return null

  const itemDate = new Date(rawDate)
  if (Number.isNaN(itemDate.getTime())) return null

  const now = new Date()
  const millisecondsPerDay = 1000 * 60 * 60 * 24

  return Math.max(0, Math.floor((now.getTime() - itemDate.getTime()) / millisecondsPerDay))
}

function getInventoryItemName(item: InventoryItemRow) {
  const directTitle = item.title || item.item_name || item.player_name || 'Untitled item'

  const details = [
    item.year ? String(item.year) : '',
    item.set_name || '',
    item.item_number || item.card_number || '',
  ].filter(Boolean)

  if (!details.length) return directTitle

  return `${directTitle} — ${details.join(' ')}`
}

function buildSoldItemName(item: SalesInventoryRow | undefined) {
  if (!item) return 'Unlinked sale'

  const directTitle = item.title || item.item_name || item.player_name || 'Untitled item'

  const details = [
    item.year ? String(item.year) : '',
    item.set_name || '',
    item.item_number || item.card_number ? `#${item.item_number || item.card_number}` : '',
  ].filter(Boolean)

  if (!details.length) return directTitle

  return `${directTitle} — ${details.join(' ')}`
}

function matchesInventorySearch(item: InventoryItemRow, search: string) {
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

function matchesInventoryDateRange(item: InventoryItemRow, startDate: string, endDate: string) {
  const rawDate = getInventoryItemDate(item)
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

function matchesInventoryValueFilter(item: InventoryItemRow, valueFilter: string) {
  if (!valueFilter || valueFilter === 'all') return true

  const value = getInventoryItemValue(item)

  if (valueFilter === 'no-value') return value <= 0
  if (valueFilter === 'under-10') return value > 0 && value < 10
  if (valueFilter === '10-50') return value >= 10 && value <= 50
  if (valueFilter === '50-100') return value > 50 && value <= 100
  if (valueFilter === 'over-100') return value > 100

  return true
}

function matchesInventoryAgingFilter(item: InventoryItemRow, agingFilter: string) {
  if (!agingFilter || agingFilter === 'all') return true

  const daysHeld = getInventoryDaysHeld(item)
  if (daysHeld === null) return false

  const minimumDays = Number(agingFilter)
  if (!Number.isFinite(minimumDays) || minimumDays <= 0) return true

  return daysHeld >= minimumDays
}

function getInventoryWorkflowAction(item: InventoryItemRow) {
  const status = normalizeStatus(item.status).toLowerCase()
  const value = getInventoryItemValue(item)
  const cost = getInventoryItemCost(item)
  const daysHeld = getInventoryDaysHeld(item)
  const notes = asString(item.notes).toLowerCase()

  if ((status === 'available' || status === 'listed') && cost <= 0) return 'Missing Cost Basis'

  if (status === 'available') {
    if (notes.includes('photo') || notes.includes('scan')) return 'Needs Photos / Scan'
    if (value <= 0) return 'Missing Estimated Value'
    if (daysHeld !== null && daysHeld >= 90) return '90+ Days Available'
    if (daysHeld !== null && daysHeld >= 30) return '30+ Days Available'
    return 'Ready To List'
  }

  if (status === 'listed') {
    if (daysHeld !== null && daysHeld >= 90) return 'Listed 90+ Days'
    if (daysHeld !== null && daysHeld >= 30) return 'Listed 30+ Days'
    return 'Monitor Listing'
  }

  if (status === 'personal') return 'Personal Collection Review'
  if (status === 'junk') return 'Disposal Candidate'
  if (status === 'disposed') return 'Finalized Disposal'
  if (status === 'sold') return 'Sold'

  return 'Review Status'
}

function matchesInventoryActionNeededFilter(item: InventoryItemRow, actionFilter: string) {
  if (!actionFilter || actionFilter === 'all') return true

  const status = normalizeStatus(item.status).toLowerCase()
  const value = getInventoryItemValue(item)
  const cost = getInventoryItemCost(item)
  const daysHeld = getInventoryDaysHeld(item)
  const notes = asString(item.notes).toLowerCase()
  const action = getInventoryWorkflowAction(item)

  if (actionFilter === 'ready-to-list') return action === 'Ready To List'
  if (actionFilter === 'missing-cost') return (status === 'available' || status === 'listed') && cost <= 0
  if (actionFilter === 'missing-value') return value <= 0
  if (actionFilter === 'needs-photos') return notes.includes('photo') || notes.includes('scan')
  if (actionFilter === 'available-30') return status === 'available' && daysHeld !== null && daysHeld >= 30
  if (actionFilter === 'available-90') return status === 'available' && daysHeld !== null && daysHeld >= 90
  if (actionFilter === 'listed-30') return status === 'listed' && daysHeld !== null && daysHeld >= 30
  if (actionFilter === 'listed-90') return status === 'listed' && daysHeld !== null && daysHeld >= 90
  if (actionFilter === 'pc-review') return status === 'personal'
  if (actionFilter === 'notes-review') return Boolean(asString(item.notes).trim())
  if (actionFilter === 'disposal-candidate') return status === 'junk' || action === 'Disposal Candidate'

  if (actionFilter === 'needed') {
    return (
      status === 'unknown' ||
      status === 'junk' ||
      cost <= 0 ||
      action === 'Missing Cost Basis' ||
      action === 'Needs Photos / Scan' ||
      action === '30+ Days Available' ||
      action === '90+ Days Available' ||
      action === 'Listed 30+ Days' ||
      action === 'Listed 90+ Days' ||
      action === 'Review Status' ||
      action === 'Personal Collection Review'
    )
  }

  return true
}

async function exportSalesReport(request: Request) {
  const { searchParams } = new URL(request.url)

  const selectedYear = clampYear(searchParams.get('year'))
  const selectedPeriod = normalizePeriod(searchParams.get('period'))
  const selectedMonth = clampMonth(searchParams.get('month'))
  const selectedQuarter = clampQuarter(searchParams.get('quarter'))
  const selectedPlatform = String(searchParams.get('platform') || '').trim()
  const selectedStart =
    searchParams.get('start') ||
    searchParams.get('startDate') ||
    searchParams.get('date')
  const selectedEnd =
    searchParams.get('end') ||
    searchParams.get('endDate')

  const { startDate, endDate, label } = getReportDateRange({
    selectedYear,
    period: selectedPeriod,
    start: selectedStart,
    end: selectedEnd,
    month: selectedMonth,
    quarter: selectedQuarter,
    reportLabel: 'Sales',
  })

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return unauthorizedError()
  }

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

  const { data, error } = await salesQuery

  if (error) {
    return jsonError(`Could not export sales: ${error.message}`)
  }

  const sales = (data ?? []) as SalesRow[]

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
          .select('id, title, item_name, player_name, year, set_name, card_number, item_number, notes, status')
          .eq('user_id', user.id)
          .in('id', inventoryIds)
      : { data: [] }

  const inventoryItems = (inventoryRes.data ?? []) as SalesInventoryRow[]
  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]))

  const totalGrossSales = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.gross_sale ?? 0), 0)
  )
  const totalPlatformFees = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.platform_fees ?? 0), 0)
  )
  const totalShippingCosts = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.shipping_cost ?? 0), 0)
  )
  const totalOtherCosts = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.other_costs ?? 0), 0)
  )
  const totalSellingCosts = roundMoney(
    totalPlatformFees + totalShippingCosts + totalOtherCosts
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
  const grossIncomeAfterCOGS = roundMoney(totalGrossSales - totalCOGS)

  const baseRow = {
    section: '',
    report: label,
    range_start: startDate,
    range_end: endDate,
    platform_filter: selectedPlatform || 'All platforms',
    metric: '',
    value: '',
    sale_date: '',
    item: '',
    platform: '',
    gross_sale: '',
    platform_fees: '',
    shipping_cost: '',
    other_costs: '',
    net_proceeds: '',
    cost_of_goods_sold: '',
    profit: '',
    notes: '',
    sale_id: '',
    inventory_item_id: '',
  }

  const summaryRows = [
    { metric: 'sales_count', value: String(sales.length) },
    { metric: 'gross_sales', value: moneyString(totalGrossSales) },
    { metric: 'selling_costs', value: moneyString(totalSellingCosts) },
    { metric: 'net_proceeds', value: moneyString(totalNetProceeds) },
    { metric: 'realized_cogs', value: moneyString(totalCOGS) },
    { metric: 'income_after_cogs', value: moneyString(grossIncomeAfterCOGS) },
    { metric: 'profit', value: moneyString(totalProfit) },
  ].map((row) => ({
    ...baseRow,
    section: 'summary',
    metric: row.metric,
    value: row.value,
  }))

  const detailRows = sales.map((sale) => {
    const inventoryItem = sale.inventory_item_id
      ? inventoryById.get(sale.inventory_item_id)
      : undefined

    return {
      ...baseRow,
      section: 'detail',
      sale_date: sale.sale_date || '',
      item: buildSoldItemName(inventoryItem),
      platform: platformKey(sale.platform),
      gross_sale: moneyString(sale.gross_sale),
      platform_fees: moneyString(sale.platform_fees),
      shipping_cost: moneyString(sale.shipping_cost),
      other_costs: moneyString(sale.other_costs),
      net_proceeds: moneyString(sale.net_proceeds),
      cost_of_goods_sold: moneyString(sale.cost_of_goods_sold),
      profit: moneyString(sale.profit),
      notes: sale.notes || '',
      sale_id: sale.id,
      inventory_item_id: sale.inventory_item_id || '',
    }
  })

  const csv = excelSafeCsv(
    buildCsv(
      [...summaryRows, ...detailRows],
      'No sales found for this report range.'
    )
  )

  const filename = buildReportFilename({
    reportName: 'sales-report',
    startDate,
    endDate,
    extension: 'csv',
  })

  return csvDownloadResponse({
    csv,
    filename,
  })
}

async function exportExpensesReport(request: Request) {
  const { searchParams } = new URL(request.url)

  const selectedYear = clampYear(searchParams.get('year'))
  const selectedPeriod = normalizePeriod(searchParams.get('period'))
  const selectedMonth = clampMonth(searchParams.get('month'))
  const selectedQuarter = clampQuarter(searchParams.get('quarter'))
  const selectedCategory = String(searchParams.get('category') || '').trim()
  const selectedStart =
    searchParams.get('start') ||
    searchParams.get('startDate') ||
    searchParams.get('date')
  const selectedEnd =
    searchParams.get('end') ||
    searchParams.get('endDate')

  const { startDate, endDate, label } = getReportDateRange({
    selectedYear,
    period: selectedPeriod,
    start: selectedStart,
    end: selectedEnd,
    month: selectedMonth,
    quarter: selectedQuarter,
    reportLabel: 'Expenses',
  })

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return unauthorizedError()
  }

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
    return jsonError(`Could not export expenses: ${error.message}`)
  }

  const expenses = (data ?? []) as ExpenseRow[]

  const csvRows = expenses.map((expense) => {
    const category =
      String(expense.category || 'Uncategorized').trim() || 'Uncategorized'

    return {
      report: label,
      range_start: startDate,
      range_end: endDate,
      category_filter: selectedCategory || 'All categories',
      expense_date: expense.expense_date || '',
      category,
      schedule_c_area: getExpenseScheduleCArea(category),
      vendor: expense.vendor || '',
      amount: moneyString(expense.amount),
      notes: expense.notes || '',
      created_at: expense.created_at || '',
      expense_id: expense.id,
    }
  })

  const csv = excelSafeCsv(
    buildCsv(
      csvRows,
      'No manual expenses found for this report range.'
    )
  )

  const filename = buildReportFilename({
    reportName: 'expenses-report',
    startDate,
    endDate,
    extension: 'csv',
  })

  return csvDownloadResponse({
    csv,
    filename,
  })
}

async function exportInventoryReport(request: Request) {
  const { searchParams } = new URL(request.url)

  const search = String(searchParams.get('q') || '').trim()
  const selectedStatus = String(searchParams.get('status') || 'all').trim()
  const selectedValue = String(searchParams.get('value') || 'all').trim()
  const selectedAging = String(searchParams.get('aging') || 'all').trim()
  const selectedAction = String(searchParams.get('action') || 'all').trim()
  const startDate =
    String(searchParams.get('startDate') || searchParams.get('dateFrom') || '').trim()
  const endDate =
    String(searchParams.get('endDate') || searchParams.get('dateTo') || '').trim()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return unauthorizedError()
  }

  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return jsonError(`Could not export inventory: ${error.message}`)
  }

  const allInventoryItems = (data ?? []) as InventoryItemRow[]

  const inventoryItems = allInventoryItems.filter((item) => {
    const status = normalizeStatus(item.status)

    if (selectedStatus !== 'all' && status !== selectedStatus) return false
    if (!matchesInventorySearch(item, search)) return false
    if (!matchesInventoryDateRange(item, startDate, endDate)) return false
    if (!matchesInventoryValueFilter(item, selectedValue)) return false
    if (!matchesInventoryAgingFilter(item, selectedAging)) return false
    if (!matchesInventoryActionNeededFilter(item, selectedAction)) return false

    return true
  })

  const csvRows = inventoryItems.map((item) => {
    const costBasis = getInventoryItemCost(item)
    const estimatedValue = getInventoryItemValue(item)
    const gainLoss = estimatedValue - costBasis
    const daysHeld = getInventoryDaysHeld(item)

    return {
      item_id: item.id,
      item_name: getInventoryItemName(item),
      status: normalizeStatus(item.status),
      item_date: getInventoryItemDate(item) || '',
      days_held: daysHeld === null ? '' : String(daysHeld),
      suggested_action: getInventoryWorkflowAction(item),
      aging_filter: selectedAging,
      action_filter: selectedAction,
      year: item.year || '',
      set_name: item.set_name || '',
      item_number: item.item_number || item.card_number || '',
      cost_basis: moneyString(costBasis),
      estimated_value: moneyString(estimatedValue),
      estimated_gain_loss: moneyString(gainLoss),
      notes: item.notes || '',
    }
  })

  const csv = excelSafeCsv(
    buildCsv(
      csvRows,
      'No inventory items found for this report filter.'
    )
  )

  const filename = buildReportFilename({
    reportName: 'inventory-report',
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    extension: 'csv',
  })

  return csvDownloadResponse({
    csv,
    filename,
  })
}

export async function GET(request: Request, context: RouteContext) {
  const { reportType } = await context.params

  if (reportType === 'sales') {
    return exportSalesReport(request)
  }

  if (reportType === 'expenses') {
    return exportExpensesReport(request)
  }

  if (reportType === 'inventory') {
    return exportInventoryReport(request)
  }

  return jsonError(`Unsupported report export type: ${reportType}`, 404)
}
