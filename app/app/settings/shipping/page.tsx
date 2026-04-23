'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'

type ShippingProfile = {
  id: string
  name: string
  shipping_charged_default: number | null
  supplies_cost_default: number | null
}

export default function ShippingSettingsPage() {
  const [profiles, setProfiles] = useState<ShippingProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [shippingChargedDefault, setShippingChargedDefault] = useState('')
  const [suppliesCostDefault, setSuppliesCostDefault] = useState('')

  async function loadProfiles() {
    try {
      setLoading(true)

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
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfiles()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!name.trim()) {
      alert('Profile name is required.')
      return
    }

    try {
      setSaving(true)

      const response = await fetch('/api/shipping-profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          shipping_charged_default:
            shippingChargedDefault === '' ? 0 : Number(shippingChargedDefault),
          supplies_cost_default:
            suppliesCostDefault === '' ? 0 : Number(suppliesCostDefault),
        }),
      })

      const json = await response.json()

      if (!response.ok) {
        throw new Error(json?.error || 'Failed to save shipping profile')
      }

      setName('')
      setShippingChargedDefault('')
      setSuppliesCostDefault('')

      await loadProfiles()
    } catch (error) {
      console.error(error)
      alert(error instanceof Error ? error.message : 'Failed to save shipping profile')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm('Delete this shipping profile?')
    if (!confirmed) return

    try {
      const response = await fetch(`/api/shipping-profiles/${id}`, {
        method: 'DELETE',
      })

      const json = await response.json()

      if (!response.ok) {
        throw new Error(json?.error || 'Failed to delete shipping profile')
      }

      await loadProfiles()
    } catch (error) {
      console.error(error)
      alert(error instanceof Error ? error.message : 'Failed to delete shipping profile')
    }
  }

  function money(value: number | null | undefined) {
    return Number(value ?? 0).toFixed(2)
  }

  return (
    <div className="app-page-wide space-y-5">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Shipping Profiles</h1>
          <p className="app-subtitle">
            Profiles store defaults for shipping charged and supplies cost only.
            Actual postage is entered on each sale.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/utilities" className="app-button">
            Back to Utilities
          </Link>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="app-section p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Add Shipping Profile</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Save common defaults for shipping charged and supplies cost.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-200">
              Profile Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="PWE, BMWT, etc."
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-200">
              Shipping Charged Default
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={shippingChargedDefault}
              onChange={(e) => setShippingChargedDefault(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-200">
              Supplies Cost Default
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={suppliesCostDefault}
              onChange={(e) => setSuppliesCostDefault(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={saving}
            className="app-button-primary disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>

      <div className="app-section p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Existing Profiles</h2>
          <p className="text-sm text-zinc-400">
            Profiles used in the sales flow for shipping charged and supplies defaults.
          </p>
        </div>

        {loading ? (
          <div className="app-empty mt-4">Loading profiles...</div>
        ) : profiles.length === 0 ? (
          <div className="app-empty mt-4">No shipping profiles found.</div>
        ) : (
          <div className="mt-4 divide-y divide-zinc-800">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-zinc-100">{profile.name}</div>
                  <div className="mt-1 text-sm text-zinc-400">
                    Shipping Charged Default: ${money(profile.shipping_charged_default)}
                    <span className="mx-2 text-zinc-600">•</span>
                    Supplies Cost Default: ${money(profile.supplies_cost_default)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(profile.id)}
                  className="app-button shrink-0 border-red-900 bg-red-950/40 text-red-100 hover:bg-red-900/40"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}