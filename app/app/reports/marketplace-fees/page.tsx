import Link from 'next/link'
import ReportDateFilters from '@/app/app/components/reports/ReportDateFilters'
import ReportExportButtons from '@/app/app/components/reports/ReportExportButtons'
import ReportSummaryCards from '@/app/app/components/reports/ReportSummaryCards'
import ReportTable from '@/app/app/components/reports/ReportTable'
import { createClient } from '@/lib/supabase/server'
import {
  buildReportCsvHref,
  buildReportPdfHref,
  buildReportPrintHref,
} from '@/lib/reports/report-url-utils'

type SearchParams = {
  q?: string
  platform?: string
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
  net_proceeds: number | string | null
  profit: number | string | null
  platform: string | null
  notes: string | null
}

type MarketplaceFeeRow = {
  platform: string
  salesCount: number
  grossSales: number
  platformFees: number
  feeRate: number
  netProceeds: number
  profit: number
  notes: string
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0
  const numeric =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(numeric) ? numeric : 0
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number.isFinite(value) ? value : 0)
}

function normalizePeriod(raw?: string | null): ReportPeriod {
  if (raw === 'day' || raw === 'daily') return 'daily'
  if (raw === 'week' || raw === 'weekly') return 'weekly'
  if (raw === 'month' || raw === 'monthly') return 'monthly'
  if (raw === 'quarter' || raw === 'quarterly') return 'quarterly'
  if (raw === 'year' || raw === 'yearly') return 'yearly'
  if (raw === 'custom') return 'custom'
  return 'monthly'
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
      label: `Daily Marketplace Fee Report: ${dateToInputValue(selectedDay)}`,
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
      label: `Weekly Marketplace Fee Report: ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    }
  }

  if (period === 'monthly') {
    const monthStart = new Date(selectedYear, month - 1, 1)
    const monthEnd = new Date(selectedYear, month, 0)
    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      date: dateToInputValue(monthStart),
      label: `Monthly Marketplace Fee Report: ${monthStart.toLocaleString('default', { month: 'long' })} ${selectedYear}`,
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
      label: `Quarterly Marketplace Fee Report: Q${quarter} ${selectedYear}`,
    }
  }

  if (period === 'yearly') {
    return {
      startDate: `${selectedYear}-01-01`,
      endDate: `${selectedYear}-12-31`,
      date: `${selectedYear}-01-01`,
      label: `Yearly Marketplace Fee Report: ${selectedYear}`,
    }
  }

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
    label: `Custom Marketplace Fee Report: ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
  }
}

function platformKey(value: string | null | undefined) {
  return String(value || 'Unknown').trim() || 'Unknown'
}

function matchesSearch(values: unknown[], search: string) {
  if (!search) return true

  return values
    .map((value) => String(value ?? ''))
    .join(' ')
    .toLowerCase()
    .includes(search.toLowerCase())
}

