import Link from 'next/link'
import Script from 'next/script'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { reverseSaleAction } from '@/app/actions/sale-safety'
import DeleteInventoryItemButton from './DeleteInventoryItemButton'
import CancelDetailsButton from '../search/CancelDetailsButton'

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


type InventoryStatusSummary = {
  quantity: number
  cost: number
  value: number
}

type InventoryStatusFilter = 'available' | 'listed' | 'junk' | 'disposed' | 'sold' | 'personal' | 'giveaway'

type SaleRow = {
  id: string
  inventory_item_id: string
  sale_date: string | null
  quantity_sold: number | null
  reversed_at: string | null
}

type FinalizedDisposalTransactionRow = {
  inventory_item_id: string | null
  created_at: string | null
  disposal_reason: string | null
  disposal_notes: string | null
  notes: string | null
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
type BulkStatus = 'available' | 'listed' | 'personal' | 'junk' | 'disposed'

const DEFAULT_LIMIT = 5
const LIMIT_OPTIONS = [5, 10, 50, 100] as const
const ROW_LIMIT_OPTIONS = [10, 50, 100] as const
const BULK_INVENTORY_FORM_ID = 'bulk-delete-inventory-page-form'
const BULK_DELETE_FORM_ID = 'bulk-delete-inventory-direct-form'
const BULK_STATUS_FORM_ID = 'bulk-status-inventory-direct-form'
const BULK_FINALIZE_FORM_ID = 'bulk-finalize-inventory-direct-form'
const BULK_SELECTION_COUNT_ID = 'bulk-inventory-selected-count'
const BULK_SCROLL_RESTORE_ID = 'bulk-inventory-scroll-restore'
const BULK_PENDING_STATE_ID = 'bulk-inventory-pending-state'

const STATUS_LABELS: Record<InventoryStatusFilter, string> = {
  available: 'Available',
  listed: 'Listed',
  junk: 'Junk',
  disposed: 'Disposed',
  sold: 'Sold',
  personal: 'Personal',
  giveaway: 'Giveaway',
}

const STATUS_FILTERS: InventoryStatusFilter[] = [
  'available',
  'listed',
  'junk',
  'disposed',
  'sold',
  'personal',
  'giveaway',
]

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

  if (status === 'disposed') {
    return <span className="app-badge app-badge-danger">Disposed</span>
  }

  if (status === 'listed') {
    return <span className="app-badge app-badge-info">Listed</span>
  }

  if (status === 'sold') {
    return <span className="app-badge app-badge-warning">Sold</span>
  }

  if (status === 'giveaway') {
    return <span className="app-badge app-badge-warning">Giveaway</span>
  }

  return (
    <span className="text-xs capitalize text-zinc-400">
      {(status || '—').replaceAll('_', ' ')}
    </span>
  )
}

function remainingCostBasis(item: Pick<InventoryRow, 'available_quantity' | 'quantity' | 'cost_basis_unit' | 'cost_basis_total'>) {
  const availableQty = Number(item.available_quantity ?? 0)
  const quantity = Number(item.quantity ?? 0)
  const unitCost = Number(item.cost_basis_unit ?? 0)
  const totalCost = Number(item.cost_basis_total ?? 0)

  if (availableQty > 0 && unitCost > 0) {
    return availableQty * unitCost
  }

  if (availableQty > 0 && quantity > 0 && totalCost > 0) {
    return (totalCost / quantity) * availableQty
  }

  return totalCost
}

function inventoryTaxSafetyNote(status: InventoryStatusFilter | null) {
  if (status === 'personal') {
    return 'Personal items are removed from active sale inventory. Keep the cost basis as a withdrawal record and do not also deduct the same item as an expense.'
  }

  if (status === 'giveaway') {
    return 'Giveaway items should have business intent and either come from inventory or be recorded as an expense, never both.'
  }

  if (status === 'junk') {
    return 'Junk keeps the item visible for recordkeeping. Do not deduct it as a loss, donation, or disposal until a final documented disposition exists. Use Disposed only when the item actually leaves the business.'
  }

  if (status === 'disposed') {
    return 'Disposed means the item physically left business inventory with no sale proceeds. Keep notes and date records so the disposal is documented and the same item is not also deducted somewhere else.'
  }

  return null
}


function bulkStatusLabel(status: BulkStatus) {
  if (status === 'available') return 'For Sale'
  if (status === 'listed') return 'Listed'
  if (status === 'personal') return 'Personal'
  if (status === 'junk') return 'Junk'
  if (status === 'disposed') return 'Disposed'
  return status
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

function buildInventoryStatusHref({
  q,
  sort,
  dir,
  page,
  limit,
  statusKey,
  statusValue,
  scrollY,
}: {
  q?: string
  sort: SortKey
  dir: SortDir
  page: number
  limit: number
  statusKey: string
  statusValue: string
  scrollY?: string
}) {
  const params = new URLSearchParams()

  if (q) {
    params.set('q', q)
  }

  params.set('sort', sort)
  params.set('dir', dir)
  params.set('page', String(page))
  params.set('limit', String(limit))
  params.set(statusKey, statusValue)

  if (scrollY) {
    params.set('scroll_y', scrollY)
  }

  return `/app/inventory?${params.toString()}#inventory-status`
}

function readFormIds(formData: FormData, fieldName: string) {
  return Array.from(
    new Set(
      formData
        .getAll(fieldName)
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    )
  )
}

function readInventoryListFormState(formData: FormData) {
  const q = String(formData.get('q') ?? '').trim()
  const sort = String(formData.get('sort') ?? 'created_at').trim() as SortKey
  const dir = String(formData.get('dir') ?? 'desc').trim() as SortDir
  const page = Number(String(formData.get('page') ?? '1'))
  const limit = Number(String(formData.get('limit') ?? String(DEFAULT_LIMIT)))
  const scrollY = String(formData.get('scroll_y') ?? '').trim()

  const safeSort: SortKey = [
    'created_at',
    'card',
    'status',
    'quantity',
    'available_quantity',
    'cost_basis_unit',
    'cost_basis_total',
    'estimated_value_total',
    'storage_location',
  ].includes(sort)
    ? sort
    : 'created_at'

  const safeDir: SortDir = dir === 'asc' ? 'asc' : 'desc'
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const safeLimit = LIMIT_OPTIONS.includes(limit as (typeof LIMIT_OPTIONS)[number])
    ? limit
    : DEFAULT_LIMIT

  return {
    q,
    safeSort,
    safeDir,
    safePage,
    safeLimit,
    scrollY,
  }
}

async function bulkDeleteInventoryItemsAction(formData: FormData) {
  'use server'

  const itemIds = readFormIds(formData, 'selected_inventory_ids')
  const disposalReason = String(formData.get('disposal_reason') ?? '').trim()
  const disposalNotes = String(formData.get('disposal_notes') ?? '').trim()
  const { q, safeSort, safeDir, safePage, safeLimit, scrollY } = readInventoryListFormState(formData)

  if (itemIds.length === 0) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'delete_error',
        statusValue: 'Select at least one inventory item to delete.',
        scrollY,
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

  const { data: activeSalesForSelectedItems, error: activeSalesCheckError } =
    await supabase
      .from('sales')
      .select('id, inventory_item_id')
      .eq('user_id', user.id)
      .is('reversed_at', null)
      .in('inventory_item_id', itemIds)

  if (activeSalesCheckError) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'delete_error',
        statusValue: activeSalesCheckError.message,
        scrollY,
      })
    )
  }

  if ((activeSalesForSelectedItems ?? []).length > 0) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'delete_error',
        statusValue:
          'One or more selected inventory items have active sales. Reverse the sale first so COGS and inventory stay audit-safe.',
        scrollY,
      })
    )
  }

  const deletedAt = new Date().toISOString()

  const { data: itemsBeforeDelete, error: itemsBeforeDeleteError } = await supabase
    .from('inventory_items')
    .select('id, title, quantity, available_quantity, cost_basis_total')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', itemIds)

  if (itemsBeforeDeleteError) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'delete_error',
        statusValue: itemsBeforeDeleteError.message,
        scrollY,
      })
    )
  }

  const deleteTargetIds = (itemsBeforeDelete ?? []).map((item) => item.id)

  if (deleteTargetIds.length === 0) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'delete_error',
        statusValue: 'No matching active inventory items were found to delete. Refresh the page and select the rows again.',
        scrollY,
      })
    )
  }

  const { error } = await supabase
    .from('inventory_items')
    .update({ deleted_at: deletedAt })
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', deleteTargetIds)

  if (error) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'delete_error',
        statusValue: error.message,
        scrollY,
      })
    )
  }

  const deletionTransactionRows = (itemsBeforeDelete ?? []).map((item) => ({
    user_id: user.id,
    inventory_item_id: item.id,
    transaction_type: 'soft_delete',
    quantity: Number(item.available_quantity ?? item.quantity ?? 0),
    notes: `Inventory item soft deleted from inventory list as an administrative correction. Cost basis at deletion time: ${money(Number(item.cost_basis_total ?? 0))}. Do not use delete for personal withdrawals, giveaways, junk, donations, or sold items.`,
    created_at: deletedAt,
  }))

  if (deletionTransactionRows.length > 0) {
    await supabase.from('inventory_transactions').insert(deletionTransactionRows)
  }

  revalidatePath('/app/inventory')
  revalidatePath('/app/search')
  revalidatePath('/app/breaks')
  revalidatePath('/app/reports/tax')

  redirect(
    buildInventoryStatusHref({
      q,
      sort: safeSort,
      dir: safeDir,
      page: safePage,
      limit: safeLimit,
      statusKey: 'deleted_count',
      statusValue: `${deleteTargetIds.length} inventory item(s)`,
      scrollY,
    })
  )
}

