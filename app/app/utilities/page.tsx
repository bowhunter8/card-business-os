import Link from 'next/link'

export default function UtilitiesPage() {
  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Utilities</h1>
        <p className="mt-2 text-zinc-400">
          Manage imports, exports, shipping settings, tax tools, and system utilities.
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Inventory Tools</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Tools for loading, organizing, and maintaining inventory records.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/app/starting-inventory"
            className="rounded-2xl border border-blue-900 bg-blue-950/30 p-6 transition hover:bg-blue-900/30"
          >
            <h3 className="text-xl font-semibold">Starting Inventory</h3>
            <p className="mt-2 text-sm text-zinc-300">
              Enter cards you already owned, assign cost basis, and import them into inventory or personal collection.
            </p>
          </Link>

          <Link
            href="/app/imports/whatnot"
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition hover:bg-zinc-800"
          >
            <h3 className="text-xl font-semibold">Whatnot Import</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Upload your Whatnot CSV and create order stubs for grouping into breaks.
            </p>
          </Link>

          <Link
            href="/app/whatnot-orders"
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition hover:bg-zinc-800"
          >
            <h3 className="text-xl font-semibold">Whatnot Orders</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Review imported orders and combine them into breaks.
            </p>
          </Link>

          <Link
            href="/app/utilities/whatnot-scan"
            className="rounded-2xl border border-amber-900 bg-amber-950/30 p-6 transition hover:bg-amber-900/30"
          >
            <h3 className="text-xl font-semibold">Scan Whatnot Screenshot / Email</h3>
            <p className="mt-2 text-sm text-zinc-300">
              Upload a Whatnot desktop screenshot, mobile screenshot, or delivery email and try to match it to an imported order or existing break.
            </p>
          </Link>

          <Link
            href="/app/utilities/export"
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition hover:bg-zinc-800"
          >
            <h3 className="text-xl font-semibold">Backup & Export</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Export your data for backup, workbook updates, or tax filing support.
            </p>
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Shipping & Sales Tools</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Manage shipping defaults and sales-related setup.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/app/settings/shipping"
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition hover:bg-zinc-800"
          >
            <h3 className="text-xl font-semibold">Shipping Profiles</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Manage default shipping charges and supplies costs used in your sales flow.
            </p>
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Tax & Reporting</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Review tax-focused summaries and exportable records.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/app/reports/tax/summary"
            className="rounded-2xl border border-emerald-900 bg-emerald-950/30 p-6 transition hover:bg-emerald-900/30"
          >
            <h3 className="text-xl font-semibold">Tax Summary</h3>
            <p className="mt-2 text-sm text-zinc-300">
              View income, expenses, COGS, and net profit for tax filing.
            </p>
          </Link>
        </div>
      </section>
    </div>
  )
}