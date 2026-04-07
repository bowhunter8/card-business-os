'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function safeText(value: FormDataEntryValue | null) {
  return String(value ?? '').trim()
}

function safeNullableNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  const num = Number(raw)
  return Number.isFinite(num) ? num : null
}

export async function updateInventoryListingAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const inventoryItemId = safeText(formData.get('inventory_item_id'))
  const listedPrice = safeNullableNumber(formData.get('listed_price'))
  const listedPlatform = safeText(formData.get('listed_platform')) || null
  const listedDate = safeText(formData.get('listed_date')) || null

  if (!inventoryItemId) {
    redirect('/app/inventory?error=Missing inventory item id')
  }

  const { error } = await supabase
    .from('inventory_items')
    .update({
      listed_price: listedPrice,
      listed_platform: listedPlatform,
      listed_date: listedDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)

  if (error) {
    redirect(
      `/app/inventory/${inventoryItemId}?error=${encodeURIComponent(
        error.message || 'Could not update listing details'
      )}`
    )
  }

  redirect(`/app/inventory/${inventoryItemId}?success=Listing details updated`)
}