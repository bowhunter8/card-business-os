'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

function asMoney(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function asInt(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback
}

export async function createStartingInventoryItemAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const itemType = String(formData.get('item_type') ?? 'single_card').trim()
  const destination = String(formData.get('destination') ?? 'sell').trim()
  const title = String(formData.get('title') ?? '').trim()
  const playerName = String(formData.get('player_name') ?? '').trim()
  const yearRaw = String(formData.get('year') ?? '').trim()
  const brand = String(formData.get('brand') ?? '').trim()
  const setName = String(formData.get('set_name') ?? '').trim()
  const cardNumber = String(formData.get('card_number') ?? '').trim()
  const parallelName = String(formData.get('parallel_name') ?? '').trim()
  const variation = String(formData.get('variation') ?? '').trim()
  const team = String(formData.get('team') ?? '').trim()

  const rookieFlag = formData.get('rookie_flag') === 'on'
  const autoFlag = formData.get('auto_flag') === 'on'
  const relicFlag = formData.get('relic_flag') === 'on'
  const serialNumberText = String(formData.get('serial_number_text') ?? '').trim()
  const serialFlag = !!serialNumberText

  const conditionNote = String(formData.get('condition_note') ?? '').trim()
  const grader = String(formData.get('grader') ?? '').trim()
  const grade = String(formData.get('grade') ?? '').trim()

  const quantity = asInt(formData.get('quantity'), 1)
  const costBasisUnit = asMoney(formData.get('cost_basis_unit'))
  const estimatedValueUnitRaw = formData.get('estimated_value_unit')
  const estimatedValueUnit =
    estimatedValueUnitRaw === null || String(estimatedValueUnitRaw).trim() === ''
      ? null
      : asMoney(estimatedValueUnitRaw)

  const costBasisMethod = String(formData.get('cost_basis_method') ?? 'estimated_legacy').trim()
  const acquisitionSource = String(formData.get('acquisition_source') ?? '').trim()
  const acquiredDate = String(formData.get('acquired_date') ?? '').trim()
  const storageLocation = String(formData.get('storage_location') ?? '').trim()
  const taxLotMethod = String(formData.get('tax_lot_method') ?? 'specific').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const taxNotes = String(formData.get('tax_notes') ?? '').trim()

  if (quantity < 1) {
    redirect('/app/starting-inventory/new?error=Quantity must be at least 1')
  }

  if (!title && !playerName) {
    redirect('/app/starting-inventory/new?error=Enter at least a title or player name')
  }

  const year = yearRaw ? Number(yearRaw) : null
  const validYear = year && !Number.isNaN(year) ? year : null
  const costBasisTotal = Number((costBasisUnit * quantity).toFixed(2))
  const estimatedValueTotal =
    estimatedValueUnit === null ? null : Number((estimatedValueUnit * quantity).toFixed(2))

  const insertResponse = await supabase
    .from('starting_inventory_items')
    .insert({
      user_id: user.id,
      status: 'draft',
      destination: destination === 'personal' ? 'personal' : 'sell',
      item_type: itemType || 'single_card',
      title: title || null,
      player_name: playerName || null,
      year: validYear,
      brand: brand || null,
      set_name: setName || null,
      card_number: cardNumber || null,
      parallel_name: parallelName || null,
      variation: variation || null,
      team: team || null,
      rookie_flag: rookieFlag,
      auto_flag: autoFlag,
      relic_flag: relicFlag,
      serial_flag: serialFlag,
      serial_number_text: serialNumberText || null,
      condition_note: conditionNote || null,
      grader: grader || null,
      grade: grade || null,
      quantity,
      cost_basis_unit: costBasisUnit,
      cost_basis_total: costBasisTotal,
      estimated_value_unit: estimatedValueUnit,
      estimated_value_total: estimatedValueTotal,
      cost_basis_method: costBasisMethod || 'estimated_legacy',
      acquisition_source: acquisitionSource || null,
      acquired_date: acquiredDate || null,
      storage_location: storageLocation || null,
      tax_lot_method: taxLotMethod || 'specific',
      notes: notes || null,
      tax_notes: taxNotes || null,
    })
    .select('id')
    .single()

  if (insertResponse.error || !insertResponse.data) {
    redirect(
      `/app/starting-inventory/new?error=${encodeURIComponent(
        insertResponse.error?.message ?? 'Could not create starting inventory item'
      )}`
    )
  }

  revalidatePath('/app/starting-inventory')
  redirect(`/app/starting-inventory?created=${insertResponse.data.id}`)
}

