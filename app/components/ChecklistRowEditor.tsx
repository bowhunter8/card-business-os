'use client'

import { useEffect, useState } from 'react'
import {
  deleteChecklistRowShared,
  updateChecklistRowShared,
  type ChecklistRowEditInput,
  type ChecklistRowEditResult,
} from '@/app/actions/checklist-admin'

export type ChecklistRowEditorItem = {
  id: string
  checklist_id: string
  section_id: string | null
  card_number: string | null
  player_name: string | null
  printed_team: string | null
  parallel_name: string | null
  variation: string | null
  rookie_flag: boolean | null
  auto_flag: boolean | null
  relic_flag: boolean | null
  serial_flag: boolean | null
  print_run: number | null
  quantity_required?: number | null
  sort_order?: number | null
  notes: string | null
}

export type ChecklistRowEditorSection = {
  id: string
  checklist_id: string
  name: string
  sort_order: number | null
}

type SavedChecklistRow = Extract<
  ChecklistRowEditResult,
  { ok: true }
>['item']

type Props = {
  open: boolean
  checklistId: string
  item: ChecklistRowEditorItem | null
  sections: ChecklistRowEditorSection[]
  onClose: () => void
  onSaved: (item: SavedChecklistRow) => void
  onDeleted: (itemId: string) => void
  deleteBlockedReason?: string | null
}

