import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  buildReportCsvHref,
  buildReportPdfHref,
  buildReportPrintHref,
} from '@/lib/reports/report-url-utils'
import {
  buildPresetHref,
  getActiveReportPreset,
  getReportPresets,
  reportPresetShortcutClass,
} from '@/lib/reports/report-presets'
import {
  deleteReportPresetAction,
  saveReportPresetAction,
} from '@/app/app/reports/actions'
import type { UserReportPresetRow } from '@/lib/reports/user-report-presets'

import ReportDateFilters from '@/app/app/components/reports/ReportDateFilters'
import ReportExportButtons from '@/app/app/components/reports/ReportExportButtons'
import ReportSummaryCards from '@/app/app/components/reports/ReportSummaryCards'
import ReportTable from '@/app/app/components/reports/ReportTable'

type SearchParams = Promise<{
  year?: string
  period?: string
  start?: string
  end?: string
  startDate?: string
  endDate?: string
  date?: string
  month?: string
  quarter?: string
  platform?: string
}>

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

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
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
  if (raw === 'daily' || raw === 'day') return 'day'
  if (raw === 'weekly' || raw === 'week') return 'week'
  if (raw === 'monthly' || raw === 'month') return 'month'
  if (raw === 'quarterly' || raw === 'quarter') return 'quarter'
  if (raw === 'yearly' || raw === 'year') return 'year'
  if (raw === 'custom') return 'custom'
  return 'year'
}

function periodToSharedFilterValue(period: ReportPeriod) {
  if (period === 'day') return 'daily'
  if (period === 'week') return 'weekly'
  if (period === 'month') return 'monthly'
  if (period === 'quarter') return 'quarterly'
  if (period === 'year') return 'yearly'
  return 'custom'
}

function dateToInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseInputDate(value: string | undefined, fallback: Date) {
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
  start?: string
  end?: string
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

function buildRangeHref(params: {
  year: number
  period: ReportPeriod
  start?: string
  end?: string
  month?: number
  quarter?: number
  platform?: string
}) {
  const searchParams = new URLSearchParams()
  searchParams.set('year', String(params.year))
  searchParams.set('period', params.period)
  if (params.start) searchParams.set('start', params.start)
  if (params.end) searchParams.set('end', params.end)
  if (params.month) searchParams.set('month', String(params.month))
  if (params.quarter) searchParams.set('quarter', String(params.quarter))
  if (params.platform) searchParams.set('platform', params.platform)
  return `/app/reports/sales?${searchParams.toString()}`
}

function buildSalesCsvHref(params: {
  year: number
  period: ReportPeriod
  startDate: string
  endDate: string
  start?: string
  end?: string
  month?: number
  quarter?: number
  platform?: string
}) {
  return buildReportCsvHref('sales', {
    year: String(params.year),
    period: params.period,
    startDate: params.startDate,
    endDate: params.endDate,
    ...(params.start ? { start: params.start } : {}),
    ...(params.end ? { end: params.end } : {}),
    ...(params.month ? { month: String(params.month) } : {}),
    ...(params.quarter ? { quarter: String(params.quarter) } : {}),
    ...(params.platform ? { platform: params.platform } : {}),
  })
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

function PresetShortcut({
  href,
  label,
  active = false,
}: {
  href: string
  label: string
  active?: boolean
}) {
  return (
    <Link
      href={href}
      className={reportPresetShortcutClass(active)}
    >
      {label}
    </Link>
  )
}

function platformKey(value: string | null | undefined) {
  return String(value || 'Unknown').trim() || 'Unknown'
}

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const selectedYear = clampYear(params?.year)
  const selectedPeriod = normalizePeriod(params?.period)
  const selectedMonth = clampMonth(params?.month)
  const selectedQuarter = clampQuarter(params?.quarter)
  const selectedPlatform = String(params?.platform || '').trim()
  const selectedStart = params?.start || params?.startDate || params?.date
  const selectedEnd = params?.end || params?.endDate

  const { startDate, endDate, label: reportRangeLabel } = getReportDateRange({
    selectedYear,
    period: selectedPeriod,
    start: selectedStart,
    end: selectedEnd,
    month: selectedMonth,
    quarter: selectedQuarter,
  })

  const todayValue = dateToInputValue(new Date())
  const currentMonth = new Date().getMonth() + 1
  const currentQuarter = Math.floor(new Date().getMonth() / 3) + 1

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

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

  const [salesRes, userPresetsRes] = await Promise.all([
    salesQuery,
    supabase
      .from('user_report_presets')
      .select('*')
      .eq('user_id', user.id)
      .eq('report_type', 'sales')
      .order('created_at', { ascending: false }),
  ])

  const sales: SaleRow[] = (salesRes.data ?? []) as SaleRow[]

  const userSalesPresets =
    (userPresetsRes.data ?? []) as UserReportPresetRow[]

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
      : { data: [] }

  const inventoryItems: InventoryRow[] = (inventoryRes.data ?? []) as InventoryRow[]
  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]))

  const platformOptions = Array.from(
    new Set(sales.map((sale) => platformKey(sale.platform)))
  ).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
  )

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
  const averageGrossSale = sales.length > 0 ? roundMoney(totalGrossSales / sales.length) : 0
  const averageProfit = sales.length > 0 ? roundMoney(totalProfit / sales.length) : 0

  const platformSummary = new Map<
    string,
    {
      count: number
      grossSales: number
      sellingCosts: number
      netProceeds: number
      cogs: number
      profit: number
    }
  >()

  for (const sale of sales) {
    const key = platformKey(sale.platform)
    const current = platformSummary.get(key) ?? {
      count: 0,
      grossSales: 0,
      sellingCosts: 0,
      netProceeds: 0,
      cogs: 0,
      profit: 0,
    }

    platformSummary.set(key, {
      count: current.count + 1,
      grossSales: current.grossSales + Number(sale.gross_sale ?? 0),
      sellingCosts:
        current.sellingCosts +
        Number(sale.platform_fees ?? 0) +
        Number(sale.shipping_cost ?? 0) +
        Number(sale.other_costs ?? 0),
      netProceeds: current.netProceeds + Number(sale.net_proceeds ?? 0),
      cogs: current.cogs + Number(sale.cost_of_goods_sold ?? 0),
      profit: current.profit + Number(sale.profit ?? 0),
    })
  }

  const platformSummaryRows = Array.from(platformSummary.entries())
    .map(([platform, values]) => ({
      platform,
      count: values.count,
      grossSales: roundMoney(values.grossSales),
      sellingCosts: roundMoney(values.sellingCosts),
      netProceeds: roundMoney(values.netProceeds),
      cogs: roundMoney(values.cogs),
      profit: roundMoney(values.profit),
    }))
    .sort((left, right) => right.grossSales - left.grossSales)

  const warnings: string[] = []

  if (sales.length === 0) {
    warnings.push('No sales were found for this report range.')
  }

  if (sales.some((sale) => sale.cost_of_goods_sold == null)) {
    warnings.push(
      'One or more sales are missing realized COGS. Review those sales before using this report for tax support.'
    )
  }

  if (sales.some((sale) => sale.inventory_item_id == null)) {
    warnings.push(
      'One or more sales are not linked to an inventory item. Confirm those sales are intentional before filing.'
    )
  }

  if (totalShippingCosts > 0) {
    warnings.push(
      'Sale-level shipping_cost may include postage and/or supplies. Review manual expenses to avoid double counting shipping supplies.'
    )
  }

  if (warnings.length === 0) {
    warnings.push('No major sales report warnings were detected from this summary.')
  }

  const salesPresets = getReportPresets('sales')

  const activePreset = getActiveReportPreset('sales', {
    period: periodToSharedFilterValue(selectedPeriod),
  })

  return (
    <div className="app-page-wide space-y-4">
      <div className="app-page-header">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Reports</p>
          <h1 className="app-title">Sales Report</h1>
          <p className="app-subtitle">
            Read-only sales reporting by date range, platform, gross receipts, selling costs, realized COGS, and profit.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/reports" className="app-button">
            Back to Reports
          </Link>
          <Link href="/app/sales" className="app-button">
            Open Sales Page
          </Link>
          <ReportExportButtons
            csvHref={buildSalesCsvHref({
              year: selectedYear,
              period: selectedPeriod,
              startDate,
              endDate,
              start: selectedStart,
              end: selectedEnd,
              month: selectedMonth,
              quarter: selectedQuarter,
              platform: selectedPlatform,
            })}
            pdfHref={buildReportPdfHref('sales', {
              year: String(selectedYear),
              period: selectedPeriod,
              startDate,
              endDate,
              ...(selectedStart ? { start: selectedStart } : {}),
              ...(selectedEnd ? { end: selectedEnd } : {}),
              ...(selectedMonth ? { month: String(selectedMonth) } : {}),
              ...(selectedQuarter ? { quarter: String(selectedQuarter) } : {}),
              ...(selectedPlatform ? { platform: selectedPlatform } : {}),
            })}
            printHref={buildReportPrintHref('sales', {
              year: String(selectedYear),
              period: selectedPeriod,
              startDate,
              endDate,
              ...(selectedStart ? { start: selectedStart } : {}),
              ...(selectedEnd ? { end: selectedEnd } : {}),
              ...(selectedMonth ? { month: String(selectedMonth) } : {}),
              ...(selectedQuarter ? { quarter: String(selectedQuarter) } : {}),
              ...(selectedPlatform ? { platform: selectedPlatform } : {}),
            })}
          />
        </div>
      </div>

      <form method="get" className="space-y-3">
        <ReportDateFilters
          period={periodToSharedFilterValue(selectedPeriod)}
          date={selectedStart || startDate}
          year={selectedYear}
          month={selectedMonth}
          quarter={selectedQuarter}
          startDate={startDate}
          endDate={endDate}
          resetHref="/app/reports/sales"
        >
          <label className="block xl:col-span-2">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Platform
            </span>

            <select
              name="platform"
              defaultValue={selectedPlatform}
              className="app-select h-9 text-sm"
            >
              <option value="">All platforms</option>

              {platformOptions.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </label>
        </ReportDateFilters>
      </form>

      <section className="app-section px-3 py-3">
        <div className="flex flex-wrap gap-2">
          <Link href={buildRangeHref({ year: new Date().getFullYear(), period: 'day', start: todayValue, platform: selectedPlatform })} className="app-button">
            Today
          </Link>
          <Link href={buildRangeHref({ year: new Date().getFullYear(), period: 'week', start: todayValue, platform: selectedPlatform })} className="app-button">
            This Week
          </Link>
          <Link href={buildRangeHref({ year: new Date().getFullYear(), period: 'month', month: currentMonth, platform: selectedPlatform })} className="app-button">
            This Month
          </Link>
          <Link href={buildRangeHref({ year: new Date().getFullYear(), period: 'quarter', quarter: currentQuarter, platform: selectedPlatform })} className="app-button">
            This Quarter
          </Link>
          <Link href={buildRangeHref({ year: new Date().getFullYear(), period: 'year', platform: selectedPlatform })} className="app-button">
            This Year
          </Link>
        </div>

        <div className="mt-3 border-t border-zinc-800 pt-3">
          <div className="text-sm font-semibold text-zinc-100">{reportRangeLabel}</div>
          <div className="mt-1 text-xs text-zinc-400">
            Range used for sales: {startDate} through {endDate}.
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            This page is read-only. Add, edit, delete, and reversal actions stay on the normal Sales page.
          </div>
        </div>
      </section>

      <section className="app-section space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Save Current Report Preset
            </h2>

            <p className="text-sm text-zinc-400">
              Save the current filters as a reusable sales report preset.
            </p>
          </div>

          <form
            action={saveReportPresetAction}
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="reportType" value="sales" />
            <input type="hidden" name="returnPath" value="/app/reports/sales" />

            <input type="hidden" name="year" value={String(selectedYear)} />
            <input type="hidden" name="period" value={selectedPeriod} />
            <input type="hidden" name="startDate" value={startDate} />
            <input type="hidden" name="endDate" value={endDate} />
            <input type="hidden" name="platform" value={selectedPlatform} />
            <input
              type="hidden"
              name="start"
              value={selectedStart || ''}
            />
            <input
              type="hidden"
              name="end"
              value={selectedEnd || ''}
            />
            <input
              type="hidden"
              name="month"
              value={String(selectedMonth || '')}
            />
            <input
              type="hidden"
              name="quarter"
              value={String(selectedQuarter || '')}
            />

            <label className="block min-w-[220px]">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Preset Name
              </span>

              <input
                type="text"
                name="name"
                required
                placeholder="Monthly Sales Review"
                className="app-input h-9 text-sm"
              />
            </label>

            <button
              type="submit"
              className="app-button-primary h-9 whitespace-nowrap px-3 text-sm"
            >
              Save Preset
            </button>
          </form>
        </div>
      </section>

      <section className="app-section space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Sales Presets
            </h2>

            <p className="text-sm text-zinc-400">
              Quick-launch sales report filters for common review and accounting workflows.
            </p>
          </div>

          <div className="rounded-full border border-emerald-900 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-300">
            Shared Presets Active
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {salesPresets.map((preset) => (
            <PresetShortcut
              key={preset.id}
              href={buildPresetHref('/app/reports/sales', preset)}
              label={preset.name}
              active={activePreset?.id === preset.id}
            />
          ))}
        </div>

        {userSalesPresets.length > 0 ? (
          <div className="border-t border-zinc-800 pt-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Saved Presets
            </div>

            <div className="flex flex-wrap gap-2">
              {userSalesPresets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950 pr-1"
                >
                  <PresetShortcut
                    href={buildPresetHref('/app/reports/sales', {
                      id: preset.id,
                      reportType: 'sales',
                      name: preset.name,
                      description: preset.description || '',
                      params: preset.params,
                    })}
                    label={preset.name}
                  />

                  <form action={deleteReportPresetAction}>
                    <input
                      type="hidden"
                      name="presetId"
                      value={preset.id}
                    />

                    <input
                      type="hidden"
                      name="returnPath"
                      value="/app/reports/sales"
                    />

                    <button
                      type="submit"
                      className="rounded-full border border-red-900 bg-red-950/40 px-2 py-0.5 text-xs font-semibold text-red-200 transition hover:bg-red-900/40"
                      title="Delete preset"
                    >
                      ×
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <ReportSummaryCards
        cards={[
          { label: 'Gross Sales', value: money(totalGrossSales), note: `${sales.length} sales` },
          { label: 'Selling Costs', value: money(totalSellingCosts), note: 'Fees/shipping/other' },
          { label: 'Net Proceeds', value: money(totalNetProceeds), note: 'After selling costs' },
          { label: 'Realized COGS', value: money(totalCOGS), note: 'Inventory cost' },
          { label: 'Income After COGS', value: money(grossIncomeAfterCOGS), note: 'Gross minus COGS' },
          { label: 'Profit', value: money(totalProfit), note: 'Final profit' },
          { label: 'Avg Gross Sale', value: money(averageGrossSale), note: 'Per sale' },
          { label: 'Avg Profit', value: money(averageProfit), note: 'Per sale' },
        ]}
      />

      <section className="app-section space-y-3">
        <h2 className="text-base font-semibold text-zinc-100">Sales Report Warnings</h2>
        <div className="space-y-2">
          {warnings.map((warning) => (
            <div key={warning} className="app-alert-warning">
              {warning}
            </div>
          ))}
        </div>
      </section>

      <section className="app-section space-y-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">
            Platform Summary ({platformSummaryRows.length})
          </h2>
          <p className="text-sm text-zinc-400">
            Sales grouped by platform for the selected report range.
          </p>
        </div>

        <ReportTable
          rows={platformSummaryRows}
          emptyMessage="No platform summary found for this report range."
          columns={[
            { key: 'platform', label: 'Platform', render: (row) => row.platform },
            { key: 'count', label: 'Count', align: 'right', render: (row) => row.count },
            { key: 'gross', label: 'Gross', align: 'right', render: (row) => money(row.grossSales) },
            { key: 'costs', label: 'Fees/Costs', align: 'right', render: (row) => money(row.sellingCosts) },
            { key: 'net', label: 'Net', align: 'right', render: (row) => money(row.netProceeds) },
            { key: 'cogs', label: 'COGS', align: 'right', render: (row) => money(row.cogs) },
            { key: 'profit', label: 'Profit', align: 'right', render: (row) => money(row.profit) },
          ]}
        />
      </section>

      <section className="app-section space-y-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">
            Sales Detail ({sales.length})
          </h2>
          <p className="text-sm text-zinc-400">
            Read-only sales list for export and review. Reversed sales are excluded.
          </p>
        </div>

        <ReportTable
          rows={sales}
          emptyMessage="No sales found for this report range."
          columns={[
            { key: 'date', label: 'Date', className: 'whitespace-nowrap', render: (row) => row.sale_date || '—' },
            {
              key: 'item',
              label: 'Item',
              className: 'min-w-[260px]',
              render: (row) => {
                const inventoryItem = row.inventory_item_id
                  ? inventoryById.get(row.inventory_item_id)
                  : undefined
                return buildItemName(inventoryItem)
              },
            },
            { key: 'platform', label: 'Platform', render: (row) => platformKey(row.platform) },
            { key: 'gross', label: 'Gross', align: 'right', render: (row) => money(row.gross_sale) },
            { key: 'fees', label: 'Platform Fees', align: 'right', render: (row) => money(row.platform_fees) },
            { key: 'shipping', label: 'Shipping', align: 'right', render: (row) => money(row.shipping_cost) },
            { key: 'other', label: 'Other Costs', align: 'right', render: (row) => money(row.other_costs) },
            { key: 'net', label: 'Net', align: 'right', render: (row) => money(row.net_proceeds) },
            { key: 'cogs', label: 'COGS', align: 'right', render: (row) => money(row.cost_of_goods_sold) },
            { key: 'profit', label: 'Profit', align: 'right', render: (row) => money(row.profit) },
            { key: 'notes', label: 'Notes', className: 'min-w-[220px]', render: (row) => row.notes || '—' },
          ]}
        />
      </section>
    </div>
  )
}
