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

  return (
    <div className="app-page-wide space-y-5">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Checklist Library</h1>
          <p className="app-subtitle">
            Browse product checklists, view cards by team or checklist section, and use checklist data to help organize inventory and build sets or lots.
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Product Checklists</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Open a product to browse its team sets, base cards, prospects, inserts, autographs, variations, and other checklist sections.
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
              Start by importing a product checklist. HITS will organize the checklist so it can later be browsed by team and section and compared with your inventory.
            </p>
            <div className="mt-5">
              <Link href="/app/checklists/import" className="app-button-primary">
                Import First Checklist
              </Link>
            </div>
          </div>
        )}

        {!error && checklists.length > 0 && (
          <div className="grid gap-3 xl:grid-cols-2">
            {checklists.map((checklist) => {
              const meta = checklistMeta(checklist)
              const source = clean(checklist.source_type)

              return (
                <Link
                  key={checklist.id}
                  href={`/app/checklists/${checklist.id}`}
                  prefetch={false}
                  className="app-section block border border-zinc-800 bg-zinc-950/50 p-4 transition hover:border-cyan-700/70 hover:bg-zinc-900/70"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold text-zinc-100">
                        {checklistTitle(checklist)}
                      </h3>

                      {meta && (
                        <div className="mt-1 text-sm text-zinc-400">{meta}</div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="app-badge app-badge-info">
                          {checklist.visibility === 'global' ? 'HITS Library' : 'Private'}
                        </span>

                        {checklist.verified && (
                          <span className="app-badge app-badge-success">
                            Verified
                          </span>
                        )}

                        {source && (
                          <span className="app-badge">
                            Source: {source}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-sm font-semibold text-cyan-300">
                      Open →
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="app-section p-4">
          <h2 className="text-base font-semibold">Browse by Team</h2>
          <p className="mt-1.5 text-sm text-zinc-400">
            Team views will use the organization supplied by the checklist source, making it easy to work through team sets and breaker-style groupings.
          </p>
        </div>

        <div className="app-section p-4">
          <h2 className="text-base font-semibold">Browse by Section</h2>
          <p className="mt-1.5 text-sm text-zinc-400">
            View base, prospects, Chrome, inserts, autographs, variations, and other sections without flattening the product into one giant list.
          </p>
        </div>
      </section>
    </div>
  )
}
