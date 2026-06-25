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
type BulkStatus = 'available' | 'listed' | 'personal' | 'junk' | 'giveaway'

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
const BULK_PENDING_OVERLAY_ID = 'bulk-inventory-pending-overlay'
const BULK_SUCCESS_OVERLAY_ID = 'bulk-inventory-success-overlay'

const STATUS_LABELS: Record<InventoryStatusFilter, string> = {
  available: 'Available',
  listed: 'Listed',
  junk: 'Junk',
  disposed: 'Written Off',
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
    return <span className="app-badge app-badge-danger">Written Off</span>
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
    return 'Junk keeps the item visible for recordkeeping. Do not deduct it as a loss, donation, or write-off until a final documented disposition exists. Use Write Off Selected when the item leaves the business with no sale proceeds.'
  }

  if (status === 'disposed') {
    return 'Written Off means the item physically left business inventory with no sale proceeds and was locked for tax review. Keep notes so the same item is not also deducted somewhere else.'
  }

  return null
}


function bulkStatusLabel(status: BulkStatus) {
  if (status === 'available') return 'For Sale'
  if (status === 'listed') return 'Listed'
  if (status === 'personal') return 'Personal'
  if (status === 'junk') return 'Junk'
  if (status === 'giveaway') return 'Giveaway'
  if (status === 'disposed') return 'Written Off'
  return status
}

function labelFromBulkGiveawayValue(value: string) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function buildBulkGiveawayExpenseCategory(giveawayTypeLabel: string) {
  return `Advertising / Marketing - Giveaway - ${giveawayTypeLabel || 'Giveaway'}`
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

async function findFinalizedWriteOffItemIds({
  supabase,
  userId,
  itemIds,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  itemIds: string[]
}) {
  if (itemIds.length === 0) {
    return {
      error: null,
      lockedItemIds: [] as string[],
    }
  }

  const { data, error } = await supabase
    .from('inventory_transactions')
    .select('inventory_item_id')
    .eq('user_id', userId)
    .eq('transaction_type', 'disposal_writeoff_review')
    .eq('finalized_for_tax', true)
    .in('inventory_item_id', itemIds)

  if (error) {
    return {
      error: error.message,
      lockedItemIds: [] as string[],
    }
  }

  return {
    error: null,
    lockedItemIds: Array.from(
      new Set(
        (data ?? [])
          .map((row) => String(row.inventory_item_id ?? '').trim())
          .filter(Boolean)
      )
    ),
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

  const finalizedWriteOffCheck = await findFinalizedWriteOffItemIds({
    supabase,
    userId: user.id,
    itemIds,
  })

  if (finalizedWriteOffCheck.error) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'delete_error',
        statusValue: finalizedWriteOffCheck.error,
        scrollY,
      })
    )
  }

  if (finalizedWriteOffCheck.lockedItemIds.length > 0) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'delete_error',
        statusValue:
          'One or more selected items are written off and locked for tax review. Undo the write-off before deleting.',
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

  const allowedStatuses: BulkStatus[] = ['available', 'listed', 'personal', 'junk']

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

  const finalizedWriteOffCheck = await findFinalizedWriteOffItemIds({
    supabase,
    userId: user.id,
    itemIds,
  })

  if (finalizedWriteOffCheck.error) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: finalizedWriteOffCheck.error,
        scrollY,
      })
    )
  }

  if (finalizedWriteOffCheck.lockedItemIds.length > 0) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue:
          'One or more selected items are written off and locked for tax review. Undo the write-off before changing status.',
        scrollY,
      })
    )
  }

  const { data: existingItems } = await supabase
    .from('inventory_items')
    .select('id, title, status, quantity, available_quantity, cost_basis_total')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', itemIds)

  const inventoryUpdatePayload =
    requestedStatus === 'giveaway'
      ? {
          status: requestedStatus,
          available_quantity: 0,
          updated_at: new Date().toISOString(),
        }
      : {
          status: requestedStatus,
          updated_at: new Date().toISOString(),
        }

  const { error } = await supabase
    .from('inventory_items')
    .update(inventoryUpdatePayload)
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

