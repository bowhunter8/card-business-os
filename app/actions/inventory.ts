'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function createInventoryItemAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const itemType = String(formData.get('item_type') ?? 'single_card').trim()
  const title = String(formData.get('title') ?? '').trim()
  const playerName = String(formData.get('player_name') ?? '').trim()
  const yearRaw = String(formData.get('year') ?? '').trim()
  const brand = String(formData.get('brand') ?? '').trim()
  const setName = String(formData.get('set_name') ?? '').trim()
  const cardNumber = String(formData.get('card_number') ?? '').trim()
  const parallelName = String(formData.get('parallel_name') ?? '').trim()
  const team = String(formData.get('team') ?? '').trim()
  const quantity = Number(formData.get('quantity') ?? 1)
  const costBasisUnit = Number(formData.get('cost_basis_unit') ?? 0)
  const estimatedValueUnit = Number(formData.get('estimated_value_unit') ?? 0)
  const storageLocation = String(formData.get('storage_location') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()

  if (quantity < 1) {
    redirect('/app/inventory/new?error=Quantity must be at least 1')
  }

  const year = yearRaw ? Number(yearRaw) : null
  const costBasisTotal = Number((costBasisUnit * quantity).toFixed(2))
  const estimatedValueTotal = Number((estimatedValueUnit * quantity).toFixed(2))

  const insertResponse = await supabase
    .from('inventory_items')
    .insert({
      user_id: user.id,
      item_type: itemType || 'single_card',
      status: 'available',
      quantity,
      available_quantity: quantity,
      title: title || null,
      player_name: playerName || null,
      year: year && !Number.isNaN(year) ? year : null,
      brand: brand || null,
      set_name: setName || null,
      card_number: cardNumber || null,
      parallel_name: parallelName || null,
      team: team || null,
      cost_basis_unit: costBasisUnit,
      cost_basis_total: costBasisTotal,
      estimated_value_unit: estimatedValueUnit,
      estimated_value_total: estimatedValueTotal,
      storage_location: storageLocation || null,
      notes: notes || null,
    })
    .select('id, cost_basis_total')
    .single()

  if (insertResponse.error || !insertResponse.data) {
    redirect(
      `/app/inventory/new?error=${encodeURIComponent(
        insertResponse.error?.message ?? 'Could not create inventory item'
      )}`
    )
  }

  await supabase.from('inventory_transactions').insert({
    user_id: user.id,
    inventory_item_id: insertResponse.data.id,
    transaction_type: 'manual_add',
    quantity_change: quantity,
    to_status: 'available',
    amount: insertResponse.data.cost_basis_total ?? costBasisTotal,
    event_date: new Date().toISOString().slice(0, 10),
    notes: 'Manual inventory entry',
  })

  redirect(`/app/inventory/${insertResponse.data.id}`)
}

export async function updateInventoryItemAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const inventoryItemId = String(formData.get('inventory_item_id') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const playerName = String(formData.get('player_name') ?? '').trim()
  const yearRaw = String(formData.get('year') ?? '').trim()
  const brand = String(formData.get('brand') ?? '').trim()
  const setName = String(formData.get('set_name') ?? '').trim()
  const cardNumber = String(formData.get('card_number') ?? '').trim()
  const parallelName = String(formData.get('parallel_name') ?? '').trim()
  const team = String(formData.get('team') ?? '').trim()
  const quantityRaw = String(formData.get('quantity') ?? '').trim()
  const storageLocation = String(formData.get('storage_location') ?? '').trim()
  const estimatedValueUnit = Number(formData.get('estimated_value_unit') ?? 0)
  const notes = String(formData.get('notes') ?? '').trim()

  const from = String(formData.get('from') ?? '').trim()
  const breakId = String(formData.get('break_id') ?? '').trim()
  const cameFromBreak = from === 'break' && breakId.length > 0

  if (!inventoryItemId) {
    redirect('/app/inventory?error=Missing inventory item id')
  }

  const itemResponse = await supabase
    .from('inventory_items')
    .select('id, user_id, quantity, available_quantity, cost_basis_unit, item_type, status')
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)
    .single()

  if (itemResponse.error || !itemResponse.data) {
    redirect('/app/inventory?error=Inventory item not found')
  }

  const item = itemResponse.data
  const oldQuantity = Number(item.quantity ?? 0)
  const oldAvailableQuantity = Number(item.available_quantity ?? 0)
  const soldQuantity = Math.max(0, oldQuantity - oldAvailableQuantity)

  const parsedQuantity = Number(quantityRaw || oldQuantity)
  const newQuantity = Number.isFinite(parsedQuantity) ? parsedQuantity : oldQuantity

  const editBasePath = cameFromBreak
    ? `/app/inventory/${inventoryItemId}/edit?from=break&break_id=${encodeURIComponent(breakId)}`
    : `/app/inventory/${inventoryItemId}/edit`

  if (newQuantity < 1) {
    redirect(`${editBasePath}&error=${encodeURIComponent('Quantity must be at least 1')}`)
  }

  if (newQuantity < soldQuantity) {
    redirect(
      `${editBasePath}&error=${encodeURIComponent(
        `Quantity cannot be lower than sold quantity (${soldQuantity})`
      )}`
    )
  }

  const newAvailableQuantity = newQuantity - soldQuantity
  const costBasisUnit = Number(item.cost_basis_unit ?? 0)
  const year = yearRaw ? Number(yearRaw) : null

  const costBasisTotal = Number((costBasisUnit * newQuantity).toFixed(2))
  const estimatedValueTotal = Number((estimatedValueUnit * newQuantity).toFixed(2))

  const updateResponse = await supabase
    .from('inventory_items')
    .update({
      title: title || null,
      player_name: playerName || null,
      year: year && !Number.isNaN(year) ? year : null,
      brand: brand || null,
      set_name: setName || null,
      card_number: cardNumber || null,
      parallel_name: parallelName || null,
      team: team || null,
      quantity: newQuantity,
      available_quantity: newAvailableQuantity,
      storage_location: storageLocation || null,
      estimated_value_unit: estimatedValueUnit,
      estimated_value_total: estimatedValueTotal,
      cost_basis_total: costBasisTotal,
      notes: notes || null,
    })
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)

  if (updateResponse.error) {
    redirect(`${editBasePath}&error=${encodeURIComponent(updateResponse.error.message)}`)
  }

  if (cameFromBreak) {
    redirect(
      `/app/breaks/${encodeURIComponent(
        breakId
      )}?success=${encodeURIComponent('Card updated successfully')}`
    )
  }

  redirect(`/app/inventory/${inventoryItemId}`)
}