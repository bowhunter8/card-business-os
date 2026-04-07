import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { deleteSaleAction, updateSaleAction } from '@/app/actions/sales'

function money(value: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

type SaleRow = {
  id: string
  inventory_item_id: string
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

type InventoryItem = {
  id: string
  title: string | null
  player_name: string | null
  year: number | null
  brand: string | null
  set_name: string | null
  card_number: string | null
  parallel_name: string | null
  team: string | null
  available_quantity: number
  quantity: number
  cost_basis_unit: number | null
}

export default async function EditSalePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const saleResponse = await supabase
    .from('sales')
    .select(
      `
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
    `
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (saleResponse.error || !saleResponse.data) {
    notFound()
  }

  const sale = saleResponse.data as SaleRow

  const itemResponse = await supabase
    .from('inventory_items')
    .select(
      `
      id,
      title,
      player_name,
      year,
      brand,
      set_name,
      card_number,
      parallel_name,
      team,
      available_quantity,
      quantity,
      cost_basis_unit
    `
    )
    .eq('id', sale.inventory_item_id)
    .eq('user_id', user.id)
    .single()

  if (itemResponse.error || !itemResponse.data) {
    notFound()
  }

  const item = itemResponse.data as InventoryItem

  const itemLine = [
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

  const maxEditableQty =
    Number(item.available_quantity ?? 0) + Number(sale.quantity_sold ?? 0)

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Edit Sale</h1>
          <p className="mt-2 text-zinc-400">{itemLine}</p>
        </div>

        <Link
          href={`/app/inventory/${item.id}`}
          className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
        >
          Back to Item
        </Link>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:grid-cols-3">
        <div>
          <div className="text-sm text-zinc-400">Current Qty Sold</div>
          <div className="mt-1">{sale.quantity_sold ?? 0}</div>
        </div>
        <div>
          <div className="text-sm text-zinc-400">Editable Max Qty</div>
          <div className="mt-1">{maxEditableQty}</div>
        </div>
        <div>
          <div className="text-sm text-zinc-400">Unit Cost Basis</div>
          <div className="mt-1">{money(item.cost_basis_unit)}</div>
        </div>
      </div>

      <form
        action={updateSaleAction}
        className="mt-6 grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:grid-cols-2"
      >
        <input type="hidden" name="sale_id" value={sale.id} />
        <input type="hidden" name="inventory_item_id" value={sale.inventory_item_id} />

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Sale Date</label>
          <input
            name="sale_date"
            type="date"
            required
            defaultValue={sale.sale_date}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Quantity Sold</label>
          <input
            name="quantity_sold"
            type="number"
            min={1}
            max={maxEditableQty}
            defaultValue={sale.quantity_sold ?? 1}
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Gross Sale</label>
          <input
            name="gross_sale"
            type="number"
            min={0}
            step="0.01"
            defaultValue={Number(sale.gross_sale ?? 0)}
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Platform Fees</label>
          <input
            name="platform_fees"
            type="number"
            min={0}
            step="0.01"
            defaultValue={Number(sale.platform_fees ?? 0)}
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Shipping Cost</label>
          <input
            name="shipping_cost"
            type="number"
            min={0}
            step="0.01"
            defaultValue={Number(sale.shipping_cost ?? 0)}
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Other Costs</label>
          <input
            name="other_costs"
            type="number"
            min={0}
            step="0.01"
            defaultValue={Number(sale.other_costs ?? 0)}
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Platform</label>
          <input
            name="platform"
            type="text"
            defaultValue={sale.platform ?? ''}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm text-zinc-300">Notes</label>
          <textarea
            name="notes"
            rows={4}
            defaultValue={sale.notes ?? ''}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div className="md:col-span-2 flex items-center justify-between gap-3 pt-2">
          <button
            type="submit"
            formAction={deleteSaleAction}
            className="rounded-xl border border-red-800 px-4 py-2 text-red-300 hover:bg-red-950/40"
          >
            Delete Sale
          </button>

          <div className="flex gap-3">
            <Link
              href={`/app/inventory/${item.id}`}
              className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-xl bg-white px-5 py-2 font-medium text-black hover:bg-zinc-200"
            >
              Save Sale Changes
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}