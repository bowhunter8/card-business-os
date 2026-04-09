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

async function requireUser() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return { supabase, user }
}

export async function createSaleAction(formData: FormData) {
  const { supabase, user } = await requireUser()

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

export async function updateSaleAction(formData: FormData) {
  const { supabase, user } = await requireUser()

  const saleId = safeText(formData.get('sale_id'))
  const inventoryItemId = safeText(formData.get('inventory_item_id'))
  const saleDate = safeText(formData.get('sale_date'))
  const quantitySold = safeNumber(formData.get('quantity_sold'))
  const grossSale = safeNumber(formData.get('gross_sale'))
  const platformFees = safeNumber(formData.get('platform_fees'))
  const shippingCost = safeNumber(formData.get('shipping_cost'))
  const otherCosts = safeNumber(formData.get('other_costs'))
  const platform = safeText(formData.get('platform'))
  const notes = safeText(formData.get('notes'))

  if (!saleId) {
    redirect('/app/sales?error=Missing sale id')
  }

  if (!inventoryItemId) {
    redirect('/app/sales?error=Missing inventory item id')
  }

  if (!saleDate) {
    redirect(`/app/sales/${saleId}/edit?error=Sale date is required`)
  }

  if (quantitySold < 1) {
    redirect(`/app/sales/${saleId}/edit?error=Quantity sold must be at least 1`)
  }

  const [saleResponse, itemResponse] = await Promise.all([
    supabase
      .from('sales')
      .select(`
        id,
        inventory_item_id,
        quantity_sold,
        gross_sale,
        platform_fees,
        shipping_cost,
        other_costs,
        net_proceeds,
        cost_of_goods_sold,
        profit,
        reversed_at
      `)
      .eq('id', saleId)
      .eq('user_id', user.id)
      .single(),

    supabase
      .from('inventory_items')
      .select(`
        id,
        available_quantity,
        quantity,
        cost_basis_unit,
        status
      `)
      .eq('id', inventoryItemId)
      .eq('user_id', user.id)
      .single(),
  ])

  if (saleResponse.error || !saleResponse.data) {
    redirect('/app/sales?error=Sale not found')
  }

  if (itemResponse.error || !itemResponse.data) {
    redirect('/app/inventory?error=Inventory item not found')
  }

  const existingSale = saleResponse.data
  const item = itemResponse.data

  if (existingSale.reversed_at) {
    redirect(`/app/sales/${saleId}/edit?error=Cannot edit a deleted/reversed sale`)
  }

  const oldQtySold = Number(existingSale.quantity_sold ?? 0)
  const currentAvailableQty = Number(item.available_quantity ?? 0)
  const editableMaxQty = currentAvailableQty + oldQtySold

  if (quantitySold > editableMaxQty) {
    redirect(`/app/sales/${saleId}/edit?error=Quantity sold exceeds editable max quantity`)
  }

  const unitCost = Number(item.cost_basis_unit ?? 0)
  const netProceeds = Number(
    (grossSale - platformFees - shippingCost - otherCosts).toFixed(2)
  )
  const cogs = Number((unitCost * quantitySold).toFixed(2))
  const profit = Number((netProceeds - cogs).toFixed(2))

  const restoredAvailableQty = currentAvailableQty + oldQtySold
  const newAvailableQty = restoredAvailableQty - quantitySold
  const nextStatus = newAvailableQty > 0 ? 'available' : 'sold'

  const saleUpdate = await supabase
    .from('sales')
    .update({
      sale_date: saleDate,
      quantity_sold: quantitySold,
      gross_sale: grossSale,
      platform_fees: platformFees,
      shipping_cost: shippingCost,
      other_costs: otherCosts,
      net_proceeds: netProceeds,
      cost_of_goods_sold: cogs,
      profit,
      platform: platform || null,
      notes: notes || null,
      reversed_at: null,
    })
    .eq('id', saleId)
    .eq('user_id', user.id)

  if (saleUpdate.error) {
    redirect(`/app/sales/${saleId}/edit?error=${encodeURIComponent(saleUpdate.error.message)}`)
  }

  const inventoryUpdate = await supabase
    .from('inventory_items')
    .update({
      available_quantity: newAvailableQty,
      status: nextStatus,
    })
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)

  if (inventoryUpdate.error) {
    redirect(`/app/sales/${saleId}/edit?error=${encodeURIComponent(inventoryUpdate.error.message)}`)
  }

  await supabase.from('inventory_transactions').insert({
    user_id: user.id,
    inventory_item_id: inventoryItemId,
    transaction_type: 'sale_edit',
    quantity_change: oldQtySold - quantitySold,
    to_status: nextStatus,
    linked_entity_type: 'sale',
    linked_entity_id: saleId,
    amount: grossSale,
    event_date: saleDate,
    notes:
      notes ||
      `Edited sale. Previous qty ${oldQtySold}, new qty ${quantitySold}.`,
  })

  redirect(`/app/inventory/${inventoryItemId}?updatedSale=1`)
}

