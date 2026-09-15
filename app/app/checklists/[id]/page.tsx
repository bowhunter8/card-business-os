import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import ChecklistBrowser from '@/app/components/ChecklistBrowser'
import ChecklistProblemReport from '@/app/components/ChecklistProblemReport'

type ChecklistRow = {
  id: string
  owner_user_id: string | null
  visibility: string
  sport: string | null
  year: string | null
  manufacturer: string | null
  brand: string | null
  product_name: string | null
  name: string
  source_type: string | null
  source_reference: string | null
  verified: boolean
  is_active: boolean
  superseded_by_checklist_id: string | null
  superseded_at: string | null
  supersede_reason: string | null
  notes: string | null
  created_at: string
}

type ChecklistSectionRow = {
  id: string
  name: string
  sort_order: number | null
}

type ChecklistItemAdminRow = {
  id: string
  section_id: string
  card_number: string | null
  player_name: string | null
  printed_team: string | null
  parallel_name: string | null
  variation: string | null
  rookie_flag: boolean
  auto_flag: boolean
  relic_flag: boolean
  serial_flag: boolean
  print_run: number | null
  quantity_required: number | null
  sort_order: number | null
  notes: string | null
}

type PageProps = {
  params: Promise<{
    id: string
  }>
  searchParams: Promise<{
    buildSuccess?: string | string[]
    buildError?: string | string[]
    editSuccess?: string | string[]
    editError?: string | string[]
    rowSearch?: string | string[]
  }>
}

