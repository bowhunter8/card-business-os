'use client'

import { useEffect, useMemo, useState } from 'react'

function safeCount(value: string) {
  const num = Number(String(value ?? '').replace(/,/g, '').trim() || 0)
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0
}

function syncItemsReceived(total: number) {
  const input = document.querySelector<HTMLInputElement>(
    'input[name="cards_received"]'
  )

  if (!input) return

  input.value = String(total)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

export default function TeamBagTally() {
  const [isOpen, setIsOpen] = useState(false)
  const [counts, setCounts] = useState<string[]>(['', '', ''])

  const total = useMemo(
    () => counts.reduce((sum, value) => sum + safeCount(value), 0),
    [counts]
  )

  useEffect(() => {
    if (!isOpen) return
    syncItemsReceived(total)
  }, [isOpen, total])

  function updateCount(index: number, value: string) {
    setCounts((current) =>
      current.map((count, countIndex) => (countIndex === index ? value : count))
    )
  }

  function addBag() {
    setCounts((current) => [...current, ''])
  }

  function clearCounts() {
    setCounts(['', '', ''])
  }

  return (
    <div className="mt-4 rounded-2xl border border-blue-900 bg-blue-950/20 p-3">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-blue-200">
            Virtual sorting tray
          </span>
          <span className="mt-1 block text-xs text-zinc-400">
            Tally team bags, packs, or stacks. The Items Received total updates automatically.
          </span>
        </span>

        <span className="whitespace-nowrap rounded-full border border-blue-800 bg-blue-950/50 px-3 py-1 text-xs font-semibold text-blue-200">
          {isOpen ? 'Hide' : 'Count bags'}
        </span>
      </button>

      {isOpen ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {counts.map((count, index) => (
              <div key={index} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-zinc-300">
                    Bag / Pack {index + 1}
                  </label>
                </div>

                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={count}
                  onChange={(event) => updateCount(index, event.target.value)}
                  placeholder="0"
                  className="app-input"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-emerald-900 bg-emerald-950/20 p-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-emerald-300">
                Tally total
              </div>
              <div className="mt-1 text-2xl font-bold text-zinc-100">
                {total}
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                Items Received updates automatically as you enter counts.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addBag}
                className="app-button"
              >
                + Add Bag
              </button>

              <button
                type="button"
                onClick={clearCounts}
                className="app-button"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
