import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  archiveStartingInventoryItemAction,
  importStartingInventoryItemAction,
} from '@/app/actions/starting-inventory'

type StartingInventoryRow = {
  id: string
  status: string | null
  destination: string | null
  item_type: string | null
  title: string | null
  player_name: string | null
  year: number | null
  brand: string | null
  set_name: string | null
  card_number: string | null
  parallel_name: string | null
  quantity: number | null
  cost_basis_unit: number | null
  cost_basis_total: number | null
  estimated_value_total: number | null
  storage_location: string | null
  cost_basis_method: string | null
  imported_inventory_item_id: string | null
  created_at: string | null
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

function formatLabel(value: string | null | undefined) {
  return (value || '—').replaceAll('_', ' ')
}

function statusBadgeClass(status: string | null) {
  switch (status) {
    case 'draft':
      return 'border-amber-900 bg-amber-950/40 text-amber-200'
    case 'imported':
      return 'border-emerald-900 bg-emerald-950/40 text-emerald-200'
    case 'archived':
      return 'border-zinc-700 bg-zinc-800 text-zinc-300'
    default:
      return 'border-zinc-700 bg-zinc-800 text-zinc-300'
  }
}

function destinationBadgeClass(destination: string | null) {
  switch (destination) {
    case 'sell':
      return 'border-blue-900 bg-blue-950/40 text-blue-200'
    case 'personal':
      return 'border-fuchsia-900 bg-fuchsia-950/40 text-fuchsia-200'
    default:
      return 'border-zinc-700 bg-zinc-800 text-zinc-300'
  }
}

export default async function StartingInventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string
    status?: string
    error?: string
    created?: string
    updated?: string
    archived?: string
  }>
}) {
  const params = searchParams ? await searchParams : undefined
  const q = cleanSearchTerm(params?.q ?? '')
  const statusFilter = String(params?.status ?? '').trim()
  const errorMessage = params?.error
  const createdId = params?.created
  const updated = params?.updated
  const archived = params?.archived

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  let query = supabase
    .from('starting_inventory_items')
    .select(`
      id,
      status,
      destination,
      item_type,
      title,
      player_name,
      year,
      brand,
      set_name,
      card_number,
      parallel_name,
      quantity,
      cost_basis_unit,
      cost_basis_total,
      estimated_value_total,
      storage_location,
      cost_basis_method,
      imported_inventory_item_id,
      created_at
    `)
    .eq('user_id', user.id)

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  if (q) {
    query = query.or(
      [
        `title.ilike.%${q}%`,
        `player_name.ilike.%${q}%`,
        `brand.ilike.%${q}%`,
        `set_name.ilike.%${q}%`,
        `card_number.ilike.%${q}%`,
        `parallel_name.ilike.%${q}%`,
        `storage_location.ilike.%${q}%`,
      ].join(',')
    )
  }

  const response = await query.order('created_at', { ascending: false })

  const items: StartingInventoryRow[] = (response.data ?? []) as StartingInventoryRow[]
  const error = response.error

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Starting Inventory</h1>
          <p className="mt-2 text-zinc-400">
            Enter legacy inventory, assign cost basis, and import it into your main inventory.
          </p>
        </div>

        <Link
          href="/app/starting-inventory/new"
          className="inline-flex rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
        >
          Add Starting Inventory
        </Link>
      </div>

      {createdId ? (
        <div className="mt-6 rounded-xl border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          Starting inventory item created successfully.
        </div>
      ) : null}

      {updated ? (
        <div className="mt-6 rounded-xl border border-blue-900 bg-blue-950/30 px-4 py-3 text-sm text-blue-200">
          Starting inventory item updated successfully.
        </div>
      ) : null}

      {archived ? (
        <div className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-200">
          Starting inventory item archived.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <form method="get" className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search player, title, set, card #..."
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2"
          />

          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="imported">Imported</option>
            <option value="archived">Archived</option>
          </select>

          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
            >
              Search
            </button>

            {q || statusFilter ? (
              <Link
                href="/app/starting-inventory"
                className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Error loading starting inventory: {error.message}
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950 text-zinc-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Card</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Destination</th>
                <th className="px-4 py-3 text-left font-medium">Qty</th>
                <th className="px-4 py-3 text-left font-medium">Unit Cost</th>
                <th className="px-4 py-3 text-left font-medium">Total Cost</th>
                <th className="px-4 py-3 text-left font-medium">Est. Value</th>
                <th className="px-4 py-3 text-left font-medium">Method</th>
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
                ]
                  .filter(Boolean)
                  .join(' • ')

                const isImported = item.status === 'imported' && !!item.imported_inventory_item_id
                const isDraft = item.status === 'draft'
                const isArchived = item.status === 'archived'

                return (
                  <tr key={item.id} className="border-t border-zinc-800 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {item.title || item.player_name || 'Untitled item'}
                      </div>
                      <div className="text-zinc-400">{itemLine}</div>

                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
                        {item.item_type ? (
                          <span className="rounded-full border border-zinc-800 px-2 py-1">
                            {formatLabel(item.item_type)}
                          </span>
                        ) : null}

                        {item.storage_location ? (
                          <span className="rounded-full border border-zinc-800 px-2 py-1">
                            {item.storage_location}
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusBadgeClass(
                          item.status
                        )}`}
                      >
                        {formatLabel(item.status)}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${destinationBadgeClass(
                          item.destination
                        )}`}
                      >
                        {formatLabel(item.destination)}
                      </span>
                    </td>

                    <td className="px-4 py-3">{item.quantity ?? 0}</td>
                    <td className="px-4 py-3">{money(item.cost_basis_unit)}</td>
                    <td className="px-4 py-3">{money(item.cost_basis_total)}</td>
                    <td className="px-4 py-3">{money(item.estimated_value_total)}</td>
                    <td className="px-4 py-3 capitalize text-zinc-300">
                      {formatLabel(item.cost_basis_method)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        {isDraft ? (
                          <>
                            <Link
                              href={`/app/starting-inventory/${item.id}/edit`}
                              className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
                            >
                              Edit
                            </Link>

                            <form action={importStartingInventoryItemAction}>
                              <input
                                type="hidden"
                                name="starting_inventory_item_id"
                                value={item.id}
                              />
                              <button
                                type="submit"
                                className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
                              >
                                Import to Inventory
                              </button>
                            </form>

                            <form action={archiveStartingInventoryItemAction}>
                              <input
                                type="hidden"
                                name="starting_inventory_item_id"
                                value={item.id}
                              />
                              <button
                                type="submit"
                                className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
                              >
                                Archive
                              </button>
                            </form>
                          </>
                        ) : null}

                        {isImported ? (
                          <>
                            <div className="inline-flex rounded-lg border border-emerald-900 bg-emerald-950/30 px-3 py-1.5 text-xs font-medium text-emerald-200">
                              Imported
                            </div>

                            <Link
                              href={`/app/inventory/${item.imported_inventory_item_id}`}
                              className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
                            >
                              View Imported Item
                            </Link>

                            <form action={archiveStartingInventoryItemAction}>
                              <input
                                type="hidden"
                                name="starting_inventory_item_id"
                                value={item.id}
                              />
                              <button
                                type="submit"
                                className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
                              >
                                Archive
                              </button>
                            </form>
                          </>
                        ) : null}

                        {isArchived ? (
                          <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300">
                            Archived
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}

              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-zinc-400">
                    {q || statusFilter
                      ? 'No starting inventory items match your search.'
                      : 'No starting inventory items found.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}