'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function safeText(value: FormDataEntryValue | null) {
  return String(value ?? '').trim()
}

export async function rollbackBreakAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const breakId = safeText(formData.get('break_id'))
  const reversalReason =
    safeText(formData.get('reversal_reason')) || 'Manual rollback from break detail page'

  if (!breakId) {
    redirect('/app/breaks?error=Missing break id')
  }

  const { data: breakRow, error: breakError } = await supabase
    .from('breaks')
    .select('id, user_id, product_name, reversed_at')
    .eq('id', breakId)
    .eq('user_id', user.id)
    .single()

  if (breakError || !breakRow) {
    redirect('/app/breaks?error=Break not found')
  }

  if (breakRow.reversed_at) {
    redirect(`/app/breaks/${breakId}?error=This break has already been rolled back`)
  }

  const { data: inventoryRows, error: inventoryError } = await supabase
    .from('inventory_items')
    .select('id')
    .eq('user_id', user.id)
    .eq('source_type', 'break')
    .eq('source_break_id', breakId)

  if (inventoryError) {
    redirect(
      `/app/breaks/${breakId}?error=${encodeURIComponent(
        inventoryError.message || 'Could not load break inventory'
      )}`
    )
  }

  const inventoryIds = (inventoryRows ?? []).map((row) => row.id)

  if (inventoryIds.length > 0) {
    const { data: salesRows, error: salesError } = await supabase
      .from('sales')
      .select('id, inventory_item_id, quantity_sold')
      .eq('user_id', user.id)
      .in('inventory_item_id', inventoryIds)

    if (salesError) {
      redirect(
        `/app/breaks/${breakId}?error=${encodeURIComponent(
          salesError.message || 'Could not verify sales before rollback'
        )}`
      )
    }

    const soldRows = (salesRows ?? []).filter(
      (row) => Number(row.quantity_sold ?? 0) > 0
    )

    if (soldRows.length > 0) {
      redirect(
        `/app/breaks/${breakId}?error=Rollback blocked because one or more items from this break have already been sold`
      )
    }

    const { error: txDeleteError } = await supabase
      .from('inventory_transactions')
      .delete()
      .eq('user_id', user.id)
      .eq('linked_entity_type', 'break')
      .eq('linked_entity_id', breakId)

    if (txDeleteError) {
      redirect(
        `/app/breaks/${breakId}?error=${encodeURIComponent(
          txDeleteError.message || 'Could not remove inventory transactions'
        )}`
      )
    }

    const { error: inventoryDeleteError } = await supabase
      .from('inventory_items')
      .delete()
      .eq('user_id', user.id)
      .eq('source_type', 'break')
      .eq('source_break_id', breakId)

    if (inventoryDeleteError) {
      redirect(
        `/app/breaks/${breakId}?error=${encodeURIComponent(
          inventoryDeleteError.message || 'Could not remove break inventory'
        )}`
      )
    }
  }

  const { error: unlinkWhatnotError } = await supabase
    .from('whatnot_orders')
    .update({ break_id: null })
    .eq('user_id', user.id)
    .eq('break_id', breakId)

  if (unlinkWhatnotError) {
    redirect(
      `/app/breaks/${breakId}?error=${encodeURIComponent(
        unlinkWhatnotError.message || 'Could not unlink Whatnot orders'
      )}`
    )
  }

  const { error: breakUpdateError } = await supabase
    .from('breaks')
    .update({
      reversed_at: new Date().toISOString(),
      reversal_reason: reversalReason,
      notes: null,
    })
    .eq('id', breakId)
    .eq('user_id', user.id)

  if (breakUpdateError) {
    redirect(
      `/app/breaks/${breakId}?error=${encodeURIComponent(
        breakUpdateError.message || 'Could not mark break as reversed'
      )}`
    )
  }

  redirect(`/app/breaks/${breakId}?success=Break rolled back successfully`)
}