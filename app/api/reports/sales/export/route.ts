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

type InventoryRow = {
  id: string
  title: string | null
  player_name: string | null
  year: number | null
  set_name: string | null
  card_number: string | null
  notes: string | null
  status: string | null
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
      label: `Daily Sales Report: ${dateToInputValue(selectedDay)}`,
    }
  }

  if (period === 'week') {
    const selectedDay = parseInputDate(start, defaultAnchor)
    const weekStart = getStartOfWeek(selectedDay)
    const weekEnd = getEndOfWeek(selectedDay)

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      label: `Weekly Sales Report: ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    }
  }

  if (period === 'month') {
    const monthStart = new Date(selectedYear, month - 1, 1)
    const monthEnd = new Date(selectedYear, month, 0)

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      label: `Monthly Sales Report: ${monthStart.toLocaleString('default', {
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
      label: `Quarterly Sales Report: Q${quarter} ${selectedYear}`,
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
      label: `Custom Sales Report: ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
    }
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
    label: `Yearly Sales Report: ${selectedYear}`,
  }
}

function buildItemName(item: InventoryRow | undefined) {
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

export async function GET(request: Request) {
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
  const selectedEnd = searchParams.get('end') || searchParams.get('endDate')

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
    return jsonError(`Could not export sales: ${salesError.message}`)
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
    return jsonError(`Could not load inventory item details for sales export: ${inventoryRes.error.message}`)
  }

  const inventoryItems = (inventoryRes.data ?? []) as InventoryRow[]
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

  const summaryRows = [
    {
      section: 'summary',
      report: label,
      range_start: startDate,
      range_end: endDate,
      platform_filter: selectedPlatform || 'All platforms',
      metric: 'sales_count',
      value: String(sales.length),
    },
    {
      section: 'summary',
      report: label,
      range_start: startDate,
      range_end: endDate,
      platform_filter: selectedPlatform || 'All platforms',
      metric: 'gross_sales',
      value: moneyString(totalGrossSales),
    },
    {
      section: 'summary',
      report: label,
      range_start: startDate,
      range_end: endDate,
      platform_filter: selectedPlatform || 'All platforms',
      metric: 'selling_costs',
      value: moneyString(totalSellingCosts),
    },
    {
      section: 'summary',
      report: label,
      range_start: startDate,
      range_end: endDate,
      platform_filter: selectedPlatform || 'All platforms',
      metric: 'net_proceeds',
      value: moneyString(totalNetProceeds),
    },
    {
      section: 'summary',
      report: label,
      range_start: startDate,
      range_end: endDate,
      platform_filter: selectedPlatform || 'All platforms',
      metric: 'realized_cogs',
      value: moneyString(totalCOGS),
    },
    {
      section: 'summary',
      report: label,
      range_start: startDate,
      range_end: endDate,
      platform_filter: selectedPlatform || 'All platforms',
      metric: 'income_after_cogs',
      value: moneyString(grossIncomeAfterCOGS),
    },
    {
      section: 'summary',
      report: label,
      range_start: startDate,
      range_end: endDate,
      platform_filter: selectedPlatform || 'All platforms',
      metric: 'profit',
      value: moneyString(totalProfit),
    },
  ]

  const detailRows = sales.map((sale) => {
    const inventoryItem = sale.inventory_item_id
      ? inventoryById.get(sale.inventory_item_id)
      : undefined

    return {
      section: 'detail',
      report: label,
      range_start: startDate,
      range_end: endDate,
      platform_filter: selectedPlatform || 'All platforms',
      sale_date: sale.sale_date || '',
      item_name: buildItemName(inventoryItem),
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

  const csvRows = [...summaryRows, ...detailRows]

  const csv = `\uFEFF${buildCsv(
    csvRows,
    'No sales found for this report range.'
  )}`

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
