import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 500

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'You must be signed in to load a checklist.' },
      { status: 401 }
    )
  }

  const { data: checklist, error: checklistError } = await supabase
    .from('checklists')
    .select('id, name, year, manufacturer, brand, product_name, sport')
    .eq('id', id)
    .or(`visibility.eq.global,owner_user_id.eq.${user.id}`)
    .maybeSingle()

  if (checklistError) {
    return NextResponse.json(
      { ok: false, error: checklistError.message },
      { status: 500 }
    )
  }

  if (!checklist) {
    return NextResponse.json(
      { ok: false, error: 'Checklist not found.' },
      { status: 404 }
    )
  }

  const { data: sections, error: sectionsError } = await supabase
    .from('checklist_sections')
    .select('id, checklist_id, name, sort_order')
    .eq('checklist_id', id)
    .order('sort_order', { ascending: true })

  if (sectionsError) {
    return NextResponse.json(
      { ok: false, error: sectionsError.message },
      { status: 500 }
    )
  }

  const items: Record<string, unknown>[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('checklist_items')
      .select(
        'id, checklist_id, section_id, card_number, player_name, printed_team, parallel_name, variation, rookie_flag, auto_flag, relic_flag, serial_flag, print_run, quantity_required, sort_order, notes'
      )
      .eq('checklist_id', id)
      .order('sort_order', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    const batch = data ?? []
    items.push(...batch)

    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return NextResponse.json({
    ok: true,
    checklist,
    sections: sections ?? [],
    items,
  })
}
