import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { reverseSaleAction } from '@/app/actions/sale-safety'
import { updateInventoryListingAction } from '@/app/actions/inventory-listing'

type InventoryItem = {
  id: string
  status: string | null
  item_type: string | null
  title: string | null
  player_name: string | null
  year: number | null
  brand: string | null
  set_name: string | null
  card_number: string | null
  parallel_name: string | null
  team: string | null
  quantity: number | null
  available_quantity: number | null
  cost_basis_unit: number | null
  cost_basis_total: number | null
  estimated_value_unit: number | null
  estimated_value_total: number | null
  storage_location: string | null
  notes: string | null
  source_type?: string | null
  source_break_id?: string | null
  created_at?: string | null
  updated_at?: string | null
  listed_price?: number | null
  listed_platform?: string | null
  listed_date?: string | null
}

type SaleRow = {
  id: string
  sale_date: string | null
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
  reversed_at?: string | null
  reversal_reason?: string | null
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString()
}

function formatDateInput(value: string | null | undefined) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toISOString().slice(0, 10)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function buildDisplay(item: InventoryItem) {
  const parts = [
    item.year,
    item.set_name,
    item.player_name,
    item.card_number ? `#${item.card_number}` : null,
    item.notes,
  ]

  return parts.filter(Boolean).join(' • ')
}

