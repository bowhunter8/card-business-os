import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import BreakerChecklistPricing from '@/app/components/BreakerChecklistPricing'
import { createClient } from '@/lib/supabase/server'

type BreakRow = {
  id: string
  break_name: string
  break_date: string | null
  break_format: string
  platform: string | null
  show_reference: string | null
  status: string
  target_revenue: number | null
  notes: string | null
  checklist_id: string | null
  created_at: string
  updated_at: string
}

type BreakProductRow = {
  id: string
  breaker_break_id: string
  sealed_inventory_item_id: string
  quantity_planned: number
  assigned_value: number | null
  notes: string | null
}

type SealedInventoryRow = {
  id: string
  product_name: string
  year: string | null
  manufacturer: string | null
  brand: string | null
  sport: string | null
  configuration: string | null
  inventory_unit_type: string
  quantity_received: number
  quantity_remaining: number
  original_unit_cost_basis: number | null
  total_acquisition_cost: number | null
  status: string
}

type ChecklistOption = {
  id: string
  name: string
  year: string | null
  manufacturer: string | null
  brand: string | null
  product_name: string | null
  sport: string | null
}

type ChecklistSection = {
  id: string
  checklist_id: string
  name: string
  sort_order: number | null
}

type ChecklistItem = {
  id: string
  checklist_id: string
  section_id: string
  card_number: string
  player_name: string
  printed_team: string | null
  parallel_name: string | null
  variation: string | null
  rookie_flag: boolean
  auto_flag: boolean
  relic_flag: boolean
  serial_flag: boolean
  print_run: number | null
  quantity_required: number
  sort_order: number | null
  notes: string | null
}

type ExistingSpot = {
  id: string
  spot_number: number | null
  spot_name: string
  team_name: string | null
  player_name: string | null
  asking_price: number | string | null
  notes: string | null
  spot_source: string | null
  grouping_type: string | null
  pricing_method: string | null
}

type ExistingSpotSource = {
  id: string
  breaker_break_spot_id: string
  source_type: string
  source_name: string
  team_name: string | null
  player_name: string | null
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function wholeNumber(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0))
}