async function bulkUpdateInventoryStatusAction(formData: FormData) {
  'use server'

  const itemIds = readFormIds(formData, 'selected_inventory_ids')
  const requestedStatus = String(formData.get('bulk_status') ?? '').trim() as BulkStatus
  const { q, safeSort, safeDir, safePage, safeLimit, scrollY } = readInventoryListFormState(formData)

  const allowedStatuses: BulkStatus[] = ['available', 'listed', 'personal', 'junk', 'disposed']

  if (!allowedStatuses.includes(requestedStatus)) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: 'Choose a valid bulk status.',
        scrollY,
      })
    )
  }

  if (itemIds.length === 0) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: `Select at least one inventory item to mark ${bulkStatusLabel(requestedStatus)}.`,
        scrollY,
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

  const { data: existingItems } = await supabase
    .from('inventory_items')
    .select('id, title, status, quantity, available_quantity, cost_basis_total')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', itemIds)

  const { error } = await supabase
    .from('inventory_items')
    .update({ status: requestedStatus })
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', itemIds)

  if (error) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: error.message,
        scrollY,
      })
    )
  }

  const inventoryTransactionRows = (existingItems ?? [])
    .filter((item) => item.status !== requestedStatus)
    .map((item) => {
      const previousStatus = String(item.status || 'unassigned').replaceAll('_', ' ')
      const nextStatus = bulkStatusLabel(requestedStatus)
      const itemTitle = item.title || 'Inventory item'

      return {
        user_id: user.id,
        inventory_item_id: item.id,
        transaction_type: 'status_change',
        quantity: Number(item.available_quantity ?? item.quantity ?? 0),
        notes:
          requestedStatus === 'personal'
            ? `Bulk personal withdrawal: ${itemTitle} changed from ${previousStatus} to Personal. Cost basis preserved as inventory withdrawn for personal collection; do not also deduct this item as an expense.`
            : requestedStatus === 'junk'
              ? `Bulk junk cleanup: ${itemTitle} changed from ${previousStatus} to Junk. Cost basis preserved for future donation, disposal, or write-off review; no automatic deduction was taken.`
              : requestedStatus === 'disposed'
                ? `Bulk disposal: ${itemTitle} changed from ${previousStatus} to Disposed. Item was removed from business inventory with no sale proceeds. Cost basis preserved in the transaction record for tax review; do not also deduct this item as another expense.`
                : `Bulk status update: ${itemTitle} changed from ${previousStatus} to ${nextStatus}. Cost basis preserved.`,
        created_at: new Date().toISOString(),
      }
    })

  if (inventoryTransactionRows.length > 0) {
    await supabase.from('inventory_transactions').insert(inventoryTransactionRows)
  }

  revalidatePath('/app/inventory')
  revalidatePath('/app/search')
  revalidatePath('/app/breaks')
  revalidatePath('/app/reports/tax')

  redirect(
    buildInventoryStatusHref({
      q,
      sort: safeSort,
      dir: safeDir,
      page: safePage,
      limit: safeLimit,
      statusKey: 'status_updated',
      statusValue: `${itemIds.length} item(s) marked ${bulkStatusLabel(requestedStatus)}`,
      scrollY,
    })
  )
}

