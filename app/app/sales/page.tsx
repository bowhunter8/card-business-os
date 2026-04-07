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
}

function money(value: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
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
      notes
    `)
    .eq('user_id', user.id)
    .order('sale_date', { ascending: false })

  const sales: SaleRow[] = (response.data ?? []) as SaleRow[]
  const error = response.error

  const totalGross = sales.reduce((sum, row) => sum + Number(row.gross_sale ?? 0), 0)
  const totalNet = sales.reduce((sum, row) => sum + Number(row.net_proceeds ?? 0), 0)
  const totalProfit = sales.reduce((sum, row) => sum + Number(row.profit ?? 0), 0)

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Sales</h1>
          <p className="mt-2 text-zinc-400">
            Review realized revenue and profit across your card business.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/app/sales/new"
            className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
          >
            Record Sale
          </Link>
          <Link
            href="/app/inventory"
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Back to Inventory
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Gross Sales</div>
          <div className="mt-2 text-2xl font-semibold">{money(totalGross)}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Net Proceeds</div>
          <div className="mt-2 text-2xl font-semibold">{money(totalNet)}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Profit</div>
          <div className="mt-2 text-2xl font-semibold">{money(totalProfit)}</div>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Error loading sales: {error.message}
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950 text-zinc-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Sale Date</th>
                <th className="px-4 py-3 text-left font-medium">Qty</th>
                <th className="px-4 py-3 text-left font-medium">Gross</th>
                <th className="px-4 py-3 text-left font-medium">Net</th>
                <th className="px-4 py-3 text-left font-medium">COGS</th>
                <th className="px-4 py-3 text-left font-medium">Profit</th>
                <th className="px-4 py-3 text-left font-medium">Platform</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3">{sale.sale_date}</td>
                  <td className="px-4 py-3">{sale.quantity_sold ?? 0}</td>
                  <td className="px-4 py-3">{money(sale.gross_sale)}</td>
                  <td className="px-4 py-3">{money(sale.net_proceeds)}</td>
                  <td className="px-4 py-3">{money(sale.cost_of_goods_sold)}</td>
                  <td className="px-4 py-3">{money(sale.profit)}</td>
                  <td className="px-4 py-3">{sale.platform || '—'}</td>
                  <td className="px-4 py-3">
                    {sale.inventory_item_id ? (
                      <Link
                        href={`/app/inventory/${sale.inventory_item_id}`}
                        className="inline-flex rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
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