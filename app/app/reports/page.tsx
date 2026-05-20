import Link from 'next/link'
import {
  buildPresetHref,
  getReportPresets,
} from '@/lib/reports/report-presets'

function PresetDropdown({
  title,
  basePath,
  presets,
  extraItems = [],
}: {
  title: string
  basePath: string
  presets: ReturnType<typeof getReportPresets>
  extraItems?: {
    href: string
    title: string
    description: string
  }[]
}) {
  return (
    <details className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
      <summary className="cursor-pointer marker:text-zinc-500">
        <span className="ml-2 text-sm font-semibold uppercase tracking-wide text-zinc-300">
          {title}
        </span>
        <span className="ml-2 text-xs text-zinc-500">
          ({presets.length + extraItems.length})
        </span>
      </summary>

      <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
        {extraItems.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            prefetch={false}
            className="block rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 transition hover:bg-zinc-900"
          >
            <div className="text-sm font-semibold text-zinc-100">
              {item.title}
            </div>
            <div className="mt-1 text-xs leading-5 text-zinc-400">
              {item.description}
            </div>
          </Link>
        ))}

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
    <details className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
      <summary className="cursor-pointer marker:text-zinc-500">
        <span className="ml-2 text-lg font-semibold text-zinc-100">
          {title}
        </span>
      </summary>

      <p className="mt-3 text-sm leading-6 text-zinc-400">{description}</p>

      <div className="mt-4 space-y-2 border-t border-zinc-800 pt-4">
        {items.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            prefetch={false}
            className="block rounded-xl border border-zinc-800 bg-black/30 p-3 transition hover:bg-zinc-900"
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
            sales reports, expense reports, open lots, and saved report presets.
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
              Quick-launch filtered reports for common inventory, sales, expense, and financial review workflows.
            </p>
          </div>

          <span className="rounded-full border border-emerald-900 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-300">
            Presets Active
          </span>
        </div>

        <div className="mt-5 grid items-start gap-3 xl:grid-cols-4">
          <PresetDropdown
            title="Inventory Presets"
            basePath="/app/reports/inventory"
            presets={inventoryPresets}
            extraItems={[
              {
                href: '/app/reports/inventory',
                title: 'Inventory Reports',
                description:
                  'Review inventory statuses, cost basis, estimated value, item search, saved presets, and aging reports.',
              },
              {
                href: '/app/reports/operations',
                title: 'Daily Operations Report',
                description:
                  'Review unlisted inventory, aging inventory, value cleanup, listing priorities, and day-to-day inventory workflow.',
              },
              {
                href: '/app/reports/inventory?status=available',
                title: 'Unlisted / Available Inventory',
                description:
                  'Daily listing queue for available inventory that is not marked listed, sold, personal, junk, or disposed.',
              },
              {
                href: '/app/reports/inventory?status=available&aging=30',
                title: '30+ Day Aging Review',
                description:
                  'Find available inventory held 30+ days for listing, pricing, bundling, or follow-up review.',
              },
              {
                href: '/app/reports/inventory?status=available&aging=90',
                title: '90+ Day Aging Review',
                description:
                  'Find available inventory held 90+ days for repricing, bundling, listing, discounting, or cash-flow review.',
              },
              {
                href: '/app/reports/inventory?action=needed',
                title: 'Action Needed',
                description:
                  'Review inventory needing attention for missing cost/value, aging, listing follow-up, photos, status cleanup, or write-off support.',
              },
              {
                href: '/app/reports/open-lots',
                title: 'Open Lots',
                description:
                  'Review partial sales, remaining quantity, remaining cost basis, stale lots, and unsold inventory aging.',
              },
            ]}
          />

          <PresetDropdown
            title="Sales Presets"
            basePath="/app/reports/sales"
            presets={salesPresets}
            extraItems={[
              {
                href: '/app/reports/sales',
                title: 'Sales Reports',
                description:
                  'Review sales, gross receipts, selling costs, net proceeds, realized COGS, and profit.',
              },
            ]}
          />

          <PresetDropdown
            title="Expense Presets"
            basePath="/app/reports/expenses"
            presets={expensePresets}
            extraItems={[
              {
                href: '/app/reports/expenses',
                title: 'Expense Reports',
                description:
                  'Review manual expenses, supplies, software, subscriptions, fees, advertising, giveaways, and Schedule C categories.',
              },
              {
                href: '/app/reports/cogs',
                title: 'COGS Reports',
                description:
                  'Review realized cost of goods sold by date range, reporting period, and future accounting filters.',
              },
              {
                href: '/app/reports/write-offs',
                title: 'Write-Off / Disposal Review',
                description:
                  'Review junk, damaged, donated, giveaway, and finalized disposal records for tax-safe documentation.',
              },
            ]}
          />

          <ReportDropdown
            title="Financial Reports"
            description="Financial, tax, year-end, and accounting review reports."
            items={[
              {
                href: '/app/reports/tax',
                title: 'Financial Reports',
                description:
                  'Run daily, weekly, monthly, quarterly, yearly, and custom date-range financial reports.',
              },
              {
                href: '/app/reports/tax/summary',
                title: 'Year-End Tax Center',
                description:
                  'Review Schedule C support, beginning inventory, ending inventory carryover, workbook exports, and year-end tax reporting.',
              },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
