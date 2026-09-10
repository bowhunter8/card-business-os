'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type BuildComponent = {
  inventory_item_id: string
  checklist_item_id: string
}

export type ChecklistBuildQuoteRow = {
  inventory_item_id: string
  status: string
  quantity: number
  available_quantity: number
  cost_basis_unit: number
}

export type ChecklistBuildQuoteResult =
  | {
      ok: true
      rows: ChecklistBuildQuoteRow[]
      total_cost_basis: number
    }
  | {
      ok: false
      error: string
    }

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function normalize(value: unknown) {
  return clean(value).toLowerCase()
}

function splitTeams(value: string | null | undefined) {
  const source = clean(value)

  if (!source) return []

  return Array.from(
    new Set(
      source
        .split(/\s*\/\s*|\s*\|\s*/)
        .map((team) => team.trim())
        .filter(Boolean)
    )
  )
}

function errorRedirect(
  checklistId: string,
  teamName: string,
  sectionId: string,
  message: string
): never {
  const params = new URLSearchParams()
  params.set('view', 'team')

  if (teamName) params.set('team', teamName)
  if (sectionId) params.set('reviewBuild', sectionId)

  params.set('buildError', message)

  redirect(`/app/checklists/${checklistId}?${params.toString()}`)
}

export async function quoteChecklistBuild(
  components: BuildComponent[]
): Promise<ChecklistBuildQuoteResult> {
  const safeComponents = Array.isArray(components)
    ? components
        .map((row) => ({
          inventory_item_id: clean(row?.inventory_item_id),
          checklist_item_id: clean(row?.checklist_item_id),
        }))
        .filter(
          (row) => row.inventory_item_id && row.checklist_item_id
        )
    : []

  if (safeComponents.length === 0 || safeComponents.length > 2000) {
    return {
      ok: false,
      error: 'The proposed build components are incomplete or invalid.',
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      error: 'You must be signed in to review this build.',
    }
  }

  const inventoryIds = Array.from(
    new Set(safeComponents.map((row) => row.inventory_item_id))
  )

  const { data: inventoryRows, error } = await supabase
    .from('inventory_items')
    .select(
      'id, status, quantity, available_quantity, cost_basis_unit'
    )
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', inventoryIds)

  if (error) {
    return {
      ok: false,
      error: error.message,
    }
  }

  const rows = (inventoryRows ?? []).map((row) => ({
    inventory_item_id: clean(row.id),
    status: clean(row.status),
    quantity: Math.max(0, Number(row.quantity ?? 0)),
    available_quantity: Math.max(
      0,
      Number(row.available_quantity ?? 0)
    ),
    cost_basis_unit: Math.max(
      0,
      Number(row.cost_basis_unit ?? 0)
    ),
  }))

  if (rows.length !== inventoryIds.length) {
    return {
      ok: false,
      error:
        'One or more proposed inventory records are no longer available.',
    }
  }

  const rowById = new Map(
    rows.map((row) => [row.inventory_item_id, row])
  )

  const totalCostBasis = safeComponents.reduce((sum, component) => {
    const row = rowById.get(component.inventory_item_id)
    return sum + Number(row?.cost_basis_unit ?? 0)
  }, 0)

  return {
    ok: true,
    rows,
    total_cost_basis: totalCostBasis,
  }
}

