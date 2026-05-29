import Link from 'next/link'
import { getTopSellingPlayers } from '@/lib/analytics/market-analytics'

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

function buildPulseHref({
  period,
  category,
  subcategory,
  q,
}: {
  period: PulsePeriod
  category?: string
  subcategory?: string
  q?: string
}) {
  const params = new URLSearchParams()

  params.set('period', period)

  if (category) params.set('category', category)
  if (subcategory) params.set('subcategory', subcategory)
  if (q) params.set('q', q)

  return `/app/hits-pulse?${params.toString()}`
}

function FilterChip({
  href,
  label,
  active,
}: {
  href: string
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={`app-chip whitespace-nowrap ${active ? 'app-chip-active' : 'app-chip-idle'}`}
    >
      {label}
    </Link>
  )
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
  const subcategoryOptions = category ? SUBCATEGORY_OPTIONS_BY_CATEGORY[category] ?? [] : []

  const topPlayers = await getTopSellingPlayers({
    days,
    limit: 25,
  })

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

      <div className="app-section space-y-4">
        <div>
          <div className="text-sm font-semibold text-zinc-200">Date range</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map((option) => (
              <FilterChip
                key={option.value}
                label={option.label}
                active={period === option.value}
                href={buildPulseHref({
                  period: option.value,
                  category,
                  subcategory,
                  q,
                })}
              />
            ))}
          </div>
        </div>

        <form action="/app/hits-pulse" className="grid gap-3 xl:grid-cols-[1fr_1fr_1.25fr_auto]">
          <input type="hidden" name="period" value={period} />

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">Category</span>
            <select name="category" defaultValue={category} className="app-select w-full">
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option || 'all'} value={option}>
                  {option || 'All categories'}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">Subcategory</span>
            <select
              name="subcategory"
              defaultValue={subcategory}
              className="app-select w-full"
              disabled={!category}
            >
              <option value="">
                {category ? 'All subcategories' : 'Choose a category first'}
              </option>
              {subcategoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-300">Search</span>
            <input
              name="q"
              defaultValue={q}
              className="app-input w-full"
              placeholder="Search player, card, set, team..."
            />
          </label>

          <div className="flex items-end gap-2">
            <button className="app-button-primary whitespace-nowrap" type="submit">
              Search
            </button>

            <Link href="/app/hits-pulse" className="app-button whitespace-nowrap">
              Reset
            </Link>
          </div>
        </form>

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
          Category, subcategory, and search controls are wired into the page state now. The next
          step is updating the Pulse analytics RPC/helper so those filters apply directly to the
          anonymous app-wide aggregate data.
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
            HITS Pulse™ is ready. Trends will appear after sold items are added to the anonymous Pulse event table.
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
                        {player.totalRevenue.toLocaleString(undefined, {
                          style: 'currency',
                          currency: 'USD',
                        })}
                      </td>

                      <td className="app-td">
                        {player.averageSalePrice.toLocaleString(undefined, {
                          style: 'currency',
                          currency: 'USD',
                        })}
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
    </div>
  )
}
