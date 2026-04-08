import Link from 'next/link'
import { createStartingInventoryItemAction } from '@/app/actions/starting-inventory'

export default async function NewStartingInventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>
}) {
  const params = searchParams ? await searchParams : undefined
  const error = params?.error

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Add Starting Inventory</h1>
          <p className="mt-2 text-zinc-400">
            Enter cards or lots you already owned before tracking them in the app.
          </p>
        </div>

        <Link
          href="/app/starting-inventory"
          className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
        >
          Back
        </Link>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <form action={createStartingInventoryItemAction} className="mt-6 space-y-6">
        
        {/* BASICS */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">Starting Inventory Basics</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Destination</label>
              <select
                name="destination"
                defaultValue="sell"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              >
                <option value="sell">Sell Inventory</option>
                <option value="personal">Personal Collection</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Item Type</label>
              <select
                name="item_type"
                defaultValue="single_card"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              >
                <option value="single_card">Single Card</option>
                <option value="multi_quantity_card">Multi Quantity Card</option>
                <option value="bulk_lot_line">Bulk Lot Line</option>
                <option value="team_lot_line">Team Lot Line</option>
                <option value="insert_lot_line">Insert Lot Line</option>
                <option value="common_lot_line">Common Lot Line</option>
                <option value="sealed_item">Sealed Item</option>
                <option value="set_piece">Set Piece</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Quantity</label>
              <input
                type="number"
                name="quantity"
                min="1"
                step="1"
                defaultValue="1"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>
          </div>
        </section>

        {/* CARD DETAILS */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">Card Details</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="md:col-span-3">
              <label className="mb-1 block text-sm text-zinc-300">Title</label>
              <input
                type="text"
                name="title"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                placeholder="Optional display title"
              />
            </div>

            <input name="player_name" placeholder="Player Name" className="input" />
            <input name="year" placeholder="Year" className="input" />
            <input name="brand" placeholder="Brand" className="input" />
            <input name="set_name" placeholder="Set Name" className="input" />
            <input name="card_number" placeholder="Card #" className="input" />
            <input name="parallel_name" placeholder="Parallel" className="input" />
            <input name="variation" placeholder="Variation" className="input" />
            <input name="team" placeholder="Team" className="input" />
          </div>
        </section>

        {/* COST + TAX */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">Cost Basis and Tax Notes</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-3">

            {/* COST METHOD WITH GUIDE */}
            <div className="md:col-span-3">
              <label className="mb-1 block text-sm text-zinc-300">Cost Basis Method</label>
              <select
                name="cost_basis_method"
                defaultValue="estimated_legacy"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              >
                <option value="exact_known">Exact Known</option>
                <option value="estimated_legacy">Estimated Legacy</option>
                <option value="bulk_allocated">Bulk Allocated</option>
                <option value="zero_basis">Zero Basis</option>
              </select>

              <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-300">
                <div className="font-medium text-zinc-100">Cost basis method guide</div>

                <div className="mt-2 text-amber-300">
                  For most pre-existing collection items, <span className="font-medium">Estimated Legacy</span> is usually the best starting choice.
                </div>

                <div className="mt-3 space-y-3">
                  <div>
                    <div className="font-medium text-zinc-200">Exact Known</div>
                    <div className="text-zinc-400">
                      Use when you know exactly what you paid.
                    </div>
                  </div>

                  <div>
                    <div className="font-medium text-zinc-200">Estimated Legacy</div>
                    <div className="text-zinc-400">
                      Best for childhood or pre-tracked cards.
                    </div>
                  </div>

                  <div>
                    <div className="font-medium text-zinc-200">Bulk Allocated</div>
                    <div className="text-zinc-400">
                      Use for lots and bulk purchases.
                    </div>
                  </div>

                  <div>
                    <div className="font-medium text-zinc-200">Zero Basis</div>
                    <div className="text-zinc-400">
                      Only use if truly free.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <input name="cost_basis_unit" placeholder="Unit Cost" className="input" />
            <input name="estimated_value_unit" placeholder="Est Value" className="input" />
            <input name="acquisition_source" placeholder="Source" className="input" />
          </div>
        </section>

        <div className="flex gap-3">
          <button className="rounded-xl bg-white px-4 py-2 text-black">
            Save
          </button>

          <Link href="/app/starting-inventory" className="btn">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}