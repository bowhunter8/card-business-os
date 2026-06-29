'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type GiveawayInventoryItem = {
  id: string
  title: string | null
  player_name: string | null
  quantity: number | null
  available_quantity: number | null
  cost_basis_unit: number | null
  cost_basis_total: number | null
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function safeText(value: FormDataEntryValue | null) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function safeDate(value: FormDataEntryValue | null) {
  const raw = safeText(value)
  if (!raw) return new Date().toISOString().slice(0, 10)

  const date = new Date(`${raw}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10)
  }

  return raw.slice(0, 10)
}

function safePositiveInteger(value: FormDataEntryValue | null) {
  const raw = safeText(value)
  const parsed = Number(raw)

  if (!Number.isFinite(parsed)) return Number.NaN

  return Math.floor(parsed)
}

function labelFromValue(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function giveawayUnitCost(item: GiveawayInventoryItem) {
  const quantity = Number(item.quantity ?? 0)
  const unitCost = Number(item.cost_basis_unit ?? 0)
  const totalCost = Number(item.cost_basis_total ?? 0)

  if (unitCost > 0) {
    return roundMoney(unitCost)
  }

  if (quantity > 0 && totalCost > 0) {
    return roundMoney(totalCost / quantity)
  }

  return 0
}

function giveawayErrorRedirect(inventoryItemId: string, message: string): never {
  redirect(
    `/app/inventory/${inventoryItemId}/giveaway?error=${encodeURIComponent(message)}`
  )
}

function buildGiveawayExpenseCategory(giveawayTypeLabel: string) {
  const normalized = giveawayTypeLabel.toLowerCase()

  if (
    normalized.includes('buyer') ||
    normalized.includes('givvy') ||
    normalized.includes('giveaway') ||
    normalized.includes('appreciation') ||
    normalized.includes('stream') ||
    normalized.includes('promotion') ||
    normalized.includes('customer') ||
    normalized.includes('contest') ||
    normalized.includes('prize')
  ) {
    return `Advertising / Marketing - Giveaway - ${giveawayTypeLabel}`
  }

  return 'Advertising / Marketing - Giveaway'
}

export async function markAsGiveawayAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const inventoryItemId = safeText(formData.get('inventory_item_id'))

  if (!inventoryItemId) {
    redirect('/app/inventory?error=Missing inventory item ID')
  }

  const giveawayDate = safeDate(formData.get('giveaway_date'))
  const giveawayType = safeText(formData.get('giveaway_type')) || 'other'
  const recipientType = safeText(formData.get('recipient_type')) || 'not_recorded'
  const campaignEvent = safeText(formData.get('campaign_event'))
  const relatedOrder = safeText(formData.get('related_order'))
  const businessPurpose = safeText(formData.get('business_purpose'))
  const giveawayNotes = safeText(formData.get('giveaway_notes'))

  if (!businessPurpose) {
    giveawayErrorRedirect(inventoryItemId, 'Business purpose is required for giveaway records.')
  }

  const { data: item, error: itemError } = await supabase
    .from('inventory_items')
    .select(
      'id, title, player_name, quantity, available_quantity, cost_basis_unit, cost_basis_total'
    )
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)
    .single<GiveawayInventoryItem>()

  if (itemError || !item) {
    giveawayErrorRedirect(
      inventoryItemId,
      itemError?.message || 'Inventory item not found.'
    )
  }

  const availableQuantity = Math.max(0, Number(item.available_quantity ?? 0))
  const requestedGiveawayQuantity = safePositiveInteger(formData.get('giveaway_quantity'))
  const givenAwayQuantity = Number.isFinite(requestedGiveawayQuantity)
    ? requestedGiveawayQuantity
    : availableQuantity

  if (availableQuantity <= 0) {
    giveawayErrorRedirect(inventoryItemId, 'This item has no available quantity to give away.')
  }

  if (givenAwayQuantity <= 0) {
    giveawayErrorRedirect(inventoryItemId, 'Quantity given away must be at least 1.')
  }

  if (givenAwayQuantity > availableQuantity) {
    giveawayErrorRedirect(
      inventoryItemId,
      `Quantity given away cannot be more than the available quantity (${availableQuantity}).`
    )
  }

  const unitCost = giveawayUnitCost(item)
  const amount = roundMoney(givenAwayQuantity * unitCost)
  const remainingQuantity = Math.max(0, availableQuantity - givenAwayQuantity)
  const itemName = item.title || item.player_name || 'Inventory Item'
  const updatedAt = new Date().toISOString()
  const giveawayTypeLabel = labelFromValue(giveawayType)
  const recipientTypeLabel = labelFromValue(recipientType)
  const giveawayExpenseCategory = buildGiveawayExpenseCategory(giveawayTypeLabel)
  const isFullyGivenAway = remainingQuantity <= 0

  const detailLines = [
    `Giveaway Type: ${giveawayTypeLabel}`,
    `Business Purpose: ${businessPurpose}`,
    `Recipient Type: ${recipientTypeLabel}`,
    campaignEvent ? `Campaign / Event: ${campaignEvent}` : null,
    relatedOrder ? `Related Order / Sale #: ${relatedOrder}` : null,
    giveawayNotes ? `Notes: ${giveawayNotes}` : null,
  ].filter(Boolean)

  const sharedAuditNote = [
    `Inventory giveaway recorded for advertising / marketing support.`,
    `Item: ${itemName}.`,
    `Quantity given away: ${givenAwayQuantity}.`,
    `Quantity remaining after giveaway: ${remainingQuantity}.`,
    `Cost basis recorded: ${amount.toFixed(2)}.`,
    ...detailLines,
    isFullyGivenAway
      ? `This giveaway item is now fully given away and locked for tax support.`
      : `This item remains a planned giveaway until all available quantity has been finalized.`,
    `Do not also deduct this item as COGS, disposal, donation, or another separate expense.`,
  ].join(' ')

  const { error: updateError } = await supabase
    .from('inventory_items')
    .update({
      status: 'giveaway',
      available_quantity: remainingQuantity,
      updated_at: updatedAt,
    })
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)

  if (updateError) {
    giveawayErrorRedirect(inventoryItemId, updateError.message)
  }

  const { error: expenseError } = await supabase.from('expenses').insert({
    user_id: user.id,
    expense_date: giveawayDate,
    category: giveawayExpenseCategory,
    amount,
    notes: sharedAuditNote,
  })

  if (expenseError) {
    giveawayErrorRedirect(inventoryItemId, expenseError.message)
  }

  const { error: transactionError } = await supabase
    .from('inventory_transactions')
    .insert({
      user_id: user.id,
      inventory_item_id: inventoryItemId,
      transaction_type: 'adjustment',
      quantity_change: -Math.abs(givenAwayQuantity),
      to_status: isFullyGivenAway ? 'giveaway' : 'planned_giveaway',
      amount,
      event_date: giveawayDate,
      notes: sharedAuditNote,
    })

  if (transactionError) {
    giveawayErrorRedirect(inventoryItemId, transactionError.message)
  }

  revalidatePath('/app/inventory')
  revalidatePath(`/app/inventory/${inventoryItemId}`)
  revalidatePath(`/app/inventory/${inventoryItemId}/giveaway`)
  revalidatePath('/app/expenses')
  revalidatePath('/app/reports/tax')
  revalidatePath('/app/reports/tax/summary')
  revalidatePath('/app/reports/profit-loss')
  revalidatePath('/app/reports/cpa-packet')

  redirect(
    `/app/inventory/${inventoryItemId}?success=${encodeURIComponent(
      isFullyGivenAway
        ? 'Giveaway recorded with tax support details'
        : `Partial giveaway recorded. ${remainingQuantity} remaining.`
    )}&giveaway=${Date.now()}`
  )
}
