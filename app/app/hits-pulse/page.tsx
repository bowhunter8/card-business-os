import PulseFilters from './PulseFilters'
import { createClient } from '@/lib/supabase/server'

type PulsePeriod = '7' | '30' | '90' | '365'
type PulseCategory =
  | ''
  | 'Sports Cards'
  | 'TCG / Other Cards'
  | 'Memorabilia'
  | 'Comics'
  | 'Coins / Currency / Jewelry / Watches'
  | 'LEGO / Toys'
  | 'Other'

type PulseEventRow = {
  player_name?: string | null
  card_title?: string | null
  item_name?: string | null
  title?: string | null
  category?: string | null
  sport?: string | null
  subcategory?: string | null
  item_subcategory?: string | null
  team?: string | null
  set_name?: string | null
  sale_amount?: number | string | null
  gross_sale?: number | string | null
  amount?: number | string | null
  days_to_sell?: number | string | null
  created_at?: string | null
  sale_date?: string | null
  sold_at?: string | null
  [key: string]: unknown
}

const PERIOD_OPTIONS: { label: string; value: PulsePeriod; description: string }[] = [
  { label: '7 Days', value: '7', description: 'Last week' },
  { label: '30 Days', value: '30', description: 'Last month' },
  { label: '90 Days', value: '90', description: 'Last quarter' },
  { label: '1 Year', value: '365', description: 'Last year' },
]

const CATEGORY_OPTIONS: PulseCategory[] = [
  '',
  'Sports Cards',
  'TCG / Other Cards',
  'Memorabilia',
  'Comics',
  'Coins / Currency / Jewelry / Watches',
  'LEGO / Toys',
  'Other',
]

const SUBCATEGORY_OPTIONS_BY_CATEGORY: Record<string, string[]> = {
  'Sports Cards': [
    'Baseball',
    'Football',
    'Basketball',
    'Hockey',
    'Soccer',
    'Racing',
    'UFC / Wrestling',
    'Other Sports',
  ],
  'TCG / Other Cards': [
    'Pokémon',
    'Magic',
    'Yu-Gi-Oh!',
    'Lorcana',
    'One Piece',
    'Other TCG',
  ],
  Memorabilia: [
    'Autographs',
    'Jerseys',
    'Photos',
    'Game Used',
    'Programs',
    'Other Memorabilia',
  ],
  Comics: [
    'Marvel',
    'DC',
    'Image',
    'Indie',
    'Golden / Silver / Bronze Age',
    'Modern',
  ],
  'Coins / Currency / Jewelry / Watches': [
    'Coins',
    'Currency',
    'Jewelry',
    'Watches',
    'Bullion',
    'Other',
  ],
  'LEGO / Toys': [
    'LEGO',
    'Action Figures',
    'Hot Wheels',
    'Funko',
    'Vintage Toys',
    'Other Toys',
  ],
  Other: ['Other'],
}

function cleanPeriod(value: string | undefined): PulsePeriod {
  if (value === '7' || value === '30' || value === '90' || value === '365') {
    return value
  }

  return '30'
}

function cleanCategory(value: string | undefined): PulseCategory {
  const match = CATEGORY_OPTIONS.find((option) => option === value)

  return match ?? ''
}

function cleanSubcategory(category: PulseCategory, value: string | undefined) {
  if (!category || !value) return ''

  const options = SUBCATEGORY_OPTIONS_BY_CATEGORY[category] ?? []

  return options.includes(value) ? value : ''
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value: number) {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
  })
}

function getRowCategory(row: PulseEventRow) {
  return String(row.category ?? '').trim()
}

function getRowSubcategory(row: PulseEventRow) {
  return String(row.sport ?? row.subcategory ?? row.item_subcategory ?? '').trim()
}

function getRowTitle(row: PulseEventRow) {
  return String(row.player_name ?? row.card_title ?? row.item_name ?? row.title ?? '').trim()
}

function getRowSaleAmount(row: PulseEventRow) {
  return toNumber(row.sale_amount ?? row.gross_sale ?? row.amount)
}

function getRowSetName(row: PulseEventRow) {
  return String(row.set_name ?? '').trim()
}

function getRowProductName(row: PulseEventRow) {
  return String(row.card_title ?? row.item_name ?? row.title ?? row.player_name ?? '').trim()
}

function getRowEventDate(row: PulseEventRow) {
  const rawDate = row.sale_date ?? row.sold_at ?? row.created_at
  if (!rawDate) return null

  const date = new Date(String(rawDate))
  return Number.isNaN(date.getTime()) ? null : date
}

