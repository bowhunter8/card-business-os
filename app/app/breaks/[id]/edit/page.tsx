import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateBreakAction } from '@/app/actions/breaks'

type BreakRow = {
  id: string
  break_date: string
  source_name: string | null
  product_name: string | null
  format_type: string | null
  teams: string[] | null
  purchase_price: number | null
  sales_tax: number | null
  shipping_cost: number | null
  other_fees: number | null
  total_cost: number | null
  allocation_method: string | null
  notes: string | null
  order_number: string | null
  cards_received: number | null
  reversed_at: string | null
}

export default async function EditBreakPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string }>
}) {
  const { id } = await params
  const query = searchParams ? await searchParams : undefined
  const error = query?.error

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const response = await supabase
    .from('breaks')
    .select(`
      id,
      break_date,
      source_name,
      product_name,
      format_type,
      teams,
      purchase_price,
      sales_tax,
      shipping_cost,
      other_fees,
      total_cost,
      allocation_method,
      notes,
      order_number,
      cards_received,
      reversed_at
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (response.error || !response.data) {
    notFound()
  }

  const item = response.data as BreakRow

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Edit Break</h1>
          <p className="mt-2 text-zinc-400">
            Update this break just like a normal break entry.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href={`/app/breaks/${item.id}`}
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Back to Break
          </Link>
          <Link
            href="/app/breaks"
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            All Breaks
          </Link>
        </div>
      </div>

      {item.reversed_at ? (
        <div className="mt-6 rounded-xl border border-yellow-900 bg-yellow-950/40 px-4 py-3 text-sm text-yellow-300">
          Reversed breaks cannot be edited.
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {!item.reversed_at ? (
        <form
          action={updateBreakAction}
          className="mt-6 grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:grid-cols-2"
        >
          <input type="hidden" name="break_id" value={item.id} />

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Break Date</label>
            <input
              name="break_date"
              type="date"
              required
              defaultValue={item.break_date}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Source / Breaker</label>
            <input
              name="source_name"
              type="text"
              required
              defaultValue={item.source_name || ''}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Product Name</label>
            <input
              name="product_name"
              type="text"
              required
              defaultValue={item.product_name || ''}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Order #</label>
            <input
              name="order_number"
              type="text"
              defaultValue={item.order_number || ''}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Cards Received</label>
            <input
              name="cards_received"
              type="number"
              min={0}
              defaultValue={Number(item.cards_received ?? 0)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Format Type</label>
            <input
              name="format_type"
              type="text"
              defaultValue={item.format_type || ''}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Teams / Spots</label>
            <input
              name="teams"
              type="text"
              defaultValue={item.teams?.join(', ') || ''}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Purchase Price</label>
            <input
              name="purchase_price"
              type="number"
              min={0}
              step="0.01"
              defaultValue={Number(item.purchase_price ?? 0).toFixed(2)}
              required
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Sales Tax</label>
            <input
              name="sales_tax"
              type="number"
              min={0}
              step="0.01"
              defaultValue={Number(item.sales_tax ?? 0).toFixed(2)}
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
              defaultValue={Number(item.shipping_cost ?? 0).toFixed(2)}
              required
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Other Fees</label>
            <input
              name="other_fees"
              type="number"
              min={0}
              step="0.01"
              defaultValue={Number(item.other_fees ?? 0).toFixed(2)}
              required
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Allocation Method</label>
            <select
              name="allocation_method"
              defaultValue={item.allocation_method || 'equal_per_item'}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            >
              <option value="equal_per_item">Equal Per Item</option>
              <option value="equal_per_sellable_item">Equal Per Sellable Item</option>
              <option value="manual">Manual</option>
              <option value="bulk_common_split">Bulk Common Split</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="text-sm font-medium text-zinc-200">Edit notes</div>
            <div className="mt-2 space-y-1 text-sm text-zinc-400">
              <p>Update source, costs, and order info</p>
              <p>Adjust cards received if needed</p>
              <p>Total cost will be recalculated on save</p>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm text-zinc-300">Notes</label>
            <textarea
              name="notes"
              rows={5}
              defaultValue={item.notes || ''}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 pt-2">
            <Link
              href={`/app/breaks/${item.id}`}
              className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-xl bg-white px-5 py-2 font-medium text-black hover:bg-zinc-200"
            >
              Save Changes
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}