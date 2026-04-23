import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { reverseSaleAction } from '@/app/actions/sale-safety'

type InventoryRow = {
  id: string
  status: string | null
  item_type: string | null
  title: string | null
  player_name: string | null
  year: number | null
  brand: string | null
  set_name: string | null
  card_number: string | null
  parallel_name: string | null
  team: string | null
  quantity: number | null
  available_quantity: number | null
  cost_basis_unit: number | null
  cost_basis_total: number | null
  estimated_value_total: number | null
  storage_location: string | null
  notes: string | null
  created_at?: string
}

type SaleRow = {
  id: string
  inventory_item_id: string
  sale_date: string | null
  quantity_sold: number | null
  reversed_at: string | null
}

type SortKey =
  | 'created_at'
  | 'card'
  | 'status'
  | 'quantity'
  | 'available_quantity'
  | 'cost_basis_unit'
  | 'cost_basis_total'
  | 'estimated_value_total'
  | 'storage_location'

type SortDir = 'asc' | 'desc'

const DEFAULT_LIMIT = 10
const LIMIT_OPTIONS = [10, 25, 100] as const

function money(value: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function cleanSearchTerm(value: string) {
  return value.trim().replace(/,/g, ' ')
}

function getCardDisplay(item: InventoryRow) {
  return [
    item.year,
    item.brand,
    item.set_name,
    item.card_number ? `#${item.card_number}` : null,
    item.parallel_name,
    item.team,
  ]
    .filter(Boolean)
    .join(' • ')
}

function getPrimaryTitle(item: InventoryRow) {
  return item.title || item.player_name || 'Untitled item'
}

function getSortValue(item: InventoryRow, key: SortKey) {
  switch (key) {
    case 'created_at':
      return item.created_at || ''
    case 'card':
      return `${getPrimaryTitle(item)} ${getCardDisplay(item)}`
    case 'status':
      return item.status || ''
    case 'quantity':
      return Number(item.quantity ?? 0)
    case 'available_quantity':
      return Number(item.available_quantity ?? 0)
    case 'cost_basis_unit':
      return Number(item.cost_basis_unit ?? 0)
    case 'cost_basis_total':
      return Number(item.cost_basis_total ?? 0)
    case 'estimated_value_total':
      return Number(item.estimated_value_total ?? 0)
    case 'storage_location':
      return item.storage_location || ''
    default:
      return ''
  }
}

function compareValues(a: string | number, b: string | number) {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }

  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function sortRows(rows: InventoryRow[], sortKey: SortKey, sortDir: SortDir) {
  return [...rows].sort((left, right) => {
    const result = compareValues(getSortValue(left, sortKey), getSortValue(right, sortKey))
    return sortDir === 'asc' ? result : -result
  })
}

function getNextSortDir(currentKey: SortKey, currentDir: SortDir, nextKey: SortKey): SortDir {
  if (currentKey !== nextKey) return nextKey === 'created_at' ? 'desc' : 'asc'
  return currentDir === 'asc' ? 'desc' : 'asc'
}

function getSortIndicator(currentKey: SortKey, currentSortDir: SortDir, key: SortKey) {
  if (currentKey !== key) return '↕'
  return currentSortDir === 'asc' ? '↑' : '↓'
}

function renderStatusPill(status: string | null) {
  if (status === 'available') {
    return <span className="app-badge app-badge-success">For Sale</span>
  }

  if (status === 'personal') {
    return <span className="app-badge app-badge-info">Personal</span>
  }

  if (status === 'junk') {
    return <span className="app-badge app-badge-neutral">Junk</span>
  }

  if (status === 'listed') {
    return <span className="app-badge app-badge-info">Listed</span>
  }

  if (status === 'sold') {
    return <span className="app-badge app-badge-warning">Sold</span>
  }

  return (
    <span className="text-xs capitalize text-zinc-400">
      {(status || '—').replaceAll('_', ' ')}
    </span>
  )
}

function buildInventoryHref({
  q,
  sort,
  dir,
  page,
  limit,
}: {
  q?: string
  sort: SortKey
  dir: SortDir
  page: number
  limit: number
}) {
  const params = new URLSearchParams()

  if (q) {
    params.set('q', q)
  }

  params.set('sort', sort)
  params.set('dir', dir)
  params.set('page', String(page))
  params.set('limit', String(limit))

  return `/app/inventory?${params.toString()}`
}

function getFilterHref(
  filter: '' | 'listed' | 'junk' | 'personal',
  sortKey: SortKey,
  sortDir: SortDir,
  limit: number
) {
  const params = new URLSearchParams()

  if (filter) {
    params.set('q', filter)
  }

  params.set('sort', sortKey)
  params.set('dir', sortDir)
  params.set('page', '1')
  params.set('limit', String(limit))

  const query = params.toString()
  return query ? `/app/inventory?${query}` : '/app/inventory'
}

function buildLimitHref({
  q,
  sort,
  dir,
  limit,
}: {
  q?: string
  sort: SortKey
  dir: SortDir
  limit: number
}) {
  const params = new URLSearchParams()

  if (q) {
    params.set('q', q)
  }

  params.set('sort', sort)
  params.set('dir', dir)
  params.set('page', '1')
  params.set('limit', String(limit))

  return `/app/inventory?${params.toString()}`
}

function SortHeader({
  label,
  sortKey,
  currentSortKey,
  currentSortDir,
  q,
  limit,
}: {
  label: string
  sortKey: SortKey
  currentSortKey: SortKey
  currentSortDir: SortDir
  q: string
  limit: number
}) {
  const params = new URLSearchParams()

  if (q) {
    params.set('q', q)
  }

  params.set('sort', sortKey)
  params.set('dir', getNextSortDir(currentSortKey, currentSortDir, sortKey))
  params.set('page', '1')
  params.set('limit', String(limit))

  return (
    <Link
      href={`/app/inventory?${params.toString()}`}
      className="inline-flex items-center gap-1 hover:text-zinc-100"
    >
      <span>{label}</span>
      <span className="text-[10px]">{getSortIndicator(currentSortKey, currentSortDir, sortKey)}</span>
    </Link>
  )
}

function SummaryCard({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="app-card-tight p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-base font-semibold leading-tight">{value}</div>
    </div>
  )
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string
    sort?: string
    dir?: string
    saved?: string
    page?: string
    limit?: string
  }>
}) {
  const params = searchParams ? await searchParams : undefined
  const qRaw = String(params?.q ?? '')
  const q = cleanSearchTerm(qRaw)
  const qNormalized = q.toLowerCase()
  const saved = String(params?.saved ?? '')
  const requestedPage = Number(String(params?.page ?? '1'))
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1

  const requestedLimit = Number(String(params?.limit ?? String(DEFAULT_LIMIT)))
  const limit = LIMIT_OPTIONS.includes(requestedLimit as (typeof LIMIT_OPTIONS)[number])
    ? requestedLimit
    : DEFAULT_LIMIT

  const requestedSort = String(params?.sort ?? 'created_at').trim() as SortKey
  const requestedDir = String(params?.dir ?? 'desc').trim() as SortDir

  const sortKey: SortKey = [
    'created_at',
    'card',
    'status',
    'quantity',
    'available_quantity',
    'cost_basis_unit',
    'cost_basis_total',
    'estimated_value_total',
    'storage_location',
  ].includes(requestedSort)
    ? requestedSort
    : 'created_at'

  const sortDir: SortDir = requestedDir === 'asc' ? 'asc' : 'desc'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  let query = supabase
    .from('inventory_items')
    .select(`
      id,
      status,
      item_type,
      title,
      player_name,
      year,
      brand,
      set_name,
      card_number,
      parallel_name,
      team,
      quantity,
      available_quantity,
      cost_basis_unit,
      cost_basis_total,
      estimated_value_total,
      storage_location,
      notes,
      created_at
    `)
    .eq('user_id', user.id)

  if (qNormalized !== 'junk') {
    query = query.neq('status', 'junk')
  }

  if (qNormalized === 'listed') {
    query = query.eq('status', 'listed')
  } else if (qNormalized === 'junk') {
    query = query.eq('status', 'junk')
  } else if (qNormalized === 'personal') {
    query = query.eq('status', 'personal')
  } else if (q) {
    query = query.or(
      [
        `title.ilike.%${q}%`,
        `player_name.ilike.%${q}%`,
        `brand.ilike.%${q}%`,
        `set_name.ilike.%${q}%`,
        `card_number.ilike.%${q}%`,
        `parallel_name.ilike.%${q}%`,
        `team.ilike.%${q}%`,
        `notes.ilike.%${q}%`,
        `storage_location.ilike.%${q}%`,
      ].join(',')
    )
  }

  const dbSortKey = sortKey === 'card' ? 'created_at' : sortKey

  const from = (page - 1) * limit
  const to = from + limit - 1

  const response = await query
    .order(dbSortKey, { ascending: sortDir === 'asc' })
    .range(from, to)

  const rawItems = (response.data ?? []) as InventoryRow[]
  const items = sortKey === 'card' ? sortRows(rawItems, sortKey, sortDir) : rawItems
  const error = response.error

  const soldOutItemIds = items
    .filter((item) => Number(item.available_quantity ?? 0) <= 0)
    .map((item) => item.id)

  const latestActiveSaleByItemId = new Map<string, SaleRow>()

  if (soldOutItemIds.length > 0) {
    const salesResponse = await supabase
      .from('sales')
      .select(`
        id,
        inventory_item_id,
        sale_date,
        quantity_sold,
        reversed_at
      `)
      .eq('user_id', user.id)
      .in('inventory_item_id', soldOutItemIds)
      .order('sale_date', { ascending: false })

    const salesRows = (salesResponse.data ?? []) as SaleRow[]

    for (const sale of salesRows) {
      if (sale.reversed_at) continue
      if (latestActiveSaleByItemId.has(sale.inventory_item_id)) continue
      latestActiveSaleByItemId.set(sale.inventory_item_id, sale)
    }
  }

  const pageDescription =
    qNormalized === 'listed'
      ? 'Showing listed inventory items.'
      : qNormalized === 'junk'
        ? 'Showing junk items you are not planning to sell.'
        : qNormalized === 'personal'
          ? 'Showing personal collection items.'
          : 'View and manage your inventory items.'

  const showingSearchText =
    q && qNormalized !== 'listed' && qNormalized !== 'junk' && qNormalized !== 'personal'
      ? `Showing results for "${q}"`
      : qNormalized === 'listed'
        ? 'Showing listed inventory.'
        : qNormalized === 'junk'
          ? 'Showing junk inventory.'
          : qNormalized === 'personal'
            ? 'Showing personal inventory.'
            : ''

  const totalItems = items.length
  const totalAvailableUnits = items.reduce(
    (sum, item) => sum + Number(item.available_quantity ?? 0),
    0
  )
  const totalCost = items.reduce((sum, item) => sum + Number(item.cost_basis_total ?? 0), 0)
  const totalEstimatedValue = items.reduce(
    (sum, item) => sum + Number(item.estimated_value_total ?? 0),
    0
  )

  const hasPreviousPage = page > 1
  const hasNextPage = items.length === limit

  return (
    <div className="app-page-wide space-y-3">
      <div className="app-page-header gap-3">
        <div className="min-w-0">
          <h1 className="app-title">Inventory</h1>
          <p className="app-subtitle">{pageDescription}</p>
        </div>

        <Link href="/app/inventory/new" className="app-button-primary">
          Add Inventory
        </Link>
      </div>

      {saved === '1' ? (
        <div className="app-alert-success">
          Quick sale recorded, inventory updated, and tax tracking kept in sync.
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Rows On This Page" value={totalItems} />
        <SummaryCard label="Available Units" value={totalAvailableUnits} />
        <SummaryCard label="Total Cost" value={money(totalCost)} />
        <SummaryCard label="Est. Value" value={money(totalEstimatedValue)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={getFilterHref('', sortKey, sortDir, limit)}
          className={`app-chip ${q === '' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          All
        </Link>
        <Link
          href={getFilterHref('listed', sortKey, sortDir, limit)}
          className={`app-chip ${qNormalized === 'listed' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Listed
        </Link>
        <Link
          href={getFilterHref('personal', sortKey, sortDir, limit)}
          className={`app-chip ${qNormalized === 'personal' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Personal
        </Link>
        <Link
          href={getFilterHref('junk', sortKey, sortDir, limit)}
          className={`app-chip ${qNormalized === 'junk' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Junk
        </Link>
      </div>

      <div className="app-section p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            {showingSearchText ? (
              <div className="text-xs text-zinc-400">{showingSearchText}</div>
            ) : (
              <div className="text-xs text-zinc-500">
                Use the global search bar at the top for new searches.
              </div>
            )}
            <div className="mt-1 text-xs text-zinc-500">Page {page}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            {LIMIT_OPTIONS.map((option) => (
              <Link
                key={option}
                href={buildLimitHref({
                  q,
                  sort: sortKey,
                  dir: sortDir,
                  limit: option,
                })}
                className={`app-chip ${limit === option ? 'app-chip-active' : 'app-chip-idle'}`}
              >
                {option} rows
              </Link>
            ))}
          </div>
        </div>
      </div>

      {error ? <div className="app-alert-error">Error loading inventory: {error.message}</div> : null}

      <div className="app-section">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Inventory</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              One row per item. Open details when you need the full record.
            </p>
          </div>

          <div className="text-xs text-zinc-500">{items.length} shown</div>
        </div>

        <div className="mt-4 app-table-wrap">
          <div className="app-table-scroll">
            <table className="app-table">
              <thead className="app-thead">
                <tr>
                  <th className="app-th">
                    <SortHeader
                      label="Item"
                      sortKey="card"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Status"
                      sortKey="status"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Qty"
                      sortKey="quantity"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Available"
                      sortKey="available_quantity"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Unit Cost"
                      sortKey="cost_basis_unit"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Total Cost"
                      sortKey="cost_basis_total"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Est. Value"
                      sortKey="estimated_value_total"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Location"
                      sortKey="storage_location"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const itemLine = getCardDisplay(item)
                  const quantity = Number(item.quantity ?? 0)
                  const available = Number(item.available_quantity ?? 0)
                  const hasAvailable = available > 0
                  const isLotLike = quantity > 1 || available > 1
                  const latestActiveSale = latestActiveSaleByItemId.get(item.id) ?? null

                  return (
                    <tr key={item.id} className="app-tr">
                      <td className="app-td whitespace-nowrap">
                        <div className="min-w-55">
                          <div className="flex items-center gap-1.5">
                            <div className="truncate font-medium leading-tight">
                              {getPrimaryTitle(item)}
                            </div>
                            {isLotLike ? (
                              <span className="app-badge app-badge-warning">Lot / Multi Qty</span>
                            ) : null}
                          </div>
                          <div
                            className="mt-0.5 truncate text-xs text-zinc-400"
                            title={itemLine || getPrimaryTitle(item)}
                          >
                            {itemLine || '—'}
                          </div>
                        </div>
                      </td>

                      <td className="app-td whitespace-nowrap">{renderStatusPill(item.status)}</td>
                      <td className="app-td whitespace-nowrap">{item.quantity ?? 0}</td>

                      <td className="app-td whitespace-nowrap">
                        <div className="font-medium leading-tight">{item.available_quantity ?? 0}</div>
                        {hasAvailable && isLotLike ? (
                          <div className="mt-0.5 text-[11px] text-zinc-500">partial sell ready</div>
                        ) : null}
                      </td>

                      <td className="app-td whitespace-nowrap">{money(item.cost_basis_unit)}</td>
                      <td className="app-td whitespace-nowrap">{money(item.cost_basis_total)}</td>
                      <td className="app-td whitespace-nowrap">{money(item.estimated_value_total)}</td>

                      <td className="app-td">
                        <div className="max-w-35 truncate" title={item.storage_location || '—'}>
                          {item.storage_location || '—'}
                        </div>
                      </td>

                      <td className="app-td">
                        <div className="flex flex-wrap gap-1.5">
                          <Link href={`/app/inventory/${item.id}`} className="app-button">
                            Details
                          </Link>

                          <Link href={`/app/inventory/${item.id}/edit`} className="app-button">
                            Edit
                          </Link>

                          {hasAvailable ? (
                            <>
                              <Link href={`/app/inventory/${item.id}/sell`} className="app-button-primary">
                                Sell
                              </Link>
                              {isLotLike ? (
                                <Link href={`/app/inventory/${item.id}/sell`} className="app-button">
                                  Sell Qty
                                </Link>
                              ) : null}
                            </>
                          ) : latestActiveSale ? (
                            <form action={reverseSaleAction}>
                              <input type="hidden" name="sale_id" value={latestActiveSale.id} />
                              <input type="hidden" name="inventory_item_id" value={item.id} />
                              <input
                                type="hidden"
                                name="reversal_reason"
                                value="Quick reverse from inventory list"
                              />
                              <button type="submit" className="app-button-danger">
                                Reverse Sale
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-zinc-400">
                      {q ? 'No inventory items match your search.' : 'No inventory items found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="app-section p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-zinc-300">
            Showing page {page} with up to {limit} rows.
          </div>

          <div className="flex gap-2">
            {hasPreviousPage ? (
              <Link
                href={buildInventoryHref({
                  q,
                  sort: sortKey,
                  dir: sortDir,
                  page: page - 1,
                  limit,
                })}
                className="app-button"
              >
                Previous
              </Link>
            ) : (
              <span className="app-button pointer-events-none opacity-50">Previous</span>
            )}

            {hasNextPage ? (
              <Link
                href={buildInventoryHref({
                  q,
                  sort: sortKey,
                  dir: sortDir,
                  page: page + 1,
                  limit,
                })}
                className="app-button-primary"
              >
                Next
              </Link>
            ) : (
              <span className="app-button-primary pointer-events-none opacity-50">Next</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}