type PulseRankedStat = {
  name: string
  totalSold: number
  totalRevenue: number
  averageSalePrice: number
}

type PulseTrendStat = PulseRankedStat & {
  previousSold: number
  change: number
  changePercent: number | null
  trendLabel: string
}

function buildRankedStats(rows: PulseEventRow[], getName: (row: PulseEventRow) => string) {
  const map = new Map<
    string,
    {
      totalSold: number
      totalRevenue: number
    }
  >()

  rows.forEach((row) => {
    const name = getName(row)
    if (!name) return

    const current = map.get(name) ?? { totalSold: 0, totalRevenue: 0 }

    current.totalSold += 1
    current.totalRevenue += getRowSaleAmount(row)

    map.set(name, current)
  })

  return Array.from(map.entries()).map(([name, stat]): PulseRankedStat => ({
    name,
    totalSold: stat.totalSold,
    totalRevenue: stat.totalRevenue,
    averageSalePrice: stat.totalSold > 0 ? stat.totalRevenue / stat.totalSold : 0,
  }))
}

function buildTrendStats({
  currentRows,
  previousRows,
  getName,
}: {
  currentRows: PulseEventRow[]
  previousRows: PulseEventRow[]
  getName: (row: PulseEventRow) => string
}) {
  const currentStats = buildRankedStats(currentRows, getName)
  const previousStats = buildRankedStats(previousRows, getName)
  const previousMap = new Map(previousStats.map((stat) => [stat.name, stat.totalSold]))

  return currentStats.map((stat): PulseTrendStat => {
    const previousSold = previousMap.get(stat.name) ?? 0
    const change = stat.totalSold - previousSold
    const changePercent = previousSold > 0 ? (change / previousSold) * 100 : null

    let trendLabel = 'Stable'
    if (previousSold === 0 && stat.totalSold > 0) {
      trendLabel = 'New'
    } else if (change > 0) {
      trendLabel = 'Rising'
    } else if (change < 0) {
      trendLabel = 'Falling'
    }

    return {
      ...stat,
      previousSold,
      change,
      changePercent,
      trendLabel,
    }
  })
}

function trendText(stat: PulseTrendStat) {
  if (stat.previousSold === 0 && stat.totalSold > 0) return 'New'
  if (stat.change === 0) return 'No change'

  const sign = stat.change > 0 ? '+' : ''
  const percent = stat.changePercent === null ? '' : ` (${sign}${stat.changePercent.toFixed(0)}%)`

  return `${sign}${stat.change}${percent}`
}

type PulsePlayerStat = {
  playerName: string
  totalSold: number
  totalRevenue: number
  averageSalePrice: number
  averageDaysToSell: number
}

function buildPlayerStats(rows: PulseEventRow[]) {
  const map = new Map<
    string,
    {
      totalSold: number
      totalRevenue: number
      totalDaysToSell: number
      daysCount: number
    }
  >()

  rows.forEach((row) => {
    const playerName = getRowTitle(row)
    if (!playerName) return

    const current =
      map.get(playerName) ?? {
        totalSold: 0,
        totalRevenue: 0,
        totalDaysToSell: 0,
        daysCount: 0,
      }

    const saleAmount = getRowSaleAmount(row)
    const daysToSell = toNumber(row.days_to_sell)

    current.totalSold += 1
    current.totalRevenue += saleAmount

    if (Number.isFinite(daysToSell)) {
      current.totalDaysToSell += daysToSell
      current.daysCount += 1
    }

    map.set(playerName, current)
  })

  return Array.from(map.entries()).map(([playerName, stat]): PulsePlayerStat => ({
    playerName,
    totalSold: stat.totalSold,
    totalRevenue: stat.totalRevenue,
    averageSalePrice: stat.totalSold > 0 ? stat.totalRevenue / stat.totalSold : 0,
    averageDaysToSell: stat.daysCount > 0 ? stat.totalDaysToSell / stat.daysCount : 0,
  }))
}

