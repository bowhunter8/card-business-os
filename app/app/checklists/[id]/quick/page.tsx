import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ChecklistLoadingLink from '@/app/components/ChecklistLoadingLink'

type ChecklistRow = {
  id: string
  owner_user_id: string | null
  visibility: string
  sport: string | null
  year: string | null
  manufacturer: string | null
  brand: string | null
  product_name: string | null
  name: string
  source_type: string | null
  verified: boolean
  is_active: boolean
}

type ChecklistSectionRow = {
  id: string
  checklist_id: string
  name: string
  section_type: string | null
  sort_order: number | null
}

type PageProps = {
  params: Promise<{
    id: string
  }>
}

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function buildMeta(checklist: ChecklistRow) {
  const parts = [
    clean(checklist.sport),
    clean(checklist.year),
    clean(checklist.manufacturer),
    clean(checklist.brand),
    clean(checklist.product_name),
  ].filter(Boolean)

  return [...new Set(parts)].join(' • ')
}

export default async function ChecklistQuickViewPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  /*
   * Keep the normal authenticated checklist read as the access gate.
   * This page does not bypass checklist visibility/RLS.
   */
  const { data: checklistData, error: checklistError } = await supabase
    .from('checklists')
    .select(
      'id, owner_user_id, visibility, sport, year, manufacturer, brand, product_name, name, source_type, verified, is_active'
    )
    .eq('id', id)
    .maybeSingle()

  if (checklistError) {
    throw new Error(`Unable to load checklist: ${checklistError.message}`)
  }

  if (!checklistData) notFound()

  const checklist = checklistData as ChecklistRow

  /*
   * Quick View intentionally does NOT load:
   * - checklist_inventory_matches
   * - inventory_items
   * - ChecklistAutoMatcher
   * - Set Builder data
   * - all checklist_items
   * - checklist_item_people
   *
   * These small queries give us a genuinely lightweight first render.
   */
  const [
    { data: sectionsData, error: sectionsError },
    { count: itemCount, error: itemCountError },
  ] = await Promise.all([
    supabase
      .from('checklist_sections')
      .select('id, checklist_id, name, section_type, sort_order')
      .eq('checklist_id', checklist.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('checklist_items')
      .select('id', { count: 'exact', head: true })
      .eq('checklist_id', checklist.id),
  ])

  if (sectionsError) {
    throw new Error(`Unable to load checklist sections: ${sectionsError.message}`)
  }

  if (itemCountError) {
    throw new Error(`Unable to count checklist items: ${itemCountError.message}`)
  }

  const sections = (sectionsData ?? []) as ChecklistSectionRow[]
  const meta = buildMeta(checklist)

  return (
    <div className="mx-auto w-full max-w-400 space-y-4 px-4 py-4 sm:px-6">
      <div className="app-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              <span className="app-badge app-badge-info">Quick View</span>

              <span className="app-badge">
                {checklist.visibility === 'global' ? 'HITS Library' : 'Private'}
              </span>

              {checklist.verified && (
                <span className="app-badge app-badge-success">Verified</span>
              )}

              {clean(checklist.source_type) && (
                <span className="app-badge">
                  Source: {checklist.source_type}
                </span>
              )}
            </div>

            <h1 className="app-title">{checklist.name}</h1>

            {meta && <p className="app-subtitle">{meta}</p>}

            <div className="mt-3 flex flex-wrap gap-2 text-sm text-zinc-300">
              <span className="app-badge">
                {Number(itemCount ?? 0).toLocaleString()} cards
              </span>

              <span className="app-badge">
                {sections.length.toLocaleString()} sections
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <ChecklistLoadingLink
              href={`/app/checklists/${checklist.id}`}
              className="app-button app-button-primary"
            >
              Check My Inventory
            </ChecklistLoadingLink>

            <ChecklistLoadingLink
              href="/app/checklists"
              className="app-button"
            >
              Back to Checklist Library
            </ChecklistLoadingLink>
          </div>
        </div>
      </div>

      <div className="app-section">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-zinc-100">
            Browse Checklist
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            This lightweight page does not load the full checklist or your
            inventory. Team, player, section, and search browsing will be added
            here without changing the existing Inventory View.
          </p>
        </div>

        {sections.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sections.map((section) => (
              <div
                key={section.id}
                className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3"
              >
                <div className="font-medium text-zinc-100">
                  {section.name}
                </div>

                {clean(section.section_type) && (
                  <div className="mt-1 text-xs text-zinc-500">
                    {section.section_type}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-400">
            This checklist does not have meaningful section rows. Team and
            player browsing will still be supported as we add the lightweight
            browse queries.
          </div>
        )}
      </div>

      <div className="app-card border border-cyan-950">
        <p className="text-sm text-zinc-300">
          <strong className="text-zinc-100">Performance test:</strong> this
          route intentionally avoids loading every checklist card. On a very
          large checklist, this page should open substantially faster than the
          full Inventory View.
        </p>
      </div>
    </div>
  )
}
