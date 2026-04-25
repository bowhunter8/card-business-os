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
      prefetch={false}
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
            description="Enter items you already owned, assign cost basis, and import them into inventory or personal collection."
            tone="primary"
          />

          <UtilityCard
            href="/app/imports"
            title="Imports"
            description="Import orders, sales, and future record types from different platforms without limiting the app to one source."
          />

          <UtilityCard
            href="/app/whatnot-orders"
            title="Imported Orders"
            description="Review imported orders and combine them into breaks or other grouped purchase workflows."
          />

          <UtilityCard
            href="/app/utilities/backup"
            title="Backup & Export"
            description="Create full restore-capable backups and export records for accountants, QuickBooks, tax software, or CPA workflows."
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