function clean(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function checklistMeta(checklist: ChecklistRow) {
  const parts = [
    clean(checklist.year),
    clean(checklist.manufacturer),
    clean(checklist.brand),
    clean(checklist.product_name),
  ].filter(Boolean)

  return Array.from(new Set(parts)).join(' • ')
}

export default async function ChecklistDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const queryParams = await searchParams

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: appUserData } = await supabase
    .from('app_users')
    .select('role, is_active')
    .eq('email', user.email ?? '')
    .maybeSingle()

  const isAdmin =
    appUserData?.is_active === true &&
    clean(appUserData?.role).toLowerCase() === 'admin'

  const { data: checklistData, error: checklistError } = await supabase
    .from('checklists')
    .select(
      'id, owner_user_id, visibility, sport, year, manufacturer, brand, product_name, name, source_type, source_reference, verified, is_active, superseded_by_checklist_id, superseded_at, supersede_reason, notes, created_at'
    )
    .eq('id', id)
    .maybeSingle()

  if (checklistError) {
    throw new Error(`Unable to load checklist: ${checklistError.message}`)
  }

  if (!checklistData) notFound()

  const checklist = checklistData as ChecklistRow

  const { data: adminChecklistOptionsData } = isAdmin
    ? await supabase
        .from('checklists')
        .select('id, year, manufacturer, brand, product_name, name')
        .eq('is_active', true)
        .neq('id', checklist.id)
        .order('year', { ascending: false })
        .order('name', { ascending: true })
    : { data: [] }

  const adminChecklistOptions = adminChecklistOptionsData ?? []
  const rowSearch = clean(firstParam(queryParams.rowSearch))
  const meta = checklistMeta(checklist)

  const { data: adminSectionsData } = isAdmin
    ? await supabase
        .from('checklist_sections')
        .select('id, name, sort_order')
        .eq('checklist_id', checklist.id)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
    : { data: [] }

  const adminSections = (adminSectionsData ?? []) as ChecklistSectionRow[]

  let adminRows: ChecklistItemAdminRow[] = []

  if (isAdmin) {
    let rowsQuery = supabase
      .from('checklist_items')
      .select(
        'id, section_id, card_number, player_name, printed_team, parallel_name, variation, rookie_flag, auto_flag, relic_flag, serial_flag, print_run, quantity_required, sort_order, notes'
      )
      .eq('checklist_id', checklist.id)

    if (rowSearch) {
      const escaped = rowSearch.replace(/[%_,()]/g, ' ')
      rowsQuery = rowsQuery.or(
        `card_number.ilike.%${escaped}%,player_name.ilike.%${escaped}%,printed_team.ilike.%${escaped}%,parallel_name.ilike.%${escaped}%,variation.ilike.%${escaped}%,notes.ilike.%${escaped}%`
      )
    }

    const { data: adminRowsData, error: adminRowsError } = await rowsQuery
      .order('sort_order', { ascending: true })
      .limit(rowSearch ? 100 : 30)

    if (adminRowsError) {
      throw new Error(
        `Unable to load checklist rows for editing: ${adminRowsError.message}`
      )
    }

    adminRows = (adminRowsData ?? []) as ChecklistItemAdminRow[]
  }


  async function requireAdminActionUser() {
    'use server'

    const actionSupabase = await createClient()
    const {
      data: { user: actionUser },
    } = await actionSupabase.auth.getUser()

    if (!actionUser?.email) redirect('/login')

    const { data: actionAppUser } = await actionSupabase
      .from('app_users')
      .select('role, is_active')
      .eq('email', actionUser.email)
      .maybeSingle()

    const actionIsAdmin =
      actionAppUser?.is_active === true &&
      clean(actionAppUser?.role).toLowerCase() === 'admin'

    if (!actionIsAdmin) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'Admin access is required to edit checklist rows.'
        )}`
      )
    }

    return actionSupabase
  }

  async function touchChecklistAfterRowChange(
    actionSupabase: Awaited<ReturnType<typeof createClient>>
  ) {
    'use server'

    const { error } = await actionSupabase
      .from('checklists')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', checklist.id)

    if (error) {
      throw new Error(error.message)
    }
  }

  async function addChecklistRowAction(formData: FormData) {
    'use server'

    const actionSupabase = await requireAdminActionUser()

    const sectionId = clean(String(formData.get('section_id') ?? ''))
    const cardNumber = clean(String(formData.get('card_number') ?? ''))
    const playerName = clean(String(formData.get('player_name') ?? ''))
    const printedTeam = clean(String(formData.get('printed_team') ?? ''))
    const parallelName = clean(String(formData.get('parallel_name') ?? ''))
    const variation = clean(String(formData.get('variation') ?? ''))
    const notes = clean(String(formData.get('notes') ?? ''))
    const printRunRaw = clean(String(formData.get('print_run') ?? ''))

    if (!sectionId) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'Choose a section before adding a checklist row.'
        )}`
      )
    }

    if (!cardNumber && !playerName) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'Card number or player/item name is required.'
        )}`
      )
    }

    const { data: validSection, error: sectionError } = await actionSupabase
      .from('checklist_sections')
      .select('id')
      .eq('id', sectionId)
      .eq('checklist_id', checklist.id)
      .maybeSingle()

    if (sectionError || !validSection) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          sectionError?.message || 'The selected checklist section is invalid.'
        )}`
      )
    }

    const { data: lastRow } = await actionSupabase
      .from('checklist_items')
      .select('sort_order')
      .eq('checklist_id', checklist.id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextSortOrder = Math.max(0, Number(lastRow?.sort_order ?? 0)) + 1
    const parsedPrintRun =
      printRunRaw && Number.isFinite(Number(printRunRaw))
        ? Math.max(1, Math.trunc(Number(printRunRaw)))
        : null

    const { data: insertedRow, error: insertError } = await actionSupabase
      .from('checklist_items')
      .insert({
        checklist_id: checklist.id,
        section_id: sectionId,
        card_number: cardNumber || null,
        player_name: playerName || null,
        printed_team: printedTeam || null,
        franchise_id: null,
        parallel_name: parallelName || null,
        variation: variation || null,
        rookie_flag: String(formData.get('rookie_flag') ?? '') === 'on',
        auto_flag: String(formData.get('auto_flag') ?? '') === 'on',
        relic_flag: String(formData.get('relic_flag') ?? '') === 'on',
        serial_flag: String(formData.get('serial_flag') ?? '') === 'on',
        print_run: parsedPrintRun,
        quantity_required: 1,
        sort_order: nextSortOrder,
        notes: notes || null,
      })
      .select('id')
      .single()

    if (insertError || !insertedRow) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          insertError?.message || 'Unable to add checklist row.'
        )}`
      )
    }

    if (playerName) {
      const { error: personInsertError } = await actionSupabase
        .from('checklist_item_people')
        .insert({
          checklist_item_id: insertedRow.id,
          player_name: playerName,
          printed_team: printedTeam || null,
          franchise_id: null,
          sort_order: 1,
        })

      if (personInsertError) {
        await actionSupabase
          .from('checklist_items')
          .delete()
          .eq('id', insertedRow.id)
          .eq('checklist_id', checklist.id)

        redirect(
          `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
            personInsertError.message
          )}`
        )
      }
    }

    try {
      await touchChecklistAfterRowChange(actionSupabase)
    } catch (error) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          error instanceof Error ? error.message : 'Unable to refresh checklist state.'
        )}`
      )
    }

    revalidatePath(`/app/checklists/${checklist.id}`)

    redirect(
      `/app/checklists/${checklist.id}?editSuccess=${encodeURIComponent(
        'Checklist row added.'
      )}&rowSearch=${encodeURIComponent(cardNumber || playerName)}#admin-row-editor`
    )
  }

  async function updateChecklistRowAction(formData: FormData) {
    'use server'

    const actionSupabase = await requireAdminActionUser()

    const itemId = clean(String(formData.get('item_id') ?? ''))
    const sectionId = clean(String(formData.get('section_id') ?? ''))
    const cardNumber = clean(String(formData.get('card_number') ?? ''))
    const playerName = clean(String(formData.get('player_name') ?? ''))
    const printedTeam = clean(String(formData.get('printed_team') ?? ''))
    const parallelName = clean(String(formData.get('parallel_name') ?? ''))
    const variation = clean(String(formData.get('variation') ?? ''))
    const notes = clean(String(formData.get('notes') ?? ''))
    const printRunRaw = clean(String(formData.get('print_run') ?? ''))
    const currentSearch = clean(String(formData.get('current_search') ?? ''))

    if (!itemId || !sectionId) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'Checklist row ID and section are required.'
        )}`
      )
    }

    if (!cardNumber && !playerName) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'Card number or player/item name is required.'
        )}`
      )
    }

    const { data: existingRow, error: existingError } = await actionSupabase
      .from('checklist_items')
      .select('id')
      .eq('id', itemId)
      .eq('checklist_id', checklist.id)
      .maybeSingle()

    if (existingError || !existingRow) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          existingError?.message || 'Checklist row could not be found.'
        )}`
      )
    }

    const parsedPrintRun =
      printRunRaw && Number.isFinite(Number(printRunRaw))
        ? Math.max(1, Math.trunc(Number(printRunRaw)))
        : null

    const { error: updateError } = await actionSupabase
      .from('checklist_items')
      .update({
        section_id: sectionId,
        card_number: cardNumber || null,
        player_name: playerName || null,
        printed_team: printedTeam || null,
        parallel_name: parallelName || null,
        variation: variation || null,
        rookie_flag: String(formData.get('rookie_flag') ?? '') === 'on',
        auto_flag: String(formData.get('auto_flag') ?? '') === 'on',
        relic_flag: String(formData.get('relic_flag') ?? '') === 'on',
        serial_flag: String(formData.get('serial_flag') ?? '') === 'on',
        print_run: parsedPrintRun,
        notes: notes || null,
      })
      .eq('id', itemId)
      .eq('checklist_id', checklist.id)

    if (updateError) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          updateError.message
        )}`
      )
    }

    const { data: peopleRows, error: peopleLoadError } = await actionSupabase
      .from('checklist_item_people')
      .select('id, sort_order')
      .eq('checklist_item_id', itemId)
      .order('sort_order', { ascending: true })

    if (peopleLoadError) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          peopleLoadError.message
        )}`
      )
    }

    const primaryPerson = (peopleRows ?? [])[0]

    if (primaryPerson) {
      const { error: personUpdateError } = await actionSupabase
        .from('checklist_item_people')
        .update({
          player_name: playerName || null,
          printed_team: printedTeam || null,
        })
        .eq('id', primaryPerson.id)

      if (personUpdateError) {
        redirect(
          `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
            personUpdateError.message
          )}`
        )
      }
    } else if (playerName) {
      const { error: personInsertError } = await actionSupabase
        .from('checklist_item_people')
        .insert({
          checklist_item_id: itemId,
          player_name: playerName,
          printed_team: printedTeam || null,
          franchise_id: null,
          sort_order: 1,
        })

      if (personInsertError) {
        redirect(
          `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
            personInsertError.message
          )}`
        )
      }
    }

    try {
      await touchChecklistAfterRowChange(actionSupabase)
    } catch (error) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          error instanceof Error ? error.message : 'Unable to refresh checklist state.'
        )}`
      )
    }

    revalidatePath(`/app/checklists/${checklist.id}`)

    const searchSuffix = currentSearch
      ? `&rowSearch=${encodeURIComponent(currentSearch)}`
      : ''

    redirect(
      `/app/checklists/${checklist.id}?editSuccess=${encodeURIComponent(
        'Checklist row updated.'
      )}${searchSuffix}#admin-row-editor`
    )
  }

  async function deleteChecklistRowAction(formData: FormData) {
    'use server'

    const actionSupabase = await requireAdminActionUser()

    const itemId = clean(String(formData.get('item_id') ?? ''))
    const currentSearch = clean(String(formData.get('current_search') ?? ''))

    if (!itemId) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'Checklist row ID is required.'
        )}`
      )
    }

    const { data: existingRow, error: existingError } = await actionSupabase
      .from('checklist_items')
      .select('id, card_number, player_name')
      .eq('id', itemId)
      .eq('checklist_id', checklist.id)
      .maybeSingle()

    if (existingError || !existingRow) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          existingError?.message || 'Checklist row could not be found.'
        )}`
      )
    }

    const { data: savedMatches, error: savedMatchError } = await actionSupabase
      .from('checklist_inventory_matches')
      .select('checklist_item_id')
      .eq('checklist_item_id', itemId)
      .limit(1)

    if (savedMatchError) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          savedMatchError.message
        )}`
      )
    }

    if ((savedMatches ?? []).length > 0) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'This checklist row has saved inventory matches. Edit the row instead of deleting it so inventory links remain safe.'
        )}&rowSearch=${encodeURIComponent(currentSearch)}#admin-row-editor`
      )
    }

    const { error: peopleDeleteError } = await actionSupabase
      .from('checklist_item_people')
      .delete()
      .eq('checklist_item_id', itemId)

    if (peopleDeleteError) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          peopleDeleteError.message
        )}`
      )
    }

    const { error: deleteError } = await actionSupabase
      .from('checklist_items')
      .delete()
      .eq('id', itemId)
      .eq('checklist_id', checklist.id)

    if (deleteError) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          deleteError.message
        )}`
      )
    }

    try {
      await touchChecklistAfterRowChange(actionSupabase)
    } catch (error) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          error instanceof Error ? error.message : 'Unable to refresh checklist state.'
        )}`
      )
    }

    revalidatePath(`/app/checklists/${checklist.id}`)

    redirect(
      `/app/checklists/${checklist.id}?editSuccess=${encodeURIComponent(
        `Checklist row deleted: ${clean(existingRow.card_number)} ${clean(
          existingRow.player_name
        )}`.trim()
      )}&rowSearch=${encodeURIComponent(currentSearch)}#admin-row-editor`
    )
  }

  async function updateChecklistMetadataAction(formData: FormData) {
    'use server'

    const actionSupabase = await createClient()
    const {
      data: { user: actionUser },
    } = await actionSupabase.auth.getUser()

    if (!actionUser?.email) redirect('/login')

    const { data: actionAppUser } = await actionSupabase
      .from('app_users')
      .select('role, is_active')
      .eq('email', actionUser.email)
      .maybeSingle()

    const actionIsAdmin =
      actionAppUser?.is_active === true &&
      clean(actionAppUser?.role).toLowerCase() === 'admin'

    if (!actionIsAdmin) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'Admin access is required to edit checklist metadata.'
        )}`
      )
    }

    const nextName = clean(String(formData.get('name') ?? ''))
    const nextYear = clean(String(formData.get('year') ?? ''))
    const nextManufacturer = clean(String(formData.get('manufacturer') ?? ''))
    const nextBrand = clean(String(formData.get('brand') ?? ''))
    const nextProductName = clean(String(formData.get('product_name') ?? ''))

    if (!nextName) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'Checklist name is required.'
        )}`
      )
    }

    const { error: updateError } = await actionSupabase
      .from('checklists')
      .update({
        name: nextName,
        year: nextYear || null,
        manufacturer: nextManufacturer || null,
        brand: nextBrand || null,
        product_name: nextProductName || null,
      })
      .eq('id', checklist.id)

    if (updateError) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          updateError.message
        )}`
      )
    }

    revalidatePath('/app/checklists')
    revalidatePath(`/app/checklists/${checklist.id}`)

    redirect(
      `/app/checklists/${checklist.id}?editSuccess=${encodeURIComponent(
        'Checklist metadata updated.'
      )}#checklist-browser`
    )
  }


  async function updateChecklistLibraryStateAction(formData: FormData) {
    'use server'

    const actionSupabase = await createClient()
    const {
      data: { user: actionUser },
    } = await actionSupabase.auth.getUser()

    if (!actionUser?.email) redirect('/login')

    const { data: actionAppUser } = await actionSupabase
      .from('app_users')
      .select('role, is_active')
      .eq('email', actionUser.email)
      .maybeSingle()

    const actionIsAdmin =
      actionAppUser?.is_active === true &&
      clean(actionAppUser?.role).toLowerCase() === 'admin'

    if (!actionIsAdmin) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'Admin access is required to manage checklist library settings.'
        )}`
      )
    }

    const nextVisibility =
      clean(String(formData.get('visibility') ?? 'private')) === 'global'
        ? 'global'
        : 'private'
    const nextVerified = String(formData.get('verified') ?? '') === 'true'

    const { error } = await actionSupabase
      .from('checklists')
      .update({
        visibility: nextVisibility,
        verified: nextVerified,
      })
      .eq('id', checklist.id)

    if (error) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          error.message
        )}`
      )
    }

    revalidatePath('/app/checklists')
    revalidatePath(`/app/checklists/${checklist.id}`)

    redirect(
      `/app/checklists/${checklist.id}?editSuccess=${encodeURIComponent(
        'Checklist library settings updated.'
      )}#checklist-browser`
    )
  }

  async function supersedeChecklistAction(formData: FormData) {
    'use server'

    const actionSupabase = await createClient()
    const {
      data: { user: actionUser },
    } = await actionSupabase.auth.getUser()

    if (!actionUser?.email) redirect('/login')

    const { data: actionAppUser } = await actionSupabase
      .from('app_users')
      .select('role, is_active')
      .eq('email', actionUser.email)
      .maybeSingle()

    const actionIsAdmin =
      actionAppUser?.is_active === true &&
      clean(actionAppUser?.role).toLowerCase() === 'admin'

    if (!actionIsAdmin) redirect('/app/checklists')

    const replacementId = clean(
      String(formData.get('replacement_checklist_id') ?? '')
    )
    const reason =
      clean(String(formData.get('supersede_reason') ?? '')) ||
      'Replaced by a newer or corrected HITS checklist.'

    if (!replacementId || replacementId === checklist.id) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'Choose a different active checklist as the replacement.'
        )}`
      )
    }

    const { data: replacement } = await actionSupabase
      .from('checklists')
      .select('id, name, is_active')
      .eq('id', replacementId)
      .eq('is_active', true)
      .maybeSingle()

    if (!replacement) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'The replacement checklist could not be found or is not active.'
        )}`
      )
    }

    const { error } = await actionSupabase
      .from('checklists')
      .update({
        is_active: false,
        superseded_by_checklist_id: replacement.id,
        superseded_at: new Date().toISOString(),
        supersede_reason: reason,
      })
      .eq('id', checklist.id)

    if (error) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          error.message
        )}`
      )
    }

    revalidatePath('/app/checklists')
    revalidatePath(`/app/checklists/${checklist.id}`)
    revalidatePath(`/app/checklists/${replacement.id}`)

    redirect(
      `/app/checklists/${replacement.id}?editSuccess=${encodeURIComponent(
        `Superseded "${checklist.name}" with this checklist.`
      )}`
    )
  }

  async function deleteChecklistAction(formData: FormData) {
    'use server'

    const actionSupabase = await createClient()
    const {
      data: { user: actionUser },
    } = await actionSupabase.auth.getUser()

    if (!actionUser?.email) redirect('/login')

    const { data: actionAppUser } = await actionSupabase
      .from('app_users')
      .select('role, is_active')
      .eq('email', actionUser.email)
      .maybeSingle()

    const actionIsAdmin =
      actionAppUser?.is_active === true &&
      clean(actionAppUser?.role).toLowerCase() === 'admin'

    if (!actionIsAdmin) redirect('/app/checklists')

    const confirmation = clean(String(formData.get('confirmation') ?? ''))
    if (confirmation !== checklist.name) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          `Delete cancelled. Type the exact checklist name: ${checklist.name}`
        )}`
      )
    }

    // Never delete inventory. Block hard deletion when this checklist currently
    // has saved inventory matches so the admin can supersede it instead.
    //
    // IMPORTANT: Do this check entirely in the database. The old version first
    // downloaded every checklist item ID into the app and then checked those IDs
    // in batches. Large products (for example, 14,400-card Prizm checklists)
    // could overwhelm the request and fail with "TypeError: fetch failed".
    //
    // This joined query asks Supabase for at most ONE matching row belonging to
    // this checklist, so the amount of data returned stays tiny regardless of
    // checklist size.
    const { data: existingMatches, error: matchCheckError } =
      await actionSupabase
        .from('checklist_inventory_matches')
        .select(
          'checklist_item_id, checklist_items!inner(checklist_id)'
        )
        .eq('checklist_items.checklist_id', checklist.id)
        .limit(1)

    if (matchCheckError) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          matchCheckError.message
        )}`
      )
    }

    const hasInventoryMatches = (existingMatches ?? []).length > 0

    if (hasInventoryMatches) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'This checklist has inventory matches, so HITS blocked permanent deletion. Supersede it instead; inventory will remain safe.'
        )}`
      )
    }

    const { error: deleteError } = await actionSupabase
      .from('checklists')
      .delete()
      .eq('id', checklist.id)

    if (deleteError) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          `Delete failed: ${deleteError.message}`
        )}`
      )
    }

    revalidatePath('/app/checklists')
    redirect(
      `/app/checklists?deleted=${encodeURIComponent(
        `Deleted checklist: ${checklist.name}`
      )}`
    )
  }

  const buildSuccessMessage = firstParam(queryParams.buildSuccess)
  const buildErrorMessage = firstParam(queryParams.buildError)
  const editSuccessMessage = firstParam(queryParams.editSuccess)
  const editErrorMessage = firstParam(queryParams.editError)

  return (
    <div id="checklist-top" className="app-page-wide space-y-5">
      <div className="app-page-header">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="app-badge app-badge-info">
              {checklist.visibility === 'global' ? 'HITS Library' : 'Private'}
            </span>

            {checklist.verified && (
              <span className="app-badge app-badge-success">Verified</span>
            )}

            {clean(checklist.source_type) && (
              <span className="app-badge">
                Source: {checklist.source_type}
              </span>
            )}
          </div>

          <h1 className="app-title">{checklist.name}</h1>

          {meta && <p className="app-subtitle">{meta}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/checklists" className="app-button">
            Back to Checklist Library
          </Link>

          <Link href="/app/checklists/import" className="app-button">
            Import Another
          </Link>

          <ChecklistProblemReport
            checklistId={checklist.id}
            checklistName={checklist.name}
            checklistItemId={null}
            sectionName={null}
            teamName={null}
            cardNumber={null}
            playerName={null}
            buttonLabel="Report a Problem"
          />

          {isAdmin && (
            <details className="relative">
              <summary className="app-button cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                Edit Checklist
              </summary>

              <div className="absolute right-0 z-50 mt-2 max-h-[82vh] w-[min(96vw,980px)] overflow-y-auto rounded-xl border border-cyan-900 bg-zinc-950 p-4 shadow-2xl">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">Edit Checklist Metadata</h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    Admin only. This changes checklist metadata only — cards,
                    sections, matches, and import history are not modified.
                  </p>
                </div>

                <form action={updateChecklistMetadataAction} className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Checklist Name
                    </span>
                    <input
                      name="name"
                      defaultValue={checklist.name}
                      required
                      className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-600"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Year
                      </span>
                      <input
                        name="year"
                        defaultValue={clean(checklist.year)}
                        placeholder="2026 or 2025-26"
                        className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-600"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Manufacturer
                      </span>
                      <input
                        name="manufacturer"
                        defaultValue={clean(checklist.manufacturer)}
                        placeholder="Topps, Panini, Bowman..."
                        className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-600"
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Brand
                      </span>
                      <input
                        name="brand"
                        defaultValue={clean(checklist.brand)}
                        placeholder="Prizm, Chrome..."
                        className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-600"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Product Name
                      </span>
                      <input
                        name="product_name"
                        defaultValue={clean(checklist.product_name)}
                        placeholder="Baseball Prizm"
                        className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-600"
                      />
                    </label>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button type="submit" className="app-button-primary">
                      Save Checklist
                    </button>
                  </div>
                </form>

                <div id="admin-row-editor" className="my-5 border-t border-zinc-800 pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Checklist Rows</h3>
                      <p className="mt-1 max-w-2xl text-xs text-zinc-500">
                        Admin only. Search, edit, add, or delete individual checklist
                        rows. HITS keeps the importer permissive; use this area to clean
                        up false positives or restore a missing card without rebuilding
                        the whole checklist.
                      </p>
                    </div>

                    <form method="get" className="flex min-w-72 gap-2">
                      <input
                        name="rowSearch"
                        defaultValue={rowSearch}
                        placeholder="Card #, player, team, note..."
                        className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-600"
                      />
                      <button type="submit" className="app-button">
                        Search Rows
                      </button>
                    </form>
                  </div>

                  <details className="mt-4 rounded-xl border border-emerald-900/70 bg-emerald-950/10 p-3">
                    <summary className="cursor-pointer list-none font-semibold text-emerald-300 [&::-webkit-details-marker]:hidden">
                      + Add Checklist Row
                    </summary>

                    <form action={addChecklistRowAction} className="mt-3 space-y-3">
                      <div className="grid gap-3 md:grid-cols-4">
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Section
                          </span>
                          <select
                            name="section_id"
                            required
                            defaultValue={adminSections[0]?.id ?? ''}
                            className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                          >
                            {adminSections.map((section) => (
                              <option key={section.id} value={section.id}>
                                {section.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Card #
                          </span>
                          <input
                            name="card_number"
                            className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                          />
                        </label>

                        <label className="block md:col-span-2">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Player / Item
                          </span>
                          <input
                            name="player_name"
                            className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                          />
                        </label>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <input
                          name="printed_team"
                          placeholder="Team"
                          className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                        />
                        <input
                          name="parallel_name"
                          placeholder="Parallel"
                          className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                        />
                        <input
                          name="variation"
                          placeholder="Variation"
                          className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                        />
                      </div>

                      <div className="grid gap-3 md:grid-cols-[140px_1fr]">
                        <input
                          name="print_run"
                          type="number"
                          min="1"
                          placeholder="Print run"
                          className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                        />
                        <input
                          name="notes"
                          placeholder="Notes"
                          className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-300">
                        {[
                          ['rookie_flag', 'RC'],
                          ['auto_flag', 'Auto'],
                          ['relic_flag', 'Relic'],
                          ['serial_flag', 'Serial'],
                        ].map(([name, label]) => (
                          <label key={name} className="flex items-center gap-2">
                            <input type="checkbox" name={name} />
                            {label}
                          </label>
                        ))}
                      </div>

                      <div className="flex justify-end">
                        <button type="submit" className="app-button-primary">
                          Add Row
                        </button>
                      </div>
                    </form>
                  </details>

                  <div className="mt-4 text-xs text-zinc-500">
                    {rowSearch
                      ? `Showing up to 100 rows matching "${rowSearch}".`
                      : 'Showing the first 30 rows. Search to find a specific card or suspicious import row.'}
                  </div>

                  <div className="mt-3 space-y-3">
                    {adminRows.length === 0 ? (
                      <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-4 text-sm text-zinc-500">
                        No checklist rows matched this search.
                      </div>
                    ) : (
                      adminRows.map((row) => (
                        <details
                          key={row.id}
                          className="rounded-xl border border-zinc-800 bg-black/30"
                        >
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
                            <div className="min-w-0">
                              <span className="font-semibold text-cyan-200">
                                {clean(row.card_number) || 'No #'}
                              </span>
                              <span className="mx-2 text-zinc-700">•</span>
                              <span className="text-zinc-200">
                                {clean(row.player_name) || 'Unnamed item'}
                              </span>
                              {clean(row.printed_team) && (
                                <span className="ml-2 text-xs text-zinc-500">
                                  {row.printed_team}
                                </span>
                              )}
                            </div>
                            <span className="shrink-0 text-xs text-zinc-600">
                              Edit
                            </span>
                          </summary>

                          <form
                            action={updateChecklistRowAction}
                            className="space-y-3 border-t border-zinc-800 p-3"
                          >
                            <input type="hidden" name="item_id" value={row.id} />
                            <input
                              type="hidden"
                              name="current_search"
                              value={rowSearch}
                            />

                            <div className="grid gap-3 md:grid-cols-4">
                              <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                  Section
                                </span>
                                <select
                                  name="section_id"
                                  defaultValue={row.section_id}
                                  className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                                >
                                  {adminSections.map((section) => (
                                    <option key={section.id} value={section.id}>
                                      {section.name}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                  Card #
                                </span>
                                <input
                                  name="card_number"
                                  defaultValue={clean(row.card_number)}
                                  className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                                />
                              </label>

                              <label className="block md:col-span-2">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                  Player / Item
                                </span>
                                <input
                                  name="player_name"
                                  defaultValue={clean(row.player_name)}
                                  className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                                />
                              </label>
                            </div>

                            <div className="grid gap-3 md:grid-cols-3">
                              <input
                                name="printed_team"
                                defaultValue={clean(row.printed_team)}
                                placeholder="Team"
                                className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                              />
                              <input
                                name="parallel_name"
                                defaultValue={clean(row.parallel_name)}
                                placeholder="Parallel"
                                className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                              />
                              <input
                                name="variation"
                                defaultValue={clean(row.variation)}
                                placeholder="Variation"
                                className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                              />
                            </div>

                            <div className="grid gap-3 md:grid-cols-[140px_1fr]">
                              <input
                                name="print_run"
                                type="number"
                                min="1"
                                defaultValue={row.print_run ?? ''}
                                placeholder="Print run"
                                className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                              />
                              <input
                                name="notes"
                                defaultValue={clean(row.notes)}
                                placeholder="Notes"
                                className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                              />
                            </div>

                            <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-300">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  name="rookie_flag"
                                  defaultChecked={row.rookie_flag}
                                />
                                RC
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  name="auto_flag"
                                  defaultChecked={row.auto_flag}
                                />
                                Auto
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  name="relic_flag"
                                  defaultChecked={row.relic_flag}
                                />
                                Relic
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  name="serial_flag"
                                  defaultChecked={row.serial_flag}
                                />
                                Serial
                              </label>
                            </div>

                            <div className="flex flex-wrap justify-end gap-2">
                              <button type="submit" className="app-button-primary">
                                Save Row
                              </button>
                            </div>
                          </form>

                          <form
                            action={deleteChecklistRowAction}
                            className="flex items-center justify-between gap-3 border-t border-red-950/70 px-3 py-2"
                          >
                            <input type="hidden" name="item_id" value={row.id} />
                            <input
                              type="hidden"
                              name="current_search"
                              value={rowSearch}
                            />
                            <div className="text-xs text-zinc-600">
                              Delete is blocked when this row has saved inventory matches.
                            </div>
                            <button
                              type="submit"
                              className="rounded-lg border border-red-900 bg-red-950/30 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-950/60"
                            >
                              Delete Row
                            </button>
                          </form>
                        </details>
                      ))
                    )}
                  </div>
                </div>

                <div className="my-5 border-t border-zinc-800" />

                <form action={updateChecklistLibraryStateAction} className="space-y-3">
                  <div>
                    <h3 className="font-semibold">Library Settings</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Control whether users can see this checklist and whether
                      you have verified its library data.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Visibility
                      </span>
                      <select
                        name="visibility"
                        defaultValue={checklist.visibility}
                        className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                      >
                        <option value="private">Private</option>
                        <option value="global">HITS Library</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Verification
                      </span>
                      <select
                        name="verified"
                        defaultValue={checklist.verified ? 'true' : 'false'}
                        className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                      >
                        <option value="false">Unverified</option>
                        <option value="true">Verified</option>
                      </select>
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <button type="submit" className="app-button">
                      Save Library Settings
                    </button>
                  </div>
                </form>

                <div className="my-5 border-t border-zinc-800" />

                <form action={supersedeChecklistAction} className="space-y-3">
                  <div>
                    <h3 className="font-semibold">Supersede Checklist</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Use this when a newer or corrected checklist replaces this
                      one. The old checklist becomes inactive instead of being
                      destroyed.
                    </p>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Replacement Checklist
                    </span>
                    <select
                      name="replacement_checklist_id"
                      required
                      defaultValue=""
                      className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                    >
                      <option value="" disabled>
                        Choose the newer/corrected checklist…
                      </option>
                      {adminChecklistOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {[option.year, option.manufacturer, option.name]
                            .filter(Boolean)
                            .join(' • ')}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Reason
                    </span>
                    <input
                      name="supersede_reason"
                      placeholder="Example: Revised manufacturer checklist replaced incomplete release."
                      className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                    />
                  </label>

                  <div className="flex justify-end">
                    <button type="submit" className="app-button-warning">
                      Supersede This Checklist
                    </button>
                  </div>
                </form>

                <div className="my-5 border-t border-red-950" />

                <form action={deleteChecklistAction} className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-red-300">
                      Permanently Delete Checklist
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      For mistakes, test imports, or unusable duplicates only.
                      HITS blocks deletion when saved inventory matches exist.
                      Inventory items themselves are never deleted.
                    </p>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Type the exact checklist name to confirm
                    </span>
                    <div className="mb-1 text-xs text-zinc-300">
                      {checklist.name}
                    </div>
                    <input
                      name="confirmation"
                      required
                      autoComplete="off"
                      className="w-full rounded-lg border border-red-900 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-red-600"
                    />
                  </label>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-950/70"
                    >
                      Delete Checklist Permanently
                    </button>
                  </div>
                </form>
              </div>
            </details>
          )}
        </div>
      </div>

      {editSuccessMessage && (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          {editSuccessMessage}
        </div>
      )}

      {editErrorMessage && (
        <div className="rounded-xl border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          Checklist update failed: {editErrorMessage}
        </div>
      )}

      {buildSuccessMessage && (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          {buildSuccessMessage}
        </div>
      )}

      {buildErrorMessage && (
        <div className="rounded-xl border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          Build failed: {buildErrorMessage}
        </div>
      )}

      <section id="checklist-browser" className="scroll-mt-6">
        <ChecklistBrowser checklistId={checklist.id} canEdit={isAdmin} />
      </section>

      {(clean(checklist.source_reference) || clean(checklist.notes)) && (
        <section className="app-section p-4">
          <h2 className="text-base font-semibold">Checklist Source</h2>

          {clean(checklist.source_reference) && (
            <div className="mt-2 text-sm text-zinc-400">
              File:{' '}
              <span className="text-zinc-200">
                {checklist.source_reference}
              </span>
            </div>
          )}

          {clean(checklist.notes) && (
            <div className="mt-2 text-sm text-zinc-400">
              {checklist.notes}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
