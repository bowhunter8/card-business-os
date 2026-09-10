import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PEOPLE_BATCH_SIZE = 100

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
      { ok: false, error: 'You must be signed in to load checklist players.' },
      { status: 401 }
    )
  }

  const { data: checklist, error: checklistError } = await supabase
    .from('checklists')
    .select('id')
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

  const itemIds: string[] = []
  let from = 0
  const ITEM_PAGE_SIZE = 500

  while (true) {
    const { data, error } = await supabase
      .from('checklist_items')
      .select('id')
      .eq('checklist_id', id)
      .order('sort_order', { ascending: true })
      .range(from, from + ITEM_PAGE_SIZE - 1)

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    const batch = data ?? []

    for (const row of batch) {
      itemIds.push(row.id)
    }

    if (batch.length < ITEM_PAGE_SIZE) break
    from += ITEM_PAGE_SIZE
  }

  const people: Record<string, unknown>[] = []

  for (
    let index = 0;
    index < itemIds.length;
    index += PEOPLE_BATCH_SIZE
  ) {
    const batchIds = itemIds.slice(index, index + PEOPLE_BATCH_SIZE)

    const { data, error } = await supabase
      .from('checklist_item_people')
      .select(
        'checklist_item_id, player_name, printed_team, sort_order'
      )
      .in('checklist_item_id', batchIds)
      .order('sort_order', { ascending: true })

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    people.push(...(data ?? []))
  }

  return NextResponse.json({
    ok: true,
    people,
  })
}