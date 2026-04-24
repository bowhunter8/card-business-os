'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function markAsGiveawayAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const inventoryItemId = String(formData.get('inventory_item_id') ?? '')

  if (!inventoryItemId) return

  const { data: item } = await supabase
    .from('inventory_items')
    .select('id, cost_basis_total, title')
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)
    .single()

  if (!item) return

  // 1. Update item status
  await supabase
    .from('inventory_items')
    .update({
      status: 'giveaway',
      available_quantity: 0,
    })
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)

  // 2. Create expense entry
  await supabase.from('expenses').insert({
    user_id: user.id,
    expense_date: new Date().toISOString().slice(0, 10),
    category: 'Advertising / Marketing',
    amount: Number(item.cost_basis_total ?? 0),
    notes: `Whatnot stream giveaway - ${item.title || 'Inventory Item'}`,
  })

  revalidatePath('/app/inventory')
  revalidatePath(`/app/inventory/${inventoryItemId}`)
  revalidatePath('/app/expenses')
  revalidatePath('/app/reports/tax/summary')

  redirect(`/app/inventory/${inventoryItemId}?success=Marked+as+giveaway`)
}