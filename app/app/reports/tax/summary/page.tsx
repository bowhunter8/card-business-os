import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import TaxExportButton from '../TaxExportButton'

type SearchParams = Promise<{
  year?: string
}>

type BreakRow = {
  id: string
  break_date: string | null
  source_name: string | null
  product_name: string | null
  order_number: string | null
  total_cost: number | null
}

type BreakSummaryRow = {
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

type SaleSummaryRow = {
  gross_sale: number | null
  platform_fees: number | null
  shipping_cost: number | null
  other_costs: number | null
  net_proceeds: number | null
  cost_of_goods_sold: number | null
  profit: number | null
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

type InventorySummaryRow = {
  available_quantity: number | null
  cost_basis_unit: number | null
  cost_basis_total: number | null
  estimated_value_total: number | null
}

const DETAIL_LIMIT = 25

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
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

function clampYear(raw?: string) {
  const currentYear = new Date().getFullYear()
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > currentYear + 1) {
    return currentYear
  }
  return parsed
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-card-tight p-5">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  )
}

export default async function TaxReportPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const selectedYear = clampYear(params?.year)

  const startDate = `${selectedYear}-01-01`
  const endDate = `${selectedYear}-12-31`

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [
    breaksSummaryRes,
    breaksDetailRes,
    salesSummaryRes,
    salesDetailRes,
    inventorySummaryRes,
    inventoryDetailRes,
  ] = await Promise.all([
    supabase
      .from('breaks')
      .select('total_cost')
      .eq('user_id', user.id)
      .gte('break_date', startDate)
      .lte('break_date', endDate),

    supabase
      .from('breaks')
      .select('id, break_date, source_name, product_name, order_number, total_cost')
      .eq('user_id', user.id)
      .gte('break_date', startDate)
      .lte('break_date', endDate)
      .order('break_date', { ascending: false })
      .limit(DETAIL_LIMIT),

    supabase
      .from('sales')
      .select(`
        gross_sale,
        platform_fees,
        shipping_cost,
        other_costs,
        net_proceeds,
        cost_of_goods_sold,
        profit
      `)
      .eq('user_id', user.id)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate),

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
      .order('sale_date', { ascending: false })
      .limit(DETAIL_LIMIT),

    supabase
      .from('inventory_items')
      .select(`
        available_quantity,
        cost_basis_unit,
        cost_basis_total,
        estimated_value_total
      `)
      .eq('user_id', user.id)
      .gt('available_quantity', 0),

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
      .order('year', { ascending: false })
      .limit(DETAIL_LIMIT),
  ])

  const breakSummaryRows = breaksSummaryRes.data ?? []
  const breaks = breaksDetailRes.data ?? []

  const salesSummaryRows = salesSummaryRes.data ?? []
  const sales = salesDetailRes.data ?? []

  const inventorySummaryRows = inventorySummaryRes.data ?? []
  const endingInventory = inventoryDetailRes.data ?? []

  const totalBreakPurchases = breakSummaryRows.reduce(
    (sum, row) => sum + Number(row.total_cost ?? 0),
    0
  )

  const totalGrossSales = salesSummaryRows.reduce(
    (sum, row) => sum + Number(row.gross_sale ?? 0),
    0
  )

  const totalSellingCosts = salesSummaryRows.reduce(
    (sum, row) =>
      sum +
      Number(row.platform_fees ?? 0) +
      Number(row.shipping_cost ?? 0) +
      Number(row.other_costs ?? 0),
    0
  )

  const totalNetProceeds = salesSummaryRows.reduce(
    (sum, row) => sum + Number(row.net_proceeds ?? 0),
    0
  )

  const totalCOGS = salesSummaryRows.reduce(
    (sum, row) => sum + Number(row.cost_of_goods_sold ?? 0),
    0
  )

  const totalProfit = salesSummaryRows.reduce(
    (sum, row) => sum + Number(row.profit ?? 0),
    0
  )

  const endingInventoryCost = inventorySummaryRows.reduce((sum, row) => {
    const availableQty = Number(row.available_quantity ?? 0)
    const unitCost = Number(row.cost_basis_unit ?? 0)
    const fallbackTotal = Number(row.cost_basis_total ?? 0)

    if (availableQty > 0 && unitCost > 0) {
      return sum + availableQty * unitCost
    }

    return sum + fallbackTotal
  }, 0)

  const endingInventoryEstimatedValue = inventorySummaryRows.reduce(
    (sum, row) => sum + Number(row.estimated_value_total ?? 0),
    0
  )

  return (
    <div className="app-page-wide space-y-4">
      <div className="app-page-header gap-4">
        <div>
          <h1 className="app-title">Tax Summary</h1>
          <p className="app-subtitle">
            Year-end summary and CSV export for your business records.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/app" className="app-button">
            Back to Dashboard
          </Link>

          <TaxExportButton year={selectedYear} />
        </div>
      </div>

      <div className="app-section p-5">
        <form method="get" className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Tax Year</label>
            <select
              name="year"
              defaultValue={String(selectedYear)}
              className="app-select"
            >
              {Array.from({ length: 5 }).map((_, i) => {
                const year = new Date().getFullYear() - i
                return (
                  <option key={year} value={year}>
                    {year}
                  </option>
                )
              })}
            </select>
          </div>

          <button type="submit" className="app-button">
            Load Year
          </button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Break Purchases" value={money(totalBreakPurchases)} />
        <StatCard label="Gross Sales" value={money(totalGrossSales)} />
        <StatCard label="Selling Costs" value={money(totalSellingCosts)} />
        <StatCard label="Net Proceeds" value={money(totalNetProceeds)} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Realized COGS" value={money(totalCOGS)} />
        <StatCard label="Realized Profit" value={money(totalProfit)} />
        <StatCard label="Ending Inventory Cost" value={money(endingInventoryCost)} />
        <StatCard
          label="Ending Inventory Est. Value"
          value={money(endingInventoryEstimatedValue)}
        />
      </div>

      {/* tables unchanged */}
    </div>
  )
}