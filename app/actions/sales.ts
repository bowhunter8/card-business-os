'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function safeText(value: FormDataEntryValue | null) {
  return String(value ?? '').trim()
}

function safeNumber(value: FormDataEntryValue | null) {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num : 0
}

export async function createSaleAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const inventoryItemId = safeText(formData.get('inventory_item_id'))
  const saleDate = safeText(formData.get('sale_date'))
  const quantitySold = safeNumber(formData.get('quantity_sold'))

  const itemSalePrice = safeNumber(formData.get('gross_sale'))
  const shippingChargedInput = safeNumber(formData.get('shipping_charged'))
  const platformFees = safeNumber(formData.get('platform_fees'))
  const shippingCostInput = safeNumber(formData.get('shipping_cost'))
  const suppliesCostInput = safeNumber(formData.get('supplies_cost'))
  const otherCosts = safeNumber(formData.get('other_costs'))

  const platform = safeText(formData.get('platform'))
  const notes = safeText(formData.get('notes'))
  const shippingProfileId = safeText(formData.get('shipping_profile_id'))

  if (!inventoryItemId) {
    redirect('/app/inventory?error=Missing inventory item id')
  }

  if (!saleDate) {
    redirect(`/app/sales/new?inventory_item_id=${inventoryItemId}&error=Sale date is required`)
  }

  if (quantitySold < 1) {
    redirect(`/app/sales/new?inventory_item_id=${inventoryItemId}&error=Quantity sold must be at least 1`)
  }

  let shippingCharged = shippingChargedInput
  let shippingCost = shippingCostInput
  let suppliesCost = suppliesCostInput

  if (shippingProfileId) {
    const shippingProfileRes = await supabase
      .from('shipping_profiles')
      .select('shipping_charged_default, cost, supplies_cost_default')
      .eq('id', shippingProfileId)
      .eq('user_id', user.id)
      .single()

    if (!shippingProfileRes.error && shippingProfileRes.data) {
      shippingCharged = Number(shippingProfileRes.data.shipping_charged_default ?? 0)
      shippingCost = Number(shippingProfileRes.data.cost ?? 0)
      suppliesCost = Number(shippingProfileRes.data.supplies_cost_default ?? 0)
    }
  }

  const itemResponse = await supabase
    .from('inventory_items')
    .select(`
      id,
      title,
      player_name,
      year,
      set_name,
      card_number,
      notes,
      status,
      quantity,
      available_quantity,
      cost_basis_unit,
      cost_basis_total,
      source_type,
      source_break_id
    `)
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)
    .single()

  if (itemResponse.error || !itemResponse.data) {
    redirect('/app/inventory?error=Inventory item not found')
  }

  const item = itemResponse.data
  const availableQty = Number(item.available_quantity ?? 0)

  if (quantitySold > availableQty) {
    redirect(
      `/app/sales/new?inventory_item_id=${inventoryItemId}&error=Quantity sold exceeds available quantity`
    )
  }

  const grossSale = Number((itemSalePrice + shippingCharged).toFixed(2))
  const shippingTotalCosts = Number((shippingCost + suppliesCost).toFixed(2))
  const totalSellingCosts = Number(
    (platformFees + shippingTotalCosts + otherCosts).toFixed(2)
  )
  const netProceeds = Number((grossSale - totalSellingCosts).toFixed(2))

  const unitCost = Number(item.cost_basis_unit ?? 0)
  const cogs = Number((unitCost * quantitySold).toFixed(2))
  const profit = Number((netProceeds - cogs).toFixed(2))

  const newAvailableQty = availableQty - quantitySold
  const nextStatus = newAvailableQty > 0 ? 'available' : 'sold'

  const saleInsert = await supabase
    .from('sales')
    .insert({
      user_id: user.id,
      inventory_item_id: inventoryItemId,
      sale_date: saleDate,
      quantity_sold: quantitySold,
      gross_sale: grossSale,
      platform_fees: platformFees,
      shipping_cost: shippingTotalCosts,
      other_costs: otherCosts,
      net_proceeds: netProceeds,
      cost_of_goods_sold: cogs,
      profit,
      platform: platform || null,
      notes: notes || null,
    })
    .select('id')
    .single()

  if (saleInsert.error || !saleInsert.data) {
    redirect(
      `/app/sales/new?inventory_item_id=${inventoryItemId}&error=${encodeURIComponent(
        saleInsert.error?.message ?? 'Could not record sale'
      )}`
    )
  }

  const updateInventory = await supabase
    .from('inventory_items')
    .update({
      available_quantity: newAvailableQty,
      status: nextStatus,
    })
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)

  if (updateInventory.error) {
    redirect(
      `/app/sales/new?inventory_item_id=${inventoryItemId}&error=${encodeURIComponent(
        updateInventory.error.message
      )}`
    )
  }

  await supabase.from('inventory_transactions').insert({
    user_id: user.id,
    inventory_item_id: inventoryItemId,
    transaction_type: 'sale',
    quantity_change: -quantitySold,
    to_status: nextStatus,
    linked_entity_type: 'sale',
    linked_entity_id: saleInsert.data.id,
    amount: grossSale,
    event_date: saleDate,
    notes:
      notes ||
      `Recorded sale. Shipping charged ${shippingCharged.toFixed(2)}, shipping cost ${shippingCost.toFixed(2)}, supplies ${suppliesCost.toFixed(2)}.`,
  })

  redirect('/app/sales?saved=1')
}