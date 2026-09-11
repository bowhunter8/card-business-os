'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type BreakFormat =
  | 'pyt'
  | 'pyp'
  | 'random_team'
  | 'random_player'
  | 'custom'

type SealedInventoryItem = {
  id: string
  product_name: string
  year: string | null
  manufacturer: string | null
  brand: string | null
  configuration: string | null
  inventory_unit_type: string
  quantity_remaining: number
  original_unit_cost_basis: number | null
  status: string
}

type CreateBreakResult = {
  breaker_break_id: string
  breaker_break_product_id: string
  sealed_product_name: string
  quantity_planned: number
  actual_unit_cost_basis: number
  actual_planned_cost_basis: number
  assigned_value: number | null
}

type BreakSuccess = {
  breakName: string
  breakFormatLabel: string
  productName: string
  quantityPlanned: number
  inventoryUnitType: string
  actualPlannedCostBasis: number
  assignedValue: number | null
  targetRevenue: number | null
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function parseMoney(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseWholeNumber(value: string) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function titleCase(value: string | null | undefined) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function todayLocal() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  const local = new Date(now.getTime() - offset * 60 * 1000)
  return local.toISOString().slice(0, 10)
}

function formatBreakFormat(value: BreakFormat) {
  switch (value) {
    case 'pyt':
      return 'PYT — Pick Your Team'
    case 'pyp':
      return 'PYP — Pick Your Player'
    case 'random_team':
      return 'Random Team'
    case 'random_player':
      return 'Random Player'
    case 'custom':
      return 'Other / Custom'
  }
}

export default function NewBreakerBreakPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const messageRef = useRef<HTMLDivElement | null>(null)
  const [isPending, startTransition] = useTransition()

  const [sealedItems, setSealedItems] = useState<SealedInventoryItem[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [success, setSuccess] = useState<BreakSuccess | null>(null)

  const [breakName, setBreakName] = useState('')
  const [breakDate, setBreakDate] = useState(todayLocal())
  const [breakFormat, setBreakFormat] = useState<BreakFormat>('pyt')
  const [platform, setPlatform] = useState('')
  const [showReference, setShowReference] = useState('')
  const [targetRevenue, setTargetRevenue] = useState('')
  const [notes, setNotes] = useState('')

  const [sealedInventoryItemId, setSealedInventoryItemId] = useState('')
  const [quantityPlanned, setQuantityPlanned] = useState('1')
  const [assignedValue, setAssignedValue] = useState('')
  const [productNotes, setProductNotes] = useState('')

  useEffect(() => {
    let active = true

    async function loadSealedInventory() {
      setLoadingItems(true)
      setLoadError(null)

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) throw userError
        if (!user) throw new Error('You must be signed in.')

        const { data, error } = await supabase
          .from('sealed_inventory_items')
          .select(
            [
              'id',
              'product_name',
              'year',
              'manufacturer',
              'brand',
              'configuration',
              'inventory_unit_type',
              'quantity_remaining',
              'original_unit_cost_basis',
              'status',
            ].join(', ')
          )
          .eq('user_id', user.id)
          .eq('status', 'available')
          .gt('quantity_remaining', 0)
          .is('deleted_at', null)
          .order('purchase_date', { ascending: false })
          .order('created_at', { ascending: false })

        if (error) throw error

        const rows = (data ?? []) as unknown as SealedInventoryItem[]

        if (active) {
          setSealedItems(rows)

          if (rows.length > 0) {
            setSealedInventoryItemId((current) => current || rows[0].id)
          }
        }
      } catch (caughtError) {
        if (active) {
          setLoadError(
            caughtError instanceof Error
              ? caughtError.message
              : 'Unable to load sealed inventory.'
          )
        }
      } finally {
        if (active) {
          setLoadingItems(false)
        }
      }
    }

    void loadSealedInventory()

    return () => {
      active = false
    }
  }, [supabase])

  const selectedItem = useMemo(
    () =>
      sealedItems.find((item) => item.id === sealedInventoryItemId) ?? null,
    [sealedItems, sealedInventoryItemId]
  )

  const plannedQty = parseWholeNumber(quantityPlanned)
  const actualUnitCostBasis = Number(selectedItem?.original_unit_cost_basis ?? 0)
  const actualPlannedCostBasis =
    plannedQty > 0 ? actualUnitCostBasis * plannedQty : 0

  const assignedValueNumber = parseMoney(assignedValue)
  const targetRevenueNumber = parseMoney(targetRevenue)

  const pricingSpread =
    assignedValueNumber == null
      ? null
      : assignedValueNumber - actualPlannedCostBasis

  const revenueVsAssigned =
    targetRevenueNumber == null || assignedValueNumber == null
      ? null
      : targetRevenueNumber - assignedValueNumber

  const productMeta = [
    selectedItem?.year,
    selectedItem?.manufacturer || selectedItem?.brand,
    selectedItem?.configuration,
  ]
    .filter(Boolean)
    .join(' • ')

  function showError(message: string) {
    setSaveError(message)

    window.requestAnimationFrame(() => {
      messageRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  function validate() {
    if (!breakName.trim()) {
      return 'Break name is required.'
    }

    if (!breakDate) {
      return 'Break date is required.'
    }

    if (!sealedInventoryItemId || !selectedItem) {
      return 'Choose a sealed inventory product for this break.'
    }

    if (plannedQty <= 0) {
      return 'Planned quantity must be at least 1.'
    }

    if (plannedQty > Number(selectedItem.quantity_remaining ?? 0)) {
      return `Only ${selectedItem.quantity_remaining} ${titleCase(
        selectedItem.inventory_unit_type
      )}${selectedItem.quantity_remaining === 1 ? '' : 's'} remain in this lot.`
    }

    if (assignedValue.trim() && assignedValueNumber == null) {
      return 'Assigned break value must be a valid number.'
    }

    if (assignedValueNumber != null && assignedValueNumber < 0) {
      return 'Assigned break value cannot be negative.'
    }

    if (targetRevenue.trim() && targetRevenueNumber == null) {
      return 'Target revenue must be a valid number.'
    }

    if (targetRevenueNumber != null && targetRevenueNumber < 0) {
      return 'Target revenue cannot be negative.'
    }

    return null
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaveError(null)

    const validationError = validate()

    if (validationError) {
      showError(validationError)
      return
    }

    startTransition(async () => {
      try {
        const rpcArgs = {
          p_break_name: breakName.trim(),
          p_break_date: breakDate,
          p_break_format: breakFormat,
          p_platform: platform.trim() || null,
          p_show_reference: showReference.trim() || null,
          p_target_revenue: targetRevenueNumber,
          p_notes: notes.trim() || null,
          p_sealed_inventory_item_id: sealedInventoryItemId,
          p_quantity_planned: plannedQty,
          p_assigned_value: assignedValueNumber,
          p_product_notes: productNotes.trim() || null,
        }

        const typedSupabase = supabase as unknown as {
          rpc: (
            fn: string,
            args: Record<string, unknown>
          ) => Promise<{
            data: unknown
            error: { message: string } | null
          }>
        }

        const { data, error } = await typedSupabase.rpc(
          'create_breaker_break_draft',
          rpcArgs
        )

        if (error) {
          throw new Error(error.message)
        }

        const rows = (data ?? []) as CreateBreakResult[]
        const result = rows[0]

        if (!result) {
          throw new Error(
            'The draft break did not return a completed database record.'
          )
        }

        setSuccess({
          breakName: breakName.trim(),
          breakFormatLabel: formatBreakFormat(breakFormat),
          productName: result.sealed_product_name,
          quantityPlanned: Number(result.quantity_planned ?? plannedQty),
          inventoryUnitType: selectedItem?.inventory_unit_type ?? 'unit',
          actualPlannedCostBasis: Number(
            result.actual_planned_cost_basis ?? actualPlannedCostBasis
          ),
          assignedValue:
            result.assigned_value == null
              ? null
              : Number(result.assigned_value),
          targetRevenue: targetRevenueNumber,
        })
      } catch (caughtError) {
        showError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Unable to create draft break.'
        )
      }
    })
  }

  return (
    <div className="app-page-wide space-y-5">
      {isPending ? (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/65 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
          aria-label="Creating break draft"
        >
          <div className="flex min-w-72 flex-col items-center gap-3 rounded-xl border border-cyan-500/40 bg-zinc-950 px-6 py-5 shadow-2xl">
            <span
              className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-700 border-t-cyan-300"
              aria-hidden="true"
            />
            <div className="text-base font-semibold text-zinc-100">
              Creating break draft…
            </div>
            <div className="text-center text-xs text-zinc-400">
              Saving the break plan and selected sealed product together.
            </div>
          </div>
        </div>
      ) : null}

      {success ? (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 px-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="break-draft-success-title"
        >
          <div className="w-full max-w-xl rounded-xl border border-emerald-500/40 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-950/50 text-xl text-emerald-300">
                ✓
              </div>

              <div>
                <h2
                  id="break-draft-success-title"
                  className="text-lg font-semibold text-zinc-100"
                >
                  Break Draft Created
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Planning data was saved. Sealed inventory has not been consumed.
                </p>
              </div>
            </div>

            <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <div>
                <div className="text-sm font-semibold text-zinc-100">
                  {success.breakName}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {success.breakFormatLabel}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    Planned Product
                  </div>
                  <div className="mt-1 text-sm font-medium text-zinc-100">
                    {success.quantityPlanned}{' '}
                    {titleCase(success.inventoryUnitType)}
                    {success.quantityPlanned === 1 ? '' : 's'} —{' '}
                    {success.productName}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    Actual Planned Cost Basis
                  </div>
                  <div className="mt-1 text-sm font-semibold text-zinc-100">
                    {money(success.actualPlannedCostBasis)}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    Assigned Break Value
                  </div>
                  <div className="mt-1 text-sm font-semibold text-zinc-100">
                    {success.assignedValue == null
                      ? 'Not set'
                      : money(success.assignedValue)}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    Target Revenue
                  </div>
                  <div className="mt-1 text-sm font-semibold text-zinc-100">
                    {success.targetRevenue == null
                      ? 'Not set'
                      : money(success.targetRevenue)}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="app-button-primary min-w-28"
                autoFocus
                onClick={() => {
                  router.push('/app/breaker-tools/sealed-inventory')
                  router.refresh()
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="app-page-header gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="app-badge app-badge-info">Breaker Tools</span>
            <span className="app-badge">Draft Planning</span>
          </div>

          <h1 className="app-title">Create Break</h1>

          <p className="app-subtitle">
            Plan the break format, product, and pricing without consuming sealed
            inventory. Tax cost basis stays untouched until a later
            ledger-backed consumption step.
          </p>
        </div>
      </div>

      <div ref={messageRef} className="scroll-mt-4">
        {loadError ? (
          <div className="app-alert-error">
            Unable to load sealed inventory: {loadError}
          </div>
        ) : null}

        {saveError ? (
          <div className="app-alert-error">{saveError}</div>
        ) : null}
      </div>

      <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
        <span className="font-semibold">Planning only:</span>{' '}
        creating this draft does not reduce sealed inventory and does not
        recognize cost of goods sold. Actual cost basis will move only when the
        break is formally consumed/finalized.
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="app-section p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-zinc-100">
              Break Details
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1.5 xl:col-span-2">
              <span className="text-sm font-medium text-zinc-300">
                Break Name <span className="text-red-400">*</span>
              </span>
              <input
                className="app-input w-full"
                value={breakName}
                required
                onChange={(event) => setBreakName(event.target.value)}
                placeholder="2026 Topps Chrome 2-Box PYT"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Break Date <span className="text-red-400">*</span>
              </span>
              <input
                className="app-input w-full"
                type="date"
                value={breakDate}
                required
                onChange={(event) => setBreakDate(event.target.value)}
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Break Format <span className="text-red-400">*</span>
              </span>
              <select
                className="app-input w-full"
                value={breakFormat}
                onChange={(event) =>
                  setBreakFormat(event.target.value as BreakFormat)
                }
                disabled={isPending}
              >
                <option value="pyt">PYT — Pick Your Team</option>
                <option value="pyp">PYP — Pick Your Player</option>
                <option value="random_team">Random Team</option>
                <option value="random_player">Random Player</option>
                <option value="custom">Other / Custom</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Platform
              </span>
              <input
                className="app-input w-full"
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                placeholder="Whatnot, Fanatics Live, Direct, etc."
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Show / Stream Reference
              </span>
              <input
                className="app-input w-full"
                value={showReference}
                onChange={(event) => setShowReference(event.target.value)}
                placeholder="Show ID, stream name, or internal reference"
                disabled={isPending}
              />
            </label>
          </div>
        </section>

        <section className="app-section p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-zinc-100">
              Sealed Product
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Choose what you plan to open. This reserves nothing yet and does
              not change sealed inventory quantity.
            </p>
          </div>

          {loadingItems ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-4 text-sm text-zinc-400">
              Loading available sealed inventory…
            </div>
          ) : sealedItems.length === 0 ? (
            <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 px-4 py-4 text-sm text-amber-100">
              No available sealed inventory was found. Add sealed product before
              creating a break.
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-1.5 xl:col-span-2">
                  <span className="text-sm font-medium text-zinc-300">
                    Sealed Inventory Lot{' '}
                    <span className="text-red-400">*</span>
                  </span>
                  <select
                    className="app-input w-full"
                    value={sealedInventoryItemId}
                    onChange={(event) =>
                      setSealedInventoryItemId(event.target.value)
                    }
                    disabled={isPending}
                  >
                    {sealedItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.product_name} — {item.quantity_remaining}{' '}
                        {titleCase(item.inventory_unit_type)}
                        {item.quantity_remaining === 1 ? '' : 's'} remaining
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-zinc-300">
                    Quantity Planned <span className="text-red-400">*</span>
                  </span>
                  <input
                    className="app-input w-full"
                    type="number"
                    min="1"
                    max={selectedItem?.quantity_remaining ?? undefined}
                    step="1"
                    value={quantityPlanned}
                    required
                    onChange={(event) => setQuantityPlanned(event.target.value)}
                    disabled={isPending}
                  />
                </label>
              </div>

              {selectedItem ? (
                <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-100">
                        {selectedItem.product_name}
                      </div>

                      {productMeta ? (
                        <div className="mt-1 text-xs text-zinc-500">
                          {productMeta}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid shrink-0 gap-3 sm:grid-cols-3">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-zinc-500">
                          Remaining
                        </div>
                        <div className="mt-1 text-sm font-semibold text-zinc-100">
                          {selectedItem.quantity_remaining}{' '}
                          {titleCase(selectedItem.inventory_unit_type)}
                          {selectedItem.quantity_remaining === 1 ? '' : 's'}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs uppercase tracking-wide text-zinc-500">
                          Actual Cost / Unit
                        </div>
                        <div className="mt-1 text-sm font-semibold text-zinc-100">
                          {money(actualUnitCostBasis)}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs uppercase tracking-wide text-zinc-500">
                          Planned Actual Cost
                        </div>
                        <div className="mt-1 text-sm font-semibold text-zinc-100">
                          {money(actualPlannedCostBasis)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="app-section p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-zinc-100">
              Break Pricing
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Pricing values are planning numbers only. They never replace or
              alter the actual sealed inventory cost basis.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Assigned Break Value{' '}
                <span
                  className="cursor-help text-xs text-zinc-500"
                  title="The value you want to assign to the planned sealed product for pricing or markup purposes. This does not change tax cost basis."
                  aria-label="Assigned Break Value help"
                >
                  ⓘ
                </span>
              </span>
              <input
                className="app-input w-full"
                type="number"
                min="0"
                step="0.01"
                value={assignedValue}
                onChange={(event) => setAssignedValue(event.target.value)}
                placeholder="Optional"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Target Revenue{' '}
                <span
                  className="cursor-help text-xs text-zinc-500"
                  title="The total amount you want all break spots to generate before fees, postage, supplies, and other selling costs."
                  aria-label="Target Revenue help"
                >
                  ⓘ
                </span>
              </span>
              <input
                className="app-input w-full"
                type="number"
                min="0"
                step="0.01"
                value={targetRevenue}
                onChange={(event) => setTargetRevenue(event.target.value)}
                placeholder="Optional"
                disabled={isPending}
              />
            </label>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-cyan-900/60 bg-cyan-950/10 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-cyan-400/80">
                Actual Tax Cost Basis
              </div>
              <div className="mt-1 text-xl font-semibold text-zinc-100">
                {money(actualPlannedCostBasis)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Read-only from sealed inventory
              </div>
            </div>

            <div className="rounded-lg border border-violet-900/60 bg-violet-950/10 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-violet-400/80">
                Assigned Break Value
              </div>
              <div className="mt-1 text-xl font-semibold text-zinc-100">
                {assignedValueNumber == null
                  ? '—'
                  : money(assignedValueNumber)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Pricing / markup planning only
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Markup vs Actual Cost
              </div>
              <div className="mt-1 text-xl font-semibold text-zinc-100">
                {pricingSpread == null ? '—' : money(pricingSpread)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Assigned value minus actual cost
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Target vs Assigned
              </div>
              <div className="mt-1 text-xl font-semibold text-zinc-100">
                {revenueVsAssigned == null ? '—' : money(revenueVsAssigned)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Target revenue minus assigned value
              </div>
            </div>
          </div>
        </section>

        <section className="app-section p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-zinc-100">
              Notes
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Break Notes
              </span>
              <textarea
                className="app-input min-h-28 w-full resize-y"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional notes about the break"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Product Notes
              </span>
              <textarea
                className="app-input min-h-28 w-full resize-y"
                value={productNotes}
                onChange={(event) => setProductNotes(event.target.value)}
                placeholder="Optional notes about this product in this break"
                disabled={isPending}
              />
            </label>
          </div>
        </section>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="app-button-secondary"
            onClick={() => router.push('/app/breaker-tools/sealed-inventory')}
            disabled={isPending}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="app-button-primary min-w-40"
            disabled={isPending || loadingItems || sealedItems.length === 0}
          >
            {isPending ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black"
                  aria-hidden="true"
                />
                Creating Draft...
              </span>
            ) : (
              'Create Break Draft'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
