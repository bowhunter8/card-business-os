'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { createSaleAction } from '@/app/actions/sales'

type ShippingProfile = {
  id: string
  name: string
  shipping_charged_default: number | null
  supplies_cost_default: number | null
}

type Props = {
  itemId: string
  availableQty: number
  shippingProfiles: ShippingProfile[]
  today: string
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

export default function SaleEntryForm({
  itemId,
  availableQty,
  shippingProfiles,
  today,
}: Props) {
  const [selectedProfileId, setSelectedProfileId] = useState('')

  const [grossSale, setGrossSale] = useState('0.00')
  const [shippingCharged, setShippingCharged] = useState('0.00')
  const [postageCost, setPostageCost] = useState('0.00')
  const [suppliesCost, setSuppliesCost] = useState('0.00')
  const [platformFees, setPlatformFees] = useState('0.00')
  const [otherCosts, setOtherCosts] = useState('0.00')
  const [quantitySold, setQuantitySold] = useState('1')

  const selectedProfile = useMemo(
    () => shippingProfiles.find((p) => p.id === selectedProfileId) ?? null,
    [selectedProfileId, shippingProfiles]
  )

  function handleProfileChange(profileId: string) {
    setSelectedProfileId(profileId)

    const profile = shippingProfiles.find((p) => p.id === profileId)
    if (!profile) return

    setShippingCharged(
      Number(profile.shipping_charged_default ?? 0).toFixed(2)
    )

    setSuppliesCost(
      Number(profile.supplies_cost_default ?? 0).toFixed(2)
    )
  }

  const grossSaleNum = Number(grossSale || 0)
  const shippingChargedNum = Number(shippingCharged || 0)
  const platformFeesNum = Number(platformFees || 0)
  const postageCostNum = Number(postageCost || 0)
  const suppliesCostNum = Number(suppliesCost || 0)
  const otherCostsNum = Number(otherCosts || 0)

  const totalRevenue = grossSaleNum + shippingChargedNum
  const totalCosts =
    platformFeesNum + postageCostNum + suppliesCostNum + otherCostsNum
  const net = totalRevenue - totalCosts

  return (
    <form
      action={createSaleAction}
      className="mt-6 grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:grid-cols-2"
    >
      <input type="hidden" name="inventory_item_id" value={itemId} />

      {/* DATE */}
      <div>
        <label className="text-sm text-zinc-300">Sale Date</label>
        <input
          name="sale_date"
          type="date"
          defaultValue={today}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
        />
      </div>

      {/* QTY */}
      <div>
        <label className="text-sm text-zinc-300">Quantity</label>
        <input
          name="quantity_sold"
          type="number"
          min={1}
          max={availableQty}
          value={quantitySold}
          onChange={(e) => setQuantitySold(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
        />
      </div>

      {/* SALE */}
      <div>
        <label className="text-sm text-zinc-300">Item Sale Price</label>
        <input
          name="gross_sale"
          type="number"
          step="0.01"
          value={grossSale}
          onChange={(e) => setGrossSale(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
        />
      </div>

      {/* PROFILE */}
      <div>
        <label className="text-sm text-zinc-300">Shipping Profile</label>
        <select
          value={selectedProfileId}
          onChange={(e) => handleProfileChange(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
        >
          <option value="">Select profile</option>
          {shippingProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* SHIPPING CHARGED */}
      <div>
        <label className="text-sm text-zinc-300">Shipping Charged</label>
        <input
          name="shipping_charged"
          type="number"
          step="0.01"
          value={shippingCharged}
          onChange={(e) => setShippingCharged(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
        />
      </div>

      {/* POSTAGE */}
      <div>
        <label className="text-sm text-zinc-300">Postage Cost</label>
        <input
          name="postage_cost"
          type="number"
          step="0.01"
          value={postageCost}
          onChange={(e) => setPostageCost(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
        />
      </div>

      {/* SUPPLIES */}
      <div>
        <label className="text-sm text-zinc-300">Supplies Cost</label>
        <input
          name="supplies_cost"
          type="number"
          step="0.01"
          value={suppliesCost}
          onChange={(e) => setSuppliesCost(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
        />
      </div>

      {/* FEES */}
      <div>
        <label className="text-sm text-zinc-300">Platform Fees</label>
        <input
          name="platform_fees"
          type="number"
          step="0.01"
          value={platformFees}
          onChange={(e) => setPlatformFees(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
        />
      </div>

      {/* OTHER */}
      <div>
        <label className="text-sm text-zinc-300">Other Costs</label>
        <input
          name="other_costs"
          type="number"
          step="0.01"
          value={otherCosts}
          onChange={(e) => setOtherCosts(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
        />
      </div>

      {/* PREVIEW */}
      <div className="md:col-span-2 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
        <div className="text-sm text-zinc-400">Live Profit Preview</div>
        <div className="mt-2 text-lg font-semibold text-green-400">
          {money(net)}
        </div>
      </div>

      <div className="md:col-span-2 flex justify-end gap-3">
        <Link
          href={`/app/inventory/${itemId}`}
          className="border px-4 py-2 rounded"
        >
          Cancel
        </Link>
        <button className="bg-white text-black px-5 py-2 rounded">
          Record Sale
        </button>
      </div>
    </form>
  )
}