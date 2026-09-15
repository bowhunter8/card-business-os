'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type ChecklistRowEditInput = {
  checklistId: string
  itemId: string
  sectionId: string
  cardNumber: string
  playerName: string
  printedTeam: string
  parallelName: string
  variation: string
  rookieFlag: boolean
  autoFlag: boolean
  relicFlag: boolean
  serialFlag: boolean
  printRun: string
  notes: string
}

export type ChecklistRowEditResult =
  | {
      ok: true
      item: {
        id: string
        checklist_id: string
        section_id: string | null
        card_number: string | null
        player_name: string | null
        printed_team: string | null
        parallel_name: string | null
        variation: string | null
        rookie_flag: boolean | null
        auto_flag: boolean | null
        relic_flag: boolean | null
        serial_flag: boolean | null
        print_run: number | null
        quantity_required: number | null
        sort_order: number | null
        notes: string | null
      }
    }
  | {
      ok: false
      error: string
    }

function clean(value: unknown) {
  return String(value ?? '').trim()
}

export async function updateChecklistRowShared(
  input: ChecklistRowEditInput
): Promise<ChecklistRowEditResult> {
  const checklistId = clean(input.checklistId)
  const itemId = clean(input.itemId)
  const sectionId = clean(input.sectionId)
  const cardNumber = clean(input.cardNumber)
  const playerName = clean(input.playerName)
  const printedTeam = clean(input.printedTeam)
  const parallelName = clean(input.parallelName)
  const variation = clean(input.variation)
  const notes = clean(input.notes)
  const printRunRaw = clean(input.printRun)

  if (!checklistId || !itemId || !sectionId) {
    return {
      ok: false,
      error: 'Checklist ID, checklist row ID, and section are required.',
    }
  }

  if (!cardNumber && !playerName) {
    return {
      ok: false,
      error: 'Card number or player/item name is required.',
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return {
      ok: false,
      error: 'You must be signed in to edit checklist rows.',
    }
  }

  const { data: appUser, error: appUserError } = await supabase
    .from('app_users')
    .select('role, is_active')
    .eq('email', user.email)
    .maybeSingle()

  if (appUserError) {
    return {
      ok: false,
      error: appUserError.message,
    }
  }

  const isAdmin =
    appUser?.is_active === true &&
    clean(appUser?.role).toLowerCase() === 'admin'

  if (!isAdmin) {
    return {
      ok: false,
      error: 'Admin access is required to edit checklist rows.',
    }
  }

  const { data: existingRow, error: existingRowError } = await supabase
    .from('checklist_items')
    .select('id')
    .eq('id', itemId)
    .eq('checklist_id', checklistId)
    .maybeSingle()

  if (existingRowError) {
    return {
      ok: false,
      error: existingRowError.message,
    }
  }

  if (!existingRow) {
    return {
      ok: false,
      error: 'Checklist row could not be found.',
    }
  }

  const { data: validSection, error: sectionError } = await supabase
    .from('checklist_sections')
    .select('id')
    .eq('id', sectionId)
    .eq('checklist_id', checklistId)
    .maybeSingle()

  if (sectionError) {
    return {
      ok: false,
      error: sectionError.message,
    }
  }

  if (!validSection) {
    return {
      ok: false,
      error: 'The selected checklist section is invalid.',
    }
  }

  const parsedPrintRun =
    printRunRaw && Number.isFinite(Number(printRunRaw))
      ? Math.max(1, Math.trunc(Number(printRunRaw)))
      : null

  const { data: updatedRow, error: updateError } = await supabase
    .from('checklist_items')
    .update({
      section_id: sectionId,
      card_number: cardNumber || null,
      player_name: playerName || null,
      printed_team: printedTeam || null,
      parallel_name: parallelName || null,
      variation: variation || null,
      rookie_flag: Boolean(input.rookieFlag),
      auto_flag: Boolean(input.autoFlag),
      relic_flag: Boolean(input.relicFlag),
      serial_flag: Boolean(input.serialFlag),
      print_run: parsedPrintRun,
      notes: notes || null,
    })
    .eq('id', itemId)
    .eq('checklist_id', checklistId)
    .select(
      'id, checklist_id, section_id, card_number, player_name, printed_team, parallel_name, variation, rookie_flag, auto_flag, relic_flag, serial_flag, print_run, quantity_required, sort_order, notes'
    )
    .single()

  if (updateError || !updatedRow) {
    return {
      ok: false,
      error: updateError?.message || 'Unable to update checklist row.',
    }
  }

  const { data: peopleRows, error: peopleLoadError } = await supabase
    .from('checklist_item_people')
    .select('id, sort_order')
    .eq('checklist_item_id', itemId)
    .order('sort_order', { ascending: true })

  if (peopleLoadError) {
    return {
      ok: false,
      error: peopleLoadError.message,
    }
  }

  const primaryPerson = (peopleRows ?? [])[0]

  if (primaryPerson) {
    const { error: personUpdateError } = await supabase
      .from('checklist_item_people')
      .update({
        player_name: playerName || null,
        printed_team: printedTeam || null,
      })
      .eq('id', primaryPerson.id)

    if (personUpdateError) {
      return {
        ok: false,
        error: personUpdateError.message,
      }
    }
  } else if (playerName) {
    const { error: personInsertError } = await supabase
      .from('checklist_item_people')
      .insert({
        checklist_item_id: itemId,
        player_name: playerName,
        printed_team: printedTeam || null,
        franchise_id: null,
        sort_order: 1,
      })

    if (personInsertError) {
      return {
        ok: false,
        error: personInsertError.message,
      }
    }
  }

  const { error: touchError } = await supabase
    .from('checklists')
    .update({
      updated_at: new Date().toISOString(),
    })
    .eq('id', checklistId)

  if (touchError) {
    return {
      ok: false,
      error: touchError.message,
    }
  }

  revalidatePath('/app/checklists')
  revalidatePath(`/app/checklists/${checklistId}`)

  return {
    ok: true,
    item: updatedRow,
  }
}

export type ChecklistRowDeleteInput = {
  checklistId: string
  itemId: string
}

export type ChecklistRowDeleteResult =
  | {
      ok: true
      itemId: string
      label: string
    }
  | {
      ok: false
      error: string
    }

export async function deleteChecklistRowShared(
  input: ChecklistRowDeleteInput
): Promise<ChecklistRowDeleteResult> {
  const checklistId = clean(input.checklistId)
  const itemId = clean(input.itemId)

  if (!checklistId || !itemId) {
    return {
      ok: false,
      error: 'Checklist ID and checklist row ID are required.',
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return {
      ok: false,
      error: 'You must be signed in to delete checklist rows.',
    }
  }

  const { data: appUser, error: appUserError } = await supabase
    .from('app_users')
    .select('role, is_active')
    .eq('email', user.email)
    .maybeSingle()

  if (appUserError) {
    return {
      ok: false,
      error: appUserError.message,
    }
  }

  const isAdmin =
    appUser?.is_active === true &&
    clean(appUser?.role).toLowerCase() === 'admin'

  if (!isAdmin) {
    return {
      ok: false,
      error: 'Admin access is required to delete checklist rows.',
    }
  }

  const { data: existingRow, error: existingRowError } = await supabase
    .from('checklist_items')
    .select('id, card_number, player_name')
    .eq('id', itemId)
    .eq('checklist_id', checklistId)
    .maybeSingle()

  if (existingRowError) {
    return {
      ok: false,
      error: existingRowError.message,
    }
  }

  if (!existingRow) {
    return {
      ok: false,
      error: 'Checklist row could not be found.',
    }
  }

  const { data: savedMatches, error: savedMatchError } = await supabase
    .from('checklist_inventory_matches')
    .select('checklist_item_id')
    .eq('checklist_item_id', itemId)
    .limit(1)

  if (savedMatchError) {
    return {
      ok: false,
      error: savedMatchError.message,
    }
  }

  if ((savedMatches ?? []).length > 0) {
    return {
      ok: false,
      error:
        'This checklist row has saved inventory matches. Edit the row instead of deleting it so inventory links remain safe.',
    }
  }

  const { error: peopleDeleteError } = await supabase
    .from('checklist_item_people')
    .delete()
    .eq('checklist_item_id', itemId)

  if (peopleDeleteError) {
    return {
      ok: false,
      error: peopleDeleteError.message,
    }
  }

  const { error: deleteError } = await supabase
    .from('checklist_items')
    .delete()
    .eq('id', itemId)
    .eq('checklist_id', checklistId)

  if (deleteError) {
    return {
      ok: false,
      error: deleteError.message,
    }
  }

  const { error: touchError } = await supabase
    .from('checklists')
    .update({
      updated_at: new Date().toISOString(),
    })
    .eq('id', checklistId)

  if (touchError) {
    return {
      ok: false,
      error: touchError.message,
    }
  }

  revalidatePath('/app/checklists')
  revalidatePath(`/app/checklists/${checklistId}`)

  const label = [clean(existingRow.card_number), clean(existingRow.player_name)]
    .filter(Boolean)
    .join(' ')

  return {
    ok: true,
    itemId,
    label,
  }
}

