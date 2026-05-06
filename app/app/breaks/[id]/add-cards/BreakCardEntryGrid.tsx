'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type EntryRow = {
  year: string
  set_name: string
  player_name: string
  card_number: string
  item_type: string
  quantity: string
  status: string
  notes: string
}

type Props = {
  breakId: string
  rowCount: number
  defaultYear: string
  defaultSet: string
  initialRows?: EntryRow[]
  forceFresh?: boolean
}

type AutoCompleteField = 'year' | 'set_name' | 'player_name' | 'card_number' | 'notes'

const STORAGE_PREFIX = 'break_add_cards_draft_'
const AUTOSAVE_DELAY_MS = 500

function getInitialRow(
  initialRows: EntryRow[] | undefined,
  index: number,
  defaultYear: string,
  defaultSet: string
): EntryRow {
  const row = initialRows?.[index]

  return {
    year: row?.year ?? defaultYear,
    set_name: row?.set_name ?? defaultSet,
    player_name: row?.player_name ?? '',
    card_number: row?.card_number ?? '',
    item_type: row?.item_type ?? 'single_card',
    quantity: row?.quantity ?? '1',
    status: row?.status ?? 'available',
    notes: row?.notes ?? '',
  }
}

function rowsMatch(a: EntryRow[], b: EntryRow[]) {
  if (a.length !== b.length) return false

  for (let i = 0; i < a.length; i++) {
    const left = a[i]
    const right = b[i]

    if (
      left.year !== right.year ||
      left.set_name !== right.set_name ||
      left.player_name !== right.player_name ||
      left.card_number !== right.card_number ||
      left.item_type !== right.item_type ||
      left.quantity !== right.quantity ||
      left.status !== right.status ||
      left.notes !== right.notes
    ) {
      return false
    }
  }

  return true
}

function rowHasMeaningfulData(row: EntryRow) {
  return (
    row.player_name.trim() !== '' ||
    row.card_number.trim() !== '' ||
    row.item_type !== 'single_card' ||
    row.quantity !== '1' ||
    row.status !== 'available' ||
    row.notes.trim() !== ''
  )
}

function uniqueValues(values: string[]) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const cleaned = String(value ?? '').trim()
    const key = cleaned.toLowerCase()

    if (!cleaned || seen.has(key)) continue

    seen.add(key)
    output.push(cleaned)
  }

  return output
}

function findUniqueExcelLikeCompletion(
  rows: EntryRow[],
  currentRowIndex: number,
  field: AutoCompleteField,
  typedValue: string
) {
  const typed = String(typedValue ?? '')
  const normalizedTyped = typed.trim().toLowerCase()

  if (!normalizedTyped) return null

  const previousValues = uniqueValues(
    rows
      .slice(0, currentRowIndex)
      .map((row) => String(row[field] ?? '').trim())
      .filter(Boolean)
  )

  const matches = previousValues.filter((value) =>
    value.toLowerCase().startsWith(normalizedTyped)
  )

  if (matches.length !== 1) return null

  const match = matches[0]
  if (match.toLowerCase() === normalizedTyped) return null

  return match
}

function shouldTryCompletion(e: React.ChangeEvent<HTMLInputElement>) {
  const nativeEvent = e.nativeEvent as InputEvent

  if (!nativeEvent?.inputType) return true

  return (
    nativeEvent.inputType === 'insertText' ||
    nativeEvent.inputType === 'insertCompositionText' ||
    nativeEvent.inputType === 'insertFromPaste'
  )
}

