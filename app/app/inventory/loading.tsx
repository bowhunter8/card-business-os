export default function InventoryLoading() {
  return (
    <div className="max-w-7xl space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="h-10 w-48 rounded-xl bg-zinc-800" />
          <div className="h-5 w-72 rounded-xl bg-zinc-900" />
        </div>

        <div className="h-10 w-36 rounded-xl bg-zinc-800" />
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="h-10 w-24 rounded-xl bg-zinc-800" />
        <div className="h-10 w-24 rounded-xl bg-zinc-800" />
      </div>

      {/* Search bar */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="h-10 w-full rounded-xl bg-zinc-800" />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="space-y-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-9 gap-4 border-b border-zinc-800 pb-4"
            >
              {Array.from({ length: 9 }).map((_, j) => (
                <div
                  key={j}
                  className="h-4 rounded bg-zinc-800"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}