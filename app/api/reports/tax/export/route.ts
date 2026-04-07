import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type BreakRow = {
  id: string
  break_date: string | null
  source_name: string | null
  product_name: string | null
  order_number: string | null
  total_cost: number | null
}

type SaleRow = {
  id: string
  sale_date: string | null
  gross_sale: number | null
  platform_fees: number | null
  shipping_cost: number | null
  other_costs: number | null
  net_proceeds: number | null
  cost_of_goods_sold: number | null
  profit: number | null
  platform: string | null
  notes: string | null
  inventory_item_id: string | null
}

type InventoryRow = {
  id: string
  title: string | null
  player_name: string | null
  year: number | null
  set_name: string | null
  card_number: string | null
  notes: string | null
  status: string | null
  available_quantity: number | null
  cost_basis_unit: number | null
  cost_basis_total: number | null
  estimated_value_total: number | null
}

function clampYear(raw?: string | null) {
  const currentYear = new Date().getFullYear()
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > currentYear + 1) {
    return currentYear
  }
  return parsed
}

function csvEscape(value: unknown) {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function buildItemName(item: InventoryRow) {
  const parts = [
    item.year,
    item.set_name,
    item.player_name,
    item.card_number ? `#${item.card_number}` : null,
    item.notes,
  ]
  return parts.filter(Boolean).join(' • ') || item.title || 'Untitled item'
}

export async function GET(request: NextRequest) {
  const year = clampYear(request.nextUrl.searchParams.get('year'))
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const [breaksRes, salesRes, inventoryRes] = await Promise.all([
    supabase
      .from('breaks')
      .select('id, break_date, source_name, product_name, order_number, total_cost')
      .eq('user_id', user.id)
      .gte('break_date', startDate)
      .lte('break_date', endDate)
      .order('break_date', { ascending: true }),

    supabase
      .from('sales')
      .select(`
        id,
        sale_date,
        gross_sale,
        platform_fees,
        shipping_cost,
        other_costs,
        net_proceeds,
        cost_of_goods_sold,
        profit,
        platform,
        notes,
        inventory_item_id
      `)
      .eq('user_id', user.id)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate)
      .order('sale_date', { ascending: true }),

    supabase
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
        available_quantity,
        cost_basis_unit,
        cost_basis_total,
        estimated_value_total
      `)
      .eq('user_id', user.id)
      .gt('available_quantity', 0)
      .order('year', { ascending: false }),
  ])

  const breaks: BreakRow[] = (breaksRes.data ?? []) as BreakRow[]
  const sales: SaleRow[] = (salesRes.data ?? []) as SaleRow[]
  const endingInventory: InventoryRow[] = (inventoryRes.data ?? []) as InventoryRow[]

  const totalBreakPurchases = breaks.reduce(
    (sum, row) => sum + Number(row.total_cost ?? 0),
    0
  )

  const totalGrossSales = sales.reduce(
    (sum, row) => sum + Number(row.gross_sale ?? 0),
    0
  )

  const totalSellingCosts = sales.reduce(
    (sum, row) =>
      sum +
      Number(row.platform_fees ?? 0) +
      Number(row.shipping_cost ?? 0) +
      Number(row.other_costs ?? 0),
    0
  )

  const totalNetProceeds = sales.reduce(
    (sum, row) => sum + Number(row.net_proceeds ?? 0),
    0
  )

  const totalCOGS = sales.reduce(
    (sum, row) => sum + Number(row.cost_of_goods_sold ?? 0),
    0
  )

  const totalProfit = sales.reduce(
    (sum, row) => sum + Number(row.profit ?? 0),
    0
  )

  const endingInventoryCost = endingInventory.reduce((sum, row) => {
    const availableQty = Number(row.available_quantity ?? 0)
    const unitCost = Number(row.cost_basis_unit ?? 0)
    const fallbackTotal = Number(row.cost_basis_total ?? 0)

    if (availableQty > 0 && unitCost > 0) {
      return sum + availableQty * unitCost
    }

    return sum + fallbackTotal
  }, 0)

  const endingInventoryEstimatedValue = endingInventory.reduce(
    (sum, row) => sum + Number(row.estimated_value_total ?? 0),
    0
  )

  const lines: string[] = []

  lines.push('SECTION,FIELD,VALUE')
  lines.push(`SUMMARY,Year,${csvEscape(year)}`)
  lines.push(`SUMMARY,Break Purchases,${csvEscape(totalBreakPurchases.toFixed(2))}`)
  lines.push(`SUMMARY,Gross Sales,${csvEscape(totalGrossSales.toFixed(2))}`)
  lines.push(`SUMMARY,Selling Costs,${csvEscape(totalSellingCosts.toFixed(2))}`)
  lines.push(`SUMMARY,Net Proceeds,${csvEscape(totalNetProceeds.toFixed(2))}`)
  lines.push(`SUMMARY,Realized COGS,${csvEscape(totalCOGS.toFixed(2))}`)
  lines.push(`SUMMARY,Realized Profit,${csvEscape(totalProfit.toFixed(2))}`)
  lines.push(`SUMMARY,Ending Inventory Cost,${csvEscape(endingInventoryCost.toFixed(2))}`)
  lines.push(`SUMMARY,Ending Inventory Estimated Value,${csvEscape(endingInventoryEstimatedValue.toFixed(2))}`)
  lines.push('')

  lines.push('BREAK_PURCHASES')
  lines.push('Date,Product,Source,Order Number,Total Cost')
  breaks.forEach((row) => {
    lines.push(
      [
        csvEscape(row.break_date),
        csvEscape(row.product_name),
        csvEscape(row.source_name),
        csvEscape(row.order_number),
        csvEscape(Number(row.total_cost ?? 0).toFixed(2)),
      ].join(',')
    )
  })
  lines.push('')

  lines.push('SALES')
  lines.push('Sale Date,Gross Sale,Platform Fees,Shipping Cost,Other Costs,Net Proceeds,COGS,Profit,Platform,Notes')
  sales.forEach((row) => {
    lines.push(
      [
        csvEscape(row.sale_date),
        csvEscape(Number(row.gross_sale ?? 0).toFixed(2)),
        csvEscape(Number(row.platform_fees ?? 0).toFixed(2)),
        csvEscape(Number(row.shipping_cost ?? 0).toFixed(2)),
        csvEscape(Number(row.other_costs ?? 0).toFixed(2)),
        csvEscape(Number(row.net_proceeds ?? 0).toFixed(2)),
        csvEscape(Number(row.cost_of_goods_sold ?? 0).toFixed(2)),
        csvEscape(Number(row.profit ?? 0).toFixed(2)),
        csvEscape(row.platform),
        csvEscape(row.notes),
      ].join(',')
    )
  })
  lines.push('')

  lines.push('ENDING_INVENTORY')
  lines.push('Item,Status,Available Quantity,Unit Cost,Inventory Cost,Estimated Value')
  endingInventory.forEach((row) => {
    const availableQty = Number(row.available_quantity ?? 0)
    const unitCost = Number(row.cost_basis_unit ?? 0)
    const rowCost =
      availableQty > 0 && unitCost > 0
        ? availableQty * unitCost
        : Number(row.cost_basis_total ?? 0)

    lines.push(
      [
        csvEscape(buildItemName(row)),
        csvEscape(row.status),
        csvEscape(availableQty),
        csvEscape(unitCost.toFixed(2)),
        csvEscape(rowCost.toFixed(2)),
        csvEscape(Number(row.estimated_value_total ?? 0).toFixed(2)),
      ].join(',')
    )
  })

  const csv = lines.join('\n')
  const csvWithBom = '\uFEFF' + csv

  return new NextResponse(csvWithBom, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tax-report-${year}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}