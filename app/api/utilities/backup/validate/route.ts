import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type BackupSection = {
  table?: string
  included?: boolean
  count?: number
  rows?: unknown[]
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

type ValidateBody = {
  fileName?: string
  backupText?: string
}

const REQUIRED_SECTION_KEYS = [
  'breaks',
  'inventory_items',
  'sales',
  'expenses',
  'shipping_profiles',
]

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as ValidateBody
    const backupText = String(body?.backupText ?? '').trim()

    if (!backupText) {
      return NextResponse.json(
        { error: 'Backup file is empty.' },
        { status: 400 }
      )
    }

    let parsed: BackupPayload

    try {
      parsed = JSON.parse(backupText) as BackupPayload
    } catch {
      return NextResponse.json(
        { error: 'Backup file is not valid JSON.' },
        { status: 400 }
      )
    }

    if (parsed.app !== 'card-business-os') {
      return NextResponse.json(
        { error: 'Backup file is not from this app.' },
        { status: 400 }
      )
    }

    if (parsed.type !== 'full_backup') {
      return NextResponse.json(
        { error: 'Backup file is not a full backup export.' },
        { status: 400 }
      )
    }

    if (parsed.version !== 1) {
      return NextResponse.json(
        { error: 'Unsupported backup version.' },
        { status: 400 }
      )
    }

    if (!parsed.user_id) {
      return NextResponse.json(
        { error: 'Backup file is missing a user_id.' },
        { status: 400 }
      )
    }

    if (parsed.user_id !== user.id) {
      return NextResponse.json(
        { error: 'This backup belongs to a different user and cannot be restored here.' },
        { status: 400 }
      )
    }

    if (!parsed.data || typeof parsed.data !== 'object') {
      return NextResponse.json(
        { error: 'Backup file is missing data sections.' },
        { status: 400 }
      )
    }

    const warnings: string[] = []
    const sections = REQUIRED_SECTION_KEYS.map((key) => {
      const section = parsed.data?.[key]

      if (!section) {
        warnings.push(`Missing section: ${key}`)
        return {
          key,
          table: key,
          included: false,
          count: 0,
          error: 'Missing from backup',
        }
      }

      const rows = Array.isArray(section.rows) ? section.rows : []

      return {
        key,
        table: section.table || key,
        included: Boolean(section.included),
        count: Number(section.count ?? rows.length ?? 0),
        error: section.error,
      }
    })

    const totalRowsExported = sections.reduce(
      (sum, section) => sum + Number(section.count ?? 0),
      0
    )

    return NextResponse.json({
      ok: true,
      backup: {
        app: parsed.app ?? '—',
        type: parsed.type ?? '—',
        version: parsed.version ?? 0,
        exported_at: parsed.exported_at ?? null,
        user_id: parsed.user_id ?? null,
      },
      summary: {
        total_tables_attempted:
          Number(parsed.summary?.total_tables_attempted ?? sections.length),
        total_tables_included: sections.filter((section) => section.included).length,
        total_rows_exported:
          Number(parsed.summary?.total_rows_exported ?? totalRowsExported),
      },
      sections,
      warnings,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Backup validation failed',
      },
      { status: 500 }
    )
  }
}