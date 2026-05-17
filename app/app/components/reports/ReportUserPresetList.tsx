'use client'

import Link from 'next/link'

type UserPreset = {
  id: string
  name: string
  description?: string | null
  is_favorite?: boolean | null
  href: string
}

type Props = {
  presets: UserPreset[]
  returnPath: string
  onDeleteAction: (formData: FormData) => void
  onFavoriteAction: (formData: FormData) => void
}

export default function ReportUserPresetList({
  presets,
  returnPath,
  onDeleteAction,
  onFavoriteAction,
}: Props) {
  if (presets.length === 0) {
    return null
  }

  const sortedPresets = [...presets].sort((a, b) => {
    if (a.is_favorite && !b.is_favorite) return -1
    if (!a.is_favorite && b.is_favorite) return 1

    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })

  return (
    <div className="border-t border-zinc-800 pt-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Saved Presets
      </div>

      <div className="flex flex-wrap gap-2">
        {sortedPresets.map((preset) => (
          <div
            key={preset.id}
            className="flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950 pr-1"
          >
            <Link
              href={preset.href}
              className="inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium text-zinc-200 transition hover:bg-zinc-900"
            >
              {preset.is_favorite ? '★ ' : ''}
              {preset.name}
            </Link>

            <form action={onFavoriteAction}>
              <input type="hidden" name="presetId" value={preset.id} />
              <input type="hidden" name="returnPath" value={returnPath} />
              <input
                type="hidden"
                name="isFavorite"
                value={preset.is_favorite ? 'false' : 'true'}
              />

              <button
                type="submit"
                className="rounded-full border border-amber-900 bg-amber-950/40 px-2 py-0.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-900/40"
                title={
                  preset.is_favorite
                    ? 'Remove favorite'
                    : 'Pin favorite'
                }
              >
                ★
              </button>
            </form>

            <form action={onDeleteAction}>
              <input type="hidden" name="presetId" value={preset.id} />
              <input type="hidden" name="returnPath" value={returnPath} />

              <button
                type="submit"
                className="rounded-full border border-red-900 bg-red-950/40 px-2 py-0.5 text-xs font-semibold text-red-200 transition hover:bg-red-900/40"
                title="Delete preset"
              >
                ×
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  )
}
