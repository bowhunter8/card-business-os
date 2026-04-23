import Link from 'next/link'

function ImportCard({
  href,
  title,
  description,
  tone = 'default',
}: {
  href: string
  title: string
  description: string
  tone?: 'default' | 'primary' | 'success' | 'warning'
}) {
  const toneClass =
    tone === 'primary'
      ? 'border-blue-900 bg-blue-950/30 hover:bg-blue-900/30'
      : tone === 'success'
        ? 'border-emerald-900 bg-emerald-950/30 hover:bg-emerald-900/30'
        : tone === 'warning'
          ? 'border-amber-900 bg-amber-950/30 hover:bg-amber-900/30'
          : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800'

  const descriptionClass =
    tone === 'default' ? 'text-zinc-400' : 'text-zinc-300'

  return (
    <Link
      href={href}
      prefetch={false}
      className={`app-section block p-4 transition ${toneClass}`}
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className={`mt-1.5 text-sm ${descriptionClass}`}>{description}</p>
    </Link>
  )
}

function FutureImportCard({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="app-section border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1.5 text-sm text-zinc-400">{description}</p>
        </div>

        <span className="app-badge app-badge-neutral">Planned</span>
      </div>
    </div>
  )
}

export default function ImportsHubPage() {
  return (
    <div className="app-page-wide space-y-5">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Imports</h1>
          <p className="app-subtitle">
            Import orders, sales, and future record types from different platforms without
            boxing the app into one marketplace.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/utilities" className="app-button">
            Back to Utilities
          </Link>
        </div>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Active Import Flows</h2>
          <p className="mt-1 text-sm text-zinc-400">
            These are the importers already connected to working backend logic.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <ImportCard
            href="/app/imports/whatnot"
            title="Import Orders"
            description="Import order history into separate order stubs so related purchases can be grouped into breaks, batches, or other workflows later."
            tone="primary"
          />

          <ImportCard
            href="/app/imports/ebay"
            title="Import Sales"
            description="Import completed sales with gross sale, fees, shipping, and net proceeds so tax and profit tracking stay intact."
            tone="success"
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Planned Expansion</h2>
          <p className="mt-1 text-sm text-zinc-400">
            These are the next logical import modes for making the app more platform-agnostic.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <FutureImportCard
            title="Import Inventory"
            description="Bring in existing inventory from spreadsheets or legacy tracking systems."
          />

          <FutureImportCard
            title="Import Expenses"
            description="Import postage, supplies, software, equipment, and other expense records."
          />

          <FutureImportCard
            title="Custom CSV Mapping"
            description="Map unknown CSV columns into orders, sales, inventory, or expenses without relying on one source."
          />

          <FutureImportCard
            title="Invoice / Receipt Intake"
            description="Future option for OCR or pasted invoice text that can identify order or invoice numbers from different sources."
          />
        </div>
      </section>

      <div className="app-section p-4">
        <div className="text-sm font-medium text-zinc-200">Recommended structure</div>
        <div className="mt-2 space-y-1 text-sm text-zinc-400">
          <p>1. Keep source-specific parsers behind the scenes where needed.</p>
          <p>2. Present a generic import hub at the UI level.</p>
          <p>3. Add custom mapping later when you are ready for true universal CSV support.</p>
        </div>
      </div>
    </div>
  )
}