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

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Player Name</label>
              <input
                type="text"
                name="player_name"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Year</label>
              <input
                type="number"
                name="year"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Brand</label>
              <input
                type="text"
                name="brand"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Set Name</label>
              <input
                type="text"
                name="set_name"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Card Number</label>
              <input
                type="text"
                name="card_number"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Parallel</label>
              <input
                type="text"
                name="parallel_name"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Variation</label>
              <input
                type="text"
                name="variation"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Team</label>
              <input
                type="text"
                name="team"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="flex items-center gap-2 rounded-xl border border-zinc-700 p-3">
              <input type="checkbox" name="rookie_flag" />
              <span className="text-sm">Rookie</span>
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-zinc-700 p-3">
              <input type="checkbox" name="auto_flag" />
              <span className="text-sm">Autograph</span>
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-zinc-700 p-3">
              <input type="checkbox" name="relic_flag" />
              <span className="text-sm">Relic</span>
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Serial Number</label>
              <input
                type="text"
                name="serial_number_text"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                placeholder="e.g. 12/50"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Condition Note</label>
              <input
                type="text"
                name="condition_note"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Grader</label>
              <input
                type="text"
                name="grader"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                placeholder="PSA, SGC, BGS..."
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Grade</label>
              <input
                type="text"
                name="grade"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                placeholder="10, 9.5, Raw..."
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">Cost Basis and Tax Notes</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
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
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Unit Cost</label>
              <input
                type="number"
                name="cost_basis_unit"
                min="0"
                step="0.0001"
                defaultValue="0"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Estimated Value Unit</label>
              <input
                type="number"
                name="estimated_value_unit"
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Acquisition Source</label>
              <input
                type="text"
                name="acquisition_source"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                placeholder="Childhood collection, old purchase, trade..."
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Acquired Date</label>
              <input
                type="date"
                name="acquired_date"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Storage Location</label>
              <input
                type="text"
                name="storage_location"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm text-zinc-300">Tax Notes</label>
            <textarea
              name="tax_notes"
              rows={4}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              placeholder="Explain how you arrived at cost basis if needed."
            />
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">General Notes</h2>

          <div className="mt-4">
            <label className="mb-1 block text-sm text-zinc-300">Notes</label>
            <textarea
              name="notes"
              rows={4}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              placeholder="Any extra notes for this item"
            />
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
          >
            Save Starting Inventory Item
          </button>

          <Link
            href="/app/starting-inventory"
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}