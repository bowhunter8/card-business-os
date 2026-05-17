type ReportUrlParams = Record<string, string | number | null | undefined>

function cleanParams(params: ReportUrlParams) {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    const clean = String(value ?? '').trim()

    if (clean) {
      searchParams.set(key, clean)
    }
  })

  return searchParams.toString()
}

export function buildReportCsvHref(reportType: string, params: ReportUrlParams = {}) {
  const query = cleanParams(params)
  return `/api/reports/${reportType}/export${query ? `?${query}` : ''}`
}

export function buildReportPdfHref(reportType: string, params: ReportUrlParams = {}) {
  const query = cleanParams(params)
  return `/api/reports/${reportType}/PDF${query ? `?${query}` : ''}`
}

export function buildReportPrintHref(reportType: string, params: ReportUrlParams = {}) {
  const query = cleanParams(params)
  return `/api/reports/${reportType}/print${query ? `?${query}` : ''}`
}