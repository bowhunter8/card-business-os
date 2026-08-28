'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAutomaticRestorePoint } from '@/lib/restore-points/createAutomaticRestorePoint'

function normalizeInventoryStatus(value: string) {
  if (value === 'personal') return 'personal'
  if (value === 'junk') return 'junk'
  if (value === 'listed') return 'listed'
  if (value === 'giveaway') return 'giveaway'
  return 'available'
}

function isSellableStatus(value: string) {
  return value === 'available' || value === 'listed'
}

function cleanText(value: string | number | null | undefined) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function cleanItemNumber(value: string | null | undefined) {
  return cleanText(value).replace(/^#+/, '').trim()
}

function buildInventoryTitle({
  fallbackTitle,
  playerName,
  year,
  setName,
  cardNumber,
}: {
  fallbackTitle: string
  playerName: string
  year: string | null
  setName: string
  cardNumber: string
}) {
  const itemName = cleanText(playerName)
  const yearText = cleanText(year)
  const setText = cleanText(setName)
  const itemNumber = cleanItemNumber(cardNumber)

  const structuredTitle = [itemName, yearText, setText, itemNumber].filter(Boolean).join(' ')

  return structuredTitle || cleanText(fallbackTitle) || itemName || null
}

export async function createInventoryItemAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const itemType = String(formData.get('item_type') ?? 'single_card').trim()
  const rawTitle = String(formData.get('title') ?? '').trim()
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

  const safeYear = cleanText(yearRaw) || null
  const title = buildInventoryTitle({
    fallbackTitle: rawTitle,
    playerName,
    year: safeYear,
    setName,
    cardNumber,
  })
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
      title,
      player_name: playerName || null,
      year: safeYear,
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
  const rawTitle = String(formData.get('title') ?? '').trim()
  const playerName = String(formData.get('player_name') ?? '').trim()
  const yearRaw = String(formData.get('year') ?? '').trim()
  const brand = String(formData.get('brand') ?? '').trim()
  const setName = String(formData.get('set_name') ?? '').trim()
  const cardNumber = String(formData.get('card_number') ?? '').trim()
  const parallelName = String(formData.get('parallel_name') ?? '').trim()
  const team = String(formData.get('team') ?? '').trim()
  const quantityRaw = String(formData.get('quantity') ?? '').trim()
  const statusRaw = String(formData.get('status') ?? '').trim()
  const storageLocation = String(formData.get('storage_location') ?? '').trim()
  const costBasisUnitInput = Number(formData.get('cost_basis_unit') ?? 0)
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
  const currentStatus = normalizeInventoryStatus(String(item.status ?? 'available'))

  const parsedQuantity = Number(quantityRaw || oldQuantity)
  const newQuantity = Number.isFinite(parsedQuantity) ? parsedQuantity : oldQuantity
  const normalizedStatus = normalizeInventoryStatus(statusRaw || currentStatus)

  const editBasePath = cameFromBreak
    ? `/app/inventory/${inventoryItemId}/edit?from=break&break_id=${encodeURIComponent(breakId)}`
    : `/app/inventory/${inventoryItemId}/edit`

  if (newQuantity < 1) {
    redirect(`${editBasePath}&error=${encodeURIComponent('Quantity must be at least 1')}`)
  }

  const salesResponse = await supabase
    .from('sales')
    .select('quantity_sold')
    .eq('user_id', user.id)
    .eq('inventory_item_id', inventoryItemId)
    .is('reversed_at', null)

  if (salesResponse.error) {
    redirect(
      `${editBasePath}&error=${encodeURIComponent(
        salesResponse.error.message || 'Could not validate item sales'
      )}`
    )
  }

  const activeSales = salesResponse.data ?? []
  const soldQuantity = activeSales.reduce(
    (sum, row) => sum + Number(row.quantity_sold ?? 0),
    0
  )

  if (newQuantity < soldQuantity) {
    redirect(
      `${editBasePath}&error=${encodeURIComponent(
        `Quantity cannot be lower than sold quantity (${soldQuantity})`
      )}`
    )
  }

  if (soldQuantity > 0 && !isSellableStatus(normalizedStatus)) {
    redirect(
      `${editBasePath}&error=${encodeURIComponent(
        'Items with existing sales cannot be switched to Personal or Junk until sold quantity is reversed or resolved.'
      )}`
    )
  }

  const newAvailableQuantity = isSellableStatus(normalizedStatus)
    ? Math.max(0, newQuantity - soldQuantity)
    : 0

  const costBasisUnit =
    Number.isFinite(costBasisUnitInput) && costBasisUnitInput >= 0
      ? costBasisUnitInput
      : Number(item.cost_basis_unit ?? 0)

  const safeYear = cleanText(yearRaw) || null
  const title = buildInventoryTitle({
    fallbackTitle: rawTitle,
    playerName,
    year: safeYear,
    setName,
    cardNumber,
  })

  const costBasisTotal = Number((costBasisUnit * newQuantity).toFixed(2))
  const estimatedValueTotal = Number((estimatedValueUnit * newQuantity).toFixed(2))

  await createAutomaticRestorePoint({
    userId: user.id,
    backupName: `Before Inventory Edit ${new Date().toLocaleString()}`,
    backupType: 'automatic',
    metadata: {
      source: 'updateInventoryItemAction',
      inventory_item_id: inventoryItemId,
    },
  })

  const updateResponse = await supabase
    .from('inventory_items')
    .update({
      title,
      player_name: playerName || null,
      year: safeYear,
      brand: brand || null,
      set_name: setName || null,
      card_number: cardNumber || null,
      parallel_name: parallelName || null,
      team: team || null,
      quantity: newQuantity,
      available_quantity: newAvailableQuantity,
      status: normalizedStatus,
      storage_location: storageLocation || null,
      estimated_value_unit: estimatedValueUnit,
      estimated_value_total: estimatedValueTotal,
      cost_basis_unit: costBasisUnit,
      cost_basis_total: costBasisTotal,
      notes: notes || null,
    })
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)

  if (updateResponse.error) {
    redirect(`${editBasePath}&error=${encodeURIComponent(updateResponse.error.message)}`)
  }

  const statusChanged = normalizedStatus !== currentStatus

  if (statusChanged) {
    await supabase.from('inventory_transactions').insert({
      user_id: user.id,
      inventory_item_id: inventoryItemId,
      transaction_type: 'adjustment',
      quantity_change: 0,
      to_status: normalizedStatus,
      amount: 0,
      event_date: new Date().toISOString().slice(0, 10),
      notes:
        normalizedStatus === 'giveaway'
          ? `Inventory moved to giveaway (marketing). Do not also deduct separately as expense.`
          : normalizedStatus === 'personal'
            ? `Inventory moved to personal collection. Treated as withdrawal, not deductible.`
            : normalizedStatus === 'junk'
              ? `Inventory marked as junk. No deduction taken until final disposal or donation.`
              : `Inventory status changed from ${currentStatus} to ${normalizedStatus}`,
    })
  }

  if (cameFromBreak) {
    redirect(
      `/app/breaks/${encodeURIComponent(
        breakId
      )}?success=${encodeURIComponent('Card updated successfully')}`
    )
  }

  redirect(
    `/app/inventory/${inventoryItemId}?success=${encodeURIComponent(
      'Item updated successfully'
    )}`
  )
}

