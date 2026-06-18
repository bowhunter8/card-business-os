'use client'

import BackupExportButton from './BackupExportButton'

export default function DownloadBackupButton() {
  function recordBackupDownload() {
    const now = new Date().toISOString()

    localStorage.setItem('last_backup_download', now)
    window.dispatchEvent(new Event('hits-backup-download-recorded'))
  }

  return (
    <div onClickCapture={recordBackupDownload} className="w-full">
      <BackupExportButton />
    </div>
  )
}
