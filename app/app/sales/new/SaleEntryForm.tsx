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

const PLATFORM_OPTIONS = [
  'eBay',
  'Whatnot',
  'Amazon',
  'Etsy',
  'Mercari',
  'Facebook',
  'Instagram',
  'Card Show',
  'Local Sale',
  'Website',
  'Custom',
]

const SALES_CHANNEL_OPTIONS = [
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'local_sale', label: 'Local Sale' },
  { value: 'card_show', label: 'Card Show' },
  { value: 'direct_private', label: 'Direct / Private Sale' },
]

const SALES_TAX_RESPONSIBILITY_OPTIONS = [
  { value: 'marketplace_collected', label: 'Marketplace collected / remitted' },
  { value: 'seller_collected', label: 'Seller collected / may need remitted' },
  { value: 'not_collected', label: 'No sales tax collected' },
  { value: 'exempt_or_not_taxable', label: 'Exempt / not taxable' },
]

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
  const [platformSelection, setPlatformSelection] = useState('')
  const [customPlatform, setCustomPlatform] = useState('')

  const [salesTaxCollected, setSalesTaxCollected] = useState('0.00')
  const [salesTaxResponsibility, setSalesTaxResponsibility] = useState('marketplace_collected')
  const [salesChannelType, setSalesChannelType] = useState('marketplace')
  const [taxState, setTaxState] = useState('')
  const [taxNotes, setTaxNotes] = useState('')

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

  function handlePlatformChange(platform: string) {
    setPlatformSelection(platform)

    if (platform !== 'Custom') {
      setCustomPlatform('')
    }

    if (platform === 'Card Show') {
      setSalesChannelType('card_show')
      setSalesTaxResponsibility('seller_collected')
      return
    }

    if (platform === 'Local Sale') {
      setSalesChannelType('local_sale')
      setSalesTaxResponsibility('seller_collected')
      return
    }

    if (
      platform === 'eBay' ||
      platform === 'Whatnot' ||
      platform === 'Amazon' ||
      platform === 'Etsy' ||
      platform === 'Mercari'
    ) {
      setSalesChannelType('marketplace')
      setSalesTaxResponsibility('marketplace_collected')
    }
  }

  const platformValue =
    platformSelection === 'Custom'
      ? customPlatform.trim()
      : platformSelection

  const grossSaleNum = Number(grossSale || 0)
  const shippingChargedNum = Number(shippingCharged || 0)
  const platformFeesNum = Number(platformFees || 0)
  const postageCostNum = Number(postageCost || 0)
  const suppliesCostNum = Number(suppliesCost || 0)
  const otherCostsNum = Number(otherCosts || 0)
  const salesTaxCollectedNum = Number(salesTaxCollected || 0)

  const totalRevenue = grossSaleNum + shippingChargedNum
  const totalCosts =
    platformFeesNum + postageCostNum + suppliesCostNum + otherCostsNum

  const quantitySoldNum = Math.max(1, Math.min(Number(quantitySold || 0), availableQty))
  const net = totalRevenue - totalCosts

  return (
    <form
      action={createSaleAction}
      className="mt-6 grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:grid-cols-2"
    >
      <input type="hidden" name="inventory_item_id" value={itemId} />
      <input type="hidden" name="quantity_sold" value={quantitySoldNum} />
      <input type="hidden" name="platform" value={platformValue} />
      <input type="hidden" name="shipping_profile_id" value={selectedProfile?.id ?? ''} />
      <input type="hidden" name="shipping_cost" value={postageCost} />

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
          name="quantity_sold_display"
          type="number"
          min={1}
          max={availableQty}
          value={quantitySold}
          onChange={(e) => setQuantitySold(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
        />
      </div>

      {/* PLATFORM */}
      <div>
        <label className="text-sm text-zinc-300">Platform</label>
        <select
          value={platformSelection}
          onChange={(e) => handlePlatformChange(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
        >
          <option value="">Select platform</option>
          {PLATFORM_OPTIONS.map((platform) => (
            <option key={platform} value={platform}>
              {platform}
            </option>
          ))}
        </select>
      </div>

      {platformSelection === 'Custom' ? (
        <div>
          <label className="text-sm text-zinc-300">Custom Platform</label>
          <input
            type="text"
            value={customPlatform}
            onChange={(e) => setCustomPlatform(e.target.value)}
            placeholder="Enter platform name"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </div>
      ) : null}

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

      {/* SALES TAX */}
      <div className="md:col-span-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-zinc-100">Sales Tax Tracking</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Sales tax is tracked for reconciliation only and is not included in the live profit preview.
            Marketplace sales are usually collected/remitted by the platform. Local/card show sales can be marked separately.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm text-zinc-300">Sales Channel</label>
            <select
              name="sales_channel_type"
              value={salesChannelType}
              onChange={(e) => setSalesChannelType(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            >
              {SALES_CHANNEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-zinc-300">Sales Tax Responsibility</label>
            <select
              name="sales_tax_responsibility"
              value={salesTaxResponsibility}
              onChange={(e) => setSalesTaxResponsibility(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
            >
              {SALES_TAX_RESPONSIBILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-zinc-300">Sales Tax Collected</label>
            <input
              name="sales_tax_collected"
              type="number"
              step="0.01"
              min="0"
              value={salesTaxCollected}
              onChange={(e) => setSalesTaxCollected(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-300">Tax State</label>
            <input
              name="tax_state"
              type="text"
              value={taxState}
              onChange={(e) => setTaxState(e.target.value)}
              placeholder="Optional, example: SD"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm text-zinc-300">Tax Notes</label>
            <textarea
              name="tax_notes"
              rows={3}
              value={taxNotes}
              onChange={(e) => setTaxNotes(e.target.value)}
              placeholder="Optional note, example: marketplace remitted, card show sale, exempt buyer, etc."
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </div>
        </div>
      </div>

      {(quantitySoldNum > availableQty) ? (
        <div className="app-alert-warning">
          Quantity exceeds available inventory. This will be corrected automatically.
        </div>
      ) : null}

      {(postageCostNum + suppliesCostNum > 0 && shippingChargedNum === 0) ? (
        <div className="app-alert-warning">
          You have entered shipping costs but no shipping charged. Ensure this is intentional for tax accuracy.
        </div>
      ) : null}

      {(suppliesCostNum > 0) ? (
        <div className="app-alert-info">
          Supplies should not also be entered separately as expenses to avoid double counting.
        </div>
      ) : null}

      {(salesTaxCollectedNum > 0 && salesTaxResponsibility === 'not_collected') ? (
        <div className="app-alert-warning md:col-span-2">
          Sales tax collected is greater than zero, but responsibility is set to no sales tax collected.
        </div>
      ) : null}

      {(salesTaxResponsibility === 'seller_collected' && salesTaxCollectedNum === 0) ? (
        <div className="app-alert-warning md:col-span-2">
          Seller-collected sales tax is selected, but the sales tax amount is zero. Confirm this is intentional.
        </div>
      ) : null}

      {/* PREVIEW */}
      <div className="md:col-span-2 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
        <div className="text-sm text-zinc-400">Live Profit Preview</div>
        <div className="mt-2 text-lg font-semibold text-green-400">
          {money(net)}
        </div>
        <div className="mt-2 text-xs text-zinc-500">
          Sales tax tracked separately: {money(salesTaxCollectedNum)}
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
