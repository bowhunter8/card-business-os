export type ReportPeriod =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'custom'

export type ReportDateRangeInput = {
  period?: string | null
  date?: string | null
  year?: string | number | null
  month?: string | number | null
  quarter?: string | number | null
  startDate?: string | null
  endDate?: string | null
}

export type ReportDateRange = {
  period: ReportPeriod
  startDate: string
  endDate: string
  label: string
}

const VALID_PERIODS: ReportPeriod[] = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
  'custom',
]

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function toDateOnly(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function parseDateOnly(value?: string | null) {
  if (!value) return null

  const clean = String(value).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null

  const [year, month, day] = clean.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

function safeNumber(value: string | number | null | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function startOfWeekSunday(date: Date) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() - copy.getDay())
  return copy
}

function endOfWeekSaturday(date: Date) {
  const start = startOfWeekSunday(date)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return end
}

function formatHumanDate(dateOnly: string) {
  const parsed = parseDateOnly(dateOnly)
  if (!parsed) return dateOnly

  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function normalizePeriod(value?: string | null): ReportPeriod {
  if (VALID_PERIODS.includes(value as ReportPeriod)) {
    return value as ReportPeriod
  }

  return 'monthly'
}

export function getCurrentReportDefaults(today = new Date()) {
  return {
    date: toDateOnly(today),
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    quarter: Math.floor(today.getMonth() / 3) + 1,
  }
}

export function buildReportDateRange(
  input: ReportDateRangeInput = {},
  today = new Date()
): ReportDateRange {
  const period = normalizePeriod(input.period)
  const defaults = getCurrentReportDefaults(today)

  if (period === 'daily') {
    const date = parseDateOnly(input.date) ?? today
    const dateOnly = toDateOnly(date)

    return {
      period,
      startDate: dateOnly,
      endDate: dateOnly,
      label: `Daily Report: ${formatHumanDate(dateOnly)}`,
    }
  }

  if (period === 'weekly') {
    const date = parseDateOnly(input.date) ?? today
    const start = toDateOnly(startOfWeekSunday(date))
    const end = toDateOnly(endOfWeekSaturday(date))

    return {
      period,
      startDate: start,
      endDate: end,
      label: `Weekly Report: ${formatHumanDate(start)} - ${formatHumanDate(end)}`,
    }
  }

  if (period === 'monthly') {
    const year = safeNumber(input.year, defaults.year)
    const month = clamp(safeNumber(input.month, defaults.month), 1, 12)

    const start = `${year}-${pad2(month)}-01`
    const endDate = new Date(year, month, 0)
    const end = toDateOnly(endDate)

    return {
      period,
      startDate: start,
      endDate: end,
      label: `Monthly Report: ${endDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
      })}`,
    }
  }

  if (period === 'quarterly') {
    const year = safeNumber(input.year, defaults.year)
    const quarter = clamp(safeNumber(input.quarter, defaults.quarter), 1, 4)
    const startMonth = (quarter - 1) * 3 + 1
    const endMonth = startMonth + 2

    const start = `${year}-${pad2(startMonth)}-01`
    const endDate = new Date(year, endMonth, 0)
    const end = toDateOnly(endDate)

    return {
      period,
      startDate: start,
      endDate: end,
      label: `Quarterly Report: Q${quarter} ${year}`,
    }
  }

  if (period === 'yearly') {
    const year = safeNumber(input.year, defaults.year)

    return {
      period,
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      label: `Yearly Report: ${year}`,
    }
  }

  const fallbackStart = `${defaults.year}-01-01`
  const fallbackEnd = toDateOnly(today)
  const parsedStart = parseDateOnly(input.startDate)
  const parsedEnd = parseDateOnly(input.endDate)

  const start = parsedStart ? toDateOnly(parsedStart) : fallbackStart
  const end = parsedEnd ? toDateOnly(parsedEnd) : fallbackEnd

  if (start > end) {
    return {
      period: 'custom',
      startDate: end,
      endDate: start,
      label: `Custom Report: ${formatHumanDate(end)} - ${formatHumanDate(start)}`,
    }
  }

  return {
    period: 'custom',
    startDate: start,
    endDate: end,
    label: `Custom Report: ${formatHumanDate(start)} - ${formatHumanDate(end)}`,
  }
}

export function dateRangeToSearchParams(range: ReportDateRange) {
  const params = new URLSearchParams()

  params.set('period', range.period)
  params.set('startDate', range.startDate)
  params.set('endDate', range.endDate)

  return params
}

export function isDateInRange(dateValue: string | null | undefined, range: ReportDateRange) {
  if (!dateValue) return false

  const dateOnly = String(dateValue).slice(0, 10)

  return dateOnly >= range.startDate && dateOnly <= range.endDate
}

export function getDateRangeWhereLabel(range: ReportDateRange) {
  return `${range.startDate} through ${range.endDate}`
}
