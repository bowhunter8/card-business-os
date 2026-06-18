import { createClient } from '@/lib/supabase/server'
import { buildUserBackup } from '@/app/api/utilities/backup/export/route'

export type RestorePointType =
  | 'manual'
  | 'automatic'
  | 'scheduled'
  | 'emergency'
  | 'before_restore'
  | 'before_import'
  | 'before_delete'
  | 'before_tax_lock'

type CreateAutomaticRestorePointOptions = {
  userId: string
  backupName: string
  backupType?: RestorePointType
  metadata?: Record<string, unknown>
}

export async function createAutomaticRestorePoint({
  userId,
  backupName,
  backupType = 'automatic',
  metadata,
}: CreateAutomaticRestorePointOptions) {
  try {
    const supabase = await createClient()
    const backup = await buildUserBackup(userId)

    const safeBackupName = backupName.trim() || `Automatic Restore Point ${new Date().toLocaleString()}`

    const backupWithMetadata = {
      ...backup,
      restore_point_metadata: {
        created_by: 'createAutomaticRestorePoint',
        created_at: new Date().toISOString(),
        ...metadata,
      },
    }

    const { error } = await supabase.from('backup_restore_points').insert({
      user_id: userId,
      backup_name: safeBackupName,
      backup_type: backupType,
      backup_json: backupWithMetadata,
    })

    if (error) {
      console.error('Restore point insert failed:', error.message)
      return {
        ok: false,
        error: error.message,
      }
    }

    return {
      ok: true,
      error: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    console.error('Restore point creation failed:', message)

    return {
      ok: false,
      error: message,
    }
  }
}