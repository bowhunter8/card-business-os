'use server'

import { createClient } from '@/lib/supabase/server'
import { runChecklistInventoryMatcher } from '@/app/actions/checklist-inventory-matcher'

type Snapshot = {
  inventoryMaxUpdatedAt: string | null
  inventoryItemCount: number
  checklistUpdatedAt: string | null
  checklistItemMaxCreatedAt: string | null
  checklistItemCount: number
  checklistSectionMaxCreatedAt: string | null
  checklistSectionCount: number
}

type MatchRunRow = {
  last_matched_at: string
  inventory_max_updated_at: string | null
  inventory_item_count: number
  checklist_updated_at: string | null
  checklist_item_max_created_at: string | null
  checklist_item_count: number
  checklist_section_max_created_at: string | null
  checklist_section_count: number
}

function sameNullableTimestamp(a: string | null, b: string | null) {
  return (a ?? null) === (b ?? null)
}

async function loadSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  checklistId: string
): Promise<Snapshot> {
  const [
    inventoryLatestResult,
    inventoryCountResult,
    checklistResult,
    checklistItemLatestResult,
    checklistItemCountResult,
    checklistSectionLatestResult,
    checklistSectionCountResult,
  ] = await Promise.all([
    supabase
      .from('inventory_items')
      .select('updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('inventory_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),

    supabase
      .from('checklists')
      .select('updated_at')
      .eq('id', checklistId)
      .maybeSingle(),

    supabase
      .from('checklist_items')
      .select('created_at')
      .eq('checklist_id', checklistId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('checklist_items')
      .select('id', { count: 'exact', head: true })
      .eq('checklist_id', checklistId),

    supabase
      .from('checklist_sections')
      .select('created_at')
      .eq('checklist_id', checklistId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('checklist_sections')
      .select('id', { count: 'exact', head: true })
      .eq('checklist_id', checklistId),
  ])

  const errors = [
    inventoryLatestResult.error,
    inventoryCountResult.error,
    checklistResult.error,
    checklistItemLatestResult.error,
    checklistItemCountResult.error,
    checklistSectionLatestResult.error,
    checklistSectionCountResult.error,
  ].filter(Boolean)

  if (errors.length > 0) {
    throw new Error(errors[0]?.message || 'Could not determine checklist match freshness.')
  }

  if (!checklistResult.data) {
    throw new Error('Checklist not found.')
  }

  return {
    inventoryMaxUpdatedAt:
      (inventoryLatestResult.data?.updated_at as string | undefined) ?? null,
    inventoryItemCount: inventoryCountResult.count ?? 0,
    checklistUpdatedAt:
      (checklistResult.data.updated_at as string | undefined) ?? null,
    checklistItemMaxCreatedAt:
      (checklistItemLatestResult.data?.created_at as string | undefined) ?? null,
    checklistItemCount: checklistItemCountResult.count ?? 0,
    checklistSectionMaxCreatedAt:
      (checklistSectionLatestResult.data?.created_at as string | undefined) ?? null,
    checklistSectionCount: checklistSectionCountResult.count ?? 0,
  }
}

function snapshotMatchesRun(snapshot: Snapshot, run: MatchRunRow) {
  return (
    snapshot.inventoryItemCount === run.inventory_item_count &&
    sameNullableTimestamp(
      snapshot.inventoryMaxUpdatedAt,
      run.inventory_max_updated_at
    ) &&
    sameNullableTimestamp(snapshot.checklistUpdatedAt, run.checklist_updated_at) &&
    snapshot.checklistItemCount === run.checklist_item_count &&
    sameNullableTimestamp(
      snapshot.checklistItemMaxCreatedAt,
      run.checklist_item_max_created_at
    ) &&
    snapshot.checklistSectionCount === run.checklist_section_count &&
    sameNullableTimestamp(
      snapshot.checklistSectionMaxCreatedAt,
      run.checklist_section_max_created_at
    )
  )
}

export async function ensureChecklistInventoryMatches(
  checklistId: string,
  options?: { force?: boolean }
) {
  const safeChecklistId = String(checklistId ?? '').trim()

  if (!safeChecklistId) {
    return {
      ok: false as const,
      status: 'error' as const,
      error: 'Checklist ID is required.',
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false as const,
      status: 'error' as const,
      error: 'You must be signed in.',
    }
  }

  try {
    const snapshotBefore = await loadSnapshot(
      supabase,
      user.id,
      safeChecklistId
    )

    const { data: runData, error: runError } = await supabase
      .from('checklist_match_runs')
      .select(
        'last_matched_at, inventory_max_updated_at, inventory_item_count, checklist_updated_at, checklist_item_max_created_at, checklist_item_count, checklist_section_max_created_at, checklist_section_count'
      )
      .eq('user_id', user.id)
      .eq('checklist_id', safeChecklistId)
      .maybeSingle()

    if (runError) {
      throw new Error(runError.message)
    }

    const existingRun = (runData ?? null) as MatchRunRow | null
    const isCurrent =
      existingRun !== null && snapshotMatchesRun(snapshotBefore, existingRun)

    if (!options?.force && isCurrent) {
      return {
        ok: true as const,
        status: 'current' as const,
        matched: false,
        lastMatchedAt: existingRun.last_matched_at,
      }
    }

    const result = await runChecklistInventoryMatcher(safeChecklistId)

    if (!result.ok) {
      return {
        ok: false as const,
        status: 'error' as const,
        error: result.error,
      }
    }

    // Re-read after matching so the stored freshness marker represents the
    // state that the matcher actually completed against.
    const snapshotAfter = await loadSnapshot(
      supabase,
      user.id,
      safeChecklistId
    )

    const matchedAt = new Date().toISOString()

    const { error: upsertError } = await supabase
      .from('checklist_match_runs')
      .upsert(
        {
          user_id: user.id,
          checklist_id: safeChecklistId,
          last_matched_at: matchedAt,
          inventory_max_updated_at: snapshotAfter.inventoryMaxUpdatedAt,
          inventory_item_count: snapshotAfter.inventoryItemCount,
          checklist_updated_at: snapshotAfter.checklistUpdatedAt,
          checklist_item_max_created_at: snapshotAfter.checklistItemMaxCreatedAt,
          checklist_item_count: snapshotAfter.checklistItemCount,
          checklist_section_max_created_at:
            snapshotAfter.checklistSectionMaxCreatedAt,
          checklist_section_count: snapshotAfter.checklistSectionCount,
        },
        { onConflict: 'user_id,checklist_id' }
      )

    if (upsertError) {
      throw new Error(upsertError.message)
    }

    return {
      ok: true as const,
      status: 'matched' as const,
      matched: true,
      lastMatchedAt: matchedAt,
      candidateMatches: result.candidateMatches,
    }
  } catch (error) {
    return {
      ok: false as const,
      status: 'error' as const,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to refresh checklist inventory matches.',
    }
  }
}