export async function buildChecklistSetAction(formData: FormData) {
  const checklistId = clean(formData.get('checklistId'))
  const sectionId = clean(formData.get('sectionId'))
  const teamName = clean(formData.get('teamName'))
  const componentsJson = clean(formData.get('components'))

  if (!checklistId || !sectionId || !teamName || !componentsJson) {
    errorRedirect(
      checklistId,
      teamName,
      sectionId,
      'Missing build context.'
    )
  }

  let components: BuildComponent[] = []

  try {
    const parsed = JSON.parse(componentsJson)

    if (!Array.isArray(parsed)) {
      throw new Error('Components must be an array.')
    }

    components = parsed.map((row) => ({
      inventory_item_id: clean(row?.inventory_item_id),
      checklist_item_id: clean(row?.checklist_item_id),
    }))
  } catch {
    errorRedirect(
      checklistId,
      teamName,
      sectionId,
      'The proposed build components could not be read.'
    )
  }

  if (
    components.length === 0 ||
    components.length > 2000 ||
    components.some(
      (row) => !row.inventory_item_id || !row.checklist_item_id
    )
  ) {
    errorRedirect(
      checklistId,
      teamName,
      sectionId,
      'The proposed build components are incomplete or invalid.'
    )
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [
    { data: checklist, error: checklistError },
    { data: section, error: sectionError },
  ] = await Promise.all([
    supabase
      .from('checklists')
      .select('id, year, manufacturer, brand, product_name, name')
      .eq('id', checklistId)
      .maybeSingle(),
    supabase
      .from('checklist_sections')
      .select('id, checklist_id, name')
      .eq('id', sectionId)
      .eq('checklist_id', checklistId)
      .maybeSingle(),
  ])

  if (checklistError || !checklist) {
    errorRedirect(
      checklistId,
      teamName,
      sectionId,
      checklistError?.message || 'Checklist not found.'
    )
  }

  if (sectionError || !section) {
    errorRedirect(
      checklistId,
      teamName,
      sectionId,
      sectionError?.message || 'Checklist section not found.'
    )
  }

  const checklistItemIds = Array.from(
    new Set(components.map((row) => row.checklist_item_id))
  )

  const { data: checklistItems, error: checklistItemsError } =
    await supabase
      .from('checklist_items')
      .select('id, checklist_id, section_id, printed_team')
      .eq('checklist_id', checklistId)
      .eq('section_id', sectionId)
      .in('id', checklistItemIds)

  if (checklistItemsError) {
    errorRedirect(
      checklistId,
      teamName,
      sectionId,
      checklistItemsError.message
    )
  }

  const validItems = checklistItems ?? []

  if (validItems.length !== checklistItemIds.length) {
    errorRedirect(
      checklistId,
      teamName,
      sectionId,
      'One or more checklist cards no longer belong to this section.'
    )
  }

  const requestedTeam = normalize(teamName)

  const wrongTeam = validItems.some((item) => {
    const teams = splitTeams(item.printed_team)
    return !teams.some(
      (team) => normalize(team) === requestedTeam
    )
  })

  if (wrongTeam) {
    errorRedirect(
      checklistId,
      teamName,
      sectionId,
      'One or more checklist cards no longer belong to this team.'
    )
  }

  const productLabel =
    clean(checklist.product_name) ||
    clean(checklist.brand) ||
    clean(checklist.manufacturer)

  const buildName = [
    clean(checklist.year),
    productLabel,
    teamName,
    clean(section.name),
  ]
    .filter(Boolean)
    .join(' • ')

  const resultTitle = [
    clean(checklist.year),
    productLabel,
    teamName,
    clean(section.name),
    'Team Set',
  ]
    .filter(Boolean)
    .join(' • ')

  const resultNotes = `Built in HITS from ${
    components.length
  } checklist card${
    components.length === 1 ? '' : 's'
  }. Checklist: ${clean(checklist.name)}. Section: ${clean(
    section.name
  )}.`

  const { data, error } = await supabase.rpc(
    'finalize_inventory_build',
    {
      p_build_type: 'team_set',
      p_build_name: buildName,
      p_checklist_id: checklistId,
      p_checklist_section_id: sectionId,
      p_team_name: teamName,
      p_result_title: resultTitle,
      p_result_year: clean(checklist.year) || null,
      p_result_brand:
        clean(checklist.brand) ||
        clean(checklist.manufacturer) ||
        null,
      p_result_set_name:
        clean(checklist.product_name) ||
        clean(checklist.name) ||
        null,
      p_result_notes: resultNotes,
      p_components: components,
    }
  )

  if (error) {
    errorRedirect(
      checklistId,
      teamName,
      sectionId,
      error.message
    )
  }

  const row = Array.isArray(data) ? data[0] : data
  const resultInventoryId =
    row && typeof row === 'object'
      ? clean(
          (row as Record<string, unknown>)
            .result_inventory_item_id
        )
      : ''

  if (!resultInventoryId) {
    errorRedirect(
      checklistId,
      teamName,
      sectionId,
      'Build completed but the finished inventory item could not be identified.'
    )
  }

  redirect(
    `/app/inventory/${resultInventoryId}?buildSuccess=${encodeURIComponent(
      `${teamName} ${clean(
        section.name
      )} team set built successfully`
    )}`
  )
}