type InventoryMovementType = 'personal' | 'giveaway' | 'junk'

type InventoryMovementConfig = {
  status: 'personal' | 'giveaway' | 'junk'
  label: string
  backupSource: string
  defaultNotes: string
}

const INVENTORY_MOVEMENT_CONFIG: Record<InventoryMovementType, InventoryMovementConfig> = {
  personal: {
    status: 'personal',
    label: 'Moved to Personal Collection',
    backupSource: 'moveToPersonalAction',
    defaultNotes: 'Inventory moved to personal collection. Treated as owner withdrawal, not deductible.',
  },
  giveaway: {
    status: 'giveaway',
    label: 'Marked as Giveaway',
    backupSource: 'markAsGiveawayAction',
    defaultNotes: 'Inventory moved to giveaway/marketing use. Review advertising or marketing expense treatment separately.',
  },
  junk: {
    status: 'junk',
    label: 'Disposed / Junked',
    backupSource: 'disposeInventoryAction',
    defaultNotes: 'Inventory removed from active inventory as damaged, lost, destroyed, or unsellable.',
  },
}

function buildInventoryMovementNotes({
  config,
  reason,
  notes,
}: {
  config: InventoryMovementConfig
  reason: string
  notes: string
}) {
  return [
    config.defaultNotes,
    reason ? `Reason: ${reason}` : '',
    notes ? `Notes: ${notes}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

async function inventoryMovementActionBase(
  formData: FormData,
  movementType: InventoryMovementType
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const config = INVENTORY_MOVEMENT_CONFIG[movementType]
  const inventoryItemId = String(formData.get('inventory_item_id') ?? '').trim()
  const quantityRaw = Number(formData.get('quantity_to_move') ?? 1)
  const reason = String(formData.get('reason') ?? '').trim()
  const notes = String(formData.get('movement_notes') ?? '').trim()

  if (!inventoryItemId) {
    redirect('/app/inventory?error=Missing inventory item id')
  }

  const itemResponse = await supabase
    .from('inventory_items')
    .select('id, user_id, status, available_quantity, cost_basis_unit')
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)
    .single()

  if (itemResponse.error || !itemResponse.data) {
    redirect(
      `/app/inventory/${inventoryItemId}?error=${encodeURIComponent(
        itemResponse.error?.message ?? 'Inventory item could not be found.'
      )}`
    )
  }

  const item = itemResponse.data
  const availableQuantity = Math.max(0, Number(item.available_quantity ?? 0))
  const quantityToMove = Math.max(
    1,
    Math.floor(Number.isFinite(quantityRaw) ? quantityRaw : 1)
  )

  if (availableQuantity <= 0) {
    redirect(
      `/app/inventory/${inventoryItemId}?error=${encodeURIComponent(
        'No available quantity remains to move.'
      )}`
    )
  }

  if (quantityToMove > availableQuantity) {
    redirect(
      `/app/inventory/${inventoryItemId}?error=${encodeURIComponent(
        'Quantity cannot be greater than available quantity.'
      )}`
    )
  }

  const currentStatus = normalizeInventoryStatus(String(item.status ?? 'available'))
  const nextAvailableQuantity = availableQuantity - quantityToMove
  const nextStatus = nextAvailableQuantity > 0 ? currentStatus : config.status
  const unitCost = Number(item.cost_basis_unit ?? 0)
  const movedCostBasis = Number((unitCost * quantityToMove).toFixed(2))
  const eventDate = new Date().toISOString().slice(0, 10)

  await createAutomaticRestorePoint({
    userId: user.id,
    backupName: `Before Inventory Movement ${new Date().toLocaleString()}`,
    backupType: 'automatic',
    metadata: {
      source: config.backupSource,
      inventory_item_id: inventoryItemId,
      movement_type: movementType,
      quantity_to_move: quantityToMove,
    },
  })

  const updateResponse = await supabase
    .from('inventory_items')
    .update({
      available_quantity: nextAvailableQuantity,
      status: nextStatus,
    })
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)

  if (updateResponse.error) {
    redirect(
      `/app/inventory/${inventoryItemId}?error=${encodeURIComponent(updateResponse.error.message)}`
    )
  }

  const transactionNotes = buildInventoryMovementNotes({
    config,
    reason,
    notes,
  })

  const transactionResponse = await supabase.from('inventory_transactions').insert({
    user_id: user.id,
    inventory_item_id: inventoryItemId,
    transaction_type: 'adjustment',
    quantity_change: -quantityToMove,
    to_status: config.status,
    amount: movedCostBasis,
    event_date: eventDate,
    notes: transactionNotes,
  })

  if (transactionResponse.error) {
    redirect(
      `/app/inventory/${inventoryItemId}?error=${encodeURIComponent(transactionResponse.error.message)}`
    )
  }

  redirect(
    `/app/inventory/${inventoryItemId}?success=${encodeURIComponent(
      `${config.label} recorded successfully.`
    )}`
  )
}

export async function moveToPersonalAction(formData: FormData) {
  await inventoryMovementActionBase(formData, 'personal')
}

export async function markAsGiveawayAction(formData: FormData) {
  await inventoryMovementActionBase(formData, 'giveaway')
}

export async function disposeInventoryAction(formData: FormData) {
  await inventoryMovementActionBase(formData, 'junk')
}

