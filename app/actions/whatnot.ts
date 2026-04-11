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
    redirect(`/app/whatnot-orders?error=Could not load selected orders`)
  }

  // ---------------------------------------
  // 🔥 NEW LOGIC STARTS HERE
  // ---------------------------------------

  const assignedOrders = orders.filter((o) => o.break_id)
  const unassignedOrders = orders.filter((o) => !o.break_id)

  // If we selected assigned orders, make sure they are ALL from the same break
  let targetBreakId: string | null = null

  if (assignedOrders.length > 0) {
    const uniqueBreakIds = Array.from(
      new Set(assignedOrders.map((o) => o.break_id))
    )

    if (uniqueBreakIds.length > 1) {
      redirect(
        '/app/whatnot-orders?error=Selected orders belong to multiple different breaks'
      )
    }

    targetBreakId = uniqueBreakIds[0] as string
  }

  // ---------------------------------------
  // 🔁 CASE 1: ADD TO EXISTING BREAK
  // ---------------------------------------
  if (targetBreakId) {
    if (unassignedOrders.length === 0) {
      redirect(`/app/breaks/${targetBreakId}`)
    }

    const { error: updateError } = await supabase
      .from('whatnot_orders')
      .update({ break_id: targetBreakId })
      .eq('user_id', user.id)
      .in(
        'id',
        unassignedOrders.map((o) => o.id)
      )

    if (updateError) {
      redirect(`/app/whatnot-orders?error=Failed to add orders to existing break`)
    }

    redirect(`/app/breaks/${targetBreakId}`)
  }

  // ---------------------------------------
  // 🆕 CASE 2: CREATE NEW BREAK (original flow)
  // ---------------------------------------

  const distinctSellers = Array.from(
    new Set(
      orders
        .map((order) => String(order.seller ?? '').trim())
        .filter(Boolean)
    )
  )

  if (distinctSellers.length > 1) {
    redirect('/app/whatnot-orders?error=Please combine orders from only one seller')
  }

  const sellerName = distinctSellers[0] || 'Whatnot'

  const sortedOrders = [...orders].sort((a, b) => {
    const aDate = a.processed_date ?? ''
    const bDate = b.processed_date ?? ''
    if (aDate < bDate) return -1
    if (aDate > bDate) return 1
    return 0
  })

  const breakDate =
    sortedOrders.find((o) => o.processed_date)?.processed_date ??
    new Date().toISOString().slice(0, 10)

  const purchasePrice = sortedOrders.reduce(
    (sum, o) => sum + safeNumber(o.subtotal),
    0
  )

  const salesTax = sortedOrders.reduce(
    (sum, o) => sum + safeNumber(o.taxes),
    0
  )

  const shippingCost = sortedOrders.reduce(
    (sum, o) => sum + safeNumber(o.shipping_price),
    0
  )

  const totalCost = purchasePrice + salesTax + shippingCost

  const { data: breakRow, error: breakError } = await supabase
    .from('breaks')
    .insert({
      user_id: user.id,
      break_date: breakDate,
      source_name: sellerName,
      product_name: `Combined Whatnot Orders (${orders.length})`,
      format_type: 'Whatnot import group',
      purchase_price: purchasePrice,
      sales_tax: salesTax,
      shipping_cost: shippingCost,
      total_cost: totalCost,
      allocation_method: 'equal_per_item',
      cards_received: 0,
    })
    .select('id')
    .single()

  if (breakError || !breakRow) {
    redirect('/app/whatnot-orders?error=Could not create break')
  }

  await supabase
    .from('whatnot_orders')
    .update({ break_id: breakRow.id })
    .eq('user_id', user.id)
    .in('id', selectedOrderIds)

  redirect(`/app/breaks/${breakRow.id}`)
}