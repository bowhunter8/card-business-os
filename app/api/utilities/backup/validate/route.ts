import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type BackupSection = {
  table?: string
  included?: boolean
  count?: number
  rows?: unknown[]
  error?: string
}

type LegacyBackupPayload = {
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

type CurrentBackupPayload = {
  backup_type?: string
  backup_version?: number
  exported_at?: string
  user_id?: string
  app_name?: string
  summary?: Record<string, number | null | undefined>
  tables?: Record<string, unknown>
  errors?: Record<string, string | null | undefined>
}

type BackupPayload = LegacyBackupPayload & CurrentBackupPayload

type ValidateBody = {
  fileName?: string
  backupText?: string
}

const BACKUP_SECTION_KEYS = [
  'breaks',
  'inventory_items',
  'sales',
  'expenses',
  'shipping_profiles',
  'tax_year_settings',
  'whatnot_orders',
  'whatnot_order_group_suggestions',
  'starting_inventory_items',
  'inventory_transactions',
  'break_entries',
  'inventory_entries',
]

const REQUIRED_SECTION_KEYS = [
  'breaks',
  'inventory_items',
  'sales',
  'expenses',
  'shipping_profiles',
]

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

function parseBackupText(backupText: string) {
  try {
    return JSON.parse(backupText) as BackupPayload
  } catch {
    throw new Error('Backup file is not valid JSON.')
  }
}

function isLegacyBackup(parsed: BackupPayload) {
  return parsed.app === 'card-business-os' && parsed.type === 'full_backup'
}

function isCurrentBackup(parsed: BackupPayload) {
  return parsed.backup_type === 'card_business_os_full_user_backup'
}

function getBackupVersion(parsed: BackupPayload) {
  return Number(parsed.version ?? parsed.backup_version ?? 0)
}

function getBackupApp(parsed: BackupPayload) {
  if (parsed.app) return parsed.app
  if (parsed.app_name) return parsed.app_name
  return 'card-business-os'
}

function getBackupType(parsed: BackupPayload) {
  if (parsed.type) return parsed.type
  if (parsed.backup_type) return parsed.backup_type
  return 'full_backup'
}

function getBackupSource(parsed: BackupPayload) {
  if (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
    return {
      sourceType: 'data' as const,
      sections: parsed.data,
    }
  }

  if (parsed.tables && typeof parsed.tables === 'object' && !Array.isArray(parsed.tables)) {
    return {
      sourceType: 'tables' as const,
      sections: parsed.tables,
    }
  }

  return null
}

function getSectionInfo({
  key,
  sourceType,
  sections,
  errors,
}: {
  key: string
  sourceType: 'data' | 'tables'
  sections: Record<string, unknown>
  errors?: Record<string, string | null | undefined>
}) {
  const section = sections[key]

  if (!section) {
    return {
      key,
      table: key,
      included: false,
      count: 0,
      error: 'Missing from backup',
    }
  }

  if (sourceType === 'data') {
    const typedSection = section as BackupSection
    const rows = Array.isArray(typedSection.rows) ? typedSection.rows : []

    return {
      key,
      table: typedSection.table || key,
      included: Boolean(typedSection.included),
      count: Number(typedSection.count ?? rows.length ?? 0),
      error: typedSection.error,
    }
  }

  const rows = Array.isArray(section) ? section : []

  return {
    key,
    table: key,
    included: Array.isArray(section),
    count: rows.length,
    error: errors?.[key] ?? undefined,
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return jsonError('Unauthorized', 401)
    }

    const body = (await request.json()) as ValidateBody
    const backupText = String(body?.backupText ?? '').trim()

    if (!backupText) {
      return jsonError('Backup file is empty.')
    }

    let parsed: BackupPayload

    try {
      parsed = parseBackupText(backupText)
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : 'Backup file is not valid JSON.'
      )
    }

    if (!isLegacyBackup(parsed) && !isCurrentBackup(parsed)) {
      return jsonError('Backup file is not from this app.')
    }

    const version = getBackupVersion(parsed)

    if (version !== 1 && version !== 2) {
      return jsonError('Unsupported backup version.')
    }

    if (!parsed.user_id) {
      return jsonError('Backup file is missing a user_id.')
    }

    if (parsed.user_id !== user.id) {
      return jsonError(
        'This backup belongs to a different user and cannot be restored here.'
      )
    }

    const backupSource = getBackupSource(parsed)

    if (!backupSource) {
      return jsonError('Backup file is missing data sections.')
    }

    const warnings: string[] = []

    const sections = BACKUP_SECTION_KEYS.map((key) => {
      const sectionInfo = getSectionInfo({
        key,
        sourceType: backupSource.sourceType,
        sections: backupSource.sections,
        errors: parsed.errors,
      })

      if (
        REQUIRED_SECTION_KEYS.includes(key) &&
        (!sectionInfo.included || sectionInfo.count < 0)
      ) {
        warnings.push(`Missing section: ${key}`)
      }

      if (sectionInfo.error) {
        warnings.push(`${key}: ${sectionInfo.error}`)
      }

      return sectionInfo
    })

    const totalRowsExported = sections.reduce(
      (sum, section) => sum + Number(section.count ?? 0),
      0
    )

    const totalTablesIncluded = sections.filter(
      (section) => section.included
    ).length

    return NextResponse.json({
      ok: true,
      backup: {
        app: getBackupApp(parsed),
        type: getBackupType(parsed),
        version,
        exported_at: parsed.exported_at ?? null,
        user_id: parsed.user_id ?? null,
        file_name: body.fileName ?? null,
      },
      summary: {
        total_tables_attempted:
          Number(parsed.summary?.total_tables_attempted ?? sections.length),
        total_tables_included:
          Number(parsed.summary?.total_tables_included ?? totalTablesIncluded),
        total_rows_exported:
          Number(parsed.summary?.total_rows_exported ?? totalRowsExported),
      },
      sections,
      warnings,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Backup validation failed',
      },
      { status: 500 }
    )
  }
}
