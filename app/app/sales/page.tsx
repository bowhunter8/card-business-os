import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

type SaleRow = {
  id: string
  inventory_item_id: string | null
  sale_date: string
  quantity_sold: number | null
  gross_sale: number | null
  platform_fees: number | null
  shipping_cost: number | null
  other_costs: number | null
  net_proceeds: number | null
  cost_of_goods_sold: number | null
  profit: number | null
  platform: string | null
  notes: string | null
  inventory_items?: {
    title: string | null
    player_name: string | null
    year: number | null
    brand: string | null
    set_name: string | null
    card_number: string | null
    parallel_name: string | null
    team: string | null
  } | null
}

function money(value: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function getItemName(sale: SaleRow) {
  const item = sale.inventory_items

  if (!item) return 'Unknown item'

  return [
    item.title || item.player_name || 'Untitled item',
    item.year,
    item.brand,
    item.set_name,
    item.card_number ? `#${item.card_number}` : null,
    item.parallel_name,
    item.team,
  ]
    .filter(Boolean)
    .join(' • ')
}

export default async function SalesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const response = await supabase
    .from('sales')
    .select(`
      id,
      inventory_item_id,
      sale_date,
      quantity_sold,
      gross_sale,
      platform_fees,
      shipping_cost,
      other_costs,
      net_proceeds,
      cost_of_goods_sold,
      profit,
      platform,
      notes,
      inventory_items!sales_inventory_item_id_fkey (
        title,
        player_name,
        year,
        brand,
        set_name,
        card_number,
        parallel_name,
        team
      )
    `)
    .eq('user_id', user.id)
    .order('sale_date', { ascending: false })

  const sales: SaleRow[] = (response.data ?? []) as SaleRow[]
  const error = response.error

  const totalGross = sales.reduce((sum, row) => sum + Number(row.gross_sale ?? 0), 0)
  const totalNet = sales.reduce((sum, row) => sum + Number(row.net_proceeds ?? 0), 0)
  const totalProfit = sales.reduce((sum, row) => sum + Number(row.profit ?? 0), 0)

  return (
    <div className="app-page-wide space-y-3">
      <div className="app-page-header gap-3">
        <div>
          <h1 className="app-title">Sales</h1>
          <p className="app-subtitle">
            Review realized revenue and profit across your card business.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/sales/new" className="app-button-primary">
            Record Sale
          </Link>
          <Link href="/app/inventory" className="app-button">
            Back to Inventory
          </Link>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <div className="app-card-tight p-3">
          <div className="text-[11px] uppercase tracking-wide text-zinc-400">Gross Sales</div>
          <div className="mt-1 text-xl font-semibold">{money(totalGross)}</div>
        </div>

        <div className="app-card-tight p-3">
          <div className="text-[11px] uppercase tracking-wide text-zinc-400">Net Proceeds</div>
          <div className="mt-1 text-xl font-semibold">{money(totalNet)}</div>
        </div>

        <div className="app-card-tight p-3">
          <div className="text-[11px] uppercase tracking-wide text-zinc-400">Profit</div>
          <div className="mt-1 text-xl font-semibold">{money(totalProfit)}</div>
        </div>
      </div>

      {error ? (
        <div className="app-alert-error">Error loading sales: {error.message}</div>
      ) : null}

      <div className="app-table-wrap">
        <div className="app-table-scroll">
          <table className="app-table">
            <thead className="app-thead">
              <tr>
                <th className="app-th">Sale</th>
                <th className="app-th">Qty</th>
                <th className="app-th">Gross</th>
                <th className="app-th">Net</th>
                <th className="app-th">COGS</th>
                <th className="app-th">Profit</th>
                <th className="app-th">Platform</th>
                <th className="app-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} className="app-tr">
                  <td className="app-td">
                    <div className="min-w-[240px]">
                      <div className="font-medium leading-tight">{sale.sale_date}</div>
                      <div className="mt-0.5 text-xs leading-snug text-zinc-400">
                        {getItemName(sale)}
                      </div>
                    </div>
                  </td>
                  <td className="app-td">{sale.quantity_sold ?? 0}</td>
                  <td className="app-td whitespace-nowrap">{money(sale.gross_sale)}</td>
                  <td className="app-td whitespace-nowrap">{money(sale.net_proceeds)}</td>
                  <td className="app-td whitespace-nowrap">{money(sale.cost_of_goods_sold)}</td>
                  <td className="app-td whitespace-nowrap">{money(sale.profit)}</td>
                  <td className="app-td">{sale.platform || '—'}</td>
                  <td className="app-td">
                    {sale.inventory_item_id ? (
                      <Link
                        href={`/app/inventory/${sale.inventory_item_id}`}
                        className="app-button"
                      >
                        View Item
                      </Link>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </td>
                </tr>
              ))}

              {sales.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-zinc-400">
                    No sales found.
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