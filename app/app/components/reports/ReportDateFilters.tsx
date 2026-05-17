import type { ReactNode } from 'react'

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

const PERIOD_OPTIONS = [
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
  return (
    <div className="space-y-3">
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
              name="period"
              defaultValue={period}
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
              name="date"
              defaultValue={date}
              className="app-input h-9 text-sm"
            />
          </ReportFilterField>

          <ReportFilterField label="Year">
            <input
              type="number"
              name="year"
              defaultValue={year}
              className="app-input h-9 text-sm"
              placeholder="2026"
            />
          </ReportFilterField>

          <ReportFilterField label="Month">
            <select
              name="month"
              defaultValue={String(month)}
              className="app-select h-9 text-sm"
            >
              <option value="">All months</option>

              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </ReportFilterField>

          <ReportFilterField label="Quarter">
            <select
              name="quarter"
              defaultValue={String(quarter)}
              className="app-select h-9 text-sm"
            >
              <option value="">All quarters</option>

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
              name="startDate"
              defaultValue={startDate}
              className="app-input h-9 text-sm"
            />
          </ReportFilterField>

          <ReportFilterField label="End">
            <input
              type="date"
              name="endDate"
              defaultValue={endDate}
              className="app-input h-9 text-sm"
            />
          </ReportFilterField>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="app-button-primary h-9 whitespace-nowrap px-3 text-sm"
            >
              Run Report
            </button>

            <a
              href={resetHref}
              className="app-button h-9 whitespace-nowrap px-3 text-sm"
            >
              Reset
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
