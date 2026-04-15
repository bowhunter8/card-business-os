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
}

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

export default function BreakCardEntryGrid({
  breakId,
  rowCount,
  defaultYear,
  defaultSet,
  initialRows = [],
}: Props) {
  const playerRefs = useRef<Array<HTMLInputElement | null>>([])
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
    } catch {
      // ignore bad local data
    }

    setRows((current) => (rowsMatch(current, nextRows) ? current : nextRows))
    setIsDraftLoaded(loadedDraft)
  }, [storageKey, fallbackRows, rowCount, defaultYear, defaultSet])

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
          {isDraftLoaded ? 'Autosaved draft loaded for this break.' : 'Autosave is active for this break.'}
          {lastSavedText ? ` ${lastSavedText}.` : ''}
        </div>

        <button
          type="button"
          onClick={clearDraft}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
        >
          Clear Autosaved Draft
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-950 text-zinc-400">
            <tr>
              <th className="px-3 py-3 text-left font-medium">Year</th>
              <th className="px-3 py-3 text-left font-medium">Set</th>
              <th className="px-3 py-3 text-left font-medium">Item / Player / Lot Name</th>
              <th className="px-3 py-3 text-left font-medium">Item #</th>
              <th className="px-3 py-3 text-left font-medium">Type</th>
              <th className="px-3 py-3 text-left font-medium">Qty</th>
              <th className="px-3 py-3 text-left font-medium">Status</th>
              <th className="px-3 py-3 text-left font-medium">Notes</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => {
              return (
                <tr key={index} className="border-t border-zinc-800">
                  <td className="px-3 py-2">
                    <input
                      name={`year_${index}`}
                      type="number"
                      value={row.year}
                      onChange={(e) => updateRow(index, { year: e.target.value })}
                      placeholder="2025"
                      className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <input
                      name={`set_name_${index}`}
                      value={row.set_name}
                      onChange={(e) => updateRow(index, { set_name: e.target.value })}
                      placeholder="Bowman Chrome"
                      className="w-56 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <input
                      name={`player_name_${index}`}
                      ref={(el) => setPlayerRef(index, el)}
                      onKeyDown={(e) => handlePlayerKeyDown(e, index)}
                      value={row.player_name}
                      onChange={(e) => updateRow(index, { player_name: e.target.value })}
                      placeholder="Item, player, or lot name"
                      className="w-52 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <input
                      name={`card_number_${index}`}
                      onKeyDown={(e) => handleCardNumberKeyDown(e, index)}
                      value={row.card_number}
                      onChange={(e) => updateRow(index, { card_number: e.target.value })}
                      placeholder="24"
                      className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <select
                      name={`item_type_${index}`}
                      value={row.item_type}
                      onChange={(e) => updateRow(index, { item_type: e.target.value })}
                      className="w-36 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                    >
                      <option value="single_card">Single Item</option>
                      <option value="lot">Lot</option>
                    </select>
                  </td>

                  <td className="px-3 py-2">
                    <input
                      name={`quantity_${index}`}
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(e) => updateRow(index, { quantity: e.target.value })}
                      className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                    />
                  </td>

                  <td className="px-3 py-2">
                    <select
                      name={`status_${index}`}
                      value={row.status}
                      onChange={(e) => updateRow(index, { status: e.target.value })}
                      className="w-44 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                    >
                      <option value="available">For Sale</option>
                      <option value="personal">Personal Collection</option>
                      <option value="junk">Junk</option>
                    </select>
                  </td>

                  <td className="px-3 py-2">
                    <input
                      name={`notes_${index}`}
                      onKeyDown={(e) => handleNotesKeyDown(e, index)}
                      value={row.notes}
                      onChange={(e) => updateRow(index, { notes: e.target.value })}
                      placeholder="RC / Auto / /50 / Refractor / team lot / remarks"
                      className="w-72 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}