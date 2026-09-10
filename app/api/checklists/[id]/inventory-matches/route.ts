import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type ChecklistItemIdRow = {
  id: string
}

type InventoryItemRow = {
  id: string
  title: string | null
  player_name: string | null
  status: string | null
  quantity: number | null
  available_quantity: number | null
  notes: string | null
  cost_basis_unit: number | null
  source_type: string | null
  source_reference: string | null
}

type ChecklistMatchRow = {
  checklist_item_id: string
  inventory_item_id: string
  match_score: number
  match_type: string
  is_preferred: boolean
  inventory_items:
    | InventoryItemRow
    | InventoryItemRow[]
    | null
}

type DirectLinkedInventoryRow = InventoryItemRow & {
  checklist_item_id: string | null
}

const PAGE_SIZE = 500
const MATCH_ID_BATCH_SIZE = 100
const MATCH_BATCH_CONCURRENCY = 6

async function loadChecklistItemIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  checklistId: string
) {
  const rows: ChecklistItemIdRow[] = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('checklist_items')
      .select('id')
      .eq('checklist_id', checklistId)
      .order('sort_order', { ascending: true })
      .range(from, to)

    if (error) {
      throw new Error(error.message)
    }

    const batch = (data ?? []) as ChecklistItemIdRow[]
    rows.push(...batch)

    if (batch.length < PAGE_SIZE) {
      break
    }

    from += PAGE_SIZE
  }

  return rows.map((row) => row.id)
}

async function loadSavedMatches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  checklistItemIds: string[]
) {
  const rows: ChecklistMatchRow[] = []
  const batches: string[][] = []

  for (
    let index = 0;
    index < checklistItemIds.length;
    index += MATCH_ID_BATCH_SIZE
  ) {
    batches.push(
      checklistItemIds.slice(
        index,
        index + MATCH_ID_BATCH_SIZE
      )
    )
  }

  for (
    let index = 0;
    index < batches.length;
    index += MATCH_BATCH_CONCURRENCY
  ) {
    const batchGroup = batches.slice(
      index,
      index + MATCH_BATCH_CONCURRENCY
    )

    const results = await Promise.all(
      batchGroup.map(async (batchIds) => {
        const { data, error } = await supabase
          .from('checklist_inventory_matches')
          .select(
            'checklist_item_id, inventory_item_id, match_score, match_type, is_preferred, inventory_items!inner(id, title, player_name, status, quantity, available_quantity, notes, cost_basis_unit, source_type, source_reference)'
          )
          .eq('user_id', userId)
          .in('checklist_item_id', batchIds)

        if (error) {
          throw new Error(error.message)
        }

        return (data ?? []) as ChecklistMatchRow[]
      })
    )

    for (const batchRows of results) {
      rows.push(...batchRows)
    }
  }

  return rows
}

async function loadDirectLinkedInventory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  checklistItemIds: string[]
) {
  const rows: ChecklistMatchRow[] = []
  const batches: string[][] = []

  for (
    let index = 0;
    index < checklistItemIds.length;
    index += MATCH_ID_BATCH_SIZE
  ) {
    batches.push(
      checklistItemIds.slice(
        index,
        index + MATCH_ID_BATCH_SIZE
      )
    )
  }

  for (
    let index = 0;
    index < batches.length;
    index += MATCH_BATCH_CONCURRENCY
  ) {
    const batchGroup = batches.slice(
      index,
      index + MATCH_BATCH_CONCURRENCY
    )

    const results = await Promise.all(
      batchGroup.map(async (batchIds) => {
        const { data, error } = await supabase
          .from('inventory_items')
          .select(
            'id, title, player_name, status, quantity, available_quantity, notes, cost_basis_unit, source_type, source_reference, checklist_item_id'
          )
          .eq('user_id', userId)
          .in('checklist_item_id', batchIds)

        if (error) {
          throw new Error(error.message)
        }

        return (data ?? []) as DirectLinkedInventoryRow[]
      })
    )

    for (const batchRows of results) {
      for (const inventoryItem of batchRows) {
        if (!inventoryItem.checklist_item_id) {
          continue
        }

        const {
          checklist_item_id: checklistItemId,
          ...inventoryFields
        } = inventoryItem

        rows.push({
          checklist_item_id: checklistItemId,
          inventory_item_id: inventoryItem.id,
          match_score: 100,
          match_type: 'direct_checklist_link',
          is_preferred: true,
          inventory_items: inventoryFields,
        })
      }
    }
  }

  return rows
}

function mergeMatches(
  savedMatches: ChecklistMatchRow[],
  directMatches: ChecklistMatchRow[]
) {
  const merged = new Map<string, ChecklistMatchRow>()

  for (const match of savedMatches) {
    const key =
      `${match.checklist_item_id}:${match.inventory_item_id}`

    merged.set(key, match)
  }

  // Exact checklist links intentionally overwrite a saved matcher row
  // for the same checklist item + inventory item pair.
  for (const match of directMatches) {
    const key =
      `${match.checklist_item_id}:${match.inventory_item_id}`

    merged.set(key, match)
  }

  return Array.from(merged.values())
}

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      id: string
    }>
  }
) {
  const { id } = await context.params
  const checklistId = String(id ?? '').trim()

  if (!checklistId) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Checklist ID is required.',
      },
      {
        status: 400,
      }
    )
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        error: 'You must be signed in.',
      },
      {
        status: 401,
      }
    )
  }

  try {
    const checklistItemIds =
      await loadChecklistItemIds(
        supabase,
        checklistId
      )

    if (checklistItemIds.length === 0) {
      return NextResponse.json({
        ok: true,
        matches: [],
      })
    }

    const [savedMatches, directMatches] =
      await Promise.all([
        loadSavedMatches(
          supabase,
          user.id,
          checklistItemIds
        ),
        loadDirectLinkedInventory(
          supabase,
          user.id,
          checklistItemIds
        ),
      ])

    const matches = mergeMatches(
      savedMatches,
      directMatches
    )

    return NextResponse.json({
      ok: true,
      matches,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to load checklist inventory matches.',
      },
      {
        status: 500,
      }
    )
  }
}
