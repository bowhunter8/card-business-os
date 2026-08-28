'use server'

import { createClient } from '@/lib/supabase/server'

export type SharedInventoryBulkStatus = 'available' | 'listed' | 'personal' | 'junk'

export type SharedInventoryBulkResult =
  | {
      ok: true
      updatedIds: string[]
      updatedCount: number
      status: SharedInventoryBulkStatus
    }
  | {
      ok: false
      error: string
      code:
        | 'not_authenticated'
        | 'invalid_status'
        | 'no_selection'
        | 'writeoff_locked'
        | 'load_failed'
        | 'update_failed'
    }

function statusLabel(status: SharedInventoryBulkStatus) {
  if (status === 'available') return 'For Sale'
  if (status === 'listed') return 'Listed'
  if (status === 'personal') return 'Personal'
  return 'Junk'
}

export async function updateInventoryBulkStatusShared(args: {
  itemIds: string[]
  requestedStatus: SharedInventoryBulkStatus
  requiredSourceType?: string
  requiredBreakId?: string
}): Promise<SharedInventoryBulkResult> {
  const requestedStatus = args.requestedStatus
  const itemIds = Array.from(
    new Set(
      (args.itemIds ?? [])
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    )
  )

  const allowedStatuses: SharedInventoryBulkStatus[] = [
    'available',
    'listed',
    'personal',
    'junk',
  ]

  if (!allowedStatuses.includes(requestedStatus)) {
    return {
      ok: false,
      error: 'Choose a valid bulk status.',
      code: 'invalid_status',
    }
  }

  if (itemIds.length === 0) {
    return {
      ok: false,
      error: `Select at least one inventory item to mark ${statusLabel(requestedStatus)}.`,
      code: 'no_selection',
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      error: 'You must be signed in to update inventory.',
      code: 'not_authenticated',
    }
  }

  const { data: finalizedRows, error: finalizedError } = await supabase
    .from('inventory_transactions')
    .select('inventory_item_id')
    .eq('user_id', user.id)
    .eq('transaction_type', 'disposal_writeoff_review')
    .eq('finalized_for_tax', true)
    .in('inventory_item_id', itemIds)

  if (finalizedError) {
    return {
      ok: false,
      error: finalizedError.message,
      code: 'load_failed',
    }
  }

  if ((finalizedRows ?? []).length > 0) {
    return {
      ok: false,
      error:
        'One or more selected items are written off and locked for tax review. Undo the write-off before changing status.',
      code: 'writeoff_locked',
    }
  }

  let itemQuery = supabase
    .from('inventory_items')
    .select('id, title, status, quantity, available_quantity, cost_basis_total')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', itemIds)

  if (args.requiredSourceType) {
    itemQuery = itemQuery.eq('source_type', args.requiredSourceType)
  }

  if (args.requiredBreakId) {
    itemQuery = itemQuery.eq('source_break_id', args.requiredBreakId)
  }

  const { data: existingItems, error: existingItemsError } = await itemQuery

  if (existingItemsError) {
    return {
      ok: false,
      error: existingItemsError.message,
      code: 'load_failed',
    }
  }

  const validIds = (existingItems ?? []).map((item) => String(item.id))

  if (validIds.length === 0) {
    return {
      ok: false,
      error: 'No matching active inventory items were found.',
      code: 'load_failed',
    }
  }

  const updatedAt = new Date().toISOString()

  const updatePayload = {
    status: requestedStatus,
    ...(requestedStatus === 'listed'
      ? { processing_status: 'listed' }
      : {}),
    updated_at: updatedAt,
  }

  let updateQuery = supabase
    .from('inventory_items')
    .update(updatePayload)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', validIds)

  if (args.requiredSourceType) {
    updateQuery = updateQuery.eq('source_type', args.requiredSourceType)
  }

  if (args.requiredBreakId) {
    updateQuery = updateQuery.eq('source_break_id', args.requiredBreakId)
  }

  const { error: updateError } = await updateQuery

  if (updateError) {
    return {
      ok: false,
      error: updateError.message,
      code: 'update_failed',
    }
  }

  const inventoryTransactionRows = (existingItems ?? [])
    .filter((item) => item.status !== requestedStatus)
    .map((item) => {
      const previousStatus = String(item.status || 'unassigned').replaceAll('_', ' ')
      const nextStatus = statusLabel(requestedStatus)
      const itemTitle = item.title || 'Inventory item'

      return {
        user_id: user.id,
        inventory_item_id: item.id,
        transaction_type: 'status_change',
        quantity_change: 0,
        to_status: requestedStatus,
        amount: 0,
        event_date: updatedAt.slice(0, 10),
        notes:
          requestedStatus === 'personal'
            ? `Bulk personal withdrawal: ${itemTitle} changed from ${previousStatus} to Personal. Cost basis preserved as inventory withdrawn for personal collection; do not also deduct this item as an expense.`
            : requestedStatus === 'junk'
              ? `Bulk junk cleanup: ${itemTitle} changed from ${previousStatus} to Junk. Cost basis preserved for future donation, disposal, or write-off review; no automatic deduction was taken.`
              : `Bulk status update: ${itemTitle} changed from ${previousStatus} to ${nextStatus}. Cost basis preserved.`,
        created_at: updatedAt,
      }
    })

  if (inventoryTransactionRows.length > 0) {
    const { error: transactionError } = await supabase
      .from('inventory_transactions')
      .insert(inventoryTransactionRows)

    if (transactionError) {
      return {
        ok: false,
        error: transactionError.message,
        code: 'update_failed',
      }
    }
  }

  return {
    ok: true,
    updatedIds: validIds,
    updatedCount: validIds.length,
    status: requestedStatus,
  }
}


