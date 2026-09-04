'use client'

import { FormEvent, useRef, useState, useTransition } from 'react'
import { submitChecklistProblemReport } from '@/app/actions/checklist-problem-reports'

type ChecklistProblemReportProps = {
  checklistId: string
  checklistName: string
  checklistItemId?: string | null
  sectionName?: string | null
  teamName?: string | null
  cardNumber?: string | null
  playerName?: string | null
  buttonLabel?: string
  buttonClassName?: string
}

const PROBLEM_TYPES = [
  ['wrong_team', 'Wrong team'],
  ['wrong_section', 'Wrong section'],
  ['missing_card', 'Missing card'],
  ['duplicate_card', 'Duplicate card'],
  ['wrong_card_number', 'Wrong card number'],
  ['wrong_player', 'Wrong player'],
  ['wrong_variation', 'Wrong variation / parallel'],
  ['wrong_details', 'Wrong card details'],
  ['import_problem', 'Checklist import problem'],
  ['other', 'Other'],
] as const

export default function ChecklistProblemReport({
  checklistId,
  checklistName,
  checklistItemId = null,
  sectionName = null,
  teamName = null,
  cardNumber = null,
  playerName = null,
  buttonLabel = 'Report a Problem',
  buttonClassName = 'app-button',
}: ChecklistProblemReportProps) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function closeModal() {
    if (isPending) return
    setOpen(false)
    setMessage(null)
    setSuccess(false)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const form = event.currentTarget
    const formData = new FormData(form)

    setMessage(null)
    setSuccess(false)

    startTransition(async () => {
      const result = await submitChecklistProblemReport(formData)

      setMessage(result.message)
      setSuccess(result.success)

      if (result.success) {
        form.reset()
      }
    })
  }

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        onClick={() => {
          setMessage(null)
          setSuccess(false)
          setOpen(true)
        }}
      >
        {buttonLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checklist-problem-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeModal()
          }}
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-zinc-800 bg-zinc-950 px-5 py-4">
              <div>
                <h2
                  id="checklist-problem-title"
                  className="text-lg font-semibold text-zinc-100"
                >
                  Report a Checklist Problem
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Report incorrect checklist data or an import problem. HITS will
                  save the checklist context with your report.
                </p>
              </div>

              <button
                type="button"
                className="app-button shrink-0"
                onClick={closeModal}
                disabled={isPending}
              >
                Close
              </button>
            </div>

            <form
              ref={formRef}
              onSubmit={handleSubmit}
              className="space-y-5 p-5"
            >
              <input type="hidden" name="checklistId" value={checklistId} />
              <input
                type="hidden"
                name="checklistName"
                value={checklistName}
              />
              <input
                type="hidden"
                name="checklistItemId"
                value={checklistItemId ?? ''}
              />

              <div className="rounded-xl border border-zinc-800 bg-black/30 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Checklist
                </div>
                <div className="mt-1 font-medium text-zinc-100">
                  {checklistName}
                </div>

                {(teamName || sectionName) && (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {teamName && <span className="app-badge">{teamName}</span>}
                    {sectionName && (
                      <span className="app-badge">{sectionName}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-zinc-200">
                    Problem Type <span className="text-red-300">*</span>
                  </span>
                  <select
                    name="problemType"
                    required
                    defaultValue=""
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-cyan-600"
                  >
                    <option value="" disabled>
                      Choose a problem type
                    </option>
                    {PROBLEM_TYPES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-zinc-200">
                    Team
                  </span>
                  <input
                    type="text"
                    name="teamName"
                    defaultValue={teamName ?? ''}
                    placeholder="Optional"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-cyan-600"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-zinc-200">
                    Card #
                  </span>
                  <input
                    type="text"
                    name="cardNumber"
                    defaultValue={cardNumber ?? ''}
                    placeholder="Example: 71-SP"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-cyan-600"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-zinc-200">
                    Player / Subject
                  </span>
                  <input
                    type="text"
                    name="playerName"
                    defaultValue={playerName ?? ''}
                    placeholder="Optional"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-cyan-600"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-200">
                  Section
                </span>
                <input
                  type="text"
                  name="sectionName"
                  defaultValue={sectionName ?? ''}
                  placeholder="Optional"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-cyan-600"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-200">
                  What looks wrong?
                </span>
                <textarea
                  name="description"
                  rows={4}
                  placeholder="Example: This card is showing under Vault SP, but the source checklist lists it under Image Variation SP."
                  className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-cyan-600"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-200">
                  What should it show instead?
                </span>
                <input
                  type="text"
                  name="expectedValue"
                  placeholder="Optional correction or expected value"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-cyan-600"
                />
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-black/20 p-3">
                <input
                  type="checkbox"
                  name="sourceAlsoAppearsWrong"
                  className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-900"
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-200">
                    The original/source checklist appears wrong too
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    Check this when HITS may simply be reproducing an error from
                    the source file.
                  </span>
                </span>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block rounded-xl border border-zinc-800 bg-black/20 p-3">
                  <span className="block text-sm font-medium text-zinc-200">
                    Attach Original Checklist
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    Optional. Up to 15 MB.
                  </span>
                  <input
                    type="file"
                    name="sourceFile"
                    className="mt-3 block w-full text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-xs file:font-medium file:text-zinc-100 hover:file:bg-zinc-700"
                  />
                </label>

                <label className="block rounded-xl border border-zinc-800 bg-black/20 p-3">
                  <span className="block text-sm font-medium text-zinc-200">
                    Attach Screenshot
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    Optional. Up to 15 MB.
                  </span>
                  <input
                    type="file"
                    name="screenshot"
                    accept="image/*"
                    className="mt-3 block w-full text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-xs file:font-medium file:text-zinc-100 hover:file:bg-zinc-700"
                  />
                </label>
              </div>

              <p className="text-xs text-zinc-500">
                Please include either a description of the problem or the
                correction you expect HITS to show.
              </p>

              {message && (
                <div
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    success
                      ? 'border-emerald-800 bg-emerald-950/30 text-emerald-200'
                      : 'border-red-800 bg-red-950/30 text-red-200'
                  }`}
                >
                  {message}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800 pt-4">
                <button
                  type="button"
                  className="app-button"
                  onClick={closeModal}
                  disabled={isPending}
                >
                  {success ? 'Close' : 'Cancel'}
                </button>

                {!success && (
                  <button
                    type="submit"
                    className="app-button-primary"
                    disabled={isPending}
                  >
                    {isPending ? 'Submitting…' : 'Submit Report'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