export async function deleteSaleAction(formData: FormData) {
  const { supabase, user } = await requireUser()

  const saleId = safeText(formData.get('sale_id'))
  const inventoryItemId = safeText(formData.get('inventory_item_id'))

  if (!saleId) {
    redirect('/app/sales?error=Missing sale id')
  }

  if (!inventoryItemId) {
    redirect('/app/sales?error=Missing inventory item id')
  }

  const [saleResponse, itemResponse] = await Promise.all([
    supabase
      .from('sales')
      .select(`
        id,
        inventory_item_id,
        sale_date,
        quantity_sold,
        gross_sale,
        notes,
        reversed_at
      `)
      .eq('id', saleId)
      .eq('user_id', user.id)
      .single(),

    supabase
      .from('inventory_items')
      .select(`
        id,
        available_quantity,
        quantity,
        status
      `)
      .eq('id', inventoryItemId)
      .eq('user_id', user.id)
      .single(),
  ])

  if (saleResponse.error || !saleResponse.data) {
    redirect('/app/sales?error=Sale not found')
  }

  if (itemResponse.error || !itemResponse.data) {
    redirect('/app/inventory?error=Inventory item not found')
  }

  const sale = saleResponse.data
  const item = itemResponse.data

  if (sale.reversed_at) {
    redirect(`/app/inventory/${inventoryItemId}?error=Sale already deleted`)
  }

  const qtySold = Number(sale.quantity_sold ?? 0)
  const currentAvailableQty = Number(item.available_quantity ?? 0)
  const restoredAvailableQty = currentAvailableQty + qtySold
  const nextStatus = restoredAvailableQty > 0 ? 'available' : 'sold'

  const saleDelete = await supabase
    .from('sales')
    .update({
      reversed_at: new Date().toISOString(),
    })
    .eq('id', saleId)
    .eq('user_id', user.id)

  if (saleDelete.error) {
    redirect(`/app/sales/${saleId}/edit?error=${encodeURIComponent(saleDelete.error.message)}`)
  }

  const inventoryUpdate = await supabase
    .from('inventory_items')
    .update({
      available_quantity: restoredAvailableQty,
      status: nextStatus,
    })
    .eq('id', inventoryItemId)
    .eq('user_id', user.id)

  if (inventoryUpdate.error) {
    redirect(`/app/sales/${saleId}/edit?error=${encodeURIComponent(inventoryUpdate.error.message)}`)
  }

  await supabase.from('inventory_transactions').insert({
    user_id: user.id,
    inventory_item_id: inventoryItemId,
    transaction_type: 'sale_delete',
    quantity_change: qtySold,
    to_status: nextStatus,
    linked_entity_type: 'sale',
    linked_entity_id: saleId,
    amount: Number(sale.gross_sale ?? 0),
    event_date: sale.sale_date,
    notes: sale.notes || 'Sale deleted/reversed from edit screen.',
  })

  redirect(`/app/inventory/${inventoryItemId}?deletedSale=1`)
}