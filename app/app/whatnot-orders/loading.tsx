export default function WhatnotOrdersLoading() {
  return (
    <div className="app-page-wide space-y-3 animate-pulse">
      
      {/* HEADER */}
      <div className="app-page-header gap-3">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded bg-zinc-800" />
          <div className="h-4 w-96 max-w-full rounded bg-zinc-900" />
        </div>

        <div className="flex gap-2">
          <div className="h-9 w-28 rounded bg-zinc-800" />
          <div className="h-9 w-36 rounded bg-zinc-700" />
        </div>
      </div>

      {/* FILTER CHIPS */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-zinc-800" />
        ))}
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="app-card-tight p-3 space-y-2">
            <div className="h-3 w-20 rounded bg-zinc-800" />
            <div className="h-5 w-16 rounded bg-zinc-700" />
          </div>
        ))}
      </div>

      {/* MAIN CONTENT BLOCK */}
      <div className="app-section p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="h-5 w-44 rounded bg-zinc-800" />
            <div className="h-3 w-64 rounded bg-zinc-900" />
          </div>

          <div className="h-3 w-40 rounded bg-zinc-900" />
        </div>

        {/* ORDER CARDS */}
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="app-card p-4 space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-32 rounded bg-zinc-800" />
                  <div className="h-5 w-72 rounded bg-zinc-800" />
                  <div className="h-3 w-48 rounded bg-zinc-900" />
                  <div className="h-3 w-40 rounded bg-zinc-900" />
                </div>

                <div className="flex gap-2">
                  <div className="h-8 w-28 rounded bg-zinc-700" />
                  <div className="h-8 w-28 rounded bg-zinc-800" />
                </div>

              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}