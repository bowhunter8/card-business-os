'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function safeText(value: FormDataEntryValue | null) {
  return String(value ?? '').trim()
}

function safeNumber(value: number | string | null | undefined) {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num : 0
}

export async function combineWhatnotOrdersIntoBreakAction(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const selectedOrderIds = formData
    .getAll('whatnot_order_ids')
    .map((value) => safeText(value))
    .filter(Boolean)

  if (selectedOrderIds.length === 0) {
    redirect('/app/whatnot-orders?error=Select at least one Whatnot order')
  }

  const { data: orders, error: ordersError } = await supabase
    .from('whatnot_orders')
    .select(`
      id,
      user_id,
      break_id,
      order_id,
      order_numeric_id,
      seller,
      product_name,
      processed_date,
      processed_date_display,
      subtotal,
      shipping_price,
      taxes,
      total
    `)
    .eq('user_id', user.id)
    .in('id', selectedOrderIds)

  if (ordersError || !orders || orders.length === 0) {
    redirect(
      `/app/whatnot-orders?error=${encodeURIComponent(
        ordersError?.message || 'Could not load selected Whatnot orders'
      )}`
    )
  }

  if (orders.length !== selectedOrderIds.length) {
    redirect('/app/whatnot-orders?error=One or more selected orders could not be found')
  }

  const alreadyAssigned = orders.filter((order) => !!order.break_id)
  if (alreadyAssigned.length > 0) {
    redirect('/app/whatnot-orders?error=One or more selected orders are already linked to a break')
  }

  const distinctSellers = Array.from(
    new Set(
      orders
        .map((order) => String(order.seller ?? '').trim())
        .filter(Boolean)
    )
  )

  if (distinctSellers.length > 1) {
    redirect('/app/whatnot-orders?error=Please combine orders from only one seller at a time')
  }

  const sellerName = distinctSellers[0] || 'Whatnot'

  const sortedOrders = [...orders].sort((a, b) => {
    const aDate = a.processed_date ?? ''
    const bDate = b.processed_date ?? ''
    if (aDate < bDate) return -1
    if (aDate > bDate) return 1
    return String(a.order_numeric_id ?? a.order_id ?? '').localeCompare(
      String(b.order_numeric_id ?? b.order_id ?? '')
    )
  })

  const breakDate =
    sortedOrders.find((order) => order.processed_date)?.processed_date ??
    new Date().toISOString().slice(0, 10)

  const purchasePrice = Number(
    sortedOrders
      .reduce((sum, order) => sum + safeNumber(order.subtotal), 0)
      .toFixed(2)
  )

  const salesTax = Number(
    sortedOrders
      .reduce((sum, order) => sum + safeNumber(order.taxes), 0)
      .toFixed(2)
  )

  const shippingCost = Number(
    sortedOrders
      .reduce((sum, order) => sum + safeNumber(order.shipping_price), 0)
      .toFixed(2)
  )

  const otherFees = 0
  const totalCost = Number((purchasePrice + salesTax + shippingCost + otherFees).toFixed(2))

  const uniqueProducts = Array.from(
    new Set(
      sortedOrders
        .map((order) => String(order.product_name ?? '').trim())
        .filter(Boolean)
    )
  )

  const productName =
    uniqueProducts.length === 1
      ? uniqueProducts[0]
      : `Combined Whatnot Orders (${sortedOrders.length} orders)`

  const displayOrderNumbers = sortedOrders.map(
    (order) => order.order_numeric_id || order.order_id
  )

  const orderNumber =
    sortedOrders.length === 1
      ? String(displayOrderNumbers[0] ?? '')
      : `MULTI: ${displayOrderNumbers.join(', ')}`

  const notes = [
    'Created from selected Whatnot orders',
    `Seller: ${sellerName}`,
    `Order Numeric IDs: ${sortedOrders
      .map((order) => order.order_numeric_id || order.order_id)
      .join(', ')}`,
    `Internal Order IDs: ${sortedOrders.map((order) => order.order_id).join(', ')}`,
    uniqueProducts.length
      ? `Products: ${uniqueProducts.join(' | ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  const { data: breakRow, error: breakError } = await supabase
    .from('breaks')
    .insert({
      user_id: user.id,
      break_date: breakDate,
      source_name: sellerName,
      product_name: productName,
      format_type: 'Whatnot import group',
      teams: [],
      order_number: orderNumber || null,
      purchase_price: purchasePrice,
      sales_tax: salesTax,
      shipping_cost: shippingCost,
      other_fees: otherFees,
      total_cost: totalCost,
      allocation_method: 'equal_per_item',
      cards_received: 0,
      notes,
    })
    .select('id')
    .single()

  if (breakError || !breakRow) {
    redirect(
      `/app/whatnot-orders?error=${encodeURIComponent(
        breakError?.message || 'Could not create break'
      )}`
    )
  }

  const { error: updateError } = await supabase
    .from('whatnot_orders')
    .update({
      break_id: breakRow.id,
    })
    .eq('user_id', user.id)
    .in('id', selectedOrderIds)

  if (updateError) {
    redirect(
      `/app/whatnot-orders?error=${encodeURIComponent(
        updateError.message || 'Break was created but orders could not be linked'
      )}`
    )
  }

  redirect(`/app/breaks/${breakRow.id}`)
}