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

export default function ImportsHubPage() {
  return (
    <div className="app-page-wide space-y-5">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Imports</h1>
          <p className="app-subtitle">
            Import orders and sales from different platforms without boxing the app into
            one marketplace.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/utilities" className="app-button">
            Back to Utilities
          </Link>
        </div>
      </div>

      <section className="space-y-3">
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
    </div>
  )
}
