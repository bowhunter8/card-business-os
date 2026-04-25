'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function deleteInventoryItemAction(formData: FormData) {
  const supabase = await createClient()
  const itemId = String(formData.get('item_id') || '').trim()

  if (!itemId) return

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  await supabase
    .from('inventory_items')
    .update({
      deleted_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .eq('user_id', user.id)
    .is('deleted_at', null)

  revalidatePath('/app/inventory')
}