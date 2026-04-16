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
    .select('*')
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
    <div className="app-page-wide">
      {/* HEADER */}
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Starting Inventory</h1>
          <p className="app-subtitle">
            Enter legacy inventory, assign cost basis, and import it into your main inventory.
          </p>
        </div>

        <Link
          href="/app/starting-inventory/new"
          className="app-button-primary"
        >
          Add Starting Inventory
        </Link>
      </div>

      {/* ALERTS */}
      {createdId && (
        <div className="app-alert-success">
          Starting inventory item created successfully.
        </div>
      )}

      {updated && (
        <div className="app-alert-info">
          Starting inventory item updated successfully.
        </div>
      )}

      {archived && (
        <div className="app-alert-info">
          Starting inventory item archived.
        </div>
      )}

      {errorMessage && (
        <div className="app-alert-error">{errorMessage}</div>
      )}

      {/* SEARCH */}
      <form method="get" className="app-search-panel">
        <div className="grid gap-2 md:grid-cols-[1fr_160px_auto]">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search player, title, set, card #..."
            className="app-input"
          />

          <select
            name="status"
            defaultValue={statusFilter}
            className="app-select"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="imported">Imported</option>
            <option value="archived">Archived</option>
          </select>

          <div className="flex gap-2">
            <button type="submit" className="app-button-primary">
              Search
            </button>

            {(q || statusFilter) && (
              <Link href="/app/starting-inventory" className="app-button">
                Clear
              </Link>
            )}
          </div>
        </div>
      </form>

      {error && (
        <div className="app-alert-error">
          Error loading starting inventory: {error.message}
        </div>
      )}

      {/* TABLE */}
      <div className="app-table-wrap">
        <div className="app-table-scroll">
          <table className="app-table">
            <thead className="app-thead">
              <tr>
                <th className="app-th">Card</th>
                <th className="app-th">Status</th>
                <th className="app-th">Destination</th>
                <th className="app-th">Qty</th>
                <th className="app-th">Unit Cost</th>
                <th className="app-th">Total Cost</th>
                <th className="app-th">Est. Value</th>
                <th className="app-th">Method</th>
                <th className="app-th">Actions</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => {
                const isDraft = item.status === 'draft'
                const isImported = item.status === 'imported'
                const isArchived = item.status === 'archived'

                const display = [
                  item.year,
                  item.set_name,
                  item.player_name,
                  item.card_number ? `#${item.card_number}` : null,
                  item.parallel_name,
                ]
                  .filter(Boolean)
                  .join(' • ')

                return (
                  <tr key={item.id} className="app-tr">
                    <td className="app-td">
                      <div className="font-medium">
                        {item.title || item.player_name || 'Untitled'}
                      </div>
                      <div className="text-zinc-400">{display}</div>
                    </td>

                    <td className="app-td capitalize">
                      {formatLabel(item.status)}
                    </td>

                    <td className="app-td capitalize">
                      {formatLabel(item.destination)}
                    </td>

                    <td className="app-td">{item.quantity ?? 0}</td>
                    <td className="app-td">{money(item.cost_basis_unit)}</td>
                    <td className="app-td">{money(item.cost_basis_total)}</td>
                    <td className="app-td">{money(item.estimated_value_total)}</td>
                    <td className="app-td capitalize">
                      {formatLabel(item.cost_basis_method)}
                    </td>

                    <td className="app-td">
                      <div className="flex flex-wrap gap-1.5">
                        {isDraft && (
                          <>
                            <Link
                              href={`/app/starting-inventory/${item.id}/edit`}
                              className="app-button"
                            >
                              Edit
                            </Link>

                            <form action={importStartingInventoryItemAction}>
                              <input type="hidden" name="starting_inventory_item_id" value={item.id} />
                              <button type="submit" className="app-button">
                                Import
                              </button>
                            </form>

                            <form action={archiveStartingInventoryItemAction}>
                              <input type="hidden" name="starting_inventory_item_id" value={item.id} />
                              <button type="submit" className="app-button">
                                Archive
                              </button>
                            </form>
                          </>
                        )}

                        {isImported && item.imported_inventory_item_id && (
                          <>
                            <span className="app-badge app-badge-success">Imported</span>

                            <Link
                              href={`/app/inventory/${item.imported_inventory_item_id}`}
                              className="app-button"
                            >
                              View
                            </Link>
                          </>
                        )}

                        {isArchived && (
                          <span className="app-badge app-badge-neutral">
                            Archived
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}

              {items.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-zinc-400">
                    No items found.
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