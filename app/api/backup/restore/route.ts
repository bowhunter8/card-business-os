import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type RestoreMode = 'merge' | 'replace'

type BackupPayload = {
  backup_type?: string
  backup_version?: number
  exported_at?: string
  user_id?: string
  data?: Record<string, unknown>
  tables?: Record<string, unknown>
}

type BackupTableConfig = {
  key: string
  table: string
  userOwned: boolean
}

type RestoreTableResult = {
  key: string
  table: string
  inserted: number
  skipped_existing?: number
}

const BACKUP_TABLES: BackupTableConfig[] = [
  {
    key: 'breaks',
    table: 'breaks',
    userOwned: true,
  },
  {
    key: 'inventory_items',
    table: 'inventory_items',
    userOwned: true,
  },
  {
    key: 'sales',
    table: 'sales',
    userOwned: true,
  },
  {
    key: 'expenses',
    table: 'expenses',
    userOwned: true,
  },
  {
    key: 'shipping_profiles',
    table: 'shipping_profiles',
    userOwned: true,
  },
  {
    key: 'tax_year_settings',
    table: 'tax_year_settings',
    userOwned: true,
  },
  {
    key: 'whatnot_orders',
    table: 'whatnot_orders',
    userOwned: true,
  },
  {
    key: 'whatnot_order_group_suggestions',
    table: 'whatnot_order_group_suggestions',
    userOwned: true,
  },
  {
    key: 'starting_inventory_items',
    table: 'starting_inventory_items',
    userOwned: true,
  },
  {
    key: 'inventory_transactions',
    table: 'inventory_transactions',
    userOwned: true,
  },
  {
    key: 'break_entries',
    table: 'break_entries',
    userOwned: true,
  },
  {
    key: 'inventory_entries',
    table: 'inventory_entries',
    userOwned: true,
  },
]

function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      ...(extra ?? {}),
    },
    { status }
  )
}

function parseBackupText(backupText: unknown): BackupPayload {
  if (typeof backupText !== 'string' || !backupText.trim()) {
    throw new Error('Missing backup file content.')
  }

  try {
    return JSON.parse(backupText) as BackupPayload
  } catch {
    throw new Error('Backup file is not valid JSON.')
  }
}

function getBackupTables(backup: BackupPayload) {
  const source = backup.tables ?? backup.data

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Backup file does not contain a valid tables/data section.')
  }

  return source as Record<string, unknown>
}

function getRowsForBackupKey(backupTables: Record<string, unknown>, key: string) {
  const raw = backupTables[key]

  if (!raw) return []

  if (!Array.isArray(raw)) {
    throw new Error(`Backup section "${key}" is not an array.`)
  }

  return raw.filter((row): row is Record<string, unknown> => {
    return Boolean(row && typeof row === 'object' && !Array.isArray(row))
  })
}

function sanitizeRowsForUser(
  rows: Record<string, unknown>[],
  userId: string,
  userOwned: boolean
) {
  return rows.map((row) => {
    const cleaned = { ...row }

    if (userOwned) {
      cleaned.user_id = userId
    }

    return cleaned
  })
}

function getRowId(row: Record<string, unknown>) {
  const id = row.id

  if (typeof id === 'string' && id.trim()) return id
  if (typeof id === 'number' && Number.isFinite(id)) return id

  return null
}

async function getExistingIdsForRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  rows: Record<string, unknown>[]
) {
  const ids = rows.map(getRowId).filter((value): value is string | number => value !== null)

  if (ids.length === 0) {
    return new Set<string>()
  }

  const { data, error } = await supabase
    .from(table)
    .select('id')
    .in('id', ids)

  if (error) {
    throw new Error(`Could not check existing records for ${table}: ${error.message}`)
  }

  return new Set(
    (data ?? [])
      .map((row) => String((row as { id: string | number }).id))
      .filter(Boolean)
  )
}

async function insertRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  rows: Record<string, unknown>[]
) {
  if (rows.length === 0) return 0

  const { error } = await supabase.from(table).insert(rows)

  if (error) {
    throw new Error(`Could not insert rows into ${table}: ${error.message}`)
  }

  return rows.length
}

async function deleteExistingUserRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  userId: string
) {
  const { data: existingRows, error: readError } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)

  if (readError) {
    throw new Error(`Could not read existing rows from ${table}: ${readError.message}`)
  }

  const existingCount = existingRows?.length ?? 0

  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .eq('user_id', userId)

  if (deleteError) {
    throw new Error(`Could not delete existing rows from ${table}: ${deleteError.message}`)
  }

  return {
    existingRows: (existingRows ?? []) as Record<string, unknown>[],
    deletedCount: existingCount,
  }
}

