'use client'

import { useMemo, useState } from 'react'

type ChecklistOption = {
  id: string
  name: string
  year: string | null
  manufacturer: string | null
  brand: string | null
  product_name: string | null
}

type ChecklistItemOption = {
  checklist_id: string
  player_name: string | null
  printed_team: string | null
}

type Props = {
  checklists: ChecklistOption[]
  checklistItems: ChecklistItemOption[]
}

function clean(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function normalize(value: string | null | undefined) {
  return clean(value).toLowerCase()
}

function splitTeams(value: string | null | undefined) {
  const source = clean(value)
  if (!source) return []

  return Array.from(
    new Set(
      source
        .split(/\s*\/\s*|\s*\|\s*/)
        .map((team) => team.trim())
        .filter(Boolean)
    )
  )
}

export default function BreakChecklistSetup({
  checklists,
  checklistItems,
}: Props) {
  const [mode, setMode] = useState<'manual' | 'checklist'>('manual')
  const [selectedChecklistIds, setSelectedChecklistIds] = useState<string[]>([])
  const [selectedTeams, setSelectedTeams] = useState<string[]>([])
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([])
  const [checklistSearch, setChecklistSearch] = useState('')
  const [teamSearch, setTeamSearch] = useState('')
  const [playerSearch, setPlayerSearch] = useState('')

  const filteredChecklists = useMemo(() => {
    const q = normalize(checklistSearch)
    if (!q) return checklists

    return checklists.filter((checklist) =>
      [
        checklist.name,
        checklist.year,
        checklist.manufacturer,
        checklist.brand,
        checklist.product_name,
      ]
        .map(normalize)
        .join(' ')
        .includes(q)
    )
  }, [checklists, checklistSearch])

  const selectedItems = useMemo(() => {
    if (selectedChecklistIds.length === 0) return []

    const selected = new Set(selectedChecklistIds)
    return checklistItems.filter((item) => selected.has(item.checklist_id))
  }, [checklistItems, selectedChecklistIds])

  const teamOptions = useMemo(() => {
    const counts = new Map<string, number>()

    for (const item of selectedItems) {
      for (const team of splitTeams(item.printed_team)) {
        counts.set(team, (counts.get(team) ?? 0) + 1)
      }
    }

    const q = normalize(teamSearch)

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .filter((team) => !q || normalize(team.name).includes(q))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      )
  }, [selectedItems, teamSearch])

  const playerOptions = useMemo(() => {
    const counts = new Map<string, number>()

    for (const item of selectedItems) {
      const player = clean(item.player_name)
      if (!player) continue
      counts.set(player, (counts.get(player) ?? 0) + 1)
    }

    const q = normalize(playerSearch)

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .filter((player) => !q || normalize(player.name).includes(q))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      )
  }, [selectedItems, playerSearch])

  function toggleValue(
    value: string,
    current: string[],
    setter: (values: string[]) => void
  ) {
    setter(
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value]
    )
  }

  function selectMode(nextMode: 'manual' | 'checklist') {
    setMode(nextMode)

    if (nextMode === 'manual') {
      setSelectedChecklistIds([])
      setSelectedTeams([])
      setSelectedPlayers([])
    }
  }

  function toggleChecklist(checklistId: string) {
    const nextChecklistIds = selectedChecklistIds.includes(checklistId)
      ? selectedChecklistIds.filter((id) => id !== checklistId)
      : [...selectedChecklistIds, checklistId]

    setSelectedChecklistIds(nextChecklistIds)

    if (selectedChecklistIds.includes(checklistId)) {
      const remainingItems = checklistItems.filter((item) =>
        nextChecklistIds.includes(item.checklist_id)
      )

      const remainingTeams = new Set(
        remainingItems.flatMap((item) => splitTeams(item.printed_team)).map(normalize)
      )

      const remainingPlayers = new Set(
        remainingItems.map((item) => normalize(item.player_name)).filter(Boolean)
      )

      setSelectedTeams((current) =>
        current.filter((team) => remainingTeams.has(normalize(team)))
      )

      setSelectedPlayers((current) =>
        current.filter((player) => remainingPlayers.has(normalize(player)))
      )
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-cyan-900/70 bg-cyan-950/10 p-4">
      <input type="hidden" name="inventory_entry_mode" value={mode} />

      {mode === 'checklist' &&
        selectedChecklistIds.map((id) => (
          <input key={id} type="hidden" name="checklist_ids" value={id} />
        ))}

      {mode === 'checklist' &&
        selectedTeams.map((team) => (
          <input key={team} type="hidden" name="checklist_teams" value={team} />
        ))}

      {mode === 'checklist' &&
        selectedPlayers.map((player) => (
          <input
            key={player}
            type="hidden"
            name="checklist_players"
            value={player}
          />
        ))}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-cyan-200">
            Inventory Entry
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Choose how you want to enter the cards after this order is saved.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => selectMode('manual')}
            className={mode === 'manual' ? 'app-button-primary' : 'app-button'}
          >
            Manual Entry
          </button>

          <button
            type="button"
            onClick={() => selectMode('checklist')}
            className={mode === 'checklist' ? 'app-button-primary' : 'app-button'}
          >
            Checklist Entry
          </button>
        </div>
      </div>

      {mode === 'checklist' && (
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-200">
              Select checklist product(s)
            </label>

            <input
              type="search"
              value={checklistSearch}
              onChange={(event) => setChecklistSearch(event.target.value)}
              placeholder="Search checklist products..."
              className="app-input w-full"
            />

            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-zinc-800">
              {filteredChecklists.length === 0 ? (
                <div className="p-4 text-sm text-zinc-500">
                  No checklist products found.
                </div>
              ) : (
                filteredChecklists.map((checklist) => {
                  const checked = selectedChecklistIds.includes(checklist.id)

                  const meta = [
                    clean(checklist.year),
                    clean(checklist.manufacturer),
                    clean(checklist.brand),
                    clean(checklist.product_name),
                  ]
                    .filter(Boolean)
                    .join(' • ')

                  return (
                    <label
                      key={checklist.id}
                      className="flex cursor-pointer items-start gap-3 border-b border-zinc-800 px-3 py-3 last:border-b-0 hover:bg-zinc-900/50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleChecklist(checklist.id)}
                        className="mt-1"
                      />

                      <div className="min-w-0">
                        <div className="font-medium text-zinc-100">
                          {checklist.name}
                        </div>

                        {meta && (
                          <div className="mt-0.5 text-xs text-zinc-500">
                            {meta}
                          </div>
                        )}
                      </div>
                    </label>
                  )
                })
              )}
            </div>
          </div>

          {selectedChecklistIds.length > 0 && (
            <div className="grid gap-4 xl:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-sm font-semibold text-zinc-200">
                    Teams <span className="font-normal text-zinc-500">(optional)</span>
                  </label>

                  {selectedTeams.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-cyan-300 hover:underline"
                      onClick={() => setSelectedTeams([])}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <input
                  type="search"
                  value={teamSearch}
                  onChange={(event) => setTeamSearch(event.target.value)}
                  placeholder="Search teams..."
                  className="app-input w-full"
                />

                <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-zinc-800 p-2">
                  {teamOptions.length === 0 ? (
                    <div className="p-2 text-sm text-zinc-500">
                      No teams found in the selected checklist(s).
                    </div>
                  ) : (
                    teamOptions.map((team) => (
                      <label
                        key={team.name}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-zinc-900/60"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedTeams.includes(team.name)}
                            onChange={() =>
                              toggleValue(team.name, selectedTeams, setSelectedTeams)
                            }
                          />
                          <span>{team.name}</span>
                        </span>

                        <span className="text-xs text-zinc-500">
                          {team.count}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-sm font-semibold text-zinc-200">
                    Players <span className="font-normal text-zinc-500">(optional)</span>
                  </label>

                  {selectedPlayers.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-cyan-300 hover:underline"
                      onClick={() => setSelectedPlayers([])}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <input
                  type="search"
                  value={playerSearch}
                  onChange={(event) => setPlayerSearch(event.target.value)}
                  placeholder="Search players..."
                  className="app-input w-full"
                />

                <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-zinc-800 p-2">
                  {playerOptions.length === 0 ? (
                    <div className="p-2 text-sm text-zinc-500">
                      No players found in the selected checklist(s).
                    </div>
                  ) : (
                    playerOptions.map((player) => (
                      <label
                        key={player.name}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-zinc-900/60"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedPlayers.includes(player.name)}
                            onChange={() =>
                              toggleValue(
                                player.name,
                                selectedPlayers,
                                setSelectedPlayers
                              )
                            }
                          />
                          <span>{player.name}</span>
                        </span>

                        <span className="text-xs text-zinc-500">
                          {player.count}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-3 text-sm text-zinc-400">
            These choices only pre-filter the next screen. You can still show the full
            selected checklist(s) and enter any unexpected card.
          </div>
        </div>
      )}
    </div>
  )
}
