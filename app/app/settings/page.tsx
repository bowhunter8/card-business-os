import Link from 'next/link'

export default function SettingsPage() {
  return (
    <div className="max-w-4xl">
      <div>
        <h1 className="text-3xl font-semibold">Settings & Utilities</h1>
        <p className="mt-2 text-zinc-400">
          Configure reusable tools, presets, and helper utilities for your card business.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Link
          href="/app/settings/shipping"
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:bg-zinc-800"
        >
          <div className="text-lg font-semibold">Shipping Profiles</div>
          <div className="mt-1 text-sm text-zinc-400">
            Manage PWE, bubble mailers, boxes, and other reusable shipping cost presets.
          </div>
        </Link>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 opacity-60">
          <div className="text-lg font-semibold">More Utilities Coming</div>
          <div className="mt-1 text-sm text-zinc-400">
            Future tools can live here, like platform fee presets, tax helpers, defaults,
            and other business utilities.
          </div>
        </div>
      </div>
    </div>
  )
}