export default async function MarketplaceFeesReportPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const resolvedSearchParams = (await searchParams) || {}

  const search = resolvedSearchParams.q?.trim() || ''
  const selectedPlatformRaw = resolvedSearchParams.platform?.trim() || ''
  const selectedPlatform =
    selectedPlatformRaw && selectedPlatformRaw !== 'all' ? selectedPlatformRaw : ''
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
    ...(selectedPlatform ? { platform: selectedPlatform } : {}),
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
  let salesError: { message: string } | null = null

  if (user) {
    let salesQuery = supabase
      .from('sales')
      .select(
        `
        id,
        sale_date,
        gross_sale,
        platform_fees,
        net_proceeds,
        profit,
        platform,
        notes
      `
      )
      .eq('user_id', user.id)
      .is('reversed_at', null)
      .gte('sale_date', resolvedDateRange.startDate)
      .lte('sale_date', resolvedDateRange.endDate)
      .order('sale_date', { ascending: false })

    if (selectedPlatform) {
      salesQuery = salesQuery.ilike('platform', `%${selectedPlatform}%`)
    }

    const salesResponse = await salesQuery

    sales = (salesResponse.data ?? []) as SaleRow[]
    salesError = salesResponse.error
  }

  const filteredSales = sales.filter((sale) =>
    matchesSearch(
      [
        sale.sale_date,
        sale.platform,
        sale.gross_sale,
        sale.platform_fees,
        sale.net_proceeds,
        sale.profit,
        sale.notes,
      ],
      search
    )
  )

  const platformRows: MarketplaceFeeRow[] = Array.from(
    filteredSales.reduce((map, sale) => {
      const platform = platformKey(sale.platform)
      const current = map.get(platform) ?? {
        salesCount: 0,
        grossSales: 0,
        platformFees: 0,
        netProceeds: 0,
        profit: 0,
      }

      map.set(platform, {
        salesCount: current.salesCount + 1,
        grossSales: current.grossSales + asNumber(sale.gross_sale),
        platformFees: current.platformFees + asNumber(sale.platform_fees),
        netProceeds: current.netProceeds + asNumber(sale.net_proceeds),
        profit: current.profit + asNumber(sale.profit),
      })

      return map
    }, new Map<string, Omit<MarketplaceFeeRow, 'platform' | 'feeRate' | 'notes'>>())
  )
    .map(([platform, values]) => {
      const feeRate =
        values.grossSales > 0 ? (values.platformFees / values.grossSales) * 100 : 0

      return {
        platform,
        ...values,
        feeRate,
        notes:
          feeRate > 20
            ? 'High fee rate review'
            : values.platformFees <= 0 && values.grossSales > 0
              ? 'No fee recorded'
              : 'OK',
      }
    })
    .sort((a, b) => b.platformFees - a.platformFees)

  const totalGrossSales = filteredSales.reduce(
    (sum, sale) => sum + asNumber(sale.gross_sale),
    0
  )
  const totalPlatformFees = filteredSales.reduce(
    (sum, sale) => sum + asNumber(sale.platform_fees),
    0
  )
  const totalNetProceeds = filteredSales.reduce(
    (sum, sale) => sum + asNumber(sale.net_proceeds),
    0
  )
  const totalProfit = filteredSales.reduce((sum, sale) => sum + asNumber(sale.profit), 0)
  const averageFeeRate =
    totalGrossSales > 0 ? (totalPlatformFees / totalGrossSales) * 100 : 0
  const highestFeePlatform = platformRows[0]?.platform || '—'

  return (
    <main className="app-page space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Reports</p>
          <h1 className="app-title">Marketplace Fee Report</h1>
          <p className="app-subtitle">
            Review platform fees by marketplace, fee rate, gross sales, net proceeds, and profit.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/reports" className="app-button">
            Back to Reports
          </Link>

          <Link href="/app/reports/tax" className="app-button">
            Financial Reports
          </Link>

          <ReportExportButtons
            csvHref={buildReportCsvHref('platform-profitability', exportParams)}
            pdfHref={buildReportPdfHref('platform-profitability', exportParams)}
            printHref={buildReportPrintHref('platform-profitability', exportParams)}
          />
        </div>
      </div>

      {!user ? (
        <section className="app-section border-red-900 bg-red-950/30">
          <h2 className="text-lg font-semibold text-red-100">
            Marketplace fee report could not load
          </h2>
          <p className="mt-1 text-sm text-red-200">
            You must be signed in to view this report.
          </p>
        </section>
      ) : null}

      {salesError ? (
        <section className="app-section border-red-900 bg-red-950/30">
          <h2 className="text-lg font-semibold text-red-100">
            Marketplace fee data could not fully load
          </h2>
          <p className="mt-1 text-sm text-red-200">
            Sales error: {salesError.message}.
          </p>
        </section>
      ) : null}

      <section className="app-alert-info">
        Platform fees are treated as selling costs. Use this report to compare marketplace costs and spot missing or unusually high fee entries.
      </section>

      <form action="/app/reports/marketplace-fees" method="get" className="space-y-3">
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
          resetHref="/app/reports/marketplace-fees"
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
                placeholder="Platform, notes, fee amount..."
                className="app-input h-9 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Platform
              </span>

              <input
                name="platform"
                type="text"
                defaultValue={selectedPlatform}
                placeholder="All platforms"
                className="app-input h-9 text-sm"
              />
            </label>
          </>
        </ReportDateFilters>
      </form>

      <section className="app-section px-3 py-3">
        <div className="text-sm font-semibold text-zinc-100">
          {resolvedDateRange.label}
        </div>

        <div className="mt-1 text-xs text-zinc-400">
          Range used for marketplace fees: {resolvedDateRange.startDate} through{' '}
          {resolvedDateRange.endDate}. Platform:{' '}
          {selectedPlatform || 'All platforms'}.
          {search ? ` Search filter: ${search}.` : ' Search filter: none.'}
        </div>
      </section>

      <ReportSummaryCards
        cards={[
          {
            label: 'Platform Fees',
            value: formatCurrency(totalPlatformFees),
            note: 'Total fee cost',
          },
          {
            label: 'Gross Sales',
            value: formatCurrency(totalGrossSales),
            note: `${filteredSales.length.toLocaleString()} sale record(s)`,
          },
          {
            label: 'Average Fee Rate',
            value: `${averageFeeRate.toFixed(1)}%`,
            note: 'Fees divided by gross sales',
          },
          {
            label: 'Net Proceeds',
            value: formatCurrency(totalNetProceeds),
            note: 'After tracked sale costs',
          },
          {
            label: 'Profit',
            value: formatCurrency(totalProfit),
            note: 'Recorded sale profit',
          },
          {
            label: 'Highest Fee Platform',
            value: highestFeePlatform,
            note: 'Largest fee total',
          },
        ]}
      />

      <section className="app-section space-y-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">
            Platform Fee Summary
          </h2>
          <p className="text-sm text-zinc-400">
            Grouped by marketplace/platform from completed, non-reversed sales.
          </p>
        </div>

        <ReportTable
          rows={platformRows}
          emptyMessage="No marketplace fee records found for this range."
          columns={[
            {
              key: 'platform',
              label: 'Platform',
              render: (row) => (
                <span className="font-medium text-zinc-100">{row.platform}</span>
              ),
            },
            {
              key: 'salesCount',
              label: 'Sales',
              align: 'right',
              render: (row) => row.salesCount.toLocaleString(),
            },
            {
              key: 'grossSales',
              label: 'Gross Sales',
              align: 'right',
              render: (row) => formatCurrency(row.grossSales),
            },
            {
              key: 'platformFees',
              label: 'Platform Fees',
              align: 'right',
              render: (row) => (
                <span className="font-semibold text-red-300">
                  {formatCurrency(row.platformFees)}
                </span>
              ),
            },
            {
              key: 'feeRate',
              label: 'Fee Rate',
              align: 'right',
              render: (row) => `${row.feeRate.toFixed(1)}%`,
            },
            {
              key: 'netProceeds',
              label: 'Net Proceeds',
              align: 'right',
              render: (row) => formatCurrency(row.netProceeds),
            },
            {
              key: 'profit',
              label: 'Profit',
              align: 'right',
              render: (row) => formatCurrency(row.profit),
            },
            {
              key: 'notes',
              label: 'Review',
              render: (row) => (
                <span
                  className={
                    row.notes === 'OK'
                      ? 'text-emerald-300'
                      : 'font-semibold text-amber-300'
                  }
                >
                  {row.notes}
                </span>
              ),
            },
          ]}
        />
      </section>
    </main>
  )
}
