'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { updateStartingInventoryItemAction } from '@/app/actions/starting-inventory'

type EntryMode = 'single' | 'bulk'

type EditStartingInventoryPageProps = {
  params: {
    id: string
  }
}

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

  opgLow: string
  opgHigh: string
}

function asNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value: number) {
  return value.toFixed(2)
}

function inferEntryMode(itemType: string) {
  return [
    'common_lot_line',
    'bulk_lot_line',
    'team_lot_line',
    'insert_lot_line',
  ].includes(itemType)
    ? 'bulk'
    : 'single'
}

export default function EditStartingInventoryPage({
  params,
}: EditStartingInventoryPageProps) {
  const raw = typeof window !== 'undefined'
    ? (window as any).__NEXT_DATA__?.props?.pageProps?.item
    : null

  const initial = raw ?? {
    id: params.id,
    destination: 'sell',
    item_type: 'single_card',
    title: '',
    player_name: '',
    year: '',
    brand: '',
    set_name: '',
    card_number: '',
    parallel_name: '',
    variation: '',
    team: '',
    rookie_flag: false,
    auto_flag: false,
    relic_flag: false,
    serial_number_text: '',
    condition_note: '',
    grader: '',
    grade: '',
    quantity: 1,
    cost_basis_method: 'estimated_legacy',
    cost_basis_unit: 0,
    estimated_value_unit: '',
    acquisition_source: '',
    acquired_date: '',
    storage_location: '',
    tax_notes: '',
    notes: '',
  }

  const [form, setForm] = useState<FormState>({
    entryMode: inferEntryMode(initial.item_type ?? 'single_card'),
    destination: initial.destination === 'personal' ? 'personal' : 'sell',
    itemType: initial.item_type ?? 'single_card',

    title: initial.title ?? '',
    playerName: initial.player_name ?? '',
    year: initial.year ? String(initial.year) : '',
    brand: initial.brand ?? '',
    setName: initial.set_name ?? '',
    cardNumber: initial.card_number ?? '',
    parallelName: initial.parallel_name ?? '',
    variation: initial.variation ?? '',
    team: initial.team ?? '',

    rookieFlag: !!initial.rookie_flag,
    autoFlag: !!initial.auto_flag,
    relicFlag: !!initial.relic_flag,
    serialNumberText: initial.serial_number_text ?? '',
    conditionNote: initial.condition_note ?? '',
    grader: initial.grader ?? '',
    grade: initial.grade ?? '',

    quantity: initial.quantity ? String(initial.quantity) : '1',
    costBasisMethod: initial.cost_basis_method ?? 'estimated_legacy',
    costBasisUnit:
      initial.cost_basis_unit !== null && initial.cost_basis_unit !== undefined
        ? String(initial.cost_basis_unit)
        : '0',
    estimatedValueUnit:
      initial.estimated_value_unit !== null && initial.estimated_value_unit !== undefined
        ? String(initial.estimated_value_unit)
        : '',
    acquisitionSource: initial.acquisition_source ?? '',
    acquiredDate: initial.acquired_date ?? '',
    storageLocation: initial.storage_location ?? '',
    taxNotes: initial.tax_notes ?? '',
    notes: initial.notes ?? '',

    bulkDescription: initial.notes ?? '',

    opgLow: '',
    opgHigh: '',
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

  function autoFillFromOpg() {
    const low = asNumber(form.opgLow)
    const high = asNumber(form.opgHigh)

    if (low > 0) {
      update('costBasisUnit', low.toFixed(2))
    }

    if (low > 0 && high > 0) {
      const midpoint = ((low + high) / 2).toFixed(2)
      update('estimatedValueUnit', midpoint)
    }
  }

  const isBulk = form.entryMode === 'bulk'

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Edit Starting Inventory</h1>
          <p className="mt-2 text-zinc-400">
            Update your starting inventory entry before importing it.
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
        <input type="hidden" name="id" value={params.id} />
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
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Player Name</label>
                <input
                  type="text"
                  value={form.playerName}
                  onChange={(e) => update('playerName', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Year</label>
                <input
                  type="number"
                  value={form.year}
                  onChange={(e) => update('year', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Brand</label>
                <input
                  type="text"
                  value={form.brand}
                  onChange={(e) => update('brand', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Set Name</label>
                <input
                  type="text"
                  value={form.setName}
                  onChange={(e) => update('setName', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Card #</label>
                <input
                  type="text"
                  value={form.cardNumber}
                  onChange={(e) => update('cardNumber', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Parallel</label>
                <input
                  type="text"
                  value={form.parallelName}
                  onChange={(e) => update('parallelName', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Variation</label>
                <input
                  type="text"
                  value={form.variation}
                  onChange={(e) => update('variation', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Team</label>
                <input
                  type="text"
                  value={form.team}
                  onChange={(e) => update('team', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
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
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Grade</label>
                <input
                  type="text"
                  value={form.grade}
                  onChange={(e) => update('grade', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">Bulk Lot Details</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="md:col-span-3">
                <label className="mb-1 block text-sm text-zinc-300">Lot Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Year</label>
                <input
                  type="number"
                  value={form.year}
                  onChange={(e) => update('year', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Brand</label>
                <input
                  type="text"
                  value={form.brand}
                  onChange={(e) => update('brand', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-zinc-300">Set Name</label>
                <input
                  type="text"
                  value={form.setName}
                  onChange={(e) => update('setName', e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
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
              <label className="mb-1 block text-sm text-zinc-300">OPG Low</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.opgLow}
                onChange={(e) => update('opgLow', e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                placeholder="Online price guide low"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">OPG High</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.opgHigh}
                onChange={(e) => update('opgHigh', e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                placeholder="Online price guide high"
              />
            </div>

            <div className="md:col-span-3">
              <button
                type="button"
                onClick={autoFillFromOpg}
                className="w-full rounded-xl border border-emerald-700 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-900/20"
              >
                Auto-fill cost + value from OPG
              </button>
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-300">Unit Cost (per card / item)</label>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={form.costBasisUnit}
                onChange={(e) => update('costBasisUnit', e.target.value)}
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
            />
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            formAction={updateStartingInventoryItemAction}
            className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
          >
            Save Changes
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