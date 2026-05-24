'use client'

import { useMemo, useState, type ReactNode } from 'react'

type ReportDateFiltersProps = {
  period?: string
  date?: string
  year?: string | number
  month?: string | number
  quarter?: string | number
  startDate?: string
  endDate?: string
  resetHref?: string
  children?: ReactNode
}

type ReportFilterFieldProps = {
  label: string
  children: ReactNode
  className?: string
}

type NormalizedPeriod =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'custom'

const PERIOD_OPTIONS: Array<{ value: NormalizedPeriod; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom Range' },
]

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

const QUARTER_OPTIONS = [
  { value: 1, label: 'Q1' },
  { value: 2, label: 'Q2' },
  { value: 3, label: 'Q3' },
  { value: 4, label: 'Q4' },
]

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

function getEndOfMonth(year: number, month: number) {
  return new Date(year, month, 0)
}

function getQuarterForMonth(month: number) {
  return Math.floor((month - 1) / 3) + 1
}

function getQuarterStartMonth(quarter: number) {
  return (quarter - 1) * 3 + 1
}

function getQuarterEndMonth(quarter: number) {
  return quarter * 3
}

function normalizePeriod(value?: string): NormalizedPeriod {
  if (value === 'day') return 'daily'
  if (value === 'week') return 'weekly'
  if (value === 'month') return 'monthly'
  if (value === 'quarter') return 'quarterly'
  if (value === 'year') return 'yearly'
  if (value === 'daily') return 'daily'
  if (value === 'weekly') return 'weekly'
  if (value === 'monthly') return 'monthly'
  if (value === 'quarterly') return 'quarterly'
  if (value === 'yearly') return 'yearly'
  if (value === 'custom') return 'custom'
  return 'monthly'
}

function normalizeNumber(value: string | number | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clampMonth(value: number) {
  return value < 1 || value > 12 ? new Date().getMonth() + 1 : value
}

function clampQuarter(value: number) {
  return value < 1 || value > 4
    ? getQuarterForMonth(new Date().getMonth() + 1)
    : value
}

function getDefaults({
  period,
  date,
  year,
  month,
  quarter,
  startDate,
  endDate,
}: {
  period: NormalizedPeriod
  date: string
  year: string | number
  month: string | number
  quarter: string | number
  startDate: string
  endDate: string
}) {
  const today = new Date()
  const todayValue = dateToInputValue(today)
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1
  const currentQuarter = getQuarterForMonth(currentMonth)

  const resolvedYear = normalizeNumber(year, currentYear)
  const resolvedMonth = clampMonth(normalizeNumber(month, currentMonth))
  const resolvedQuarter = clampQuarter(normalizeNumber(quarter, currentQuarter))
  const resolvedDate = date || todayValue

  if (period === 'daily') {
    const selectedDay = parseInputDate(resolvedDate, today)
    return {
      date: dateToInputValue(selectedDay),
      year: selectedDay.getFullYear(),
      month: selectedDay.getMonth() + 1,
      quarter: getQuarterForMonth(selectedDay.getMonth() + 1),
      startDate: dateToInputValue(selectedDay),
      endDate: dateToInputValue(selectedDay),
    }
  }

  if (period === 'weekly') {
    const selectedDay = parseInputDate(resolvedDate, today)
    const weekStart = getStartOfWeekSunday(selectedDay)
    const weekEnd = getEndOfWeekSunday(selectedDay)

    return {
      date: dateToInputValue(weekStart),
      year: weekStart.getFullYear(),
      month: weekStart.getMonth() + 1,
      quarter: getQuarterForMonth(weekStart.getMonth() + 1),
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
    }
  }

  if (period === 'monthly') {
    const monthStart = new Date(resolvedYear, resolvedMonth - 1, 1)
    const monthEnd = getEndOfMonth(resolvedYear, resolvedMonth)

    return {
      date: dateToInputValue(monthStart),
      year: resolvedYear,
      month: resolvedMonth,
      quarter: getQuarterForMonth(resolvedMonth),
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
    }
  }

  if (period === 'quarterly') {
    const startMonth = getQuarterStartMonth(resolvedQuarter)
    const endMonth = getQuarterEndMonth(resolvedQuarter)
    const quarterStart = new Date(resolvedYear, startMonth - 1, 1)
    const quarterEnd = getEndOfMonth(resolvedYear, endMonth)

    return {
      date: dateToInputValue(quarterStart),
      year: resolvedYear,
      month: startMonth,
      quarter: resolvedQuarter,
      startDate: dateToInputValue(quarterStart),
      endDate: dateToInputValue(quarterEnd),
    }
  }

  if (period === 'yearly') {
    return {
      date: `${resolvedYear}-01-01`,
      year: resolvedYear,
      month: currentMonth,
      quarter: currentQuarter,
      startDate: `${resolvedYear}-01-01`,
      endDate: `${resolvedYear}-12-31`,
    }
  }

  const customStart = startDate || `${resolvedYear}-01-01`
  const customEnd = endDate || todayValue

  return {
    date: date || customStart,
    year: resolvedYear,
    month: resolvedMonth,
    quarter: resolvedQuarter,
    startDate: customStart,
    endDate: customEnd,
  }
}

function getCurrentDefaults(period: NormalizedPeriod) {
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1
  const currentQuarter = getQuarterForMonth(currentMonth)

  return getDefaults({
    period,
    date: dateToInputValue(today),
    year: currentYear,
    month: currentMonth,
    quarter: currentQuarter,
    startDate: '',
    endDate: '',
  })
}

export function ReportFilterField({
  label,
  children,
  className = '',
}: ReportFilterFieldProps) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  )
}

