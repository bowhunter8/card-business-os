'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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

type SalesTaxHandling =
  | 'none'
  | 'marketplace_collected'
  | 'seller_collected'
  | 'unknown'

type SellRpcRow = {
  sale_id: string
  transaction_id: string
  quantity_remaining: number
  item_status: string
  unit_cost_basis: number
  cost_basis_total: number
  realized_profit: number
}

type SaleSuccess = {
  quantitySold: number
  productName: string
  quantityRemaining: number
  realizedProfit: number
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function parseMoney(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseWholeNumber(value: string) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function todayLocal() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  const local = new Date(now.getTime() - offset * 60 * 1000)
  return local.toISOString().slice(0, 10)
}

function titleCase(value: string | null | undefined) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function SellSealedProductPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const sealedInventoryItemId = String(params?.id ?? '')
  const supabase = useMemo(() => createClient(), [])

  const [item, setItem] = useState<SealedInventoryItem | null>(null)
  const [loadingItem, setLoadingItem] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saleSuccess, setSaleSuccess] = useState<SaleSuccess | null>(null)
  const [isPending, startTransition] = useTransition()
  const messageRef = useRef<HTMLDivElement | null>(null)

  const [soldOn, setSoldOn] = useState(todayLocal())
  const [quantitySold, setQuantitySold] = useState('1')
  const [saleAmount, setSaleAmount] = useState('')
  const [shippingCharged, setShippingCharged] = useState('')
  const [salesTaxCollected, setSalesTaxCollected] = useState('')
  const [salesTaxHandling, setSalesTaxHandling] =
    useState<SalesTaxHandling>('none')
  const [platformFees, setPlatformFees] = useState('')
  const [postageCost, setPostageCost] = useState('')
  const [suppliesCost, setSuppliesCost] = useState('')
  const [otherSellingCost, setOtherSellingCost] = useState('')
  const [platform, setPlatform] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    let active = true

    async function loadItem() {
      setLoadingItem(true)
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
          .eq('id', sealedInventoryItemId)
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .maybeSingle()

        if (error) throw error
        if (!data) throw new Error('Sealed inventory item not found.')

        if (active) {
          setItem(data as unknown as SealedInventoryItem)
        }
      } catch (caughtError) {
        if (active) {
          setLoadError(
            caughtError instanceof Error
              ? caughtError.message
              : 'Unable to load sealed inventory item.'
          )
        }
      } finally {
        if (active) {
          setLoadingItem(false)
        }
      }
    }

    if (sealedInventoryItemId) {
      void loadItem()
    } else {
      setLoadError('Missing sealed inventory item ID.')
      setLoadingItem(false)
    }

    return () => {
      active = false
    }
  }, [sealedInventoryItemId, supabase])

  const quantity = parseWholeNumber(quantitySold)
  const unitCostBasis = Number(item?.original_unit_cost_basis ?? 0)
  const costBasisRemoved = quantity > 0 ? unitCostBasis * quantity : 0

  const grossIncome =
    parseMoney(saleAmount) + parseMoney(shippingCharged)

  const sellingCosts =
    parseMoney(platformFees) +
    parseMoney(postageCost) +
    parseMoney(suppliesCost) +
    parseMoney(otherSellingCost)

  const estimatedProfit =
    grossIncome - sellingCosts - costBasisRemoved

  const productMeta = [
    item?.year,
    item?.manufacturer || item?.brand,
    item?.configuration,
  ]
    .filter(Boolean)
    .join(' • ')

  function validate() {
    if (!item) return 'Sealed inventory item is not loaded.'

    if (item.status !== 'available') {
      return 'This sealed inventory lot is not available for sale.'
    }

    if (!soldOn) return 'Sale date is required.'

    if (quantity <= 0) {
      return 'Quantity sold must be at least 1.'
    }

    if (quantity > Number(item.quantity_remaining ?? 0)) {
      return `Only ${item.quantity_remaining} ${titleCase(
        item.inventory_unit_type
      )}${item.quantity_remaining === 1 ? '' : 's'} remain in this lot.`
    }

    if (!saleAmount.trim()) {
      return 'Sale amount is required.'
    }

    if (!platformFees.trim()) {
      return 'Platform fees are required. Enter 0 if there were no fees.'
    }

    if (!postageCost.trim()) {
      return 'Postage cost is required. Enter 0 if there was no postage cost.'
    }

    const moneyFields = [
      ['Sale amount', saleAmount],
      ['Shipping charged', shippingCharged],
      ['Sales tax collected', salesTaxCollected],
      ['Platform fees', platformFees],
      ['Postage cost', postageCost],
      ['Supplies cost', suppliesCost],
      ['Other selling cost', otherSellingCost],
    ] as const

    for (const [label, value] of moneyFields) {
      if (value.trim() && parseMoney(value) < 0) {
        return `${label} cannot be negative.`
      }
    }

    return null
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaveError(null)

    const validationError = validate()

    if (validationError) {
      setSaveError(validationError)
      return
    }

    startTransition(async () => {
      try {
        const rpcArgs = {
          p_sealed_inventory_item_id: sealedInventoryItemId,
          p_sold_on: soldOn,
          p_quantity_sold: quantity,
          p_sale_amount: parseMoney(saleAmount),
          p_shipping_charged: parseMoney(shippingCharged),
          p_sales_tax_collected: parseMoney(salesTaxCollected),
          p_sales_tax_handling: salesTaxHandling,
          p_platform_fees: parseMoney(platformFees),
          p_postage_cost: parseMoney(postageCost),
          p_supplies_cost: parseMoney(suppliesCost),
          p_other_selling_cost: parseMoney(otherSellingCost),
          p_platform: platform.trim() || null,
          p_buyer_name: buyerName.trim() || null,
          p_order_number: orderNumber.trim() || null,
          p_notes: notes.trim() || null,
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
          'sell_sealed_inventory',
          rpcArgs
        )

        if (error) {
          throw new Error(error.message)
        }

        const rows = (data ?? []) as SellRpcRow[]

        if (rows.length === 0) {
          throw new Error(
            'The sealed sale did not return a completed transaction.'
          )
        }

        const result = rows[0]

        if (!result) {
          throw new Error(
            'The sealed sale did not return a completed transaction.'
          )
        }

        setSaleSuccess({
          quantitySold: quantity,
          productName: item?.product_name ?? 'Sealed product',
          quantityRemaining: Number(result.quantity_remaining ?? 0),
          realizedProfit: Number(result.realized_profit ?? 0),
        })
      } catch (caughtError) {
        setSaveError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Unable to record sealed product sale.'
        )

        window.requestAnimationFrame(() => {
          messageRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          })
        })
      }
    })
  }

  if (loadingItem) {
    return (
      <div className="app-page-wide">
        <div className="app-section p-6 text-sm text-zinc-400">
          Loading sealed product…
        </div>
      </div>
    )
  }

  if (loadError || !item) {
    return (
      <div className="app-page-wide space-y-4">
        <div className="app-alert-error">
          {loadError || 'Unable to load sealed inventory item.'}
        </div>

        <button
          type="button"
          className="app-button-secondary"
          onClick={() => router.push('/app/breaker-tools/sealed-inventory')}
        >
          Back to Sealed Inventory
        </button>
      </div>
    )
  }

  return (
    <div className="app-page-wide space-y-5">
      {isPending ? (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/65 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
          aria-label="Recording sealed product sale"
        >
          <div className="flex min-w-64 flex-col items-center gap-3 rounded-xl border border-cyan-500/40 bg-zinc-950 px-6 py-5 shadow-2xl">
            <span
              className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-700 border-t-cyan-300"
              aria-hidden="true"
            />
            <div className="text-base font-semibold text-zinc-100">
              Recording sealed sale…
            </div>
            <div className="text-center text-xs text-zinc-400">
              Updating the sale, cost-basis ledger, and sealed quantity.
            </div>
          </div>
        </div>
      ) : null}

      {saleSuccess ? (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 px-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sealed-sale-success-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-emerald-500/40 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-950/50 text-xl text-emerald-300">
                ✓
              </div>

              <div>
                <h2
                  id="sealed-sale-success-title"
                  className="text-lg font-semibold text-zinc-100"
                >
                  Sealed Sale Recorded
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  The sale and inventory ledger were updated successfully.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="text-sm leading-relaxed text-zinc-200">
                Successfully sold{' '}
                <span className="font-semibold text-white">
                  {saleSuccess.quantitySold}{' '}
                  {titleCase(item.inventory_unit_type)}
                  {saleSuccess.quantitySold === 1 ? '' : 's'}
                </span>{' '}
                of{' '}
                <span className="font-semibold text-white">
                  {saleSuccess.productName}
                </span>
                .
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    Remaining
                  </div>
                  <div className="mt-1 font-semibold text-zinc-100">
                    {saleSuccess.quantityRemaining}{' '}
                    {titleCase(item.inventory_unit_type)}
                    {saleSuccess.quantityRemaining === 1 ? '' : 's'}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    Recorded Profit
                  </div>
                  <div className="mt-1 font-semibold text-zinc-100">
                    {money(saleSuccess.realizedProfit)}
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
            <span className="app-badge app-badge-success">
              Sealed Product Sale
            </span>
          </div>

          <h1 className="app-title">Sell Sealed Product</h1>

          <p className="app-subtitle">
            Record sealed revenue and selling costs while HITS removes the exact
            original cost basis from this sealed inventory lot.
          </p>
        </div>
      </div>

      <div ref={messageRef} className="scroll-mt-4">
        {saveError ? (
          <div className="app-alert-error">{saveError}</div>
        ) : null}
      </div>

      <section className="app-section p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Selling From
            </div>

            <div className="mt-1 text-lg font-semibold text-zinc-100">
              {item.product_name}
            </div>

            {productMeta ? (
              <div className="mt-1 text-sm text-zinc-500">{productMeta}</div>
            ) : null}
          </div>

          <div className="grid shrink-0 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Remaining
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">
                {item.quantity_remaining}{' '}
                {titleCase(item.inventory_unit_type)}
                {item.quantity_remaining === 1 ? '' : 's'}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Cost per {titleCase(item.inventory_unit_type)}
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">
                {money(item.original_unit_cost_basis)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="app-section p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-zinc-100">
              Sale
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Sale amount is required. Shipping charged is income when applicable.
              Sales tax collected is tracked separately and is not included in the
              profit preview below.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Sale Date <span className="text-red-400">*</span>
              </span>
              <input
                className="app-input w-full"
                type="date"
                value={soldOn}
                onChange={(event) => setSoldOn(event.target.value)}
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Quantity Sold <span className="text-red-400">*</span>
              </span>
              <input
                className="app-input w-full"
                type="number"
                min="1"
                max={item.quantity_remaining}
                step="1"
                value={quantitySold}
                onChange={(event) => setQuantitySold(event.target.value)}
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Sale Amount <span className="text-red-400">*</span>
              </span>
              <input
                className="app-input w-full"
                type="number"
                min="0"
                step="0.01"
                required
                value={saleAmount}
                onChange={(event) => setSaleAmount(event.target.value)}
                placeholder="0.00"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Shipping Charged
              </span>
              <input
                className="app-input w-full"
                type="number"
                min="0"
                step="0.01"
                value={shippingCharged}
                onChange={(event) => setShippingCharged(event.target.value)}
                placeholder="0.00"
                disabled={isPending}
              />
            </label>
          </div>
        </section>

        <section className="app-section p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-zinc-100">
              Sales Tax
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Keep marketplace-collected tax separate from seller-collected tax
              so tax reporting can treat each correctly.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Sales Tax Collected
              </span>
              <input
                className="app-input w-full"
                type="number"
                min="0"
                step="0.01"
                value={salesTaxCollected}
                onChange={(event) => setSalesTaxCollected(event.target.value)}
                placeholder="0.00"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Sales Tax Handling
              </span>
              <select
                className="app-input w-full"
                value={salesTaxHandling}
                onChange={(event) =>
                  setSalesTaxHandling(
                    event.target.value as SalesTaxHandling
                  )
                }
                disabled={isPending}
              >
                <option value="none">No sales tax collected</option>
                <option value="marketplace_collected">
                  Marketplace collected / remitted
                </option>
                <option value="seller_collected">
                  Seller collected / user liable
                </option>
                <option value="unknown">Unknown / review later</option>
              </select>
            </label>
          </div>
        </section>

        <section className="app-section p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-zinc-100">
              Selling Costs
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Platform fees and postage are required for a complete sale record.
              Enter 0 when either cost is truly zero. Break workflows can later
              roll these totals up automatically from PYT/PYP spot sales.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Platform Fees <span className="text-red-400">*</span>
              </span>
              <input
                className="app-input w-full"
                type="number"
                min="0"
                step="0.01"
                required
                value={platformFees}
                onChange={(event) => setPlatformFees(event.target.value)}
                placeholder="0.00"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Postage Cost <span className="text-red-400">*</span>
              </span>
              <input
                className="app-input w-full"
                type="number"
                min="0"
                step="0.01"
                required
                value={postageCost}
                onChange={(event) => setPostageCost(event.target.value)}
                placeholder="0.00"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Supplies Cost
              </span>
              <input
                className="app-input w-full"
                type="number"
                min="0"
                step="0.01"
                value={suppliesCost}
                onChange={(event) => setSuppliesCost(event.target.value)}
                placeholder="0.00"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Other Selling Cost
              </span>
              <input
                className="app-input w-full"
                type="number"
                min="0"
                step="0.01"
                value={otherSellingCost}
                onChange={(event) => setOtherSellingCost(event.target.value)}
                placeholder="0.00"
                disabled={isPending}
              />
            </label>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="app-section p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Gross Income
            </div>
            <div className="mt-2 text-xl font-semibold text-zinc-100">
              {money(grossIncome)}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Sale amount + shipping charged
            </div>
          </div>

          <div className="app-section p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Cost Basis Removed
            </div>
            <div className="mt-2 text-xl font-semibold text-zinc-100">
              {money(costBasisRemoved)}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {quantity > 0 ? quantity : 0} × {money(unitCostBasis)}
            </div>
          </div>

          <div className="app-section p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Selling Costs
            </div>
            <div className="mt-2 text-xl font-semibold text-zinc-100">
              {money(sellingCosts)}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Fees + postage + supplies + other
            </div>
          </div>

          <div className="app-section p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Estimated Profit
            </div>
            <div className="mt-2 text-xl font-semibold text-zinc-100">
              {money(estimatedProfit)}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Before unrelated business expenses
            </div>
          </div>
        </section>

        <section className="app-section p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-zinc-100">
              Sale Details
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Platform
              </span>
              <input
                className="app-input w-full"
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                placeholder="Whatnot, eBay, Direct, etc."
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Buyer Name
              </span>
              <input
                className="app-input w-full"
                value={buyerName}
                onChange={(event) => setBuyerName(event.target.value)}
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Order Number
              </span>
              <input
                className="app-input w-full"
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value)}
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5 md:col-span-2 xl:col-span-3">
              <span className="text-sm font-medium text-zinc-300">
                Notes
              </span>
              <textarea
                className="app-input min-h-28 w-full resize-y"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional sale notes"
                disabled={isPending}
              />
            </label>
          </div>
        </section>

        <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
          <span className="font-semibold">Accounting action:</span>{' '}
          saving this sale will create the sealed sale record, append the
          matching cost-basis ledger transaction, and reduce sealed quantity in
          one atomic database operation.
        </div>

        <div className="text-xs text-zinc-500">
          <span className="text-red-400">*</span> Required fields. For required
          costs with no charge, enter 0 rather than leaving the field blank.
        </div>

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
            disabled={isPending || item.status !== 'available'}
          >
            {isPending ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black"
                  aria-hidden="true"
                />
                Recording Sale...
              </span>
            ) : (
              'Record Sealed Sale'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
