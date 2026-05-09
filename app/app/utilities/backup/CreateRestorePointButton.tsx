'use client'

import { useState } from 'react'

export default function CreateRestorePointButton() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCreateRestorePoint() {
    if (loading) return

    try {
      setLoading(true)
      setMessage(null)
      setError(null)

      const res = await fetch('/api/utilities/backup/create-restore-point', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          backupType: 'manual',
        }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(
          data?.error || data?.message || 'Failed to create restore point'
        )
      }

      localStorage.setItem('last_backup_date', new Date().toISOString())
      setMessage('Restore point created successfully.')

      window.location.reload()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to create restore point'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <button
        type="button"
        onClick={handleCreateRestorePoint}
        disabled={loading}
        className="app-button-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Creating Restore Point...' : 'Create Restore Point'}
      </button>

      {message ? (
        <p className="text-sm text-emerald-300">{message}</p>
      ) : null}

      {error ? (
        <p className="text-sm text-red-300">{error}</p>
      ) : null}
    </div>
  )
}