async function bulkFinalizeDisposalWriteOffAction(formData: FormData) {
  'use server'

  const itemIds = readFormIds(formData, 'selected_inventory_ids')
  const disposalReason = String(formData.get('disposal_reason') ?? '').trim()
  const disposalNotes = String(formData.get('disposal_notes') ?? '').trim()
  const { q, safeSort, safeDir, safePage, safeLimit, scrollY } = readInventoryListFormState(formData)

  if (itemIds.length === 0) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: 'Select at least one disposed inventory item to finalize.',
        scrollY,
      })
    )
  }

  if (!disposalReason) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: 'Choose a disposal reason before finalizing disposal write-off review.',
        scrollY,
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

  const { data: existingItems, error: existingItemsError } = await supabase
    .from('inventory_items')
    .select('id, title, status, quantity, available_quantity, cost_basis_total')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', itemIds)

  if (existingItemsError) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: existingItemsError.message,
        scrollY,
      })
    )
  }

  const items = existingItems ?? []
  const nonDisposedCount = items.filter((item) => item.status !== 'disposed').length

  if (items.length > 0) {
    const { data: alreadyFinalizedRows, error: alreadyFinalizedError } = await supabase
      .from('inventory_transactions')
      .select('inventory_item_id')
      .eq('user_id', user.id)
      .eq('transaction_type', 'disposal_writeoff_review')
      .eq('finalized_for_tax', true)
      .in('inventory_item_id', itemIds)

    if (alreadyFinalizedError) {
      redirect(
        buildInventoryStatusHref({
          q,
          sort: safeSort,
          dir: safeDir,
          page: safePage,
          limit: safeLimit,
          statusKey: 'status_error',
          statusValue: alreadyFinalizedError.message,
          scrollY,
        })
      )
    }

    if ((alreadyFinalizedRows ?? []).length > 0) {
      redirect(
        buildInventoryStatusHref({
          q,
          sort: safeSort,
          dir: safeDir,
          page: safePage,
          limit: safeLimit,
          statusKey: 'status_error',
          statusValue: 'One or more selected disposed items are already finalized for write-off review.',
          scrollY,
        })
      )
    }
  }

  if (items.length === 0 || nonDisposedCount > 0) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: 'Only items already marked Disposed can be finalized for disposal write-off review.',
        scrollY,
      })
    )
  }

  const finalizedAt = new Date().toISOString()

  const inventoryTransactionRows = items.map((item) => {
    const itemTitle = item.title || 'Inventory item'
    const quantityForNotes = Number(item.available_quantity ?? item.quantity ?? 0)
    const costBasis = Number(item.cost_basis_total ?? 0)

    const trimmedNotes = disposalNotes || 'No extra notes entered.'

    return {
      user_id: user.id,
      inventory_item_id: item.id,
      transaction_type: 'disposal_writeoff_review',
      quantity_change: 0,
      disposal_reason: disposalReason,
      disposal_notes: disposalNotes || null,
      finalized_for_tax: true,
      notes: `Finalized disposal write-off review: ${itemTitle} was already marked Disposed and is now flagged for year-end/accountant review. Disposal reason: ${disposalReason}. User notes: ${trimmedNotes}. Quantity at finalization: ${quantityForNotes}. Recorded cost basis at finalization: ${money(costBasis)}. Do not also deduct this item as an expense, giveaway, donation, or separate loss without accountant review.`,
      created_at: finalizedAt,
    }
  })

  if (inventoryTransactionRows.length > 0) {
    const { error: transactionError } = await supabase
      .from('inventory_transactions')
      .insert(inventoryTransactionRows)

    if (transactionError) {
      redirect(
        buildInventoryStatusHref({
          q,
          sort: safeSort,
          dir: safeDir,
          page: safePage,
          limit: safeLimit,
          statusKey: 'status_error',
          statusValue: transactionError.message,
          scrollY,
        })
      )
    }
  }

  revalidatePath('/app/inventory')
  revalidatePath('/app/search')
  revalidatePath('/app/reports/tax')

  redirect(
    buildInventoryStatusHref({
      q,
      sort: safeSort,
      dir: safeDir,
      page: safePage,
      limit: safeLimit,
      statusKey: 'status_updated',
      statusValue: `${items.length} disposed item(s) finalized for write-off review`,
      scrollY,
    })
  )
}

