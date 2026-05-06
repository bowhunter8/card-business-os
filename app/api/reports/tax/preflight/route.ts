import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function clampYear(raw?: string | null) {
  const currentYear = new Date().getFullYear()
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > currentYear + 1) {
    return currentYear
  }

  return Math.floor(parsed)
}

export async function GET(request: NextRequest) {
  const year = clampYear(request.nextUrl.searchParams.get('year'))

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        locked: false,
        message: 'Unauthorized',
      },
      { status: 401 }
    )
  }

  const { data, error } = await supabase
    .from('tax_year_settings')
    .select('ending_inventory_snapshot, ending_inventory_item_count, ending_inventory_locked_at')
    .eq('user_id', user.id)
    .eq('tax_year', year)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        locked: false,
        message: error.message,
      },
      { status: 500 }
    )
  }

  const locked = data?.ending_inventory_snapshot != null

  return NextResponse.json({
    ok: true,
    year,
    locked,
    endingInventorySnapshot: data?.ending_inventory_snapshot ?? null,
    endingInventoryItemCount: data?.ending_inventory_item_count ?? null,
    endingInventoryLockedAt: data?.ending_inventory_locked_at ?? null,
    message: locked
      ? 'Ending inventory is locked for this tax year.'
      : 'Ending inventory is not locked for this tax year.',
  })
}
