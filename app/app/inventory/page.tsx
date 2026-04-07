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

function money(value: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function cleanSearchTerm(value: string) {
  return value.trim().replace(/,/g, ' ')
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>
}) {
  const params = searchParams ? await searchParams : undefined
  const q = cleanSearchTerm(params?.q ?? '')

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

  if (q) {
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

  const items: InventoryRow[] = (response.data ?? []) as InventoryRow[]
  const error = response.error

  const itemIds = items.map((item) => item.id)

  let salesByItemId = new Map<string, SaleRow[]>()

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

    const salesRows: SaleRow[] = (salesResponse.data ?? []) as SaleRow[]

    salesByItemId = salesRows.reduce((map, sale) => {
      const existing = map.get(sale.inventory_item_id) ?? []
      existing.push(sale)
      map.set(sale.inventory_item_id, existing)
      return map
    }, new Map<string, SaleRow[]>())
  }

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Inventory</h1>
          <p className="mt-2 text-zinc-400">
            View and manage your card inventory.
          </p>
        </div>

        <Link
          href="/app/inventory/new"
          className="inline-flex rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
        >
          Add Inventory
        </Link>
      </div>

      <form method="get" className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search player, title, set, card #, team, notes..."
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2"
          />
          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
            >
              Search
            </button>
            {q ? (
              <Link
                href="/app/inventory"
                className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </div>

        {q ? (
          <div className="mt-3 text-sm text-zinc-400">
            Showing results for <span className="text-zinc-200">"{q}"</span>
          </div>
        ) : null}
      </form>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Error loading inventory: {error.message}
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950 text-zinc-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Card</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Qty</th>
                <th className="px-4 py-3 text-left font-medium">Available</th>
                <th className="px-4 py-3 text-left font-medium">Unit Cost</th>
                <th className="px-4 py-3 text-left font-medium">Total Cost</th>
                <th className="px-4 py-3 text-left font-medium">Est. Value</th>
                <th className="px-4 py-3 text-left font-medium">Location</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const itemLine = [
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

                const hasAvailable = Number(item.available_quantity ?? 0) > 0
                const itemSales = salesByItemId.get(item.id) ?? []
                const activeSales = itemSales.filter((sale) => !sale.reversed_at)
                const latestActiveSale = activeSales[0] ?? null

                return (
                  <tr key={item.id} className="border-t border-zinc-800">
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {item.title || item.player_name || 'Untitled item'}
                      </div>
                      <div className="text-zinc-400">{itemLine}</div>
                    </td>

                    <td className="px-4 py-3 capitalize">
                      {(item.status || '—').replaceAll('_', ' ')}
                    </td>

                    <td className="px-4 py-3">{item.quantity ?? 0}</td>

                    <td className="px-4 py-3">{item.available_quantity ?? 0}</td>

                    <td className="px-4 py-3">{money(item.cost_basis_unit)}</td>

                    <td className="px-4 py-3">{money(item.cost_basis_total)}</td>

                    <td className="px-4 py-3">{money(item.estimated_value_total)}</td>

                    <td className="px-4 py-3">{item.storage_location || '—'}</td>

                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <Link
                          href={`/app/inventory/${item.id}`}
                          className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
                        >
                          Details
                        </Link>

                        <Link
                          href={`/app/inventory/${item.id}/edit`}
                          className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
                        >
                          Edit
                        </Link>

                        {hasAvailable ? (
                          <Link
                            href={`/app/inventory/${item.id}/sell`}
                            className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
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
                              className="inline-flex rounded-lg border border-red-800 bg-red-950/40 px-3 py-1.5 text-red-200 hover:bg-red-950"
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
                  <td colSpan={9} className="px-4 py-10 text-center text-zinc-400">
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