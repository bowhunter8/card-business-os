import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  buildReportCsvHref,
  buildReportPdfHref,
  buildReportPrintHref,
} from '@/lib/reports/report-url-utils'

import ReportDateFilters from '@/app/app/components/reports/ReportDateFilters'
import ReportExportButtons from '@/app/app/components/reports/ReportExportButtons'
import ReportSummaryCards from '@/app/app/components/reports/ReportSummaryCards'
import ReportTable from '@/app/app/components/reports/ReportTable'

type SearchParams = {
  q?: string
  platform?: string
  responsibility?: string
  channel?: string
  taxState?: string
  period?: string
  date?: string
  year?: string
  month?: string
  quarter?: string
  startDate?: string
  endDate?: string
  dateFrom?: string
  dateTo?: string
  start?: string
  end?: string
}

type SaleRow = {
  id: string
  sale_date: string | null
  gross_sale: number | null
  platform_fees: number | null
  shipping_cost: number | null
  other_costs: number | null
  net_proceeds: number | null
  sales_tax_collected: number | null
  sales_tax_responsibility: string | null
  sales_channel_type: string | null
  tax_state: string | null
  tax_notes: string | null
  platform: string | null
  notes: string | null
}

const RESPONSIBILITY_OPTIONS = [
  { value: '', label: 'All tax responsibility' },
  { value: 'marketplace_collected', label: 'Marketplace collected/remitted' },
  { value: 'seller_collected', label: 'Seller collected / may need to remit' },
  { value: 'not_collected', label: 'No tax collected' },
  { value: 'exempt_or_not_taxable', label: 'Exempt / not taxable' },
]

const CHANNEL_OPTIONS = [
  { value: '', label: 'All channels' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'local_sale', label: 'Local sale' },
  { value: 'card_show', label: 'Card show' },
  { value: 'direct_private', label: 'Direct/private' },
]

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0

  const numeric =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/[^0-9.-]/g, ''))

  return Number.isFinite(numeric) ? numeric : 0
}

function formatCurrency(value: unknown) {
  return currencyFormatter.format(asNumber(value))
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'

  const clean = String(value).slice(0, 10)
  const parts = clean.split('-').map((part) => Number(part))

  if (parts.length === 3) {
    const [year, month, day] = parts

    if (year && month && day) {
      const localDate = new Date(year, month - 1, day)

      if (!Number.isNaN(localDate.getTime())) {
        return dateFormatter.format(localDate)
      }
    }
  }

  const fallbackDate = new Date(value)
  if (Number.isNaN(fallbackDate.getTime())) return value

  return dateFormatter.format(fallbackDate)
}

function saleDateKey(value: string | null | undefined) {
  if (!value) return ''
  return String(value).slice(0, 10)
}


function dateToInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseInputDate(value: string | undefined | null, fallback: Date) {
  if (!value) return fallback

  const parts = value.split('-').map((part) => Number(part))
  if (parts.length !== 3) return fallback

  const [year, month, day] = parts
  if (!year || !month || !day) return fallback

  const date = new Date(year, month - 1, day)

  return Number.isNaN(date.getTime()) ? fallback : date
}

function getStartOfWeek(date: Date) {
  const result = new Date(date)
  const day = result.getDay()
  const diff = day === 0 ? -6 : 1 - day

  result.setDate(result.getDate() + diff)

  return result
}

function getEndOfWeek(date: Date) {
  const result = getStartOfWeek(date)
  result.setDate(result.getDate() + 6)

  return result
}

function clampYear(raw?: string) {
  const currentYear = new Date().getFullYear()
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > currentYear + 1) {
    return currentYear
  }

  return parsed
}

function clampMonth(raw?: string) {
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) {
    return new Date().getMonth() + 1
  }

  return parsed
}

function clampQuarter(raw?: string) {
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 4) {
    return Math.floor(new Date().getMonth() / 3) + 1
  }

  return parsed
}