export type SharedInventoryProcessingStatus =
  | 'ebay_exported'
  | 'listed'
  | 'put_away'

export async function updateInventoryProcessingStatusShared(args: {
  itemIds: string[]
  processingStatus: SharedInventoryProcessingStatus
  requiredSourceType?: string
  requiredBreakId?: string
}): Promise<SharedInventoryBulkResult> {
  const itemIds = Array.from(
    new Set(
      (args.itemIds ?? [])
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    )
  )

  if (itemIds.length === 0) {
    return {
      ok: false,
      error: 'Select at least one inventory item.',
      code: 'no_selection',
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      error: 'You must be signed in to update inventory.',
      code: 'not_authenticated',
    }
  }

  let itemQuery = supabase
    .from('inventory_items')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', itemIds)

  if (args.requiredSourceType) {
    itemQuery = itemQuery.eq('source_type', args.requiredSourceType)
  }

  if (args.requiredBreakId) {
    itemQuery = itemQuery.eq('source_break_id', args.requiredBreakId)
  }

  const { data: existingItems, error: loadError } = await itemQuery

  if (loadError) {
    return {
      ok: false,
      error: loadError.message,
      code: 'load_failed',
    }
  }

  const validIds = (existingItems ?? []).map((item) => String(item.id))

  if (validIds.length === 0) {
    return {
      ok: false,
      error: 'No matching active inventory items were found.',
      code: 'load_failed',
    }
  }

  let updateQuery = supabase
    .from('inventory_items')
    .update({
      processing_status: args.processingStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', validIds)

  if (args.requiredSourceType) {
    updateQuery = updateQuery.eq('source_type', args.requiredSourceType)
  }

  if (args.requiredBreakId) {
    updateQuery = updateQuery.eq('source_break_id', args.requiredBreakId)
  }

  const { error: updateError } = await updateQuery

  if (updateError) {
    return {
      ok: false,
      error: updateError.message,
      code: 'update_failed',
    }
  }

  return {
    ok: true,
    updatedIds: validIds,
    updatedCount: validIds.length,
    status: 'available',
  }
}
