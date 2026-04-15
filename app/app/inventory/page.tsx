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
    const result = compareValues(
      getSortValue(left, sortKey),
      getSortValue(right, sortKey)
    )

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
      <span className="text-xs">{getSortIndicator(currentSortKey, currentSortDir, sortKey)}</span>
    </Link>
  )
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; sort?: string; dir?: string }>
}) {
  const params = searchParams ? await searchParams : undefined
  const qRaw = String(params?.q ?? '')
  const q = cleanSearchTerm(qRaw)
  const qNormalized = q.toLowerCase()

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
        : 'View and manage your card inventory.'

  const showingSearchText =
    q && qNormalized !== 'listed' && qNormalized !== 'junk'
      ? `Showing results for "${q}"`
      : qNormalized === 'listed'
        ? 'Showing listed inventory.'
        : qNormalized === 'junk'
          ? 'Showing junk inventory.'
          : ''

  return (
    <div className="max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="mt-1 text-sm text-zinc-400">{pageDescription}</p>
        </div>

        <Link
          href="/app/inventory/new"
          className="inline-flex rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
        >
          Add Inventory
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/app/inventory"
          className={`rounded-lg border px-4 py-1.5 text-sm hover:bg-zinc-800 ${
            q === ''
              ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
              : 'border-zinc-700 text-zinc-300'
          }`}
        >
          All
        </Link>
        <Link
          href="/app/inventory?q=listed"
          className={`rounded-lg border px-4 py-1.5 text-sm hover:bg-zinc-800 ${
            qNormalized === 'listed'
              ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
              : 'border-zinc-700 text-zinc-300'
          }`}
        >
          Listed
        </Link>
        <Link
          href="/app/inventory?q=junk"
          className={`rounded-lg border px-4 py-1.5 text-sm hover:bg-zinc-800 ${
            qNormalized === 'junk'
              ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
              : 'border-zinc-700 text-zinc-300'
          }`}
        >
          Junk
        </Link>
      </div>

      <form
        method="get"
        className="rounded-xl border border-zinc-800 bg-zinc-900 p-3"
      >
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search player, title, set, card #, team, notes..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
            >
              Search
            </button>
            {q ? (
              <Link
                href="/app/inventory"
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </div>

        {showingSearchText ? (
          <div className="mt-2 text-xs text-zinc-400">
            {showingSearchText}
          </div>
        ) : null}
      </form>

      {error ? (
        <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Error loading inventory: {error.message}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950 text-zinc-400">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Card"
                    sortKey="card"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    q={q}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Status"
                    sortKey="status"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    q={q}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Qty"
                    sortKey="quantity"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    q={q}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Available"
                    sortKey="available_quantity"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    q={q}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Unit Cost"
                    sortKey="cost_basis_unit"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    q={q}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Total Cost"
                    sortKey="cost_basis_total"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    q={q}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Est. Value"
                    sortKey="estimated_value_total"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    q={q}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">
                  <SortHeader
                    label="Location"
                    sortKey="storage_location"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    q={q}
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const itemLine = getCardDisplay(item)
                const hasAvailable = Number(item.available_quantity ?? 0) > 0
                const latestActiveSale = latestActiveSaleByItemId.get(item.id) ?? null

                return (
                  <tr key={item.id} className="border-t border-zinc-800 align-top">
                    <td className="px-3 py-2.5">
                      <div className="font-medium leading-snug">
                        {item.title || item.player_name || 'Untitled item'}
                      </div>
                      <div className="mt-0.5 text-xs leading-snug text-zinc-400">
                        {itemLine}
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      {item.status === 'available' ? (
                        <span className="rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-xs text-emerald-300">
                          For Sale
                        </span>
                      ) : item.status === 'personal' ? (
                        <span className="rounded-full border border-blue-800 bg-blue-950/40 px-2 py-0.5 text-xs text-blue-300">
                          Personal
                        </span>
                      ) : item.status === 'junk' ? (
                        <span className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                          Junk
                        </span>
                      ) : item.status === 'listed' ? (
                        <span className="rounded-full border border-purple-800 bg-purple-950/40 px-2 py-0.5 text-xs text-purple-300">
                          Listed
                        </span>
                      ) : (
                        <span className="capitalize text-zinc-400">
                          {(item.status || '—').replaceAll('_', ' ')}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2.5">{item.quantity ?? 0}</td>
                    <td className="px-3 py-2.5">{item.available_quantity ?? 0}</td>
                    <td className="px-3 py-2.5">{money(item.cost_basis_unit)}</td>
                    <td className="px-3 py-2.5">{money(item.cost_basis_total)}</td>
                    <td className="px-3 py-2.5">{money(item.estimated_value_total)}</td>
                    <td className="px-3 py-2.5">{item.storage_location || '—'}</td>

                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/app/inventory/${item.id}`}
                          className="inline-flex rounded-lg border border-zinc-700 px-3 py-1 hover:bg-zinc-800"
                        >
                          Details
                        </Link>

                        <Link
                          href={`/app/inventory/${item.id}/edit`}
                          className="inline-flex rounded-lg border border-zinc-700 px-3 py-1 hover:bg-zinc-800"
                        >
                          Edit
                        </Link>

                        {hasAvailable ? (
                          <Link
                            href={`/app/inventory/${item.id}/sell`}
                            className="inline-flex rounded-lg border border-zinc-700 px-3 py-1 hover:bg-zinc-800"
                          >
                            Sell
                          </Link>
                        ) : latestActiveSale ? (
                          <form action={reverseSaleAction}>
                            <input type="hidden" name="sale_id" value={latestActiveSale.id} />
                            <input type="hidden" name="inventory_item_id" value={item.id} />
                            <input
                              type="hidden"
                              name="reversal_reason"
                              value="Quick reverse from inventory list"
                            />
                            <button
                              type="submit"
                              className="inline-flex rounded-lg border border-red-800 bg-red-950/40 px-3 py-1 text-red-200 hover:bg-red-950"
                            >
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