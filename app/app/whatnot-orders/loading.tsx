export default function WhatnotOrdersLoading() {
  return (
    <div className="max-w-7xl space-y-6 animate-pulse">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="h-10 w-64 rounded-xl bg-zinc-800" />
          <div className="h-5 w-96 max-w-full rounded-xl bg-zinc-900" />
        </div>

        <div className="flex gap-3">
          <div className="h-10 w-28 rounded-xl bg-zinc-800" />
          <div className="h-10 w-36 rounded-xl bg-zinc-800" />
        </div>
      </div>

      <div className="flex gap-3">
        <div className="h-10 w-28 rounded-xl bg-zinc-800" />
        <div className="h-10 w-28 rounded-xl bg-zinc-900" />
        <div className="h-10 w-28 rounded-xl bg-zinc-900" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
          >
            <div className="h-4 w-24 rounded bg-zinc-800" />
            <div className="mt-4 h-10 w-16 rounded bg-zinc-800" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-44 rounded bg-zinc-800" />
            <div className="h-4 w-64 rounded bg-zinc-900" />
          </div>
          <div className="h-4 w-40 rounded bg-zinc-900" />
        </div>

        <div className="mt-6 grid gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3 flex-1">
                  <div className="h-5 w-32 rounded bg-zinc-800" />
                  <div className="h-6 w-72 rounded bg-zinc-800" />
                  <div className="h-4 w-48 rounded bg-zinc-900" />
                  <div className="h-4 w-40 rounded bg-zinc-900" />
                </div>

                <div className="flex gap-2">
                  <div className="h-9 w-28 rounded-lg bg-zinc-900" />
                  <div className="h-9 w-28 rounded-lg bg-zinc-900" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}