async function restoreSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  snapshot: Array<{
    table: string
    rows: Record<string, unknown>[]
  }>
) {
  for (const item of [...snapshot].reverse()) {
    if (item.rows.length === 0) continue

    const { error } = await supabase.from(item.table).insert(item.rows)

    if (error) {
      throw new Error(`Rollback failed for ${item.table}: ${error.message}`)
    }
  }
}

async function runMergeRestore({
  supabase,
  backupTables,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  backupTables: Record<string, unknown>
  userId: string
}) {
  const tableResults: RestoreTableResult[] = []
  let insertedTotal = 0
  let skippedExistingTotal = 0

  for (const tableConfig of BACKUP_TABLES) {
    const rawRows = getRowsForBackupKey(backupTables, tableConfig.key)
    const rows = sanitizeRowsForUser(rawRows, userId, tableConfig.userOwned)

    if (rows.length === 0) {
      tableResults.push({
        key: tableConfig.key,
        table: tableConfig.table,
        inserted: 0,
        skipped_existing: 0,
      })
      continue
    }

    const existingIds = await getExistingIdsForRows(
      supabase,
      tableConfig.table,
      rows
    )

    const rowsToInsert = rows.filter((row) => {
      const id = getRowId(row)
      if (id === null) return true
      return !existingIds.has(String(id))
    })

    const skipped = rows.length - rowsToInsert.length
    const inserted = await insertRows(supabase, tableConfig.table, rowsToInsert)

    insertedTotal += inserted
    skippedExistingTotal += skipped

    tableResults.push({
      key: tableConfig.key,
      table: tableConfig.table,
      inserted,
      skipped_existing: skipped,
    })
  }

  return {
    ok: true,
    mode: 'merge' as const,
    summary: {
      inserted_total: insertedTotal,
      skipped_existing_total: skippedExistingTotal,
    },
    tables: tableResults,
  }
}

async function runReplaceRestore({
  supabase,
  backupTables,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  backupTables: Record<string, unknown>
  userId: string
}) {
  const tableResults: RestoreTableResult[] = []
  const snapshot: Array<{
    table: string
    rows: Record<string, unknown>[]
  }> = []

  let insertedTotal = 0
  let deletedExistingTotal = 0

  try {
    for (const tableConfig of [...BACKUP_TABLES].reverse()) {
      if (!tableConfig.userOwned) continue

      const deleted = await deleteExistingUserRows(
        supabase,
        tableConfig.table,
        userId
      )

      snapshot.push({
        table: tableConfig.table,
        rows: deleted.existingRows,
      })

      deletedExistingTotal += deleted.deletedCount
    }

    for (const tableConfig of BACKUP_TABLES) {
      const rawRows = getRowsForBackupKey(backupTables, tableConfig.key)
      const rows = sanitizeRowsForUser(rawRows, userId, tableConfig.userOwned)
      const inserted = await insertRows(supabase, tableConfig.table, rows)

      insertedTotal += inserted

      tableResults.push({
        key: tableConfig.key,
        table: tableConfig.table,
        inserted,
      })
    }

    return {
      ok: true,
      mode: 'replace' as const,
      summary: {
        deleted_existing_total: deletedExistingTotal,
        inserted_total: insertedTotal,
      },
      tables: tableResults,
    }
  } catch (error) {
    let rollbackError = ''

    try {
      for (const tableConfig of BACKUP_TABLES) {
        if (!tableConfig.userOwned) continue

        await supabase
          .from(tableConfig.table)
          .delete()
          .eq('user_id', userId)
      }

      await restoreSnapshot(supabase, snapshot)
    } catch (rollbackFailure) {
      rollbackError =
        rollbackFailure instanceof Error
          ? rollbackFailure.message
          : 'Rollback failed.'
    }

    const message = error instanceof Error ? error.message : 'Replace restore failed.'

    throw new Error(
      rollbackError ? `${message} ${rollbackError}` : message
    )
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonError('Unauthorized', 401)
  }

  let body: {
    backupText?: unknown
    mode?: RestoreMode
    confirmed?: boolean
  }

  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid request body.')
  }

  const mode = body.mode

  if (mode !== 'merge' && mode !== 'replace') {
    return jsonError('Invalid restore mode.')
  }

  if (body.confirmed !== true) {
    return jsonError('Restore must be confirmed before it can run.')
  }

  let backup: BackupPayload
  let backupTables: Record<string, unknown>

  try {
    backup = parseBackupText(body.backupText)
    backupTables = getBackupTables(backup)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Invalid backup file.')
  }

  if (backup.user_id && backup.user_id !== user.id) {
    return jsonError(
      'This backup belongs to a different user account. Restore was blocked.'
    )
  }

  try {
    if (mode === 'merge') {
      const result = await runMergeRestore({
        supabase,
        backupTables,
        userId: user.id,
      })

      return NextResponse.json(result)
    }

    const result = await runReplaceRestore({
      supabase,
      backupTables,
      userId: user.id,
    })

    return NextResponse.json(result)
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Restore failed.',
      500
    )
  }
}