export default async function HitsPulsePage({
  searchParams,
}: {
  searchParams?: Promise<{
    period?: string
    category?: string
    subcategory?: string
    q?: string
  }>
}) {
  const params = searchParams ? await searchParams : undefined

  const period = cleanPeriod(String(params?.period ?? '30'))
  const category = cleanCategory(params?.category)
  const subcategory = cleanSubcategory(category, params?.subcategory)
  const q = String(params?.q ?? '').trim()

  const days = Number(period)
  const supabase = await createClient()

  const { data: pulseRowsRaw, error: pulseRowsError } = await supabase.rpc(
    'get_hits_pulse_events_filtered',
    {
      p_days: days,
      p_category: category || '',
      p_subcategory: subcategory || '',
      p_search: q || '',
      p_limit: 5000,
    }
  )

  const { data: trendRowsRaw, error: trendRowsError } = await supabase.rpc(
    'get_hits_pulse_events_filtered',
    {
      p_days: days * 2,
      p_category: category || '',
      p_subcategory: subcategory || '',
      p_search: q || '',
      p_limit: 10000,
    }
  )

  const pulseRows = (pulseRowsRaw ?? []) as PulseEventRow[]
  const trendRows = (trendRowsRaw ?? []) as PulseEventRow[]
  const currentPeriodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const previousPeriodStart = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000)

  const currentTrendRows = trendRows.filter((row) => {
    const eventDate = getRowEventDate(row)
    return eventDate ? eventDate >= currentPeriodStart : true
  })

  const previousTrendRows = trendRows.filter((row) => {
    const eventDate = getRowEventDate(row)
    return eventDate ? eventDate >= previousPeriodStart && eventDate < currentPeriodStart : false
  })

  const topPlayers = buildPlayerStats(pulseRows)
    .sort(
      (a, b) =>
        b.totalSold - a.totalSold ||
        b.totalRevenue - a.totalRevenue ||
        a.playerName.localeCompare(b.playerName)
    )
    .slice(0, 25)

  const topCategories = Array.from(
    pulseRows.reduce((map, row) => {
      const name = getRowCategory(row)

      if (!name) return map

      map.set(name, (map.get(name) ?? 0) + 1)
      return map
    }, new Map<string, number>())
  )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)

  const topSubcategories = Array.from(
    pulseRows.reduce((map, row) => {
      const name = getRowSubcategory(row)

      if (!name) return map

      map.set(name, (map.get(name) ?? 0) + 1)
      return map
    }, new Map<string, number>())
  )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)

  const topSets = buildRankedStats(pulseRows, getRowSetName)
    .sort(
      (a, b) =>
        b.totalSold - a.totalSold ||
        b.totalRevenue - a.totalRevenue ||
        a.name.localeCompare(b.name)
    )
    .slice(0, 10)

  const topProducts = buildRankedStats(pulseRows, getRowProductName)
    .sort(
      (a, b) =>
        b.totalSold - a.totalSold ||
        b.totalRevenue - a.totalRevenue ||
        a.name.localeCompare(b.name)
    )
    .slice(0, 10)

  const playerTrendMovement = buildTrendStats({
    currentRows: currentTrendRows,
    previousRows: previousTrendRows,
    getName: getRowTitle,
  })
    .sort(
      (a, b) =>
        b.change - a.change ||
        b.totalSold - a.totalSold ||
        b.totalRevenue - a.totalRevenue ||
        a.name.localeCompare(b.name)
    )
    .slice(0, 10)

  const setTrendMovement = buildTrendStats({
    currentRows: currentTrendRows,
    previousRows: previousTrendRows,
    getName: getRowSetName,
  })
    .sort(
      (a, b) =>
        b.change - a.change ||
        b.totalSold - a.totalSold ||
        b.totalRevenue - a.totalRevenue ||
        a.name.localeCompare(b.name)
    )
    .slice(0, 10)

  const fastestSellers = [...topPlayers]
    .filter((player) => Number.isFinite(player.averageDaysToSell))
    .sort(
      (a, b) =>
        a.averageDaysToSell - b.averageDaysToSell ||
        b.totalSold - a.totalSold ||
        b.totalRevenue - a.totalRevenue ||
        a.playerName.localeCompare(b.playerName)
    )
    .slice(0, 10)

  const highestRevenuePlayers = [...topPlayers]
    .sort(
      (a, b) =>
        b.totalRevenue - a.totalRevenue ||
        b.totalSold - a.totalSold ||
        a.playerName.localeCompare(b.playerName)
    )
    .slice(0, 10)

  const activePeriodLabel =
    PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? '30 Days'

  return (
    <div className="app-page space-y-6">
      <div className="app-page-header gap-3">
        <div className="min-w-0">
          <h1 className="app-title">HITS Pulse™</h1>

          <p className="app-subtitle mt-2">
            Anonymous app-wide hobby trends based on completed HITS™ sales activity.
          </p>
        </div>

        <div className="app-badge app-badge-info">LIVE DATA</div>
      </div>

      <div className="app-alert-info">
        HITS Pulse™ shows app-wide aggregate sales trends only. Usernames, emails, seller identities,
        buyer details, notes, order IDs, sale IDs, and inventory IDs are not stored in Pulse events
        and are never displayed.
      </div>

      {pulseRowsError ? (
        <div className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">
          Pulse data could not be loaded from get_hits_pulse_events_filtered. Supabase returned:{' '}
          {pulseRowsError.message}
        </div>
      ) : null}

      {trendRowsError ? (
        <div className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">
          Pulse trend movement could not be loaded. Supabase returned: {trendRowsError.message}
        </div>
      ) : null}

      <div className="app-section space-y-4">
        <div className="[&>form>div>a]:hidden [&>form>div>button]:hidden">
          <PulseFilters
            period={period}
            category={category}
            subcategory={subcategory}
            q={q}
            periodOptions={PERIOD_OPTIONS}
            categoryOptions={CATEGORY_OPTIONS}
            subcategoryOptionsByCategory={SUBCATEGORY_OPTIONS_BY_CATEGORY}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="app-card-tight p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-400">Range</div>
            <div className="mt-1 text-base font-semibold">{activePeriodLabel}</div>
          </div>

          <div className="app-card-tight p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-400">Category</div>
            <div className="mt-1 text-base font-semibold">{category || 'All'}</div>
          </div>

          <div className="app-card-tight p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-400">Subcategory</div>
            <div className="mt-1 text-base font-semibold">{subcategory || 'All'}</div>
          </div>

          <div className="app-card-tight p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-400">Search</div>
            <div className="mt-1 truncate text-base font-semibold">{q || 'All'}</div>
          </div>
        </div>

        <div className="text-xs leading-relaxed text-zinc-500">
          HITS Pulse™ data is anonymous and grouped from completed sales events.
        </div>
      </div>

      <div className="app-card">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Top Selling Players</h2>

            <p className="mt-1 text-sm text-zinc-400">
              {activePeriodLabel} across all HITS™ users.
            </p>
          </div>

          <div className="app-badge app-badge-info">Top 25</div>
        </div>

        {topPlayers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
            No matching Pulse results for the selected filters.
          </div>
        ) : (
          <div className="app-table-wrap">
            <div className="app-table-scroll">
              <table className="app-table">
                <thead className="app-thead">
                  <tr>
                    <th className="app-th">Rank</th>
                    <th className="app-th">Player</th>
                    <th className="app-th">Units Sold</th>
                    <th className="app-th">Revenue</th>
                    <th className="app-th">Avg Sale</th>
                    <th className="app-th">Avg Days To Sell</th>
                  </tr>
                </thead>

                <tbody>
                  {topPlayers.map((player, index) => (
                    <tr key={player.playerName} className="app-tr">
                      <td className="app-td">{index + 1}</td>

                      <td className="app-td font-semibold text-white">
                        {player.playerName}
                      </td>

                      <td className="app-td">{player.totalSold}</td>

                      <td className="app-td">
                        {money(player.totalRevenue)}
                      </td>

                      <td className="app-td">
                        {money(player.averageSalePrice)}
                      </td>

                      <td className="app-td">
                        {player.averageDaysToSell.toFixed(1)} days
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="app-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">Fastest Sellers</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Players with the lowest average days to sell.
              </p>
            </div>

            <div className="app-badge app-badge-info">Top 10</div>
          </div>

          {fastestSellers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
              No matching fastest-seller results for the selected filters.
            </div>
          ) : (
            <div className="space-y-2">
              {fastestSellers.map((player, index) => (
                <div
                  key={`${player.playerName}-fastest`}
                  className="app-card-tight flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {index + 1}. {player.playerName}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {player.totalSold} sold · {money(player.totalRevenue)} revenue
                    </div>
                  </div>

                  <div className="shrink-0 text-sm font-semibold text-emerald-300">
                    {player.averageDaysToSell.toFixed(1)} days
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="app-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">Highest Revenue Players</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Players generating the most total sales revenue.
              </p>
            </div>

            <div className="app-badge app-badge-info">Top 10</div>
          </div>

          {highestRevenuePlayers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
              No matching revenue leaders for the selected filters.
            </div>
          ) : (
            <div className="space-y-2">
              {highestRevenuePlayers.map((player, index) => (
                <div
                  key={`${player.playerName}-revenue`}
                  className="app-card-tight flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {index + 1}. {player.playerName}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {player.totalSold} sold · avg {money(player.averageSalePrice)}
                    </div>
                  </div>

                  <div className="shrink-0 text-sm font-semibold text-emerald-300">
                    {money(player.totalRevenue)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="app-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">Top Sets</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Highest-volume sets/products lines in the selected Pulse range.
              </p>
            </div>

            <div className="app-badge app-badge-info">Top 10</div>
          </div>

          {topSets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
              No matching set trends for the selected filters.
            </div>
          ) : (
            <div className="space-y-2">
              {topSets.map((set, index) => (
                <div
                  key={`${set.name}-set`}
                  className="app-card-tight flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">
                      {index + 1}. {set.name}
                    </div>
                    <div className="text-xs text-zinc-400">
                      avg {money(set.averageSalePrice)} · {money(set.totalRevenue)} revenue
                    </div>
                  </div>

                  <div className="shrink-0 text-sm font-semibold text-emerald-300">
                    {set.totalSold} sold
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="app-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">Top Products</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Highest-volume specific items/products in the selected Pulse range.
              </p>
            </div>

            <div className="app-badge app-badge-info">Top 10</div>
          </div>

          {topProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
              No matching product trends for the selected filters.
            </div>
          ) : (
            <div className="space-y-2">
              {topProducts.map((product, index) => (
                <div
                  key={`${product.name}-product`}
                  className="app-card-tight flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">
                      {index + 1}. {product.name}
                    </div>
                    <div className="text-xs text-zinc-400">
                      avg {money(product.averageSalePrice)} · {money(product.totalRevenue)} revenue
                    </div>
                  </div>

                  <div className="shrink-0 text-sm font-semibold text-emerald-300">
                    {product.totalSold} sold
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="app-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">Player Trend Movement</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Current {activePeriodLabel} compared to the previous matching period.
              </p>
            </div>

            <div className="app-badge app-badge-info">Top 10</div>
          </div>

          {playerTrendMovement.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
              No matching player movement for the selected filters.
            </div>
          ) : (
            <div className="space-y-2">
              {playerTrendMovement.map((player, index) => (
                <div
                  key={`${player.name}-player-trend`}
                  className="app-card-tight flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">
                      {index + 1}. {player.name}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {player.totalSold} now · {player.previousSold} previous · {money(player.totalRevenue)} revenue
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-emerald-300">
                      {player.trendLabel}
                    </div>
                    <div className="text-xs text-zinc-400">{trendText(player)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="app-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">Set Trend Movement</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Sets gaining or losing sales volume against the previous matching period.
              </p>
            </div>

            <div className="app-badge app-badge-info">Top 10</div>
          </div>

          {setTrendMovement.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
              No matching set movement for the selected filters.
            </div>
          ) : (
            <div className="space-y-2">
              {setTrendMovement.map((set, index) => (
                <div
                  key={`${set.name}-set-trend`}
                  className="app-card-tight flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">
                      {index + 1}. {set.name}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {set.totalSold} now · {set.previousSold} previous · {money(set.totalRevenue)} revenue
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-emerald-300">
                      {set.trendLabel}
                    </div>
                    <div className="text-xs text-zinc-400">{trendText(set)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="app-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">Top Categories</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Highest-volume market categories.
              </p>
            </div>

            <div className="app-badge app-badge-info">Top 10</div>
          </div>

          {topCategories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
              No matching category trends for the selected filters.
            </div>
          ) : (
            <div className="space-y-2">
              {topCategories.map(([name, count], index) => (
                <div
                  key={name}
                  className="app-card-tight flex items-center justify-between gap-3 p-3"
                >
                  <div className="text-sm font-semibold text-white">
                    {index + 1}. {name}
                  </div>
                  <div className="text-sm font-semibold text-emerald-300">
                    {count} sold
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="app-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">Top Subcategories</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Highest-volume subcategories within Pulse.
              </p>
            </div>

            <div className="app-badge app-badge-info">Top 10</div>
          </div>

          {topSubcategories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
              No matching subcategory trends for the selected filters.
            </div>
          ) : (
            <div className="space-y-2">
              {topSubcategories.map(([name, count], index) => (
                <div
                  key={name}
                  className="app-card-tight flex items-center justify-between gap-3 p-3"
                >
                  <div className="text-sm font-semibold text-white">
                    {index + 1}. {name}
                  </div>
                  <div className="text-sm font-semibold text-emerald-300">
                    {count} sold
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
