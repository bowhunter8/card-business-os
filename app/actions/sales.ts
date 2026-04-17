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

function roundMoney(value: number) {
  return Number(value.toFixed(2))
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

type SaleCalculationInput = {
  itemSalePrice: number
  shippingCharged: number
  platformFees: number
  shippingCost: number
  suppliesCost: number
  otherCosts: number
  unitCost: number
  quantitySold: number
}

function calculateSaleNumbers(input: SaleCalculationInput) {
  const grossSale = roundMoney(input.itemSalePrice + input.shippingCharged)
  const shippingTotalCosts = roundMoney(input.shippingCost + input.suppliesCost)
  const totalSellingCosts = roundMoney(
    input.platformFees + shippingTotalCosts + input.otherCosts
  )
  const netProceeds = roundMoney(grossSale - totalSellingCosts)
  const cogs = roundMoney(input.unitCost * input.quantitySold)
  const profit = roundMoney(netProceeds - cogs)

  return {
    grossSale,
    shippingTotalCosts,
    totalSellingCosts,
    netProceeds,
    cogs,
    profit,
  }
}

async function getShippingDefaults({
  supabase,
  userId,
  shippingProfileId,
  shippingChargedInput,
  shippingCostInput,
  suppliesCostInput,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  shippingProfileId: string
  shippingChargedInput: number
  shippingCostInput: number
  suppliesCostInput: number
}) {
  let shippingCharged = shippingChargedInput
  let shippingCost = shippingCostInput
  let suppliesCost = suppliesCostInput

  if (shippingProfileId) {
    const shippingProfileRes = await supabase
      .from('shipping_profiles')
      .select('shipping_charged_default, supplies_cost_default')
      .eq('id', shippingProfileId)
      .eq('user_id', userId)
      .single()

    if (!shippingProfileRes.error && shippingProfileRes.data) {
      shippingCharged = Number(shippingProfileRes.data.shipping_charged_default ?? 0)
      suppliesCost = Number(shippingProfileRes.data.supplies_cost_default ?? 0)
      // Actual postage stays manual per sale by design.
      shippingCost = shippingCostInput
    }
  }

  return {
    shippingCharged,
    shippingCost,
    suppliesCost,
  }
}

async function getInventoryItemForSale({
  supabase,
  userId,
  inventoryItemId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  inventoryItemId: string
}) {
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
    .eq('user_id', userId)
    .single()

  if (itemResponse.error || !itemResponse.data) {
    return null
  }

  return itemResponse.data
}

async function insertSaleAndUpdateInventory({
  supabase,
  userId,
  inventoryItemId,
  saleDate,
  quantitySold,
  grossSale,
  platformFees,
  shippingTotalCosts,
  otherCosts,
  netProceeds,
  cogs,
  profit,
  platform,
  notes,
  newAvailableQty,
  nextStatus,
  shippingCharged,
  shippingCost,
  suppliesCost,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  inventoryItemId: string
  saleDate: string
  quantitySold: number
  grossSale: number
  platformFees: number
  shippingTotalCosts: number
  otherCosts: number
  netProceeds: number
  cogs: number
  profit: number
  platform: string
  notes: string
  newAvailableQty: number
  nextStatus: string
  shippingCharged: number
  shippingCost: number
  suppliesCost: number
}) {
  const saleInsert = await supabase
    .from('sales')
    .insert({
      user_id: userId,
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
    return {
      ok: false as const,
      error: saleInsert.error?.message ?? 'Could not record sale',
    }
  }

  const updateInventory = await supabase
    .from('inventory_items')
    .update({
      available_quantity: newAvailableQty,
      status: nextStatus,
    })
    .eq('id', inventoryItemId)
    .eq('user_id', userId)

  if (updateInventory.error) {
    return {
      ok: false as const,
      error: updateInventory.error.message,
    }
  }

  await supabase.from('inventory_transactions').insert({
    user_id: userId,
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
      `Recorded sale. Shipping charged ${shippingCharged.toFixed(2)}, postage ${shippingCost.toFixed(2)}, supplies ${suppliesCost.toFixed(2)}.`,
  })

  return {
    ok: true as const,
    saleId: saleInsert.data.id,
  }
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

  const { shippingCharged, shippingCost, suppliesCost } = await getShippingDefaults({
    supabase,
    userId: user.id,
    shippingProfileId,
    shippingChargedInput,
    shippingCostInput,
    suppliesCostInput,
  })

  const item = await getInventoryItemForSale({
    supabase,
    userId: user.id,
    inventoryItemId,
  })

  if (!item) {
    redirect('/app/inventory?error=Inventory item not found')
  }

  const availableQty = Number(item.available_quantity ?? 0)

  if (quantitySold > availableQty) {
    redirect(
      `/app/sales/new?inventory_item_id=${inventoryItemId}&error=Quantity sold exceeds available quantity`
    )
  }

  const unitCost = Number(item.cost_basis_unit ?? 0)

  const {
    grossSale,
    shippingTotalCosts,
    netProceeds,
    cogs,
    profit,
  } = calculateSaleNumbers({
    itemSalePrice,
    shippingCharged,
    platformFees,
    shippingCost,
    suppliesCost,
    otherCosts,
    unitCost,
    quantitySold,
  })

  const newAvailableQty = availableQty - quantitySold
  const nextStatus = newAvailableQty > 0 ? 'available' : 'sold'

  const result = await insertSaleAndUpdateInventory({
    supabase,
    userId: user.id,
    inventoryItemId,
    saleDate,
    quantitySold,
    grossSale,
    platformFees,
    shippingTotalCosts,
    otherCosts,
    netProceeds,
    cogs,
    profit,
    platform,
    notes,
    newAvailableQty,
    nextStatus,
    shippingCharged,
    shippingCost,
    suppliesCost,
  })

  if (!result.ok) {
    redirect(
      `/app/sales/new?inventory_item_id=${inventoryItemId}&error=${encodeURIComponent(result.error)}`
    )
  }

  redirect('/app/sales?saved=1')
}

export async function quickSellAction(formData: FormData) {
  const { supabase, user } = await requireUser()

  const inventoryItemId = safeText(formData.get('inventory_item_id'))
  const mode = safeText(formData.get('mode'))
  const saleDate = safeText(formData.get('sale_date')) || new Date().toISOString().slice(0, 10)

  const itemSalePrice = safeNumber(formData.get('gross_sale'))
  const shippingCharged = safeNumber(formData.get('shipping_charged'))
  const platformFees = safeNumber(formData.get('platform_fees'))
  const shippingCost = safeNumber(formData.get('shipping_cost'))
  const suppliesCost = safeNumber(formData.get('supplies_cost'))
  const otherCosts = safeNumber(formData.get('other_costs'))

  const platform = safeText(formData.get('platform'))
  const notes = safeText(formData.get('notes'))

  if (!inventoryItemId) {
    redirect('/app/inventory?error=Missing inventory item id')
  }

  const item = await getInventoryItemForSale({
    supabase,
    userId: user.id,
    inventoryItemId,
  })

  if (!item) {
    redirect('/app/inventory?error=Inventory item not found')
  }

  const availableQty = Number(item.available_quantity ?? 0)

  if (availableQty < 1) {
    redirect('/app/inventory?error=No available quantity to sell')
  }

  const quantitySold =
    mode === 'sell_all'
      ? availableQty
      : Math.min(Math.max(safeNumber(formData.get('quantity_sold')) || 1, 1), availableQty)

  const unitCost = Number(item.cost_basis_unit ?? 0)

  const {
    grossSale,
    shippingTotalCosts,
    netProceeds,
    cogs,
    profit,
  } = calculateSaleNumbers({
    itemSalePrice,
    shippingCharged,
    platformFees,
    shippingCost,
    suppliesCost,
    otherCosts,
    unitCost,
    quantitySold,
  })

  const newAvailableQty = availableQty - quantitySold
  const nextStatus = newAvailableQty > 0 ? 'available' : 'sold'

  const result = await insertSaleAndUpdateInventory({
    supabase,
    userId: user.id,
    inventoryItemId,
    saleDate,
    quantitySold,
    grossSale,
    platformFees,
    shippingTotalCosts,
    otherCosts,
    netProceeds,
    cogs,
    profit,
    platform,
    notes,
    newAvailableQty,
    nextStatus,
    shippingCharged,
    shippingCost,
    suppliesCost,
  })

  if (!result.ok) {
    redirect(`/app/inventory?error=${encodeURIComponent(result.error)}`)
  }

  redirect('/app/inventory?saved=1')
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
  const netProceeds = roundMoney(grossSale - platformFees - shippingCost - otherCosts)
  const cogs = roundMoney(unitCost * quantitySold)
  const profit = roundMoney(netProceeds - cogs)

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
    notes: notes || `Edited sale. Previous qty ${oldQtySold}, new qty ${quantitySold}.`,
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