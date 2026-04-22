import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type BackupSection<T> = {
  table: string
  included: boolean
  count: number
  rows: T[]
  error?: string
}

async function exportUserTable<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  userId: string
) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)

  if (error) {
    return {
      table,
      included: false,
      count: 0,
      rows: [] as T[],
      error: error.message,
    } satisfies BackupSection<T>
  }

  return {
    table,
    included: true,
    count: data?.length ?? 0,
    rows: (data ?? []) as T[],
  } satisfies BackupSection<T>
}

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [
      breaks,
      inventoryItems,
      sales,
      expenses,
      shippingProfiles,
    ] = await Promise.all([
      exportUserTable(supabase, 'breaks', user.id),
      exportUserTable(supabase, 'inventory_items', user.id),
      exportUserTable(supabase, 'sales', user.id),
      exportUserTable(supabase, 'expenses', user.id),
      exportUserTable(supabase, 'shipping_profiles', user.id),
    ])

    const exportedAt = new Date().toISOString()
    const safeDate = exportedAt.slice(0, 10)

    const backupPayload = {
      app: 'card-business-os',
      type: 'full_backup',
      version: 1,
      exported_at: exportedAt,
      user_id: user.id,
      summary: {
        total_tables_attempted: 5,
        total_tables_included: [
          breaks,
          inventoryItems,
          sales,
          expenses,
          shippingProfiles,
        ].filter((section) => section.included).length,
        total_rows_exported:
          breaks.count +
          inventoryItems.count +
          sales.count +
          expenses.count +
          shippingProfiles.count,
      },
      data: {
        breaks,
        inventory_items: inventoryItems,
        sales,
        expenses,
        shipping_profiles: shippingProfiles,
      },
    }

    return new NextResponse(JSON.stringify(backupPayload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="card-business-backup-${safeDate}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Backup export failed',
      },
      { status: 500 }
    )
  }
}