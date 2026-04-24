import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import TaxExportButton from './TaxExportButton'
import TaxPdfExportButton from './TaxPdfExportButton'

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

  const [breaksRes, salesRes, inventoryRes] = await Promise.all([
    supabase
      .from('breaks')
      .select('id, break_date, source_name, product_name, order_number, total_cost')
      .eq('user_id', user.id)
      .gte('break_date', startDate)
      .lte('break_date', endDate)
      .order('break_date', { ascending: false }),

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
      .order('sale_date', { ascending: false }),

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

  return (
    <div className="max-w-7xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Tax Report</h1>
          <p className="mt-2 text-zinc-400">
            Year-end summary and CSV export for your card business records.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/app"
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Back to Dashboard
          </Link>

          <TaxExportButton year={selectedYear} />

          <TaxPdfExportButton year={selectedYear} />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <form method="get" className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Tax Year</label>
            <select
              name="year"
              defaultValue={String(selectedYear)}
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
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

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
            >
              Load Year
            </button>

            <TaxExportButton year={selectedYear} />

            <TaxPdfExportButton year={selectedYear} />
          </div>
        </form>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <StatCard label="Break Purchases" value={money(totalBreakPurchases)} />
        <StatCard label="Gross Sales" value={money(totalGrossSales)} />
        <StatCard label="Selling Costs" value={money(totalSellingCosts)} />
        <StatCard label="Net Proceeds" value={money(totalNetProceeds)} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <StatCard label="Realized COGS" value={money(totalCOGS)} />
        <StatCard label="Realized Profit" value={money(totalProfit)} />
        <StatCard label="Ending Inventory Cost" value={money(endingInventoryCost)} />
        <StatCard
          label="Ending Inventory Est. Value"
          value={money(endingInventoryEstimatedValue)}
        />
      </div>

      <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="text-xl font-semibold">Break Purchases ({breaks.length})</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950 text-zinc-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Product</th>
                <th className="px-4 py-3 text-left font-medium">Source</th>
                <th className="px-4 py-3 text-left font-medium">Order #</th>
                <th className="px-4 py-3 text-left font-medium">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {breaks.map((row) => (
                <tr key={row.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3">{row.break_date || '—'}</td>
                  <td className="px-4 py-3">{row.product_name || '—'}</td>
                  <td className="px-4 py-3">{row.source_name || '—'}</td>
                  <td className="px-4 py-3">{row.order_number || '—'}</td>
                  <td className="px-4 py-3">{money(row.total_cost)}</td>
                </tr>
              ))}

              {breaks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
                    No break purchases found for {selectedYear}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="text-xl font-semibold">Sales ({sales.length})</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950 text-zinc-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Gross</th>
                <th className="px-4 py-3 text-left font-medium">Fees/Costs</th>
                <th className="px-4 py-3 text-left font-medium">Net</th>
                <th className="px-4 py-3 text-left font-medium">COGS</th>
                <th className="px-4 py-3 text-left font-medium">Profit</th>
                <th className="px-4 py-3 text-left font-medium">Platform</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((row) => {
                const sellingCosts =
                  Number(row.platform_fees ?? 0) +
                  Number(row.shipping_cost ?? 0) +
                  Number(row.other_costs ?? 0)

                return (
                  <tr key={row.id} className="border-t border-zinc-800">
                    <td className="px-4 py-3">{row.sale_date || '—'}</td>
                    <td className="px-4 py-3">{money(row.gross_sale)}</td>
                    <td className="px-4 py-3">{money(sellingCosts)}</td>
                    <td className="px-4 py-3">{money(row.net_proceeds)}</td>
                    <td className="px-4 py-3">{money(row.cost_of_goods_sold)}</td>
                    <td className="px-4 py-3">{money(row.profit)}</td>
                    <td className="px-4 py-3">{row.platform || '—'}</td>
                  </tr>
                )
              })}

              {sales.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">
                    No sales found for {selectedYear}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="text-xl font-semibold">
            Ending Inventory Snapshot ({endingInventory.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950 text-zinc-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Item</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Available Qty</th>
                <th className="px-4 py-3 text-left font-medium">Unit Cost</th>
                <th className="px-4 py-3 text-left font-medium">Inventory Cost</th>
                <th className="px-4 py-3 text-left font-medium">Est. Value</th>
              </tr>
            </thead>
            <tbody>
              {endingInventory.map((row) => {
                const availableQty = Number(row.available_quantity ?? 0)
                const unitCost = Number(row.cost_basis_unit ?? 0)
                const rowCost =
                  availableQty > 0 && unitCost > 0
                    ? availableQty * unitCost
                    : Number(row.cost_basis_total ?? 0)

                return (
                  <tr key={row.id} className="border-t border-zinc-800">
                    <td className="px-4 py-3">{buildItemName(row)}</td>
                    <td className="px-4 py-3">{row.status || '—'}</td>
                    <td className="px-4 py-3">{availableQty}</td>
                    <td className="px-4 py-3">{money(unitCost)}</td>
                    <td className="px-4 py-3">{money(rowCost)}</td>
                    <td className="px-4 py-3">{money(row.estimated_value_total)}</td>
                  </tr>
                )
              })}

              {endingInventory.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-zinc-400">
                    No ending inventory found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  )
}