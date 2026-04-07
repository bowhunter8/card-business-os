import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
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
    .eq('user_id', user.id)
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  const name =
    typeof body.name === 'string'
      ? body.name.trim()
      : ''

  const shippingChargedDefault =
    body.shipping_charged_default === '' ||
    body.shipping_charged_default === null ||
    body.shipping_charged_default === undefined
      ? 0
      : Number(body.shipping_charged_default)

  const suppliesCostDefault =
    body.supplies_cost_default === '' ||
    body.supplies_cost_default === null ||
    body.supplies_cost_default === undefined
      ? 0
      : Number(body.supplies_cost_default)

  if (!name) {
    return NextResponse.json(
      { error: 'Profile name is required' },
      { status: 400 }
    )
  }

  if (Number.isNaN(shippingChargedDefault) || Number.isNaN(suppliesCostDefault)) {
    return NextResponse.json(
      { error: 'Shipping charged default and supplies cost default must be valid numbers' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('shipping_profiles')
    .insert({
      user_id: user.id,
      name,
      shipping_charged_default: shippingChargedDefault,
      supplies_cost_default: suppliesCostDefault,
    })
    .select('id, name, shipping_charged_default, supplies_cost_default')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}