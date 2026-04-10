'use client'

import { useEffect, useRef } from 'react'

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
  rowCount: number
  defaultYear: string
  defaultSet: string
  initialRows?: EntryRow[]
}

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

export default function BreakCardEntryGrid({
  rowCount,
  defaultYear,
  defaultSet,
  initialRows = [],
}: Props) {
  const playerRefs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    playerRefs.current[0]?.focus()
  }, [])

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
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-950 text-zinc-400">
          <tr>
            <th className="px-3 py-3 text-left font-medium">Year</th>
            <th className="px-3 py-3 text-left font-medium">Set</th>
            <th className="px-3 py-3 text-left font-medium">Player / Lot Name</th>
            <th className="px-3 py-3 text-left font-medium">Card #</th>
            <th className="px-3 py-3 text-left font-medium">Type</th>
            <th className="px-3 py-3 text-left font-medium">Qty</th>
            <th className="px-3 py-3 text-left font-medium">Status</th>
            <th className="px-3 py-3 text-left font-medium">Notes</th>
          </tr>
        </thead>

        <tbody>
          {Array.from({ length: rowCount }).map((_, index) => {
            const row = getInitialRow(initialRows, index, defaultYear, defaultSet)

            return (
              <tr key={index} className="border-t border-zinc-800">
                <td className="px-3 py-2">
                  <input
                    name={`year_${index}`}
                    type="number"
                    defaultValue={row.year}
                    placeholder="2025"
                    className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                  />
                </td>

                <td className="px-3 py-2">
                  <input
                    name={`set_name_${index}`}
                    defaultValue={row.set_name}
                    placeholder="Bowman Chrome"
                    className="w-56 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                  />
                </td>

                <td className="px-3 py-2">
                  <input
                    name={`player_name_${index}`}
                    ref={(el) => setPlayerRef(index, el)}
                    onKeyDown={(e) => handlePlayerKeyDown(e, index)}
                    defaultValue={row.player_name}
                    placeholder="Player or lot name"
                    className="w-52 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                  />
                </td>

                <td className="px-3 py-2">
                  <input
                    name={`card_number_${index}`}
                    onKeyDown={(e) => handleCardNumberKeyDown(e, index)}
                    defaultValue={row.card_number}
                    placeholder="24"
                    className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                  />
                </td>

                <td className="px-3 py-2">
                  <select
                    name={`item_type_${index}`}
                    defaultValue={row.item_type}
                    className="w-36 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                  >
                    <option value="single_card">Single Card</option>
                    <option value="lot">Lot</option>
                  </select>
                </td>

                <td className="px-3 py-2">
                  <input
                    name={`quantity_${index}`}
                    type="number"
                    min={1}
                    defaultValue={row.quantity}
                    className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                  />
                </td>

                <td className="px-3 py-2">
                  <select
                    name={`status_${index}`}
                    defaultValue={row.status}
                    className="w-44 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                  >
                    <option value="available">For Sale</option>
                    <option value="personal">Personal Collection</option>
                  </select>
                </td>

                <td className="px-3 py-2">
                  <input
                    name={`notes_${index}`}
                    onKeyDown={(e) => handleNotesKeyDown(e, index)}
                    defaultValue={row.notes}
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
  )
}