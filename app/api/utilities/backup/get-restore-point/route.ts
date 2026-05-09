import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
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
  const id = String(url.searchParams.get('id') ?? '').trim()

  if (!id) {
    return jsonError('Missing restore point id.')
  }

  const { data, error } = await supabase
    .from('backup_restore_points')
    .select('id, created_at, backup_name, backup_type, backup_json')
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return jsonError(error.message, 500)
  }

  if (!data) {
    return jsonError('Restore point was not found.', 404)
  }

  return NextResponse.json({
    ok: true,
    restorePoint: data,
  })
}
