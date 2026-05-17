'use client'

type ReportExportButtonsProps = {
  csvHref?: string
  pdfHref?: string
  printHref?: string
  loading?: boolean
}

function ExportLink({
  href,
  label,
  loading,
  openInNewTab = false,
}: {
  href: string
  label: string
  loading: boolean
  openInNewTab?: boolean
}) {
  return (
    <a
      href={loading ? undefined : href}
      aria-disabled={loading}
      target={openInNewTab ? '_blank' : undefined}
      rel={openInNewTab ? 'noreferrer' : undefined}
      className={`app-button whitespace-nowrap px-3 py-1.5 text-sm ${
        loading ? 'pointer-events-none opacity-60' : ''
      }`}
    >
      {label}
    </a>
  )
}

function DisabledExportButton({
  label,
}: {
  label: string
}) {
  return (
    <button
      type="button"
      disabled
      className="app-button whitespace-nowrap px-3 py-1.5 text-sm opacity-60"
      title="This export route has not been wired yet."
    >
      {label}
    </button>
  )
}

export default function ReportExportButtons({
  csvHref,
  pdfHref,
  printHref,
  loading = false,
}: ReportExportButtonsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {csvHref ? (
        <ExportLink
          href={csvHref}
          label="Download CSV"
          loading={loading}
        />
      ) : (
        <DisabledExportButton label="Download CSV" />
      )}

      {pdfHref ? (
        <ExportLink
          href={pdfHref}
          label="Download PDF"
          loading={loading}
        />
      ) : (
        <DisabledExportButton label="Download PDF" />
      )}

      {printHref ? (
        <ExportLink
          href={printHref}
          label="Print Page"
          loading={loading}
          openInNewTab
        />
      ) : (
        <button
          type="button"
          disabled={loading}
          onClick={() => window.print()}
          className={`app-button whitespace-nowrap px-3 py-1.5 text-sm ${
            loading ? 'opacity-60' : ''
          }`}
        >
          Print Page
        </button>
      )}
    </div>
  )
}
