'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type PackageType = 'case' | 'box' | 'pack' | 'other'
type InventoryUnitType = 'case' | 'box' | 'pack' | 'other'

type PurchaseSuccess = {
  productName: string
  quantityReceived: number
  inventoryUnitType: InventoryUnitType
  totalAcquisitionCost: number
  originalUnitCostBasis: number
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number.isFinite(value) ? value : 0)
}

function parseMoney(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseWholeNumber(value: string) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function NewSealedInventoryPage() {
  const router = useRouter()
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()

  const [error, setError] = useState<string | null>(null)
  const [purchaseSuccess, setPurchaseSuccess] = useState<PurchaseSuccess | null>(null)
  const messageRef = useRef<HTMLDivElement | null>(null)

  const [productName, setProductName] = useState('')
  const [year, setYear] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [brand, setBrand] = useState('')
  const [sport, setSport] = useState('')
  const [category, setCategory] = useState('')
  const [configuration, setConfiguration] = useState('')

  const [purchasePackageType, setPurchasePackageType] =
    useState<PackageType>('box')
  const [purchasePackageQuantity, setPurchasePackageQuantity] = useState('1')
  const [unitsPerPackage, setUnitsPerPackage] = useState('1')
  const [inventoryUnitType, setInventoryUnitType] =
    useState<InventoryUnitType>('box')

  const [purchasePrice, setPurchasePrice] = useState('')
  const [inboundShippingCost, setInboundShippingCost] = useState('')
  const [purchaseSalesTax, setPurchaseSalesTax] = useState('')
  const [otherAcquisitionCost, setOtherAcquisitionCost] = useState('')

  const [purchaseDate, setPurchaseDate] = useState('')
  const [purchasedFrom, setPurchasedFrom] = useState('')
  const [platform, setPlatform] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')

  const packageQty = parseWholeNumber(purchasePackageQuantity)
  const unitsEach = parseWholeNumber(unitsPerPackage)

  const quantityReceived = useMemo(() => {
    if (packageQty <= 0 || unitsEach <= 0) return 0
    return packageQty * unitsEach
  }, [packageQty, unitsEach])

  const totalAcquisitionCost = useMemo(() => {
    return (
      parseMoney(purchasePrice) +
      parseMoney(inboundShippingCost) +
      parseMoney(purchaseSalesTax) +
      parseMoney(otherAcquisitionCost)
    )
  }, [
    purchasePrice,
    inboundShippingCost,
    purchaseSalesTax,
    otherAcquisitionCost,
  ])

  const unitCostBasis = useMemo(() => {
    if (quantityReceived <= 0) return 0
    return totalAcquisitionCost / quantityReceived
  }, [quantityReceived, totalAcquisitionCost])

  function resetError() {
    if (error) setError(null)
  }

  function validate() {
    if (!productName.trim()) {
      return 'Product name is required.'
    }

    if (packageQty <= 0) {
      return 'Purchase package quantity must be at least 1.'
    }

    if (unitsEach <= 0) {
      return 'Units per package must be at least 1.'
    }

    if (quantityReceived <= 0) {
      return 'Quantity received must be greater than 0.'
    }

    if (!purchasePrice.trim()) {
      return 'Purchase price is required. Enter 0 if the product had no purchase price.'
    }

    if (parseMoney(purchasePrice) < 0) {
      return 'Purchase price cannot be negative.'
    }

    if (!inboundShippingCost.trim()) {
      return 'Inbound shipping is required. Enter 0 if there was no inbound shipping charge.'
    }

    if (parseMoney(inboundShippingCost) < 0) {
      return 'Inbound shipping cannot be negative.'
    }

    if (parseMoney(purchaseSalesTax) < 0) {
      return 'Purchase sales tax cannot be negative.'
    }

    if (parseMoney(otherAcquisitionCost) < 0) {
      return 'Other acquisition cost cannot be negative.'
    }

    if (!purchaseDate) {
      return 'Purchase date is required.'
    }

    if (!purchasedFrom.trim()) {
      return 'Purchased From is required.'
    }

    if (!orderNumber.trim()) {
      return 'Order # / Reference is required.'
    }

    return null
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    resetError()

    const validationError = validate()

    if (validationError) {
      setError(validationError)

      window.requestAnimationFrame(() => {
        messageRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })

      return
    }

    startTransition(async () => {
      try {
        const purchasePriceValue = parseMoney(purchasePrice)
        const inboundShippingValue = parseMoney(inboundShippingCost)
        const purchaseSalesTaxValue = parseMoney(purchaseSalesTax)
        const otherAcquisitionValue = parseMoney(otherAcquisitionCost)

        const rpcArgs = {
          p_product_name: productName.trim(),
          p_year: year.trim() || null,
          p_manufacturer: manufacturer.trim() || null,
          p_brand: brand.trim() || null,
          p_sport: sport.trim() || null,
          p_category: category.trim() || null,
          p_configuration: configuration.trim() || null,
          p_product_reference: null,
          p_purchase_package_type: purchasePackageType,
          p_purchase_package_quantity: packageQty,
          p_units_per_package: unitsEach,
          p_inventory_unit_type: inventoryUnitType,
          p_purchase_price: purchasePriceValue,
          p_inbound_shipping_cost: inboundShippingValue,
          p_purchase_sales_tax: purchaseSalesTaxValue,
          p_other_acquisition_cost: otherAcquisitionValue,
          p_purchase_date: purchaseDate,
          p_purchased_from: purchasedFrom.trim() || null,
          p_platform: platform.trim() || null,
          p_order_number: orderNumber.trim() || null,
          p_vendor_reference: null,
          p_location: location.trim() || null,
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

        const { data, error: rpcError } = await typedSupabase.rpc(
          'create_sealed_inventory_purchase',
          rpcArgs
        )

        if (rpcError) {
          throw new Error(rpcError.message)
        }

        const rows = (data ?? []) as Array<{
          sealed_inventory_item_id: string
          transaction_id: string
          quantity_received: number
          quantity_remaining: number
          total_acquisition_cost: number
          original_unit_cost_basis: number
        }>

        const result = rows[0]

        if (!result) {
          throw new Error(
            'The sealed inventory purchase did not return a completed transaction.'
          )
        }

        setPurchaseSuccess({
          productName: productName.trim(),
          quantityReceived: Number(result.quantity_received ?? 0),
          inventoryUnitType,
          totalAcquisitionCost: Number(result.total_acquisition_cost ?? 0),
          originalUnitCostBasis: Number(result.original_unit_cost_basis ?? 0),
        })
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Unable to add sealed inventory.'
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

  return (
    <div className="app-page-wide space-y-5">
      {isPending ? (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/65 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
          aria-label="Saving sealed product"
        >
          <div className="flex min-w-64 flex-col items-center gap-3 rounded-xl border border-cyan-500/40 bg-zinc-950 px-6 py-5 shadow-2xl">
            <span
              className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-700 border-t-cyan-300"
              aria-hidden="true"
            />
            <div className="text-base font-semibold text-zinc-100">
              Saving sealed product…
            </div>
            <div className="text-center text-xs text-zinc-400">
              Creating the sealed inventory lot and purchase ledger together.
            </div>
          </div>
        </div>
      ) : null}

      {purchaseSuccess ? (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 px-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sealed-purchase-success-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-emerald-500/40 bg-zinc-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-950/50 text-xl text-emerald-300">
                ✓
              </div>

              <div>
                <h2
                  id="sealed-purchase-success-title"
                  className="text-lg font-semibold text-zinc-100"
                >
                  Sealed Purchase Recorded
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  The inventory lot and purchase ledger were created successfully.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="text-sm leading-relaxed text-zinc-200">
                Successfully added{' '}
                <span className="font-semibold text-white">
                  {purchaseSuccess.quantityReceived}{' '}
                  {purchaseSuccess.inventoryUnitType}
                  {purchaseSuccess.quantityReceived === 1 ? '' : 's'}
                </span>{' '}
                of{' '}
                <span className="font-semibold text-white">
                  {purchaseSuccess.productName}
                </span>
                .
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    Total Acquisition Cost
                  </div>
                  <div className="mt-1 font-semibold text-zinc-100">
                    {money(purchaseSuccess.totalAcquisitionCost)}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    Cost per {purchaseSuccess.inventoryUnitType}
                  </div>
                  <div className="mt-1 font-semibold text-zinc-100">
                    {money(purchaseSuccess.originalUnitCostBasis)}
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
            <span className="app-badge">Tax-Tracked Inventory</span>
          </div>

          <h1 className="app-title">Add Sealed Product</h1>

          <p className="app-subtitle">
            Add a sealed case, box, pack, or other unopened product lot. HITS
            preserves the original acquisition cost so later break consumption
            and sealed sales can use the correct cost basis.
          </p>
        </div>
      </div>

      <div ref={messageRef} className="scroll-mt-4">
        {error ? (
          <div className="app-alert-error">
            {error}
          </div>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="app-section p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-zinc-100">
              Product
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Describe the unopened product exactly enough to recognize it later.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1.5 xl:col-span-2">
              <span className="text-sm font-medium text-zinc-300">
                Product Name <span className="text-red-400">*</span>
              </span>
              <input
                className="app-input w-full"
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                placeholder="2026 Topps Chrome Baseball Hobby"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">Year</span>
              <input
                className="app-input w-full"
                value={year}
                onChange={(event) => setYear(event.target.value)}
                placeholder="2026 or 2025-26"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Manufacturer
              </span>
              <input
                className="app-input w-full"
                value={manufacturer}
                onChange={(event) => setManufacturer(event.target.value)}
                placeholder="Topps"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">Brand</span>
              <input
                className="app-input w-full"
                value={brand}
                onChange={(event) => setBrand(event.target.value)}
                placeholder="Chrome"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">Sport</span>
              <input
                className="app-input w-full"
                value={sport}
                onChange={(event) => setSport(event.target.value)}
                placeholder="Baseball"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">Category</span>
              <input
                className="app-input w-full"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Sports Cards"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Configuration
              </span>
              <input
                className="app-input w-full"
                value={configuration}
                onChange={(event) => setConfiguration(event.target.value)}
                placeholder="Hobby"
                disabled={isPending}
              />
            </label>
          </div>
        </section>

        <section className="app-section p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-zinc-100">
              Packaging & Quantity
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Tell HITS how the product was purchased and which sealed unit you
              want inventory to track.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Purchased As <span className="text-red-400">*</span>{' '}
                <span
                  className="cursor-help text-xs text-zinc-500"
                  title="How you bought the product from the seller, such as a case, box, or pack."
                  aria-label="Purchased As help"
                >
                  ⓘ
                </span>
              </span>
              <select
                className="app-input w-full"
                value={purchasePackageType}
                onChange={(event) =>
                  setPurchasePackageType(event.target.value as PackageType)
                }
                disabled={isPending}
              >
                <option value="case">Case</option>
                <option value="box">Box</option>
                <option value="pack">Pack</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Packages Purchased <span className="text-red-400">*</span>{' '}
                <span
                  className="cursor-help text-xs text-zinc-500"
                  title="How many of the purchased packages you received. Example: if you bought 2 cases, enter 2."
                  aria-label="Packages Purchased help"
                >
                  ⓘ
                </span>
              </span>
              <input
                className="app-input w-full"
                type="number"
                min="1"
                step="1"
                value={purchasePackageQuantity}
                required
                onChange={(event) =>
                  setPurchasePackageQuantity(event.target.value)
                }
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Units per Package <span className="text-red-400">*</span>{' '}
                <span
                  className="cursor-help text-xs text-zinc-500"
                  title="How many inventory units are inside each purchased package. Example: a case containing 12 boxes = 12."
                  aria-label="Units per Package help"
                >
                  ⓘ
                </span>
              </span>
              <input
                className="app-input w-full"
                type="number"
                min="1"
                step="1"
                value={unitsPerPackage}
                required
                onChange={(event) => setUnitsPerPackage(event.target.value)}
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Inventory Unit <span className="text-red-400">*</span>{' '}
                <span
                  className="cursor-help text-xs text-zinc-500"
                  title="The sealed unit HITS should track, sell, or consume in breaks. Example: track individual boxes from a case."
                  aria-label="Inventory Unit help"
                >
                  ⓘ
                </span>
              </span>
              <select
                className="app-input w-full"
                value={inventoryUnitType}
                onChange={(event) =>
                  setInventoryUnitType(event.target.value as InventoryUnitType)
                }
                disabled={isPending}
              >
                <option value="case">Case</option>
                <option value="box">Box</option>
                <option value="pack">Pack</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>

          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-300">
            HITS will add{' '}
            <span className="font-semibold text-zinc-100">
              {quantityReceived}
            </span>{' '}
            {inventoryUnitType}
            {quantityReceived === 1 ? '' : 's'} to sealed inventory.
          </div>
        </section>

        <section className="app-section p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-zinc-100">
              Acquisition Cost
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              These costs establish the original sealed inventory cost basis.
              Purchase price and inbound shipping are required; enter 0 when a
              required amount is truly zero. Sales tax and other acquisition cost
              are optional. Break markup or pricing is intentionally not entered here.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Total Purchase Price <span className="text-red-400">*</span>{' '}
                <span
                  className="cursor-help text-xs text-zinc-500"
                  title="Enter the total price paid for all packages in this purchase, before inbound shipping, purchase sales tax, and other acquisition costs. Do not enter a per-box or per-unit price."
                  aria-label="Total Purchase Price help"
                >
                  ⓘ
                </span>
              </span>
              <input
                className="app-input w-full"
                type="number"
                min="0"
                step="0.01"
                required
                value={purchasePrice}
                onChange={(event) => setPurchasePrice(event.target.value)}
                placeholder="0.00"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Inbound Shipping <span className="text-red-400">*</span>
              </span>
              <input
                className="app-input w-full"
                type="number"
                min="0"
                step="0.01"
                required
                value={inboundShippingCost}
                onChange={(event) =>
                  setInboundShippingCost(event.target.value)
                }
                placeholder="0.00"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Purchase Sales Tax
              </span>
              <input
                className="app-input w-full"
                type="number"
                min="0"
                step="0.01"
                value={purchaseSalesTax}
                onChange={(event) => setPurchaseSalesTax(event.target.value)}
                placeholder="0.00"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Other Acquisition Cost
              </span>
              <input
                className="app-input w-full"
                type="number"
                min="0"
                step="0.01"
                value={otherAcquisitionCost}
                onChange={(event) =>
                  setOtherAcquisitionCost(event.target.value)
                }
                placeholder="0.00"
                disabled={isPending}
              />
            </label>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Total Acquisition Cost
              </div>
              <div className="mt-1 text-xl font-semibold text-zinc-100">
                {money(totalAcquisitionCost)}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                Cost per {inventoryUnitType}
              </div>
              <div className="mt-1 text-xl font-semibold text-zinc-100">
                {money(unitCostBasis)}
              </div>
            </div>
          </div>
        </section>

        <section className="app-section p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-zinc-100">
              Purchase Details
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Purchase Date <span className="text-red-400">*</span>
              </span>
              <input
                className="app-input w-full"
                type="date"
                required
                value={purchaseDate}
                onChange={(event) => setPurchaseDate(event.target.value)}
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Purchased From <span className="text-red-400">*</span>
              </span>
              <input
                className="app-input w-full"
                value={purchasedFrom}
                required
                onChange={(event) => setPurchasedFrom(event.target.value)}
                placeholder="Distributor, shop, seller"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">Platform</span>
              <input
                className="app-input w-full"
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                placeholder="Direct, Whatnot, eBay, etc."
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Order # / Reference <span className="text-red-400">*</span>
              </span>
              <input
                className="app-input w-full"
                value={orderNumber}
                required
                onChange={(event) => setOrderNumber(event.target.value)}
                placeholder="Order, invoice, PO, or receipt reference"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">Location</span>
              <input
                className="app-input w-full"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Shelf, bin, room"
                disabled={isPending}
              />
            </label>

            <label className="space-y-1.5 md:col-span-2 xl:col-span-3">
              <span className="text-sm font-medium text-zinc-300">Notes</span>
              <textarea
                className="app-input min-h-28 w-full resize-y"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional purchase or product notes"
                disabled={isPending}
              />
            </label>
          </div>
        </section>

        <div className="text-xs text-zinc-500">
          <span className="text-red-400">*</span> Required fields. Enter 0 for
          required cost fields when there was no charge rather than leaving them blank.
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
            className="app-button-primary min-w-36"
            disabled={isPending}
          >
            {isPending ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black"
                  aria-hidden="true"
                />
                Saving...
              </span>
            ) : (
              'Add Sealed Product'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
