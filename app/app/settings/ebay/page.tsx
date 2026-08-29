'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'

const DEFAULT_TEMPLATE = `{summary}

{details}

Card pictured is the exact card you will receive. Please review the photos carefully for condition. The card will be packaged securely for shipping.`

const PLACEHOLDERS = [
  '{summary}',
  '{details}',
  '{title}',
  '{year}',
  '{player}',
  '{set}',
  '{card_number}',
  '{team}',
  '{parallel}',
  '{features}',
  '{serial_number}',
  '{print_run}',
]

const PREVIEW_VALUES: Record<string, string> = {
  '{summary}': '2026 Topps Chrome Bryan Woo #31, serial numbered 35/150.',
  '{details}':
    'A sharp-looking card featuring Bryan Woo from 2026 Topps Chrome. This serial-numbered card is limited to 150 copies and would make a great addition to a Bryan Woo or Seattle Mariners collection.',
  '{title}': 'Bryan Woo 2026 Topps Chrome #31 35/150',
  '{year}': '2026',
  '{player}': 'Bryan Woo',
  '{set}': 'Topps Chrome',
  '{card_number}': '31',
  '{team}': 'Seattle Mariners',
  '{parallel}': '',
  '{features}': 'Serial Numbered',
  '{serial_number}': '35/150',
  '{print_run}': '150',
}

async function readJsonOrError(response: Response) {
  const text = await response.text()

  if (!text.trim()) return {}

  try {
    return JSON.parse(text)
  } catch {
    return {
      error: text || `Request failed with status ${response.status}`,
    }
  }
}

function renderPreview(template: string) {
  let output = template

  for (const [token, value] of Object.entries(PREVIEW_VALUES)) {
    output = output.replaceAll(token, value)
  }

  return output
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ ]{2,}/g, ' ')
    .trim()
}

