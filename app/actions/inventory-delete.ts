'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function money(value: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

export async function deleteInventoryItemAction(formData: FormData) {
  const supabase = await createClient()
  const itemId = String(formData.get('item_id') || '').trim()

  if (!itemId) {
    redirect('/app/inventory?delete_error=Missing%20inventory%20item%20ID')
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const deletedAt = new Date().toISOString()

  const { data: existingItem, error: existingItemError } = await supabase
    .from('inventory_items')
    .select('id, title, quantity, available_quantity, cost_basis_total')
    .eq('id', itemId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (existingItemError) {
    redirect(
      `/app/inventory?delete_error=${encodeURIComponent(existingItemError.message)}`
    )
  }

  if (!existingItem) {
    redirect(
      '/app/inventory?delete_error=Inventory%20item%20was%20not%20found%20or%20was%20already%20deleted'
    )
  }

  const { data: activeSalesForItem, error: activeSalesCheckError } =
    await supabase
      .from('sales')
      .select('id')
      .eq('user_id', user.id)
      .eq('inventory_item_id', itemId)
      .is('reversed_at', null)
      .limit(1)

  if (activeSalesCheckError) {
    redirect(
      `/app/inventory?delete_error=${encodeURIComponent(activeSalesCheckError.message)}`
    )
  }

  if ((activeSalesForItem ?? []).length > 0) {
    redirect(
      '/app/inventory?delete_error=This%20inventory%20item%20has%20an%20active%20sale.%20Reverse%20the%20sale%20first%20so%20COGS%20and%20inventory%20stay%20audit-safe.'
    )
  }

  const { error } = await supabase
    .from('inventory_items')
    .update({
      deleted_at: deletedAt,
    })
    .eq('id', itemId)
    .eq('user_id', user.id)
    .is('deleted_at', null)

  if (error) {
    redirect(`/app/inventory?delete_error=${encodeURIComponent(error.message)}`)
  }

  await supabase.from('inventory_transactions').insert({
    user_id: user.id,
    inventory_item_id: existingItem.id,
    transaction_type: 'soft_delete',
    quantity: Number(
      existingItem.available_quantity ?? existingItem.quantity ?? 0
    ),
    notes: `Inventory item soft deleted from inventory list as an administrative correction. Cost basis at deletion time: ${money(
      Number(existingItem.cost_basis_total ?? 0)
    )}. Do not use delete for personal withdrawals, giveaways, junk, donations, or sold items.`,
    created_at: deletedAt,
  })

  revalidatePath('/app/inventory')
  revalidatePath('/app/search')
  revalidatePath('/app/breaks')
  revalidatePath('/app/reports/tax')

  redirect('/app/inventory?deleted_count=1%20inventory%20item')
}