function titleCase(value: string | null | undefined) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function dateDisplay(value: string | null | undefined) {
  if (!value) return '—'

  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function productMeta(item: SealedInventoryRow | undefined) {
  if (!item) return ''

  return [
    item.year,
    item.manufacturer || item.brand,
    item.configuration,
    item.sport,
  ]
    .filter(Boolean)
    .join(' • ')
}

export default async function BreakConfigurationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [
    breakResponse,
    productResponse,
    spotsResponse,
    sourcesResponse,
    checklistResponse,
  ] = await Promise.all([
    supabase
      .from('breaker_breaks')
      .select(
        [
          'id',
          'break_name',
          'break_date',
          'break_format',
          'platform',
          'show_reference',
          'status',
          'target_revenue',
          'notes',
          'checklist_id',
          'created_at',
          'updated_at',
        ].join(', ')
      )
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),

    supabase
      .from('breaker_break_products')
      .select(
        [
          'id',
          'breaker_break_id',
          'sealed_inventory_item_id',
          'quantity_planned',
          'assigned_value',
          'notes',
        ].join(', ')
      )
      .eq('breaker_break_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),

    supabase
      .from('breaker_break_spots')
      .select(
        [
          'id',
          'spot_number',
          'spot_name',
          'team_name',
          'player_name',
          'asking_price',
          'notes',
          'spot_source',
          'grouping_type',
          'pricing_method',
        ].join(', ')
      )
      .eq('breaker_break_id', id)
      .eq('user_id', user.id)
      .order('spot_number', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),

    supabase
      .from('breaker_break_spot_sources')
      .select(
        [
          'id',
          'breaker_break_spot_id',
          'source_type',
          'source_name',
          'team_name',
          'player_name',
        ].join(', ')
      )
      .eq('breaker_break_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),

    supabase
      .from('checklists')
      .select('id, name, year, manufacturer, brand, product_name, sport')
      .eq('is_active', true)
      .or(`visibility.eq.global,owner_user_id.eq.${user.id}`)
      .order('year', { ascending: false })
      .order('name', { ascending: true }),
  ])

  if (breakResponse.error || !breakResponse.data) {
    notFound()
  }

  if (productResponse.error) {
    throw new Error(
      `Unable to load break products: ${productResponse.error.message}`
    )
  }

  if (spotsResponse.error) {
    throw new Error(
      `Unable to load break spots: ${spotsResponse.error.message}`
    )
  }

  if (sourcesResponse.error) {
    throw new Error(
      `Unable to load break spot sources: ${sourcesResponse.error.message}`
    )
  }

  if (checklistResponse.error) {
    throw new Error(
      `Unable to load checklists: ${checklistResponse.error.message}`
    )
  }

  const breakRow = breakResponse.data as unknown as BreakRow
  const breakProducts = (productResponse.data ?? []) as unknown as BreakProductRow[]
  const existingSpots = (spotsResponse.data ?? []) as unknown as ExistingSpot[]
  const existingSpotSources = (sourcesResponse.data ??
    []) as unknown as ExistingSpotSource[]
  const checklists = (checklistResponse.data ?? []) as unknown as ChecklistOption[]

  const sealedIds = Array.from(
    new Set(
      breakProducts
        .map((row) => row.sealed_inventory_item_id)
        .filter((value): value is string => Boolean(value))
    )
  )

  let sealedItems: SealedInventoryRow[] = []

  if (sealedIds.length > 0) {
    const { data, error } = await supabase
      .from('sealed_inventory_items')
      .select(
        [
          'id',
          'product_name',
          'year',
          'manufacturer',
          'brand',
          'sport',
          'configuration',
          'inventory_unit_type',
          'quantity_received',
          'quantity_remaining',
          'original_unit_cost_basis',
          'total_acquisition_cost',
          'status',
        ].join(', ')
      )
      .eq('user_id', user.id)
      .in('id', sealedIds)

    if (error) {
      throw new Error(`Unable to load sealed inventory lots: ${error.message}`)
    }

    sealedItems = (data ?? []) as unknown as SealedInventoryRow[]
  }

  const sealedById = new Map(sealedItems.map((item) => [item.id, item]))

  let initialSections: ChecklistSection[] = []
  let initialItems: ChecklistItem[] = []

  if (breakRow.checklist_id) {
    const { data: sectionData, error: sectionError } = await supabase
      .from('checklist_sections')
      .select('id, checklist_id, name, sort_order')
      .eq('checklist_id', breakRow.checklist_id)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (sectionError) {
      throw new Error(
        `Unable to load saved checklist sections: ${sectionError.message}`
      )
    }

    initialSections = (sectionData ?? []) as unknown as ChecklistSection[]

    const pageSize = 1000
    let from = 0

    while (true) {
      const to = from + pageSize - 1

      const { data: itemData, error: itemError } = await supabase
        .from('checklist_items')
        .select(
          [
            'id',
            'checklist_id',
            'section_id',
            'card_number',
            'player_name',
            'printed_team',
            'parallel_name',
            'variation',
            'rookie_flag',
            'auto_flag',
            'relic_flag',
            'serial_flag',
            'print_run',
            'quantity_required',
            'sort_order',
            'notes',
          ].join(', ')
        )
        .eq('checklist_id', breakRow.checklist_id)
        .order('sort_order', { ascending: true })
        .range(from, to)

      if (itemError) {
        throw new Error(
          `Unable to load saved checklist items: ${itemError.message}`
        )
      }

      const batch = (itemData ?? []) as unknown as ChecklistItem[]
      initialItems.push(...batch)

      if (batch.length < pageSize) {
        break
      }

      from += pageSize
    }
  }

  const plannedActualCost = breakProducts.reduce((sum, product) => {
    const sealed = sealedById.get(product.sealed_inventory_item_id)

    return (
      sum +
      Number(product.quantity_planned ?? 0) *
        Number(sealed?.original_unit_cost_basis ?? 0)
    )
  }, 0)

  const assignedValue = breakProducts.reduce(
    (sum, product) => sum + Number(product.assigned_value ?? 0),
    0
  )

  const targetRevenue = Number(breakRow.target_revenue ?? 0)

  const savedAskingTotal = existingSpots.reduce(
    (sum, spot) => sum + Number(spot.asking_price ?? 0),
    0
  )

  const selectedChecklist =
    checklists.find((checklist) => checklist.id === breakRow.checklist_id) ?? null

  const canConfigure = breakRow.status === 'draft'

  return (
    <div className="app-page-wide space-y-5">
      <div className="app-page-header gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="app-badge app-badge-info">Breaker Tools</span>
            <span className="app-badge">{titleCase(breakRow.break_format)}</span>
            <span
              className={
                breakRow.status === 'draft'
                  ? 'app-badge app-badge-warning'
                  : 'app-badge app-badge-success'
              }
            >
              {titleCase(breakRow.status)}
            </span>
          </div>

          <h1 className="app-title">{breakRow.break_name}</h1>

          <p className="app-subtitle">
            Configure the checklist, selling spots, combinations, and pricing
            before the break is finalized. Planning values stay separate from
            the sealed inventory&apos;s actual acquisition cost.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/breaker-tools/sealed-inventory"
            className="app-button"
          >
            Back to Sealed Inventory
          </Link>

          <Link
            href="/app/breaker-tools/breaks/new"
            className="app-button"
          >
            Create Another Break
          </Link>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="app-section p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Break Date
          </div>
          <div className="mt-2 text-lg font-semibold text-zinc-100">
            {dateDisplay(breakRow.break_date)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {breakRow.platform || 'No platform selected'}
          </div>
        </div>

        <div className="app-section p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Planned Tax Cost
          </div>
          <div className="mt-2 text-lg font-semibold text-zinc-100">
            {money(plannedActualCost)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Actual sealed cost basis if finalized as planned
          </div>
        </div>

        <div className="app-section p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Assigned Value
          </div>
          <div className="mt-2 text-lg font-semibold text-cyan-200">
            {money(assignedValue)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Breaker planning value only
          </div>
        </div>

        <div className="app-section p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Target Revenue
          </div>
          <div className="mt-2 text-lg font-semibold text-emerald-300">
            {money(targetRevenue)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Revenue goal for this break
          </div>
        </div>

        <div className="app-section p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Saved Spot Pricing
          </div>
          <div className="mt-2 text-lg font-semibold text-emerald-300">
            {money(savedAskingTotal)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {wholeNumber(existingSpots.length)} saved spot
            {existingSpots.length === 1 ? '' : 's'}
          </div>
        </div>
      </section>

      <section className="app-section overflow-hidden">
        <div className="border-b border-zinc-800 px-4 py-3">
          <h2 className="text-base font-semibold text-zinc-100">
            Sealed Product Plan
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            These quantities are reserved in the break plan only. Nothing is
            removed from sealed inventory until the break is finalized.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-zinc-950">
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  Product
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  Planned Qty
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  Remaining Now
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  Unit Cost
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  Actual Planned Cost
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  Assigned Value
                </th>
              </tr>
            </thead>

            <tbody>
              {breakProducts.map((product) => {
                const sealed = sealedById.get(product.sealed_inventory_item_id)
                const actualCost =
                  Number(product.quantity_planned ?? 0) *
                  Number(sealed?.original_unit_cost_basis ?? 0)

                return (
                  <tr
                    key={product.id}
                    className="border-b border-zinc-900 last:border-b-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-100">
                        {sealed?.product_name ?? 'Sealed product'}
                      </div>
                      {productMeta(sealed) ? (
                        <div className="mt-1 text-xs text-zinc-500">
                          {productMeta(sealed)}
                        </div>
                      ) : null}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-zinc-200">
                      {wholeNumber(product.quantity_planned)}{' '}
                      <span className="text-xs text-zinc-500">
                        {titleCase(sealed?.inventory_unit_type)}
                        {Number(product.quantity_planned) === 1 ? '' : 's'}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-zinc-300">
                      {wholeNumber(sealed?.quantity_remaining)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-zinc-300">
                      {money(sealed?.original_unit_cost_basis)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-100">
                      {money(actualCost)}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 font-medium text-cyan-200">
                      {money(product.assigned_value)}
                    </td>
                  </tr>
                )
              })}

              {breakProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-zinc-500"
                  >
                    This break does not currently have a sealed product plan.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
        <span className="font-semibold">Accounting rule:</span>{' '}
        checklist selection, spot prices, assigned values, and target revenue are
        planning data. Saving this configuration does not consume sealed
        inventory, recognize cost of goods sold, or recognize break revenue.
      </div>

      {breakRow.show_reference || breakRow.notes || selectedChecklist ? (
        <section className="app-section p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Checklist
              </div>
              <div className="mt-1 text-sm text-zinc-200">
                {selectedChecklist?.name ?? 'Not selected yet'}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Show / Reference
              </div>
              <div className="mt-1 text-sm text-zinc-200">
                {breakRow.show_reference || '—'}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Notes
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">
                {breakRow.notes || '—'}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {canConfigure ? (
        <BreakerChecklistPricing
          breakId={breakRow.id}
          breakFormat={breakRow.break_format}
          targetRevenue={targetRevenue}
          checklists={checklists}
          sections={initialSections}
          items={initialItems}
          initialChecklistId={breakRow.checklist_id}
          initialSpots={existingSpots}
          initialSpotSources={existingSpotSources}
        />
      ) : (
        <section className="app-section p-6">
          <div className="text-base font-semibold text-zinc-100">
            Break configuration is locked
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            This break is no longer in draft status, so its checklist and selling
            spot configuration cannot be changed from this screen.
          </p>
        </section>
      )}
    </div>
  )
}
