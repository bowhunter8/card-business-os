import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type ChecklistRow = {
  id: string
  year: string | null
  manufacturer: string | null
  brand: string | null
  product_name: string | null
  name: string
  source_type: string | null
  source_reference: string | null
  visibility: string
  verified: boolean
  created_at: string
  is_active: boolean
}

function clean(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function checklistTitle(checklist: ChecklistRow) {
  return (
    clean(checklist.name) ||
    [clean(checklist.year), clean(checklist.brand), clean(checklist.product_name)]
      .filter(Boolean)
      .join(' ') ||
    'Untitled Checklist'
  )
}

function checklistMeta(checklist: ChecklistRow) {
  const parts = [
    clean(checklist.year),
    clean(checklist.manufacturer),
    clean(checklist.brand),
    clean(checklist.product_name),
  ].filter(Boolean)

  return Array.from(new Set(parts)).join(' • ')
}

function checklistBrandFamily(checklist: ChecklistRow) {
  const brand = clean(checklist.brand)
  const manufacturer = clean(checklist.manufacturer)
  const title = checklistTitle(checklist)
  const productName = clean(checklist.product_name)
  const combined = `${brand} ${manufacturer} ${productName} ${title}`.toLowerCase()

  const paniniTerms = [
    'panini',
    'prizm',
    'national treasures',
    'donruss',
    'select',
    'immaculate',
    'three and two',
    'stars & stripes',
    'stars stripes',
  ]

  const toppsTerms = [
    'topps',
    'finest',
    'stadium club',
    'heritage',
    'archives',
    'museum collection',
    'tier one',
    'pristine',
    'pro debut',
    't205',
    '205 baseball',
    'shoebox treasures',
    'allen & ginter',
    'allen ginter',
  ]

  if (combined.includes('bowman')) return 'Bowman'
  if (paniniTerms.some((term) => combined.includes(term))) return 'Panini'
  if (toppsTerms.some((term) => combined.includes(term))) return 'Topps'

  return brand || manufacturer || 'Other'
}

function groupedChecklistLibrary(checklists: ChecklistRow[]) {
  const byYear = new Map<string, Map<string, ChecklistRow[]>>()

  for (const checklist of checklists) {
    const year = clean(checklist.year) || 'Unknown Year'
    const family = checklistBrandFamily(checklist)

    if (!byYear.has(year)) byYear.set(year, new Map())
    const byBrand = byYear.get(year)!
    if (!byBrand.has(family)) byBrand.set(family, [])
    byBrand.get(family)!.push(checklist)
  }

  return Array.from(byYear.entries())
    .map(([year, brands]) => ({
      year,
      brands: Array.from(brands.entries())
        .map(([brand, rows]) => ({
          brand,
          rows: rows.sort((a, b) =>
            checklistTitle(a).localeCompare(checklistTitle(b), undefined, {
              numeric: true,
              sensitivity: 'base',
            })
          ),
        }))
        .sort((a, b) =>
          a.brand.localeCompare(b.brand, undefined, {
            numeric: true,
            sensitivity: 'base',
          })
        ),
    }))
    .sort((a, b) => {
      const ay = Number(a.year)
      const by = Number(b.year)
      if (Number.isFinite(ay) && Number.isFinite(by)) return by - ay
      return b.year.localeCompare(a.year)
    })
}

export default async function ChecklistsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('checklists')
    .select(
      'id, year, manufacturer, brand, product_name, name, source_type, source_reference, visibility, verified, created_at, is_active'
    )
    .eq('is_active', true)
    .order('year', { ascending: false })
    .order('name', { ascending: true })

  const checklists = (data ?? []) as ChecklistRow[]
  const groupedLibrary = groupedChecklistLibrary(checklists)


  return (
    <div className="app-page-wide space-y-5">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Checklist Library</h1>
          <p className="app-subtitle">
            Search every HITS checklist or browse products by year and brand to
            organize inventory, build sets, and work through breaks.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/utilities" className="app-button">
            Back to Utilities
          </Link>

          <Link href="/app/checklists/import" className="app-button-primary">
            Import Checklist
          </Link>
        </div>
      </div>

      <section className="app-section space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Search All Checklists</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Search however you know the card — player, card number, year,
            product, brand, team, section, RC/rookie, autograph, variation, or
            any combination.
          </p>
        </div>

        <form
          method="get"
          action="/app/checklists/search"
          target="_blank"
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            type="search"
            name="q"
            placeholder="Example: Kurtz RC, PD-1 Nick Kurtz, 2025 Pro Debut Kurtz..."
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-black px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-cyan-600"
          />

          <button type="submit" className="app-button-primary">
            Search Checklists
          </button>
        </form>

        <p className="text-xs text-zinc-500">
          Results open in a new tab so the Checklist Library stays open.
        </p>
      </section>

      <section className="app-section space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Product Checklists</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Open a product to browse its team sets, base cards, prospects,
              inserts, autographs, variations, and other checklist sections.
            </p>
          </div>

          <div className="text-sm text-zinc-400">
            {checklists.length} checklist{checklists.length === 1 ? '' : 's'}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-200">
            Unable to load the checklist library: {error.message}
          </div>
        )}

        {!error && checklists.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/40 p-8 text-center">
            <div className="text-lg font-semibold text-zinc-100">
              No checklists have been imported yet.
            </div>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
              Start by importing a product checklist. HITS will organize the
              checklist so it can later be browsed by team, player, and section
              and compared with your inventory.
            </p>
            <div className="mt-5">
              <Link href="/app/checklists/import" className="app-button-primary">
                Import First Checklist
              </Link>
            </div>
          </div>
        )}

        {!error && checklists.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {groupedLibrary.map((yearGroup) => (
              <details
                key={yearGroup.year}
                className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/30 open:col-span-full"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 transition hover:bg-zinc-900/70 [&::-webkit-details-marker]:hidden">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm text-cyan-300">▶</span>
                    <span className="text-lg font-bold text-zinc-100">
                      {yearGroup.year}
                    </span>
                  </div>

                  <span className="app-badge">
                    {yearGroup.brands.reduce(
                      (sum, brandGroup) => sum + brandGroup.rows.length,
                      0
                    )}
                  </span>
                </summary>

                <div className="grid gap-3 border-t border-zinc-800 p-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {yearGroup.brands.map((brandGroup) => (
                    <details
                      key={`${yearGroup.year}-${brandGroup.brand}`}
                      className="overflow-hidden rounded-xl border border-zinc-800 bg-black/20 open:col-span-full"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 transition hover:bg-zinc-900/60 [&::-webkit-details-marker]:hidden">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="shrink-0 text-sm text-cyan-300">
                            ▶
                          </span>
                          <span className="min-w-0 font-semibold text-zinc-100">
                            {brandGroup.brand}
                          </span>
                        </div>

                        <span className="app-badge">{brandGroup.rows.length}</span>
                      </summary>

                      <div className="grid gap-3 border-t border-zinc-800 p-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {brandGroup.rows.map((checklist) => {
                          const meta = checklistMeta(checklist)

                          return (
                            <Link
                              key={checklist.id}
                              href={`/app/checklists/${checklist.id}`}
                              prefetch={false}
                              className="block rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 transition hover:border-cyan-700/70 hover:bg-zinc-900/70"
                            >
                              <div className="flex h-full flex-col justify-between gap-3">
                                <div className="min-w-0">
                                  <h3 className="text-base font-semibold leading-snug text-zinc-100">
                                    {checklistTitle(checklist)}
                                  </h3>

                                  {meta && (
                                    <div className="mt-1 text-xs leading-relaxed text-zinc-400">
                                      {meta}
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="app-badge app-badge-info">
                                    {checklist.visibility === 'global'
                                      ? 'HITS Library'
                                      : 'Private'}
                                  </span>

                                  {checklist.verified && (
                                    <span className="app-badge app-badge-success">
                                      Verified
                                    </span>
                                  )}

                                  <span className="ml-auto text-sm font-semibold text-cyan-300">
                                    Open →
                                  </span>
                                </div>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="app-section p-4">
          <h2 className="text-base font-semibold">Browse by Team</h2>
          <p className="mt-1.5 text-sm text-zinc-400">
            Work through team sets and breaker-style organization, including
            parent organizations when the checklist provides them.
          </p>
        </div>

        <div className="app-section p-4">
          <h2 className="text-base font-semibold">Browse by Player</h2>
          <p className="mt-1.5 text-sm text-zinc-400">
            Find every appearance for a player within a product, including
            multi-player cards when that information is available.
          </p>
        </div>

        <div className="app-section p-4">
          <h2 className="text-base font-semibold">Browse by Section</h2>
          <p className="mt-1.5 text-sm text-zinc-400">
            View base, prospects, Chrome, inserts, autographs, variations, and
            other sections without flattening the product into one giant list.
          </p>
        </div>
      </section>
    </div>
  )
}
