import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SelectAllCheckbox from './SelectAllCheckbox'
import CancelDetailsButton from './CancelDetailsButton'
import BulkEbayDraftExportButton from '../inventory/BulkEbayDraftExportButton'
import StickyBulkActions from './StickyBulkActions'
import { updateInventoryBulkStatusShared, updateInventoryProcessingStatusShared } from '@/app/actions/inventory-bulk'

type WhatnotOrderRow = {
  id: string
  break_id: string | null
  order_id: string | null
  order_numeric_id: string | null
  buyer: string | null
  seller: string | null
  product_name: string | null
  processed_date: string | null
  processed_date_display: string | null
  order_status: string | null
  quantity: number | null
  subtotal: number | null
  shipping_price: number | null
  taxes: number | null
  total: number | null
  source_file_name: string | null
}

type BreakRow = {
  id: string
  break_date: string
  source_name: string | null
  order_number: string | null
  product_name: string | null
  format_type: string | null
  notes: string | null
  total_cost: number | null
  reversed_at: string | null
}

type InventoryItemRow = {
  id: string
  source_break_id: string | null
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
  cost_basis_total: number | null
  estimated_value_total: number | null
  status: string | null
  item_type: string | null
  notes: string | null
  source_type: string | null
  ebay_exported_at?: string | null
  processing_status?: string | null
}

type SaleInventoryItemRow = {
  id: string
  source_break_id: string | null
  title: string | null
  player_name: string | null
  year: number | null
  brand: string | null
  set_name: string | null
  card_number: string | null
  parallel_name: string | null
  team: string | null
  status: string | null
  item_type: string | null
  notes: string | null
}

type SaleSearchRow = {
  id: string
  sale_date: string | null
  quantity_sold: number | null
  gross_sale: number | null
  platform_fees: number | null
  shipping_cost: number | null
  other_costs: number | null
  net_proceeds: number | null
  cost_of_goods_sold: number | null
  profit: number | null
  platform: string | null
  notes: string | null
  reversed_at: string | null
  inventory_item_id: string | null
  inventory_items?: SaleInventoryItemRow | null
}

const SECTION_LIMIT = 50
const SEARCH_PAGE_SIZE = 500

async function fetchAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>) {
  const rows: T[] = []
  let from = 0

  while (true) {
    const to = from + SEARCH_PAGE_SIZE - 1
    const response = await fetchPage(from, to)

    if (response.error) {
      return { data: rows, error: response.error }
    }

    const page = response.data ?? []
    rows.push(...page)

    if (page.length < SEARCH_PAGE_SIZE) break
    from += SEARCH_PAGE_SIZE
  }

  return { data: rows, error: null }
}

type InventoryStatusFilter =
  | 'available'
  | 'partially_sold'
  | 'ebay'
  | 'listed'
  | 'sold'
  | 'personal'
  | 'junk'
  | 'put_away'
  | 'disposed'
  | 'giveaway'

const INVENTORY_STATUS_LABELS: Record<InventoryStatusFilter, string> = {
  available: 'Available',
  partially_sold: 'Partially Sold',
  ebay: 'eBay',
  listed: 'Listed',
  sold: 'Sold',
  personal: 'Personal',
  junk: 'Junk',
  put_away: 'Put Away',
  disposed: 'Written Off',
  giveaway: 'Giveaway',
}

const INVENTORY_STATUS_FILTERS: InventoryStatusFilter[] = [
  'available',
  'partially_sold',
  'ebay',
  'listed',
  'sold',
  'personal',
  'junk',
  'put_away',
  'disposed',
  'giveaway',
]

const BULK_ORDERS_FORM_ID = 'bulk-delete-orders-form'
const BULK_BREAKS_FORM_ID = 'bulk-delete-breaks-form'
const BULK_INVENTORY_FORM_ID = 'bulk-delete-inventory-form'

type SearchBulkInventoryStatus = 'available' | 'listed' | 'personal' | 'junk'

function searchBulkStatusLabel(status: SearchBulkInventoryStatus) {
  if (status === 'available') return 'For Sale'
  if (status === 'listed') return 'Listed'
  if (status === 'personal') return 'Personal'
  if (status === 'junk') return 'Junk'
  return status
}

function labelFromSearchBulkValue(value: string) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function buildSearchGiveawayExpenseCategory(giveawayTypeLabel: string) {
  return `Advertising / Marketing - Giveaway - ${giveawayTypeLabel || 'Giveaway'}`
}


function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function buildFocusHref(order: WhatnotOrderRow) {
  const params = new URLSearchParams()

  if (order.id) params.set('row_id', order.id)
  if (order.order_numeric_id) params.set('order_numeric_id', order.order_numeric_id)
  if (order.order_id) params.set('order_id', order.order_id)

  return `/app/whatnot-orders/focus?${params.toString()}`
}

function buildSearchRedirect(q: string, statusKey: string, statusValue: string) {
  const params = new URLSearchParams()

  if (q.trim()) params.set('q', q.trim())
  params.set(statusKey, statusValue)

  return `/app/search?${params.toString()}#search-status`
}

function normalizeInventoryStatusFilter(value: string | null | undefined): InventoryStatusFilter | null {
  const normalized = String(value ?? '').trim().toLowerCase()

  return INVENTORY_STATUS_FILTERS.includes(normalized as InventoryStatusFilter)
    ? (normalized as InventoryStatusFilter)
    : null
}

function buildSearchInventoryStatusHref(q: string, status: InventoryStatusFilter | '') {
  const params = new URLSearchParams()

  if (q.trim()) params.set('q', q.trim())
  if (status) params.set('inventory_status', status)

  const query = params.toString()
  return query ? `/app/search?${query}#matching-inventory-items` : '/app/search'
}

function readFormIds(formData: FormData, fieldName: string) {
  return formData
    .getAll(fieldName)
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
}

