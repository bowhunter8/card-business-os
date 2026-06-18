import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function toMoneyNumber(value: unknown) {
  const numberValue = Number(value)

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return 0
  }

  return Math.round(numberValue * 100) / 100
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('shipping_profiles')
    .select('id, name, shipping_charged_default, supplies_cost_default')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Profile not found' },
      { status: 404 }
    )
  }

  return NextResponse.json(data)
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)

  const name = String(body?.name || '').trim()

  if (!name) {
    return NextResponse.json(
      { error: 'Profile name is required.' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('shipping_profiles')
    .update({
      name,
      shipping_charged_default: toMoneyNumber(body?.shipping_charged_default),
      supplies_cost_default: toMoneyNumber(body?.supplies_cost_default),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, name, shipping_charged_default, supplies_cost_default')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update shipping profile' },
      { status: 500 }
    )
  }

  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('shipping_profiles')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}