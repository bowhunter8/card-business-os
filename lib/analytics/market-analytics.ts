import { createClient } from '@/lib/supabase/server'

export type PulsePlayerStat = {
  playerName: string
  totalSold: number
  totalRevenue: number
  averageSalePrice: number
  averageDaysToSell: number
}

export type PulseFilters = {
  days?: number
  limit?: number
}

type PulseTopPlayerRpcRow = {
  player_name: string | null
  total_sold: number | string | null
  total_revenue: number | string | null
  average_sale_price: number | string | null
  average_days_to_sell: number | string | null
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function getTopSellingPlayers(
  filters: PulseFilters = {}
): Promise<PulsePlayerStat[]> {
  const supabase = await createClient()

  const days = filters.days ?? 30
  const limit = filters.limit ?? 10

  const { data, error } = await supabase.rpc('get_hits_pulse_top_players', {
    p_days: days,
    p_limit: limit,
  })

  if (error) {
    console.error('HITS Pulse top players RPC error:', error.message)
    return []
  }

  return ((data ?? []) as PulseTopPlayerRpcRow[])
    .map((row) => ({
      playerName: String(row.player_name ?? '').trim(),
      totalSold: toNumber(row.total_sold),
      totalRevenue: toNumber(row.total_revenue),
      averageSalePrice: toNumber(row.average_sale_price),
      averageDaysToSell: toNumber(row.average_days_to_sell),
    }))
    .filter((row) => row.playerName)
}
