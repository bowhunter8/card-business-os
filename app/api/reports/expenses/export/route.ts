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
      label: `Daily Expenses Report ${dateToInputValue(selectedDay)}`,
    }
  }

  if (period === 'week') {
    const selectedDay = parseInputDate(start, defaultAnchor)
    const weekStart = getStartOfWeek(selectedDay)
    const weekEnd = getEndOfWeek(selectedDay)

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      label: `Weekly Expenses Report ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    }
  }

  if (period === 'month') {
    const monthStart = new Date(selectedYear, month - 1, 1)
    const monthEnd = new Date(selectedYear, month, 0)

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      label: `Monthly Expenses Report ${monthStart.toLocaleString('default', {
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
      label: `Quarterly Expenses Report Q${quarter} ${selectedYear}`,
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
      label: `Custom Expenses Report ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
    }
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
    label: `Yearly Expenses Report ${selectedYear}`,
  }
}

export async function GET(request: Request) {
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

  const csv = `\uFEFF${buildCsv(
    csvRows,
    'No manual expenses found for this report range.'
  )}`

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
