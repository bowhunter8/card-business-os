'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import CreateRestorePointButton from './CreateRestorePointButton'
import DownloadBackupButton from './DownloadBackupButton'
import RestorePreviewPanel from './RestorePreviewPanel'

function formatDateTime(value: string | null, fallback: string) {
  if (!value) return fallback

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return fallback
  }

  return date.toLocaleString()
}

function BackupActionCard({
  number,
  title,
  description,
  detail,
  accent,
  children,
}: {
  number: string
  title: string
  description: string
  detail?: string
  accent: 'green' | 'blue' | 'purple'
  children: React.ReactNode
}) {
  const accentClasses =
    accent === 'green'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : accent === 'blue'
        ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
        : 'border-purple-500/30 bg-purple-500/10 text-purple-300'

  return (
    <section className="app-section p-5">
      <div className="grid gap-5 lg:grid-cols-[92px_minmax(0,1fr)_minmax(240px,340px)] lg:items-center">
        <div
          className={`flex h-20 w-20 items-center justify-center rounded-full border text-3xl font-black shadow-lg ${accentClasses}`}
        >
          {number}
        </div>

        <div>
          <h2 className="text-2xl font-semibold">{title}</h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            {description}
          </p>

          {detail ? (
            <p className="mt-3 text-sm font-medium text-zinc-300">
              {detail}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          {children}
        </div>
      </div>
    </section>
  )
}

export default function BackupRestorePage() {
  const [lastRestorePoint, setLastRestorePoint] = useState<string | null>(null)
  const [lastBackupDownload, setLastBackupDownload] = useState<string | null>(null)
  const [showRestorePointPanel, setShowRestorePointPanel] = useState(false)
  const [showRestorePointLoadingNotice, setShowRestorePointLoadingNotice] =
    useState(false)
  const [showBackupFileRestorePanel, setShowBackupFileRestorePanel] =
    useState(false)

  useEffect(() => {
    const storedLastRestorePoint = localStorage.getItem('last_restore_point_date')
    const legacyLastRestorePoint = localStorage.getItem('last_backup_date')
    const storedLastBackupDownload = localStorage.getItem('last_backup_download')

    if (storedLastRestorePoint || legacyLastRestorePoint) {
      setLastRestorePoint(storedLastRestorePoint || legacyLastRestorePoint)
    }

    if (storedLastBackupDownload) {
      setLastBackupDownload(storedLastBackupDownload)
    }

    function handleBackupDownloadRecorded() {
      const updatedLastBackupDownload = localStorage.getItem('last_backup_download')
      setLastBackupDownload(updatedLastBackupDownload)
    }

    window.addEventListener('hits-backup-download-recorded', handleBackupDownloadRecorded)

    return () => {
      window.removeEventListener('hits-backup-download-recorded', handleBackupDownloadRecorded)
    }
  }, [])

  useEffect(() => {
    if (!showRestorePointPanel) {
      setShowRestorePointLoadingNotice(false)
      return
    }

    setShowRestorePointLoadingNotice(true)

    const timer = window.setTimeout(() => {
      setShowRestorePointLoadingNotice(false)
    }, 18000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [showRestorePointPanel])

  return (
    <div className="app-page-wide space-y-5">
      <div className="app-page-header gap-4">
        <div>
          <h1 className="app-title">Backup & Restore</h1>

          <p className="app-subtitle">
            Protect your data with manual restore points, downloadable JSON
            backups, and simple restore tools.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/app/utilities" className="app-button">
            Back to Utilities
          </Link>

          <Link href="/app/reports/tax/summary" className="app-button">
            Tax Summary
          </Link>
        </div>
      </div>

      <section className="app-alert-info">
        <div className="font-semibold">Weekly backup reminder</div>
        <div className="mt-1 text-sm">
          Download a full backup at least once per week and before major imports,
          restores, bulk edits, write-offs, or year-end tax work.
        </div>
      </section>

      <div className="space-y-5">
        <BackupActionCard
          number="1"
          title="Restore Points"
          description="Create a manual restore point before major imports, restores, edits, or large inventory changes. HITS may also create automatic restore points before higher-risk actions."
          detail={`Last manual restore point: ${formatDateTime(
            lastRestorePoint,
            'No manual restore point recorded yet'
          )}`}
          accent="green"
        >
          <CreateRestorePointButton />

          <button
            type="button"
            onClick={() =>
              setShowRestorePointPanel((current) => !current)
            }
            className="app-button w-full justify-center"
          >
            {showRestorePointPanel
              ? 'Hide Restore Points'
              : 'Select Restore Point'}
          </button>
        </BackupActionCard>

        {showRestorePointPanel ? (
          <section className="app-section p-5">
            {showRestorePointLoadingNotice ? (
              <div className="mb-4 rounded-xl border border-blue-900/60 bg-blue-950/30 p-4 text-sm text-blue-100">
                <div className="font-semibold">Loading restore points…</div>
                <div className="mt-1 text-blue-200/90">
                  Checking saved restore points. This can take several seconds
                  if your backup history is large.
                </div>
              </div>
            ) : null}

            <RestorePreviewPanel
              allowedSources={['restore_point']}
              defaultSource="restore_point"
            />
          </section>
        ) : null}

        <BackupActionCard
          number="2"
          title="Backups"
          description="Download a full JSON backup for safekeeping, emergency recovery, or migration. You can also restore from a downloaded JSON backup file."
          detail={`Last downloaded backup: ${formatDateTime(
            lastBackupDownload,
            'Unknown / never downloaded from this browser'
          )}`}
          accent="blue"
        >
          <DownloadBackupButton />

          <button
            type="button"
            onClick={() =>
              setShowBackupFileRestorePanel((current) => !current)
            }
            className="app-button w-full justify-center"
          >
            {showBackupFileRestorePanel
              ? 'Hide Backup File Restore'
              : 'Restore From Backup File'}
          </button>
        </BackupActionCard>

        {showBackupFileRestorePanel ? (
          <section className="app-section p-5">
            <RestorePreviewPanel
              allowedSources={['backup_file']}
              defaultSource="backup_file"
            />
          </section>
        ) : null}

        <section className="app-section p-5">
          <div className="grid gap-4 md:grid-cols-[56px_minmax(0,1fr)] md:items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-purple-500/30 bg-purple-500/10 text-lg font-bold text-purple-300">
              3
            </div>

            <div>
              <h2 className="text-base font-semibold">
                Manual backups only
              </h2>

              <p className="mt-1 text-sm leading-6 text-zinc-400">
                Scheduled backups have been removed for now so the page does not
                imply files are downloading automatically. Use Backup Now for a
                full downloadable JSON backup, and use restore points as quick
                rollback checkpoints.
              </p>
            </div>
          </div>
        </section>

        <section className="app-section p-5">
          <div className="grid gap-4 md:grid-cols-[56px_minmax(0,1fr)] md:items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10 text-lg font-bold text-blue-300">
              ✓
            </div>

            <div>
              <h2 className="text-base font-semibold">
                Safety checks run in the background
              </h2>

              <p className="mt-1 text-sm text-zinc-400">
                HITS handles validation, restore safety checks, and recovery
                protections behind the scenes while keeping the workflow simple
                for users.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