async function deleteOrderAction(formData: FormData) {
  'use server'

  const orderId = String(formData.get('order_id') ?? '').trim()
  const isLinked = String(formData.get('is_linked') ?? '') === '1'
  const q = String(formData.get('q') ?? '').trim()

  if (!orderId) {
    redirect(buildSearchRedirect(q, 'delete_error', 'Missing order ID.'))
  }

  if (isLinked) {
    redirect(
      buildSearchRedirect(
        q,
        'delete_error',
        'This order is linked to a break. Roll back or unlink the break first, then delete the order.'
      )
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
    .from('whatnot_orders')
    .delete()
    .eq('id', orderId)
    .eq('user_id', user.id)
    .is('break_id', null)

  if (error) {
    redirect(buildSearchRedirect(q, 'delete_error', error.message))
  }

  revalidatePath('/app/search')
  revalidatePath('/app/whatnot-orders')
  revalidatePath('/app/breaks')

  redirect(buildSearchRedirect(q, 'deleted', 'order'))
}

async function deleteInventoryItemAction(formData: FormData) {
  'use server'

  const itemId = String(formData.get('item_id') ?? '').trim()
  const q = String(formData.get('q') ?? '').trim()

  if (!itemId) {
    redirect(buildSearchRedirect(q, 'delete_error', 'Missing inventory item ID.'))
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', itemId)
    .eq('user_id', user.id)

  if (error) {
    redirect(buildSearchRedirect(q, 'delete_error', error.message))
  }

  revalidatePath('/app/search')
  revalidatePath('/app/inventory')
  revalidatePath('/app/breaks')

  redirect(buildSearchRedirect(q, 'deleted', 'inventory'))
}

async function deleteBreakAction(formData: FormData) {
  'use server'

  const breakId = String(formData.get('break_id') ?? '').trim()
  const q = String(formData.get('q') ?? '').trim()

  if (!breakId) {
    redirect(buildSearchRedirect(q, 'delete_error', 'Missing break ID.'))
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase
    .from('breaks')
    .delete()
    .eq('id', breakId)
    .eq('user_id', user.id)

  if (error) {
    redirect(buildSearchRedirect(q, 'delete_error', error.message))
  }

  revalidatePath('/app/search')
  revalidatePath('/app/breaks')
  revalidatePath('/app/inventory')
  revalidatePath('/app/whatnot-orders')

  redirect(buildSearchRedirect(q, 'deleted', 'break'))
}

async function bulkDeleteOrdersAction(formData: FormData) {
  'use server'

  const orderIds = readFormIds(formData, 'selected_order_ids')
  const q = String(formData.get('q') ?? '').trim()

  if (orderIds.length === 0) {
    redirect(buildSearchRedirect(q, 'delete_error', 'Select at least one unassigned order to delete.'))
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase
    .from('whatnot_orders')
    .delete()
    .eq('user_id', user.id)
    .is('break_id', null)
    .in('id', orderIds)

  if (error) {
    redirect(buildSearchRedirect(q, 'delete_error', error.message))
  }

  revalidatePath('/app/search')
  revalidatePath('/app/whatnot-orders')
  revalidatePath('/app/breaks')

  redirect(buildSearchRedirect(q, 'deleted_count', `${orderIds.length} unassigned order(s)`))
}

async function bulkCombineOrdersAction(formData: FormData) {
  'use server'

  const orderIds = readFormIds(formData, 'selected_order_ids')
  const q = String(formData.get('q') ?? '').trim()

  if (orderIds.length === 0) {
    redirect(buildSearchRedirect(q, 'combine_error', 'Select at least one unassigned order to combine.'))
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const uniqueOrderIds = Array.from(new Set(orderIds))

  const { data: selectedOrders, error: selectedOrdersError } = await supabase
    .from('whatnot_orders')
    .select(`
      id,
      break_id,
      seller
    `)
    .eq('user_id', user.id)
    .in('id', uniqueOrderIds)

  const orders = (selectedOrders ?? []) as WhatnotOrderRow[]

  if (selectedOrdersError || orders.length !== uniqueOrderIds.length) {
    redirect(
      buildSearchRedirect(
        q,
        'combine_error',
        selectedOrdersError?.message || 'Could not load all selected orders.'
      )
    )
  }

  const linkedOrders = orders.filter((order) => Boolean(order.break_id))
  if (linkedOrders.length > 0) {
    redirect(
      buildSearchRedirect(
        q,
        'combine_error',
        'One or more selected orders are already linked to a break. Open that break or roll it back first.'
      )
    )
  }

  const sellers = Array.from(
    new Set(
      orders
        .map((order) => cleanText(order.seller || ''))
        .filter(Boolean)
    )
  )

  if (sellers.length > 1) {
    redirect(
      buildSearchRedirect(
        q,
        'combine_error',
        'Please combine orders from only one seller at a time.'
      )
    )
  }

  redirect(`/app/breaks/new?whatnot_order_ids=${encodeURIComponent(uniqueOrderIds.join(','))}`)
}

async function bulkDeleteInventoryItemsAction(formData: FormData) {
  'use server'

  const itemIds = readFormIds(formData, 'selected_inventory_ids')
  const q = String(formData.get('q') ?? '').trim()

  if (itemIds.length === 0) {
    redirect(buildSearchRedirect(q, 'delete_error', 'Select at least one inventory item to delete.'))
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('user_id', user.id)
    .in('id', itemIds)

  if (error) {
    redirect(buildSearchRedirect(q, 'delete_error', error.message))
  }

  revalidatePath('/app/search')
  revalidatePath('/app/inventory')
  revalidatePath('/app/breaks')

  redirect(buildSearchRedirect(q, 'deleted_count', `${itemIds.length} inventory item(s)`))
}



async function bulkMarkSearchInventoryForSaleAction(formData: FormData) {
  'use server'
  formData.set('bulk_status', 'available')
  await bulkUpdateSearchInventoryStatusAction(formData)
}

async function bulkMarkSearchInventoryListedAction(formData: FormData) {
  'use server'
  formData.set('bulk_status', 'listed')
  await bulkUpdateSearchInventoryStatusAction(formData)
}

async function bulkMoveSearchInventoryPersonalAction(formData: FormData) {
  'use server'
  formData.set('bulk_status', 'personal')
  await bulkUpdateSearchInventoryStatusAction(formData)
}

async function bulkMarkSearchInventoryJunkAction(formData: FormData) {
  'use server'
  formData.set('bulk_status', 'junk')
  await bulkUpdateSearchInventoryStatusAction(formData)
}

async function bulkUpdateSearchInventoryStatusAction(formData: FormData) {
  'use server'

  const itemIds = Array.from(new Set(readFormIds(formData, 'selected_inventory_ids')))
  const q = String(formData.get('q') ?? '').trim()
  const requestedStatus = String(formData.get('bulk_status') ?? '').trim() as SearchBulkInventoryStatus
  const allowedStatuses: SearchBulkInventoryStatus[] = ['available', 'listed', 'personal', 'junk']

  if (!allowedStatuses.includes(requestedStatus)) {
    redirect(buildSearchRedirect(q, 'status_error', 'Choose a valid bulk inventory status.'))
  }

  const result = await updateInventoryBulkStatusShared({
    itemIds,
    requestedStatus,
  })

  if (!result.ok) {
    if (result.code === 'not_authenticated') {
      redirect('/login')
    }

    redirect(buildSearchRedirect(q, 'status_error', result.error))
  }

  revalidatePath('/app/search')
  revalidatePath('/app/inventory')
  revalidatePath('/app/breaks')
  revalidatePath('/app/reports/tax')

  redirect(
    buildSearchRedirect(
      q,
      'status_updated',
      `${result.updatedCount} item(s) marked ${searchBulkStatusLabel(requestedStatus)}`
    )
  )
}

async function bulkMarkSearchInventoryPutAwayAction(formData: FormData) {
  'use server'

  const itemIds = Array.from(new Set(readFormIds(formData, 'selected_inventory_ids')))
  const q = String(formData.get('q') ?? '').trim()

  const result = await updateInventoryProcessingStatusShared({
    itemIds,
    processingStatus: 'put_away',
  })

  if (!result.ok) {
    if (result.code === 'not_authenticated') {
      redirect('/login')
    }

    redirect(buildSearchRedirect(q, 'status_error', result.error))
  }

  revalidatePath('/app/search')
  revalidatePath('/app/inventory')
  revalidatePath('/app/breaks')

  redirect(
    buildSearchRedirect(
      q,
      'status_updated',
      `${result.updatedCount} item(s) marked Put Away`
    )
  )
}

async function bulkFinalizeSearchGiveawayAction(formData: FormData) {
  'use server'

  const itemIds = Array.from(new Set(readFormIds(formData, 'selected_inventory_ids')))
  const q = String(formData.get('q') ?? '').trim()
  const giveawayType = String(formData.get('giveaway_type') ?? '').trim()
  const businessPurpose = String(formData.get('business_purpose') ?? '').trim()
  const recipientType = String(formData.get('recipient_type') ?? '').trim()
  const campaignEvent = String(formData.get('campaign_event') ?? '').trim()
  const relatedOrderSale = String(formData.get('related_order_sale') ?? '').trim()
  const giveawayNotes = String(formData.get('giveaway_notes') ?? '').trim()
  const eventDate = String(formData.get('event_date') ?? '').trim() || new Date().toISOString().slice(0, 10)

  if (itemIds.length === 0) {
    redirect(buildSearchRedirect(q, 'status_error', 'Select at least one inventory item to mark as a giveaway.'))
  }

  if (!giveawayType || !businessPurpose) {
    redirect(buildSearchRedirect(q, 'status_error', 'Giveaway Type and Business Purpose are required for bulk giveaways.'))
  }

  if ((giveawayType === 'other' || businessPurpose === 'other') && !giveawayNotes) {
    redirect(buildSearchRedirect(q, 'status_error', 'Notes are required when Giveaway Type or Business Purpose is Other.'))
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: activeSales, error: salesError } = await supabase
    .from('sales')
    .select('id, inventory_item_id')
    .eq('user_id', user.id)
    .is('reversed_at', null)
    .in('inventory_item_id', itemIds)

  if (salesError) redirect(buildSearchRedirect(q, 'status_error', salesError.message))
  if ((activeSales ?? []).length > 0) {
    redirect(buildSearchRedirect(q, 'status_error', 'One or more selected items have active sales. Reverse the sale first so COGS and inventory stay audit-safe.'))
  }

  const { data: existingItems, error: loadError } = await supabase
    .from('inventory_items')
    .select('id, title, status, quantity, available_quantity, cost_basis_unit, cost_basis_total')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', itemIds)

  if (loadError) redirect(buildSearchRedirect(q, 'status_error', loadError.message))

  const items = existingItems ?? []
  if (items.length === 0) {
    redirect(buildSearchRedirect(q, 'status_error', 'No matching active inventory items were found. Refresh the search and select the rows again.'))
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

  if (updateError) redirect(buildSearchRedirect(q, 'status_error', updateError.message))

  const giveawayTypeLabel = labelFromSearchBulkValue(giveawayType)
  const businessPurposeLabel = labelFromSearchBulkValue(businessPurpose)
  const recipientTypeLabel = recipientType ? labelFromSearchBulkValue(recipientType) : ''
  const expenseCategory = buildSearchGiveawayExpenseCategory(giveawayTypeLabel)

  const rows = items.map((item) => {
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
    const sharedAuditNote = `Bulk giveaway recorded from Search for advertising / marketing support. Item: ${itemTitle}. Quantity given away: ${quantityRemoved}. Cost basis recorded: ${money(amount)}. Previous status: ${previousStatus}. ${detailParts.join(' ')}`

    return { item, amount, quantityRemoved, sharedAuditNote }
  })

  const { error: expenseError } = await supabase.from('expenses').insert(
    rows.map((row) => ({
      user_id: user.id,
      expense_date: eventDate,
      category: expenseCategory,
      amount: row.amount,
      notes: row.sharedAuditNote,
    }))
  )
  if (expenseError) redirect(buildSearchRedirect(q, 'status_error', expenseError.message))

  const { error: transactionError } = await supabase.from('inventory_transactions').insert(
    rows.map((row) => ({
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
  )
  if (transactionError) redirect(buildSearchRedirect(q, 'status_error', transactionError.message))

  revalidatePath('/app/search')
  revalidatePath('/app/inventory')
  revalidatePath('/app/expenses')
  revalidatePath('/app/reports/tax')
  revalidatePath('/app/reports/profit-loss')

  redirect(buildSearchRedirect(q, 'status_updated', `${items.length} item(s) marked Giveaway with tax details`))
}

async function bulkFinalizeSearchWriteOffAction(formData: FormData) {
  'use server'

  const itemIds = Array.from(new Set(readFormIds(formData, 'selected_inventory_ids')))
  const q = String(formData.get('q') ?? '').trim()
  const disposalReason = String(formData.get('disposal_reason') ?? '').trim()
  const disposalNotes = String(formData.get('disposal_notes') ?? '').trim()

  if (itemIds.length === 0) {
    redirect(buildSearchRedirect(q, 'status_error', 'Select at least one inventory item to write off.'))
  }

  if (!disposalReason) {
    redirect(buildSearchRedirect(q, 'status_error', 'Choose a write-off reason before writing off selected items.'))
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: activeSales, error: salesError } = await supabase
    .from('sales')
    .select('id, inventory_item_id')
    .eq('user_id', user.id)
    .is('reversed_at', null)
    .in('inventory_item_id', itemIds)

  if (salesError) redirect(buildSearchRedirect(q, 'status_error', salesError.message))
  if ((activeSales ?? []).length > 0) {
    redirect(buildSearchRedirect(q, 'status_error', 'One or more selected items have active sales. Reverse the sale first so COGS and inventory stay audit-safe.'))
  }

  const { data: existingItems, error: loadError } = await supabase
    .from('inventory_items')
    .select('id, title, status, quantity, available_quantity, cost_basis_total')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', itemIds)

  if (loadError) redirect(buildSearchRedirect(q, 'status_error', loadError.message))
  const items = existingItems ?? []
  if (items.length === 0) {
    redirect(buildSearchRedirect(q, 'status_error', 'No matching active inventory items were found to write off.'))
  }

  const finalizedAt = new Date().toISOString()

  const { error: updateError } = await supabase
    .from('inventory_items')
    .update({
      status: 'disposed',
      available_quantity: 0,
      updated_at: finalizedAt,
    })
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', items.map((item) => item.id))

  if (updateError) redirect(buildSearchRedirect(q, 'status_error', updateError.message))

  const { error: transactionError } = await supabase.from('inventory_transactions').insert(
    items.map((item) => {
      const itemTitle = item.title || 'Inventory item'
      const quantityRemoved = Number(item.available_quantity ?? item.quantity ?? 0)
      const costBasis = Number(item.cost_basis_total ?? 0)
      const previousStatus = String(item.status || 'unassigned').replaceAll('_', ' ')
      const trimmedNotes = disposalNotes || 'No extra notes entered.'

      return {
        user_id: user.id,
        inventory_item_id: item.id,
        transaction_type: 'disposal_writeoff_review',
        quantity_change: -Math.abs(quantityRemoved),
        disposal_reason: disposalReason,
        disposal_notes: disposalNotes || null,
        finalized_for_tax: true,
        notes: `Write-off finalized from Search: ${itemTitle} was removed from active business inventory and locked for year-end/accountant review. Previous status: ${previousStatus}. Disposal reason: ${disposalReason}. User notes: ${trimmedNotes}. Quantity removed: ${quantityRemoved}. Recorded cost basis at write-off: ${money(costBasis)}. Do not also deduct this item as an expense, giveaway, donation, or separate loss without accountant review.`,
        created_at: finalizedAt,
      }
    })
  )

  if (transactionError) redirect(buildSearchRedirect(q, 'status_error', transactionError.message))

  revalidatePath('/app/search')
  revalidatePath('/app/inventory')
  revalidatePath('/app/reports/tax')
  revalidatePath('/app/reports/tax/summary')

  redirect(buildSearchRedirect(q, 'status_updated', `${items.length} item(s) written off and removed from inventory`))
}

async function bulkDeleteBreaksAction(formData: FormData) {
  'use server'

  const breakIds = readFormIds(formData, 'selected_break_ids')
  const q = String(formData.get('q') ?? '').trim()

  if (breakIds.length === 0) {
    redirect(buildSearchRedirect(q, 'delete_error', 'Select at least one break to delete.'))
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase
    .from('breaks')
    .delete()
    .eq('user_id', user.id)
    .in('id', breakIds)

  if (error) {
    redirect(buildSearchRedirect(q, 'delete_error', error.message))
  }

  revalidatePath('/app/search')
  revalidatePath('/app/breaks')
  revalidatePath('/app/inventory')
  revalidatePath('/app/whatnot-orders')

  redirect(buildSearchRedirect(q, 'deleted_count', `${breakIds.length} break(s)`))
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, '')
}

type SearchFilters = {
  status: string[]
  team: string[]
  year: string[]
  brand: string[]
  set: string[]
  player: string[]
  type: string[]
  platform: string[]
  seller: string[]
  order: string[]
  source: string[]
  notes: string[]
}

const EMPTY_SEARCH_FILTERS: SearchFilters = {
  status: [],
  team: [],
  year: [],
  brand: [],
  set: [],
  player: [],
  type: [],
  platform: [],
  seller: [],
  order: [],
  source: [],
  notes: [],
}

const SEARCH_OPERATOR_ALIASES: Record<string, keyof SearchFilters> = {
  status: 'status',
  st: 'status',
  team: 'team',
  tm: 'team',
  year: 'year',
  yr: 'year',
  brand: 'brand',
  product: 'brand',
  set: 'set',
  player: 'player',
  name: 'player',
  item: 'player',
  type: 'type',
  itemtype: 'type',
  platform: 'platform',
  saleplatform: 'platform',
  seller: 'seller',
  source: 'source',
  breaker: 'source',
  order: 'order',
  ordernumber: 'order',
  orderno: 'order',
  notes: 'notes',
  note: 'notes',
}

function normalizeSearchText(value: string | number | null | undefined) {
  return cleanText(String(value ?? ''))
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSearchValue(value: string | number | null | undefined) {
  return escapeLike(normalizeSearchText(value))
}

function buildSearchTokens(value: string) {
  return Array.from(
    new Set(
      normalizeSearchText(value)
        .split(' ')
        .map((token) => escapeLike(token.trim()))
        .filter((token) => token.length >= 2)
    )
  ).slice(0, 10)
}

function parseSearchQuery(raw: string) {
  const filters: SearchFilters = {
    status: [],
    team: [],
    year: [],
    brand: [],
    set: [],
    player: [],
    type: [],
    platform: [],
    seller: [],
    order: [],
    source: [],
    notes: [],
  }

  const remainingParts: string[] = []
  const operatorPattern = /(\b[a-zA-Z][a-zA-Z0-9_-]{1,20}):(?:"([^"]+)"|'([^']+)'|([^\s]+))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = operatorPattern.exec(raw)) !== null) {
    remainingParts.push(raw.slice(lastIndex, match.index))
    lastIndex = operatorPattern.lastIndex

    const rawKey = normalizeSearchValue(match[1]).replace(/[^a-z0-9]/g, '')
    const key = SEARCH_OPERATOR_ALIASES[rawKey]
    const value = cleanText(match[2] || match[3] || match[4] || '')

    if (key && value) {
      filters[key].push(value)
    } else {
      remainingParts.push(match[0])
    }
  }

  remainingParts.push(raw.slice(lastIndex))

  const freeText = cleanText(remainingParts.join(' '))
  const filterText = Object.values(filters).flat().join(' ')
  const hasFilters = Object.values(filters).some((values) => values.length > 0)

  return {
    freeText,
    filters,
    hasFilters,
    searchTextForMatching: cleanText([freeText, filterText].filter(Boolean).join(' ')),
  }
}

function buildTokenVariants(token: string) {
  const variants = new Set<string>([token])

  if (token.endsWith('s') && token.length > 3) variants.add(token.slice(0, -1))
  if (!token.endsWith('s') && token.length > 3) variants.add(`${token}s`)

  const aliases: Record<string, string[]> = {
    auto: ['autograph'],
    autograph: ['auto'],
    rc: ['rookie'],
    rookie: ['rc'],
    refractor: ['refr'],
    refr: ['refractor'],
    jr: ['junior'],
    junior: ['jr'],
    mariner: ['mariners'],
    mariners: ['mariner'],
    yankee: ['yankees'],
    yankees: ['yankee'],
    dodger: ['dodgers'],
    dodgers: ['dodger'],
  }

  for (const alias of aliases[token] ?? []) variants.add(alias)

  return Array.from(variants)
}

function buildTokenOrFilters(fields: string[], tokens: string[]) {
  return tokens.flatMap((token) =>
    buildTokenVariants(token).flatMap((variant) =>
      fields.map((field) => `${field}.ilike.%${variant}%`)
    )
  )
}

function buildYearOrFilters(tokens: string[]) {
  return Array.from(new Set(tokens))
    .filter((token) => /^\d{4}$/.test(token))
    .map((token) => `year.eq.${token}`)
}

function buildSearchableText(values: Array<string | number | null | undefined>) {
  return normalizeSearchText(values.map((value) => String(value ?? '')).join(' '))
}

function tokenMatchesSearchableText(searchableText: string, token: string) {
  return buildTokenVariants(token).some((variant) => searchableText.includes(variant))
}

function matchesAllSearchTokens(searchableText: string, tokens: string[]) {
  if (tokens.length === 0) return true
  return tokens.every((token) => tokenMatchesSearchableText(searchableText, token))
}

function tokenMatchScore(searchableText: string, tokens: string[]) {
  if (tokens.length === 0) return 0

  return tokens.reduce((score, token) => {
    let bestScore = 0

    for (const variant of buildTokenVariants(token)) {
      if (searchableText.includes(` ${variant} `)) bestScore = Math.max(bestScore, variant === token ? 6 : 4)
      else if (searchableText.includes(variant)) bestScore = Math.max(bestScore, variant === token ? 3 : 2)
    }

    return score + bestScore
  }, 0)
}

function filterTextMatches(value: string | number | null | undefined, expectedValues: string[]) {
  if (expectedValues.length === 0) return true

  const searchableText = ` ${normalizeSearchText(value)} `

  return expectedValues.some((expected) => {
    const tokens = buildSearchTokens(expected)
    return tokens.length === 0 || matchesAllSearchTokens(searchableText, tokens)
  })
}

function filterNumberMatches(value: string | number | null | undefined, expectedValues: string[]) {
  if (expectedValues.length === 0) return true
  const normalizedValue = normalizeSearchValue(value)
  return expectedValues.some((expected) => normalizeSearchValue(expected) === normalizedValue)
}

function matchesInventoryFilters(item: InventoryItemRow, filters: SearchFilters) {
  return (
    filterTextMatches(item.status, filters.status) &&
    filterTextMatches(item.team, filters.team) &&
    filterNumberMatches(item.year, filters.year) &&
    filterTextMatches(item.brand, filters.brand) &&
    filterTextMatches(item.set_name, filters.set) &&
    filterTextMatches([item.player_name, item.title].filter(Boolean).join(' '), filters.player) &&
    filterTextMatches(item.item_type, filters.type) &&
    filterTextMatches(item.notes, filters.notes)
  )
}

function isSearchPartiallySoldItem(item: InventoryItemRow) {
  const quantity = Number(item.quantity ?? 0)
  const available = Number(item.available_quantity ?? 0)

  return item.status === 'available' && quantity > 0 && available > 0 && available < quantity
}

function matchesInventoryStatusFilter(item: InventoryItemRow, status: InventoryStatusFilter | null) {
  if (!status) return true
  if (status === 'partially_sold') return isSearchPartiallySoldItem(item)

  if (status === 'ebay') {
    return Boolean(item.ebay_exported_at) && String(item.status ?? '').toLowerCase() !== 'listed'
  }

  if (status === 'put_away') {
    return String(item.processing_status ?? '').toLowerCase() === 'put_away'
  }

  return String(item.status ?? '').toLowerCase() === status
}

function matchesBreakFilters(breakRow: BreakRow, filters: SearchFilters) {
  return (
    filterTextMatches(breakRow.source_name, [...filters.source, ...filters.seller]) &&
    filterTextMatches(breakRow.order_number, filters.order) &&
    filterTextMatches(breakRow.product_name, [...filters.brand, ...filters.set]) &&
    filterTextMatches(breakRow.notes, filters.notes)
  )
}

function matchesOrderFilters(order: WhatnotOrderRow, filters: SearchFilters) {
  return (
    filterTextMatches(order.seller, [...filters.seller, ...filters.source]) &&
    filterTextMatches([order.order_id, order.order_numeric_id].filter(Boolean).join(' '), filters.order) &&
    filterTextMatches(order.product_name, [...filters.brand, ...filters.set]) &&
    filterTextMatches(order.order_status, filters.status)
  )
}

function matchesSaleFilters(sale: SaleSearchRow, filters: SearchFilters) {
  return (
    filterTextMatches(sale.platform, filters.platform) &&
    filterTextMatches(sale.notes, filters.notes) &&
    (!sale.inventory_items || matchesInventoryFilters(sale.inventory_items as InventoryItemRow, filters))
  )
}

function filterAndRankByTokens<T>({
  rows,
  tokens,
  getSearchableText,
  getExactBoostText,
}: {
  rows: T[]
  tokens: string[]
  getSearchableText: (row: T) => string
  getExactBoostText?: (row: T) => string
}) {
  if (tokens.length === 0) return rows

  return rows
    .map((row) => {
      const searchableText = ` ${getSearchableText(row)} `
      const exactBoostText = getExactBoostText ? ` ${getExactBoostText(row)} ` : searchableText
      const phraseBoost = tokens.length > 1 && exactBoostText.includes(` ${tokens.join(' ')} `) ? 25 : 0

      return {
        row,
        searchableText,
        score: tokenMatchScore(searchableText, tokens) + phraseBoost,
      }
    })
    .filter((item) => matchesAllSearchTokens(item.searchableText, tokens))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.row)
}

function extractOrderNumbers(input: string): string[] {
  if (!input) return []

  const cleaned = input
    .replace(/order\s*id/gi, ' ')
    .replace(/order\s*date/gi, ' ')
    .replace(/sold\s*by/gi, ' ')
    .replace(/quantity/gi, ' ')
    .replace(/category/gi, ' ')
    .replace(/subtotal/gi, ' ')
    .replace(/shipping/gi, ' ')
    .replace(/tax(?:es)?/gi, ' ')
    .replace(/total/gi, ' ')
    .replace(/usd/gi, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^0-9\s]/g, ' ')

  const matches = cleaned.match(/\d{6,}/g) || []
  const unique = Array.from(new Set(matches))

  return unique
    .sort((a, b) => a.length - b.length)
    .slice(0, 25)
}

function cleanText(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  }).format(parsed)
}

function buildInventoryDisplay(item: InventoryItemRow) {
  const parts = [
    item.year,
    item.set_name,
    item.player_name || item.title,
    item.card_number ? `#${item.card_number}` : null,
    item.parallel_name,
    item.team,
  ]

  return parts.filter(Boolean).join(' • ')
}

function buildBreakDisplay(breakRow: BreakRow) {
  return cleanText(
    breakRow.product_name || breakRow.source_name || breakRow.order_number || 'Untitled break'
  )
}

function buildSoldItemDisplay(sale: SaleSearchRow) {
  const item = sale.inventory_items
  if (!item) return 'Untitled sold item'

  const parts = [
    item.year,
    item.set_name,
    item.player_name || item.title,
    item.card_number ? `#${item.card_number}` : null,
    item.parallel_name,
    item.team,
  ]

  return parts.filter(Boolean).join(' • ') || item.title || item.player_name || 'Untitled sold item'
}

function statusBadgeClasses(status: string | null | undefined) {
  const normalized = String(status ?? '').toLowerCase()

  if (normalized === 'linked' || normalized === 'complete' || normalized === 'sold') {
    return 'app-badge app-badge-success'
  }

  if (normalized === 'staging' || normalized === 'unassigned' || normalized === 'open') {
    return 'app-badge app-badge-warning'
  }

  if (
    normalized === 'active' ||
    normalized === 'in progress' ||
    normalized === 'personal' ||
    normalized === 'listed'
  ) {
    return 'app-badge app-badge-info'
  }

  if (normalized === 'reversed' || normalized === 'junk') {
    return 'app-badge app-badge-neutral'
  }

  return 'app-badge app-badge-neutral'
}

function SearchSummaryCard({
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

function NotesPreview({ value }: { value: string | null | undefined }) {
  const notes = cleanText(value || '')

  return (
    <div
      className="max-w-64 truncate text-xs leading-tight text-zinc-400"
      title={notes || 'No notes'}
    >
      {notes || '—'}
    </div>
  )
}

function ResultSection({
  id,
  title,
  subtitle,
  count,
  children,
}: {
  id?: string
  title: string
  subtitle: string
  count: number
  children: React.ReactNode
}) {
  const isInventorySection = id === 'matching-inventory-items'

  return (
    <div
      id={id}
      className={`app-section scroll-mt-28 ${isInventorySection ? 'overflow-visible' : ''}`}
      style={isInventorySection ? { overflow: 'visible' } : undefined}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-zinc-400">{subtitle}</p>
        </div>

        <div className="text-xs text-zinc-500">{count} hit(s)</div>
      </div>

      <div className="mt-4">{children}</div>
    </div>
  )
}

function DeleteConfirmControl({
  itemType,
  itemName,
  hiddenIdName,
  hiddenIdValue,
  q,
  action,
}: {
  itemType: 'inventory item' | 'break'
  itemName: string
  hiddenIdName: string
  hiddenIdValue: string
  q: string
  action: (formData: FormData) => Promise<void>
}) {
  return (
    <details className="group relative">
      <summary className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/30 text-red-200 hover:bg-red-900/40">
        Delete
      </summary>

      <div className="mt-2 min-w-64 rounded-xl border border-red-900/60 bg-zinc-950 p-3 shadow-xl">
        <div className="text-sm font-semibold text-red-200">Confirm delete?</div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">
          This will delete this {itemType}: <span className="text-zinc-200">{itemName}</span>
        </div>

        <form action={action} className="mt-3 flex flex-wrap gap-2">
          <input type="hidden" name={hiddenIdName} value={hiddenIdValue} />
          <input type="hidden" name="q" value={q} />

          <button
            type="submit"
            className="app-button whitespace-nowrap border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/50"
          >
            Yes, Delete
          </button>

          <CancelDetailsButton />
        </form>
      </div>
    </details>
  )
}

function DeleteOrderConfirmControl({
  orderId,
  orderLabel,
  isLinked,
  q,
}: {
  orderId: string
  orderLabel: string
  isLinked: boolean
  q: string
}) {
  if (isLinked) {
    return (
      <div className="max-w-47.5 whitespace-normal rounded-xl border border-amber-900/50 bg-amber-950/20 px-2 py-1 text-[11px] leading-snug text-amber-300">
        Linked order — roll back the break first.
      </div>
    )
  }

  return (
    <details className="group relative">
      <summary className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/30 text-red-200 hover:bg-red-900/40">
        Delete
      </summary>

      <div className="mt-2 min-w-64 rounded-xl border border-red-900/60 bg-zinc-950 p-3 shadow-xl">
        <div className="text-sm font-semibold text-red-200">Confirm delete?</div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">
          This will delete this unassigned order: <span className="text-zinc-200">{orderLabel}</span>
        </div>

        <form action={deleteOrderAction} className="mt-3 flex flex-wrap gap-2">
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="is_linked" value={isLinked ? '1' : '0'} />
          <input type="hidden" name="q" value={q} />

          <button
            type="submit"
            className="app-button whitespace-nowrap border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/50"
          >
            Yes, Delete
          </button>

          <CancelDetailsButton />
        </form>
      </div>
    </details>
  )
}

function BulkOrderActionsControl({
  formId,
}: {
  formId: string
}) {
  return (
    <div className="mb-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="sticky-bulk-info">
          <div className="text-sm font-semibold text-zinc-200">Bulk actions</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            Select unassigned orders, then combine them into one break or delete them.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <details className="group">
            <summary className="app-button cursor-pointer list-none whitespace-nowrap">
              Combine Selected
            </summary>

            <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3 shadow-xl md:min-w-80">
              <div className="text-sm font-semibold text-zinc-200">Create combined break?</div>
              <div className="mt-1 text-xs leading-relaxed text-zinc-400">
                This creates one order from the selected unassigned orders and sends you to the normal sorting tray / item entry page.
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  form={formId}
                  formAction={bulkCombineOrdersAction}
                  className="app-button-primary whitespace-nowrap"
                >
                  Yes, Combine Selected
                </button>

                <CancelDetailsButton />
              </div>
            </div>
          </details>

          <details className="group">
            <summary className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/30 text-red-200 hover:bg-red-900/40">
              Delete Selected
            </summary>

            <div className="mt-2 rounded-xl border border-red-900/60 bg-zinc-950 p-3 shadow-xl md:min-w-72">
              <div className="text-sm font-semibold text-red-200">Confirm bulk delete?</div>
              <div className="mt-1 text-xs leading-relaxed text-zinc-400">
                This will delete the selected unassigned orders. This cannot be undone from this screen.
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  form={formId}
                  className="app-button whitespace-nowrap border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/50"
                >
                  Yes, Delete Selected
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

function BulkDeleteConfirmControl({
  label,
  formId,
}: {
  label: string
  formId: string
}) {
  return (
    <div className="mb-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-zinc-200">Bulk actions</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            Check the rows you want to remove, then confirm below.
          </div>
        </div>

        <details className="group">
          <summary className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/30 text-red-200 hover:bg-red-900/40">
            Delete Selected
          </summary>

          <div className="mt-2 rounded-xl border border-red-900/60 bg-zinc-950 p-3 shadow-xl md:min-w-72">
            <div className="text-sm font-semibold text-red-200">Confirm bulk delete?</div>
            <div className="mt-1 text-xs leading-relaxed text-zinc-400">
              This will delete the selected {label}. This cannot be undone from this screen.
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="submit"
                form={formId}
                className="app-button whitespace-nowrap border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/50"
              >
                Yes, Delete Selected
              </button>

              <CancelDetailsButton />
            </div>
          </div>
        </details>
      </div>
    </div>
  )
}



function SearchInventoryDeleteConfirmControl() {
  return (
    <details className="group">
      <summary className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/30 text-red-200 hover:bg-red-900/40">
        Delete Selected
      </summary>

      <div className="mt-2 rounded-xl border border-red-900/60 bg-zinc-950 p-3 shadow-xl md:min-w-72">
        <div className="text-sm font-semibold text-red-200">Confirm bulk delete?</div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">
          This will delete the selected inventory items. Use delete only for correction cleanup, not for sales, personal withdrawals, giveaways, junk, donations, or write-offs.
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            form={BULK_INVENTORY_FORM_ID}
            formAction={bulkDeleteInventoryItemsAction}
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

function SearchInventoryBulkActions() {
  return (
    <>
      <StickyBulkActions targetId="search-inventory-bulk-actions" />
      <div
        id="search-inventory-bulk-actions"
        className="sticky-bulk-panel rounded-2xl border border-zinc-800 bg-zinc-950/95 p-3 shadow-2xl shadow-black/40 backdrop-blur [&.search-bulk-actions-floating_.sticky-bulk-info]:hidden [&.search-bulk-actions-floating]:rounded-xl [&.search-bulk-actions-floating]:p-2 [&.search-bulk-actions-floating]:shadow-lg"
      >
      <div className="flex flex-col gap-2">
        <div className="sticky-bulk-info">
          <div className="text-sm font-semibold text-zinc-200">Bulk actions</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            Select inventory search results, then use the same quick actions available on the main Inventory page.
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <button
            type="submit"
            form={BULK_INVENTORY_FORM_ID}
            formAction={bulkMarkSearchInventoryForSaleAction}
            className="app-button whitespace-nowrap"
          >
            Mark For Sale
          </button>

          <button
            type="submit"
            form={BULK_INVENTORY_FORM_ID}
            formAction={bulkMarkSearchInventoryListedAction}
            className="app-button whitespace-nowrap"
          >
            Mark Listed
          </button>

          <button
            type="submit"
            form={BULK_INVENTORY_FORM_ID}
            formAction={bulkMoveSearchInventoryPersonalAction}
            className="app-button whitespace-nowrap"
          >
            Move to Personal
          </button>

          <button
            type="submit"
            form={BULK_INVENTORY_FORM_ID}
            formAction={bulkMarkSearchInventoryJunkAction}
            className="app-button whitespace-nowrap"
          >
            Mark Junk
          </button>

          <button
            type="submit"
            form={BULK_INVENTORY_FORM_ID}
            formAction={bulkMarkSearchInventoryPutAwayAction}
            className="app-button whitespace-nowrap"
          >
            Put Away
          </button>

          <BulkEbayDraftExportButton />

          <details className="group">
            <summary className="app-button cursor-pointer list-none whitespace-nowrap border-purple-900/60 bg-purple-950/30 text-purple-100 hover:bg-purple-900/50">
              Mark as Giveaway
            </summary>
            <div className="mt-2 rounded-xl border border-purple-900/60 bg-zinc-950 p-3 shadow-xl md:min-w-136">
              <div className="text-sm font-semibold text-purple-100">Mark selected items as giveaways?</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-300">Giveaway Type required</span>
                  <select form={BULK_INVENTORY_FORM_ID} name="giveaway_type" defaultValue="buyer_appreciation" className="app-select w-full">
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
                  <select form={BULK_INVENTORY_FORM_ID} name="business_purpose" defaultValue="customer_retention" className="app-select w-full">
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
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-300">Recipient Type</span>
                  <select form={BULK_INVENTORY_FORM_ID} name="recipient_type" defaultValue="viewer_or_customer" className="app-select w-full">
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
                  <input form={BULK_INVENTORY_FORM_ID} name="event_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="app-input w-full" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-300">Campaign / Event</span>
                  <input form={BULK_INVENTORY_FORM_ID} name="campaign_event" className="app-input w-full" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-300">Related Order / Sale #</span>
                  <input form={BULK_INVENTORY_FORM_ID} name="related_order_sale" className="app-input w-full" />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-zinc-300">Notes</span>
                  <textarea form={BULK_INVENTORY_FORM_ID} name="giveaway_notes" className="app-input min-h-20 w-full" />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="submit" form={BULK_INVENTORY_FORM_ID} formAction={bulkFinalizeSearchGiveawayAction} className="app-button-primary whitespace-nowrap">
                  Yes, Mark as Giveaway
                </button>
                <CancelDetailsButton />
              </div>
            </div>
          </details>

          <details className="group">
            <summary className="app-button cursor-pointer list-none whitespace-nowrap border-amber-800/80 bg-amber-950/40 text-amber-100 hover:bg-amber-900/50">
              Write Off Selected
            </summary>
            <div className="mt-2 rounded-xl border border-amber-900/60 bg-zinc-950 p-3 shadow-xl md:min-w-80">
              <div className="text-sm font-semibold text-amber-200">Write off selected items?</div>
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-medium text-zinc-300">Write-off reason required</span>
                <select form={BULK_INVENTORY_FORM_ID} name="disposal_reason" defaultValue="" className="app-select w-full">
                  <option value="" disabled>Choose reason...</option>
                  <option value="trash">Trash / discarded worthless inventory</option>
                  <option value="recycled">Recycled bulk paper/base cards</option>
                  <option value="damaged">Damaged inventory discarded</option>
                  <option value="donation">Donation review</option>
                  <option value="inventory_cleanup">Inventory cleanup / no resale value</option>
                  <option value="lost">Lost / missing inventory review</option>
                  <option value="other">Other documented disposal</option>
                </select>
              </label>
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-medium text-zinc-300">Notes / remarks</span>
                <textarea form={BULK_INVENTORY_FORM_ID} name="disposal_notes" className="app-input min-h-20 w-full" />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="submit" form={BULK_INVENTORY_FORM_ID} formAction={bulkFinalizeSearchWriteOffAction} className="app-button whitespace-nowrap border-amber-800/80 bg-amber-950/50 text-amber-100 hover:bg-amber-900/60">
                  Yes, Write Off Items
                </button>
                <CancelDetailsButton />
              </div>
            </div>
          </details>

          <SearchInventoryDeleteConfirmControl />
        </div>
      </div>
      </div>
    </>
  )
}

function InventorySearchStatusFilters({
  q,
  activeStatus,
}: {
  q: string
  activeStatus: InventoryStatusFilter | null
}) {
  return (
    <div className="mb-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-sm font-semibold text-zinc-200">Inventory filters</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            Narrow these inventory search results without changing your search term.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={buildSearchInventoryStatusHref(q, '')}
            className={`app-chip ${!activeStatus ? 'app-chip-active' : 'app-chip-idle'}`}
          >
            All
          </Link>

          {INVENTORY_STATUS_FILTERS.map((status) => (
            <Link
              key={status}
              href={buildSearchInventoryStatusHref(q, status)}
              className={`app-chip ${activeStatus === status ? 'app-chip-active' : 'app-chip-idle'}`}
            >
              {INVENTORY_STATUS_LABELS[status]}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default async function GlobalSearchPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string
    deleted?: string
    deleted_count?: string
    delete_error?: string
    combine_error?: string
    inventory_status?: string
    status_updated?: string
    status_error?: string
  }>
}) {
  const params = searchParams ? await searchParams : undefined
  const qRaw = String(params?.q ?? '').trim()
  const activeInventoryStatusFilter = normalizeInventoryStatusFilter(params?.inventory_status)
  const parsedSearch = parseSearchQuery(qRaw)
  const searchTokens = buildSearchTokens(parsedSearch.searchTextForMatching || qRaw)
  const searchFilters = parsedSearch.filters
  const extractedNumbers = extractOrderNumbers(qRaw)
  const deleted = String(params?.deleted ?? '').trim()
  const deletedCount = String(params?.deleted_count ?? '').trim()
  const deleteError = String(params?.delete_error ?? '').trim()
  const combineError = String(params?.combine_error ?? '').trim()
  const statusUpdated = String(params?.status_updated ?? '').trim()
  const statusError = String(params?.status_error ?? '').trim()

  const isLikelyReceiptPaste =
    extractedNumbers.length > 0 &&
    qRaw.length > 30 &&
    /order|sold|quantity|date|category/i.test(qRaw)

  const isMultiOrderSearch = extractedNumbers.length > 0 || isLikelyReceiptPaste

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  let matchingOrders: WhatnotOrderRow[] = []
  let matchingBreaks: BreakRow[] = []
  let matchingInventory: InventoryItemRow[] = []
  let matchingSales: SaleSearchRow[] = []
  let ordersError: string | null = null
  let breaksError: string | null = null
  let inventoryError: string | null = null
  let salesError: string | null = null

  if (qRaw) {
    if (isMultiOrderSearch) {
      const orderFilters = extractedNumbers.flatMap((number) => [
        `order_numeric_id.eq.${number}`,
        `order_id.eq.${number}`,
        `order_numeric_id.ilike.%${number}%`,
        `order_id.ilike.%${number}%`,
      ])

      const breakFilters = extractedNumbers.map(
        (number) => `order_number.ilike.%${number}%`
      )

      const [ordersResponse, breaksResponse] = await Promise.all([
        orderFilters.length > 0
          ? supabase
              .from('whatnot_orders')
              .select(`
                id,
                break_id,
                order_id,
                order_numeric_id,
                buyer,
                seller,
                product_name,
                processed_date,
                processed_date_display,
                order_status,
                quantity,
                subtotal,
                shipping_price,
                taxes,
                total,
                source_file_name
              `)
              .eq('user_id', user.id)
              .or(orderFilters.join(','))
              .order('processed_date', { ascending: false })
              .limit(SECTION_LIMIT)
          : Promise.resolve({ data: [], error: null }),

        breakFilters.length > 0
          ? supabase
              .from('breaks')
              .select(`
                id,
                break_date,
                source_name,
                order_number,
                product_name,
                format_type,
                notes,
                total_cost,
                reversed_at
              `)
              .eq('user_id', user.id)
              .or(breakFilters.join(','))
              .order('break_date', { ascending: false })
              .limit(SECTION_LIMIT)
          : Promise.resolve({ data: [], error: null }),
      ])

      matchingOrders = (ordersResponse.data ?? []) as WhatnotOrderRow[]
      matchingBreaks = (breaksResponse.data ?? []) as BreakRow[]
      ordersError = ordersResponse.error?.message ?? null
      breaksError = breaksResponse.error?.message ?? null
    } else {
      const orderFields = [
        'order_id',
        'order_numeric_id',
        'buyer',
        'seller',
        'product_name',
        'order_status',
        'source_file_name',
      ]
      const breakFields = ['order_number', 'source_name', 'product_name', 'format_type', 'notes']
      const inventoryFields = [
        'title',
        'player_name',
        'brand',
        'set_name',
        'card_number',
        'parallel_name',
        'team',
        'status',
        'item_type',
        'notes',
      ]
      const soldInventoryFields = [
        'title',
        'player_name',
        'brand',
        'set_name',
        'card_number',
        'parallel_name',
        'team',
        'item_type',
        'notes',
      ]
      const salesFields = ['platform', 'notes']

      const orderFilters = buildTokenOrFilters(orderFields, searchTokens)
      const breakFilters = buildTokenOrFilters(breakFields, searchTokens)
      const yearFilters = buildYearOrFilters(searchTokens)
      const inventoryFilters = [
        ...buildTokenOrFilters(inventoryFields, searchTokens),
        ...yearFilters,
      ]
      const soldInventoryFilters = [
        ...buildTokenOrFilters(soldInventoryFields, searchTokens),
        ...yearFilters,
      ]
      const salesFilters = buildTokenOrFilters(salesFields, searchTokens)

      const [
        ordersResponse,
        breaksResponse,
        inventoryResponse,
        soldInventoryResponse,
        salesDirectResponse,
      ] = await Promise.all([
        orderFilters.length > 0
          ? fetchAllPages<WhatnotOrderRow>((from, to) =>
              supabase
                .from('whatnot_orders')
                .select(`
                  id,
                  break_id,
                  order_id,
                  order_numeric_id,
                  buyer,
                  seller,
                  product_name,
                  processed_date,
                  processed_date_display,
                  order_status,
                  quantity,
                  subtotal,
                  shipping_price,
                  taxes,
                  total,
                  source_file_name
                `)
                .eq('user_id', user.id)
                .or(orderFilters.join(','))
                .order('processed_date', { ascending: false })
                .range(from, to)
            )
          : Promise.resolve({ data: [], error: null }),

        breakFilters.length > 0
          ? fetchAllPages<BreakRow>((from, to) =>
              supabase
                .from('breaks')
                .select(`
                  id,
                  break_date,
                  source_name,
                  order_number,
                  product_name,
                  format_type,
                  notes,
                  total_cost,
                  reversed_at
                `)
                .eq('user_id', user.id)
                .or(breakFilters.join(','))
                .order('break_date', { ascending: false })
                .range(from, to)
            )
          : Promise.resolve({ data: [], error: null }),

        inventoryFilters.length > 0
          ? fetchAllPages<InventoryItemRow>((from, to) =>
              supabase
                .from('inventory_items')
                .select(`
                  id,
                  source_break_id,
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
                  cost_basis_total,
                  estimated_value_total,
                  status,
                  item_type,
                  notes,
                  source_type,
                  ebay_exported_at,
                  processing_status
                `)
                .eq('user_id', user.id)
                .or(inventoryFilters.join(','))
                .range(from, to)
            )
          : Promise.resolve({ data: [], error: null }),

        soldInventoryFilters.length > 0
          ? fetchAllPages<InventoryItemRow>((from, to) =>
              supabase
                .from('inventory_items')
                .select(`
                  id,
                  source_break_id,
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
                  cost_basis_total,
                  estimated_value_total,
                  status,
                  item_type,
                  notes,
                  source_type,
                  ebay_exported_at,
                  processing_status
                `)
                .eq('user_id', user.id)
                .eq('status', 'sold')
                .or(soldInventoryFilters.join(','))
                .range(from, to)
            )
          : Promise.resolve({ data: [], error: null }),

        salesFilters.length > 0
          ? fetchAllPages<SaleSearchRow>((from, to) =>
              supabase
                .from('sales')
                .select(`
                  id,
                  sale_date,
                  quantity_sold,
                  gross_sale,
                  platform_fees,
                  shipping_cost,
                  other_costs,
                  net_proceeds,
                  cost_of_goods_sold,
                  profit,
                  platform,
                  notes,
                  reversed_at,
                  inventory_item_id
                `)
                .eq('user_id', user.id)
                .is('reversed_at', null)
                .or(salesFilters.join(','))
                .order('sale_date', { ascending: false })
                .range(from, to)
            )
          : Promise.resolve({ data: [], error: null }),
      ])

      matchingOrders = filterAndRankByTokens({
        rows: (ordersResponse.data ?? []) as WhatnotOrderRow[],
        tokens: searchTokens,
        getSearchableText: (order) =>
          buildSearchableText([
            order.order_id,
            order.order_numeric_id,
            order.buyer,
            order.seller,
            order.product_name,
            order.order_status,
            order.source_file_name,
          ]),
        getExactBoostText: (order) => buildSearchableText([order.product_name, order.order_numeric_id, order.order_id]),
      })
        .filter((order) => matchesOrderFilters(order, searchFilters))

      matchingBreaks = filterAndRankByTokens({
        rows: (breaksResponse.data ?? []) as BreakRow[],
        tokens: searchTokens,
        getSearchableText: (breakRow) =>
          buildSearchableText([
            breakRow.order_number,
            breakRow.source_name,
            breakRow.product_name,
            breakRow.format_type,
            breakRow.notes,
          ]),
        getExactBoostText: (breakRow) => buildSearchableText([breakRow.product_name, breakRow.order_number]),
      })
        .filter((breakRow) => matchesBreakFilters(breakRow, searchFilters))

      const rankedInventoryMatches = filterAndRankByTokens({
        rows: (inventoryResponse.data ?? []) as InventoryItemRow[],
        tokens: searchTokens,
        getSearchableText: (item) =>
          buildSearchableText([
            item.title,
            item.player_name,
            item.year,
            item.brand,
            item.set_name,
            item.card_number,
            item.parallel_name,
            item.team,
            item.status,
            item.item_type,
            item.notes,
          ]),
        getExactBoostText: (item) => buildSearchableText([item.title, item.player_name, item.brand, item.set_name]),
      })
        .filter((item) => matchesInventoryFilters(item, searchFilters))

      matchingInventory = rankedInventoryMatches
        .filter((item) => matchesInventoryStatusFilter(item, activeInventoryStatusFilter))

      const soldInventoryMatches = filterAndRankByTokens({
        rows: (soldInventoryResponse.data ?? []) as InventoryItemRow[],
        tokens: searchTokens,
        getSearchableText: (item) =>
          buildSearchableText([
            item.title,
            item.player_name,
            item.year,
            item.brand,
            item.set_name,
            item.card_number,
            item.parallel_name,
            item.team,
            item.item_type,
            item.notes,
          ]),
        getExactBoostText: (item) => buildSearchableText([item.title, item.player_name, item.brand, item.set_name]),
      })
        .filter((item) => matchesInventoryFilters(item, searchFilters))
      const soldInventoryIds = soldInventoryMatches.map((item) => item.id)

      const salesDirectMatches = filterAndRankByTokens({
        rows: (salesDirectResponse.data ?? []) as SaleSearchRow[],
        tokens: searchTokens,
        getSearchableText: (sale) =>
          buildSearchableText([sale.platform, sale.notes]),
      })
        .filter((sale) => matchesSaleFilters(sale, searchFilters))
      let salesFromInventoryMatches: SaleSearchRow[] = []

      if (soldInventoryIds.length > 0) {
        const salesFromInventoryResponse = await supabase
          .from('sales')
          .select(`
            id,
            sale_date,
            quantity_sold,
            gross_sale,
            platform_fees,
            shipping_cost,
            other_costs,
            net_proceeds,
            cost_of_goods_sold,
            profit,
            platform,
            notes,
            reversed_at,
            inventory_item_id
          `)
          .eq('user_id', user.id)
          .is('reversed_at', null)
          .in('inventory_item_id', soldInventoryIds)
          .order('sale_date', { ascending: false })

        salesFromInventoryMatches = (salesFromInventoryResponse.data ?? []) as SaleSearchRow[]
        salesError = salesFromInventoryResponse.error?.message ?? null
      }

      const salesMap = new Map<string, SaleSearchRow>()
      for (const sale of [...salesDirectMatches, ...salesFromInventoryMatches]) {
        salesMap.set(sale.id, sale)
      }

      matchingSales = Array.from(salesMap.values())

      const salesInventoryIds = Array.from(
        new Set(
          matchingSales
            .map((sale) => sale.inventory_item_id)
            .filter((value): value is string => Boolean(value))
        )
      )

      if (salesInventoryIds.length > 0) {
        const relatedInventoryResponse = await supabase
          .from('inventory_items')
          .select(`
            id,
            source_break_id,
            title,
            player_name,
            year,
            brand,
            set_name,
            card_number,
            parallel_name,
            team,
            status,
            item_type,
            notes
          `)
          .eq('user_id', user.id)
          .in('id', salesInventoryIds)

        const relatedInventoryRows = (relatedInventoryResponse.data ?? []) as SaleInventoryItemRow[]
        const relatedInventoryMap = new Map<string, SaleInventoryItemRow>()

        for (const item of relatedInventoryRows) {
          relatedInventoryMap.set(item.id, item)
        }

        matchingSales = matchingSales.map((sale) => ({
          ...sale,
          inventory_items: sale.inventory_item_id
            ? relatedInventoryMap.get(sale.inventory_item_id) ?? null
            : null,
        }))

        salesError = salesError || relatedInventoryResponse.error?.message || null
      }

      if (/^\d{4}$/.test(qRaw)) {
        matchingInventory = matchingInventory.filter(
          (item) => String(item.year ?? '') === qRaw
        )

        matchingSales = matchingSales.filter(
          (sale) => String(sale.inventory_items?.year ?? '') === qRaw
        )
      }

      ordersError = ordersResponse.error?.message ?? null
      breaksError = breaksResponse.error?.message ?? null
      inventoryError = inventoryResponse.error?.message ?? null
      salesError =
        salesError ||
        salesDirectResponse.error?.message ||
        soldInventoryResponse.error?.message ||
        null
    }
  }

  const totalHits =
    matchingOrders.length + matchingBreaks.length + matchingInventory.length + matchingSales.length

  return (
    <div className="app-page-wide space-y-3">
      <div className="app-page-header gap-3">
        <div>
          <h1 className="app-title">Search</h1>
          <p className="app-subtitle">
            Paste order numbers, copied email text, or search across orders, breaks, inventory, and sold items. Try filters like status:available, team:mariners, year:2024, or platform:ebay.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/whatnot-orders" className="app-button whitespace-nowrap">
            Imported Orders
          </Link>
          <Link href="/app/breaks" className="app-button whitespace-nowrap">
            Breaks
          </Link>
          <Link href="/app/inventory" className="app-button whitespace-nowrap">
            Inventory
          </Link>
        </div>
      </div>

      <div id="search-status" className="scroll-mt-28 space-y-3">
        {deleted ? (
          <div className="app-alert-success">
            Deleted {deleted === 'break' ? 'break' : deleted === 'order' ? 'unassigned order' : 'inventory item'} successfully.
          </div>
        ) : null}

        {deletedCount ? (
          <div className="app-alert-success">
            Deleted {deletedCount} successfully.
          </div>
        ) : null}

        {deleteError ? (
          <div className="app-alert-error">
            Delete failed: {deleteError}
          </div>
        ) : null}

        {combineError ? (
          <div className="app-alert-error">
            Combine failed: {combineError}
          </div>
        ) : null}

        {statusUpdated ? (
          <div className="app-alert-success">
            Updated {statusUpdated} successfully.
          </div>
        ) : null}

        {statusError ? (
          <div className="app-alert-error">
            Inventory update failed: {statusError}
          </div>
        ) : null}
      </div>

      {qRaw ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <SearchSummaryCard label="Total Hits" value={totalHits} />
            <SearchSummaryCard label="Orders" value={matchingOrders.length} />
            <SearchSummaryCard label="Breaks" value={matchingBreaks.length} />
            <SearchSummaryCard label="Inventory" value={matchingInventory.length} />
            <SearchSummaryCard label="Sales" value={matchingSales.length} />
          </div>

          <div className="app-section p-4">
            <div className="text-sm text-zinc-300">
              {ordersError || breaksError || inventoryError || salesError
                ? 'Search ran with an error.'
                : `Found ${totalHits} result(s) for "${qRaw}"`}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Search now supports any word order, punctuation-insensitive matching, simple aliases, and filters like status:available or team:mariners.
            </div>
            <div className="mt-3">
              <Link href="/app/search" className="app-button whitespace-nowrap">
                Clear Results
              </Link>
            </div>
          </div>
        </>
      ) : (
        <div className="app-section p-4">
          <div className="text-sm text-zinc-300">
            Use the global search bar at the top of the app to search across orders, breaks, inventory, and sold items.
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Multi-order paste search still works. You can also use filters like status:available, team:mariners, year:2024, platform:ebay, seller:whatnot, or order:123456.
          </div>
        </div>
      )}

      {ordersError ? <div className="app-alert-error">Order search error: {ordersError}</div> : null}
      {breaksError ? <div className="app-alert-error">Break search error: {breaksError}</div> : null}
      {inventoryError ? <div className="app-alert-error">Inventory search error: {inventoryError}</div> : null}
      {salesError ? <div className="app-alert-error">Sold item search error: {salesError}</div> : null}

      {qRaw &&
      !ordersError &&
      !breaksError &&
      !inventoryError &&
      !salesError &&
      totalHits === 0 ? (
        <div className="app-empty">No matching results found.</div>
      ) : null}

      {matchingOrders.length > 0 ? (
        <ResultSection
          title="Matching Imported Orders"
          subtitle={
            isMultiOrderSearch
              ? 'Exact order-number matches from pasted order text.'
              : 'Matching staging and linked imported orders.'
          }
          count={matchingOrders.length}
        >
          <form id={BULK_ORDERS_FORM_ID} action={bulkDeleteOrdersAction} className="hidden">
            <input type="hidden" name="q" value={qRaw} />
          </form>

          <BulkOrderActionsControl formId={BULK_ORDERS_FORM_ID} />

          <div className="app-table-wrap">
            <div className="app-table-scroll">
              <table className="app-table">
                <thead className="app-thead">
                  <tr>
                    <th className="app-th w-16">
                      <SelectAllCheckbox
                        formId={BULK_ORDERS_FORM_ID}
                        fieldName="selected_order_ids"
                        label="Select all unassigned orders"
                      />
                    </th>
                    <th className="app-th">Order #</th>
                    <th className="app-th">Date</th>
                    <th className="app-th">Purchased From</th>
                    <th className="app-th">Description</th>
                    <th className="app-th min-w-45">Source File</th>
                    <th className="app-th">Status</th>
                    <th className="app-th text-right">Total</th>
                    <th className="app-th min-w-55">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {matchingOrders.map((order) => {
                    const orderNumber = cleanText(order.order_numeric_id || order.order_id || '—')
                    const seller = cleanText(order.seller || '—')
                    const description = cleanText(order.product_name || 'Untitled order')
                    const sourceFileName = cleanText(order.source_file_name || '')
                    const isLinked = Boolean(order.break_id)
                    const statusLabel = isLinked ? 'Linked' : 'Staging'
                    const orderHref = buildFocusHref(order)

                    return (
                      <tr key={order.id} className="app-tr align-top cursor-pointer">
                        <td className="app-td">
                          {!isLinked ? (
                            <input
                              form={BULK_ORDERS_FORM_ID}
                              type="checkbox"
                              name="selected_order_ids"
                              value={order.id}
                              aria-label={`Select order ${orderNumber || order.id}`}
                              className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                            />
                          ) : (
                            <span className="text-xs text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <Link href={orderHref} className="block hover:underline">
                            {orderNumber || '—'}
                          </Link>
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <Link href={orderHref} className="block hover:underline">
                            {formatDate(order.processed_date_display || order.processed_date)}
                          </Link>
                        </td>
                        <td className="app-td">
                          <Link href={orderHref} className="block hover:underline">
                            <div className="max-w-40 truncate" title={seller}>
                              {seller || '—'}
                            </div>
                          </Link>
                        </td>
                        <td className="app-td">
                          <Link href={orderHref} className="block hover:underline">
                            <div className="max-w-80 truncate" title={description}>
                              {description}
                            </div>
                          </Link>
                        </td>
                        <td className="app-td">
                          <NotesPreview value={sourceFileName} />
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <span className={statusBadgeClasses(statusLabel)}>{statusLabel}</span>
                        </td>
                        <td className="app-td whitespace-nowrap text-right">
                          {money(order.total)}
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <div className="flex items-center gap-1 whitespace-nowrap">
                            <Link href={buildFocusHref(order)} className="app-button whitespace-nowrap">
                              Open
                            </Link>
                            {order.break_id ? (
                              <Link href={`/app/breaks/${order.break_id}`} className="app-button whitespace-nowrap">
                                Break
                              </Link>
                            ) : null}
                            <DeleteOrderConfirmControl
                              orderId={order.id}
                              orderLabel={orderNumber || order.id}
                              isLinked={isLinked}
                              q={qRaw}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </ResultSection>
      ) : null}

      {matchingBreaks.length > 0 ? (
        <ResultSection
          title="Matching Breaks"
          subtitle="Search hits from order number, source, product, format, and notes."
          count={matchingBreaks.length}
        >
          <form id={BULK_BREAKS_FORM_ID} action={bulkDeleteBreaksAction} className="hidden">
            <input type="hidden" name="q" value={qRaw} />
          </form>

          <BulkDeleteConfirmControl label="breaks" formId={BULK_BREAKS_FORM_ID} />

          <div className="app-table-wrap">
            <div className="app-table-scroll">
              <table className="app-table">
                <thead className="app-thead">
                  <tr>
                    <th className="app-th w-16">
                      <SelectAllCheckbox
                        formId={BULK_BREAKS_FORM_ID}
                        fieldName="selected_break_ids"
                        label="Select all breaks"
                      />
                    </th>
                    <th className="app-th">Date</th>
                    <th className="app-th">Break</th>
                    <th className="app-th">Source</th>
                    <th className="app-th">Order #</th>
                    <th className="app-th min-w-45">Notes</th>
                    <th className="app-th">Status</th>
                    <th className="app-th text-right">Cost</th>
                    <th className="app-th min-w-55">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {matchingBreaks.map((breakRow) => {
                    const breakLabel = buildBreakDisplay(breakRow)
                    const sourceLabel = cleanText(breakRow.source_name || '—')
                    const orderLabel = cleanText(breakRow.order_number || '—')
                    const breakNotes = cleanText(breakRow.notes || '')
                    const statusLabel = breakRow.reversed_at ? 'Reversed' : 'Active'
                    const breakHref = `/app/breaks/${breakRow.id}`

                    return (
                      <tr key={breakRow.id} className="app-tr align-top cursor-pointer">
                        <td className="app-td whitespace-nowrap">
                          <input
                            form={BULK_BREAKS_FORM_ID}
                            type="checkbox"
                            name="selected_break_ids"
                            value={breakRow.id}
                            aria-label={`Select ${breakLabel}`}
                            className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                          />
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <Link href={breakHref} className="block hover:underline">
                            {formatDate(breakRow.break_date)}
                          </Link>
                        </td>
                        <td className="app-td">
                          <Link href={breakHref} className="block hover:underline">
                            <div className="max-w-80 truncate" title={breakLabel}>
                              {breakLabel}
                            </div>
                          </Link>
                        </td>
                        <td className="app-td">
                          <Link href={breakHref} className="block hover:underline">
                            <div className="max-w-40 truncate" title={sourceLabel}>
                              {sourceLabel}
                            </div>
                          </Link>
                        </td>
                        <td className="app-td">
                          <Link href={breakHref} className="block hover:underline">
                            <div className="max-w-52 truncate" title={orderLabel}>
                              {orderLabel || '—'}
                            </div>
                          </Link>
                        </td>
                        <td className="app-td">
                          <NotesPreview value={breakNotes} />
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <span className={statusBadgeClasses(statusLabel)}>{statusLabel}</span>
                        </td>
                        <td className="app-td whitespace-nowrap text-right">
                          {money(breakRow.total_cost)}
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <div className="flex items-center gap-1 whitespace-nowrap">
                            <Link href={`/app/breaks/${breakRow.id}`} className="app-button whitespace-nowrap">
                              Details
                            </Link>
                            <Link href={`/app/breaks/${breakRow.id}/edit`} className="app-button whitespace-nowrap">
                              Edit
                            </Link>
                            <DeleteConfirmControl
                              itemType="break"
                              itemName={breakLabel}
                              hiddenIdName="break_id"
                              hiddenIdValue={breakRow.id}
                              q={qRaw}
                              action={deleteBreakAction}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </ResultSection>
      ) : null}

      {!isMultiOrderSearch && (matchingInventory.length > 0 || activeInventoryStatusFilter) ? (
        <ResultSection
          id="matching-inventory-items"
          title="Matching Inventory Items"
          subtitle="Search hits from title, player, set, number, team, notes, and related inventory fields."
          count={matchingInventory.length}
        >
          <InventorySearchStatusFilters q={qRaw} activeStatus={activeInventoryStatusFilter} />

          <form id={BULK_INVENTORY_FORM_ID} action={bulkDeleteInventoryItemsAction}>
            <input type="hidden" name="q" value={qRaw} />
            <SearchInventoryBulkActions />
          </form>

          <div className="app-table-wrap">
            <div className="app-table-scroll">
              <table className="app-table">
                <thead className="app-thead">
                  <tr>
                    <th className="app-th w-16">
                      <SelectAllCheckbox
                        formId={BULK_INVENTORY_FORM_ID}
                        fieldName="selected_inventory_ids"
                        label="Select all inventory items"
                      />
                    </th>
                    <th className="app-th">Item</th>
                    <th className="app-th min-w-45">Notes</th>
                    <th className="app-th">Status</th>
                    <th className="app-th">Qty</th>
                    <th className="app-th">Available</th>
                    <th className="app-th text-right">Cost</th>
                    <th className="app-th text-right">Est. Value</th>
                    <th className="app-th min-w-55">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {matchingInventory.map((item) => {
                    const display = buildInventoryDisplay(item) || item.title || 'Untitled inventory item'
                    const itemNotes = cleanText(item.notes || '')
                    const statusLabel = cleanText(item.status || '—')
                    const inventoryHref = `/app/inventory/${item.id}`

                    return (
                      <tr key={item.id} className="app-tr align-top cursor-pointer">
                        <td className="app-td whitespace-nowrap">
                          <input
                            form={BULK_INVENTORY_FORM_ID}
                            type="checkbox"
                            name="selected_inventory_ids"
                            value={item.id}
                            data-inventory-bulk-row-checkbox="true"
                            aria-label={`Select ${display}`}
                            className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                          />
                        </td>
                        <td className="app-td">
                          <Link href={inventoryHref} className="block hover:underline">
                            <div className="max-w-96 truncate" title={display}>
                              {display}
                            </div>
                          </Link>
                        </td>
                        <td className="app-td">
                          <NotesPreview value={itemNotes} />
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className={statusBadgeClasses(statusLabel)}>{statusLabel || '—'}</span>
                            {item.ebay_exported_at ? (
                              <span
                                className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold leading-none shadow-sm"
                                title="Exported for eBay"
                                aria-label="Exported for eBay"
                              >
                                <span className="text-red-600">e</span>
                                <span className="text-blue-600">B</span>
                                <span className="text-yellow-500">a</span>
                                <span className="text-green-600">y</span>
                              </span>
                            ) : null}
                          </div>
                          {item.processing_status === 'put_away' ? (
                            <div className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">
                              Put Away
                            </div>
                          ) : null}
                        </td>
                        <td className="app-td whitespace-nowrap">{item.quantity ?? '—'}</td>
                        <td className="app-td whitespace-nowrap">{item.available_quantity ?? '—'}</td>
                        <td className="app-td whitespace-nowrap text-right">
                          {money(item.cost_basis_total)}
                        </td>
                        <td className="app-td whitespace-nowrap text-right">
                          {money(item.estimated_value_total)}
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <div className="flex items-center gap-1 whitespace-nowrap">
                            <Link href={`/app/inventory/${item.id}`} className="app-button whitespace-nowrap">
                              Open
                            </Link>
                            {item.source_break_id ? (
                              <Link href={`/app/breaks/${item.source_break_id}`} className="app-button whitespace-nowrap">
                                Break
                              </Link>
                            ) : null}
                            <DeleteConfirmControl
                              itemType="inventory item"
                              itemName={display}
                              hiddenIdName="item_id"
                              hiddenIdValue={item.id}
                              q={qRaw}
                              action={deleteInventoryItemAction}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}

                  {matchingInventory.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-zinc-400">
                        No inventory items match the selected inventory filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </ResultSection>
      ) : null}

      {!isMultiOrderSearch && matchingSales.length > 0 ? (
        <ResultSection
          title="Matching Sold Items / Sales"
          subtitle="Search hits from sold item details, sold item notes, sale notes, and platform fields."
          count={matchingSales.length}
        >
          <div className="app-table-wrap">
            <div className="app-table-scroll">
              <table className="app-table">
                <thead className="app-thead">
                  <tr>
                    <th className="app-th">Date</th>
                    <th className="app-th">Item</th>
                    <th className="app-th min-w-45">Notes</th>
                    <th className="app-th">Platform</th>
                    <th className="app-th">Qty</th>
                    <th className="app-th text-right">Gross</th>
                    <th className="app-th text-right">Profit</th>
                    <th className="app-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {matchingSales.map((sale) => {
                    const display = buildSoldItemDisplay(sale)
                    const saleNotes = cleanText([sale.notes, sale.inventory_items?.notes].filter(Boolean).join(' • '))
                    const platform = cleanText(sale.platform || '—')
                    const saleHref = sale.inventory_item_id
                      ? `/app/inventory/${sale.inventory_item_id}`
                      : sale.inventory_items?.source_break_id
                        ? `/app/breaks/${sale.inventory_items.source_break_id}`
                        : '/app/search'

                    return (
                      <tr key={sale.id} className="app-tr cursor-pointer">
                        <td className="app-td whitespace-nowrap">{formatDate(sale.sale_date)}</td>
                        <td className="app-td">
                          <Link href={saleHref} className="block hover:underline">
                            <div className="max-w-96 truncate" title={display}>
                              {display}
                            </div>
                          </Link>
                        </td>
                        <td className="app-td">
                          <NotesPreview value={saleNotes} />
                        </td>
                        <td className="app-td whitespace-nowrap">{platform || '—'}</td>
                        <td className="app-td whitespace-nowrap">{sale.quantity_sold ?? '—'}</td>
                        <td className="app-td whitespace-nowrap text-right">
                          {money(sale.gross_sale)}
                        </td>
                        <td className="app-td whitespace-nowrap text-right">
                          {money(sale.profit)}
                        </td>
                        <td className="app-td whitespace-nowrap">
                          <div className="flex items-center gap-1 whitespace-nowrap">
                            {sale.inventory_item_id ? (
                              <Link href={`/app/inventory/${sale.inventory_item_id}`} className="app-button whitespace-nowrap">
                                Item
                              </Link>
                            ) : null}
                            {sale.inventory_items?.source_break_id ? (
                              <Link
                                href={`/app/breaks/${sale.inventory_items.source_break_id}`}
                                className="app-button whitespace-nowrap"
                              >
                                Break
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </ResultSection>
      ) : null}
    </div>
  )
}
