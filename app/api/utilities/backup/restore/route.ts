import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type BackupRow = {
  id?: string | number | null
  user_id?: string | null
  [key: string]: unknown
}

type BackupSection = {
  table?: string
  included?: boolean
  count?: number
  rows?: BackupRow[]
  error?: string
}

type BackupPayload = {
  app?: string
  type?: string
  version?: number
  exported_at?: string
  user_id?: string
  summary?: {
    total_tables_attempted?: number
    total_tables_included?: number
    total_rows_exported?: number
  }
  data?: Record<string, BackupSection>
}

type RestoreBody = {
  backupText?: string
  mode?: 'merge' | 'replace'
  confirmed?: boolean
}

type TableConfig = {
  key: string
  table: string
}

const TABLES_IN_INSERT_ORDER: TableConfig[] = [
  { key: 'breaks', table: 'breaks' },
  { key: 'inventory_items', table: 'inventory_items' },
  { key: 'sales', table: 'sales' },
  { key: 'expenses', table: 'expenses' },
  { key: 'shipping_profiles', table: 'shipping_profiles' },
]

const TABLES_IN_DELETE_ORDER: TableConfig[] = [
  { key: 'sales', table: 'sales' },
  { key: 'inventory_items', table: 'inventory_items' },
  { key: 'breaks', table: 'breaks' },
  { key: 'expenses', table: 'expenses' },
  { key: 'shipping_profiles', table: 'shipping_profiles' },
]

function parseAndValidateBackup(backupText: string, currentUserId: string) {
  let parsed: BackupPayload

  try {
    parsed = JSON.parse(backupText) as BackupPayload
  } catch {
    throw new Error('Backup file is not valid JSON.')
  }

  if (parsed.app !== 'card-business-os') {
    throw new Error('Backup file is not from this app.')
  }

  if (parsed.type !== 'full_backup') {
    throw new Error('Backup file is not a full backup export.')
  }

  if (parsed.version !== 1) {
    throw new Error('Unsupported backup version.')
  }

  if (!parsed.user_id) {
    throw new Error('Backup file is missing a user_id.')
  }

  if (parsed.user_id !== currentUserId) {
    throw new Error('This backup belongs to a different user and cannot be restored here.')
  }

  if (!parsed.data || typeof parsed.data !== 'object') {
    throw new Error('Backup file is missing data sections.')
  }

  return parsed
}

function normalizeRows(rows: BackupRow[], userId: string): BackupRow[] {
  return rows.map((row) => ({
    ...row,
    user_id: userId,
  }))
}

async function fetchUserRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  userId: string
): Promise<BackupRow[]> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to read ${table}: ${error.message}`)
  }

  return (data ?? []) as BackupRow[]
}

async function fetchUserIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  userId: string
): Promise<Set<string>> {
  const rows = await fetchUserRows(supabase, table, userId)

  return new Set(
    rows
      .map((row) => row.id)
      .filter((id): id is string | number => id !== null && id !== undefined)
      .map((id) => String(id))
  )
}

async function insertRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  rows: BackupRow[]
) {
  if (!rows.length) return

  const { error } = await supabase.from(table).insert(rows)

  if (error) {
    throw new Error(`Failed to insert into ${table}: ${error.message}`)
  }
}

async function deleteUserRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  userId: string
) {
  const { error } = await supabase.from(table).delete().eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to delete existing ${table}: ${error.message}`)
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as RestoreBody
    const backupText = String(body?.backupText ?? '').trim()
    const mode = body?.mode
    const confirmed = Boolean(body?.confirmed)

    if (!backupText) {
      return NextResponse.json({ error: 'Backup file is empty.' }, { status: 400 })
    }

    if (mode !== 'merge' && mode !== 'replace') {
      return NextResponse.json({ error: 'Invalid restore mode.' }, { status: 400 })
    }

    if (!confirmed) {
      return NextResponse.json(
        { error: 'Restore confirmation is required.' },
        { status: 400 }
      )
    }

    const parsed = parseAndValidateBackup(backupText, user.id)

    const backupSections = TABLES_IN_INSERT_ORDER.map(({ key, table }) => {
      const section = parsed.data?.[key]
      const rawRows = Array.isArray(section?.rows) ? section.rows : []
      const rows = normalizeRows(rawRows, user.id)

      return {
        key,
        table,
        rows,
      }
    })

    if (mode === 'merge') {
      const tableResults: Array<{
        key: string
        table: string
        inserted: number
        skipped_existing: number
      }> = []

      for (const section of backupSections) {
        const existingIds = await fetchUserIds(supabase, section.table, user.id)

        const rowsToInsert = section.rows.filter((row) => {
          const rowId = row.id
          if (rowId === null || rowId === undefined || rowId === '') {
            return true
          }
          return !existingIds.has(String(rowId))
        })

        const skippedExisting = section.rows.length - rowsToInsert.length

        await insertRows(supabase, section.table, rowsToInsert)

        tableResults.push({
          key: section.key,
          table: section.table,
          inserted: rowsToInsert.length,
          skipped_existing: skippedExisting,
        })
      }

      return NextResponse.json({
        ok: true,
        mode,
        summary: {
          inserted_total: tableResults.reduce((sum, row) => sum + row.inserted, 0),
          skipped_existing_total: tableResults.reduce(
            (sum, row) => sum + row.skipped_existing,
            0
          ),
        },
        tables: tableResults,
      })
    }

    const preRestoreSnapshot: Record<string, BackupRow[]> = {}

    for (const { table } of TABLES_IN_INSERT_ORDER) {
      preRestoreSnapshot[table] = await fetchUserRows(supabase, table, user.id)
    }

    let deletedExistingTotal = 0

    try {
      for (const { table } of TABLES_IN_DELETE_ORDER) {
        deletedExistingTotal += preRestoreSnapshot[table]?.length ?? 0
        await deleteUserRows(supabase, table, user.id)
      }

      const tableResults: Array<{
        key: string
        table: string
        inserted: number
      }> = []

      for (const section of backupSections) {
        await insertRows(supabase, section.table, section.rows)

        tableResults.push({
          key: section.key,
          table: section.table,
          inserted: section.rows.length,
        })
      }

      return NextResponse.json({
        ok: true,
        mode,
        summary: {
          deleted_existing_total: deletedExistingTotal,
          inserted_total: tableResults.reduce((sum, row) => sum + row.inserted, 0),
        },
        tables: tableResults,
      })
    } catch (restoreError) {
      try {
        for (const { table } of TABLES_IN_DELETE_ORDER) {
          await deleteUserRows(supabase, table, user.id)
        }

        for (const { table } of TABLES_IN_INSERT_ORDER) {
          const snapshotRows = preRestoreSnapshot[table] ?? []
          await insertRows(supabase, table, snapshotRows)
        }

        return NextResponse.json(
          {
            error:
              restoreError instanceof Error
                ? `${restoreError.message} Rollback to the pre-restore snapshot was attempted successfully.`
                : 'Restore failed, but rollback to the pre-restore snapshot was attempted successfully.',
          },
          { status: 500 }
        )
      } catch (rollbackError) {
        return NextResponse.json(
          {
            error:
              restoreError instanceof Error
                ? restoreError.message
                : 'Restore failed.',
            rollback_error:
              rollbackError instanceof Error
                ? rollbackError.message
                : 'Rollback attempt also failed.',
          },
          { status: 500 }
        )
      }
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Restore failed',
      },
      { status: 500 }
    )
  }
}