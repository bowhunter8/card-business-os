import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildWhatnotPreviewRows } from '@/lib/imports/whatnot'

type ImportBody = {
  csvText: string
  fileName?: string
}

function parseMoneyLike(value: unknown) {
  const parsed = Number(String(value ?? '0').replace(/\$/g, '').replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as ImportBody

  if (!body.csvText || typeof body.csvText !== 'string') {
    return NextResponse.json({ error: 'CSV text is required' }, { status: 400 })
  }

  const parsed = buildWhatnotPreviewRows(body.csvText)

  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { error: 'No Whatnot rows found in CSV' },
      { status: 400 }
    )
  }

  const orderIds = parsed.rows.map((row) => row.orderId)

  const { data: existingRows, error: existingError } = await supabase
    .from('whatnot_orders')
    .select('order_id')
    .eq('user_id', user.id)
    .in('order_id', orderIds)

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  const existingOrderSet = new Set(
    (existingRows ?? []).map((row) => String(row.order_id))
  )

  const rowsToInsert = parsed.rows
    .filter((row) => !existingOrderSet.has(row.orderId))
    .map((row) => ({
      user_id: user.id,
      order_id: row.orderId,
      order_numeric_id: row.orderNumericId,
      buyer: row.raw['buyer'] ?? null,
      seller: row.seller,
      product_name: row.productName,
      product_description: row.raw['product description'] ?? null,
      product_category: row.raw['product category'] ?? null,
      processed_date: row.processedDate,
      processed_date_display: row.processedDateDisplay,
      order_status: row.orderStatus,
      order_style: row.raw['order style'] ?? null,
      order_currency: row.raw['order currency'] ?? null,
      sold_price: parseMoneyLike(row.raw['sold price']),
      quantity: row.quantity,
      subtotal: row.subtotal,
      shipping_price: row.shippingPrice,
      taxes: row.taxes,
      taxes_currency: row.raw['taxes currency'] ?? null,
      credits_applied: parseMoneyLike(row.raw['credits applied']),
      total: row.total,
      source_file_name: body.fileName?.trim() || null,
      notes: [
        'Imported from Whatnot CSV',
        row.orderId ? `Order ${row.orderId}` : null,
        row.orderNumericId ? `Order Numeric ${row.orderNumericId}` : null,
        row.seller ? `Seller ${row.seller}` : null,
        row.productName ? `Product ${row.productName}` : null,
      ]
        .filter(Boolean)
        .join(' | '),
    }))

  if (rowsToInsert.length === 0) {
    return NextResponse.json({
      success: true,
      imported: 0,
      skippedDuplicates: parsed.rows.length,
      message: 'No new Whatnot orders to import.',
    })
  }

  const { data, error } = await supabase
    .from('whatnot_orders')
    .insert(rowsToInsert)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    imported: data?.length ?? rowsToInsert.length,
    skippedDuplicates: parsed.rows.length - rowsToInsert.length,
  })
}