import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateInventoryItemAction } from '@/app/actions/inventory'

type InventoryItem = {
  id: string
  status: string
  item_type: string
  title: string | null
  player_name: string | null
  year: number | null
  brand: string | null
  set_name: string | null
  card_number: string | null
  parallel_name: string | null
  team: string | null
  quantity: number
  available_quantity: number
  cost_basis_unit: number | null
  cost_basis_total: number | null
  estimated_value_unit: number | null
  estimated_value_total: number | null
  storage_location: string | null
  notes: string | null
}

export default async function EditInventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string; from?: string; break_id?: string }>
}) {
  const { id } = await params
  const pageParams = searchParams ? await searchParams : undefined
  const pageError = pageParams?.error
  const from = pageParams?.from
  const breakId = pageParams?.break_id

  const cameFromBreak = from === 'break' && typeof breakId === 'string' && breakId.length > 0
  const backHref = cameFromBreak ? `/app/breaks/${breakId}` : `/app/inventory/${id}`

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const response = await supabase
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
      notes
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (response.error || !response.data) {
    notFound()
  }

  const item = response.data as InventoryItem

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

  const currentQuantity = Number(item.quantity ?? 0)
  const currentAvailable = Number(item.available_quantity ?? 0)
  const soldQuantity = Math.max(0, currentQuantity - currentAvailable)

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Edit Inventory Item</h1>
          <p className="mt-2 text-zinc-400">{itemLine}</p>
        </div>

        <Link
          href={backHref}
          className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
        >
          {cameFromBreak ? 'Back to Break' : 'Back to Item'}
        </Link>
      </div>

      {pageError ? (
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {pageError}
        </div>
      ) : null}

      <form
        action={updateInventoryItemAction}
        className="mt-6 grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:grid-cols-2"
      >
        <input type="hidden" name="inventory_item_id" value={item.id} />
        <input type="hidden" name="from" value={from ?? ''} />
        <input type="hidden" name="break_id" value={breakId ?? ''} />

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Title</label>
          <input
            name="title"
            defaultValue={item.title ?? ''}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Player</label>
          <input
            name="player_name"
            defaultValue={item.player_name ?? ''}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Year</label>
          <input
            name="year"
            type="number"
            defaultValue={item.year ?? undefined}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Brand</label>
          <input
            name="brand"
            defaultValue={item.brand ?? ''}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Set Name</label>
          <input
            name="set_name"
            defaultValue={item.set_name ?? ''}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Card Number</label>
          <input
            name="card_number"
            defaultValue={item.card_number ?? ''}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Parallel</label>
          <input
            name="parallel_name"
            defaultValue={item.parallel_name ?? ''}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Team</label>
          <input
            name="team"
            defaultValue={item.team ?? ''}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Quantity</label>
          <input
            name="quantity"
            type="number"
            min={Math.max(1, soldQuantity)}
            defaultValue={item.quantity ?? 1}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
          <div className="mt-1 text-xs text-zinc-500">
            Sold: {soldQuantity} • Available now: {currentAvailable}. Quantity cannot go below sold quantity.
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Storage Location</label>
          <input
            name="storage_location"
            defaultValue={item.storage_location ?? ''}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-300">Estimated Value Per Unit</label>
          <input
            name="estimated_value_unit"
            type="number"
            min={0}
            step="0.01"
            defaultValue={item.estimated_value_unit ?? 0}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div className="md:col-span-2 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
          Changing quantity updates available quantity automatically while preserving already sold quantity.
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm text-zinc-300">Notes</label>
          <textarea
            name="notes"
            rows={4}
            defaultValue={item.notes ?? ''}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>

        <div className="md:col-span-2 flex justify-end gap-3 pt-2">
          <Link
            href={backHref}
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-xl bg-white px-5 py-2 font-medium text-black hover:bg-zinc-200"
          >
            Save Item Changes
          </button>
        </div>
      </form>
    </div>
  )
}