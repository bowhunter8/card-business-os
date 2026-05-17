import Link from 'next/link'
import {
  buildPresetHref,
  getReportPresets,
} from '@/lib/reports/report-presets'

function PresetDropdown({
  title,
  basePath,
  presets,
}: {
  title: string
  basePath: string
  presets: ReturnType<typeof getReportPresets>
}) {
  return (
    <details className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
      <summary className="cursor-pointer marker:text-zinc-500">
        <span className="ml-2 text-sm font-semibold uppercase tracking-wide text-zinc-300">
          {title}
        </span>
        <span className="ml-2 text-xs text-zinc-500">({presets.length})</span>
      </summary>

      <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
        {presets.map((preset) => (
          <Link
            key={preset.id}
            href={buildPresetHref(basePath, preset)}
            className="block rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 transition hover:bg-zinc-900"
          >
            <div className="text-sm font-semibold text-zinc-100">
              {preset.name}
            </div>
            <div className="mt-1 text-xs leading-5 text-zinc-400">
              {preset.description}
            </div>
          </Link>
        ))}
      </div>
    </details>
  )
}

function ReportDropdown({
  title,
  description,
  items,
}: {
  title: string
  description: string
  items: {
    href: string
    title: string
    description: string
  }[]
}) {
  return (
    <details className="app-section p-5">
      <summary className="cursor-pointer marker:text-zinc-500">
        <span className="ml-2 text-lg font-semibold text-zinc-100">
          {title}
        </span>
      </summary>

      <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>

      <div className="mt-4 space-y-2 border-t border-zinc-800 pt-4">
        {items.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            prefetch={false}
            className="block rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 transition hover:bg-zinc-900"
          >
            <div className="text-sm font-semibold text-zinc-100">
              {item.title}
            </div>
            <div className="mt-1 text-xs leading-5 text-zinc-400">
              {item.description}
            </div>
          </Link>
        ))}
      </div>
    </details>
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
            Quick access to financial reports, year-end tax tools, inventory review,
            sales reports, expense reports, and saved report presets.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/app" className="app-button">
            Back to Dashboard
          </Link>

          <Link href="/app/reports/tax" className="app-button-primary">
            Open Financial Reports
          </Link>
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
            Presets Active
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <PresetDropdown
            title="Inventory Presets"
            basePath="/app/reports/inventory"
            presets={inventoryPresets}
          />

          <PresetDropdown
            title="Sales Presets"
            basePath="/app/reports/sales"
            presets={salesPresets}
          />

          <PresetDropdown
            title="Expense Presets"
            basePath="/app/reports/expenses"
            presets={expensePresets}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ReportDropdown
          title="Year-End Tax Center"
          description="Year-end closeout, Schedule C support, inventory carryover, write-offs, disposals, and tax filing preparation."
          items={[
            {
              href: '/app/reports/tax/summary',
              title: 'Year-End Tax Center',
              description:
                'Review Schedule C support, beginning inventory, ending inventory carryover, workbook exports, and year-end tax reporting.',
            },
            {
              href: '/app/reports/tax/summary',
              title: 'Write-Off / Disposal Review',
              description:
                'Review finalized disposal records and tax-safe write-off support for junk, damaged, donated, or giveaway items.',
            },
          ]}
        />

        <ReportDropdown
          title="Financial Reports"
          description="Operational business reporting for monthly review, accounting exports, sales, expenses, COGS, and filtered business activity."
          items={[
            {
              href: '/app/reports/tax',
              title: 'Financial Reports',
              description:
                'Run daily, weekly, monthly, quarterly, yearly, and custom date-range financial reports.',
            },
            {
              href: '/app/reports/tax',
              title: 'COGS Reports',
              description:
                'Review realized cost of goods sold by date range, reporting period, and future accounting filters.',
            },
            {
              href: '/app/reports/tax',
              title: 'Monthly / Quarterly Packets',
              description:
                'Use filtered reports for monthly and quarterly accounting packets, exports, and review.',
            },
            {
              href: '/app/reports/tax',
              title: 'Printable Reports',
              description:
                'Print and export period-aware financial reports for bookkeeping and CPA review.',
            },
          ]}
        />

        <ReportDropdown
          title="Inventory & Business Reports"
          description="Read-only reporting for inventory, sales, expenses, open lots, item search, and future analytics."
          items={[
            {
              href: '/app/reports/inventory',
              title: 'Inventory Reports',
              description:
                'Review inventory statuses, cost basis, estimated value, saved presets, open lots, and aging reports.',
            },
            {
              href: '/app/reports/sales',
              title: 'Sales Reports',
              description:
                'Review sales, gross receipts, selling costs, net proceeds, realized COGS, and profit.',
            },
            {
              href: '/app/reports/expenses',
              title: 'Expense Reports',
              description:
                'Review manual expenses, supplies, software, subscriptions, fees, advertising, giveaways, and Schedule C categories.',
            },
            {
              href: '/app/reports/inventory',
              title: 'Custom Item Search',
              description:
                'Search inventory by item, player, set, brand, lot, storage location, notes, and future analytics filters.',
            },
            {
              href: '/app/reports/inventory',
              title: 'Open Lots',
              description:
                'Review partial sales, remaining quantity, remaining cost basis, stale lots, and unsold inventory aging.',
            },
          ]}
        />
      </div>
    </div>
  )
}
