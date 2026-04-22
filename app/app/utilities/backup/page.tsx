import Link from 'next/link'
import BackupExportButton from './BackupExportButton'
import BackupCSVExportButton from './BackupCSVExportButton'
import RestorePreviewPanel from './RestorePreviewPanel'

function InfoCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="app-card-tight p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3 text-sm text-zinc-400">{children}</div>
    </div>
  )
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string
  title: string
  description: string
}) {
  return (
    <div className="app-card-tight p-5">
      <div className="flex items-start gap-3">
        <div className="app-card-tight flex h-8 w-8 shrink-0 items-center justify-center p-0 text-sm font-semibold">
          {number}
        </div>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-zinc-400">{description}</p>
        </div>
      </div>
    </div>
  )
}

export default function BackupRestorePage() {
  return (
    <div className="app-page-wide space-y-5">
      <div className="app-page-header gap-4">
        <div>
          <h1 className="app-title">Backup / Restore</h1>
          <p className="app-subtitle">
            Protect your records with full-app backups and safe restore tools.
            This page is for data safety and recovery, separate from tax reporting.
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="space-y-4">
          <div className="app-section p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Backup Exports</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Create either a full restore-capable backup for the app or CSV
                  exports for accounting, tax prep, and spreadsheet review.
                </p>
              </div>

              <div className="space-y-3">
                <BackupExportButton />
                <BackupCSVExportButton />
              </div>
            </div>

            <div className="app-card-tight mt-4 p-4 text-sm text-zinc-300">
              Use the full backup export for app recovery and restore workflows.
              Use the CSV export for QuickBooks, TurboTax, your CPA, or manual
              spreadsheet review.
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <InfoCard title="Included In Full Backup">
                <div className="space-y-1">
                  <p>Breaks and grouped purchases</p>
                  <p>Inventory items and quantities</p>
                  <p>Sales records and related costs</p>
                  <p>Expenses</p>
                  <p>Shipping profiles</p>
                  <p>Imported order staging data when available</p>
                </div>
              </InfoCard>

              <InfoCard title="CSV Export Use Cases">
                <div className="space-y-1">
                  <p>QuickBooks import prep</p>
                  <p>TurboTax and CPA review</p>
                  <p>Manual spreadsheet filtering and sorting</p>
                  <p>Independent copies outside the app</p>
                </div>
              </InfoCard>
            </div>
          </div>

          <div className="app-section p-5">
            <div>
              <h2 className="text-lg font-semibold">Restore From Backup</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Restore now supports both merge and replace modes. Validation and
                preview still happen before restore execution is allowed.
              </p>
            </div>

            <div className="app-card-tight mt-4 p-4 text-sm text-zinc-300">
              Merge mode is the safer default. Replace mode is for returning the
              app to the backup state and should be used carefully.
            </div>

            <div className="mt-4">
              <RestorePreviewPanel />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <StepCard
                number="1"
                title="Validate Backup"
                description="Check structure, user ownership, and version first."
              />
              <StepCard
                number="2"
                title="Choose Mode"
                description="Use merge for safer adds or replace to reset to backup state."
              />
              <StepCard
                number="3"
                title="Restore Carefully"
                description="Review counts and confirm before changing live app data."
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="app-section p-5">
            <h2 className="text-lg font-semibold">Recommended Use</h2>
            <div className="mt-3 space-y-3 text-sm text-zinc-400">
              <p>Create a full backup before major imports, edits, or structure changes.</p>
              <p>Use Tax Summary for tax reporting, not as your app backup.</p>
              <p>Use CSV exports when you need accountant-friendly records.</p>
            </div>
          </div>

          <div className="app-section p-5">
            <h2 className="text-lg font-semibold">Status</h2>
            <div className="mt-3 space-y-3">
              <div className="app-card-tight p-3 text-sm">
                Full backup export is active.
              </div>
              <div className="app-card-tight p-3 text-sm">
                CSV export is active.
              </div>
              <div className="app-card-tight p-3 text-sm">
                Restore preview is active.
              </div>
              <div className="app-card-tight p-3 text-sm">
                Merge restore is active.
              </div>
              <div className="app-card-tight p-3 text-sm">
                Replace restore is active.
              </div>
            </div>
          </div>

          <div className="app-section p-5">
            <h2 className="text-lg font-semibold">Restore Modes</h2>
            <div className="mt-3 space-y-3 text-sm text-zinc-400">
              <p>
                <span className="font-semibold text-zinc-200">Merge:</span> adds
                missing records and skips existing IDs.
              </p>
              <p>
                <span className="font-semibold text-zinc-200">Replace:</span>{' '}
                deletes current data in the included tables and restores from the
                backup file.
              </p>
              <p>
                Replace mode also attempts rollback to the pre-restore snapshot if
                a restore failure happens mid-process.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}