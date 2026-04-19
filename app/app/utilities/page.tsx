import Link from 'next/link'

function UtilityCard({
  href,
  title,
  description,
  tone = 'default',
}: {
  href: string
  title: string
  description: string
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

  const descriptionClass =
    tone === 'default' ? 'text-zinc-400' : 'text-zinc-300'

  return (
    <Link
      href={href}
      className={`app-section block p-4 transition ${toneClass}`}
    >
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className={`mt-1.5 text-sm ${descriptionClass}`}>{description}</p>
    </Link>
  )
}

export default function UtilitiesPage() {
  return (
    <div className="app-page-wide space-y-5">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Utilities</h1>
          <p className="app-subtitle">
            Manage imports, exports, shipping settings, tax tools, and system utilities.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Inventory Tools</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Tools for loading, organizing, and maintaining inventory records.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <UtilityCard
            href="/app/starting-inventory"
            title="Starting Inventory"
            description="Enter cards you already owned, assign cost basis, and import them into inventory or personal collection."
            tone="primary"
          />

          <UtilityCard
            href="/app/imports/whatnot"
            title="Whatnot Import"
            description="Upload your Whatnot CSV and create order stubs for grouping into breaks."
          />

          <UtilityCard
            href="/app/whatnot-orders"
            title="Whatnot Orders"
            description="Review imported orders and combine them into breaks."
          />

          <UtilityCard
            href="/app/utilities/whatnot-scan"
            title="Scan Whatnot Screenshot / Email"
            description="Upload a Whatnot desktop screenshot, mobile screenshot, or delivery email and try to match it to an imported order or existing break."
            tone="warning"
          />

          <UtilityCard
            href="/app/utilities/export"
            title="Backup & Export"
            description="Export your data for backup, workbook updates, or tax filing support."
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Shipping & Sales Tools</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Manage shipping defaults and sales-related setup.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <UtilityCard
            href="/app/settings/shipping"
            title="Shipping Profiles"
            description="Manage default shipping charges and supplies costs used in your sales flow."
          />

          <UtilityCard
            href="/app/expenses"
            title="Supplies & Expenses"
            description="Track bulk supplies, postage purchases, software, equipment, and other business expenses."
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Tax & Reporting</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Review tax-focused summaries and exportable records.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <UtilityCard
            href="/app/reports/tax/summary"
            title="Tax Summary"
            description="View income, expenses, COGS, and net profit for tax filing."
            tone="success"
          />
        </div>
      </section>
    </div>
  )
}