import { createClient } from '@/lib/supabase/server'
import {
  buildCsv,
  buildReportFilename,
  csvDownloadResponse,
  jsonError,
  moneyString,
  pdfDownloadResponse,
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

function normalizePeriod(raw?: string | null): ReportPeriod {
  if (raw === 'daily' || raw === 'day') return 'day'
  if (raw === 'weekly' || raw === 'week') return 'week'
  if (raw === 'monthly' || raw === 'month') return 'month'
  if (raw === 'quarterly' || raw === 'quarter') return 'quarter'
  if (raw === 'yearly' || raw === 'year') return 'year'
  if (raw === 'custom') return 'custom'
  return 'month'
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
      label: `Daily Sales Tax Report: ${dateToInputValue(selectedDay)}`,
    }
  }

  if (period === 'week') {
    const selectedDay = parseInputDate(start, defaultAnchor)
    const weekStart = getStartOfWeek(selectedDay)
    const weekEnd = getEndOfWeek(selectedDay)
    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      label: `Weekly Sales Tax Report: ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    }
  }

  if (period === 'month') {
    const monthStart = new Date(selectedYear, month - 1, 1)
    const monthEnd = new Date(selectedYear, month, 0)
    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      label: `Monthly Sales Tax Report: ${monthStart.toLocaleString('default', { month: 'long' })} ${selectedYear}`,
    }
  }

  if (period === 'quarter') {
    const quarterStartMonth = (quarter - 1) * 3
    const quarterStart = new Date(selectedYear, quarterStartMonth, 1)
    const quarterEnd = new Date(selectedYear, quarterStartMonth + 3, 0)
    return {
      startDate: dateToInputValue(quarterStart),
      endDate: dateToInputValue(quarterEnd),
      label: `Quarterly Sales Tax Report: Q${quarter} ${selectedYear}`,
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
      label: `Custom Sales Tax Report: ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
    }
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
    label: `Yearly Sales Tax Report: ${selectedYear}`,
  }
}

function matchesSearch(values: unknown[], search: string) {
  if (!search) return true
  const haystack = values.map(asString).join(' ').toLowerCase()
  return haystack.includes(search.toLowerCase())
}

function platformKey(value: string | null | undefined) {
  return String(value || 'Unknown').trim() || 'Unknown'
}

async function loadSalesTaxReport(request: Request) {
  const { searchParams } = new URL(request.url)
  const selectedYear = clampYear(searchParams.get('year'))
  const selectedPeriod = normalizePeriod(searchParams.get('period'))
  const selectedMonth = clampMonth(searchParams.get('month'))
  const selectedQuarter = clampQuarter(searchParams.get('quarter'))
  const selectedPlatform = String(searchParams.get('platform') || '').trim()
  const search = String(searchParams.get('q') || '').trim()
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

  if (!user) return { errorResponse: unauthorizedError() }

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
  if (error) return { errorResponse: jsonError(`Could not load sales tax report: ${error.message}`) }

  const sales = ((data ?? []) as SaleRow[]).filter((sale) =>
    matchesSearch(
      [
        sale.sale_date,
        sale.gross_sale,
        sale.platform_fees,
        sale.shipping_cost,
        sale.other_costs,
        sale.net_proceeds,
        sale.cost_of_goods_sold,
        sale.profit,
        sale.platform,
        sale.notes,
      ],
      search
    )
  )

  const totals = {
    totalGrossSales: roundMoney(sales.reduce((sum, row) => sum + asNumber(row.gross_sale), 0)),
    totalNetProceeds: roundMoney(sales.reduce((sum, row) => sum + asNumber(row.net_proceeds), 0)),
    totalShippingCosts: roundMoney(sales.reduce((sum, row) => sum + asNumber(row.shipping_cost), 0)),
    totalFees: roundMoney(sales.reduce((sum, row) => sum + asNumber(row.platform_fees), 0)),
    totalTrackedSalesTax: 0,
    marketplaceRemittedTax: 0,
  }

  return { sales, label, startDate, endDate, selectedPlatform, search, totals }
}

export async function GET(request: Request) {
  const result = await loadSalesTaxReport(request)

  if ('errorResponse' in result) return result.errorResponse

  const summaryRows = [
    {
      section: 'summary',
      report: result.label,
      range_start: result.startDate,
      range_end: result.endDate,
      platform_filter: result.selectedPlatform || 'All platforms',
      search_filter: result.search || 'None',
      metric: 'sales_count',
      value: String(result.sales.length),
      note: '',
    },
    {
      section: 'summary',
      report: result.label,
      range_start: result.startDate,
      range_end: result.endDate,
      platform_filter: result.selectedPlatform || 'All platforms',
      search_filter: result.search || 'None',
      metric: 'gross_sales',
      value: moneyString(result.totals.totalGrossSales),
      note: 'Gross sales from completed non-reversed sales.',
    },
    {
      section: 'summary',
      report: result.label,
      range_start: result.startDate,
      range_end: result.endDate,
      platform_filter: result.selectedPlatform || 'All platforms',
      search_filter: result.search || 'None',
      metric: 'tracked_sales_tax_collected',
      value: moneyString(result.totals.totalTrackedSalesTax),
      note: 'Currently zero until sales-tax fields are added to sales records.',
    },
    {
      section: 'summary',
      report: result.label,
      range_start: result.startDate,
      range_end: result.endDate,
      platform_filter: result.selectedPlatform || 'All platforms',
      search_filter: result.search || 'None',
      metric: 'marketplace_remitted_tax',
      value: moneyString(result.totals.marketplaceRemittedTax),
      note: 'Currently zero until marketplace-remitted tax fields are added.',
    },
    {
      section: 'summary',
      report: result.label,
      range_start: result.startDate,
      range_end: result.endDate,
      platform_filter: result.selectedPlatform || 'All platforms',
      search_filter: result.search || 'None',
      metric: 'net_proceeds',
      value: moneyString(result.totals.totalNetProceeds),
      note: '',
    },
  ]

  const detailRows = result.sales.map((sale) => ({
    section: 'sales_tax_detail',
    report: result.label,
    range_start: result.startDate,
    range_end: result.endDate,
    platform_filter: result.selectedPlatform || 'All platforms',
    sale_date: sale.sale_date || '',
    platform: platformKey(sale.platform),
    gross_sale: moneyString(sale.gross_sale),
    tracked_sales_tax_collected: moneyString(0),
    marketplace_remitted_tax: moneyString(0),
    taxable_amount_tracked: moneyString(0),
    tax_tracking_status: 'Not tracked yet',
    shipping_cost: moneyString(sale.shipping_cost),
    platform_fees: moneyString(sale.platform_fees),
    net_proceeds: moneyString(sale.net_proceeds),
    notes: sale.notes || '',
    sale_id: sale.id,
  }))

  const csv = `\uFEFF${buildCsv([...summaryRows, ...detailRows], 'No sales tax records found for this report range.')}`

  const filename = buildReportFilename({
    reportName: 'sales-tax-report',
    startDate: result.startDate,
    endDate: result.endDate,
    extension: 'csv',
  })

  return csvDownloadResponse({ csv, filename })
}
