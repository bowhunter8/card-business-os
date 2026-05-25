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
}

type ExpenseRow = {
  id: string
  expense_date: string | null
  category: string | null
  vendor: string | null
  amount: number | string | null
  notes: string | null
  created_at: string | null
}

type ProfitLossRow = {
  section: string
  line: string
  amount: number
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
      label: `Daily Profit & Loss: ${dateToInputValue(selectedDay)}`,
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
      label: `Weekly Profit & Loss: ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    }
  }

  if (period === 'monthly') {
    const monthStart = new Date(selectedYear, month - 1, 1)
    const monthEnd = new Date(selectedYear, month, 0)
    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      date: dateToInputValue(monthStart),
      label: `Monthly Profit & Loss: ${monthStart.toLocaleString('default', {
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
      date: dateToInputValue(quarterStart),
      label: `Quarterly Profit & Loss: Q${quarter} ${selectedYear}`,
    }
  }

  if (period === 'yearly') {
    return {
      startDate: `${selectedYear}-01-01`,
      endDate: `${selectedYear}-12-31`,
      date: `${selectedYear}-01-01`,
      label: `Yearly Profit & Loss: ${selectedYear}`,
    }
  }

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
    date: dateToInputValue(normalizedStart),
    label: `Custom Profit & Loss: ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
  }
}

function matchesSearch(values: unknown[], search: string) {
  if (!search) return true
  return values
    .map((value) => String(value ?? ''))
    .join(' ')
    .toLowerCase()
    .includes(search.toLowerCase())
}

export default async function ProfitLossReportPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const resolvedSearchParams = (await searchParams) || {}

  const search = resolvedSearchParams.q?.trim() || ''
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
  let expenses: ExpenseRow[] = []
  let salesError: { message: string } | null = null
  let expensesError: { message: string } | null = null

  if (user) {
    const [salesResponse, expensesResponse] = await Promise.all([
      supabase
        .from('sales')
        .select(
          `
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
          notes
        `
        )
        .eq('user_id', user.id)
        .is('reversed_at', null)
        .gte('sale_date', resolvedDateRange.startDate)
        .lte('sale_date', resolvedDateRange.endDate)
        .order('sale_date', { ascending: false }),

      supabase
        .from('expenses')
        .select('id, expense_date, category, vendor, amount, notes, created_at')
        .eq('user_id', user.id)
        .gte('expense_date', resolvedDateRange.startDate)
        .lte('expense_date', resolvedDateRange.endDate)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ])

    sales = (salesResponse.data ?? []) as SaleRow[]
    expenses = (expensesResponse.data ?? []) as ExpenseRow[]
    salesError = salesResponse.error
    expensesError = expensesResponse.error
  }

  const filteredSales = sales.filter((sale) =>
    matchesSearch(
      [
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
      ],
      search
    )
  )

  const filteredExpenses = expenses.filter((expense) =>
    matchesSearch(
      [
        expense.expense_date,
        expense.category,
        expense.vendor,
        expense.amount,
        expense.notes,
      ],
      search
    )
  )

  const grossSales = filteredSales.reduce((sum, sale) => sum + asNumber(sale.gross_sale), 0)
  const platformFees = filteredSales.reduce((sum, sale) => sum + asNumber(sale.platform_fees), 0)
  const shippingCosts = filteredSales.reduce((sum, sale) => sum + asNumber(sale.shipping_cost), 0)
  const otherSellingCosts = filteredSales.reduce((sum, sale) => sum + asNumber(sale.other_costs), 0)
  const sellingCosts = platformFees + shippingCosts + otherSellingCosts
  const cogs = filteredSales.reduce((sum, sale) => sum + asNumber(sale.cost_of_goods_sold), 0)
  const manualExpenses = filteredExpenses.reduce((sum, expense) => sum + asNumber(expense.amount), 0)
  const grossProfit = grossSales - cogs
  const netProfit = grossProfit - sellingCosts - manualExpenses
  const netMargin = grossSales > 0 ? (netProfit / grossSales) * 100 : 0

  const rows: ProfitLossRow[] = [
    {
      section: 'Income',
      line: 'Gross sales / receipts',
      amount: grossSales,
      notes: 'Completed, non-reversed sales in the selected range.',
    },
    {
      section: 'COGS',
      line: 'Cost of goods sold',
      amount: -cogs,
      notes: 'Realized cost basis from sold items only.',
    },
    {
      section: 'Gross Profit',
      line: 'Gross profit after COGS',
      amount: grossProfit,
      notes: 'Gross sales minus realized COGS.',
    },
    {
      section: 'Selling Costs',
      line: 'Platform fees',
      amount: -platformFees,
      notes: 'Marketplace/platform fee fields from sales records.',
    },
    {
      section: 'Selling Costs',
      line: 'Shipping / postage costs',
      amount: -shippingCosts,
      notes: 'Sale-level shipping_cost values.',
    },
    {
      section: 'Selling Costs',
      line: 'Other direct selling costs',
      amount: -otherSellingCosts,
      notes: 'Sale-level other_costs values, commonly supplies/packing costs.',
    },
    {
      section: 'Expenses',
      line: 'Manual expenses',
      amount: -manualExpenses,
      notes: 'Expense tracker entries in the selected range.',
    },
    {
      section: 'Net Profit',
      line: 'Net profit / loss',
      amount: netProfit,
      notes: 'Gross profit minus selling costs and manual expenses.',
    },
  ]

  return (
    <main className="app-page space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Reports</p>
          <h1 className="app-title">Profit & Loss Statement</h1>
          <p className="app-subtitle">
            Read-only business profit review showing income, realized COGS,
            selling costs, manual expenses, and net profit or loss.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/reports" className="app-button">
            Back to Reports
          </Link>

          <Link href="/app/reports/tax/summary" className="app-button">
            Year-End Tax Center
          </Link>

          <ReportExportButtons
            csvHref={buildReportCsvHref('profit-loss', exportParams)}
            pdfHref={buildReportPdfHref('profit-loss', exportParams)}
            printHref={buildReportPrintHref('profit-loss', exportParams)}
          />
        </div>
      </div>

      {!user ? (
        <section className="app-section border-red-900 bg-red-950/30">
          <h2 className="text-lg font-semibold text-red-100">
            Profit & loss report could not load
          </h2>
          <p className="mt-1 text-sm text-red-200">
            You must be signed in to view this report.
          </p>
        </section>
      ) : null}

      {salesError || expensesError ? (
        <section className="app-section border-red-900 bg-red-950/30">
          <h2 className="text-lg font-semibold text-red-100">
            Profit & loss data could not fully load
          </h2>
          <p className="mt-1 text-sm text-red-200">
            {salesError ? `Sales error: ${salesError.message}. ` : ''}
            {expensesError ? `Expenses error: ${expensesError.message}.` : ''}
          </p>
        </section>
      ) : null}

      <form action="/app/reports/profit-loss" method="get" className="space-y-3">
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
          resetHref="/app/reports/profit-loss"
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
                placeholder="Platform, category, vendor, notes..."
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
          Range used for profit and loss: {resolvedDateRange.startDate} through{' '}
          {resolvedDateRange.endDate}.
          {search ? ` Search filter: ${search}.` : ' Search filter: none.'}
        </div>

        <div className="mt-1 text-xs text-zinc-500">
          This page is read-only. Add, edit, delete, and correction actions stay
          on the normal sales, expenses, inventory, and tax pages.
        </div>
      </section>

      <ReportSummaryCards
        cards={[
          {
            label: 'Gross Sales',
            value: formatCurrency(grossSales),
            note: `${filteredSales.length.toLocaleString()} sale record(s)`,
          },
          {
            label: 'Realized COGS',
            value: formatCurrency(cogs),
            note: 'Sold item cost basis',
          },
          {
            label: 'Gross Profit',
            value: formatCurrency(grossProfit),
            note: 'Sales minus COGS',
          },
          {
            label: 'Selling Costs',
            value: formatCurrency(sellingCosts),
            note: 'Fees, shipping, and other sale costs',
          },
          {
            label: 'Manual Expenses',
            value: formatCurrency(manualExpenses),
            note: `${filteredExpenses.length.toLocaleString()} expense record(s)`,
          },
          {
            label: 'Net Profit / Loss',
            value: formatCurrency(netProfit),
            note: `${netMargin.toFixed(1)}% net margin`,
          },
        ]}
      />

      <section className="app-section space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Profit & Loss Detail
            </h2>
            <p className="text-sm text-zinc-400">
              Accountant-friendly rollup of sales, realized COGS, direct selling
              costs, and tracked expenses.
            </p>
          </div>

          <div className="rounded-full border border-emerald-900 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-300">
            Read-Only Statement
          </div>
        </div>

        <ReportTable
          rows={rows}
          emptyMessage="No profit and loss rows found for this range."
          columns={[
            {
              key: 'section',
              label: 'Section',
              render: (row) => (
                <span className="font-medium text-zinc-100">{row.section}</span>
              ),
            },
            {
              key: 'line',
              label: 'Line',
              render: (row) => row.line,
            },
            {
              key: 'amount',
              label: 'Amount',
              align: 'right',
              render: (row) => (
                <span
                  className={
                    row.amount < 0
                      ? 'font-semibold text-red-300'
                      : 'font-semibold text-emerald-300'
                  }
                >
                  {formatCurrency(row.amount)}
                </span>
              ),
            },
            {
              key: 'notes',
              label: 'Notes',
              render: (row) => (
                <span className="text-xs text-zinc-400">{row.notes}</span>
              ),
            },
          ]}
        />
      </section>

      <section className="app-section space-y-2 border-amber-900 bg-amber-950/20">
        <h2 className="text-base font-semibold text-amber-100">
          Tax / CPA Review Notes
        </h2>

        <p className="text-sm leading-6 text-amber-100/80">
          This statement is a management report for business review. Final tax
          filing should use the Year-End Tax Center because it includes Schedule C
          line mapping, beginning inventory, ending inventory, disposal review,
          and tax readiness warnings.
        </p>
      </section>
    </main>
  )
}
