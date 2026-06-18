import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    keyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0,
  })
}