async function bulkFinalizeGiveawayAction(formData: FormData) {
  'use server'

  const itemIds = readFormIds(formData, 'selected_inventory_ids')
  const giveawayType = String(formData.get('giveaway_type') ?? '').trim()
  const businessPurpose = String(formData.get('business_purpose') ?? '').trim()
  const recipientType = String(formData.get('recipient_type') ?? '').trim()
  const campaignEvent = String(formData.get('campaign_event') ?? '').trim()
  const relatedOrderSale = String(formData.get('related_order_sale') ?? '').trim()
  const giveawayNotes = String(formData.get('giveaway_notes') ?? '').trim()
  const eventDate = String(formData.get('event_date') ?? '').trim() || new Date().toISOString().slice(0, 10)
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
        statusValue: 'Select at least one inventory item to mark as a giveaway.',
        scrollY,
      })
    )
  }

  if (!giveawayType || !businessPurpose) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: 'Giveaway Type and Business Purpose are required for bulk giveaways.',
        scrollY,
      })
    )
  }

  if ((giveawayType === 'other' || businessPurpose === 'other') && !giveawayNotes) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: 'Notes are required when Giveaway Type or Business Purpose is Other.',
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
        statusKey: 'status_error',
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
        statusKey: 'status_error',
        statusValue:
          'One or more selected items have active sales. Reverse the sale first so COGS and inventory stay audit-safe.',
        scrollY,
      })
    )
  }

  const finalizedWriteOffCheck = await findFinalizedWriteOffItemIds({
    supabase,
    userId: user.id,
    itemIds,
  })

  if (finalizedWriteOffCheck.error) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: finalizedWriteOffCheck.error,
        scrollY,
      })
    )
  }

  if (finalizedWriteOffCheck.lockedItemIds.length > 0) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue:
          'One or more selected items are written off and locked for tax review. Undo the write-off before marking them as giveaways.',
        scrollY,
      })
    )
  }

  const { data: existingItems, error: existingItemsError } = await supabase
    .from('inventory_items')
    .select('id, title, status, quantity, available_quantity, cost_basis_unit, cost_basis_total')
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

  if (items.length === 0) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: 'No matching active inventory items were found. Refresh the page and select the rows again.',
        scrollY,
      })
    )
  }

  const giveawayAt = new Date().toISOString()

  const { error: updateError } = await supabase
    .from('inventory_items')
    .update({
      status: 'giveaway',
      available_quantity: 0,
      updated_at: giveawayAt,
    })
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', items.map((item) => item.id))

  if (updateError) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: updateError.message,
        scrollY,
      })
    )
  }

  const giveawayTypeLabel = labelFromBulkGiveawayValue(giveawayType)
  const businessPurposeLabel = labelFromBulkGiveawayValue(businessPurpose)
  const recipientTypeLabel = recipientType ? labelFromBulkGiveawayValue(recipientType) : ''
  const giveawayExpenseCategory = buildBulkGiveawayExpenseCategory(giveawayTypeLabel)

  const bulkGiveawayRows = items.map((item) => {
    const itemTitle = item.title || 'Inventory item'
    const quantityRemoved = Number(item.available_quantity ?? item.quantity ?? 0)
    const unitCost = Number(item.cost_basis_unit ?? 0)
    const totalCost = Number(item.cost_basis_total ?? 0)
    const amount = quantityRemoved > 0 && unitCost > 0 ? quantityRemoved * unitCost : totalCost
    const previousStatus = String(item.status || 'unassigned').replaceAll('_', ' ')
    const detailParts = [
      `Giveaway Type: ${giveawayTypeLabel}`,
      `Business Purpose: ${businessPurposeLabel}`,
      recipientTypeLabel ? `Recipient Type: ${recipientTypeLabel}` : '',
      campaignEvent ? `Campaign / Event: ${campaignEvent}` : '',
      relatedOrderSale ? `Related Order / Sale #: ${relatedOrderSale}` : '',
      giveawayNotes ? `Notes: ${giveawayNotes}` : '',
      'Do not also deduct this item as COGS, disposal, donation, or another separate expense.',
    ].filter(Boolean)
    const sharedAuditNote = `Bulk giveaway recorded for advertising / marketing support. Item: ${itemTitle}. Quantity given away: ${quantityRemoved}. Cost basis recorded: ${money(amount)}. Previous status: ${previousStatus}. ${detailParts.join(' ')}`

    return {
      item,
      amount,
      quantityRemoved,
      sharedAuditNote,
    }
  })

  const expenseRows = bulkGiveawayRows.map((row) => ({
    user_id: user.id,
    expense_date: eventDate,
    category: giveawayExpenseCategory,
    amount: row.amount,
    notes: row.sharedAuditNote,
  }))

  if (expenseRows.length > 0) {
    const { error: expenseError } = await supabase.from('expenses').insert(expenseRows)

    if (expenseError) {
      redirect(
        buildInventoryStatusHref({
          q,
          sort: safeSort,
          dir: safeDir,
          page: safePage,
          limit: safeLimit,
          statusKey: 'status_error',
          statusValue: expenseError.message,
          scrollY,
        })
      )
    }
  }

  const inventoryTransactionRows = bulkGiveawayRows.map((row) => ({
    user_id: user.id,
    inventory_item_id: row.item.id,
    transaction_type: 'adjustment',
    from_status: row.item.status || null,
    to_status: 'giveaway',
    quantity_change: -Math.abs(row.quantityRemoved),
    amount: row.amount,
    event_date: eventDate,
    notes: row.sharedAuditNote,
    created_at: giveawayAt,
  }))

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
  revalidatePath('/app/breaks')
  revalidatePath('/app/expenses')
  revalidatePath('/app/reports/tax')
  revalidatePath('/app/reports/tax/summary')
  revalidatePath('/app/reports/profit-loss')
  revalidatePath('/app/reports/cpa-packet')

  redirect(
    buildInventoryStatusHref({
      q,
      sort: safeSort,
      dir: safeDir,
      page: safePage,
      limit: safeLimit,
      statusKey: 'status_updated',
      statusValue: `${items.length} item(s) marked Giveaway with tax details`,
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
        statusValue: 'Select at least one inventory item to write off.',
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
        statusValue: 'Choose a write-off reason before writing off selected items.',
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

  if (items.length === 0) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: 'No matching active inventory items were found to write off. Refresh the page and select the rows again.',
        scrollY,
      })
    )
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
        statusKey: 'status_error',
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
        statusKey: 'status_error',
        statusValue:
          'One or more selected items have active sales. Reverse the sale first so COGS and inventory stay audit-safe.',
        scrollY,
      })
    )
  }

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
        statusValue: 'One or more selected items are already written off and locked for tax review.',
        scrollY,
      })
    )
  }

  const finalizedAt = new Date().toISOString()

  const writeOffItemIds = items.map((item) => item.id)

  const { error: updateError } = await supabase
    .from('inventory_items')
    .update({
      status: 'disposed',
      available_quantity: 0,
    })
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', writeOffItemIds)

  if (updateError) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: updateError.message,
        scrollY,
      })
    )
  }

  const inventoryTransactionRows = items.map((item) => {
    const itemTitle = item.title || 'Inventory item'
    const quantityRemoved = Number(item.available_quantity ?? item.quantity ?? 0)
    const costBasis = Number(item.cost_basis_total ?? 0)
    const trimmedNotes = disposalNotes || 'No extra notes entered.'
    const previousStatus = String(item.status || 'unassigned').replaceAll('_', ' ')

    return {
      user_id: user.id,
      inventory_item_id: item.id,
      transaction_type: 'disposal_writeoff_review',
      quantity_change: -Math.abs(quantityRemoved),
      disposal_reason: disposalReason,
      disposal_notes: disposalNotes || null,
      finalized_for_tax: true,
      notes: `Write-off finalized: ${itemTitle} was removed from active business inventory and locked for year-end/accountant review. Previous status: ${previousStatus}. Disposal reason: ${disposalReason}. User notes: ${trimmedNotes}. Quantity removed: ${quantityRemoved}. Recorded cost basis at write-off: ${money(costBasis)}. Do not also deduct this item as an expense, giveaway, donation, or separate loss without accountant review.`,
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
  revalidatePath('/app/reports/tax/summary')

  redirect(
    buildInventoryStatusHref({
      q,
      sort: safeSort,
      dir: safeDir,
      page: safePage,
      limit: safeLimit,
      statusKey: 'status_updated',
      statusValue: `${items.length} item(s) written off and removed from inventory`,
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
      className={`app-card-tight block p-1.5 text-center transition ${active ? activeClass : toneClass}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-300">{label}</div>
      <div className="mt-0 text-base font-bold leading-none text-zinc-100">{summary.quantity}</div>
      <div className="mt-0.5 grid grid-cols-2 gap-1 text-[10px] leading-tight text-zinc-500">
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
            data-bulk-delete="true"
            data-bulk-label="Delete Selected"
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

function BulkGiveawayConfirmControl({ formId }: { formId: string }) {
  return (
    <details className="group">
      <summary
        data-bulk-action-toggle="true"
        data-bulk-giveaway-toggle="true"
        className="app-button cursor-pointer list-none whitespace-nowrap border-purple-900/60 bg-purple-950/30 text-purple-100 hover:bg-purple-900/50"
      >
        Mark as Giveaway
      </summary>

      <div className="mt-2 rounded-xl border border-purple-900/60 bg-zinc-950 p-3 shadow-xl md:min-w-[34rem]">
        <div className="text-sm font-semibold text-purple-100">
          Mark selected items as giveaways?
        </div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">
          If one item is selected, HITS opens the full giveaway page. For multiple items, use these shared tax/audit details.
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">Giveaway Type required</span>
            <select form={formId} name="giveaway_type" required defaultValue="buyer_appreciation" className="app-select w-full">
              <option value="buyer_appreciation">Buyer Appreciation</option>
              <option value="livestream_giveaway">Livestream Giveaway</option>
              <option value="social_media_promotion">Social Media Promotion</option>
              <option value="customer_retention">Customer Retention</option>
              <option value="contest_prize">Contest Prize</option>
              <option value="show_or_event">Show / Event Giveaway</option>
              <option value="community_outreach">Community Outreach</option>
              <option value="promotional_item">Promotional Item</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">Business Purpose required</span>
            <select form={formId} name="business_purpose" required defaultValue="customer_retention" className="app-select w-full">
              <option value="customer_retention">Customer Retention</option>
              <option value="buyer_appreciation">Buyer Appreciation</option>
              <option value="new_customer_acquisition">New Customer Acquisition</option>
              <option value="stream_promotion">Stream Promotion</option>
              <option value="whatnot_promotion">Whatnot Promotion</option>
              <option value="card_show_promotion">Card Show Promotion</option>
              <option value="social_media_promotion">Social Media Promotion</option>
              <option value="brand_awareness">Brand Awareness</option>
              <option value="community_outreach">Community Outreach</option>
              <option value="contest_prize_support">Contest Prize Support</option>
              <option value="other">Other (requires notes)</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">Recipient Type</span>
            <select form={formId} name="recipient_type" defaultValue="viewer_or_customer" className="app-select w-full">
              <option value="viewer_or_customer">Viewer / Customer</option>
              <option value="buyer">Buyer</option>
              <option value="repeat_customer">Repeat Customer</option>
              <option value="prospective_customer">Prospective Customer</option>
              <option value="event_attendee">Event Attendee</option>
              <option value="community_group">Community Group</option>
              <option value="not_recorded">Not Recorded</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">Giveaway Date</span>
            <input form={formId} name="event_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="app-input w-full" />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">Campaign / Event</span>
            <input form={formId} name="campaign_event" className="app-input w-full" placeholder="Example: June Whatnot stream" />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">Related Order / Sale #</span>
            <input form={formId} name="related_order_sale" className="app-input w-full" placeholder="Optional order, sale, or stream reference" />
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-medium text-zinc-300">Notes</span>
            <textarea form={formId} name="giveaway_notes" className="app-input min-h-20 w-full" placeholder="Required when Giveaway Type or Business Purpose is Other. Optional for all other purposes." />
          </label>
        </div>

        <div className="mt-3 rounded-xl border border-amber-900/60 bg-amber-950/30 p-3 text-xs leading-relaxed text-amber-100">
          This records an Advertising / Marketing giveaway expense for each selected item and adds an inventory audit trail. Do not also deduct these items as COGS, disposal, donation, or separate expenses.
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" form={formId} formAction={bulkFinalizeGiveawayAction} data-bulk-submit="true" data-bulk-status="giveaway" data-bulk-label="Mark as Giveaway" className="app-button-primary whitespace-nowrap">
            Yes, Mark as Giveaway
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
        Write Off Selected
      </summary>

      <div className="mt-2 rounded-xl border border-amber-900/60 bg-zinc-950 p-3 shadow-xl md:min-w-80">
        <div className="text-sm font-semibold text-amber-200">Write off selected items?</div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">
          Removes selected items from inventory and records them as a tax write-off with an audit note for year-end review.
        </div>

        <div className="mt-3 grid gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">Write-off reason required</span>
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
            data-bulk-status="disposed"
            data-bulk-label="Write Off Selected"
            className="app-button whitespace-nowrap border-amber-800/80 bg-amber-950/50 text-amber-100 hover:bg-amber-900/60"
          >
            Yes, Write Off Items
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
    <div className="sticky top-[4.75rem] z-40 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-2 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-200">Bulk actions</div>
            <div className="mt-0.5 text-xs text-zinc-500">
              Check inventory rows, then update status, write off selected items, or delete correction rows. Written-off rows are locked for tax review.
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
              Written Off
            </Link>
            <Link
              href={getFilterHref('giveaway', sortKey, sortDir, limit)}
              className={`app-chip ${q === 'giveaway' ? 'app-chip-active' : 'app-chip-idle'}`}
            >
              Giveaway
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
            <BulkGiveawayConfirmControl formId={statusFormId} />
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
      const pendingOverlay = () => document.getElementById('bulk-inventory-pending-overlay');
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
        if (status === 'giveaway') return 'Giveaway';
        if (status === 'disposed') return 'Written Off';
        return 'Updated';
      }

      function statusPillClasses(status) {
        if (status === 'personal') return 'app-badge app-badge-info';
        if (status === 'junk') return 'app-badge app-badge-neutral';
        if (status === 'giveaway') return 'app-badge app-badge-warning';
        if (status === 'disposed') return 'app-badge app-badge-danger';
        if (status === 'listed') return 'app-badge app-badge-warning';
        return 'app-badge app-badge-success';
      }

      function closeOpenConfirmations() {
        document.querySelectorAll('details[open]').forEach((details) => {
          details.removeAttribute('open');
        });
      }

      function showPendingMessage(message, detail) {
        pendingNodes().forEach((node) => {
          node.textContent = message;
          node.classList.remove('hidden');
        });

        const overlay = pendingOverlay();
        if (overlay) {
          const title = overlay.querySelector('[data-bulk-overlay-title="true"]');
          const body = overlay.querySelector('[data-bulk-overlay-body="true"]');

          if (title) title.textContent = message;
          if (body) body.textContent = detail || 'Please wait while HITS updates the selected inventory records.';

          overlay.classList.remove('hidden');
          overlay.classList.add('flex');
        }

        document.body.classList.add('overflow-hidden');
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

      function submitAfterOverlay(button) {
        window.setTimeout(() => {
          if (button && button.form && typeof button.form.requestSubmit === 'function') {
            button.form.requestSubmit(button);
          } else if (button && button.form) {
            button.form.submit();
          }
        }, 150);
      }

      function setSubmitting(button) {
        isBulkSubmitting = true;
        const count = selectedCount();
        const ids = selectedIds();
        const status = button.getAttribute('data-bulk-status') || '';
        const isDelete = button.getAttribute('data-bulk-delete') === 'true';
        const label = button.getAttribute('data-bulk-label') || (isDelete ? 'Delete Selected' : 'Update Selected');
        const isFinalize = label === 'Write Off Selected';

        button.setAttribute('data-original-label', button.textContent || label);
        button.textContent = isDelete ? 'Deleting…' : isFinalize ? 'Finalizing…' : 'Updating…';
        const pendingMessage = isDelete
          ? 'Deleting ' + count + ' selected item(s)…'
          : isFinalize
            ? 'Writing off ' + count + ' selected item(s)…'
            : status === 'giveaway'
              ? 'Marking ' + count + ' selected item(s) as giveaways…'
              : 'Updating ' + count + ' selected item(s)…';

        const pendingDetail = isDelete
          ? 'HITS is hiding the selected correction rows and recording the inventory audit trail. A restore point will be picked up by the scheduled backup process.'
          : isFinalize
            ? 'HITS is removing the selected item(s) from inventory and recording the tax write-off audit trail. A restore point will be picked up by the scheduled backup process.'
            : status === 'giveaway'
              ? 'HITS is recording the giveaway details, marketing expense support, and inventory audit trail. A restore point will be picked up by the scheduled backup process.'
              : 'HITS is updating the selected inventory status and recording the audit trail. A restore point will be picked up by the scheduled backup process.';

        showPendingMessage(pendingMessage, pendingDetail);
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

        if (toggle && toggle.getAttribute('data-bulk-giveaway-toggle') === 'true' && selectedCount() === 1) {
          event.preventDefault();
          event.stopPropagation();
          const id = selectedIds()[0];
          if (id) {
            window.location.href = '/app/inventory/' + encodeURIComponent(id) + '/giveaway';
          }
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
          event.preventDefault();
          replaceSelectionWithVisibleCheckedRows();

          if (selectedCount() === 0) {
            updateBulkState();
            return;
          }

          rememberScrollPosition();
          setSubmitting(finalizeButton);
          submitAfterOverlay(finalizeButton);
          return;
        }

        const nativeDeleteSubmitButton = event.target && event.target.closest ? event.target.closest('[data-bulk-native-delete-submit="true"]') : null;
        if (nativeDeleteSubmitButton) {
          event.preventDefault();

          if (selectedCount() === 0 || isBulkSubmitting) {
            updateBulkState();
            return;
          }

          selectedIdsSet = new Set(selectedIds());
          syncStoredInputs();
          rememberScrollPosition();
          setSubmitting(nativeDeleteSubmitButton);
          submitAfterOverlay(nativeDeleteSubmitButton);
          return;
        }

        const submitButton = event.target && event.target.closest ? event.target.closest('[data-bulk-submit="true"]') : null;
        if (submitButton) {
          event.preventDefault();

          if (selectedCount() === 0 || isBulkSubmitting) {
            updateBulkState();
            return;
          }

          selectedIdsSet = new Set(selectedIds());
          syncStoredInputs();
          setBulkStatus(submitButton.getAttribute('data-bulk-status') || '');
          rememberScrollPosition();
          setSubmitting(submitButton);
          submitAfterOverlay(submitButton);
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



function buildInventoryContinueHref({
  q,
  sort,
  dir,
  page,
  limit,
  scrollY,
}: {
  q?: string
  sort: SortKey
  dir: SortDir
  page: number
  limit: number
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

  if (scrollY) {
    params.set('scroll_y', scrollY)
  }

  return `/app/inventory?${params.toString()}#inventory-status`
}

function buildSuccessOverlayCopy({
  saved,
  deletedCount,
  statusUpdated,
}: {
  saved: string
  deletedCount: string
  statusUpdated: string
}) {
  if (deletedCount) {
    return {
      title: 'Delete Complete',
      body: `Deleted ${deletedCount} successfully. The inventory audit trail was updated and backup processing was queued.`,
    }
  }

  if (statusUpdated) {
    const normalized = statusUpdated.toLowerCase()

    if (normalized.includes('written off')) {
      return {
        title: 'Write Off Complete',
        body: `Updated ${statusUpdated} successfully. The tax audit trail was recorded and backup processing was queued.`,
      }
    }

    if (normalized.includes('giveaway')) {
      return {
        title: 'Giveaway Complete',
        body: `Updated ${statusUpdated} successfully. Marketing expense support, inventory history, and backup processing were updated.`,
      }
    }

    return {
      title: 'Update Complete',
      body: `Updated ${statusUpdated} successfully. The inventory audit trail was updated and backup processing was queued.`,
    }
  }

  if (saved === '1') {
    return {
      title: 'Sale Complete',
      body: 'Quick sale recorded, inventory updated, and tax tracking kept in sync.',
    }
  }

  return null
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
          ? 'Showing written-off inventory items locked for tax review.'
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
      status === 'sold' ||
      status === 'giveaway' ||
      status === 'disposed' ||
      status === 'personal' ||
      status === 'junk'
        ? Number(item.quantity ?? 0)
        : Number(item.available_quantity ?? item.quantity ?? 0)

    statusSummaries[status].quantity += quantity
    statusSummaries[status].cost += remainingCostBasis(item)
    statusSummaries[status].value += Number(item.estimated_value_total ?? 0)
  }

  const hasPreviousPage = page > 1
  const hasNextPage = items.length === limit
  const successOverlayCopy = buildSuccessOverlayCopy({ saved, deletedCount, statusUpdated })
  const successContinueHref = buildInventoryContinueHref({
    q,
    sort: sortKey,
    dir: sortDir,
    page,
    limit,
    scrollY,
  })

  return (
    <div className="app-page-wide flex h-[calc(100vh-6.5rem)] flex-col gap-2 overflow-hidden">
      <div
        id={BULK_PENDING_OVERLAY_ID}
        className="fixed inset-0 z-[9999] hidden items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
        aria-live="assertive"
        aria-modal="true"
        role="alertdialog"
      >
        <div className="w-full max-w-md rounded-2xl border border-sky-900/60 bg-zinc-950 p-5 text-center shadow-2xl shadow-black/60">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
          <div data-bulk-overlay-title="true" className="mt-4 text-base font-semibold text-zinc-100">
            Updating selected items…
          </div>
          <div data-bulk-overlay-body="true" className="mt-2 text-sm leading-relaxed text-zinc-400">
            Please wait while HITS updates the selected inventory records.
          </div>
          <div className="mt-3 rounded-xl border border-amber-900/60 bg-amber-950/30 p-3 text-xs leading-relaxed text-amber-100">
            Do not close this page or click back while the update is finishing.
          </div>
        </div>
      </div>

      {successOverlayCopy ? (
        <div
          id={BULK_SUCCESS_OVERLAY_ID}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          aria-live="assertive"
          aria-modal="true"
          role="alertdialog"
        >
          <div className="w-full max-w-md rounded-2xl border border-emerald-900/60 bg-zinc-950 p-5 text-center shadow-2xl shadow-black/60">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-700 bg-emerald-950/50 text-2xl text-emerald-200">
              ✓
            </div>
            <div className="mt-4 text-lg font-semibold text-zinc-100">
              {successOverlayCopy.title}
            </div>
            <div className="mt-2 text-sm leading-relaxed text-zinc-300">
              {successOverlayCopy.body}
            </div>
            <Link href={successContinueHref} className="app-button-primary mt-4 inline-flex">
              Continue
            </Link>
          </div>
        </div>
      ) : null}
      <div className="app-page-header gap-3">
        <div className="min-w-0">
          <h1 className="app-title">Inventory</h1>
          <p className="app-subtitle">{pageDescription}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/inventory/new" className="app-button-primary">
            Add Inventory
          </Link>

          <Link href="/app/inventory/import" className="app-button">
            Add Inventory in Bulk
          </Link>
        </div>
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

      <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-7">
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
                  const hasAvailable =
                    available > 0 &&
                    item.status !== 'sold' &&
                    item.status !== 'disposed' &&
                    item.status !== 'personal' &&
                    item.status !== 'junk' &&
                    item.status !== 'giveaway'
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

                          {item.status === 'giveaway' ? (
                            <span
                              className="rounded-full border border-purple-900/60 bg-purple-950/30 px-2.5 py-1 text-xs font-medium text-purple-200"
                              title="Giveaway records are locked to preserve tax support."
                            >
                              Locked
                            </span>
                          ) : !isFinalizedDisposal ? (
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