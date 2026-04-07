import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildEbayPreviewRows } from '@/lib/imports/ebay'

type ImportBody = {
  action: 'preview' | 'import'
  csvText: string
  defaultSuppliesCost?: number | string
  defaultOtherCosts?: number | string
  platform?: string
}

function parseMoneyLike(value: unknown) {
  const parsed = Number(value ?? 0)
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

  const preview = buildEbayPreviewRows(body.csvText)

  if (preview.rows.length === 0) {
    return NextResponse.json({ error: 'No rows found in CSV' }, { status: 400 })
  }

  if (body.action === 'preview') {
    return NextResponse.json({
      headers: preview.headers,
      rows: preview.rows.slice(0, 50),
      totalRows: preview.rows.length,
    })
  }

  const defaultSuppliesCost = parseMoneyLike(body.defaultSuppliesCost)
  const defaultOtherCosts = parseMoneyLike(body.defaultOtherCosts)
  const platform = typeof body.platform === 'string' && body.platform.trim()
    ? body.platform.trim()
    : 'eBay'

  const salesRows = preview.rows.map((row) => ({
    user_id: user.id,
    inventory_item_id: null,
    sale_date: row.orderDate ?? new Date().toISOString().slice(0, 10),
    quantity_sold: row.quantity || 1,
    gross_sale: row.grossSale,
    shipping_charged: row.shippingCharged,
    platform_fees: row.platformFees,
    postage_cost: row.postageCost,
    supplies_cost: defaultSuppliesCost,
    other_costs: defaultOtherCosts,
    platform,
    notes: row.notes,
  }))

  const primaryInsert = await supabase.from('sales').insert(salesRows).select('id')

  if (!primaryInsert.error) {
    return NextResponse.json({
      success: true,
      imported: primaryInsert.data?.length ?? salesRows.length,
      mode: 'postage_cost',
    })
  }

  const retryRows = preview.rows.map((row) => ({
    user_id: user.id,
    inventory_item_id: null,
    sale_date: row.orderDate ?? new Date().toISOString().slice(0, 10),
    quantity_sold: row.quantity || 1,
    gross_sale: row.grossSale,
    shipping_charged: row.shippingCharged,
    platform_fees: row.platformFees,
    shipping_cost: row.postageCost,
    supplies_cost: defaultSuppliesCost,
    other_costs: defaultOtherCosts,
    platform,
    notes: row.notes,
  }))

  const fallbackInsert = await supabase.from('sales').insert(retryRows).select('id')

  if (!fallbackInsert.error) {
    return NextResponse.json({
      success: true,
      imported: fallbackInsert.data?.length ?? retryRows.length,
      mode: 'shipping_cost',
    })
  }

  return NextResponse.json(
    {
      error:
        fallbackInsert.error.message ||
        primaryInsert.error.message ||
        'Import failed',
      primaryError: primaryInsert.error.message,
      fallbackError: fallbackInsert.error.message,
    },
    { status: 500 }
  )
}