export type ReportPresetType = 'inventory' | 'sales' | 'expenses' | 'tax'

export type ReportPreset = {
  id: string
  reportType: ReportPresetType
  name: string
  description: string
  params: Record<string, string>
}

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