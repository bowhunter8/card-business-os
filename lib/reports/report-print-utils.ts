export type PrintableReportColumn = {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
  width?: string
}

export type PrintableReportRow = Record<string, string | number | null | undefined>

export type PrintableReportConfig = {
  title: string
  subtitle?: string
  summary?: {
    label: string
    value: string | number
  }[]
  columns: PrintableReportColumn[]
  rows: PrintableReportRow[]
  emptyMessage?: string
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderSummary(summary?: PrintableReportConfig['summary']) {
  if (!summary || summary.length === 0) {
    return ''
  }

  return `
    <section class="report-summary">
      ${summary
        .map(
          (item) => `
            <div class="summary-card">
              <div class="summary-label">${escapeHtml(item.label)}</div>
              <div class="summary-value">${escapeHtml(item.value)}</div>
            </div>
          `,
        )
        .join('')}
    </section>
  `
}

function renderTable({
  columns,
  rows,
  emptyMessage,
}: {
  columns: PrintableReportColumn[]
  rows: PrintableReportRow[]
  emptyMessage?: string
}) {
  if (rows.length === 0) {
    return `
      <div class="report-empty">
        ${escapeHtml(emptyMessage || 'No records found.')}
      </div>
    `
  }

  return `
    <table class="report-table">
      <thead>
        <tr>
          ${columns
            .map(
              (column) => `
                <th
                  style="
                    text-align:${column.align || 'left'};
                    width:${column.width || 'auto'};
                  "
                >
                  ${escapeHtml(column.label)}
                </th>
              `,
            )
            .join('')}
        </tr>
      </thead>

      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                ${columns
                  .map(
                    (column) => `
                      <td style="text-align:${column.align || 'left'};">
                        ${escapeHtml(row[column.key] ?? '')}
                      </td>
                    `,
                  )
                  .join('')}
              </tr>
            `,
          )
          .join('')}
      </tbody>
    </table>
  `
}

export function buildPrintableReportHtml({
  title,
  subtitle,
  summary,
  columns,
  rows,
  emptyMessage,
}: PrintableReportConfig) {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />

        <title>${escapeHtml(title)}</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 32px;
            background: #ffffff;
            color: #111111;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
          }

          .report-shell {
            width: 100%;
          }

          .report-title {
            margin: 0;
            font-size: 32px;
            font-weight: 700;
          }

          .report-subtitle {
            margin-top: 6px;
            margin-bottom: 24px;
            color: #555555;
            font-size: 14px;
          }

          .report-summary {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
            margin-bottom: 24px;
          }

          .summary-card {
            border: 1px solid #d4d4d8;
            padding: 12px;
          }

          .summary-label {
            color: #666666;
            font-size: 11px;
            margin-bottom: 4px;
            text-transform: uppercase;
          }

          .summary-value {
            font-size: 22px;
            font-weight: 700;
          }

          .report-table {
            width: 100%;
            border-collapse: collapse;
          }

          .report-table thead th {
            border-bottom: 2px solid #18181b;
            background: #f4f4f5;
            padding: 10px 8px;
            font-size: 11px;
            text-transform: uppercase;
          }

          .report-table tbody td {
            border-bottom: 1px solid #e4e4e7;
            padding: 8px;
            vertical-align: top;
          }

          .report-table tbody tr:nth-child(even) {
            background: #fafafa;
          }

          .report-empty {
            padding: 24px;
            border: 1px solid #d4d4d8;
            background: #fafafa;
          }

          @media print {
            body {
              padding: 16px;
            }

            .summary-card {
              break-inside: avoid;
            }

            .report-table tr {
              break-inside: avoid;
            }
          }
        </style>
      </head>

      <body>
        <main class="report-shell">
          <h1 class="report-title">
            ${escapeHtml(title)}
          </h1>

          ${
            subtitle
              ? `
                <div class="report-subtitle">
                  ${escapeHtml(subtitle)}
                </div>
              `
              : ''
          }

          ${renderSummary(summary)}

          ${renderTable({
            columns,
            rows,
            emptyMessage,
          })}
        </main>
      </body>
    </html>
  `
}