function getFilterHref(
  filter: '' | InventoryStatusFilter,
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


function StatusSummaryCard({
  label,
  href,
  summary,
  active,
  status,
}: {
  label: string
  href: string
  summary: InventoryStatusSummary
  active: boolean
  status: InventoryStatusFilter
}) {
  const toneClass =
    status === 'available'
      ? 'hover:border-emerald-800/70 hover:bg-emerald-950/20'
      : status === 'listed'
        ? 'hover:border-sky-800/70 hover:bg-sky-950/20'
        : status === 'junk'
          ? 'hover:border-zinc-600 hover:bg-zinc-800/70'
          : status === 'disposed'
            ? 'hover:border-red-800/70 hover:bg-red-950/20'
          : status === 'sold'
            ? 'hover:border-amber-800/70 hover:bg-amber-950/20'
            : status === 'giveaway'
              ? 'hover:border-purple-800/70 hover:bg-purple-950/20'
              : 'hover:border-blue-800/70 hover:bg-blue-950/20'

  const activeClass =
    status === 'available'
      ? 'border-emerald-800 bg-emerald-950/20'
      : status === 'listed'
        ? 'border-sky-800 bg-sky-950/20'
        : status === 'junk'
          ? 'border-zinc-600 bg-zinc-800/60'
          : status === 'disposed'
            ? 'border-red-800 bg-red-950/20'
          : status === 'sold'
            ? 'border-amber-800 bg-amber-950/20'
            : status === 'giveaway'
              ? 'border-purple-800 bg-purple-950/20'
              : 'border-blue-800 bg-blue-950/20'

  return (
    <Link
      href={href}
      className={`app-card-tight block p-2.5 text-center transition ${active ? activeClass : toneClass}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{label}</div>
      <div className="mt-0.5 text-lg font-bold leading-none text-zinc-100">{summary.quantity}</div>
      <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] leading-tight text-zinc-500">
        <div>
          <div className="uppercase tracking-wide">Cost</div>
          <div className="font-semibold text-zinc-200">{money(summary.cost)}</div>
        </div>
        <div>
          <div className="uppercase tracking-wide">Value</div>
          <div className="font-semibold text-zinc-200">{money(summary.value)}</div>
        </div>
      </div>
    </Link>
  )
}

function BulkStatusConfirmControl({
  formId,
  status,
  label,
  helpText,
}: {
  formId: string
  status: BulkStatus
  label: string
  helpText: string
}) {
  return (
    <details className="group">
      <summary
        data-bulk-action-toggle="true"
        className="app-button cursor-pointer list-none whitespace-nowrap"
      >
        {label}
      </summary>

      <div className="mt-2 rounded-xl border border-zinc-700 bg-zinc-950 p-3 shadow-xl md:min-w-72">
        <div className="text-sm font-semibold text-zinc-200">Confirm status update?</div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">{helpText}</div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            form={formId}
            formAction={bulkUpdateInventoryStatusAction}
            data-bulk-submit="true"
            data-bulk-status={status}
            data-bulk-label={label}
            className="app-button-primary whitespace-nowrap"
          >
            Yes, {label}
          </button>

          <CancelDetailsButton />
        </div>
      </div>
    </details>
  )
}

function BulkDeleteConfirmControl({ formId }: { formId: string }) {
  return (
    <details className="group">
      <summary
        data-bulk-action-toggle="true"
        className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/50"
      >
        Delete Selected
      </summary>

      <div className="mt-2 rounded-xl border border-red-900/70 bg-zinc-950 p-3 shadow-xl md:min-w-80">
        <div className="text-sm font-semibold text-red-200">Confirm bulk delete?</div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">
          This will hide the selected inventory rows from normal inventory. Use this only for correction cleanup, not for sales, personal withdrawals, giveaways, junk, donations, or disposal write-offs.
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            form={BULK_DELETE_FORM_ID}
            formAction={bulkDeleteInventoryItemsAction}
            data-bulk-native-delete-submit="true"
            className="app-button whitespace-nowrap border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/50"
          >
            Yes, Delete Selected
          </button>

          <CancelDetailsButton />
        </div>
      </div>
    </details>
  )
}

function BulkFinalizeDisposalConfirmControl({ formId }: { formId: string }) {
  return (
    <details className="group">
      <summary
        className="app-button cursor-pointer list-none whitespace-nowrap border-amber-800/80 bg-amber-950/40 text-amber-100 hover:bg-amber-900/50"
      >
        Finalize Disposal Write-Off
      </summary>

      <div className="mt-2 rounded-xl border border-amber-900/60 bg-zinc-950 p-3 shadow-xl md:min-w-80">
        <div className="text-sm font-semibold text-amber-200">Finalize disposal write-off review?</div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">
          Use this only after items are already marked Disposed and physically removed from business inventory. This creates an audit note for year-end/accountant review without double-counting the item as a separate expense.
        </div>

        <div className="mt-3 grid gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">Disposal reason required</span>
            <select
              form={formId}
              name="disposal_reason"
              required
              defaultValue=""
              className="app-select w-full"
            >
              <option value="" disabled>
                Choose reason...
              </option>
              <option value="trash">Trash / discarded worthless inventory</option>
              <option value="recycled">Recycled bulk paper/base cards</option>
              <option value="damaged">Damaged inventory discarded</option>
              <option value="donation">Donation review</option>
              <option value="inventory_cleanup">Inventory cleanup / no resale value</option>
              <option value="lost">Lost / missing inventory review</option>
              <option value="other">Other documented disposal</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">Notes / remarks</span>
            <textarea
              form={formId}
              name="disposal_notes"
              className="app-input min-h-20"
              placeholder="Example: Thrown away worthless base cards after sorting 2025 Bowman break."
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            form={formId}
            formAction={bulkFinalizeDisposalWriteOffAction}
            data-bulk-finalize-submit="true"
            className="app-button whitespace-nowrap border-amber-800/80 bg-amber-950/50 text-amber-100 hover:bg-amber-900/60"
          >
            Yes, Finalize Review
          </button>

          <CancelDetailsButton />
        </div>
      </div>
    </details>
  )
}


function BulkActionsPanel({
  formId,
  statusFormId,
  finalizeFormId,
  pageItemCount,
  q,
  sortKey,
  sortDir,
  limit,
}: {
  formId: string
  statusFormId: string
  finalizeFormId: string
  pageItemCount: number
  q: string
  sortKey: SortKey
  sortDir: SortDir
  limit: number
}) {
  return (
    <div className="sticky top-[4.75rem] z-40 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-2.5 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-200">Bulk actions</div>
            <div className="mt-0.5 text-xs text-zinc-500">
              Check inventory rows, then update their status or delete the selected rows. Finalized disposal rows are locked for tax review.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={getFilterHref('', sortKey, sortDir, limit)}
              className={`app-chip ${q === '' ? 'app-chip-active' : 'app-chip-idle'}`}
            >
              All
            </Link>
            <Link
              href={getFilterHref('available', sortKey, sortDir, limit)}
              className={`app-chip ${q === 'available' ? 'app-chip-active' : 'app-chip-idle'}`}
            >
              Available
            </Link>
            <Link
              href={getFilterHref('listed', sortKey, sortDir, limit)}
              className={`app-chip ${q === 'listed' ? 'app-chip-active' : 'app-chip-idle'}`}
            >
              Listed
            </Link>
            <Link
              href={getFilterHref('sold', sortKey, sortDir, limit)}
              className={`app-chip ${q === 'sold' ? 'app-chip-active' : 'app-chip-idle'}`}
            >
              Sold
            </Link>
            <Link
              href={getFilterHref('personal', sortKey, sortDir, limit)}
              className={`app-chip ${q === 'personal' ? 'app-chip-active' : 'app-chip-idle'}`}
            >
              Personal
            </Link>
            <Link
              href={getFilterHref('junk', sortKey, sortDir, limit)}
              className={`app-chip ${q === 'junk' ? 'app-chip-active' : 'app-chip-idle'}`}
            >
              Junk
            </Link>
            <Link
              href={getFilterHref('disposed', sortKey, sortDir, limit)}
              className={`app-chip ${q === 'disposed' ? 'app-chip-active' : 'app-chip-idle'}`}
            >
              Disposed
            </Link>
          </div>
        </div>

        <div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <div
              id={BULK_SELECTION_COUNT_ID}
              data-bulk-selected-count="true"
              data-bulk-page-count={pageItemCount}
              className="inline-flex w-fit rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-400"
            >
              0 of {pageItemCount} selected
            </div>
            <button
              type="button"
              data-bulk-select-page="true"
              className="app-button whitespace-nowrap px-2.5 py-1 text-xs"
            >
              Select all on page
            </button>
            <button
              type="button"
              data-bulk-clear-selection="true"
              className="app-button whitespace-nowrap px-2.5 py-1 text-xs"
            >
              Clear selection
            </button>
            <div
              id={BULK_PENDING_STATE_ID}
              data-bulk-pending-state="true"
              className="hidden w-fit rounded-full border border-sky-900/60 bg-sky-950/30 px-2.5 py-1 text-xs font-medium text-sky-200"
              aria-live="polite"
            >
              Updating selected items…
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <BulkStatusConfirmControl
              formId={statusFormId}
              status="available"
              label="Mark For Sale"
              helpText="This will mark the selected inventory items as For Sale / Available."
            />
            <BulkStatusConfirmControl
              formId={statusFormId}
              status="listed"
              label="Mark Listed"
              helpText="This will mark the selected inventory items as Listed."
            />
            <BulkStatusConfirmControl
              formId={statusFormId}
              status="personal"
              label="Move to Personal"
              helpText="This will move the selected inventory items to Personal Collection status. Cost basis is preserved as a personal withdrawal record; do not also deduct these items as expenses."
            />
            <BulkStatusConfirmControl
              formId={statusFormId}
              status="junk"
              label="Mark Junk"
              helpText="This will mark the selected inventory items as Junk and add a status-change transaction note. This preserves cost basis for future donation, disposal, or write-off review without taking an automatic deduction."
            />
            <BulkStatusConfirmControl
              formId={statusFormId}
              status="disposed"
              label="Dispose Selected"
              helpText="This will mark the selected inventory items as Disposed because they physically left the business with no sale proceeds. Cost basis is preserved in the transaction log for tax review."
            />
            <BulkFinalizeDisposalConfirmControl formId={finalizeFormId} />
            <BulkDeleteConfirmControl formId={formId} />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {ROW_LIMIT_OPTIONS.map((option) => (
              <Link
                key={option}
                href={buildLimitHref({
                  q,
                  sort: sortKey,
                  dir: sortDir,
                  limit: option,
                })}
                className={`app-chip whitespace-nowrap ${limit === option ? 'app-chip-active' : 'app-chip-idle'}`}
              >
                {option} rows
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function BulkSelectionScript({
  formId,
  deleteFormId,
  statusFormId,
  finalizeFormId,
}: {
  formId: string
  deleteFormId: string
  statusFormId: string
  finalizeFormId: string
}) {
  const script = `
    (() => {
      const formId = ${JSON.stringify('${FORM_ID_PLACEHOLDER}')};
      const deleteFormId = ${JSON.stringify('${DELETE_FORM_ID_PLACEHOLDER}')};
      const statusFormId = ${JSON.stringify('${STATUS_FORM_ID_PLACEHOLDER}')};
      const finalizeFormId = ${JSON.stringify('${FINALIZE_FORM_ID_PLACEHOLDER}')};
      const fieldName = 'selected_inventory_ids';
      const storageKey = 'card_business_os_inventory_bulk_selection_v2';
      let isBulkSubmitting = false;

      const form = () => document.getElementById(formId);
      const deleteForm = () => document.getElementById(deleteFormId);
      const statusForm = () => document.getElementById(statusFormId);
      const finalizeForm = () => document.getElementById(finalizeFormId);
      const countNodes = () => Array.from(document.querySelectorAll('[data-bulk-selected-count="true"]'));
      const pendingNodes = () => Array.from(document.querySelectorAll('[data-bulk-pending-state="true"]'));
      const rowCheckboxes = () => Array.from(document.querySelectorAll('input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"][data-inventory-bulk-row-checkbox="true"]'));
      const allSelectionCheckboxes = () => Array.from(document.querySelectorAll('input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"]'));
      const pageToggleCheckboxes = () => Array.from(document.querySelectorAll('input[type="checkbox"][data-bulk-page-checkbox="true"][form="' + formId + '"]'));
      const toggles = () => Array.from(document.querySelectorAll('[data-bulk-action-toggle="true"]'));
      const submitButtons = () => Array.from(document.querySelectorAll('[data-bulk-submit="true"]'));
      const selectPageButtons = () => Array.from(document.querySelectorAll('[data-bulk-select-page="true"]'));
      const clearButtons = () => Array.from(document.querySelectorAll('[data-bulk-clear-selection="true"]'));
      const scrollInputs = () => Array.from(document.querySelectorAll('input[name="scroll_y"][form="' + formId + '"], form#' + formId + ' input[name="scroll_y"], form#' + deleteFormId + ' input[name="scroll_y"], form#' + statusFormId + ' input[name="scroll_y"], form#' + finalizeFormId + ' input[name="scroll_y"]'));
      const statusInputs = () => Array.from(document.querySelectorAll('form#' + statusFormId + ' input[name="bulk_status"]'));

      function loadStoredSelection() {
        try {
          const raw = window.sessionStorage.getItem(storageKey);
          const parsed = raw ? JSON.parse(raw) : [];
          if (!Array.isArray(parsed)) return new Set();
          return new Set(parsed.map((value) => String(value || '').trim()).filter(Boolean));
        } catch (_error) {
          return new Set();
        }
      }

      function saveStoredSelection(selection) {
        try {
          window.sessionStorage.setItem(storageKey, JSON.stringify(Array.from(selection)));
        } catch (_error) {}
      }

      try {
        window.sessionStorage.removeItem(storageKey);
      } catch (_error) {}

      let selectedIdsSet = new Set();

      function setDisabled(node, disabled) {
        node.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        node.classList.toggle('pointer-events-none', disabled);
        node.classList.toggle('opacity-50', disabled);
        if ('disabled' in node) node.disabled = disabled;
      }

      function pageIds() {
        return rowCheckboxes().map((checkbox) => checkbox.value).filter(Boolean);
      }

      function selectedCount() {
        return rowCheckboxes().filter((checkbox) => checkbox.checked).length;
      }

      function selectedIds() {
        return rowCheckboxes()
          .filter((checkbox) => checkbox.checked)
          .map((checkbox) => String(checkbox.value || '').trim())
          .filter(Boolean);
      }

      function visibleCheckedIds() {
        return rowCheckboxes()
          .filter((checkbox) => checkbox.checked)
          .map((checkbox) => String(checkbox.value || '').trim())
          .filter(Boolean);
      }

      function replaceSelectionWithVisibleCheckedRows() {
        selectedIdsSet = new Set(visibleCheckedIds());
        saveStoredSelection(selectedIdsSet);
        syncStoredInputs();
      }

      function syncStoredInputs() {
        const selectedIdsList = selectedIds();

        [form(), deleteForm(), statusForm(), finalizeForm()].forEach((targetForm) => {
          if (!targetForm) return;

          targetForm.querySelectorAll('input[data-bulk-persisted-selection="true"]').forEach((input) => input.remove());

          selectedIdsList.forEach((id) => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = fieldName;
            input.value = id;
            input.setAttribute('data-bulk-persisted-selection', 'true');
            targetForm.appendChild(input);
          });
        });
      }

      function syncPageCheckboxesFromStoredSelection() {
        rowCheckboxes().forEach((checkbox) => {
          checkbox.checked = selectedIdsSet.has(checkbox.value);
        });
      }

      function syncStoredSelectionFromPageCheckbox(checkbox) {
        const id = String(checkbox.value || '').trim();
        if (!id) return;
        if (checkbox.checked) {
          selectedIdsSet.add(id);
        } else {
          selectedIdsSet.delete(id);
        }
        saveStoredSelection(selectedIdsSet);
        syncStoredInputs();
      }

      function updateBulkState() {
        syncStoredInputs();

        const currentPageIds = pageIds();
        const totalOnPage = currentPageIds.length;
        const selectedOnPage = selectedCount();
        const count = selectedCount();
        const hasSelection = count > 0;
        const allPageSelected = totalOnPage > 0 && selectedOnPage === totalOnPage;

        countNodes().forEach((node) => {
          node.textContent = count + ' selected' + (totalOnPage > 0 ? ' • ' + selectedOnPage + ' of ' + totalOnPage + ' on this page' : '');
          node.classList.toggle('text-zinc-400', !hasSelection);
          node.classList.toggle('text-zinc-100', hasSelection);
          node.classList.toggle('border-zinc-800', !hasSelection);
          node.classList.toggle('border-emerald-900/60', hasSelection);
          node.classList.toggle('bg-zinc-950', !hasSelection);
          node.classList.toggle('bg-emerald-950/20', hasSelection);
        });

        rowCheckboxes().forEach((checkbox) => {
          const row = checkbox.closest('[data-inventory-row-id]');
          if (row) {
            row.classList.toggle('bg-zinc-900/40', checkbox.checked && !isBulkSubmitting);
          }
        });

        pageToggleCheckboxes().forEach((checkbox) => {
          checkbox.checked = allPageSelected;
          checkbox.indeterminate = selectedOnPage > 0 && !allPageSelected;
          checkbox.setAttribute('aria-checked', checkbox.indeterminate ? 'mixed' : String(allPageSelected));
          setDisabled(checkbox, totalOnPage === 0 || isBulkSubmitting);
        });

        toggles().forEach((node) => setDisabled(node, !hasSelection || isBulkSubmitting));
        submitButtons().forEach((node) => setDisabled(node, !hasSelection || isBulkSubmitting));
        selectPageButtons().forEach((node) => {
          setDisabled(node, totalOnPage === 0 || allPageSelected || isBulkSubmitting);
          node.textContent = allPageSelected ? 'All rows on this page selected' : 'Select all on page';
        });
        clearButtons().forEach((node) => setDisabled(node, !hasSelection || isBulkSubmitting));
      }

      function rememberScrollPosition() {
        scrollInputs().forEach((input) => {
          input.value = String(Math.max(0, Math.round(window.scrollY || 0)));
        });
      }

      function setBulkStatus(value) {
        statusInputs().forEach((input) => {
          input.value = value || '';
        });
      }

      function statusLabel(status) {
        if (status === 'available') return 'For Sale';
        if (status === 'listed') return 'Listed';
        if (status === 'personal') return 'Personal';
        if (status === 'junk') return 'Junk';
        if (status === 'disposed') return 'Disposed';
        return 'Updated';
      }

      function statusPillClasses(status) {
        if (status === 'personal') return 'app-badge app-badge-info';
        if (status === 'junk') return 'app-badge app-badge-neutral';
        if (status === 'disposed') return 'app-badge app-badge-danger';
        if (status === 'listed') return 'app-badge app-badge-warning';
        return 'app-badge app-badge-success';
      }

      function closeOpenConfirmations() {
        document.querySelectorAll('details[open]').forEach((details) => {
          details.removeAttribute('open');
        });
      }

      function showPendingMessage(message) {
        pendingNodes().forEach((node) => {
          node.textContent = message;
          node.classList.remove('hidden');
        });
      }

      function applyInstantRowState({ ids, status, isDelete }) {
        ids.forEach((id) => {
          const row = document.querySelector('[data-inventory-row-id="' + CSS.escape(id) + '"]');
          if (!row) return;

          row.classList.add('transition', 'duration-150');

          if (isDelete) {
            row.classList.add('opacity-40');
            row.style.filter = 'grayscale(1)';
            row.querySelectorAll('a, button, input').forEach((node) => setDisabled(node, true));
            const titleNode = row.querySelector('[data-inventory-primary-title="true"]');
            if (titleNode && !titleNode.querySelector('[data-bulk-row-pending="true"]')) {
              const badge = document.createElement('span');
              badge.setAttribute('data-bulk-row-pending', 'true');
              badge.className = 'ml-2 inline-flex rounded-full border border-red-900/60 bg-red-950/30 px-2 py-0.5 text-[11px] font-medium text-red-200';
              badge.textContent = 'Deleting…';
              titleNode.appendChild(badge);
            }
            return;
          }

          row.classList.add('bg-emerald-950/10');
          const statusCell = row.querySelector('[data-inventory-status-cell="true"]');
          if (statusCell) {
            statusCell.innerHTML = '';
            const badge = document.createElement('span');
            badge.className = statusPillClasses(status);
            badge.textContent = statusLabel(status);
            statusCell.appendChild(badge);
          }
        });
      }

      function setSubmitting(button) {
        isBulkSubmitting = true;
        const count = selectedCount();
        const ids = selectedIds();
        const status = button.getAttribute('data-bulk-status') || '';
        const isDelete = button.getAttribute('data-bulk-delete') === 'true';
        const label = button.getAttribute('data-bulk-label') || (isDelete ? 'Delete Selected' : 'Update Selected');
        const isFinalize = label === 'Finalize Disposal Write-Off';

        button.setAttribute('data-original-label', button.textContent || label);
        button.textContent = isDelete ? 'Deleting…' : isFinalize ? 'Finalizing…' : 'Updating…';
        showPendingMessage(
          isDelete
            ? 'Deleting ' + count + ' selected item(s)…'
            : isFinalize
              ? 'Finalizing disposal review for ' + count + ' selected item(s)…'
              : 'Updating ' + count + ' selected item(s)…'
        );
        closeOpenConfirmations();
        applyInstantRowState({ ids, status, isDelete });

        // Do not disable the clicked submit button during the same click event.
        // In React/Next formAction flows, disabling it immediately can prevent
        // the browser from completing the submit, which makes the UI look stuck.
        window.setTimeout(() => updateBulkState(), 0);
      }

      document.addEventListener('change', (event) => {
        const target = event.target;

        if (target && target.matches && target.matches('input[type="checkbox"][data-bulk-page-checkbox="true"][form="' + formId + '"]')) {
          const shouldSelectPage = Boolean(target.checked);

          rowCheckboxes().forEach((checkbox) => {
            checkbox.checked = shouldSelectPage;
          });

          selectedIdsSet = new Set(shouldSelectPage ? selectedIds() : []);
          saveStoredSelection(selectedIdsSet);
          syncStoredInputs();
          updateBulkState();
          return;
        }

        if (target && target.matches && target.matches('input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"][data-inventory-bulk-row-checkbox="true"]')) {
          syncStoredSelectionFromPageCheckbox(target);
          updateBulkState();
          return;
        }
      }, true);

      document.addEventListener('click', (event) => {
        const toggle = event.target && event.target.closest ? event.target.closest('[data-bulk-action-toggle="true"]') : null;
        if (toggle && (selectedCount() === 0 || isBulkSubmitting)) {
          event.preventDefault();
          updateBulkState();
          return;
        }

        const selectPageButton = event.target && event.target.closest ? event.target.closest('[data-bulk-select-page="true"]') : null;
        if (selectPageButton) {
          event.preventDefault();
          event.stopPropagation();
          if (isBulkSubmitting) return;

          rowCheckboxes().forEach((checkbox) => {
            checkbox.checked = true;
          });

          selectedIdsSet = new Set(selectedIds());
          saveStoredSelection(selectedIdsSet);
          syncStoredInputs();
          updateBulkState();
          return;
        }

        const clearButton = event.target && event.target.closest ? event.target.closest('[data-bulk-clear-selection="true"]') : null;
        if (clearButton) {
          event.preventDefault();
          event.stopPropagation();
          if (isBulkSubmitting) return;
          selectedIdsSet = new Set();
          saveStoredSelection(selectedIdsSet);
          allSelectionCheckboxes().forEach((checkbox) => {
            checkbox.checked = false;
            checkbox.indeterminate = false;
          });
          syncStoredInputs();
          updateBulkState();
          return;
        }

        const finalizeButton = event.target && event.target.closest ? event.target.closest('[data-bulk-finalize-submit="true"]') : null;
        if (finalizeButton) {
          replaceSelectionWithVisibleCheckedRows();

          if (selectedCount() === 0) {
            event.preventDefault();
            updateBulkState();
            return;
          }

          rememberScrollPosition();

          // Submit the dedicated final disposal form normally.
          return;
        }

        const nativeDeleteSubmitButton = event.target && event.target.closest ? event.target.closest('[data-bulk-native-delete-submit="true"]') : null;
        if (nativeDeleteSubmitButton) {
          if (selectedCount() === 0 || isBulkSubmitting) {
            event.preventDefault();
            updateBulkState();
            return;
          }

          selectedIdsSet = new Set(selectedIds());
          syncStoredInputs();
          rememberScrollPosition();
          return;
        }

        const submitButton = event.target && event.target.closest ? event.target.closest('[data-bulk-submit="true"]') : null;
        if (submitButton) {
          if (selectedCount() === 0 || isBulkSubmitting) {
            event.preventDefault();
            updateBulkState();
            return;
          }

          selectedIdsSet = new Set(selectedIds());
          syncStoredInputs();
          setBulkStatus(submitButton.getAttribute('data-bulk-status') || '');
          rememberScrollPosition();

          // Submit the dedicated status form normally, same as the working delete button.
          return;
        }
      }, true);

      document.addEventListener('submit', (event) => {
        if (event.target && (event.target.id === formId || event.target.id === deleteFormId || event.target.id === statusFormId || event.target.id === finalizeFormId)) {
          syncStoredInputs();
          rememberScrollPosition();
        }
      });

      rowCheckboxes().forEach((checkbox) => {
        checkbox.checked = false;
      });
      pageToggleCheckboxes().forEach((checkbox) => {
        checkbox.checked = false;
        checkbox.indeterminate = false;
      });
      syncStoredInputs();
      updateBulkState();
    })();
  `.replace('${FORM_ID_PLACEHOLDER}', formId).replace('${DELETE_FORM_ID_PLACEHOLDER}', deleteFormId).replace('${STATUS_FORM_ID_PLACEHOLDER}', statusFormId).replace('${FINALIZE_FORM_ID_PLACEHOLDER}', finalizeFormId)

  return <Script id="bulk-selection-script" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: script }} />
}

function ScrollRestoreScript({ scrollY }: { scrollY: string }) {
  const numericScrollY = Number(scrollY)

  if (!Number.isFinite(numericScrollY) || numericScrollY < 1) {
    return null
  }

  const script = `
    (() => {
      const y = ${Math.round(numericScrollY)};
      requestAnimationFrame(() => window.scrollTo({ top: y, left: 0, behavior: 'auto' }));
    })();
  `

  return <Script id={BULK_SCROLL_RESTORE_ID} strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: script }} />
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
    deleted_count?: string
    delete_error?: string
    status_updated?: string
    status_error?: string
    scroll_y?: string
  }>
}) {
  const params = searchParams ? await searchParams : undefined
  const qRaw = String(params?.q ?? '')
  const q = cleanSearchTerm(qRaw)
  const qNormalized = q.toLowerCase()
  const saved = String(params?.saved ?? '')
  const deletedCount = String(params?.deleted_count ?? '').trim()
  const deleteError = String(params?.delete_error ?? '').trim()
  const statusUpdated = String(params?.status_updated ?? '').trim()
  const statusError = String(params?.status_error ?? '').trim()
  const scrollY = String(params?.scroll_y ?? '').trim()
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
    .is('deleted_at', null)

  if (qNormalized !== 'junk') {
    query = query.neq('status', 'junk')
  }

  if (qNormalized === 'available') {
    query = query.eq('status', 'available')
  } else if (qNormalized === 'listed') {
    query = query.eq('status', 'listed')
  } else if (qNormalized === 'junk') {
    query = query.eq('status', 'junk')
  } else if (qNormalized === 'disposed') {
    query = query.eq('status', 'disposed')
  } else if (qNormalized === 'sold') {
    query = query.eq('status', 'sold')
  } else if (qNormalized === 'personal') {
    query = query.eq('status', 'personal')
  } else if (qNormalized === 'giveaway') {
    query = query.eq('status', 'giveaway')
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

  const inventoryRowsPromise = query
    .order(dbSortKey, { ascending: sortDir === 'asc' })
    .range(from, to)

  const summaryRowsPromise = supabase
    .from('inventory_items')
    .select('status, quantity, available_quantity, cost_basis_unit, cost_basis_total, estimated_value_total')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('status', STATUS_FILTERS)

  const [response, summaryResponse] = await Promise.all([inventoryRowsPromise, summaryRowsPromise])

  const rawItems = (response.data ?? []) as InventoryRow[]
  const items = sortKey === 'card' ? sortRows(rawItems, sortKey, sortDir) : rawItems
  const error = response.error || summaryResponse.error

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

  const visibleItemIds = items.map((item) => item.id)
  const finalizedDisposalByItemId = new Map<string, FinalizedDisposalTransactionRow>()

  if (visibleItemIds.length > 0) {
    const finalizedDisposalResponse = await supabase
      .from('inventory_transactions')
      .select(`
        inventory_item_id,
        created_at,
        disposal_reason,
        disposal_notes,
        notes
      `)
      .eq('user_id', user.id)
      .eq('transaction_type', 'disposal_writeoff_review')
      .eq('finalized_for_tax', true)
      .in('inventory_item_id', visibleItemIds)
      .order('created_at', { ascending: false })

    const finalizedRows = (finalizedDisposalResponse.data ?? []) as FinalizedDisposalTransactionRow[]

    for (const row of finalizedRows) {
      if (!row.inventory_item_id) continue
      if (finalizedDisposalByItemId.has(row.inventory_item_id)) continue
      finalizedDisposalByItemId.set(row.inventory_item_id, row)
    }
  }

  const activeStatusFilter = STATUS_FILTERS.includes(qNormalized as InventoryStatusFilter)
    ? (qNormalized as InventoryStatusFilter)
    : null

  const pageDescription =
    qNormalized === 'available'
      ? 'Showing available inventory items.'
      : qNormalized === 'listed'
        ? 'Showing listed inventory items.'
        : qNormalized === 'junk'
          ? 'Showing junk items you are not planning to sell.'
        : qNormalized === 'disposed'
          ? 'Showing disposed inventory items that physically left the business.'
          : qNormalized === 'sold'
            ? 'Showing sold inventory items.'
            : qNormalized === 'personal'
              ? 'Showing personal collection items.'
              : 'View and manage your inventory items.'

  const statusSummaries = STATUS_FILTERS.reduce(
    (acc, status) => {
      acc[status] = { quantity: 0, cost: 0, value: 0 }
      return acc
    },
    {} as Record<InventoryStatusFilter, InventoryStatusSummary>
  )

  for (const item of (summaryResponse.data ?? []) as Pick<InventoryRow, 'status' | 'quantity' | 'available_quantity' | 'cost_basis_unit' | 'cost_basis_total' | 'estimated_value_total'>[]) {
    const status = String(item.status ?? '') as InventoryStatusFilter
    if (!STATUS_FILTERS.includes(status)) continue

    const quantity =
      status === 'sold'
        ? Number(item.quantity ?? 0)
        : Number(item.available_quantity ?? item.quantity ?? 0)

    statusSummaries[status].quantity += quantity
    statusSummaries[status].cost += remainingCostBasis(item)
    statusSummaries[status].value += Number(item.estimated_value_total ?? 0)
  }

  const hasPreviousPage = page > 1
  const hasNextPage = items.length === limit

  return (
    <div className="app-page-wide flex h-[calc(100vh-6.5rem)] flex-col gap-3 overflow-hidden">
      <div className="app-page-header gap-3">
        <div className="min-w-0">
          <h1 className="app-title">Inventory</h1>
          <p className="app-subtitle">{pageDescription}</p>
        </div>

        <Link href="/app/inventory/new" className="app-button-primary">
          Add Inventory
        </Link>
      </div>

      <div id="inventory-status" className="scroll-mt-28 space-y-3">
        {saved === '1' ? (
          <div className="app-alert-success">
            Quick sale recorded, inventory updated, and tax tracking kept in sync.
          </div>
        ) : null}

        {deletedCount ? (
          <div className="app-alert-success">
            Deleted {deletedCount} successfully.
          </div>
        ) : null}

        {statusUpdated ? (
          <div className="app-alert-success">
            Updated {statusUpdated} successfully.
          </div>
        ) : null}

        {deleteError ? (
          <div className="app-alert-error">
            Delete failed: {deleteError}
          </div>
        ) : null}

        {statusError ? (
          <div className="app-alert-error">
            Status update failed: {statusError}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
        {STATUS_FILTERS.map((status) => (
          <StatusSummaryCard
            key={status}
            label={STATUS_LABELS[status]}
            href={getFilterHref(status, sortKey, sortDir, limit)}
            summary={statusSummaries[status]}
            active={activeStatusFilter === status}
            status={status}
          />
        ))}
      </div>

      {activeStatusFilter && inventoryTaxSafetyNote(activeStatusFilter) ? (
        <div className="app-alert-info">
          {inventoryTaxSafetyNote(activeStatusFilter)}
        </div>
      ) : null}


      {error ? <div className="app-alert-error">Error loading inventory: {error.message}</div> : null}

      <div className="app-section flex min-h-0 flex-1 flex-col">
        <div className="flex justify-end">
          <div className="text-xs text-zinc-500">{items.length} shown</div>
        </div>

        <BulkSelectionScript formId={BULK_INVENTORY_FORM_ID} deleteFormId={BULK_DELETE_FORM_ID} statusFormId={BULK_STATUS_FORM_ID} finalizeFormId={BULK_FINALIZE_FORM_ID} />
        <ScrollRestoreScript scrollY={scrollY} />

        <form id={BULK_INVENTORY_FORM_ID}>
          <input type="hidden" name="q" value={q} />
          <input type="hidden" name="sort" value={sortKey} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="limit" value={limit} />
          <input type="hidden" name="scroll_y" value="" />
          <input type="hidden" name="bulk_status" value="" />


          <BulkActionsPanel
            formId={BULK_INVENTORY_FORM_ID}
            statusFormId={BULK_STATUS_FORM_ID}
            finalizeFormId={BULK_FINALIZE_FORM_ID}
            pageItemCount={items.length}
            q={q}
            sortKey={sortKey}
            sortDir={sortDir}
            limit={limit}
          />
        </form>

        <form id={BULK_DELETE_FORM_ID} className="hidden">
          <input type="hidden" name="q" value={q} />
          <input type="hidden" name="sort" value={sortKey} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="limit" value={limit} />
          <input type="hidden" name="scroll_y" value="" />
        </form>

        <form id={BULK_STATUS_FORM_ID} className="hidden">
          <input type="hidden" name="q" value={q} />
          <input type="hidden" name="sort" value={sortKey} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="limit" value={limit} />
          <input type="hidden" name="scroll_y" value="" />
          <input type="hidden" name="bulk_status" value="" />
        </form>

        <form id={BULK_FINALIZE_FORM_ID} className="hidden">
          <input type="hidden" name="q" value={q} />
          <input type="hidden" name="sort" value={sortKey} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="limit" value={limit} />
          <input type="hidden" name="scroll_y" value="" />
        </form>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto app-table-wrap pb-4">
          <div className="app-table-scroll">
            <table className="app-table">
              <thead className="app-thead">
                <tr>
                  <th className="app-th w-16">
                    <input
                      form={BULK_INVENTORY_FORM_ID}
                      type="checkbox"
                      data-bulk-page-checkbox="true"
                      aria-label="Select all inventory items on this page"
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                    />
                  </th>
                  <th className="app-th min-w-[260px]">
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
                      label="Location"
                      sortKey="storage_location"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th min-w-[150px]">Actions</th>
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
                  const finalizedDisposal = finalizedDisposalByItemId.get(item.id) ?? null
                  const isFinalizedDisposal = Boolean(finalizedDisposal)
                  const itemName = `${getPrimaryTitle(item)}${itemLine ? ` • ${itemLine}` : ''}`

                  return (
                    <tr key={item.id} data-inventory-row-id={item.id} className="app-tr align-top">
                      <td className="app-td">
                        <input
                          form={BULK_INVENTORY_FORM_ID}
                          type="checkbox"
                          name="selected_inventory_ids"
                          value={item.id}
                          data-inventory-bulk-row-checkbox="true"
                          aria-label={`Select ${itemName}`}
                          className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                        />
                      </td>

                      <td className="app-td">
                        <div className="min-w-[240px] max-w-[520px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link
                              href={`/app/inventory/${item.id}`}
                              data-inventory-primary-title="true"
                              className="break-words font-medium leading-tight text-zinc-100 hover:text-white hover:underline"
                              title="Open inventory details"
                            >
                              {getPrimaryTitle(item)}
                            </Link>
                            {isLotLike ? (
                              <span className="app-badge app-badge-warning shrink-0">Lot / Multi Qty</span>
                            ) : null}
                          </div>
                          <Link
                            href={`/app/inventory/${item.id}`}
                            className="mt-0.5 block break-words text-xs text-zinc-400 hover:text-zinc-200 hover:underline"
                            title={itemLine || getPrimaryTitle(item)}
                          >
                            {itemLine || 'Open details'}
                          </Link>
                          {isFinalizedDisposal ? (
                            <div className="mt-1 inline-flex rounded-full border border-amber-900/60 bg-amber-950/30 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                              Finalized for write-off review
                            </div>
                          ) : null}
                        </div>
                      </td>

                      <td data-inventory-status-cell="true" className="app-td whitespace-nowrap">{renderStatusPill(item.status)}</td>
                      <td className="app-td whitespace-nowrap">{item.quantity ?? 0}</td>

                      <td className="app-td whitespace-nowrap">
                        <div className="font-medium leading-tight">{item.available_quantity ?? 0}</div>
                        {hasAvailable && isLotLike ? (
                          <div className="mt-0.5 text-[11px] text-zinc-500">partial sell ready</div>
                        ) : null}
                      </td>

                      <td className="app-td whitespace-nowrap">{money(item.cost_basis_unit)}</td>
                      <td className="app-td">
                        <div className="max-w-28 break-words" title={item.storage_location || '—'}>
                          {item.storage_location || '—'}
                        </div>
                      </td>

                      <td className="app-td">
                        <div className="flex flex-wrap items-center gap-1">
                          {isFinalizedDisposal ? (
                            <span
                              className="rounded-full border border-amber-900/60 bg-amber-950/30 px-2.5 py-1 text-xs font-medium text-amber-200"
                              title={finalizedDisposal?.notes || 'Finalized disposal is locked for tax review.'}
                            >
                              Locked
                            </span>
                          ) : hasAvailable ? (
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
                            <form action={reverseSaleAction} className="inline-flex">
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

                          {!isFinalizedDisposal ? (
                            <DeleteInventoryItemButton itemId={item.id} itemName={itemName} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">
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