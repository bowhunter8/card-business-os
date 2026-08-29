import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const DEFAULT_EBAY_DESCRIPTION_TEMPLATE = `{summary}

{details}

Card pictured is the exact card you will receive. Please review the photos carefully for condition. The card will be packaged securely for shipping.`

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('ebay_export_settings')
    .select('description_template')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const hasSavedTemplate =
    data !== null && typeof data.description_template === 'string'

  return NextResponse.json({
    description_template: hasSavedTemplate
      ? data.description_template
      : DEFAULT_EBAY_DESCRIPTION_TEMPLATE,
    is_default: !hasSavedTemplate,
  })
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('description_template' in body) ||
    typeof body.description_template !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Description template must be a string' },
      { status: 400 }
    )
  }

  const descriptionTemplate = body.description_template

  if (descriptionTemplate.length > 10000) {
    return NextResponse.json(
      { error: 'Description template must be 10,000 characters or fewer' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('ebay_export_settings')
    .upsert(
      {
        user_id: user.id,
        description_template: descriptionTemplate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('description_template')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    description_template: data.description_template,
    is_default: false,
  })
}

export async function DELETE() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('ebay_export_settings')
    .delete()
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    description_template: DEFAULT_EBAY_DESCRIPTION_TEMPLATE,
    is_default: true,
  })
}