function resolveReportDateRange(params: SearchParams) {
  const selectedPeriod = String(params.period || 'monthly').trim()
  const selectedYear = clampYear(params.year)
  const selectedMonth = clampMonth(params.month)
  const selectedQuarter = clampQuarter(params.quarter)

  const explicitStart = params.startDate || params.dateFrom || params.start || ''
  const explicitEnd = params.endDate || params.dateTo || params.end || ''
  const selectedDate = params.date || ''

  const today = new Date()
  const defaultAnchor =
    selectedYear === today.getFullYear() ? today : new Date(selectedYear, 0, 1)

  if (selectedPeriod === 'daily' || selectedPeriod === 'day') {
    const selectedDay = parseInputDate(selectedDate, defaultAnchor)

    return {
      startDate: dateToInputValue(selectedDay),
      endDate: dateToInputValue(selectedDay),
    }
  }

  if (selectedPeriod === 'weekly' || selectedPeriod === 'week') {
    const selectedDay = parseInputDate(selectedDate, defaultAnchor)
    const weekStart = getStartOfWeek(selectedDay)
    const weekEnd = getEndOfWeek(selectedDay)

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
    }
  }

  if (selectedPeriod === 'monthly' || selectedPeriod === 'month') {
    const monthStart = new Date(selectedYear, selectedMonth - 1, 1)
    const monthEnd = new Date(selectedYear, selectedMonth, 0)

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
    }
  }

  if (selectedPeriod === 'quarterly' || selectedPeriod === 'quarter') {
    const quarterStartMonth = (selectedQuarter - 1) * 3
    const quarterStart = new Date(selectedYear, quarterStartMonth, 1)
    const quarterEnd = new Date(selectedYear, quarterStartMonth + 3, 0)

    return {
      startDate: dateToInputValue(quarterStart),
      endDate: dateToInputValue(quarterEnd),
    }
  }

  if (selectedPeriod === 'yearly' || selectedPeriod === 'year') {
    return {
      startDate: `${selectedYear}-01-01`,
      endDate: `${selectedYear}-12-31`,
    }
  }

  if (selectedPeriod === 'custom') {
    const fallbackStart = new Date(selectedYear, 0, 1)
    const fallbackEnd = new Date(selectedYear, 11, 31)
    const parsedStart = parseInputDate(explicitStart, fallbackStart)
    const parsedEnd = parseInputDate(explicitEnd, fallbackEnd)
    const normalizedStart =
      parsedStart.getTime() <= parsedEnd.getTime() ? parsedStart : parsedEnd
    const normalizedEnd =
      parsedStart.getTime() <= parsedEnd.getTime() ? parsedEnd : parsedStart

    return {
      startDate: dateToInputValue(normalizedStart),
      endDate: dateToInputValue(normalizedEnd),
    }
  }

  return {
    startDate: '',
    endDate: '',
  }
}

function formatResponsibility(value: string | null | undefined) {
  if (value === 'marketplace_collected') return 'Marketplace collected/remitted'
  if (value === 'seller_collected') return 'Seller collected / may need to remit'
  if (value === 'not_collected') return 'No tax collected'
  if (value === 'exempt_or_not_taxable') return 'Exempt / not taxable'
  return 'Not set'
}

function formatChannel(value: string | null | undefined) {
  if (value === 'marketplace') return 'Marketplace'
  if (value === 'local_sale') return 'Local sale'
  if (value === 'card_show') return 'Card show'
  if (value === 'direct_private') return 'Direct/private'
  return 'Not set'
}

function matchesSearch(sale: SaleRow, search: string) {
  if (!search) return true

  const haystack = [
    sale.sale_date,
    sale.platform,
    sale.gross_sale,
    sale.net_proceeds,
    sale.sales_tax_collected,
    sale.sales_tax_responsibility,
    sale.sales_channel_type,
    sale.tax_state,
    sale.tax_notes,
    sale.notes,
  ]
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ')

  return haystack.includes(search.toLowerCase())
}

