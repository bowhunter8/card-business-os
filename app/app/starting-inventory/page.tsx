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

type PageLimit = 10 | 25 | 50

const DEFAULT_LIMIT: PageLimit = 25
const LIMIT_OPTIONS: PageLimit[] = [10, 25, 50]

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

function buildStartingInventoryHref({
  q,
  status,
  page,
  limit,
}: {
  q?: string
  status?: string
  page: number
  limit: number
}) {
  const params = new URLSearchParams()

  if (q) {
    params.set('q', q)
  }

  if (status) {
    params.set('status', status)
  }

  params.set('page', String(page))
  params.set('limit', String(limit))

  return `/app/starting-inventory?${params.toString()}`
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
    page?: string
    limit?: string
  }>
}) {
  const params = searchParams ? await searchParams : undefined
  const q = cleanSearchTerm(params?.q ?? '')
  const statusFilter = String(params?.status ?? '').trim()
  const errorMessage = params?.error
  const createdId = params?.created
  const updated = params?.updated
  const archived = params?.archived

  const requestedPage = Number(String(params?.page ?? '1'))
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1

  const requestedLimit = Number(String(params?.limit ?? String(DEFAULT_LIMIT)))
  const limit: PageLimit = LIMIT_OPTIONS.includes(requestedLimit as PageLimit)
    ? (requestedLimit as PageLimit)
    : DEFAULT_LIMIT

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

  const from = (page - 1) * limit
  const to = from + limit - 1

  const response = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  const items: StartingInventoryRow[] = (response.data ?? []) as StartingInventoryRow[]
  const error = response.error

  const hasPreviousPage = page > 1
  const hasNextPage = items.length === limit

  return (
    <div className="app-page-wide">
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

      <form method="get" className="app-search-panel">
        <input type="hidden" name="page" value="1" />
        <input type="hidden" name="limit" value={String(limit)} />

        <div className="grid gap-2 md:grid-cols-[1fr_160px_auto]">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search player, title, set, item / card #..."
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
              <Link
                href={buildStartingInventoryHref({
                  page: 1,
                  limit,
                })}
                className="app-button"
              >
                Clear
              </Link>
            )}
          </div>
        </div>
      </form>

      <div className="app-section p-4 mt-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-zinc-500">
            Page {page}
          </div>

          <div className="flex flex-wrap gap-2">
            {LIMIT_OPTIONS.map((option) => (
              <Link
                key={option}
                href={buildStartingInventoryHref({
                  q,
                  status: statusFilter,
                  page: 1,
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

      {error && (
        <div className="app-alert-error">
          Error loading starting inventory: {error.message}
        </div>
      )}

      <div className="app-table-wrap">
        <div className="app-table-scroll">
          <table className="app-table">
            <thead className="app-thead">
              <tr>
                <th className="app-th">Item</th>
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

      <div className="app-section p-4 mt-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-zinc-300">
            Showing page {page} with up to {limit} rows.
          </div>

          <div className="flex gap-2">
            {hasPreviousPage ? (
              <Link
                href={buildStartingInventoryHref({
                  q,
                  status: statusFilter,
                  page: page - 1,
                  limit,
                })}
                className="app-button"
              >
                Previous
              </Link>
            ) : (
              <span className="app-button opacity-50 pointer-events-none">Previous</span>
            )}

            {hasNextPage ? (
              <Link
                href={buildStartingInventoryHref({
                  q,
                  status: statusFilter,
                  page: page + 1,
                  limit,
                })}
                className="app-button-primary"
              >
                Next
              </Link>
            ) : (
              <span className="app-button-primary opacity-50 pointer-events-none">Next</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}