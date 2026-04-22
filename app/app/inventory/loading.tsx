export default function InventoryLoading() {
  return (
    <div className="app-page-wide space-y-3 animate-pulse">

      {/* HEADER */}
      <div className="app-page-header gap-3">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded bg-zinc-800" />
          <div className="h-4 w-72 rounded bg-zinc-900" />
        </div>

        <div className="h-9 w-36 rounded bg-zinc-800" />
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="app-card-tight p-2.5 space-y-2">
            <div className="h-3 w-20 rounded bg-zinc-800" />
            <div className="h-5 w-28 rounded bg-zinc-700" />
          </div>
        ))}
      </div>

      {/* FILTER CHIPS */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-20 rounded-full bg-zinc-800" />
        ))}
      </div>

      {/* LIMIT + INFO BAR */}
      <div className="app-section p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="h-3 w-48 rounded bg-zinc-800" />
            <div className="h-3 w-32 rounded bg-zinc-900" />
          </div>

          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-7 w-16 rounded-full bg-zinc-800" />
            ))}
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="app-table-wrap">
        <div className="app-table-scroll">
          <table className="app-table">
            <thead className="app-thead">
              <tr>
                {Array.from({ length: 9 }).map((_, i) => (
                  <th key={i} className="app-th py-2">
                    <div className="h-3 w-16 rounded bg-zinc-800" />
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="app-tr">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="app-td py-2">
                      <div className="h-3 w-full max-w-[120px] rounded bg-zinc-800" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PAGINATION */}
      <div className="app-section p-4">
        <div className="flex justify-between">
          <div className="h-8 w-24 rounded bg-zinc-800" />
          <div className="h-8 w-24 rounded bg-zinc-700" />
        </div>
      </div>
    </div>
  )
}