export default function ReportDateFilters({
  period = 'monthly',
  date = '',
  year = '',
  month = '',
  quarter = '',
  startDate = '',
  endDate = '',
  resetHref = '?',
  children,
}: ReportDateFiltersProps) {
  const initialPeriod = useMemo(() => normalizePeriod(period), [period])
  const initialDefaults = useMemo(
    () =>
      date || year || month || quarter || startDate || endDate
        ? getDefaults({
            period: initialPeriod,
            date,
            year,
            month,
            quarter,
            startDate,
            endDate,
          })
        : getCurrentDefaults(initialPeriod),
    [date, endDate, initialPeriod, month, quarter, startDate, year]
  )

  const [selectedPeriod, setSelectedPeriod] =
    useState<NormalizedPeriod>(initialPeriod)
  const [selectedDate, setSelectedDate] = useState(initialDefaults.date)
  const [selectedYear, setSelectedYear] = useState(String(initialDefaults.year))
  const [selectedMonth, setSelectedMonth] = useState(String(initialDefaults.month))
  const [selectedQuarter, setSelectedQuarter] = useState(String(initialDefaults.quarter))
  const [selectedStartDate, setSelectedStartDate] = useState(initialDefaults.startDate)
  const [selectedEndDate, setSelectedEndDate] = useState(initialDefaults.endDate)

  const isDailyOrWeekly =
    selectedPeriod === 'daily' || selectedPeriod === 'weekly'
  const isMonthly = selectedPeriod === 'monthly'
  const isQuarterly = selectedPeriod === 'quarterly'
  const isCustom = selectedPeriod === 'custom'

  function applyPeriodDefaults(nextPeriod: NormalizedPeriod) {
    const nextDefaults = getCurrentDefaults(nextPeriod)

    setSelectedPeriod(nextPeriod)
    setSelectedDate(nextDefaults.date)
    setSelectedYear(String(nextDefaults.year))
    setSelectedMonth(String(nextDefaults.month))
    setSelectedQuarter(String(nextDefaults.quarter))
    setSelectedStartDate(nextDefaults.startDate)
    setSelectedEndDate(nextDefaults.endDate)
  }

  function updateDate(value: string) {
    const nextDefaults = getDefaults({
      period: selectedPeriod,
      date: value,
      year: selectedYear,
      month: selectedMonth,
      quarter: selectedQuarter,
      startDate: selectedStartDate,
      endDate: selectedEndDate,
    })

    setSelectedDate(nextDefaults.date)
    setSelectedYear(String(nextDefaults.year))
    setSelectedMonth(String(nextDefaults.month))
    setSelectedQuarter(String(nextDefaults.quarter))
    setSelectedStartDate(nextDefaults.startDate)
    setSelectedEndDate(nextDefaults.endDate)
  }

  function updateYear(value: string) {
    const nextDefaults = getDefaults({
      period: selectedPeriod,
      date: selectedDate,
      year: value,
      month: selectedMonth,
      quarter: selectedQuarter,
      startDate: selectedStartDate,
      endDate: selectedEndDate,
    })

    setSelectedYear(String(nextDefaults.year))
    setSelectedMonth(String(nextDefaults.month))
    setSelectedQuarter(String(nextDefaults.quarter))
    setSelectedDate(nextDefaults.date)
    setSelectedStartDate(nextDefaults.startDate)
    setSelectedEndDate(nextDefaults.endDate)
  }

  function updateMonth(value: string) {
    const nextDefaults = getDefaults({
      period: 'monthly',
      date: selectedDate,
      year: selectedYear,
      month: value,
      quarter: selectedQuarter,
      startDate: selectedStartDate,
      endDate: selectedEndDate,
    })

    setSelectedMonth(String(nextDefaults.month))
    setSelectedQuarter(String(nextDefaults.quarter))
    setSelectedDate(nextDefaults.date)
    setSelectedStartDate(nextDefaults.startDate)
    setSelectedEndDate(nextDefaults.endDate)
  }

  function updateQuarter(value: string) {
    const nextDefaults = getDefaults({
      period: 'quarterly',
      date: selectedDate,
      year: selectedYear,
      month: selectedMonth,
      quarter: value,
      startDate: selectedStartDate,
      endDate: selectedEndDate,
    })

    setSelectedQuarter(String(nextDefaults.quarter))
    setSelectedMonth(String(nextDefaults.month))
    setSelectedDate(nextDefaults.date)
    setSelectedStartDate(nextDefaults.startDate)
    setSelectedEndDate(nextDefaults.endDate)
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="period" value={selectedPeriod} />
      <input type="hidden" name="year" value={selectedYear} />

      {isDailyOrWeekly ? (
        <input type="hidden" name="date" value={selectedDate} />
      ) : null}

      {isMonthly ? (
        <input type="hidden" name="month" value={selectedMonth} />
      ) : null}

      {isQuarterly ? (
        <input type="hidden" name="quarter" value={selectedQuarter} />
      ) : null}

      {isCustom ? (
        <>
          <input type="hidden" name="startDate" value={selectedStartDate} />
          <input type="hidden" name="endDate" value={selectedEndDate} />
        </>
      ) : null}

      {children ? (
        <section className="app-section px-3 py-3">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {children}
          </div>
        </section>
      ) : null}

      <section className="app-section px-3 py-3">
        <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-[1.05fr_1.1fr_0.8fr_1.05fr_0.95fr_1.1fr_1.1fr_auto]">
          <ReportFilterField label="Period">
            <select
              value={selectedPeriod}
              onChange={(event) =>
                applyPeriodDefaults(normalizePeriod(event.target.value))
              }
              className="app-select h-9 text-sm"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </ReportFilterField>

          <ReportFilterField label="Date">
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => updateDate(event.target.value)}
              readOnly={!isDailyOrWeekly}
              aria-disabled={!isDailyOrWeekly}
              className={`app-input h-9 text-sm ${isDailyOrWeekly ? '' : 'opacity-50'}`}
            />
          </ReportFilterField>

          <ReportFilterField label="Year">
            <input
              type="number"
              value={selectedYear}
              onChange={(event) => updateYear(event.target.value)}
              className="app-input h-9 text-sm"
              placeholder="2026"
            />
          </ReportFilterField>

          <ReportFilterField label="Month">
            <select
              value={selectedMonth}
              onChange={(event) => updateMonth(event.target.value)}
              aria-disabled={!isMonthly}
              className={`app-select h-9 text-sm ${isMonthly ? '' : 'opacity-50'}`}
            >
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </ReportFilterField>

          <ReportFilterField label="Quarter">
            <select
              value={selectedQuarter}
              onChange={(event) => updateQuarter(event.target.value)}
              aria-disabled={!isQuarterly}
              className={`app-select h-9 text-sm ${isQuarterly ? '' : 'opacity-50'}`}
            >
              {QUARTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </ReportFilterField>

          <ReportFilterField label="Start">
            <input
              type="date"
              value={selectedStartDate}
              onChange={(event) => setSelectedStartDate(event.target.value)}
              readOnly={!isCustom}
              aria-disabled={!isCustom}
              className={`app-input h-9 text-sm ${isCustom ? '' : 'opacity-50'}`}
            />
          </ReportFilterField>

          <ReportFilterField label="End">
            <input
              type="date"
              value={selectedEndDate}
              onChange={(event) => setSelectedEndDate(event.target.value)}
              readOnly={!isCustom}
              aria-disabled={!isCustom}
              className={`app-input h-9 text-sm ${isCustom ? '' : 'opacity-50'}`}
            />
          </ReportFilterField>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="app-button-primary h-9 whitespace-nowrap px-3 text-sm"
            >
              Search
            </button>

            <a
              href={resetHref}
              className="app-button h-9 whitespace-nowrap px-3 text-sm"
            >
              Reset
            </a>
          </div>
        </div>

        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Daily defaults to today. Weekly starts on Sunday. Monthly,
          quarterly, and yearly default to the current period when selected.
          Custom start/end dates are submitted only when Custom Range is
          selected.
        </p>
      </section>
    </div>
  )
}
