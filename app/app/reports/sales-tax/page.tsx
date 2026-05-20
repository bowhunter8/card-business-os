import Link from 'next/link'

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
  start?: string
  end?: string
}

const PERIOD_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
]

const MONTH_OPTIONS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
].map((label, index) => ({ value: String(index + 1), label }))

const QUARTER_OPTIONS = [
  { value: '1', label: 'Q1' },
  { value: '2', label: 'Q2' },
  { value: '3', label: 'Q3' },
  { value: '4', label: 'Q4' },
]

function normalizePeriod(raw?: string) {
  if (raw === 'daily' || raw === 'day') return 'daily'
  if (raw === 'weekly' || raw === 'week') return 'weekly'
  if (raw === 'monthly' || raw === 'month') return 'monthly'
  if (raw === 'quarterly' || raw === 'quarter') return 'quarterly'
  if (raw === 'yearly' || raw === 'year') return 'yearly'
  if (raw === 'custom') return 'custom'
  return 'monthly'
}

function clampYear(raw?: string) {
  const currentYear = new Date().getFullYear()
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > currentYear + 1) return currentYear
  return parsed
}

function clampMonth(raw?: string) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) return new Date().getMonth() + 1
  return parsed
}

function clampQuarter(raw?: string) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 4) return Math.floor(new Date().getMonth() / 3) + 1
  return parsed
}

export default async function SalesTaxReportPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const resolvedSearchParams = (await searchParams) || {}

  const search = resolvedSearchParams.q?.trim() || ''
  const selectedPlatform = resolvedSearchParams.platform?.trim() || ''
  const selectedPeriod = normalizePeriod(resolvedSearchParams.period)
  const selectedYear = clampYear(resolvedSearchParams.year)
  const selectedMonth = clampMonth(resolvedSearchParams.month)
  const selectedQuarter = clampQuarter(resolvedSearchParams.quarter)
  const startDate = resolvedSearchParams.startDate || resolvedSearchParams.start || ''
  const endDate = resolvedSearchParams.endDate || resolvedSearchParams.end || ''

  return (
    <main className="app-page space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Reports</p>
          <h1 className="app-title">Sales Tax Report</h1>
          <p className="app-subtitle">
            Export sales-tax support and marketplace sales reconciliation for accountant review.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/reports" className="app-button">Back to Reports</Link>
          <Link href="/app/reports/tax" className="app-button">Financial Reports</Link>
        </div>
      </div>

      <section className="app-section space-y-2">
        <h2 className="text-base font-semibold text-zinc-100">Sales tax tracking note</h2>
        <p className="text-sm leading-6 text-zinc-400">
          This report is ready for sales-tax exports. Current sales records do not appear to store dedicated
          sales-tax fields yet, so sales-tax amounts export as zero/not tracked until those fields are added.
        </p>
      </section>

      <form action="/api/reports/sales-tax/PDF" method="get" className="space-y-3">
        <section className="app-section space-y-3">
          <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">Search</span>
              <input
                name="q"
                type="search"
                defaultValue={search}
                placeholder="Platform, order notes, sale notes..."
                className="app-input h-9 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">Platform</span>
              <input
                name="platform"
                type="text"
                defaultValue={selectedPlatform}
                placeholder="All platforms"
                className="app-input h-9 text-sm"
              />
            </label>
          </div>
        </section>

        <section className="app-section space-y-3">
          <div className="grid gap-3 xl:grid-cols-[180px_180px_140px_180px_160px_190px_190px_auto]">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">Period</span>
              <select name="period" defaultValue={selectedPeriod} className="app-select h-9 text-sm">
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">Date</span>
              <input name="date" type="date" defaultValue={resolvedSearchParams.date || ''} className="app-input h-9 text-sm" />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">Year</span>
              <input name="year" type="number" min="2000" max={new Date().getFullYear() + 1} defaultValue={selectedYear} className="app-input h-9 text-sm" />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">Month</span>
              <select name="month" defaultValue={String(selectedMonth)} className="app-select h-9 text-sm">
                {MONTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">Quarter</span>
              <select name="quarter" defaultValue={String(selectedQuarter)} className="app-select h-9 text-sm">
                {QUARTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">Start</span>
              <input name="startDate" type="date" defaultValue={startDate} className="app-input h-9 text-sm" />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">End</span>
              <input name="endDate" type="date" defaultValue={endDate} className="app-input h-9 text-sm" />
            </label>

            <div className="flex items-end gap-2">
              <button type="submit" className="app-button-primary h-9 whitespace-nowrap px-3 text-sm">
                Run PDF Report
              </button>

              <button
                type="submit"
                formAction="/api/reports/sales-tax/export"
                className="app-button h-9 whitespace-nowrap px-3 text-sm"
              >
                Run CSV Report
              </button>

              <Link href="/app/reports/sales-tax" className="app-button h-9 whitespace-nowrap px-3 text-sm">
                Reset
              </Link>
            </div>
          </div>
        </section>
      </form>

      <section className="app-section space-y-2">
        <h2 className="text-base font-semibold text-zinc-100">Current Selection</h2>
        <p className="text-sm text-zinc-400">
          Platform: {selectedPlatform || 'All platforms'}. Exports use the selected period, date range, and search filters.
        </p>
      </section>
    </main>
  )
}
