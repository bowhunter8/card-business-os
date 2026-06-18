import Link from 'next/link'

type SearchParams = {
  account?: string
  q?: string
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

type FinancialAccount =
  | 'all'
  | 'sales'
  | 'cogs'
  | 'selling-costs'
  | 'shipping'
  | 'expenses'
  | 'purchases'
  | 'inventory'
  | 'schedule-c'

const ACCOUNT_OPTIONS: Array<{ value: FinancialAccount; label: string }> = [
  { value: 'all', label: 'All financial accounts' },
  { value: 'sales', label: 'Sales / income' },
  { value: 'cogs', label: 'COGS / cost basis' },
  { value: 'selling-costs', label: 'Selling costs' },
  { value: 'shipping', label: 'Shipping summary' },
  { value: 'expenses', label: 'Manual expenses' },
  { value: 'purchases', label: 'Purchases / breaks' },
  { value: 'inventory', label: 'Inventory value' },
  { value: 'schedule-c', label: 'Schedule C support' },
]

const PERIOD_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
]

const MONTH_OPTIONS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
]

const QUARTER_OPTIONS = [
  { value: '1', label: 'Q1' },
  { value: '2', label: 'Q2' },
  { value: '3', label: 'Q3' },
  { value: '4', label: 'Q4' },
]

function normalizeAccount(raw?: string): FinancialAccount {
  const clean = String(raw || 'all') as FinancialAccount

  return ACCOUNT_OPTIONS.some((option) => option.value === clean)
    ? clean
    : 'all'
}

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

function accountLabel(account: FinancialAccount) {
  return (
    ACCOUNT_OPTIONS.find((option) => option.value === account)?.label ||
    'All financial accounts'
  )
}

export default async function FinancialReportPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const resolvedSearchParams = (await searchParams) || {}

  const selectedAccount = normalizeAccount(resolvedSearchParams.account)
  const search = resolvedSearchParams.q?.trim() || ''
  const selectedPeriod = normalizePeriod(resolvedSearchParams.period)
  const selectedYear = clampYear(resolvedSearchParams.year)
  const selectedMonth = clampMonth(resolvedSearchParams.month)
  const selectedQuarter = clampQuarter(resolvedSearchParams.quarter)
  const startDate =
    resolvedSearchParams.startDate || resolvedSearchParams.start || ''
  const endDate =
    resolvedSearchParams.endDate || resolvedSearchParams.end || ''

  return (
    <main className="app-page space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Reports
          </p>
          <h1 className="app-title">Financial Report</h1>
          <p className="app-subtitle">
            Choose an account, select a date range, then generate a PDF or CSV
            export for owner review, accountant review, shipping review, or record keeping.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/reports" className="app-button">
            Back to Reports
          </Link>

          <Link href="/app/reports/tax/summary" className="app-button">
            Year-End Tax Center
          </Link>
        </div>
      </div>

      <form
        action="/api/reports/financial/PDF"
        method="get"
        className="space-y-3"
      >
        <section className="app-section space-y-3">
          <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Search
              </span>

              <input
                name="q"
                type="search"
                defaultValue={search}
                placeholder="Account, category, platform, order #, vendor, notes..."
                className="app-input h-9 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Account
              </span>

              <select
                name="account"
                defaultValue={selectedAccount}
                className="app-select h-9 text-sm"
              >
                {ACCOUNT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="app-section space-y-3">
          <div className="grid gap-2 xl:grid-cols-[minmax(120px,145px)_minmax(135px,155px)_minmax(90px,115px)_minmax(130px,160px)_minmax(105px,130px)_minmax(135px,155px)_minmax(135px,155px)_minmax(270px,auto)]">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Period
              </span>

              <select
                name="period"
                defaultValue={selectedPeriod}
                className="app-select h-9 text-sm"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Date
              </span>

              <input
                name="date"
                type="date"
                defaultValue={resolvedSearchParams.date || ''}
                className="app-input h-9 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Year
              </span>

              <input
                name="year"
                type="number"
                min="2000"
                max={new Date().getFullYear() + 1}
                defaultValue={selectedYear}
                className="app-input h-9 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Month
              </span>

              <select
                name="month"
                defaultValue={String(selectedMonth)}
                className="app-select h-9 text-sm"
              >
                {MONTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Quarter
              </span>

              <select
                name="quarter"
                defaultValue={String(selectedQuarter)}
                className="app-select h-9 text-sm"
              >
                {QUARTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Start
              </span>

              <input
                name="startDate"
                type="date"
                defaultValue={startDate}
                className="app-input h-9 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                End
              </span>

              <input
                name="endDate"
                type="date"
                defaultValue={endDate}
                className="app-input h-9 text-sm"
              />
            </label>

            <div className="flex min-w-0 items-end justify-end gap-2">
              <button
                type="submit"
                className="app-button-primary h-9 shrink-0 whitespace-nowrap px-3 text-sm"
              >
                Run PDF Report
              </button>

              <button
                type="submit"
                formAction="/api/reports/financial"
                className="app-button h-9 shrink-0 whitespace-nowrap px-3 text-sm"
              >
                Run CSV Report
              </button>

              <Link
                href="/app/reports/tax"
                className="app-button h-9 shrink-0 whitespace-nowrap px-3 text-sm"
              >
                Reset
              </Link>
            </div>
          </div>
        </section>
      </form>


      <section className="app-section space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Shipping Summary
            </h2>

            <p className="text-sm text-zinc-400">
              Shipping income and expenses are included in business profitability.
              This section helps review shipping-related operational costs and margins.
            </p>
          </div>

          <div className="rounded-full border border-emerald-900 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-300">
            Operational Visibility
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">
              Shipping Charged
            </div>

            <div className="mt-1 text-lg font-semibold text-zinc-100">
              Included In Gross Sales
            </div>

            <p className="mt-2 text-xs leading-5 text-zinc-400">
              Buyer-paid shipping is currently included in gross sales totals.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">
              Actual Postage
            </div>

            <div className="mt-1 text-lg font-semibold text-zinc-100">
              Tracked Per Sale
            </div>

            <p className="mt-2 text-xs leading-5 text-zinc-400">
              Actual postage costs should be entered for each completed sale.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">
              Supplies Cost
            </div>

            <div className="mt-1 text-lg font-semibold text-zinc-100">
              Tracked
            </div>

            <p className="mt-2 text-xs leading-5 text-zinc-400">
              Penny sleeves, top loaders, mailers, and shipping supplies support expense tracking.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">
              Shipping Profit/Loss
            </div>

            <div className="mt-1 text-lg font-semibold text-zinc-100">
              Operational Review
            </div>

            <p className="mt-2 text-xs leading-5 text-zinc-400">
              Use shipping reporting to identify undercharged shipments or costly shipping profiles.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">
              IRS / CPA Support
            </div>

            <div className="mt-1 text-lg font-semibold text-zinc-100">
              Enabled
            </div>

            <p className="mt-2 text-xs leading-5 text-zinc-400">
              Shipping expenses are included in profitability and deductible business expense tracking.
            </p>
          </div>
        </div>
      </section>

      <section className="app-section space-y-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Current Selection
            </h2>
            <p className="text-sm text-zinc-400">
              Account: {accountLabel(selectedAccount)}. Reports use the selected
              period, account, date range, and search filters above.
            </p>
          </div>

          <div className="rounded-full border border-blue-900 bg-blue-950/40 px-3 py-1 text-xs font-semibold text-blue-300">
            Financial Export Mode
          </div>
        </div>
      </section>
    </main>
  )
}
