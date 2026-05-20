import { createClient } from '@/lib/supabase/server'
import {
  buildCsv,
  buildReportFilename,
  csvDownloadResponse,
  jsonError,
  moneyString,
  unauthorizedError,
} from '@/lib/reports/report-export-utils'

type ReportPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'

type FinancialAccount =
  | 'all'
  | 'sales'
  | 'cogs'
  | 'selling-costs'
  | 'expenses'
  | 'purchases'
  | 'inventory'
  | 'schedule-c'

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

type InventoryRow = {
  id: string
  title: string | null
  player_name: string | null
  year: number | string | null
  set_name: string | null
  card_number: string | null
  notes: string | null
  status: string | null
  available_quantity: number | null
  cost_basis_unit: number | null
  cost_basis_total: number | null
  estimated_value_total: number | null
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

function roundMoney(value: number) {
  return Number(value.toFixed(2))
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

  return 'month'
}

function normalizeFinancialAccount(raw?: string | null): FinancialAccount {
  const clean = String(raw || 'all').trim()

  if (
    clean === 'sales' ||
    clean === 'cogs' ||
    clean === 'selling-costs' ||
    clean === 'expenses' ||
    clean === 'purchases' ||
    clean === 'inventory' ||
    clean === 'schedule-c'
  ) {
    return clean
  }

  return 'all'
}

function getAccountLabel(account: FinancialAccount) {
  if (account === 'sales') return 'Sales / income'
  if (account === 'cogs') return 'COGS / cost basis'
  if (account === 'selling-costs') return 'Selling costs'
  if (account === 'expenses') return 'Manual expenses'
  if (account === 'purchases') return 'Purchases / breaks'
  if (account === 'inventory') return 'Inventory value'
  if (account === 'schedule-c') return 'Schedule C support'

  return 'All financial accounts'
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
}: {
  selectedYear: number
  period: ReportPeriod
  start?: string | null
  end?: string | null
  month: number
  quarter: number
}) {
  const today = new Date()
  const defaultAnchor =
    selectedYear === today.getFullYear() ? today : new Date(selectedYear, 0, 1)

  if (period === 'day') {
    const selectedDay = parseInputDate(start, defaultAnchor)

    return {
      startDate: dateToInputValue(selectedDay),
      endDate: dateToInputValue(selectedDay),
      label: `Daily Financial Report: ${dateToInputValue(selectedDay)}`,
    }
  }

  if (period === 'week') {
    const selectedDay = parseInputDate(start, defaultAnchor)
    const weekStart = getStartOfWeek(selectedDay)
    const weekEnd = getEndOfWeek(selectedDay)

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      label: `Weekly Financial Report: ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    }
  }

  if (period === 'month') {
    const monthStart = new Date(selectedYear, month - 1, 1)
    const monthEnd = new Date(selectedYear, month, 0)

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      label: `Monthly Financial Report: ${monthStart.toLocaleString('default', {
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
      label: `Quarterly Financial Report: Q${quarter} ${selectedYear}`,
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
      label: `Custom Financial Report: ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
    }
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
    label: `Yearly Financial Report: ${selectedYear}`,
  }
}

function matchesSearch(values: unknown[], search: string) {
  if (!search) return true

  const haystack = values.map(asString).join(' ').toLowerCase()

  return haystack.includes(search.toLowerCase())
}

function buildInventoryItemName(item: InventoryRow) {
  const title = item.title || item.player_name || 'Untitled item'

  const details = [
    item.year ? String(item.year) : '',
    item.set_name || '',
    item.card_number ? `#${item.card_number}` : '',
  ].filter(Boolean)

  return details.length ? `${title} - ${details.join(' ')}` : title
}

function mapExpenseCategoryToScheduleCArea(category: string) {
  const normalized = category.trim().toLowerCase()

  if (normalized.includes('advertising') || normalized.includes('marketing')) {
    return 'Advertising'
  }

  if (normalized.includes('platform') || normalized.includes('fee')) {
    return 'Commissions and fees'
  }

  if (normalized.includes('postage') || normalized.includes('shipping')) {
    return 'Other expenses / Postage and shipping'
  }

  if (normalized.includes('supplies')) {
    return 'Supplies'
  }

  if (normalized.includes('software') || normalized.includes('subscription')) {
    return 'Other expenses / Software and subscriptions'
  }

  if (normalized.includes('equipment')) {
    return 'Other expenses / Equipment review'
  }

  if (normalized.includes('office')) {
    return 'Office expense'
  }

  if (normalized.includes('grading') || normalized.includes('authentication')) {
    return 'Other expenses / Grading and authentication'
  }

  if (normalized.includes('travel')) {
    return 'Travel'
  }

  if (normalized.includes('education')) {
    return 'Other expenses / Education'
  }

  return 'Other expenses'
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const selectedYear = clampYear(searchParams.get('year'))
  const selectedPeriod = normalizePeriod(searchParams.get('period'))
  const selectedMonth = clampMonth(searchParams.get('month'))
  const selectedQuarter = clampQuarter(searchParams.get('quarter'))
  const selectedAccount = normalizeFinancialAccount(searchParams.get('account'))
  const search = String(searchParams.get('q') || '').trim()
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
  })

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return unauthorizedError()
  }

  const [breaksRes, salesRes, inventoryRes, expensesRes, taxSettingsRes] =
    await Promise.all([
      supabase
        .from('breaks')
        .select('id, break_date, source_name, product_name, order_number, total_cost')
        .eq('user_id', user.id)
        .is('reversed_at', null)
        .gte('break_date', startDate)
        .lte('break_date', endDate)
        .order('break_date', { ascending: false }),

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
        .from('inventory_items')
        .select(`
          id,
          title,
          player_name,
          year,
          set_name,
          card_number,
          notes,
          status,
          available_quantity,
          cost_basis_unit,
          cost_basis_total,
          estimated_value_total
        `)
        .eq('user_id', user.id)
        .gt('available_quantity', 0)
        .order('year', { ascending: false }),

      supabase
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

  if (breaksRes.error) {
    return jsonError(`Could not export financial breaks: ${breaksRes.error.message}`)
  }

  if (salesRes.error) {
    return jsonError(`Could not export financial sales: ${salesRes.error.message}`)
  }

  if (inventoryRes.error) {
    return jsonError(`Could not export financial inventory: ${inventoryRes.error.message}`)
  }

  if (expensesRes.error) {
    return jsonError(`Could not export financial expenses: ${expensesRes.error.message}`)
  }

  if (taxSettingsRes.error) {
    return jsonError(`Could not export financial tax settings: ${taxSettingsRes.error.message}`)
  }

  const breaks = ((breaksRes.data ?? []) as BreakRow[]).filter((row) =>
    matchesSearch(
      [row.break_date, row.source_name, row.product_name, row.order_number, row.total_cost],
      search
    )
  )

  const sales = ((salesRes.data ?? []) as SaleRow[]).filter((row) =>
    matchesSearch(
      [
        row.sale_date,
        row.gross_sale,
        row.platform_fees,
        row.shipping_cost,
        row.other_costs,
        row.net_proceeds,
        row.cost_of_goods_sold,
        row.profit,
        row.platform,
        row.notes,
      ],
      search
    )
  )

  const endingInventory = ((inventoryRes.data ?? []) as InventoryRow[]).filter(
    (row) =>
      matchesSearch(
        [
          row.title,
          row.player_name,
          row.year,
          row.set_name,
          row.card_number,
          row.notes,
          row.status,
        ],
        search
      )
  )

  const expenses = ((expensesRes.data ?? []) as ExpenseRow[]).filter((row) =>
    matchesSearch(
      [row.expense_date, row.category, row.vendor, row.amount, row.notes],
      search
    )
  )

  const taxSettings = (taxSettingsRes.data ?? null) as TaxYearSettingsRow | null

  const totalGrossSales = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.gross_sale), 0)
  )
  const totalPlatformFees = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.platform_fees), 0)
  )
  const totalShippingCosts = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.shipping_cost), 0)
  )
  const totalOtherSellingCosts = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.other_costs), 0)
  )
  const totalSellingCosts = roundMoney(
    totalPlatformFees + totalShippingCosts + totalOtherSellingCosts
  )
  const totalNetProceeds = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.net_proceeds), 0)
  )
  const totalCOGS = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.cost_of_goods_sold), 0)
  )
  const totalSalesProfit = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.profit), 0)
  )
  const totalManualExpenses = roundMoney(
    expenses.reduce((sum, row) => sum + asNumber(row.amount), 0)
  )
  const totalBreakPurchases = roundMoney(
    breaks.reduce((sum, row) => sum + asNumber(row.total_cost), 0)
  )
  const beginningInventory = roundMoney(asNumber(taxSettings?.beginning_inventory))
  const liveEndingInventoryCost = roundMoney(
    endingInventory.reduce((sum, row) => {
      const availableQty = asNumber(row.available_quantity)
      const unitCost = asNumber(row.cost_basis_unit)
      const fallbackTotal = asNumber(row.cost_basis_total)

      if (availableQty > 0 && unitCost > 0) return sum + availableQty * unitCost

      return sum + fallbackTotal
    }, 0)
  )
  const lockedEndingInventory =
    taxSettings?.ending_inventory_snapshot != null
      ? roundMoney(asNumber(taxSettings.ending_inventory_snapshot))
      : null
  const endingInventoryCost = lockedEndingInventory ?? liveEndingInventoryCost
  const endingInventoryEstimatedValue = roundMoney(
    endingInventory.reduce((sum, row) => sum + asNumber(row.estimated_value_total), 0)
  )
  const scheduleCExtraExpenses = roundMoney(
    asNumber(taxSettings?.business_use_of_home) +
      asNumber(taxSettings?.vehicle_expense) +
      asNumber(taxSettings?.depreciation_expense) +
      asNumber(taxSettings?.legal_professional) +
      asNumber(taxSettings?.insurance) +
      asNumber(taxSettings?.utilities) +
      asNumber(taxSettings?.taxes_licenses) +
      asNumber(taxSettings?.repairs_maintenance)
  )
  const grossIncomeAfterCOGS = roundMoney(totalGrossSales - totalCOGS)
  const netBusinessProfitAfterTrackedExpenses = roundMoney(
    totalGrossSales - totalCOGS - totalSellingCosts - totalManualExpenses - scheduleCExtraExpenses
  )
  const purchasesForCogsSupport = roundMoney(
    totalCOGS + endingInventoryCost - beginningInventory
  )

  const rows: Record<string, string>[] = [
    {
      section: 'summary',
      report: label,
      account_filter: getAccountLabel(selectedAccount),
      range_start: startDate,
      range_end: endDate,
      search_filter: search || 'None',
      metric: 'gross_sales',
      value: moneyString(totalGrossSales),
    },
    {
      section: 'summary',
      report: label,
      account_filter: getAccountLabel(selectedAccount),
      range_start: startDate,
      range_end: endDate,
      search_filter: search || 'None',
      metric: 'realized_cogs',
      value: moneyString(totalCOGS),
    },
    {
      section: 'summary',
      report: label,
      account_filter: getAccountLabel(selectedAccount),
      range_start: startDate,
      range_end: endDate,
      search_filter: search || 'None',
      metric: 'gross_income_after_cogs',
      value: moneyString(grossIncomeAfterCOGS),
    },
    {
      section: 'summary',
      report: label,
      account_filter: getAccountLabel(selectedAccount),
      range_start: startDate,
      range_end: endDate,
      search_filter: search || 'None',
      metric: 'selling_costs',
      value: moneyString(totalSellingCosts),
    },
    {
      section: 'summary',
      report: label,
      account_filter: getAccountLabel(selectedAccount),
      range_start: startDate,
      range_end: endDate,
      search_filter: search || 'None',
      metric: 'manual_expenses',
      value: moneyString(totalManualExpenses),
    },
    {
      section: 'summary',
      report: label,
      account_filter: getAccountLabel(selectedAccount),
      range_start: startDate,
      range_end: endDate,
      search_filter: search || 'None',
      metric: 'net_profit_after_tracked_expenses',
      value: moneyString(netBusinessProfitAfterTrackedExpenses),
    },
    {
      section: 'summary',
      report: label,
      account_filter: getAccountLabel(selectedAccount),
      range_start: startDate,
      range_end: endDate,
      search_filter: search || 'None',
      metric: 'net_proceeds',
      value: moneyString(totalNetProceeds),
    },
    {
      section: 'summary',
      report: label,
      account_filter: getAccountLabel(selectedAccount),
      range_start: startDate,
      range_end: endDate,
      search_filter: search || 'None',
      metric: 'break_purchases',
      value: moneyString(totalBreakPurchases),
    },
    {
      section: 'summary',
      report: label,
      account_filter: getAccountLabel(selectedAccount),
      range_start: startDate,
      range_end: endDate,
      search_filter: search || 'None',
      metric: 'beginning_inventory',
      value: moneyString(beginningInventory),
    },
    {
      section: 'summary',
      report: label,
      account_filter: getAccountLabel(selectedAccount),
      range_start: startDate,
      range_end: endDate,
      search_filter: search || 'None',
      metric: 'purchases_support',
      value: moneyString(purchasesForCogsSupport),
    },
    {
      section: 'summary',
      report: label,
      account_filter: getAccountLabel(selectedAccount),
      range_start: startDate,
      range_end: endDate,
      search_filter: search || 'None',
      metric: 'ending_inventory_cost',
      value: moneyString(endingInventoryCost),
    },
    {
      section: 'summary',
      report: label,
      account_filter: getAccountLabel(selectedAccount),
      range_start: startDate,
      range_end: endDate,
      search_filter: search || 'None',
      metric: 'ending_inventory_estimated_value',
      value: moneyString(endingInventoryEstimatedValue),
    },
    {
      section: 'summary',
      report: label,
      account_filter: getAccountLabel(selectedAccount),
      range_start: startDate,
      range_end: endDate,
      search_filter: search || 'None',
      metric: 'sale_level_profit',
      value: moneyString(totalSalesProfit),
    },
  ]

  const includeSales =
    selectedAccount === 'all' ||
    selectedAccount === 'sales' ||
    selectedAccount === 'selling-costs' ||
    selectedAccount === 'cogs'
  const includeExpenses =
    selectedAccount === 'all' ||
    selectedAccount === 'expenses' ||
    selectedAccount === 'schedule-c'
  const includePurchases =
    selectedAccount === 'all' ||
    selectedAccount === 'purchases' ||
    selectedAccount === 'cogs'
  const includeInventory =
    selectedAccount === 'all' ||
    selectedAccount === 'inventory' ||
    selectedAccount === 'cogs' ||
    selectedAccount === 'schedule-c'
  const includeScheduleC =
    selectedAccount === 'all' ||
    selectedAccount === 'schedule-c'

  if (includeSales) {
    rows.push(
      ...sales.map((sale) => ({
        section: 'sales_detail',
        report: label,
        account_filter: getAccountLabel(selectedAccount),
        range_start: startDate,
        range_end: endDate,
        sale_date: sale.sale_date || '',
        platform: sale.platform || '',
        gross_sale: moneyString(sale.gross_sale),
        platform_fees: moneyString(sale.platform_fees),
        shipping_cost: moneyString(sale.shipping_cost),
        other_costs: moneyString(sale.other_costs),
        net_proceeds: moneyString(sale.net_proceeds),
        cost_of_goods_sold: moneyString(sale.cost_of_goods_sold),
        profit: moneyString(sale.profit),
        notes: sale.notes || '',
        sale_id: sale.id,
      }))
    )
  }

  if (includeExpenses) {
    rows.push(
      ...expenses.map((expense) => {
        const category =
          String(expense.category || 'Uncategorized').trim() || 'Uncategorized'

        return {
          section: 'expense_detail',
          report: label,
          account_filter: getAccountLabel(selectedAccount),
          range_start: startDate,
          range_end: endDate,
          expense_date: expense.expense_date || '',
          category,
          schedule_c_area: mapExpenseCategoryToScheduleCArea(category),
          vendor: expense.vendor || '',
          amount: moneyString(expense.amount),
          notes: expense.notes || '',
          expense_id: expense.id,
        }
      })
    )
  }

  if (includePurchases) {
    rows.push(
      ...breaks.map((breakRow) => ({
        section: 'purchase_detail',
        report: label,
        account_filter: getAccountLabel(selectedAccount),
        range_start: startDate,
        range_end: endDate,
        break_date: breakRow.break_date || '',
        product_name: breakRow.product_name || '',
        source_name: breakRow.source_name || '',
        order_number: breakRow.order_number || '',
        total_cost: moneyString(breakRow.total_cost),
        break_id: breakRow.id,
      }))
    )
  }

  if (includeInventory) {
    rows.push(
      ...endingInventory.map((item) => {
        const availableQty = asNumber(item.available_quantity)
        const unitCost = asNumber(item.cost_basis_unit)
        const fallbackTotal = asNumber(item.cost_basis_total)
        const inventoryCost =
          availableQty > 0 && unitCost > 0
            ? availableQty * unitCost
            : fallbackTotal

        return {
          section: 'inventory_detail',
          report: label,
          account_filter: getAccountLabel(selectedAccount),
          range_start: startDate,
          range_end: endDate,
          item_name: buildInventoryItemName(item),
          status: item.status || '',
          available_quantity: String(availableQty),
          unit_cost: moneyString(unitCost),
          inventory_cost: moneyString(inventoryCost),
          estimated_value: moneyString(item.estimated_value_total),
          notes: item.notes || '',
          inventory_item_id: item.id,
        }
      })
    )
  }

  if (includeScheduleC) {
    rows.push(
      {
        section: 'schedule_c_support',
        report: label,
        account_filter: getAccountLabel(selectedAccount),
        range_start: startDate,
        range_end: endDate,
        account: 'Business use of home',
        amount: moneyString(taxSettings?.business_use_of_home),
        notes: 'Tax year setting',
      },
      {
        section: 'schedule_c_support',
        report: label,
        account_filter: getAccountLabel(selectedAccount),
        range_start: startDate,
        range_end: endDate,
        account: 'Vehicle expense',
        amount: moneyString(taxSettings?.vehicle_expense),
        notes: 'Tax year setting',
      },
      {
        section: 'schedule_c_support',
        report: label,
        account_filter: getAccountLabel(selectedAccount),
        range_start: startDate,
        range_end: endDate,
        account: 'Depreciation expense',
        amount: moneyString(taxSettings?.depreciation_expense),
        notes: 'Tax year setting',
      },
      {
        section: 'schedule_c_support',
        report: label,
        account_filter: getAccountLabel(selectedAccount),
        range_start: startDate,
        range_end: endDate,
        account: 'Legal and professional',
        amount: moneyString(taxSettings?.legal_professional),
        notes: 'Tax year setting',
      },
      {
        section: 'schedule_c_support',
        report: label,
        account_filter: getAccountLabel(selectedAccount),
        range_start: startDate,
        range_end: endDate,
        account: 'Insurance',
        amount: moneyString(taxSettings?.insurance),
        notes: 'Tax year setting',
      },
      {
        section: 'schedule_c_support',
        report: label,
        account_filter: getAccountLabel(selectedAccount),
        range_start: startDate,
        range_end: endDate,
        account: 'Utilities',
        amount: moneyString(taxSettings?.utilities),
        notes: 'Tax year setting',
      },
      {
        section: 'schedule_c_support',
        report: label,
        account_filter: getAccountLabel(selectedAccount),
        range_start: startDate,
        range_end: endDate,
        account: 'Taxes and licenses',
        amount: moneyString(taxSettings?.taxes_licenses),
        notes: 'Tax year setting',
      },
      {
        section: 'schedule_c_support',
        report: label,
        account_filter: getAccountLabel(selectedAccount),
        range_start: startDate,
        range_end: endDate,
        account: 'Repairs and maintenance',
        amount: moneyString(taxSettings?.repairs_maintenance),
        notes: 'Tax year setting',
      }
    )
  }

  const csv = `\uFEFF${buildCsv(
    rows,
    'No financial records found for this report range.'
  )}`

  const filename = buildReportFilename({
    reportName: 'financial-report',
    startDate,
    endDate,
    extension: 'csv',
  })

  return csvDownloadResponse({
    csv,
    filename,
  })
}