export async function importStartingInventoryItemAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const startingInventoryItemId = String(formData.get('starting_inventory_item_id') ?? '').trim()

  if (!startingInventoryItemId) {
    redirect('/app/starting-inventory?error=Missing starting inventory item id')
  }

  const itemResponse = await supabase
    .from('starting_inventory_items')
    .select('*')
    .eq('id', startingInventoryItemId)
    .eq('user_id', user.id)
    .single()

  if (itemResponse.error || !itemResponse.data) {
    redirect('/app/starting-inventory?error=Starting inventory item not found')
  }

  const item = itemResponse.data

  if (item.status === 'imported' && item.imported_inventory_item_id) {
    redirect(`/app/inventory/${item.imported_inventory_item_id}`)
  }

  const inventoryStatus = item.destination === 'personal' ? 'personal' : 'available'
  const availableQuantity = item.destination === 'personal' ? 0 : Number(item.quantity ?? 0)

  const inventoryInsert = await supabase
    .from('inventory_items')
    .insert({
      user_id: user.id,
      source_type: 'starting_inventory',
      source_reference: item.id,
      item_type: item.item_type,
      status: inventoryStatus,
      quantity: item.quantity,
      available_quantity: availableQuantity,
      title: item.title,
      player_name: item.player_name,
      year: item.year,
      brand: item.brand,
      set_name: item.set_name,
      card_number: item.card_number,
      parallel_name: item.parallel_name,
      variation: item.variation,
      team: item.team,
      rookie_flag: item.rookie_flag,
      auto_flag: item.auto_flag,
      relic_flag: item.relic_flag,
      serial_flag: item.serial_flag,
      serial_number_text: item.serial_number_text,
      condition_note: item.condition_note,
      grader: item.grader,
      grade: item.grade,
      purchase_source: item.acquisition_source,
      cost_basis_unit: item.cost_basis_unit ?? 0,
      cost_basis_total: item.cost_basis_total ?? 0,
      estimated_value_unit: item.estimated_value_unit,
      estimated_value_total: item.estimated_value_total,
      storage_location: item.storage_location,
      tax_lot_method: item.tax_lot_method ?? 'specific',
      notes: item.notes,
    })
    .select('id, cost_basis_total')
    .single()

  if (inventoryInsert.error || !inventoryInsert.data) {
    redirect(
      `/app/starting-inventory?error=${encodeURIComponent(
        inventoryInsert.error?.message ?? 'Could not import starting inventory item'
      )}`
    )
  }

  const transactionInsert = await supabase.from('inventory_transactions').insert({
    user_id: user.id,
    inventory_item_id: inventoryInsert.data.id,
    transaction_type: 'opening_inventory_add',
    quantity_change: item.quantity ?? 0,
    to_status: inventoryStatus,
    amount: inventoryInsert.data.cost_basis_total ?? 0,
    event_date: new Date().toISOString().slice(0, 10),
    linked_entity_type: 'starting_inventory',
    linked_entity_id: item.id,
    notes:
      item.destination === 'personal'
        ? 'Imported from starting inventory to personal collection'
        : 'Imported from starting inventory to sell inventory',
  })

  if (transactionInsert.error) {
    await supabase.from('inventory_items').delete().eq('id', inventoryInsert.data.id).eq('user_id', user.id)

    redirect(
      `/app/starting-inventory?error=${encodeURIComponent(
        transactionInsert.error.message
      )}`
    )
  }

  const updateStartingItem = await supabase
    .from('starting_inventory_items')
    .update({
      status: 'imported',
      imported_inventory_item_id: inventoryInsert.data.id,
      imported_at: new Date().toISOString(),
    })
    .eq('id', item.id)
    .eq('user_id', user.id)

  if (updateStartingItem.error) {
    redirect(
      `/app/starting-inventory?error=${encodeURIComponent(updateStartingItem.error.message)}`
    )
  }

  revalidatePath('/app/starting-inventory')
  revalidatePath('/app/inventory')
  redirect(`/app/inventory/${inventoryInsert.data.id}`)
}