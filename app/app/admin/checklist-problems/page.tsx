import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type ReportStatus =
  | 'open'
  | 'reviewing'
  | 'source_issue'
  | 'importer_issue'
  | 'resolved'
  | 'dismissed'

type ChecklistProblemReport = {
  id: string
  user_id: string
  checklist_id: string
  checklist_item_id: string | null
  checklist_name: string | null
  section_name: string | null
  team_name: string | null
  card_number: string | null
  player_name: string | null
  problem_type: string
  description: string | null
  expected_value: string | null
  source_file_path: string | null
  screenshot_path: string | null
  source_also_appears_wrong: boolean
  status: ReportStatus
  admin_notes: string | null
  resolution: string | null
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
  updated_at: string
}

type PageProps = {
  searchParams: Promise<{
    status?: string | string[]
    q?: string | string[]
  }>
}

const ATTACHMENT_BUCKET = 'checklist-problem-reports'

const STATUS_OPTIONS: { value: ReportStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'source_issue', label: 'Source Issue' },
  { value: 'importer_issue', label: 'Importer Issue' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
]

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function clean(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function problemTypeLabel(value: string) {
  const labels: Record<string, string> = {
    wrong_team: 'Wrong Team',
    wrong_section: 'Wrong Section',
    missing_card: 'Missing Card',
    duplicate_card: 'Duplicate Card',
    wrong_card_number: 'Wrong Card Number',
    wrong_player: 'Wrong Player',
    wrong_variation: 'Wrong Variation',
    wrong_details: 'Wrong Details',
    import_problem: 'Import Problem',
    other: 'Other',
  }

  return labels[value] ?? value.replaceAll('_', ' ')
}

function statusLabel(value: ReportStatus) {
  return STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value
}

function statusBadgeClass(value: ReportStatus) {
  if (value === 'resolved') return 'app-badge app-badge-success'
  if (value === 'reviewing') return 'app-badge app-badge-info'
  if (value === 'source_issue') return 'app-badge app-badge-info'
  if (value === 'importer_issue') return 'app-badge app-badge-info'
  return 'app-badge'
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function fileNameFromPath(path: string | null | undefined) {
  const value = clean(path)
  if (!value) return ''

  const pieces = value.split('/')
  const raw = pieces[pieces.length - 1] || value

  return raw.replace(/^\d+-/, '')
}

async function requireAdmin() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const email = clean(user.email).toLowerCase()

  if (!email) redirect('/app')

  const { data: appUser, error } = await supabase
    .from('app_users')
    .select('role, is_active')
    .ilike('email', email)
    .maybeSingle()

  if (error || !appUser || appUser.role !== 'admin' || !appUser.is_active) {
    redirect('/app')
  }

  return { supabase, user }
}

async function updateChecklistProblemReport(formData: FormData) {
  'use server'

  const { supabase, user } = await requireAdmin()

  const reportId = clean(String(formData.get('reportId') ?? ''))
  const requestedStatus = clean(String(formData.get('status') ?? '')) as ReportStatus
  const adminNotes = clean(String(formData.get('adminNotes') ?? '')) || null
  const resolution = clean(String(formData.get('resolution') ?? '')) || null

  const validStatus = STATUS_OPTIONS.some(
    (option) => option.value === requestedStatus
  )

  if (!reportId || !validStatus) return

  const resolved = requestedStatus === 'resolved'

  const { error } = await supabase
    .from('checklist_problem_reports')
    .update({
      status: requestedStatus,
      admin_notes: adminNotes,
      resolution,
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? user.id : null,
    })
    .eq('id', reportId)

  if (error) {
    throw new Error(`Unable to update checklist problem report: ${error.message}`)
  }

  revalidatePath('/app/admin/checklist-problems')
}

export default async function ChecklistProblemsAdminPage({
  searchParams,
}: PageProps) {
  const { supabase } = await requireAdmin()
  const params = await searchParams

  const requestedStatus = firstParam(params.status)
  const searchText = firstParam(params.q).trim()
  const normalizedSearch = searchText.toLowerCase()

  const validStatusFilter = STATUS_OPTIONS.some(
    (option) => option.value === requestedStatus
  )

  let query = supabase
    .from('checklist_problem_reports')
    .select(
      'id, user_id, checklist_id, checklist_item_id, checklist_name, section_name, team_name, card_number, player_name, problem_type, description, expected_value, source_file_path, screenshot_path, source_also_appears_wrong, status, admin_notes, resolution, resolved_at, resolved_by, created_at, updated_at'
    )
    .order('created_at', { ascending: false })

  if (validStatusFilter) {
    query = query.eq('status', requestedStatus)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Unable to load checklist problem reports: ${error.message}`)
  }

  const allReports = (data ?? []) as ChecklistProblemReport[]

  const reports = normalizedSearch
    ? allReports.filter((report) => {
        const haystack = [
          report.checklist_name,
          report.section_name,
          report.team_name,
          report.card_number,
          report.player_name,
          report.problem_type,
          report.description,
          report.expected_value,
          report.admin_notes,
          report.resolution,
        ]
          .map((value) => clean(value).toLowerCase())
          .join(' ')

        return haystack.includes(normalizedSearch)
      })
    : allReports

  const statusCounts = new Map<ReportStatus, number>()

  for (const report of allReports) {
    statusCounts.set(report.status, (statusCounts.get(report.status) ?? 0) + 1)
  }

  const attachmentUrls = new Map<string, string>()

  for (const report of reports) {
    const paths = [report.source_file_path, report.screenshot_path].filter(
      (value): value is string => Boolean(clean(value))
    )

    for (const path of paths) {
      if (attachmentUrls.has(path)) continue

      const { data: signedData } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(path, 60 * 30)

      if (signedData?.signedUrl) {
        attachmentUrls.set(path, signedData.signedUrl)
      }
    }
  }

  const openCount = statusCounts.get('open') ?? 0
  const reviewingCount = statusCounts.get('reviewing') ?? 0
  const resolvedCount = statusCounts.get('resolved') ?? 0
  const issueCount =
    (statusCounts.get('source_issue') ?? 0) +
    (statusCounts.get('importer_issue') ?? 0)

  return (
    <div className="app-page-wide space-y-5">
      <div className="app-page-header">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="app-badge app-badge-info">Admin</span>
            <span className="app-badge">Checklist Quality</span>
          </div>

          <h1 className="app-title">Checklist Problems</h1>
          <p className="app-subtitle">
            Review user-reported checklist problems, source-file issues, and importer problems.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/admin" className="app-button">
            Back to Admin
          </Link>
          <Link href="/app/checklists" className="app-button">
            Checklist Library
          </Link>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="app-section p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Total
          </div>
          <div className="mt-1 text-2xl font-bold">{allReports.length}</div>
        </div>

        <div className="app-section p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Open
          </div>
          <div className="mt-1 text-2xl font-bold">{openCount}</div>
        </div>

        <div className="app-section p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Reviewing
          </div>
          <div className="mt-1 text-2xl font-bold">{reviewingCount}</div>
        </div>

        <div className="app-section p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Classified Issues
          </div>
          <div className="mt-1 text-2xl font-bold">{issueCount}</div>
        </div>

        <div className="app-section p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Resolved
          </div>
          <div className="mt-1 text-2xl font-bold">{resolvedCount}</div>
        </div>
      </section>

      <section className="app-section space-y-4 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/app/admin/checklist-problems"
              className={!validStatusFilter ? 'app-button-primary' : 'app-button'}
            >
              All
            </Link>

            {STATUS_OPTIONS.map((option) => (
              <Link
                key={option.value}
                href={`/app/admin/checklist-problems?status=${encodeURIComponent(option.value)}`}
                className={
                  requestedStatus === option.value
                    ? 'app-button-primary'
                    : 'app-button'
                }
              >
                {option.label} ({statusCounts.get(option.value) ?? 0})
              </Link>
            ))}
          </div>

          <form method="get" className="flex w-full max-w-xl gap-2">
            {validStatusFilter && (
              <input type="hidden" name="status" value={requestedStatus} />
            )}
            <input
              type="search"
              name="q"
              defaultValue={searchText}
              placeholder="Search checklist, player, card #, problem..."
              className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-600"
            />
            <button type="submit" className="app-button">
              Search
            </button>
          </form>
        </div>

        <div className="text-sm text-zinc-400">
          {reports.length} report{reports.length === 1 ? '' : 's'} shown
          {searchText ? ` matching “${searchText}”` : ''}.
        </div>
      </section>

      {reports.length === 0 ? (
        <section className="app-section p-8 text-center">
          <h2 className="text-lg font-semibold">No checklist problems found</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
            There are no reports matching the current filter.
          </p>
        </section>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const sourceUrl = report.source_file_path
              ? attachmentUrls.get(report.source_file_path) ?? ''
              : ''
            const screenshotUrl = report.screenshot_path
              ? attachmentUrls.get(report.screenshot_path) ?? ''
              : ''

            const contextBits = [
              clean(report.team_name),
              clean(report.section_name),
              clean(report.card_number) ? `#${clean(report.card_number)}` : '',
              clean(report.player_name),
            ].filter(Boolean)

            return (
              <details
                key={report.id}
                className="app-section overflow-hidden"
                open={report.status === 'open'}
              >
                <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 transition hover:bg-zinc-900/50 [&::-webkit-details-marker]:hidden xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={statusBadgeClass(report.status)}>
                        {statusLabel(report.status)}
                      </span>
                      <span className="app-badge app-badge-info">
                        {problemTypeLabel(report.problem_type)}
                      </span>
                      {report.source_also_appears_wrong && (
                        <span className="app-badge">Source also appears wrong</span>
                      )}
                      {(report.source_file_path || report.screenshot_path) && (
                        <span className="app-badge">Attachment</span>
                      )}
                    </div>

                    <div className="truncate text-base font-semibold text-zinc-100">
                      {clean(report.checklist_name) || 'Checklist Report'}
                    </div>

                    {contextBits.length > 0 && (
                      <div className="mt-1 text-sm text-zinc-400">
                        {contextBits.join(' • ')}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-3 text-xs text-zinc-500">
                    <span>{formatDate(report.created_at)}</span>
                    <span className="text-cyan-300">Open details ▶</span>
                  </div>
                </summary>

                <div className="space-y-5 border-t border-zinc-800 p-4">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.8fr)]">
                    <div className="space-y-4">
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                        <h3 className="font-semibold">Reported Problem</h3>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              Problem Type
                            </div>
                            <div className="mt-1 text-sm text-zinc-200">
                              {problemTypeLabel(report.problem_type)}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              Reported
                            </div>
                            <div className="mt-1 text-sm text-zinc-200">
                              {formatDate(report.created_at)}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              Team
                            </div>
                            <div className="mt-1 text-sm text-zinc-200">
                              {clean(report.team_name) || '—'}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              Section
                            </div>
                            <div className="mt-1 text-sm text-zinc-200">
                              {clean(report.section_name) || '—'}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              Card #
                            </div>
                            <div className="mt-1 text-sm text-zinc-200">
                              {clean(report.card_number) || '—'}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              Player
                            </div>
                            <div className="mt-1 text-sm text-zinc-200">
                              {clean(report.player_name) || '—'}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            What Looks Wrong?
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">
                            {clean(report.description) || '—'}
                          </div>
                        </div>

                        <div className="mt-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Expected / Suggested Correction
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">
                            {clean(report.expected_value) || '—'}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="font-semibold">Checklist Context</h3>
                            <p className="mt-1 text-sm text-zinc-400">
                              Open the affected checklist to compare HITS against the report.
                            </p>
                          </div>

                          <Link
                            href={`/app/checklists/${report.checklist_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="app-button"
                          >
                            Open Checklist
                          </Link>
                        </div>

                        <div className="mt-3 text-xs text-zinc-500">
                          Checklist ID: {report.checklist_id}
                          {report.checklist_item_id
                            ? ` • Item ID: ${report.checklist_item_id}`
                            : ''}
                        </div>
                      </div>

                      {(report.source_file_path || report.screenshot_path) && (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                          <h3 className="font-semibold">Attachments</h3>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {report.source_file_path && sourceUrl && (
                              <a
                                href={sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="app-button"
                              >
                                Open Original Checklist — {fileNameFromPath(report.source_file_path)}
                              </a>
                            )}

                            {report.screenshot_path && screenshotUrl && (
                              <a
                                href={screenshotUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="app-button"
                              >
                                Open Screenshot — {fileNameFromPath(report.screenshot_path)}
                              </a>
                            )}

                            {report.source_file_path && !sourceUrl && (
                              <span className="text-sm text-amber-300">
                                Source attachment could not be signed for viewing.
                              </span>
                            )}

                            {report.screenshot_path && !screenshotUrl && (
                              <span className="text-sm text-amber-300">
                                Screenshot could not be signed for viewing.
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-zinc-500">
                            Attachment links are temporary and expire after 30 minutes.
                          </p>
                        </div>
                      )}
                    </div>

                    <form
                      action={updateChecklistProblemReport}
                      className="h-fit space-y-4 rounded-xl border border-cyan-900/70 bg-cyan-950/10 p-4"
                    >
                      <input type="hidden" name="reportId" value={report.id} />

                      <div>
                        <h3 className="font-semibold">Admin Review</h3>
                        <p className="mt-1 text-sm text-zinc-400">
                          Classify the report, record what you found, and save the resolution.
                        </p>
                      </div>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Status
                        </span>
                        <select
                          name="status"
                          defaultValue={report.status}
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-600"
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Admin Notes
                        </span>
                        <textarea
                          name="adminNotes"
                          defaultValue={clean(report.admin_notes)}
                          rows={5}
                          placeholder="What did you find? Source file wrong, parser grouped the row incorrectly, etc."
                          className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-600"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Resolution
                        </span>
                        <textarea
                          name="resolution"
                          defaultValue={clean(report.resolution)}
                          rows={4}
                          placeholder="Example: Corrected Elly De La Cruz 71-SP from Vault SP to Image Variation SP."
                          className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-600"
                        />
                      </label>

                      {report.resolved_at && (
                        <div className="rounded-lg border border-emerald-900/70 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200">
                          Resolved {formatDate(report.resolved_at)}
                        </div>
                      )}

                      <button type="submit" className="app-button-primary w-full">
                        Save Review
                      </button>
                    </form>
                  </div>
                </div>
              </details>
            )
          })}
        </div>
      )}
    </div>
  )
}