export default function EbayExportSettingsPage() {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE)
  const [savedTemplate, setSavedTemplate] = useState(DEFAULT_TEMPLATE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const preview = useMemo(() => renderPreview(template), [template])
  const hasChanges = template !== savedTemplate

  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch('/api/ebay-export-settings', {
          method: 'GET',
          cache: 'no-store',
        })

        const json = await readJsonOrError(response)

        if (!response.ok) {
          throw new Error(json?.error || 'Failed to load eBay export settings')
        }

        const nextTemplate =
          typeof json?.description_template === 'string' &&
          json.description_template.trim()
            ? json.description_template
            : DEFAULT_TEMPLATE

        setTemplate(nextTemplate)
        setSavedTemplate(nextTemplate)
      } catch (loadError) {
        console.error(loadError)
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load eBay export settings'
        )
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [])

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setSaving(true)
      setMessage('')
      setError('')

      const response = await fetch('/api/ebay-export-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description_template: template,
        }),
      })

      const json = await readJsonOrError(response)

      if (!response.ok) {
        throw new Error(json?.error || 'Failed to save eBay description template')
      }

      const saved =
        typeof json?.description_template === 'string'
          ? json.description_template
          : template

      setTemplate(saved)
      setSavedTemplate(saved)
      setMessage('eBay description template saved.')
    } catch (saveError) {
      console.error(saveError)
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Failed to save eBay description template'
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleRestoreDefault() {
    const confirmed = window.confirm(
      'Restore the built-in HITS eBay description template? Your custom template will be removed.'
    )

    if (!confirmed) return

    try {
      setRestoring(true)
      setMessage('')
      setError('')

      const response = await fetch('/api/ebay-export-settings', {
        method: 'DELETE',
      })

      const json = await readJsonOrError(response)

      if (!response.ok) {
        throw new Error(json?.error || 'Failed to restore the default template')
      }

      const restored =
        typeof json?.description_template === 'string'
          ? json.description_template
          : DEFAULT_TEMPLATE

      setTemplate(restored)
      setSavedTemplate(restored)
      setMessage('Default eBay description template restored.')
    } catch (restoreError) {
      console.error(restoreError)
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : 'Failed to restore the default template'
      )
    } finally {
      setRestoring(false)
    }
  }

  function insertPlaceholder(token: string) {
    setTemplate((current) => {
      if (!current.trim()) return token
      return `${current}${current.endsWith('\n') ? '' : ' '}${token}`
    })
    setMessage('')
    setError('')
  }

  function handleStartBlank() {
    if (template.trim()) {
      const confirmed = window.confirm(
        'Start with a blank template? This only clears the editor. Nothing is saved until you click Save Template.'
      )

      if (!confirmed) return
    }

    setTemplate('')
    setMessage('')
    setError('')
  }

  return (
    <div className="app-page-wide space-y-5">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">eBay Draft Export</h1>
          <p className="app-subtitle">
            Customize the listing description HITS creates for eBay draft exports.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/settings" className="app-button">
            Back to Settings
          </Link>
        </div>
      </div>

      {error ? (
        <div className="app-alert-error">{error}</div>
      ) : null}

      {message ? (
        <div className="app-alert-success">{message}</div>
      ) : null}

      <form onSubmit={handleSave} className="app-section p-5 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Listing Description Template</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Use the built-in smart card template, customize it with placeholders, or start completely blank
            for non-card items and write your own description. The smart{' '}
            <span className="font-medium text-zinc-300">{'{summary}'}</span> placeholder already contains the main
            card-identification details, so you normally do not need to add year, player, set, card number,
            parallel, features, or serial-number placeholders separately.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Available Placeholders
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PLACEHOLDERS.map((placeholder) => (
              <button
                key={placeholder}
                type="button"
                onClick={() => insertPlaceholder(placeholder)}
                className="app-button"
                disabled={loading || saving || restoring}
                title={`Insert ${placeholder}`}
              >
                {placeholder}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2 text-xs text-zinc-500">
            <p>
              <span className="font-medium text-zinc-300">{'{summary}'}</span> already generates the complete
              first identification sentence using the card&apos;s year, set, player, card number, parallel,
              special features, and serial numbering when available.
            </p>
            <p>
              <span className="font-medium text-zinc-300">{'{details}'}</span> generates the conversational
              follow-up paragraph. Use the individual placeholders only if you want to replace or customize
              those smart sentences — adding them alongside <span className="font-medium text-zinc-300">{'{summary}'}</span>{' '}
              may duplicate information.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-zinc-200">
            Description Template
          </label>
          <textarea
            value={template}
            onChange={(event) => {
              setTemplate(event.target.value)
              setMessage('')
              setError('')
            }}
            rows={12}
            maxLength={10000}
            disabled={loading || saving || restoring}
            className="app-textarea min-h-[280px] font-mono text-sm disabled:opacity-60"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
            <span>{template.length.toLocaleString()} / 10,000 characters</span>
            {hasChanges ? (
              <span className="text-yellow-300">Unsaved changes</span>
            ) : (
              <span>Saved</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={loading || saving || restoring || !hasChanges}
            className="app-button-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Template'}
          </button>

          <button
            type="button"
            onClick={handleRestoreDefault}
            disabled={loading || saving || restoring}
            className="app-button disabled:cursor-not-allowed disabled:opacity-50"
          >
            {restoring ? 'Restoring...' : 'Restore Default'}
          </button>

          <button
            type="button"
            onClick={handleStartBlank}
            disabled={loading || saving || restoring}
            className="app-button disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start Blank
          </button>
        </div>
      </form>

      <div className="app-section p-5">
        <div>
          <h2 className="text-lg font-semibold">eBay Description Preview</h2>
          <p className="mt-1 text-sm text-zinc-400">
            This shows how the description will read after HITS replaces the placeholders. The preview uses
            a sample Bryan Woo serial-numbered card; your actual exports will use each card&apos;s own data.
          </p>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-700 bg-white text-zinc-900">
          <div className="border-b border-zinc-200 bg-zinc-100 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Description
            </div>
          </div>
          <div className="min-h-[180px] whitespace-pre-wrap px-5 py-5 text-sm leading-7">
            {loading
              ? 'Loading template...'
              : preview || 'Blank template — add your own wording or placeholders above to build the description.'}
          </div>
        </div>

        <div className="mt-3 text-xs text-zinc-500">
          Preview only — this does not create or change an eBay draft.
        </div>
      </div>

      <div className="app-section p-5">
        <h2 className="text-lg font-semibold">How HITS Will Use It</h2>
        <div className="mt-3 space-y-2 text-sm text-zinc-400">
          <p>
            The saved template will apply to future eBay draft CSV exports only. Existing inventory, sales,
            prior exports, and eBay drafts are not changed.
          </p>
          <p>
            Smart wording such as rookie, autograph, 1st Bowman, parallel, team, and serial-numbered details
            will come from the inventory data HITS already uses for the eBay title and item specifics.
          </p>
        </div>
      </div>
    </div>
  )
}
