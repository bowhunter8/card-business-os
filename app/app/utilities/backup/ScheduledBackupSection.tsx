'use client'

import { useEffect, useMemo, useState } from 'react'

type BackupFrequency = 'daily' | 'weekly' | 'monthly'

function formatFrequency(value: BackupFrequency) {
  if (value === 'daily') return 'Daily'
  if (value === 'monthly') return 'Monthly'
  return 'Weekly'
}

export default function ScheduledBackupSection() {
  const [automaticBackupsEnabled, setAutomaticBackupsEnabled] = useState(true)
  const [backupFrequency, setBackupFrequency] =
    useState<BackupFrequency>('weekly')

  useEffect(() => {
    const storedAutoBackups = localStorage.getItem(
      'automatic_backups_enabled'
    )

    const storedBackupFrequency = localStorage.getItem(
      'automatic_backup_frequency'
    )

    if (storedAutoBackups === 'false') {
      setAutomaticBackupsEnabled(false)
    }

    if (
      storedBackupFrequency === 'daily' ||
      storedBackupFrequency === 'weekly' ||
      storedBackupFrequency === 'monthly'
    ) {
      setBackupFrequency(storedBackupFrequency)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      'automatic_backups_enabled',
      automaticBackupsEnabled ? 'true' : 'false'
    )
  }, [automaticBackupsEnabled])

  useEffect(() => {
    localStorage.setItem('automatic_backup_frequency', backupFrequency)
  }, [backupFrequency])

  const scheduleText = useMemo(() => {
    if (!automaticBackupsEnabled) {
      return 'Automatic backups are off.'
    }

    return `${formatFrequency(backupFrequency)} backups are selected.`
  }, [automaticBackupsEnabled, backupFrequency])

  return (
    <section className="app-section p-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px] md:items-end">
        <div>
          <h2 className="text-lg font-semibold">
            Automatic Backup Settings
          </h2>

          <p className="mt-1 text-sm text-zinc-400">
            These settings are saved for this browser now. Server-side
            scheduled backups can be connected later so backups happen even
            when the app is closed.
          </p>

          <p className="mt-3 text-sm font-medium text-zinc-300">
            {scheduleText}
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setAutomaticBackupsEnabled(true)}
              className={
                automaticBackupsEnabled
                  ? 'app-button-primary'
                  : 'app-button'
              }
            >
              On
            </button>

            <button
              type="button"
              onClick={() => setAutomaticBackupsEnabled(false)}
              className={
                !automaticBackupsEnabled
                  ? 'app-button-primary'
                  : 'app-button'
              }
            >
              Off
            </button>
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Frequency
          </span>

          <select
            value={backupFrequency}
            onChange={(event) =>
              setBackupFrequency(
                event.target.value as BackupFrequency
              )
            }
            disabled={!automaticBackupsEnabled}
            className="app-select"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      </div>
    </section>
  )
}