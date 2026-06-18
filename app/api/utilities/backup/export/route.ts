import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildUserBackup } from '@/lib/restore-points/buildUserBackup'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const backup = await buildUserBackup(user.id)

  const fileDate = new Date().toISOString().slice(0, 10)

  return new NextResponse(JSON.stringify(backup, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="hits-backup-${fileDate}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}