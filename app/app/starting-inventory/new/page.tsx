'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { createStartingInventoryItemAction } from '@/app/actions/starting-inventory'

type EntryMode = 'single' | 'bulk'

type FormState = {
  entryMode: EntryMode
  destination: 'sell' | 'personal'
  itemType: string

  title: string
  playerName: string
  year: string
  brand: string
  setName: string
  cardNumber: string
  parallelName: string
  variation: string
  team: string

  rookieFlag: boolean
  autoFlag: boolean
  relicFlag: boolean
  serialNumberText: string
  conditionNote: string
  grader: string
  grade: string

  quantity: string
  costBasisMethod: string
  costBasisUnit: string
  estimatedValueUnit: string
  acquisitionSource: string
  acquiredDate: string
  storageLocation: string
  taxNotes: string
  notes: string

  bulkDescription: string
}

function asNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value: number) {
  return value.toFixed(2)
}

export default function NewStartingInventoryPage() {
  const [form, setForm] = useState<FormState>({
    entryMode: 'single',
    destination: 'sell',
    itemType: 'single_card',

    title: '',
    playerName: '',
    year: '',
    brand: '',
    setName: '',
    cardNumber: '',
    parallelName: '',
    variation: '',
    team: '',

    rookieFlag: false,
    autoFlag: false,
    relicFlag: false,
    serialNumberText: '',
    conditionNote: '',
    grader: '',
    grade: '',

    quantity: '1',
    costBasisMethod: 'estimated_legacy',
    costBasisUnit: '0',
    estimatedValueUnit: '',
    acquisitionSource: '',
    acquiredDate: '',
    storageLocation: '',
    taxNotes: '',
    notes: '',

    bulkDescription: '',
  })

  const quantityNumber = useMemo(
    () => Math.max(1, Math.floor(asNumber(form.quantity) || 1)),
    [form.quantity]
  )
  const unitCostNumber = useMemo(() => asNumber(form.costBasisUnit), [form.costBasisUnit])
  const totalCost = useMemo(() => unitCostNumber * quantityNumber, [unitCostNumber, quantityNumber])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function switchMode(mode: EntryMode) {
    setForm((prev) => ({
      ...prev,
      entryMode: mode,
      itemType:
        mode === 'bulk'
          ? prev.itemType === 'single_card'
            ? 'common_lot_line'
            : prev.itemType
          : prev.itemType === 'common_lot_line' ||
              prev.itemType === 'bulk_lot_line' ||
              prev.itemType === 'team_lot_line' ||
              prev.itemType === 'insert_lot_line'
            ? 'single_card'
            : prev.itemType,
    }))
  }

  const isBulk = form.entryMode === 'bulk'

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

      <form className="mt-6 space-y-6">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">Entry Mode</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => switchMode('single')}
              className={`rounded-2xl border p-4 text-left transition ${
                !isBulk
                  ? 'border-white bg-zinc-100 text-black'
                  : 'border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800'
              }`}
            >
              <div className="text-base font-semibold">Single Card / Item</div>
              <div className={`mt-1 text-sm ${!isBulk ? 'text-zinc-700' : 'text-zinc-400'}`}>
                Best for one card, one sealed item, or one clearly identified item.
              </div>
            </button>

            <button
              type="button"
              onClick={() => switchMode('bulk')}
              className={`rounded-2xl border p-4 text-left transition ${
                isBulk
                  ? 'border-white bg-zinc-100 text-black'
                  : 'border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800'
              }`}
            >
              <div className="text-base font-semibold">Bulk Lot / Grouped Entry</div>
              <div className={`mt-1 text-sm ${isBulk ? 'text-zinc-700' : 'text-zinc-400'}`}>
                Best for commons, lots, grouped childhood cards, and bulk inventory.
              </div>
            </button>
          </div>
        </section>

        <input type="hidden" name="destination" value={form.destination} />
        <input type="hidden" name="item_type" value={form.itemType} />
        <input type="hidden" name="title" value={form.title} />
        <input type="hidden" name="player_name" value={form.playerName} />
        <input type="hidden" name="year" value={form.year} />
        <input type="hidden" name="brand" value={form.brand} />
        <input type="hidden" name="set_name" value={form.setName} />
        <input type="hidden" name="card_number" value={form.cardNumber} />
        <input type="hidden" name="parallel_name" value={form.parallelName} />
        <input type="hidden" name="variation" value={form.variation} />
        <input type="hidden" name="team" value={form.team} />
        <input type="hidden" name="quantity" value={String(quantityNumber)} />
        <input type="hidden" name="cost_basis_method" value={form.costBasisMethod} />
        <input type="hidden" name="cost_basis_unit" value={form.costBasisUnit} />
        <input type="hidden" name="estimated_value_unit" value={form.estimatedValueUnit} />
        <input type="hidden" name="acquisition_source" value={form.acquisitionSource} />
        <input type="hidden" name="acquired_date" value={form.acquiredDate} />
        <input type="hidden" name="storage_location" value={form.storageLocation} />
        <input type="hidden" name="tax_notes" value={form.taxNotes} />
        <input type="hidden" name="notes" value={form.notes} />
        <input type="hidden" name="condition_note" value={form.conditionNote} />
        <input type="hidden" name="grader" value={form.grader} />
        <input type="hidden" name="grade" value={form.grade} />
        <input type="hidden" name="serial_number_text" value={form.serialNumberText} />
        {form.rookieFlag ? <input type="hidden" name="rookie_flag" value="on" /> : null}
        {form.autoFlag ? <input type="hidden" name="auto_flag" value="on" /> : null}
        {form.relicFlag ? <input type="hidden" name="relic_flag" value="on" /> : null}

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">Starting Inventory Basics</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Destination</label>
              <select
                value={form.destination}
                onChange={(e) => update('destination', e.target.value as 'sell' | 'personal')}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              >
                <option value="sell">Sell Inventory</option>
                <option value="personal">Personal Collection</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Item Type</label>
              <select
                value={form.itemType}
                onChange={(e) => update('itemType', e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              >
                {!isBulk ? (
                  <>
                    <option value="single_card">Single Card</option>
                    <option value="multi_quantity_card">Multi Quantity Card</option>
                    <option value="sealed_item">Sealed Item</option>
                    <option value="set_piece">Set Piece</option>
                  </>
                ) : (
                  <>
                    <option value="common_lot_line">Common Lot</option>
                    <option value="bulk_lot_line">Bulk Lot</option>
                    <option value="team_lot_line">Team Lot</option>
                    <option value="insert_lot_line">Insert Lot</option>
                    <option value="set_piece">Set Piece Group</option>
                    <option value="sealed_item">Sealed Item Group</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Quantity</label>
              <input
                type="number"
                min="1"
                step="1"
                value={form.quantity}
                onChange={(e) => update('quantity', e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>
          </div>
        </section>

        {!isBulk ? (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">Card Details</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="md:col-span-3">
                <label className="mb-1 block text-sm text-zinc-300">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="Optional display title"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Player Name</label>
                <input
                  type="text"
                  value={form.playerName}
                  onChange={(e) => update('playerName', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="Player Name"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Year</label>
                <input
                  type="number"
                  value={form.year}
                  onChange={(e) => update('year', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="Year"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Brand</label>
                <input
                  type="text"
                  value={form.brand}
                  onChange={(e) => update('brand', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="Brand"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Set Name</label>
                <input
                  type="text"
                  value={form.setName}
                  onChange={(e) => update('setName', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="Set Name"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Card #</label>
                <input
                  type="text"
                  value={form.cardNumber}
                  onChange={(e) => update('cardNumber', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="Card #"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Parallel</label>
                <input
                  type="text"
                  value={form.parallelName}
                  onChange={(e) => update('parallelName', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="Parallel"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Variation</label>
                <input
                  type="text"
                  value={form.variation}
                  onChange={(e) => update('variation', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="Variation"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Team</label>
                <input
                  type="text"
                  value={form.team}
                  onChange={(e) => update('team', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="Team"
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="flex items-center gap-2 rounded-xl border border-zinc-700 p-3">
                <input
                  type="checkbox"
                  checked={form.rookieFlag}
                  onChange={(e) => update('rookieFlag', e.target.checked)}
                />
                <span className="text-sm">Rookie</span>
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-zinc-700 p-3">
                <input
                  type="checkbox"
                  checked={form.autoFlag}
                  onChange={(e) => update('autoFlag', e.target.checked)}
                />
                <span className="text-sm">Autograph</span>
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-zinc-700 p-3">
                <input
                  type="checkbox"
                  checked={form.relicFlag}
                  onChange={(e) => update('relicFlag', e.target.checked)}
                />
                <span className="text-sm">Relic</span>
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-sm text-zinc-300">Serial Number</label>
                <input
                  type="text"
                  value={form.serialNumberText}
                  onChange={(e) => update('serialNumberText', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="e.g. 12/50"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Condition Note</label>
                <input
                  type="text"
                  value={form.conditionNote}
                  onChange={(e) => update('conditionNote', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Grader</label>
                <input
                  type="text"
                  value={form.grader}
                  onChange={(e) => update('grader', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="PSA, SGC, BGS..."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Grade</label>
                <input
                  type="text"
                  value={form.grade}
                  onChange={(e) => update('grade', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="10, 9.5, Raw..."
                />
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">Bulk Lot Details</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Create one grouped line for commons, inserts, team lots, childhood boxes, or other bulk inventory.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="md:col-span-3">
                <label className="mb-1 block text-sm text-zinc-300">Lot Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="Example: 1989 Upper Deck commons lot"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Year</label>
                <input
                  type="number"
                  value={form.year}
                  onChange={(e) => update('year', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="Year"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Brand</label>
                <input
                  type="text"
                  value={form.brand}
                  onChange={(e) => update('brand', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="Brand"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Set Name</label>
                <input
                  type="text"
                  value={form.setName}
                  onChange={(e) => update('setName', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="Set Name"
                />
              </div>

              <div className="md:col-span-3">
                <label className="mb-1 block text-sm text-zinc-300">Bulk Description</label>
                <textarea
                  rows={4}
                  value={form.bulkDescription}
                  onChange={(e) => {
                    update('bulkDescription', e.target.value)
                    update('notes', e.target.value)
                  }}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                  placeholder="Example: Childhood commons box, roughly sorted by set, grouped as one lot."
                />
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">Cost Basis and Tax Notes</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Cost Basis Method</label>
              <select
                value={form.costBasisMethod}
                onChange={(e) => update('costBasisMethod', e.target.value)}
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
                min="0"
                step="0.0001"
                value={form.costBasisUnit}
                onChange={(e) => update('costBasisUnit', e.target.value)}
                placeholder="Enter per-card amount"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Estimated Value Unit</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.estimatedValueUnit}
                onChange={(e) => update('estimatedValueUnit', e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Acquisition Source</label>
              <input
                type="text"
                value={form.acquisitionSource}
                onChange={(e) => update('acquisitionSource', e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                placeholder="Childhood collection, old purchase, trade..."
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Acquired Date</label>
              <input
                type="date"
                value={form.acquiredDate}
                onChange={(e) => update('acquiredDate', e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Storage Location</label>
              <input
                type="text"
                value={form.storageLocation}
                onChange={(e) => update('storageLocation', e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
              <div className="text-sm text-zinc-400">Quantity</div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">{quantityNumber}</div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
              <div className="text-sm text-zinc-400">Unit Cost</div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">${money(unitCostNumber)}</div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
              <div className="text-sm text-zinc-400">Total Cost</div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">${money(totalCost)}</div>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm text-zinc-300">Tax Notes</label>
            <textarea
              rows={4}
              value={form.taxNotes}
              onChange={(e) => update('taxNotes', e.target.value)}
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

              <div className="text-sm text-zinc-400 transition group-open:rotate-180">▼</div>
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
                </div>
              </div>
            </div>
          </details>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">{isBulk ? 'Bulk Notes' : 'General Notes'}</h2>

          <div className="mt-4">
            <label className="mb-1 block text-sm text-zinc-300">Notes</label>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              placeholder={isBulk ? 'Any extra notes about this grouped lot' : 'Any extra notes for this item'}
            />
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            formAction={createStartingInventoryItemAction}
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