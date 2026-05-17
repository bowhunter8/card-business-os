import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  getExpenseCategoryOptions,
  getExpenseScheduleCArea,
} from '@/lib/reports/expense-categories'

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
  category?: string
}>

type ReportPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'

type ExpenseRow = {
  id: string
  expense_date: string | null
  category: string | null
  vendor: string | null
  amount: number | null
  notes: string | null
  created_at: string | null
}

type ExpenseCategorySummaryRow = {
  category: string
  amount: number
  count: number
  scheduleCArea: string
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
      label: `Daily Expenses Report: ${dateToInputValue(selectedDay)}`,
    }
  }

  if (period === 'week') {
    const selectedDay = parseInputDate(start, defaultAnchor)
    const weekStart = getStartOfWeek(selectedDay)
    const weekEnd = getEndOfWeek(selectedDay)

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      label: `Weekly Expenses Report: ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    }
  }

  if (period === 'month') {
    const monthStart = new Date(selectedYear, month - 1, 1)
    const monthEnd = new Date(selectedYear, month, 0)

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      label: `Monthly Expenses Report: ${monthStart.toLocaleString('default', {
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
      label: `Quarterly Expenses Report: Q${quarter} ${selectedYear}`,
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
      label: `Custom Expenses Report: ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
    }
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
    label: `Yearly Expenses Report: ${selectedYear}`,
  }
}

function buildRangeHref(params: {
  year: number
  period: ReportPeriod
  start?: string
  end?: string
  month?: number
  quarter?: number
  category?: string
}) {
  const searchParams = new URLSearchParams()
  searchParams.set('year', String(params.year))
  searchParams.set('period', params.period)

  if (params.start) searchParams.set('start', params.start)
  if (params.end) searchParams.set('end', params.end)
  if (params.month) searchParams.set('month', String(params.month))
  if (params.quarter) searchParams.set('quarter', String(params.quarter))
  if (params.category) searchParams.set('category', params.category)

  return `/app/reports/expenses?${searchParams.toString()}`
}

function normalizeCategoryFilter(raw?: string) {
  const value = String(raw ?? '').trim()
  return value
}

function buildWarnings({
  expenses,
  categoryRows,
  selectedPeriod,
}: {
  expenses: ExpenseRow[]
  categoryRows: ExpenseCategorySummaryRow[]
  selectedPeriod: ReportPeriod
}) {
  const warnings: string[] = []

  if (selectedPeriod !== 'year') {
    warnings.push(
      'This is a period expense report. Only manual expenses inside the selected date range are included.'
    )
  }

  if (
    categoryRows.some(
      (row) =>
        row.scheduleCArea === 'Other expenses' ||
        row.category.toLowerCase().includes('uncategorized')
    )
  ) {
    warnings.push(
      'Other / uncategorized manual expenses exist. Review and rename categories before filing if possible.'
    )
  }

  if (
    categoryRows.some(
      (row) =>
        row.category.toLowerCase().includes('shipping') ||
        row.category.toLowerCase().includes('postage') ||
        row.category.toLowerCase().includes('supplies')
    )
  ) {
    warnings.push(
      'Shipping, postage, and supplies categories exist. Review sale-level shipping_cost before filing to avoid double counting supplies or postage.'
    )
  }

  if (
    expenses.some((expense) => {
      const combined = `${expense.category ?? ''} ${expense.notes ?? ''}`.toLowerCase()
      return combined.includes('giveaway')
    })
  ) {
    warnings.push(
      'Giveaway expenses should have clear business intent notes, such as stream giveaway, buyer retention, follower growth, or promotion support.'
    )
  }

  if (expenses.some((expense) => Number(expense.amount ?? 0) < 0)) {
    warnings.push(
      'Negative expense amounts exist. Review whether these are refunds, corrections, or entries that should be handled separately.'
    )
  }

  if (warnings.length === 0) {
    warnings.push('No major expense-readiness warnings were detected from this report.')
  }

  return warnings
}

export default async function ExpensesReportPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const selectedYear = clampYear(params?.year)
  const selectedPeriod = normalizePeriod(params?.period)
  const selectedMonth = clampMonth(params?.month)
  const selectedQuarter = clampQuarter(params?.quarter)
  const selectedCategory = normalizeCategoryFilter(params?.category)
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
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const currentQuarter = Math.floor(new Date().getMonth() / 3) + 1

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

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

  const [expensesRes, categoriesRes] = await Promise.all([
    expensesQuery,
    supabase
      .from('expenses')
      .select('category')
      .eq('user_id', user.id)
      .order('category', { ascending: true }),
  ])

  const expenses: ExpenseRow[] = (expensesRes.data ?? []) as ExpenseRow[]
  const allCategoryRows = (categoriesRes.data ?? []) as Array<{ category: string | null }>

  const categoryOptions = getExpenseCategoryOptions(
    allCategoryRows
      .map((row) => String(row.category || '').trim())
      .filter(Boolean)
  )

  const expenseByCategory = new Map<string, { amount: number; count: number }>()

  for (const expense of expenses) {
    const category = String(expense.category || 'Uncategorized').trim() || 'Uncategorized'
    const current = expenseByCategory.get(category) ?? { amount: 0, count: 0 }

    expenseByCategory.set(category, {
      amount: current.amount + Number(expense.amount ?? 0),
      count: current.count + 1,
    })
  }

  const expenseCategoryRows: ExpenseCategorySummaryRow[] = Array.from(
    expenseByCategory.entries()
  )
    .map(([category, values]) => ({
      category,
      amount: roundMoney(values.amount),
      count: values.count,
      scheduleCArea: getExpenseScheduleCArea(category),
    }))
    .sort((left, right) =>
      left.category.localeCompare(right.category, undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    )

  const totalExpenses = roundMoney(
    expenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  )

  const advertisingTotal = roundMoney(
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === 'Advertising')
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const shippingPostageTotal = roundMoney(
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === 'Other expenses / Postage and shipping')
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const suppliesTotal = roundMoney(
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === 'Supplies')
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const otherExpensesTotal = roundMoney(
    expenseCategoryRows
      .filter((row) => row.scheduleCArea === 'Other expenses')
      .reduce((sum, row) => sum + row.amount, 0)
  )

  const largestExpense = expenses.reduce<ExpenseRow | null>((largest, expense) => {
    if (!largest) return expense
    return Number(expense.amount ?? 0) > Number(largest.amount ?? 0) ? expense : largest
  }, null)

  const averageExpense = expenses.length > 0 ? roundMoney(totalExpenses / expenses.length) : 0

  const warnings = buildWarnings({
    expenses,
    categoryRows: expenseCategoryRows,
    selectedPeriod,
  })

  return (
    <div className="app-page-wide space-y-4">
      <div className="app-page-header">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Reports</p>
          <h1 className="app-title">Expenses Report</h1>
          <p className="app-subtitle">
            Read-only expense reporting by date range, category, Schedule C area, vendor,
            giveaways, supplies, postage, and other deductible business expenses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/reports" className="app-button">
            Back to Reports
          </Link>

          <Link href="/app/expenses" className="app-button">
            Open Expenses Page
          </Link>

          <ReportExportButtons
            csvHref={`/api/reports/expenses/export?${new URLSearchParams({
              year: String(selectedYear),
              period: selectedPeriod,
              ...(selectedStart ? { start: selectedStart } : {}),
              ...(selectedEnd ? { end: selectedEnd } : {}),
              ...(selectedMonth ? { month: String(selectedMonth) } : {}),
              ...(selectedQuarter ? { quarter: String(selectedQuarter) } : {}),
              ...(selectedCategory ? { category: selectedCategory } : {}),
            }).toString()}`}
            pdfHref={`/api/reports/expenses/PDF?${new URLSearchParams({
              year: String(selectedYear),
              period: selectedPeriod,
              ...(selectedStart ? { start: selectedStart } : {}),
              ...(selectedEnd ? { end: selectedEnd } : {}),
              ...(selectedMonth ? { month: String(selectedMonth) } : {}),
              ...(selectedQuarter ? { quarter: String(selectedQuarter) } : {}),
              ...(selectedCategory ? { category: selectedCategory } : {}),
            }).toString()}`}
            printHref={`/api/reports/expenses/print?${new URLSearchParams({
              year: String(selectedYear),
              period: selectedPeriod,
              ...(selectedStart ? { start: selectedStart } : {}),
              ...(selectedEnd ? { end: selectedEnd } : {}),
              ...(selectedMonth ? { month: String(selectedMonth) } : {}),
              ...(selectedQuarter ? { quarter: String(selectedQuarter) } : {}),
              ...(selectedCategory ? { category: selectedCategory } : {}),
            }).toString()}`}
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
          resetHref="/app/reports/expenses"
        >
          <label className="block xl:col-span-2">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Category
            </span>

            <select
              name="category"
              defaultValue={selectedCategory}
              className="app-select h-9 text-sm"
            >
              <option value="">All categories</option>

              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
        </ReportDateFilters>
      </form>

      <section className="app-section px-3 py-3">
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildRangeHref({
              year: currentYear,
              period: 'day',
              start: todayValue,
              category: selectedCategory,
            })}
            className="app-button"
          >
            Today
          </Link>

          <Link
            href={buildRangeHref({
              year: currentYear,
              period: 'week',
              start: todayValue,
              category: selectedCategory,
            })}
            className="app-button"
          >
            This Week
          </Link>

          <Link
            href={buildRangeHref({
              year: currentYear,
              period: 'month',
              month: currentMonth,
              category: selectedCategory,
            })}
            className="app-button"
          >
            This Month
          </Link>

          <Link
            href={buildRangeHref({
              year: currentYear,
              period: 'quarter',
              quarter: currentQuarter,
              category: selectedCategory,
            })}
            className="app-button"
          >
            This Quarter
          </Link>

          <Link
            href={buildRangeHref({
              year: currentYear,
              period: 'year',
              category: selectedCategory,
            })}
            className="app-button"
          >
            This Year
          </Link>
        </div>

        <div className="mt-3 border-t border-zinc-800 pt-3">
          <div className="text-sm font-semibold text-zinc-100">{reportRangeLabel}</div>
          <div className="mt-1 text-xs text-zinc-400">
            Range used for manual expenses: {startDate} through {endDate}.
            {selectedCategory ? ` Category filter: ${selectedCategory}.` : ' Category filter: all categories.'}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            This page is read-only. Add, edit, delete, and correction actions stay on the normal Expenses page.
          </div>
        </div>
      </section>

      <ReportSummaryCards
        cards={[
          { label: 'Total Expenses', value: money(totalExpenses), note: `${expenses.length} records` },
          { label: 'Expense Count', value: String(expenses.length), note: 'Manual expenses' },
          { label: 'Average Expense', value: money(averageExpense), note: 'Per record' },
          { label: 'Largest Expense', value: money(largestExpense?.amount), note: largestExpense?.vendor || '—' },
          { label: 'Advertising / Giveaways', value: money(advertisingTotal), note: 'Schedule C area' },
          { label: 'Postage / Shipping', value: money(shippingPostageTotal), note: 'Review duplicates' },
          { label: 'Supplies', value: money(suppliesTotal), note: 'Supply expenses' },
          { label: 'Other Expenses Review', value: money(otherExpensesTotal), note: 'Needs review' },
        ]}
      />

      <section className="app-section space-y-3">
        <h2 className="text-base font-semibold text-zinc-100">Expense Report Warnings</h2>
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
            Schedule C Category Summary ({expenseCategoryRows.length})
          </h2>
          <p className="text-sm text-zinc-400">
            Expenses grouped by category with their current Schedule C reporting area.
          </p>
        </div>

        <ReportTable
          rows={expenseCategoryRows}
          emptyMessage="No manual expenses found for this report range."
          columns={[
            { key: 'category', label: 'Category', render: (row) => row.category },
            { key: 'scheduleCArea', label: 'Schedule C Area', render: (row) => row.scheduleCArea },
            { key: 'count', label: 'Count', align: 'right', render: (row) => row.count },
            { key: 'amount', label: 'Amount', align: 'right', render: (row) => money(row.amount) },
          ]}
        />
      </section>

      <section className="app-section space-y-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">
            Expense Detail ({expenses.length})
          </h2>
          <p className="text-sm text-zinc-400">
            Read-only detail for manual expenses inside the selected report range.
          </p>
        </div>

        <ReportTable
          rows={expenses}
          emptyMessage="No manual expenses found for this report range."
          columns={[
            { key: 'date', label: 'Date', className: 'whitespace-nowrap', render: (expense) => expense.expense_date || '—' },
            {
              key: 'category',
              label: 'Category',
              render: (expense) =>
                String(expense.category || 'Uncategorized').trim() || 'Uncategorized',
            },
            {
              key: 'scheduleCArea',
              label: 'Schedule C Area',
              render: (expense) => {
                const category =
                  String(expense.category || 'Uncategorized').trim() || 'Uncategorized'

                return getExpenseScheduleCArea(category)
              },
            },
            { key: 'vendor', label: 'Vendor', render: (expense) => expense.vendor || '—' },
            { key: 'notes', label: 'Notes', className: 'min-w-[220px]', render: (expense) => expense.notes || '—' },
            { key: 'amount', label: 'Amount', align: 'right', render: (expense) => money(expense.amount) },
          ]}
        />
      </section>
    </div>
  )
}
