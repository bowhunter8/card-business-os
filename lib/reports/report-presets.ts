export type ReportPresetType = 'inventory' | 'sales' | 'expenses' | 'tax'

export type ReportPreset = {
  id: string
  reportType: ReportPresetType
  name: string
  description: string
  params: Record<string, string>
}

export type ReportPresetSearchParams = Record<
  string,
  string | number | null | undefined
>

export const BUILT_IN_REPORT_PRESETS: ReportPreset[] = [
  {
    id: 'inventory-available',
    reportType: 'inventory',
    name: 'Available Inventory',
    description: 'Items marked available and ready for listing or sale.',
    params: {
      status: 'available',
    },
  },
  {
    id: 'inventory-listed',
    reportType: 'inventory',
    name: 'Listed Inventory',
    description: 'Items currently listed for sale.',
    params: {
      status: 'listed',
    },
  },
  {
    id: 'inventory-personal',
    reportType: 'inventory',
    name: 'Personal Collection',
    description: 'Items marked as personal collection.',
    params: {
      status: 'personal',
    },
  },
  {
    id: 'sales-yearly',
    reportType: 'sales',
    name: 'Yearly Sales Review',
    description: 'Current-year sales, COGS, fees, net proceeds, and profit.',
    params: {
      period: 'yearly',
    },
  },
  {
    id: 'sales-monthly',
    reportType: 'sales',
    name: 'Monthly Sales Review',
    description: 'Monthly sales, fees, realized COGS, and profit review.',
    params: {
      period: 'monthly',
    },
  },
  {
    id: 'expenses-yearly',
    reportType: 'expenses',
    name: 'Yearly Expense Review',
    description: 'Current-year manual expenses grouped by category and Schedule C area.',
    params: {
      period: 'yearly',
    },
  },
  {
    id: 'expenses-giveaways',
    reportType: 'expenses',
    name: 'Giveaway / Advertising Review',
    description: 'Review giveaway and advertising-related expenses for tax support.',
    params: {
      category: 'Giveaways',
    },
  },
  {
    id: 'tax-year-end',
    reportType: 'tax',
    name: 'Year-End Tax Review',
    description: 'Year-end tax review, Schedule C support, inventory, COGS, and deductions.',
    params: {
      period: 'yearly',
    },
  },
]

function normalizeParamValue(value: string | number | null | undefined) {
  return String(value ?? '').trim().toLowerCase()
}

export function getReportPresets(reportType?: ReportPresetType) {
  if (!reportType) {
    return BUILT_IN_REPORT_PRESETS
  }

  return BUILT_IN_REPORT_PRESETS.filter((preset) => preset.reportType === reportType)
}

export function buildPresetHref(basePath: string, preset: ReportPreset) {
  const searchParams = new URLSearchParams(preset.params)

  const query = searchParams.toString()

  return `${basePath}${query ? `?${query}` : ''}`
}

export function isReportPresetActive(
  preset: ReportPreset,
  searchParams: ReportPresetSearchParams
) {
  return Object.entries(preset.params).every(([key, presetValue]) => {
    return normalizeParamValue(searchParams[key]) === normalizeParamValue(presetValue)
  })
}

export function getActiveReportPreset(
  reportType: ReportPresetType,
  searchParams: ReportPresetSearchParams
) {
  return getReportPresets(reportType).find((preset) =>
    isReportPresetActive(preset, searchParams)
  )
}

export function reportPresetShortcutClass(active: boolean) {
  if (active) {
    return 'rounded-full border border-emerald-700 bg-emerald-950/60 px-3 py-1 text-xs font-semibold text-emerald-200 shadow-sm shadow-emerald-950/40'
  }

  return 'rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs font-medium text-zinc-300 transition hover:bg-zinc-900'
}