type Draft = Omit<ChecklistRowEditInput, 'checklistId' | 'itemId'>

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function compareNatural(a: string, b: string) {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function createDraft(
  item: ChecklistRowEditorItem,
  sections: ChecklistRowEditorSection[]
): Draft {
  return {
    sectionId: item.section_id || sections[0]?.id || '',
    cardNumber: clean(item.card_number),
    playerName: clean(item.player_name),
    printedTeam: clean(item.printed_team),
    parallelName: clean(item.parallel_name),
    variation: clean(item.variation),
    rookieFlag: Boolean(item.rookie_flag),
    autoFlag: Boolean(item.auto_flag),
    relicFlag: Boolean(item.relic_flag),
    serialFlag: Boolean(item.serial_flag),
    printRun:
      item.print_run === null || item.print_run === undefined
        ? ''
        : String(item.print_run),
    notes: clean(item.notes),
  }
}

export default function ChecklistRowEditor({
  open,
  checklistId,
  item,
  sections,
  onClose,
  onSaved,
  onDeleted,
  deleteBlockedReason = null,
}: Props) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')

  const sortedSections = [...sections].sort((a, b) => {
    const aSort = Number(a.sort_order ?? Number.MAX_SAFE_INTEGER)
    const bSort = Number(b.sort_order ?? Number.MAX_SAFE_INTEGER)

    if (aSort !== bSort) return aSort - bSort
    return compareNatural(clean(a.name), clean(b.name))
  })

  useEffect(() => {
    if (!open || !item) {
      setDraft(null)
      setError('')
      return
    }

    setDraft(createDraft(item, sortedSections))
    setError('')
  }, [open, item?.id])

  if (!open || !item || !draft) return null

  const currentItem = item
  const currentDraft = draft
  const busy = isSaving || isDeleting

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current
    )
  }

  async function saveRow() {
    if (busy) return

    if (!currentDraft.sectionId) {
      setError('Choose a checklist section.')
      return
    }

    if (!currentDraft.cardNumber.trim() && !currentDraft.playerName.trim()) {
      setError('Card number or player/item name is required.')
      return
    }

    setIsSaving(true)
    setError('')

    try {
      const result = await updateChecklistRowShared({
        checklistId,
        itemId: currentItem.id,
        ...currentDraft,
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      onSaved(result.item)
      onClose()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to update checklist row.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteRow() {
    if (busy) return

    if (deleteBlockedReason) {
      setError(deleteBlockedReason)
      return
    }

    const label = [
      clean(currentItem.card_number) ? `#${clean(currentItem.card_number)}` : '',
      clean(currentItem.player_name),
    ]
      .filter(Boolean)
      .join(' — ')

    const confirmed = window.confirm(
      `Delete ${label || 'this checklist row'}?\n\nThis removes the checklist row permanently.`
    )

    if (!confirmed) return

    setIsDeleting(true)
    setError('')

    try {
      const result = await deleteChecklistRowShared({
        checklistId,
        itemId: currentItem.id,
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      onDeleted(result.itemId)
      onClose()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Unable to delete checklist row.'
      )
    } finally {
      setIsDeleting(false)
    }
  }

  function requestClose() {
    if (busy) return
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center bg-black/75 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shared-checklist-row-editor-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          requestClose()
        }
      }}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-cyan-900 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-cyan-400">
              Checklist Row
            </div>
            <h2
              id="shared-checklist-row-editor-title"
              className="mt-1 text-xl font-bold text-white"
            >
              Edit Checklist Card
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Edit the checklist record itself. Saved inventory relationships
              remain protected.
            </p>
          </div>

          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            className="app-button disabled:cursor-wait disabled:opacity-60"
          >
            Close
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-5 space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Section
              </span>
              <select
                value={currentDraft.sectionId}
                onChange={(event) =>
                  updateDraft('sectionId', event.target.value)
                }
                disabled={busy}
                className="app-select w-full"
              >
                {sortedSections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {clean(section.name) || 'Uncategorized'}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Card #
              </span>
              <input
                value={currentDraft.cardNumber}
                onChange={(event) =>
                  updateDraft('cardNumber', event.target.value)
                }
                disabled={busy}
                className="app-input w-full"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Player / Item
              </span>
              <input
                value={currentDraft.playerName}
                onChange={(event) =>
                  updateDraft('playerName', event.target.value)
                }
                disabled={busy}
                className="app-input w-full"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Team
              </span>
              <input
                value={currentDraft.printedTeam}
                onChange={(event) =>
                  updateDraft('printedTeam', event.target.value)
                }
                disabled={busy}
                className="app-input w-full"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Parallel
              </span>
              <input
                value={currentDraft.parallelName}
                onChange={(event) =>
                  updateDraft('parallelName', event.target.value)
                }
                disabled={busy}
                className="app-input w-full"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Variation
              </span>
              <input
                value={currentDraft.variation}
                onChange={(event) =>
                  updateDraft('variation', event.target.value)
                }
                disabled={busy}
                className="app-input w-full"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-[150px_minmax(0,1fr)]">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Print Run
              </span>
              <input
                type="number"
                min="1"
                value={currentDraft.printRun}
                onChange={(event) =>
                  updateDraft('printRun', event.target.value)
                }
                disabled={busy}
                className="app-input w-full"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Notes
              </span>
              <input
                value={currentDraft.notes}
                onChange={(event) =>
                  updateDraft('notes', event.target.value)
                }
                disabled={busy}
                className="app-input w-full"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-300">
            {(
              [
                ['rookieFlag', 'RC'],
                ['autoFlag', 'Auto'],
                ['relicFlag', 'Relic'],
                ['serialFlag', 'Serial'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={currentDraft[key]}
                  onChange={(event) =>
                    updateDraft(key, event.target.checked)
                  }
                  disabled={busy}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
          <div>
            <button
              type="button"
              onClick={() => void deleteRow()}
              disabled={busy || Boolean(deleteBlockedReason)}
              className="app-button-danger inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              title={deleteBlockedReason || 'Delete this checklist row'}
            >
              {isDeleting ? (
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden="true"
                />
              ) : null}
              {isDeleting ? 'Deleting...' : 'Delete Checklist Row'}
            </button>

            {deleteBlockedReason ? (
              <div className="mt-2 max-w-xl text-xs text-amber-300">
                {deleteBlockedReason}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={requestClose}
              disabled={busy}
              className="app-button disabled:cursor-wait disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => void saveRow()}
              disabled={
                busy ||
                !currentDraft.sectionId ||
                (!currentDraft.cardNumber.trim() && !currentDraft.playerName.trim())
              }
              className="app-button-primary inline-flex items-center gap-2 disabled:cursor-wait disabled:opacity-60"
              aria-busy={isSaving}
            >
              {isSaving ? (
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden="true"
                />
              ) : null}
              {isSaving ? 'Saving...' : 'Save Row'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
