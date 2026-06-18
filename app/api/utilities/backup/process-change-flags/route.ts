import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ONE_HOUR_MS = 60 * 60 * 1000
const MAX_USERS_PER_RUN = 50
const MAX_FLAGS_PER_USER = 1000

const KEEP_SCHEDULED = 48
const KEEP_DAILY = 30
const KEEP_MONTHLY = 12

type AdminClient = ReturnType<typeof getAdminClient>

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin environment variables')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function buildUserBackupWithAdminClient(supabase: AdminClient, userId: string) {
  const [
    breaksRes,
    inventoryItemsRes,
    salesRes,
    expensesRes,
    shippingProfilesRes,
    taxYearSettingsRes,
    whatnotOrdersRes,
    whatnotSuggestionsRes,
    startingInventoryItemsRes,
    inventoryTransactionsRes,
  ] = await Promise.all([
    supabase.from('breaks').select('*').eq('user_id', userId),
    supabase.from('inventory_items').select('*').eq('user_id', userId),
    supabase.from('sales').select('*').eq('user_id', userId),
    supabase.from('expenses').select('*').eq('user_id', userId),
    supabase.from('shipping_profiles').select('*').eq('user_id', userId),
    supabase.from('tax_year_settings').select('*').eq('user_id', userId),
    supabase.from('whatnot_orders').select('*').eq('user_id', userId),
    supabase.from('whatnot_order_group_suggestions').select('*').eq('user_id', userId),
    supabase.from('starting_inventory_items').select('*').eq('user_id', userId),
    supabase.from('inventory_transactions').select('*').eq('user_id', userId),
  ])

  return {
    backup_type: 'card_business_os_full_user_backup',
    backup_version: 2,
    exported_at: new Date().toISOString(),
    user_id: userId,
    app_name: 'HITS',
    tables: {
      breaks: breaksRes.data ?? [],
      inventory_items: inventoryItemsRes.data ?? [],
      sales: salesRes.data ?? [],
      expenses: expensesRes.data ?? [],
      shipping_profiles: shippingProfilesRes.data ?? [],
      tax_year_settings: taxYearSettingsRes.data ?? [],
      whatnot_orders: whatnotOrdersRes.data ?? [],
      whatnot_order_group_suggestions: whatnotSuggestionsRes.data ?? [],
      starting_inventory_items: startingInventoryItemsRes.data ?? [],
      inventory_transactions: inventoryTransactionsRes.data ?? [],
    },
    summary: {
      breaks: breaksRes.data?.length ?? 0,
      inventory_items: inventoryItemsRes.data?.length ?? 0,
      sales: salesRes.data?.length ?? 0,
      expenses: expensesRes.data?.length ?? 0,
      shipping_profiles: shippingProfilesRes.data?.length ?? 0,
      tax_year_settings: taxYearSettingsRes.data?.length ?? 0,
      whatnot_orders: whatnotOrdersRes.data?.length ?? 0,
      whatnot_order_group_suggestions: whatnotSuggestionsRes.data?.length ?? 0,
      starting_inventory_items: startingInventoryItemsRes.data?.length ?? 0,
      inventory_transactions: inventoryTransactionsRes.data?.length ?? 0,
      total_records:
        (breaksRes.data?.length ?? 0) +
        (inventoryItemsRes.data?.length ?? 0) +
        (salesRes.data?.length ?? 0) +
        (expensesRes.data?.length ?? 0) +
        (shippingProfilesRes.data?.length ?? 0) +
        (taxYearSettingsRes.data?.length ?? 0) +
        (whatnotOrdersRes.data?.length ?? 0) +
        (whatnotSuggestionsRes.data?.length ?? 0) +
        (startingInventoryItemsRes.data?.length ?? 0) +
        (inventoryTransactionsRes.data?.length ?? 0),
    },
    errors: {
      breaks: breaksRes.error?.message ?? null,
      inventory_items: inventoryItemsRes.error?.message ?? null,
      sales: salesRes.error?.message ?? null,
      expenses: expensesRes.error?.message ?? null,
      shipping_profiles: shippingProfilesRes.error?.message ?? null,
      tax_year_settings: taxYearSettingsRes.error?.message ?? null,
      whatnot_orders: whatnotOrdersRes.error?.message ?? null,
      whatnot_order_group_suggestions: whatnotSuggestionsRes.error?.message ?? null,
      starting_inventory_items: startingInventoryItemsRes.error?.message ?? null,
      inventory_transactions: inventoryTransactionsRes.error?.message ?? null,
    },
  }
}

