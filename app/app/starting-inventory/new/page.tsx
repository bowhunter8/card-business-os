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
                placeholder="Player Name"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Year</label>
              <input
                type="number"
                name="year"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                placeholder="Year"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Brand</label>
              <input
                type="text"
                name="brand"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                placeholder="Brand"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Set Name</label>
              <input
                type="text"
                name="set_name"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                placeholder="Set Name"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Card #</label>
              <input
                type="text"
                name="card_number"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                placeholder="Card #"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Parallel</label>
              <input
                type="text"
                name="parallel_name"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                placeholder="Parallel"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Variation</label>
              <input
                type="text"
                name="variation"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                placeholder="Variation"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Team</label>
              <input
                type="text"
                name="team"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                placeholder="Team"
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
              <label className="mb-1 block text-sm text-zinc-300">Unit Cost (per card / item)</label>
              <input
                type="number"
                name="cost_basis_unit"
                min="0"
                step="0.0001"
                defaultValue="0"
                placeholder="Enter per-card amount"
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
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
              <div>
                <div className="text-lg font-semibold text-zinc-100">Cost Basis Help</div>
                <div className="mt-1 text-sm text-zinc-400">
                  Guidance on what amounts to enter and when to use each costing method.
                </div>
              </div>

              <div className="text-sm text-zinc-400 transition group-open:rotate-180">
                ▼
              </div>
            </summary>

            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-100">How to enter cost basis</div>
                  <div className="mt-1 text-sm text-zinc-400">
                    Enter your <span className="font-medium text-zinc-200">cost per card or item</span> in the
                    Unit Cost field above. The app calculates total cost automatically using
                    <span className="ml-1 font-medium text-zinc-200">Unit Cost × Quantity</span>.
                  </div>
                </div>

                <div className="rounded-xl border border-amber-900 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
                  Usually best for older cards: <span className="font-semibold">Estimated Legacy</span>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                <div className="text-sm font-semibold text-zinc-100">Quick amount rules</div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="text-sm text-zinc-300">
                    <div className="font-medium text-zinc-200">If quantity is 1</div>
                    Enter the full cost of that single card in <span className="font-medium">Unit Cost</span>.
                  </div>

                  <div className="text-sm text-zinc-300">
                    <div className="font-medium text-zinc-200">If quantity is more than 1</div>
                    Enter the <span className="font-medium">per-card / per-item amount</span>, not the whole total.
                  </div>

                  <div className="text-sm text-zinc-300">
                    <div className="font-medium text-zinc-200">If you only know a group total</div>
                    Divide the total by quantity first, then enter that result as <span className="font-medium">Unit Cost</span>.
                  </div>

                  <div className="text-sm text-zinc-300">
                    <div className="font-medium text-zinc-200">When unsure</div>
                    Use a reasonable, conservative amount and explain it in <span className="font-medium">Tax Notes</span>.
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                  <div className="text-sm font-semibold text-zinc-100">Exact Known</div>
                  <div className="mt-2 text-sm text-zinc-400">
                    Use this when you know the real cost.
                  </div>
                  <div className="mt-3 text-xs uppercase tracking-wide text-zinc-500">What amount to enter</div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Enter the actual amount paid <span className="font-medium">per card/item</span>.
                  </div>
                  <div className="mt-3 text-xs uppercase tracking-wide text-zinc-500">Examples</div>
                  <div className="mt-1 text-sm text-zinc-300">
                    One card bought for $18 → enter <span className="font-medium">$18.00</span>
                    <br />
                    Four identical cards bought for $20 total → enter <span className="font-medium">$5.00</span>
                  </div>
                </div>

                <div className="rounded-xl border border-blue-900/60 bg-blue-950/20 p-4">
                  <div className="text-sm font-semibold text-blue-100">Estimated Legacy</div>
                  <div className="mt-2 text-sm text-zinc-300">
                    Use this for older cards you already owned before you started tracking everything.
                  </div>
                  <div className="mt-3 text-xs uppercase tracking-wide text-blue-300/70">What amount to enter</div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Enter your best reasonable <span className="font-medium">per-card estimate</span>, not current market value.
                  </div>
                  <div className="mt-3 text-xs uppercase tracking-wide text-blue-300/70">Examples</div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Childhood base card you think effectively cost about $0.25 → enter <span className="font-medium">$0.25</span>
                    <br />
                    Older insert you reasonably estimate cost you about $3 → enter <span className="font-medium">$3.00</span>
                  </div>
                  <div className="mt-3 text-xs uppercase tracking-wide text-blue-300/70">Good practice</div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Be conservative and explain your reasoning in Tax Notes.
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                  <div className="text-sm font-semibold text-zinc-100">Bulk Allocated</div>
                  <div className="mt-2 text-sm text-zinc-400">
                    Use this when one total purchase cost was spread across a group of cards or items.
                  </div>
                  <div className="mt-3 text-xs uppercase tracking-wide text-zinc-500">What amount to enter</div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Take the total group cost and divide by quantity. Enter that <span className="font-medium">per-item result</span>.
                  </div>
                  <div className="mt-3 text-xs uppercase tracking-wide text-zinc-500">Examples</div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Lot cost $50 for 100 cards → enter <span className="font-medium">$0.50</span>
                    <br />
                    Break allocation $24 across 8 cards → enter <span className="font-medium">$3.00</span>
                  </div>
                </div>

                <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-4">
                  <div className="text-sm font-semibold text-red-100">Zero Basis</div>
                  <div className="mt-2 text-sm text-zinc-300">
                    Use this only when the item truly had no cost basis.
                  </div>
                  <div className="mt-3 text-xs uppercase tracking-wide text-red-300/70">What amount to enter</div>
                  <div className="mt-1 text-sm text-zinc-300">
                    Enter <span className="font-medium">$0.00</span>.
                  </div>
                  <div className="mt-3 text-xs uppercase tracking-wide text-red-300/70">Examples</div>
                  <div className="mt-1 text-sm text-zinc-300">
                    True free giveaway, free promo item, or other no-cost acquisition.
                  </div>
                  <div className="mt-3 text-xs uppercase tracking-wide text-red-300/70">Warning</div>
                  <div className="mt-1 text-sm text-zinc-300">
                    This makes the full sale amount taxable profit later, so only use it when it is truly correct.
                  </div>
                </div>
              </div>
            </div>
          </details>
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