export default async function SalesTaxReportPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const resolvedSearchParams = (await searchParams) || {}

  const search = resolvedSearchParams.q?.trim() || ''
  const selectedPlatform = resolvedSearchParams.platform?.trim() || ''
  const selectedResponsibility = resolvedSearchParams.responsibility?.trim() || ''
  const selectedChannel = resolvedSearchParams.channel?.trim() || ''
  const selectedTaxState = resolvedSearchParams.taxState?.trim().toUpperCase() || ''
  const selectedPeriod = resolvedSearchParams.period || 'monthly'
  const selectedYear = clampYear(resolvedSearchParams.year)
  const selectedMonth = clampMonth(resolvedSearchParams.month)
  const selectedQuarter = clampQuarter(resolvedSearchParams.quarter)
  const resolvedDateRange = resolveReportDateRange(resolvedSearchParams)
  const startDate = resolvedDateRange.startDate
  const endDate = resolvedDateRange.endDate

  const exportParams = {
    q: search,
    platform: selectedPlatform,
    responsibility: selectedResponsibility,
    channel: selectedChannel,
    taxState: selectedTaxState,
    period: selectedPeriod,
    date: resolvedSearchParams.date || '',
    year: String(selectedYear),
    month: String(selectedMonth),
    quarter: String(selectedQuarter),
    startDate,
    endDate,
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let sales: SaleRow[] = []
  let loadError = ''

  let query = supabase
    .from('sales')
    .select(`
      id,
      sale_date,
      gross_sale,
      platform_fees,
      shipping_cost,
      other_costs,
      net_proceeds,
      sales_tax_collected,
      sales_tax_responsibility,
      sales_channel_type,
      tax_state,
      tax_notes,
      platform,
      notes
    `)
    .eq('user_id', user?.id || '')
    .is('reversed_at', null)
    .order('sale_date', { ascending: false })


  if (!user) {
    loadError = 'You must be signed in to view this report.'
  } else {
    const { data, error } = await query

    if (error) {
      loadError = error.message
    } else {
      sales = ((data ?? []) as SaleRow[]).filter((sale) => {
        const saleDate = saleDateKey(sale.sale_date)

        if (startDate && saleDate && saleDate < startDate) {
          return false
        }

        if (endDate && saleDate && saleDate > endDate) {
          return false
        }

        if (selectedPlatform) {
          const platform = String(sale.platform || '').toLowerCase()
          if (!platform.includes(selectedPlatform.toLowerCase())) return false
        }

        if (selectedResponsibility && sale.sales_tax_responsibility !== selectedResponsibility) {
          return false
        }

        if (selectedChannel && sale.sales_channel_type !== selectedChannel) {
          return false
        }

        if (selectedTaxState && String(sale.tax_state || '').toUpperCase() !== selectedTaxState) {
          return false
        }

        return matchesSearch(sale, search)
      })
    }
  }

  const totalTaxCollected = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.sales_tax_collected), 0)
  )
  const marketplaceTax = roundMoney(
    sales
      .filter((row) => row.sales_tax_responsibility === 'marketplace_collected')
      .reduce((sum, row) => sum + asNumber(row.sales_tax_collected), 0)
  )
  const sellerResponsibleTax = roundMoney(
    sales
      .filter((row) => row.sales_tax_responsibility === 'seller_collected')
      .reduce((sum, row) => sum + asNumber(row.sales_tax_collected), 0)
  )
  const noTaxCollectedCount = sales.filter((row) => row.sales_tax_responsibility === 'not_collected').length
  const exemptCount = sales.filter((row) => row.sales_tax_responsibility === 'exempt_or_not_taxable').length
  const grossSales = roundMoney(sales.reduce((sum, row) => sum + asNumber(row.gross_sale), 0))

  return (
    <main className="app-page space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Reports</p>
          <h1 className="app-title">Sales Tax Report</h1>
          <p className="app-subtitle">
            Reconcile marketplace-collected tax separately from seller-collected tax that may need to be remitted.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/reports" className="app-button" prefetch={false}>
            Back to Reports
          </Link>

          <Link href="/app/reports/tax" className="app-button" prefetch={false}>
            Financial Reports
          </Link>

          <ReportExportButtons
            csvHref={buildReportCsvHref('sales-tax', exportParams)}
            pdfHref={buildReportPdfHref('sales-tax', exportParams)}
            printHref={buildReportPrintHref('sales-tax', exportParams)}
          />
        </div>
      </div>

      {loadError ? (
        <section className="app-section border-red-900 bg-red-950/30">
          <h2 className="text-lg font-semibold text-red-100">Sales tax report could not load</h2>
          <p className="mt-1 text-sm text-red-200">
            Supabase returned an error while loading sales: {loadError}
          </p>
        </section>
      ) : null}

      <section className="app-alert-info">
        Marketplace-collected/remitted tax is for reconciliation. Seller-collected tax is the amount to review for possible monthly, quarterly, or year-end remittance.
      </section>

      <form action="/app/reports/sales-tax" method="get" className="space-y-3">
        <ReportDateFilters
          period={selectedPeriod}
          date={resolvedSearchParams.date || startDate}
          year={resolvedSearchParams.year || String(selectedYear)}
          month={resolvedSearchParams.month || String(selectedMonth)}
          quarter={resolvedSearchParams.quarter || String(selectedQuarter)}
          startDate={startDate}
          endDate={endDate}
          resetHref="/app/reports/sales-tax"
        >
          <>
            <label className="block xl:col-span-2">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Search
              </span>

              <input
                name="q"
                type="search"
                defaultValue={search}
                placeholder="Platform, tax notes, sale notes..."
                className="app-input h-9 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Platform
              </span>

              <input
                name="platform"
                type="text"
                defaultValue={selectedPlatform}
                placeholder="All platforms"
                className="app-input h-9 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Tax State
              </span>

              <input
                name="taxState"
                type="text"
                maxLength={2}
                defaultValue={selectedTaxState}
                placeholder="All states"
                className="app-input h-9 text-sm uppercase"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Tax Responsibility
              </span>

              <select
                name="responsibility"
                defaultValue={selectedResponsibility}
                className="app-select h-9 text-sm"
              >
                {RESPONSIBILITY_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Sales Channel
              </span>

              <select
                name="channel"
                defaultValue={selectedChannel}
                className="app-select h-9 text-sm"
              >
                {CHANNEL_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        </ReportDateFilters>
      </form>

      <ReportSummaryCards
        cards={[
          {
            label: 'Total Tax Collected',
            value: formatCurrency(totalTaxCollected),
            note: 'All tracked sales tax',
          },
          {
            label: 'Marketplace Handled',
            value: formatCurrency(marketplaceTax),
            note: 'Collected/remitted by platform',
          },
          {
            label: 'Seller Review',
            value: formatCurrency(sellerResponsibleTax),
            note: 'Possible remittance review',
          },
          {
            label: 'Gross Sales In Range',
            value: formatCurrency(grossSales),
            note: 'Matching non-reversed sales',
          },
          {
            label: 'Sales Count',
            value: sales.length.toLocaleString(),
            note: 'Filtered sale records',
          },
          {
            label: 'No Tax Collected',
            value: noTaxCollectedCount.toLocaleString(),
            note: 'Review local/direct sales',
          },
          {
            label: 'Exempt / Not Taxable',
            value: exemptCount.toLocaleString(),
            note: 'Documented exempt records',
          },
        ]}
      />

      <section className="grid gap-3 md:grid-cols-2">
        <div className="app-section space-y-1">
          <h2 className="text-base font-semibold text-zinc-100">Current Selection</h2>
          <p className="text-sm text-zinc-400">
            Date range: {startDate || 'Beginning'} to {endDate || 'Today'}. Platform: {selectedPlatform || 'All platforms'}.
          </p>
          <p className="text-sm text-zinc-400">
            Responsibility: {formatResponsibility(selectedResponsibility || null)}. Channel: {formatChannel(selectedChannel || null)}.
          </p>
        </div>

        <div className="app-section space-y-1">
          <h2 className="text-base font-semibold text-zinc-100">Tax Responsibility Review</h2>
          <p className="text-sm text-zinc-400">
            Marketplace handled: {formatCurrency(marketplaceTax)}. Seller review / possible remit: {formatCurrency(sellerResponsibleTax)}.
          </p>
          <p className="text-sm text-zinc-400">
            Seller-collected tax should be reviewed for monthly, quarterly, or year-end remittance requirements.
          </p>
        </div>
      </section>

      <section className="app-section space-y-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">Sales Tax Detail</h2>
          <p className="text-sm text-zinc-400">
            Report-only sales tax detail. Use the sale record to correct tax responsibility, channel, state, or notes.
          </p>
        </div>

        <ReportTable
          rows={sales}
          emptyMessage="No sales tax records matched those filters."
          columns={[
            {
              key: 'date',
              label: 'Date',
              render: (sale) => formatDate(sale.sale_date),
            },
            {
              key: 'platform',
              label: 'Platform',
              render: (sale) => sale.platform || '—',
            },
            {
              key: 'channel',
              label: 'Channel',
              render: (sale) => formatChannel(sale.sales_channel_type),
            },
            {
              key: 'responsibility',
              label: 'Responsibility',
              render: (sale) => formatResponsibility(sale.sales_tax_responsibility),
            },
            {
              key: 'state',
              label: 'State',
              render: (sale) => sale.tax_state || '—',
            },
            {
              key: 'tax',
              label: 'Tax Collected',
              align: 'right',
              render: (sale) => formatCurrency(sale.sales_tax_collected),
            },
            {
              key: 'gross',
              label: 'Gross Sale',
              align: 'right',
              render: (sale) => formatCurrency(sale.gross_sale),
            },
            {
              key: 'notes',
              label: 'Notes',
              className: 'max-w-[280px]',
              render: (sale) => (
                <div className="line-clamp-2 text-zinc-300">
                  {sale.tax_notes || sale.notes || '—'}
                </div>
              ),
            },
          ]}
        />
      </section>
    </main>
  )
}
