import { unstable_cache } from 'next/cache'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export type CachedChecklistItemRow = {
  id: string
  checklist_id: string
  section_id: string
  card_number: string
  player_name: string
  printed_team: string | null
  parallel_name: string | null
  variation: string | null
  rookie_flag: boolean
  auto_flag: boolean
  relic_flag: boolean
  serial_flag: boolean
  print_run: number | null
  quantity_required: number
  sort_order: number | null
  notes: string | null
}

export type CachedChecklistItemPersonRow = {
  checklist_item_id: string
  player_name: string
  printed_team: string | null
  sort_order: number | null
}

const CACHE_REVALIDATE_SECONDS = 300

function createChecklistDataClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is required for checklist structure caching.'
    )
  }

  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for checklist structure caching.'
    )
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

/**
 * Shared, server-only cache for GLOBAL checklist structure.
 *
 * Important:
 * - No user cookies/session are read here.
 * - No inventory, ownership, matches, sales, tax, or user data are queried here.
 * - Each checklist page is cached separately so very large checklists are not
 *   stored as one enormous cache value.
 * - Cache entries automatically refresh after a short interval so admin
 *   corrections do not remain stale for long.
 */
const loadChecklistItemPageCached = unstable_cache(
  async (
    checklistId: string,
    from: number,
    to: number
  ): Promise<CachedChecklistItemRow[]> => {
    const supabase = createChecklistDataClient()

    const { data, error } = await supabase
      .from('checklist_items')
      .select(
        'id, checklist_id, section_id, card_number, player_name, printed_team, parallel_name, variation, rookie_flag, auto_flag, relic_flag, serial_flag, print_run, quantity_required, sort_order, notes'
      )
      .eq('checklist_id', checklistId)
      .order('sort_order', { ascending: true })
      .range(from, to)

    if (error) {
      throw new Error(
        `Unable to load cached checklist items: ${error.message}`
      )
    }

    return (data ?? []) as CachedChecklistItemRow[]
  },
  ['hits-checklist-items-page-v1'],
  {
    revalidate: CACHE_REVALIDATE_SECONDS,
  }
)

const loadChecklistPeopleBatchCached = unstable_cache(
  async (
    checklistId: string,
    batchNumber: number,
    itemIds: string[]
  ): Promise<CachedChecklistItemPersonRow[]> => {
    // checklistId and batchNumber intentionally participate in the cache key.
    // itemIds are also included by unstable_cache because function arguments
    // are part of the generated key.
    void checklistId
    void batchNumber

    if (itemIds.length === 0) return []

    const supabase = createChecklistDataClient()

    const { data, error } = await supabase
      .from('checklist_item_people')
      .select('checklist_item_id, player_name, printed_team, sort_order')
      .in('checklist_item_id', itemIds)
      .order('sort_order', { ascending: true })

    if (error) {
      throw new Error(
        `Unable to load cached checklist item people: ${error.message}`
      )
    }

    return (data ?? []) as CachedChecklistItemPersonRow[]
  },
  ['hits-checklist-item-people-batch-v1'],
  {
    revalidate: CACHE_REVALIDATE_SECONDS,
  }
)

export async function loadCachedChecklistItemPage(
  checklistId: string,
  from: number,
  to: number
) {
  return loadChecklistItemPageCached(checklistId, from, to)
}

export async function loadCachedChecklistPeopleBatch(
  checklistId: string,
  batchNumber: number,
  itemIds: string[]
) {
  return loadChecklistPeopleBatchCached(checklistId, batchNumber, itemIds)
}