export default function BreakCardEntryGrid({
  breakId,
  rowCount,
  defaultYear,
  defaultSet,
  initialRows = [],
  forceFresh = false,
}: Props) {
  const playerRefs = useRef<Array<HTMLInputElement | null>>([])
  const fieldRefs = useRef<Record<AutoCompleteField, Array<HTMLInputElement | null>>>({
    year: [],
    set_name: [],
    player_name: [],
    card_number: [],
    notes: [],
  })
  const saveTimerRef = useRef<number | null>(null)

  const fallbackRows = useMemo(
    () =>
      Array.from({ length: rowCount }).map((_, index) =>
        getInitialRow(initialRows, index, defaultYear, defaultSet)
      ),
    [rowCount, initialRows, defaultYear, defaultSet]
  )

  const [rows, setRows] = useState<EntryRow[]>(fallbackRows)
  const [isDraftLoaded, setIsDraftLoaded] = useState(false)
  const [lastSavedText, setLastSavedText] = useState('')

  const storageKey = `${STORAGE_PREFIX}${breakId}`

  useEffect(() => {
    let nextRows = fallbackRows
    let loadedDraft = false

    try {
      if (forceFresh) {
        window.localStorage.removeItem(storageKey)
      } else {
        const raw = window.localStorage.getItem(storageKey)
        if (raw) {
          const parsed = JSON.parse(raw) as { rows?: EntryRow[] }
          if (Array.isArray(parsed?.rows) && parsed.rows.length > 0) {
            nextRows = Array.from({ length: rowCount }).map((_, index) =>
              getInitialRow(parsed.rows, index, defaultYear, defaultSet)
            )
            loadedDraft = true
          }
        }
      }
    } catch {
      // ignore bad local data
    }

    setRows((current) => (rowsMatch(current, nextRows) ? current : nextRows))
    setIsDraftLoaded(loadedDraft)
  }, [storageKey, fallbackRows, rowCount, defaultYear, defaultSet, forceFresh])

  useEffect(() => {
    playerRefs.current[0]?.focus()
  }, [])

  useEffect(() => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      try {
        const hasMeaningfulData = rows.some((row) => rowHasMeaningfulData(row))

        if (!hasMeaningfulData) {
          window.localStorage.removeItem(storageKey)
          setLastSavedText('')
          return
        }

        window.localStorage.setItem(
          storageKey,
          JSON.stringify({
            rows,
            savedAt: new Date().toISOString(),
          })
        )

        setLastSavedText(
          `Last autosaved ${new Date().toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          })}`
        )
      } catch {
        // ignore localStorage errors
      }
    }, AUTOSAVE_DELAY_MS)

    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [rows, storageKey])

  function setPlayerRef(index: number, el: HTMLInputElement | null) {
    playerRefs.current[index] = el
    fieldRefs.current.player_name[index] = el
  }

  function setFieldRef(
    field: AutoCompleteField,
    index: number,
    el: HTMLInputElement | null
  ) {
    fieldRefs.current[field][index] = el
  }

  function moveToNextPlayer(currentRow: number) {
    const nextRow = currentRow + 1
    if (nextRow < rowCount) {
      playerRefs.current[nextRow]?.focus()
      playerRefs.current[nextRow]?.select()
    }
  }

  function updateRow(index: number, patch: Partial<EntryRow>) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              ...patch,
            }
          : row
      )
    )
  }

  function updateAutoCompleteField(
    index: number,
    field: AutoCompleteField,
    value: string,
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const shouldComplete = shouldTryCompletion(event)
    const completion = shouldComplete
      ? findUniqueExcelLikeCompletion(rows, index, field, value)
      : null

    const finalValue = completion ?? value

    updateRow(index, { [field]: finalValue } as Partial<EntryRow>)

    if (completion) {
      window.requestAnimationFrame(() => {
        const input = fieldRefs.current[field][index]
        if (!input) return

        input.setSelectionRange(value.length, completion.length)
      })
    }
  }

  function clearDraft() {
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      // ignore localStorage errors
    }

    setRows(fallbackRows)
    setIsDraftLoaded(false)
    setLastSavedText('')
    playerRefs.current[0]?.focus()
  }

  function handlePlayerKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number
  ) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    moveToNextPlayer(rowIndex)
  }

  function handleCardNumberKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number
  ) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    moveToNextPlayer(rowIndex)
  }

  function handleNotesKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number
  ) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    moveToNextPlayer(rowIndex)
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-zinc-400">
          {forceFresh
            ? 'Fresh add-more form loaded for this break.'
            : isDraftLoaded
              ? 'Autosaved draft loaded for this break.'
              : 'Autosave is active for this break.'}
          {lastSavedText ? ` ${lastSavedText}.` : ''}
        </div>

        <button
          type="button"
          onClick={clearDraft}
          className="app-button"
        >
          Clear Autosaved Draft
        </button>
      </div>

      <div className="app-table-wrap">
        <div className="app-table-scroll">
          <table className="app-table">
            <thead className="app-thead">
              <tr>
                <th className="app-th">Year</th>
                <th className="app-th">Set</th>
                <th className="app-th">Item / Player / Lot Name</th>
                <th className="app-th">Item #</th>
                <th className="app-th">Type</th>
                <th className="app-th">Qty</th>
                <th className="app-th">Status</th>
                <th className="app-th">Notes</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row, index) => {
                return (
                  <tr key={index} className="app-tr">
                    <td className="app-td">
                      <input
                        name={`year_${index}`}
                        type="number"
                        ref={(el) => setFieldRef('year', index, el)}
                        value={row.year}
                        onChange={(e) =>
                          updateAutoCompleteField(index, 'year', e.target.value, e)
                        }
                        placeholder="2025"
                        className="app-input w-24"
                      />
                    </td>

                    <td className="app-td">
                      <input
                        name={`set_name_${index}`}
                        ref={(el) => setFieldRef('set_name', index, el)}
                        value={row.set_name}
                        onChange={(e) =>
                          updateAutoCompleteField(index, 'set_name', e.target.value, e)
                        }
                        placeholder="Bowman Chrome"
                        className="app-input w-56"
                      />
                    </td>

                    <td className="app-td">
                      <input
                        name={`player_name_${index}`}
                        ref={(el) => setPlayerRef(index, el)}
                        onKeyDown={(e) => handlePlayerKeyDown(e, index)}
                        value={row.player_name}
                        onChange={(e) =>
                          updateAutoCompleteField(index, 'player_name', e.target.value, e)
                        }
                        placeholder="Item, player, or lot name"
                        className="app-input w-52"
                      />
                    </td>

                    <td className="app-td">
                      <input
                        name={`card_number_${index}`}
                        ref={(el) => setFieldRef('card_number', index, el)}
                        onKeyDown={(e) => handleCardNumberKeyDown(e, index)}
                        value={row.card_number}
                        onChange={(e) =>
                          updateAutoCompleteField(index, 'card_number', e.target.value, e)
                        }
                        placeholder="24"
                        className="app-input w-24"
                      />
                    </td>

                    <td className="app-td">
                      <select
                        name={`item_type_${index}`}
                        value={row.item_type}
                        onChange={(e) => updateRow(index, { item_type: e.target.value })}
                        className="app-select w-36"
                      >
                        <option value="single_card">Single Item</option>
                        <option value="lot">Lot</option>
                      </select>
                    </td>

                    <td className="app-td">
                      <input
                        name={`quantity_${index}`}
                        type="number"
                        min={1}
                        value={row.quantity}
                        onChange={(e) => updateRow(index, { quantity: e.target.value })}
                        className="app-input w-20"
                      />
                    </td>

                    <td className="app-td">
                      <select
                        name={`status_${index}`}
                        value={row.status}
                        onChange={(e) => updateRow(index, { status: e.target.value })}
                        className="app-select w-44"
                      >
                        <option value="available">For Sale</option>
                        <option value="personal">Personal Collection</option>
                        <option value="junk">Junk</option>
                      </select>
                    </td>

                    <td className="app-td">
                      <input
                        name={`notes_${index}`}
                        ref={(el) => setFieldRef('notes', index, el)}
                        onKeyDown={(e) => handleNotesKeyDown(e, index)}
                        value={row.notes}
                        onChange={(e) =>
                          updateAutoCompleteField(index, 'notes', e.target.value, e)
                        }
                        placeholder="RC / Auto / /50 / Refractor / team lot / remarks"
                        className="app-input w-72"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
