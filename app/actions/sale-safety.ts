'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function safeText(value: FormDataEntryValue | null) {
  return String(value ?? '').trim()
}

export async function reverseSaleAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const saleId = safeText(formData.get('sale_id'))
  const inventoryItemId = safeText(formData.get('inventory_item_id'))
  const reversalReason =
    safeText(formData.get('reversal_reason')) || 'Manual sale reversal'

  if (!saleId || !inventoryItemId) {
    redirect('/app/inventory?error=Missing sale or inventory item id')
  }

  const { data: saleRow, error: saleError } = await supabase
    .from('sales')
    .select(`
      id,
      user_id,
      inventory_item_id,
      quantity_sold,
      reversed_at
    `)
    .eq('id', saleId)
    .eq('user_id', user.id)
    .eq('inventory_item_id', inventoryItemId)
    .single()

  if (saleError || !saleRow) {
    redirect(`/app/inventory/${inventoryItemId}?error=Sale not found`)
  }

  if (saleRow.reversed_at) {
    redirect(`/app/inventory/${inventoryItemId}?error=This sale has already been reversed`)
  }

  const quantityToRestore = Number(saleRow.quantity_sold ?? 0)

  if (quantityToRestore <= 0) {
    redirect(`/app/inventory/${inventoryItemId}?error=Sale quantity is invalid for reversal`)
  }

  const { data: itemRow, error: itemError } = await supabase
    .from('inventory_items')
    .select(`
      id,
      user_id,
      quantity,
      available_quantity
    `)
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)
    .single()

  if (itemError || !itemRow) {
    redirect(`/app/inventory/${inventoryItemId}?error=Inventory item not found`)
  }

  const currentAvailable = Number(itemRow.available_quantity ?? 0)
  const originalQuantity = Number(itemRow.quantity ?? 0)
  const restoredAvailable = currentAvailable + quantityToRestore

  if (restoredAvailable > originalQuantity) {
    redirect(
      `/app/inventory/${inventoryItemId}?error=Sale reversal would make available quantity exceed original quantity`
    )
  }

  const { error: inventoryUpdateError } = await supabase
    .from('inventory_items')
    .update({
      available_quantity: restoredAvailable,
    })
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)

  if (inventoryUpdateError) {
    redirect(
      `/app/inventory/${inventoryItemId}?error=${encodeURIComponent(
        inventoryUpdateError.message || 'Could not restore inventory quantity'
      )}`
    )
  }

  const { error: saleUpdateError } = await supabase
    .from('sales')
    .update({
      reversed_at: new Date().toISOString(),
      reversal_reason: reversalReason,
    })
    .eq('id', saleId)
    .eq('user_id', user.id)

  if (saleUpdateError) {
    redirect(
      `/app/inventory/${inventoryItemId}?error=${encodeURIComponent(
        saleUpdateError.message || 'Could not mark sale as reversed'
      )}`
    )
  }

  redirect(`/app/inventory/${inventoryItemId}?success=Sale reversed successfully`)
}