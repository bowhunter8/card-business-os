import { NextResponse } from 'next/server'

export type CsvRow = Record<string, unknown>

export type PdfBody = BodyInit

export function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value)

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }

  return text
}

export function buildCsv(rows: CsvRow[], fallbackMessage = 'No records found.') {
  if (rows.length === 0) {
    return ['message', csvEscape(fallbackMessage)].join(',') + '\n'
  }

  const headers = Object.keys(rows[0])

  return [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n')
}

export function excelSafeCsv(csv: string) {
  return csv.startsWith('\uFEFF') ? csv : `\uFEFF${csv}`
}

export function cleanFilenamePart(value: string) {
  return String(value || 'report')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

export function csvDownloadResponse({
  csv,
  filename,
}: {
  csv: string
  filename: string
}) {
  return new NextResponse(excelSafeCsv(csv), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export function pdfDownloadResponse({
  pdf,
  filename,
}: {
  pdf: PdfBody
  filename: string
}) {
  return new NextResponse(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status })
}

export function unauthorizedError() {
  return jsonError('Unauthorized', 401)
}

export function moneyString(value: unknown) {
  const numberValue = Number(value ?? 0)

  if (!Number.isFinite(numberValue)) {
    return '0.00'
  }

  return numberValue.toFixed(2)
}

export function buildReportFilename({
  reportName,
  startDate,
  endDate,
  extension,
}: {
  reportName: string
  startDate?: string
  endDate?: string
  extension: 'csv' | 'pdf'
}) {
  const cleanReportName = cleanFilenamePart(reportName)
  const cleanStart = startDate ? cleanFilenamePart(startDate) : ''
  const cleanEnd = endDate ? cleanFilenamePart(endDate) : ''

  if (cleanStart && cleanEnd) {
    return `${cleanReportName}-${cleanStart}-to-${cleanEnd}.${extension}`
  }

  return `${cleanReportName}.${extension}`
}

export function htmlEscape(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function formatReportDate(value: string | null | undefined) {
  if (!value) return ''

  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function buildReportHtmlDocument({
  title,
  subtitle,
  generatedAt = new Date(),
  bodyHtml,
}: {
  title: string
  subtitle?: string
  generatedAt?: Date
  bodyHtml: string
}) {
  const generatedLabel = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(generatedAt)

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${htmlEscape(title)}</title>
  <style>
    @page {
      size: letter landscape;
      margin: 0.35in;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: #111827;
      background: #ffffff;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10px;
      line-height: 1.35;
    }

    h1,
    h2,
    h3,
    p {
      margin: 0;
    }

    .report-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 2px solid #111827;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }

    .report-title {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .report-subtitle {
      margin-top: 4px;
      color: #4b5563;
      font-size: 10px;
    }

    .report-generated {
      color: #4b5563;
      font-size: 9px;
      text-align: right;
      white-space: nowrap;
    }

    .report-section {
      margin-top: 12px;
      break-inside: avoid;
    }

    .report-section-title {
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 700;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }

    .summary-card {
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 8px;
      break-inside: avoid;
    }

    .summary-label {
      color: #6b7280;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .summary-value {
      margin-top: 3px;
      font-size: 15px;
      font-weight: 700;
    }

    .summary-note {
      margin-top: 2px;
      color: #6b7280;
      font-size: 8px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    thead {
      display: table-header-group;
    }

    tr {
      break-inside: avoid;
    }

    th {
      border-bottom: 1px solid #111827;
      padding: 5px 4px;
      color: #374151;
      font-size: 8px;
      font-weight: 700;
      text-align: left;
      text-transform: uppercase;
      vertical-align: bottom;
    }

    td {
      border-bottom: 1px solid #e5e7eb;
      padding: 5px 4px;
      vertical-align: top;
      overflow-wrap: anywhere;
    }

    .text-right {
      text-align: right;
    }

    .text-muted {
      color: #6b7280;
    }

    .nowrap {
      white-space: nowrap;
    }

    .footer-note {
      margin-top: 10px;
      color: #6b7280;
      font-size: 8px;
    }
  </style>
</head>
<body>
  <header class="report-header">
    <div>
      <h1 class="report-title">${htmlEscape(title)}</h1>
      ${subtitle ? `<p class="report-subtitle">${htmlEscape(subtitle)}</p>` : ''}
    </div>
    <div class="report-generated">Generated ${htmlEscape(generatedLabel)}</div>
  </header>

  ${bodyHtml}
</body>
</html>`
}
