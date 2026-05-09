import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

function clampLimit(value: string | null) {
  const parsed = Number(value ?? 25)

  if (!Number.isFinite(parsed)) return 25
  if (parsed < 1) return 1
  if (parsed > 100) return 100

  return Math.floor(parsed)
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return jsonError('Unauthorized', 401)
  }

  const url = new URL(request.url)
  const limit = clampLimit(url.searchParams.get('limit'))

  const { data, error } = await supabase
    .from('backup_restore_points')
    .select('id, created_at, backup_name, backup_type')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return jsonError(error.message, 500)
  }

  const restorePoints = (data ?? []).map((point) => ({
    id: point.id,
    created_at: point.created_at,
    backup_name: point.backup_name,
    backup_type: point.backup_type,
    backup_summary: null,
    total_records: null,
    backup_size_bytes: null,
  }))

  return NextResponse.json(
    {
      ok: true,
      restorePoints,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
