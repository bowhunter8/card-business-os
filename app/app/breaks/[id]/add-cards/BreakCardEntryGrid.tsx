'use client'

import { useEffect, useRef } from 'react'

type Props = {
  rowCount: number
  defaultYear: string
  defaultSet: string
}

export default function BreakCardEntryGrid({
  rowCount,
  defaultYear,
  defaultSet,
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
          {Array.from({ length: rowCount }).map((_, index) => (
            <tr key={index} className="border-t border-zinc-800">
              <td className="px-3 py-2">
                <input
                  name={`year_${index}`}
                  type="number"
                  defaultValue={defaultYear}
                  placeholder="2025"
                  className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                />
              </td>

              <td className="px-3 py-2">
                <input
                  name={`set_name_${index}`}
                  defaultValue={defaultSet}
                  placeholder="Bowman Chrome"
                  className="w-56 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                />
              </td>

              <td className="px-3 py-2">
                <input
                  name={`player_name_${index}`}
                  ref={(el) => setPlayerRef(index, el)}
                  onKeyDown={(e) => handlePlayerKeyDown(e, index)}
                  placeholder="Player or lot name"
                  className="w-52 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                />
              </td>

              <td className="px-3 py-2">
                <input
                  name={`card_number_${index}`}
                  onKeyDown={(e) => handleCardNumberKeyDown(e, index)}
                  placeholder="24"
                  className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                />
              </td>

              <td className="px-3 py-2">
                <select
                  name={`item_type_${index}`}
                  defaultValue="single_card"
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
                  defaultValue={1}
                  className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                />
              </td>

              <td className="px-3 py-2">
                <select
                  name={`status_${index}`}
                  defaultValue="available"
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
                  placeholder="RC / Auto / /50 / Refractor / team lot / remarks"
                  className="w-72 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}