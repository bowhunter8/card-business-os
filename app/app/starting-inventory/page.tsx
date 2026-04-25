import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  archiveStartingInventoryItemAction,
  importStartingInventoryItemAction,
} from '@/app/actions/starting-inventory'
import CancelDetailsButton from '../search/CancelDetailsButton'
import SelectAllCheckbox from '../search/SelectAllCheckbox'

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
const BULK_STARTING_INVENTORY_FORM_ID = 'bulk-archive-starting-inventory-form'

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

function getInventoryStatusFromDestination(destination: string | null) {
  if (destination === 'personal') return 'personal'
  if (destination === 'junk') return 'junk'
  return 'available'
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

function buildStartingInventoryStatusHref({
  q,
  status,
  page,
  limit,
  statusKey,
  statusValue,
}: {
  q?: string
  status?: string
  page: number
  limit: number
  statusKey: string
  statusValue: string
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
  params.set(statusKey, statusValue)

  return `/app/starting-inventory?${params.toString()}`
}

function readFormIds(formData: FormData, fieldName: string) {
  return formData
    .getAll(fieldName)
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
}

async function bulkImportStartingInventoryItemsAction(formData: FormData) {
  'use server'

  const itemIds = readFormIds(formData, 'selected_starting_inventory_ids')
  const q = cleanSearchTerm(String(formData.get('q') ?? ''))
  const status = String(formData.get('status') ?? '').trim()
  const pageValue = Number(String(formData.get('page') ?? '1'))
  const limitValue = Number(String(formData.get('limit') ?? String(DEFAULT_LIMIT)))

  const page = Number.isFinite(pageValue) && pageValue > 0 ? Math.floor(pageValue) : 1
  const limit: PageLimit = LIMIT_OPTIONS.includes(limitValue as PageLimit)
    ? (limitValue as PageLimit)
    : DEFAULT_LIMIT

  if (itemIds.length === 0) {
    redirect(
      buildStartingInventoryStatusHref({
        q,
        status,
        page,
        limit,
        statusKey: 'error',
        statusValue: 'Select at least one draft starting inventory item to import.',
      })
    )
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const rowsResponse = await supabase
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
      cost_basis_method
    `)
    .eq('user_id', user.id)
    .eq('status', 'draft')
    .in('id', itemIds)

  if (rowsResponse.error) {
    redirect(
      buildStartingInventoryStatusHref({
        q,
        status,
        page,
        limit,
        statusKey: 'error',
        statusValue: rowsResponse.error.message,
      })
    )
  }

  const draftRows = (rowsResponse.data ?? []) as StartingInventoryRow[]

  if (draftRows.length === 0) {
    redirect(
      buildStartingInventoryStatusHref({
        q,
        status,
        page,
        limit,
        statusKey: 'error',
        statusValue: 'No draft starting inventory items were available to import.',
      })
    )
  }

  let importedCount = 0

  for (const row of draftRows) {
    const quantity = Number(row.quantity ?? 1)
    const costBasisUnit = Number(row.cost_basis_unit ?? 0)
    const costBasisTotal = Number(row.cost_basis_total ?? costBasisUnit * quantity)
    const estimatedValueTotal = Number(row.estimated_value_total ?? 0)

    const insertResponse = await supabase
      .from('inventory_items')
      .insert({
        user_id: user.id,
        source_type: 'starting_inventory',
        source_reference: row.id,
        item_type: row.item_type || 'single_card',
        status: getInventoryStatusFromDestination(row.destination),
        quantity,
        available_quantity: quantity,
        title: row.title,
        player_name: row.player_name,
        year: row.year,
        brand: row.brand,
        set_name: row.set_name,
        card_number: row.card_number,
        parallel_name: row.parallel_name,
        cost_basis_unit: costBasisUnit,
        cost_basis_total: costBasisTotal,
        estimated_value_total: estimatedValueTotal,
        storage_location: row.storage_location,
        notes: row.cost_basis_method
          ? `Imported from starting inventory. Cost basis method: ${row.cost_basis_method}`
          : 'Imported from starting inventory.',
      })
      .select('id')
      .single()

    if (insertResponse.error) {
      redirect(
        buildStartingInventoryStatusHref({
          q,
          status,
          page,
          limit,
          statusKey: 'error',
          statusValue: insertResponse.error.message,
        })
      )
    }

    const importedInventoryItemId = String(insertResponse.data?.id ?? '')

    const updateResponse = await supabase
      .from('starting_inventory_items')
      .update({
        status: 'imported',
        imported_inventory_item_id: importedInventoryItemId || null,
      })
      .eq('user_id', user.id)
      .eq('id', row.id)

    if (updateResponse.error) {
      redirect(
        buildStartingInventoryStatusHref({
          q,
          status,
          page,
          limit,
          statusKey: 'error',
          statusValue: updateResponse.error.message,
        })
      )
    }

    importedCount += 1
  }

  revalidatePath('/app/starting-inventory')
  revalidatePath('/app/inventory')
  revalidatePath('/app/search')
  revalidatePath('/app/reports/tax')

  redirect(
    buildStartingInventoryStatusHref({
      q,
      status,
      page,
      limit,
      statusKey: 'imported',
      statusValue: `${importedCount}`,
    })
  )
}

async function bulkArchiveStartingInventoryItemsAction(formData: FormData) {
  'use server'

  const itemIds = readFormIds(formData, 'selected_starting_inventory_ids')
  const q = cleanSearchTerm(String(formData.get('q') ?? ''))
  const status = String(formData.get('status') ?? '').trim()
  const pageValue = Number(String(formData.get('page') ?? '1'))
  const limitValue = Number(String(formData.get('limit') ?? String(DEFAULT_LIMIT)))

  const page = Number.isFinite(pageValue) && pageValue > 0 ? Math.floor(pageValue) : 1
  const limit: PageLimit = LIMIT_OPTIONS.includes(limitValue as PageLimit)
    ? (limitValue as PageLimit)
    : DEFAULT_LIMIT

  if (itemIds.length === 0) {
    redirect(
      buildStartingInventoryStatusHref({
        q,
        status,
        page,
        limit,
        statusKey: 'error',
        statusValue: 'Select at least one draft starting inventory item to archive.',
      })
    )
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase
    .from('starting_inventory_items')
    .update({ status: 'archived' })
    .eq('user_id', user.id)
    .eq('status', 'draft')
    .in('id', itemIds)

  if (error) {
    redirect(
      buildStartingInventoryStatusHref({
        q,
        status,
        page,
        limit,
        statusKey: 'error',
        statusValue: error.message,
      })
    )
  }

  revalidatePath('/app/starting-inventory')
  revalidatePath('/app/inventory')
  revalidatePath('/app/search')

  redirect(
    buildStartingInventoryStatusHref({
      q,
      status,
      page,
      limit,
      statusKey: 'archived',
      statusValue: `${itemIds.length}`,
    })
  )
}

function BulkActionsControl({ formId }: { formId: string }) {
  return (
    <div className="mb-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-zinc-200">Bulk actions</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            Check draft starting inventory rows, then import or archive the selected rows.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <details className="group">
            <summary className="app-button cursor-pointer list-none whitespace-nowrap">
              Import Selected
            </summary>

            <div className="mt-2 rounded-xl border border-zinc-700 bg-zinc-950 p-3 shadow-xl md:min-w-72">
              <div className="text-sm font-semibold text-zinc-200">Confirm bulk import?</div>
              <div className="mt-1 text-xs leading-relaxed text-zinc-400">
                This will import the selected draft starting inventory items into your main inventory.
                Imported and already archived rows are not selectable.
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  form={formId}
                  formAction={bulkImportStartingInventoryItemsAction}
                  className="app-button-primary whitespace-nowrap"
                >
                  Yes, Import Selected
                </button>

                <CancelDetailsButton />
              </div>
            </div>
          </details>

          <details className="group">
            <summary className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/30 text-red-200 hover:bg-red-900/40">
              Archive Selected
            </summary>

            <div className="mt-2 rounded-xl border border-red-900/60 bg-zinc-950 p-3 shadow-xl md:min-w-72">
              <div className="text-sm font-semibold text-red-200">Confirm bulk archive?</div>
              <div className="mt-1 text-xs leading-relaxed text-zinc-400">
                This will archive the selected draft starting inventory items. Imported and already archived rows are not selectable.
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  form={formId}
                  formAction={bulkArchiveStartingInventoryItemsAction}
                  className="app-button whitespace-nowrap border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/50"
                >
                  Yes, Archive Selected
                </button>

                <CancelDetailsButton />
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  )
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
    imported?: string
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
  const imported = params?.imported

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
  const hasDraftRows = items.some((item) => item.status === 'draft')

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

      {imported && (
        <div className="app-alert-success">
          Imported {imported} starting inventory item(s) into main inventory.
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

      <form id={BULK_STARTING_INVENTORY_FORM_ID} action={bulkArchiveStartingInventoryItemsAction} className="hidden">
        <input type="hidden" name="q" value={q} />
        <input type="hidden" name="status" value={statusFilter} />
        <input type="hidden" name="page" value={page} />
        <input type="hidden" name="limit" value={limit} />
      </form>

      {items.length > 0 && hasDraftRows ? (
        <div className="mt-3">
          <BulkActionsControl formId={BULK_STARTING_INVENTORY_FORM_ID} />
        </div>
      ) : null}

      <div className="app-table-wrap">
        <div className="app-table-scroll">
          <table className="app-table">
            <thead className="app-thead">
              <tr>
                <th className="app-th w-16">
                  <SelectAllCheckbox
                    formId={BULK_STARTING_INVENTORY_FORM_ID}
                    fieldName="selected_starting_inventory_ids"
                    label="Select all draft starting inventory items"
                  />
                </th>
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

                const itemLabel = item.title || item.player_name || display || 'Untitled'

                return (
                  <tr key={item.id} className="app-tr">
                    <td className="app-td">
                      {isDraft ? (
                        <input
                          form={BULK_STARTING_INVENTORY_FORM_ID}
                          type="checkbox"
                          name="selected_starting_inventory_ids"
                          value={item.id}
                          aria-label={`Select ${itemLabel}`}
                          className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                        />
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </td>

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

                            <details className="group relative">
                              <summary className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/30 text-red-200 hover:bg-red-900/40">
                                Archive
                              </summary>

                              <div className="mt-2 min-w-64 rounded-xl border border-red-900/60 bg-zinc-950 p-3 shadow-xl">
                                <div className="text-sm font-semibold text-red-200">Confirm archive?</div>
                                <div className="mt-1 text-xs leading-relaxed text-zinc-400">
                                  This will archive this starting inventory item:{' '}
                                  <span className="text-zinc-200">{itemLabel}</span>
                                </div>

                                <form action={archiveStartingInventoryItemAction} className="mt-3 flex flex-wrap gap-2">
                                  <input type="hidden" name="starting_inventory_item_id" value={item.id} />

                                  <button
                                    type="submit"
                                    className="app-button whitespace-nowrap border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/50"
                                  >
                                    Yes, Archive
                                  </button>

                                  <CancelDetailsButton />
                                </form>
                              </div>
                            </details>
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
                  <td colSpan={10} className="px-4 py-10 text-center text-zinc-400">
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