export default async function InventoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string; success?: string }>
}) {
  const { id } = await params
  const query = searchParams ? await searchParams : undefined
  const errorMessage = query?.error
  const successMessage = query?.success

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const itemResponse = await supabase
    .from('inventory_items')
    .select(`
      id,
      status,
      item_type,
      title,
      player_name,
      year,
      brand,
      set_name,
      card_number,
      parallel_name,
      team,
      quantity,
      available_quantity,
      cost_basis_unit,
      cost_basis_total,
      estimated_value_unit,
      estimated_value_total,
      storage_location,
      notes,
      source_type,
      source_break_id,
      created_at,
      updated_at,
      listed_price,
      listed_platform,
      listed_date
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (itemResponse.error || !itemResponse.data) {
    notFound()
  }

  const item = itemResponse.data as InventoryItem

  const salesResponse = await supabase
    .from('sales')
    .select(`
      id,
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
      reversed_at,
      reversal_reason
    `)
    .eq('user_id', user.id)
    .eq('inventory_item_id', item.id)
    .order('sale_date', { ascending: false })

  const sales: SaleRow[] = (salesResponse.data ?? []) as SaleRow[]

  const activeSales = sales.filter((sale) => !sale.reversed_at)

  const totalGross = activeSales.reduce(
    (sum, row) => sum + Number(row.gross_sale ?? 0),
    0
  )
  const totalNet = activeSales.reduce(
    (sum, row) => sum + Number(row.net_proceeds ?? 0),
    0
  )
  const totalProfit = activeSales.reduce(
    (sum, row) => sum + Number(row.profit ?? 0),
    0
  )
  const totalQtySold = activeSales.reduce(
    (sum, row) => sum + Number(row.quantity_sold ?? 0),
    0
  )

  const availableQuantity = Number(item.available_quantity ?? 0)
  const hasAvailableToSell = availableQuantity > 0
  const latestActiveSale = activeSales[0] ?? null

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2">
            <Link href="/app/inventory" className="text-sm text-zinc-400 hover:underline">
              ← Back to Inventory
            </Link>
          </div>

          <h1 className="text-3xl font-semibold">Inventory Item</h1>
          <p className="mt-2 text-zinc-400">
            {buildDisplay(item) || item.title || 'Untitled item'}
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href={`/app/inventory/${item.id}/edit`}
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Edit
          </Link>

          {hasAvailableToSell ? (
            <Link
              href={`/app/inventory/${item.id}/sell`}
              className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
            >
              Sell Item
            </Link>
          ) : latestActiveSale ? (
            <form action={reverseSaleAction} className="space-y-2">
              <input type="hidden" name="sale_id" value={latestActiveSale.id} />
              <input type="hidden" name="inventory_item_id" value={item.id} />
              <input
                type="hidden"
                name="reversal_reason"
                value="Quick reverse from inventory item header"
              />
              <button
                type="submit"
                className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-2 font-medium text-red-200 hover:bg-red-950"
              >
                Reverse Sale
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <div className="mb-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mb-6 rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          {successMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Status</div>
          <div className="mt-2 text-xl font-semibold capitalize">
            {(item.status || '—').replaceAll('_', ' ')}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Quantity</div>
          <div className="mt-2 text-xl font-semibold">{item.quantity ?? 0}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Available</div>
          <div className="mt-2 text-xl font-semibold">{item.available_quantity ?? 0}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Qty Sold</div>
          <div className="mt-2 text-xl font-semibold">{totalQtySold}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Unit Cost</div>
          <div className="mt-2 text-2xl font-semibold">{money(item.cost_basis_unit)}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Total Cost</div>
          <div className="mt-2 text-2xl font-semibold">{money(item.cost_basis_total)}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Est. Value / Unit</div>
          <div className="mt-2 text-2xl font-semibold">{money(item.estimated_value_unit)}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Est. Value Total</div>
          <div className="mt-2 text-2xl font-semibold">{money(item.estimated_value_total)}</div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-xl font-semibold">Listing Details</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Detail
            label="Listed Price"
            value={item.listed_price != null ? money(item.listed_price) : '—'}
          />
          <Detail label="Listed Platform" value={item.listed_platform || '—'} />
          <Detail label="Listed Date" value={formatDate(item.listed_date)} />
        </div>

        <form action={updateInventoryListingAction} className="mt-6 grid gap-4 md:grid-cols-3">
          <input type="hidden" name="inventory_item_id" value={item.id} />

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Listed Price</label>
            <input
              name="listed_price"
              type="number"
              min={0}
              step="0.01"
              defaultValue={
                item.listed_price != null ? Number(item.listed_price).toFixed(2) : ''
              }
              placeholder="0.00"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Listed Platform</label>
            <input
              name="listed_platform"
              type="text"
              defaultValue={item.listed_platform ?? ''}
              placeholder="eBay, Whatnot, Facebook, local..."
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Listed Date</label>
            <input
              name="listed_date"
              type="date"
              defaultValue={formatDateInput(item.listed_date)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
            >
              Save Listing Details
            </button>
          </div>
        </form>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-xl font-semibold">Card Details</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Detail label="Year" value={item.year?.toString() || '—'} />
          <Detail label="Set" value={item.set_name || '—'} />
          <Detail label="Player" value={item.player_name || '—'} />
          <Detail label="Card #" value={item.card_number || '—'} />
          <Detail label="Brand" value={item.brand || '—'} />
          <Detail label="Parallel" value={item.parallel_name || '—'} />
          <Detail label="Team" value={item.team || '—'} />
          <Detail label="Item Type" value={item.item_type || '—'} />
          <Detail label="Location" value={item.storage_location || '—'} />
        </div>

        {item.notes ? (
          <div className="mt-4">
            <div className="text-sm text-zinc-400">Notes</div>
            <div className="mt-2 whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              {item.notes}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-xl font-semibold">Record Trail</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <Detail label="Source Type" value={item.source_type || '—'} />
          <Detail label="Source Break ID" value={item.source_break_id || '—'} />
          <Detail label="Created" value={formatDate(item.created_at)} />
          <Detail label="Updated" value={formatDate(item.updated_at)} />
        </div>

        {item.source_break_id ? (
          <div className="mt-4">
            <Link
              href={`/app/breaks/${item.source_break_id}`}
              className="text-sm text-zinc-300 hover:underline"
            >
              View Related Break
            </Link>
          </div>
        ) : null}
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="text-xl font-semibold">Sales History</h2>
        </div>

        {sales.length === 0 ? (
          <div className="px-5 py-8 text-zinc-400">No sales recorded for this item.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-950 text-zinc-400">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
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
                {sales.map((sale) => {
                  const reversed = !!sale.reversed_at

                  return (
                    <tr key={sale.id} className="border-t border-zinc-800">
                      <td className="px-4 py-3">
                        {reversed ? (
                          <div>
                            <div className="text-yellow-300">Reversed</div>
                            <div className="text-xs text-zinc-500">
                              {formatDateTime(sale.reversed_at)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-emerald-300">Active</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{sale.sale_date || '—'}</td>
                      <td className="px-4 py-3">{sale.quantity_sold ?? 0}</td>
                      <td className="px-4 py-3">{money(sale.gross_sale)}</td>
                      <td className="px-4 py-3">{money(sale.net_proceeds)}</td>
                      <td className="px-4 py-3">{money(sale.cost_of_goods_sold)}</td>
                      <td className="px-4 py-3">{money(sale.profit)}</td>
                      <td className="px-4 py-3">{sale.platform || '—'}</td>
                      <td className="px-4 py-3">
                        {reversed ? (
                          <div className="text-xs text-zinc-500">
                            {sale.reversal_reason || 'Already reversed'}
                          </div>
                        ) : (
                          <form action={reverseSaleAction} className="space-y-2">
                            <input type="hidden" name="sale_id" value={sale.id} />
                            <input
                              type="hidden"
                              name="inventory_item_id"
                              value={item.id}
                            />
                            <textarea
                              name="reversal_reason"
                              rows={2}
                              placeholder="Optional reversal reason"
                              className="w-full min-w-[220px] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs"
                            />
                            <button
                              type="submit"
                              className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-1.5 text-xs text-red-200 hover:bg-red-950"
                            >
                              Reverse Sale
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid gap-4 border-t border-zinc-800 p-5 md:grid-cols-3">
          <Detail label="Total Gross" value={money(totalGross)} />
          <Detail label="Total Net" value={money(totalNet)} />
          <Detail label="Total Profit" value={money(totalProfit)} />
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
    </div>
  )
}