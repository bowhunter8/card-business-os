import Link from 'next/link'

export default function UtilitiesPage() {
  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Utilities</h1>
        <p className="mt-2 text-zinc-400">
          Manage imports, exports, shipping settings, and system tools.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* WHATNOT IMPORT */}
        <Link
          href="/app/imports/whatnot"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 hover:bg-zinc-800 transition"
        >
          <h2 className="text-xl font-semibold">Whatnot Import</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Upload your Whatnot CSV and create order stubs for grouping into breaks.
          </p>
        </Link>

        {/* WHATNOT ORDERS */}
        <Link
          href="/app/whatnot-orders"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 hover:bg-zinc-800 transition"
        >
          <h2 className="text-xl font-semibold">Whatnot Orders</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Review imported orders and combine them into breaks.
          </p>
        </Link>

        {/* SHIPPING PROFILES */}
        <Link
          href="/app/settings/shipping"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 hover:bg-zinc-800 transition"
        >
          <h2 className="text-xl font-semibold">Shipping Profiles</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Manage default shipping charges and supplies.
          </p>
        </Link>

        {/* BACKUP / EXPORT */}
        <Link
          href="/app/utilities/export"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 hover:bg-zinc-800 transition"
        >
          <h2 className="text-xl font-semibold">Backup & Export</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Export your data for backup or tax filing.
          </p>
        </Link>

        {/* TAX SUMMARY (NEW) */}
        <Link
          href="/app/reports/tax/summary"
          className="rounded-2xl border border-emerald-900 bg-emerald-950/30 p-6 hover:bg-emerald-900/30 transition"
        >
          <h2 className="text-xl font-semibold">Tax Summary</h2>
          <p className="mt-2 text-sm text-zinc-300">
            View your income, expenses, COGS, and net profit for tax filing.
          </p>
        </Link>
      </div>
    </div>
  )
}