import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { reverseSaleAction } from '@/app/actions/sale-safety'
import { quickSellAction } from '@/app/actions/sales'

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
    item.title || item.player_name || 'Untitled item',
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
      return getCardDisplay(item)
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

function getFilterHref(filter: '' | 'listed' | 'junk' | 'personal', sortKey: SortKey, sortDir: SortDir) {
  const params = new URLSearchParams()

  if (filter) {
    params.set('q', filter)
  }

  params.set('sort', sortKey)
  params.set('dir', sortDir)

  const query = params.toString()
  return query ? `/app/inventory?${query}` : '/app/inventory'
}

function SortHeader({
  label,
  sortKey,
  currentSortKey,
  currentSortDir,
  q,
}: {
  label: string
  sortKey: SortKey
  currentSortKey: SortKey
  currentSortDir: SortDir
  q: string
}) {
  const params = new URLSearchParams()

  if (q) {
    params.set('q', q)
  }

  params.set('sort', sortKey)
  params.set('dir', getNextSortDir(currentSortKey, currentSortDir, sortKey))

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
  searchParams?: Promise<{ q?: string; sort?: string; dir?: string; saved?: string }>
}) {
  const params = searchParams ? await searchParams : undefined
  const qRaw = String(params?.q ?? '')
  const q = cleanSearchTerm(qRaw)
  const qNormalized = q.toLowerCase()
  const saved = String(params?.saved ?? '')

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

  const response = await query.order('created_at', { ascending: false })

  const rawItems = (response.data ?? []) as InventoryRow[]
  const items = sortRows(rawItems, sortKey, sortDir)
  const error = response.error

  const itemIds = items.map((item) => item.id)

  const latestActiveSaleByItemId = new Map<string, SaleRow>()

  if (itemIds.length > 0) {
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
      .in('inventory_item_id', itemIds)
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
  const totalAvailableUnits = items.reduce((sum, item) => sum + Number(item.available_quantity ?? 0), 0)
  const totalCost = items.reduce((sum, item) => sum + Number(item.cost_basis_total ?? 0), 0)
  const totalEstimatedValue = items.reduce(
    (sum, item) => sum + Number(item.estimated_value_total ?? 0),
    0
  )

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
        <SummaryCard label="Rows" value={totalItems} />
        <SummaryCard label="Available Units" value={totalAvailableUnits} />
        <SummaryCard label="Total Cost" value={money(totalCost)} />
        <SummaryCard label="Est. Value" value={money(totalEstimatedValue)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={getFilterHref('', sortKey, sortDir)}
          className={`app-chip ${q === '' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          All
        </Link>
        <Link
          href={getFilterHref('listed', sortKey, sortDir)}
          className={`app-chip ${qNormalized === 'listed' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Listed
        </Link>
        <Link
          href={getFilterHref('personal', sortKey, sortDir)}
          className={`app-chip ${qNormalized === 'personal' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Personal
        </Link>
        <Link
          href={getFilterHref('junk', sortKey, sortDir)}
          className={`app-chip ${qNormalized === 'junk' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Junk
        </Link>
      </div>

      <form method="get" className="app-search-panel">
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search player, title, set, item / card #, team, notes..."
            className="app-input"
          />
          <input type="hidden" name="sort" value={sortKey} />
          <input type="hidden" name="dir" value={sortDir} />
          <div className="flex gap-2">
            <button type="submit" className="app-button-primary">
              Search
            </button>
            {q ? (
              <Link href={`/app/inventory?sort=${sortKey}&dir=${sortDir}`} className="app-button">
                Clear
              </Link>
            ) : null}
          </div>
        </div>

        {showingSearchText ? (
          <div className="mt-2 text-xs text-zinc-400">{showingSearchText}</div>
        ) : null}
      </form>

      {error ? <div className="app-alert-error">Error loading inventory: {error.message}</div> : null}

      <div className="app-table-wrap">
        <div className="app-table-scroll">
          <table className="app-table">
            <thead className="app-thead">
              <tr>
                <th className="app-th py-2">
                  <SortHeader
                    label="Item"
                    sortKey="card"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    q={q}
                  />
                </th>
                <th className="app-th py-2">
                  <SortHeader
                    label="Status"
                    sortKey="status"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    q={q}
                  />
                </th>
                <th className="app-th py-2">
                  <SortHeader
                    label="Qty"
                    sortKey="quantity"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    q={q}
                  />
                </th>
                <th className="app-th py-2">
                  <SortHeader
                    label="Available"
                    sortKey="available_quantity"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    q={q}
                  />
                </th>
                <th className="app-th py-2">
                  <SortHeader
                    label="Unit Cost"
                    sortKey="cost_basis_unit"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    q={q}
                  />
                </th>
                <th className="app-th py-2">
                  <SortHeader
                    label="Total Cost"
                    sortKey="cost_basis_total"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    q={q}
                  />
                </th>
                <th className="app-th py-2">
                  <SortHeader
                    label="Est. Value"
                    sortKey="estimated_value_total"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    q={q}
                  />
                </th>
                <th className="app-th py-2">
                  <SortHeader
                    label="Location"
                    sortKey="storage_location"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    q={q}
                  />
                </th>
                <th className="app-th py-2">Actions</th>
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
                    <td className="app-td py-2">
                      <div className="min-w-[220px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <div className="font-medium leading-tight">{getPrimaryTitle(item)}</div>
                          {isLotLike ? (
                            <span className="app-badge app-badge-warning">Lot / Multi Qty</span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 text-xs leading-snug text-zinc-400">{itemLine}</div>
                      </div>
                    </td>

                    <td className="app-td py-2">{renderStatusPill(item.status)}</td>

                    <td className="app-td py-2">{item.quantity ?? 0}</td>
                    <td className="app-td py-2">
                      <div className="font-medium leading-tight">{item.available_quantity ?? 0}</div>
                      {hasAvailable && isLotLike ? (
                        <div className="mt-0.5 text-[11px] text-zinc-500">partial sell ready</div>
                      ) : null}
                    </td>
                    <td className="app-td py-2 whitespace-nowrap">{money(item.cost_basis_unit)}</td>
                    <td className="app-td py-2 whitespace-nowrap">{money(item.cost_basis_total)}</td>
                    <td className="app-td py-2 whitespace-nowrap">{money(item.estimated_value_total)}</td>
                    <td className="app-td py-2">
                      <div className="max-w-[140px] truncate">{item.storage_location || '—'}</div>
                    </td>

                    <td className="app-td py-2">
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

                            <details className="w-full rounded-lg border border-zinc-800 bg-zinc-950/80 p-2">
                              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-zinc-300">
                                <span>Inline Quick Sell</span>
                                <span className="text-[10px] text-zinc-500">
                                  {isLotLike ? `${available} available` : 'single item'}
                                </span>
                              </summary>

                              <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/70 p-2">
                                <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
                                  <span>
                                    Available to sell: <span className="text-zinc-200">{available}</span>
                                  </span>
                                  <span>
                                    Unit cost: <span className="text-zinc-200">{money(item.cost_basis_unit)}</span>
                                  </span>
                                  {isLotLike ? (
                                    <span className="text-zinc-500">
                                      Add a note for which item or part of the lot sold.
                                    </span>
                                  ) : (
                                    <span className="text-zinc-500">
                                      Use the full Sell page when you want a more detailed entry flow.
                                    </span>
                                  )}
                                </div>
                              </div>

                              <form action={quickSellAction} className="mt-2 space-y-2">
                                <input type="hidden" name="inventory_item_id" value={item.id} />
                                <input type="hidden" name="sale_date" value={new Date().toISOString().slice(0, 10)} />

                                <div className="grid gap-2 md:grid-cols-2">
                                  <div>
                                    <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-400">
                                      Qty
                                    </label>
                                    <input
                                      name="quantity_sold"
                                      type="number"
                                      min={1}
                                      max={available}
                                      defaultValue={1}
                                      className="app-input"
                                    />
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-400">
                                      Item Sale Price
                                    </label>
                                    <input
                                      name="gross_sale"
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      defaultValue=""
                                      placeholder="0.00"
                                      className="app-input"
                                    />
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-400">
                                      Shipping Charged
                                    </label>
                                    <input
                                      name="shipping_charged"
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      defaultValue="0.00"
                                      className="app-input"
                                    />
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-400">
                                      Platform Fees
                                    </label>
                                    <input
                                      name="platform_fees"
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      defaultValue="0.00"
                                      className="app-input"
                                    />
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-400">
                                      Postage
                                    </label>
                                    <input
                                      name="shipping_cost"
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      defaultValue="0.00"
                                      className="app-input"
                                    />
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-400">
                                      Supplies
                                    </label>
                                    <input
                                      name="supplies_cost"
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      defaultValue="0.00"
                                      className="app-input"
                                    />
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-400">
                                      Other Costs
                                    </label>
                                    <input
                                      name="other_costs"
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      defaultValue="0.00"
                                      className="app-input"
                                    />
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-400">
                                      Platform
                                    </label>
                                    <input
                                      name="platform"
                                      type="text"
                                      placeholder="eBay, Whatnot, local..."
                                      className="app-input"
                                    />
                                  </div>

                                  <div className="md:col-span-2">
                                    <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-400">
                                      Sale Notes
                                    </label>
                                    <textarea
                                      name="notes"
                                      rows={2}
                                      placeholder="Optional: which item from lot, condition, bundle note..."
                                      className="app-textarea"
                                    />
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2 pt-1">
                                  <button
                                    type="submit"
                                    name="mode"
                                    value="sell_one"
                                    className="app-button-primary"
                                  >
                                    Sell 1 Now
                                  </button>

                                  {isLotLike ? (
                                    <button
                                      type="submit"
                                      name="mode"
                                      value="sell_all"
                                      className="app-button"
                                    >
                                      Sell All Remaining
                                    </button>
                                  ) : null}

                                  <Link href={`/app/inventory/${item.id}/sell`} className="app-button">
                                    Open Full Sell Page
                                  </Link>
                                </div>
                              </form>
                            </details>
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
  )
}