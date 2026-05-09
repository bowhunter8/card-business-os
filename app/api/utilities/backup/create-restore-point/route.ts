import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildUserBackup } from '../export/route'

type BackupType =
  | 'manual'
  | 'automatic'
  | 'scheduled'
  | 'emergency'
  | 'before_restore'
  | 'before_import'
  | 'before_delete'
  | 'before_tax_lock'

type CreateRestorePointBody = {
  backupName?: string
  backupType?: BackupType
}

type RestorePointRetentionRow = {
  id: string
  created_at: string | null
  backup_type: BackupType | string | null
}

const VALID_BACKUP_TYPES = new Set<BackupType>([
  'manual',
  'automatic',
  'scheduled',
  'emergency',
  'before_restore',
  'before_import',
  'before_delete',
  'before_tax_lock',
])

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

function fallbackBackupName(backupType: BackupType) {
  const now = new Date()

  if (backupType === 'manual') {
    return `Manual Restore Point ${now.toLocaleString()}`
  }

  if (backupType === 'automatic' || backupType === 'scheduled') {
    return `Scheduled Restore Point ${now.toLocaleString()}`
  }

  if (backupType === 'emergency' || backupType === 'before_restore') {
    return `Emergency Restore Point ${now.toLocaleString()}`
  }

  if (backupType === 'before_import') {
    return `Before Import ${now.toLocaleString()}`
  }

  if (backupType === 'before_delete') {
    return `Before Delete ${now.toLocaleString()}`
  }

  if (backupType === 'before_tax_lock') {
    return `Before Tax Lock ${now.toLocaleString()}`
  }

  return `Restore Point ${now.toLocaleString()}`
}

function getMonthKey(value: string | null) {
  if (!value) return null

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return null

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}`
}

function pickRetentionIds({
  rows,
  keepLatest,
}: {
  rows: RestorePointRetentionRow[]
  keepLatest: number
}) {
  const keepIds = new Set<string>()
  const monthlyArchiveMonths = new Set<string>()

  rows.slice(0, keepLatest).forEach((row) => {
    if (row.id) {
      keepIds.add(row.id)
    }
  })

  rows.forEach((row) => {
    if (!row.id) return

    const monthKey = getMonthKey(row.created_at)

    if (!monthKey) return
    if (monthlyArchiveMonths.has(monthKey)) return

    monthlyArchiveMonths.add(monthKey)
    keepIds.add(row.id)
  })

  return keepIds
}

async function trimAutomaticRestorePoints({
  supabase,
  userId,
  keepLatest,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  keepLatest: number
}) {
  const { data, error } = await supabase
    .from('backup_restore_points')
    .select('id, created_at, backup_type')
    .eq('user_id', userId)
    .in('backup_type', ['automatic', 'scheduled'])
    .order('created_at', { ascending: false })

  if (error) return

  const rows = (data ?? []) as RestorePointRetentionRow[]

  const keepIds = pickRetentionIds({
    rows,
    keepLatest,
  })

  const extraIds = rows
    .map((row) => row.id)
    .filter((id) => id && !keepIds.has(id))

  if (!extraIds.length) return

  await supabase
    .from('backup_restore_points')
    .delete()
    .eq('user_id', userId)
    .in('id', extraIds)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return jsonError('Unauthorized', 401)
  }

  let body: CreateRestorePointBody = {}

  try {
    body = (await request.json()) as CreateRestorePointBody
  } catch {
    body = {}
  }

  const requestedType = body.backupType ?? 'manual'
  const backupType = VALID_BACKUP_TYPES.has(requestedType)
    ? requestedType
    : 'manual'

  try {
    const backup = await buildUserBackup(user.id)

    const backupName =
      String(body.backupName ?? '').trim() || fallbackBackupName(backupType)

    const { data, error } = await supabase
      .from('backup_restore_points')
      .insert({
        user_id: user.id,
        backup_name: backupName,
        backup_type: backupType,
        backup_json: backup,
      })
      .select('id, created_at, backup_name, backup_type')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    if (backupType === 'automatic' || backupType === 'scheduled') {
      await trimAutomaticRestorePoints({
        supabase,
        userId: user.id,
        keepLatest: 25,
      })
    }

    return NextResponse.json({
      ok: true,
      restorePoint: data,
    })
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : 'Could not create restore point.',
      500
    )
  }
}
