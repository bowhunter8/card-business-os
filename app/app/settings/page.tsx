'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type ThemeOption = {
  value: string
  label: string
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'dark-pro', label: 'Dark Pro' },
  { value: 'light', label: 'Light' },
  { value: 'retro-terminal', label: 'Retro Terminal' },
]

function applyTheme(theme: string) {
  document.documentElement.setAttribute('data-theme', theme)
  window.localStorage.setItem('theme', theme)
}

export default function SettingsPage() {
  const [selectedTheme, setSelectedTheme] = useState('dark-pro')

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('theme') || 'dark-pro'
    setSelectedTheme(savedTheme)
    document.documentElement.setAttribute('data-theme', savedTheme)
  }, [])

  function handleThemeChange(theme: string) {
    setSelectedTheme(theme)
    applyTheme(theme)
  }

  const selectedThemeLabel =
    THEME_OPTIONS.find((theme) => theme.value === selectedTheme)?.label || 'Dark Pro'

  return (
    <div className="app-page-wide">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">User Settings</h1>
          <p className="app-subtitle">
            Manage your account profile, business/tax report details, preferences, and reusable app settings.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/app/settings/profile" className="app-card transition hover:bg-zinc-800">
          <div className="text-lg font-semibold">Profile</div>
          <div className="mt-1 text-sm text-zinc-400">
            Update your display name. If blank, the app will use your login email.
          </div>
        </Link>

        <Link href="/app/settings/business" className="app-card transition hover:bg-zinc-800">
          <div className="text-lg font-semibold">Business / Tax Profile</div>
          <div className="mt-1 text-sm text-zinc-400">
            Optional business name, EIN, mailing address, phone, and email for tax reports and CPA records.
          </div>
        </Link>

        <Link href="/app/settings/shipping" className="app-card transition hover:bg-zinc-800">
          <div className="text-lg font-semibold">Shipping Profiles</div>
          <div className="mt-1 text-sm text-zinc-400">
            Manage PWE, bubble mailers, boxes, and reusable shipping charged/supplies cost presets.
          </div>
        </Link>

        <div className="app-card">
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-lg font-semibold">Preferences</div>
              <div className="mt-1 text-sm text-zinc-400">
                Personalize the app with light, dark, or retro themes.
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                App Theme
              </span>
              <select
                value={selectedTheme}
                onChange={(event) => handleThemeChange(event.target.value)}
                className="app-select mt-1"
              >
                {THEME_OPTIONS.map((theme) => (
                  <option key={theme.value} value={theme.value}>
                    {theme.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
              Current theme:{' '}
              <span className="font-semibold text-zinc-100">{selectedThemeLabel}</span>
            </div>

            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Quick Themes
              </div>
              <div className="flex flex-wrap gap-2">
                {THEME_OPTIONS.map((theme) => (
                  <button
                    key={theme.value}
                    type="button"
                    onClick={() => handleThemeChange(theme.value)}
                    className={selectedTheme === theme.value ? 'app-button-primary' : 'app-button'}
                  >
                    {theme.label}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}