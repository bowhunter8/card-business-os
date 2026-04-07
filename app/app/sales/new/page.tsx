'use client'

import { useEffect, useState } from 'react'

type ShippingProfile = {
  id: string
  name: string
  shipping_charged_default: number | null
  supplies_cost_default: number | null
}

export default function NewSalePage() {
  const [profiles, setProfiles] = useState<ShippingProfile[]>([])
  const [profilesLoading, setProfilesLoading] = useState(true)

  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [shippingCharged, setShippingCharged] = useState('')
  const [suppliesCost, setSuppliesCost] = useState('')
  const [postageCost, setPostageCost] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadProfiles() {
    try {
      setProfilesLoading(true)

      const response = await fetch('/api/shipping-profiles', {
        method: 'GET',
        cache: 'no-store',
      })

      const json = await response.json()

      if (!response.ok) {
        throw new Error(json?.error || 'Failed to load shipping profiles')
      }

      setProfiles(Array.isArray(json) ? json : [])
    } catch (error) {
      console.error(error)
      alert(error instanceof Error ? error.message : 'Failed to load shipping profiles')
      setProfiles([])
    } finally {
      setProfilesLoading(false)
    }
  }

  useEffect(() => {
    loadProfiles()
  }, [])

  function handleProfileChange(profileId: string) {
    setSelectedProfileId(profileId)

    const profile = profiles.find((item) => item.id === profileId)

    if (!profile) return

    setShippingCharged(
      profile.shipping_charged_default == null
        ? ''
        : String(profile.shipping_charged_default)
    )

    setSuppliesCost(
      profile.supplies_cost_default == null
        ? ''
        : String(profile.supplies_cost_default)
    )
  }

  async function saveSale() {
    try {
      setSaving(true)

      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sale_price: salePrice === '' ? 0 : Number(salePrice),
          shipping_charged: shippingCharged === '' ? 0 : Number(shippingCharged),
          supplies_cost: suppliesCost === '' ? 0 : Number(suppliesCost),
          postage_cost: postageCost === '' ? 0 : Number(postageCost),
          shipping_profile_id: selectedProfileId || null,
        }),
      })

      const json = await response.json()

      if (!response.ok) {
        throw new Error(json?.error || 'Failed to save sale')
      }

      setSelectedProfileId('')
      setSalePrice('')
      setShippingCharged('')
      setSuppliesCost('')
      setPostageCost('')

      alert('Sale saved.')
    } catch (error) {
      console.error(error)
      alert(error instanceof Error ? error.message : 'Failed to save sale')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Record Sale</h1>
        <p className="mt-2 text-zinc-400">
          Shipping profile fills shipping charged and supplies. Enter actual
          postage cost for each sale.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="grid gap-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Shipping Profile
            </label>
            <select
              value={selectedProfileId}
              onChange={(e) => handleProfileChange(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-zinc-500"
            >
              <option value="">
                {profilesLoading ? 'Loading...' : 'Select profile'}
              </option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Sale Price
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-zinc-500"
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Shipping Charged
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={shippingCharged}
                onChange={(e) => setShippingCharged(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Supplies Cost
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={suppliesCost}
                onChange={(e) => setSuppliesCost(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Postage Cost
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={postageCost}
              onChange={(e) => setPostageCost(e.target.value)}
              placeholder="Enter actual postage for this sale"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-zinc-500"
            />
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={saveSale}
              disabled={saving}
              className="w-full rounded-xl bg-white px-4 py-3 font-medium text-black hover:bg-zinc-200 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Sale'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}