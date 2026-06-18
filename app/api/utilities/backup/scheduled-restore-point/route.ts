import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAutomaticRestorePoint } from '@/lib/restore-points/createAutomaticRestorePoint'

const TWO_HOURS_MS = 2 * 60 * 60 * 1000

async function handleScheduledRestorePoint() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { data: pendingFlags, error: flagsError } = await supabase
    .from('restore_point_change_flags')
    .select('id, source_table, action, changed_at')
    .eq('user_id', user.id)
    .is('processed_at', null)
    .order('changed_at', { ascending: true })
    .limit(500)

  if (flagsError) {
    return NextResponse.json({ ok: false, error: flagsError.message }, { status: 500 })
  }

  if (!pendingFlags || pendingFlags.length === 0) {
    return NextResponse.json({
      ok: true,
      created: false,
      message: 'No pending data changes found.',
    })
  }

  const { data: latestRestorePoint, error: latestError } = await supabase
    .from('backup_restore_points')
    .select('id, created_at, backup_type')
    .eq('user_id', user.id)
    .in('backup_type', ['automatic', 'scheduled'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestError) {
    return NextResponse.json({ ok: false, error: latestError.message }, { status: 500 })
  }

  if (latestRestorePoint?.created_at) {
    const latestTime = new Date(latestRestorePoint.created_at).getTime()
    const ageMs = Date.now() - latestTime

    if (ageMs < TWO_HOURS_MS) {
      return NextResponse.json({
        ok: true,
        created: false,
        message: 'Pending changes found, but a recent restore point already exists.',
        pending_changes: pendingFlags.length,
        latest_restore_point: latestRestorePoint.created_at,
      })
    }
  }

  const changedTables = Array.from(new Set(pendingFlags.map((flag) => flag.source_table)))

  const result = await createAutomaticRestorePoint({
    userId: user.id,
    backupName: `Scheduled Restore Point ${new Date().toLocaleString()}`,
    backupType: 'scheduled',
    metadata: {
      source: 'scheduled-restore-point-route',
      interval_hours: 2,
      pending_change_count: pendingFlags.length,
      changed_tables: changedTables,
    },
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }

  const flagIds = pendingFlags.map((flag) => flag.id)

  const { error: updateFlagsError } = await supabase
    .from('restore_point_change_flags')
    .update({ processed_at: new Date().toISOString() })
    .in('id', flagIds)

  if (updateFlagsError) {
    return NextResponse.json(
      {
        ok: true,
        created: true,
        warning: `Restore point created, but flags were not marked processed: ${updateFlagsError.message}`,
      },
      { status: 200 }
    )
  }

  return NextResponse.json({
    ok: true,
    created: true,
    message: 'Scheduled restore point created from pending data changes.',
    pending_changes_processed: pendingFlags.length,
    changed_tables: changedTables,
  })
}

export async function POST() {
  return handleScheduledRestorePoint()
}

export async function GET() {
  return handleScheduledRestorePoint()
}