async function cleanupRestorePoints({
  supabase,
  userId,
  backupType,
  keepCount,
}: {
  supabase: AdminClient
  userId: string
  backupType: 'scheduled' | 'daily' | 'monthly'
  keepCount: number
}) {
  const { data, error } = await supabase
    .from('backup_restore_points')
    .select('id')
    .eq('user_id', userId)
    .eq('backup_type', backupType)
    .order('created_at', { ascending: false })

  if (error || !data || data.length <= keepCount) {
    return
  }

  const idsToDelete = data.slice(keepCount).map((row) => row.id)

  if (idsToDelete.length > 0) {
    await supabase.from('backup_restore_points').delete().in('id', idsToDelete)
  }
}

async function hasRestorePointSince({
  supabase,
  userId,
  backupType,
  since,
}: {
  supabase: AdminClient
  userId: string
  backupType: 'daily' | 'monthly'
  since: string
}) {
  const { data, error } = await supabase
    .from('backup_restore_points')
    .select('id')
    .eq('user_id', userId)
    .eq('backup_type', backupType)
    .gte('created_at', since)
    .limit(1)
    .maybeSingle()

  if (error) {
    return false
  }

  return Boolean(data?.id)
}

function startOfUtcDay(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function startOfUtcMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export async function GET() {
  try {
    const supabase = getAdminClient()
    const now = new Date()
    const isMidnightUtc = now.getUTCHours() === 0
    const isFirstOfMonthUtc = now.getUTCDate() === 1
    const utcDayStart = startOfUtcDay(now).toISOString()
    const utcMonthStart = startOfUtcMonth(now).toISOString()

    const { data: changedUsers, error: changedUsersError } = await supabase
      .from('restore_point_change_flags')
      .select('user_id')
      .is('processed_at', null)
      .order('changed_at', { ascending: true })
      .limit(MAX_USERS_PER_RUN)

    if (changedUsersError) {
      return NextResponse.json({ ok: false, error: changedUsersError.message }, { status: 500 })
    }

    const userIds = Array.from(
      new Set((changedUsers ?? []).map((row) => row.user_id).filter(Boolean))
    )

    if (userIds.length === 0) {
      return NextResponse.json({
        ok: true,
        processed_users: 0,
        created_restore_points: 0,
        message: 'No pending change flags found.',
      })
    }

    let createdRestorePoints = 0
    const results: Array<{
      user_id: string
      created: boolean
      backup_type?: string
      pending_flags?: number
      skipped_reason?: string
      error?: string
    }> = []

    for (const userId of userIds) {
      const { data: pendingFlags, error: pendingFlagsError } = await supabase
        .from('restore_point_change_flags')
        .select('id, source_table, action, changed_at')
        .eq('user_id', userId)
        .is('processed_at', null)
        .order('changed_at', { ascending: true })
        .limit(MAX_FLAGS_PER_USER)

      if (pendingFlagsError) {
        results.push({ user_id: userId, created: false, error: pendingFlagsError.message })
        continue
      }

      if (!pendingFlags || pendingFlags.length === 0) {
        results.push({ user_id: userId, created: false, skipped_reason: 'No pending flags found.' })
        continue
      }

      let backupType: 'scheduled' | 'daily' | 'monthly' = 'scheduled'

      if (
        isMidnightUtc &&
        isFirstOfMonthUtc &&
        !(await hasRestorePointSince({
          supabase,
          userId,
          backupType: 'monthly',
          since: utcMonthStart,
        }))
      ) {
        backupType = 'monthly'
      } else if (
        isMidnightUtc &&
        !(await hasRestorePointSince({
          supabase,
          userId,
          backupType: 'daily',
          since: utcDayStart,
        }))
      ) {
        backupType = 'daily'
      } else {
        const { data: latestRestorePoint, error: latestRestorePointError } = await supabase
          .from('backup_restore_points')
          .select('id, created_at, backup_type')
          .eq('user_id', userId)
          .in('backup_type', ['scheduled', 'daily', 'monthly'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (latestRestorePointError) {
          results.push({
            user_id: userId,
            created: false,
            pending_flags: pendingFlags.length,
            error: latestRestorePointError.message,
          })
          continue
        }

        if (latestRestorePoint?.created_at) {
          const latestTime = new Date(latestRestorePoint.created_at).getTime()
          const ageMs = Date.now() - latestTime

          if (ageMs < ONE_HOUR_MS) {
            results.push({
              user_id: userId,
              created: false,
              pending_flags: pendingFlags.length,
              skipped_reason: 'Recent restore point already exists.',
            })
            continue
          }
        }
      }

      const changedTables = Array.from(new Set(pendingFlags.map((flag) => flag.source_table)))
      const backup = await buildUserBackupWithAdminClient(supabase, userId)

      const backupWithMetadata = {
        ...backup,
        restore_point_metadata: {
          created_by: 'process-change-flags-cron',
          created_at: now.toISOString(),
          interval_hours: 1,
          checkpoint_kind: backupType,
          pending_change_count: pendingFlags.length,
          changed_tables: changedTables,
        },
      }

      const backupLabel =
        backupType === 'monthly'
          ? 'Monthly Restore Point'
          : backupType === 'daily'
            ? 'Daily Restore Point'
            : 'Scheduled Restore Point'

      const { error: insertRestorePointError } = await supabase
        .from('backup_restore_points')
        .insert({
          user_id: userId,
          backup_name: `${backupLabel} ${new Date().toLocaleString()}`,
          backup_type: backupType,
          backup_json: backupWithMetadata,
        })

      if (insertRestorePointError) {
        results.push({
          user_id: userId,
          created: false,
          pending_flags: pendingFlags.length,
          error: insertRestorePointError.message,
        })
        continue
      }

      const flagIds = pendingFlags.map((flag) => flag.id)

      const { error: updateFlagsError } = await supabase
        .from('restore_point_change_flags')
        .update({ processed_at: new Date().toISOString() })
        .in('id', flagIds)

      if (updateFlagsError) {
        results.push({
          user_id: userId,
          created: true,
          backup_type: backupType,
          pending_flags: pendingFlags.length,
          error: `Restore point created, but flags were not marked processed: ${updateFlagsError.message}`,
        })
        createdRestorePoints += 1
        continue
      }

      await cleanupRestorePoints({
        supabase,
        userId,
        backupType: 'scheduled',
        keepCount: KEEP_SCHEDULED,
      })

      await cleanupRestorePoints({
        supabase,
        userId,
        backupType: 'daily',
        keepCount: KEEP_DAILY,
      })

      await cleanupRestorePoints({
        supabase,
        userId,
        backupType: 'monthly',
        keepCount: KEEP_MONTHLY,
      })

      createdRestorePoints += 1

      results.push({
        user_id: userId,
        created: true,
        backup_type: backupType,
        pending_flags: pendingFlags.length,
      })
    }

    return NextResponse.json({
      ok: true,
      processed_users: userIds.length,
      created_restore_points: createdRestorePoints,
      retention: {
        scheduled_keep: KEEP_SCHEDULED,
        daily_keep: KEEP_DAILY,
        monthly_keep: KEEP_MONTHLY,
      },
      results,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unexpected error processing change flags.',
      },
      { status: 500 }
    )
  }
}

export async function POST() {
  return GET()
}