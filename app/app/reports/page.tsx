import Link from 'next/link'
import {
  buildPresetHref,
  getReportPresets,
} from '@/lib/reports/report-presets'

function ReportCard({
  href,
  title,
  description,
  badge,
  tone = 'default',
}: {
  href: string
  title: string
  description: string
  badge?: string
  tone?: 'default' | 'primary' | 'warning' | 'success'
}) {
  const toneClass =
    tone === 'primary'
      ? 'border-blue-900 bg-blue-950/30 hover:bg-blue-900/30'
      : tone === 'warning'
        ? 'border-amber-900 bg-amber-950/30 hover:bg-amber-900/30'
        : tone === 'success'
          ? 'border-emerald-900 bg-emerald-950/30 hover:bg-emerald-900/30'
          : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800'

  return (
    <Link
      href={href}
      prefetch={false}
      className={`app-section block p-5 transition ${toneClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
        </div>

        {badge && (
          <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs font-semibold text-zinc-300">
            {badge}
          </span>
        )}
      </div>
    </Link>
  )
}

function FilterPill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs font-medium text-zinc-300">
      {label}
    </span>
  )
}


function PresetCard({
  href,
  name,
  description,
}: {
  href: string
  name: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 transition hover:bg-zinc-900"
    >
      <div className="text-sm font-semibold text-zinc-100">{name}</div>
      <div className="mt-1 text-xs leading-5 text-zinc-400">
        {description}
      </div>
    </Link>
  )
}

export default function ReportsPage() {
  const inventoryPresets = getReportPresets('inventory')
  const salesPresets = getReportPresets('sales')
  const expensePresets = getReportPresets('expenses')

  return (
    <div className="app-page-wide space-y-4">
      <div className="app-page-header gap-4">
        <div>
          <h1 className="app-title">Report Center</h1>
          <p className="app-subtitle">
            Central hub for tax reports, filtered business reports, inventory review,
            open lots, junk/disposal review, custom searches, and future dashboards.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/app" className="app-button">
            Back to Dashboard
          </Link>

          <Link href="/app/reports/tax" className="app-button-primary">
            Open Filtered Reports
          </Link>
        </div>
      </div>

      <div className="app-section p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Custom Report Builder Foundation</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-400">
              This landing page is the foundation for searchable, printable, and exportable reports.
              The next layer can add custom filters for teams, players, items, categories, statuses,
              lots, COGS, junk, disposals, giveaways, expenses, and date ranges.
            </p>
          </div>

          <Link href="/app/reports/tax" className="app-button-primary whitespace-nowrap">
            Start with Date Filters
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <FilterPill label="Daily" />
          <FilterPill label="Weekly" />
          <FilterPill label="Monthly" />
          <FilterPill label="Quarterly" />
          <FilterPill label="Yearly" />
          <FilterPill label="Custom Range" />
          <FilterPill label="COGS" />
          <FilterPill label="Junk" />
          <FilterPill label="Disposed" />
          <FilterPill label="Available" />
          <FilterPill label="Listed" />
          <FilterPill label="Sold" />
          <FilterPill label="Open Lots" />
          <FilterPill label="Giveaways" />
          <FilterPill label="Teams / Players" />
          <FilterPill label="Custom Search" />
        </div>
      </div>


      <div className="app-section p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Saved Report Presets</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Quick-launch filtered reports for common inventory, sales, and expense review workflows.
            </p>
          </div>

          <span className="rounded-full border border-emerald-900 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-300">
            Foundation Active
          </span>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <div className="space-y-3">
            <div className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Inventory Presets
            </div>

            {inventoryPresets.map((preset) => (
              <PresetCard
                key={preset.id}
                href={buildPresetHref('/app/reports/inventory', preset)}
                name={preset.name}
                description={preset.description}
              />
            ))}
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Sales Presets
            </div>

            {salesPresets.map((preset) => (
              <PresetCard
                key={preset.id}
                href={buildPresetHref('/app/reports/sales', preset)}
                name={preset.name}
                description={preset.description}
              />
            ))}
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Expense Presets
            </div>

            {expensePresets.map((preset) => (
              <PresetCard
                key={preset.id}
                href={buildPresetHref('/app/reports/expenses', preset)}
                name={preset.name}
                description={preset.description}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ReportCard
          href="/app/reports/tax/summary"
          title="Tax Summary / Year-End"
          description="Year-end Schedule C settings, beginning inventory, ending inventory carryover, disposal/write-off review, workbook export, and PDF tax report."
          badge="Year-End"
          tone="primary"
        />

        <ReportCard
          href="/app/reports/tax"
          title="Filtered Tax Reports"
          description="Daily, weekly, monthly, quarterly, yearly, and custom date-range reports with period-aware workbook and PDF exports."
          badge="Date Filters"
          tone="success"
        />

        <ReportCard
          href="/app/reports/sales"
          title="Sales Reports"
          description="Review sales, gross receipts, selling costs, net proceeds, realized COGS, and profit. Future filters can group by date, platform, item, player, team, or category."
          badge="Sales"
        />

        <ReportCard
          href="/app/reports/expenses"
          title="Expense Reports"
          description="Review manual expenses, supplies, software, subscriptions, shipping materials, fees, advertising, giveaways, and Schedule C expense categories."
          badge="Expenses"
        />

        <ReportCard
          href="/app/reports/inventory"
          title="Inventory Reports"
          description="Read-only inventory reporting with future support for advanced filters, exports, aging reports, open lots, junk review, and saved report presets."
          badge="Inventory"
        />

        <ReportCard
          href="/app/reports/inventory"
          title="Custom Item Search"
          description="Future read-only custom search center for teams, players, sets, brands, lots, storage locations, and inventory analytics."
          badge="Search"
          tone="primary"
        />

        <ReportCard
          href="/app/reports/inventory"
          title="Open Lots"
          description="Future dedicated reporting for partial sales, remaining quantity, remaining cost basis, stale lots, and unsold inventory aging."
          badge="Inventory"
          tone="warning"
        />

        <ReportCard
          href="/app/reports/tax/summary"
          title="Junk / Disposal / Write-Off Review"
          description="Review finalized disposal records and tax-safe write-off support. Future filters can separate junk, disposed, damaged, donated, giveaway, and review-only records."
          badge="Review"
          tone="warning"
        />

        <ReportCard
          href="/app/reports/tax"
          title="COGS Reports"
          description="Review realized COGS by date range today. Future reports can filter COGS by platform, item, team, player, lot, break, or source."
          badge="COGS"
          tone="success"
        />

        <ReportCard
          href="/app/reports/tax"
          title="Monthly / Quarterly Packets"
          description="Use filtered tax reports for monthly and quarterly accounting packets now. Future version can save presets and print/export multiple sections together."
          badge="Period"
        />

        <ReportCard
          href="/app/reports/tax"
          title="Printable Filtered Reports"
          description="The current filtered reports support period-aware exports. Future reports can add print views for inventory, sales, expenses, lots, junk, disposals, and custom searches."
          badge="Print"
        />

        <ReportCard
          href="/app/reports/tax"
          title="Saved Report Presets"
          description="Future presets can save common views like Mariners inventory, Nick Kurtz cards, open lots, junk inventory, monthly sales, giveaways, or COGS by quarter."
          badge="Planned"
        />
      </div>

      <div className="app-section p-5">
        <h2 className="text-xl font-semibold">Recommended Build Order</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
            <h3 className="font-semibold text-zinc-100">1. Report Center</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Use this page as the landing hub and connect every existing report page from one place.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
            <h3 className="font-semibold text-zinc-100">2. Read-Only Inventory Reports</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Build a true reporting layer separate from operational inventory management pages and bulk actions.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
            <h3 className="font-semibold text-zinc-100">3. Presets + Dashboards</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Add saved report presets, monthly dashboards, charts, aging reports, sell-through rate,
              profit by platform, and custom analytics later.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
