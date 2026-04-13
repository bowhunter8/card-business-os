export default function SearchLoading() {
  return (
    <div className="max-w-7xl space-y-6 animate-pulse">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="h-10 w-36 rounded-xl bg-zinc-800" />
          <div className="h-5 w-96 max-w-full rounded-xl bg-zinc-900" />
        </div>

        <div className="flex gap-3">
          <div className="h-10 w-32 rounded-xl bg-zinc-800" />
          <div className="h-10 w-24 rounded-xl bg-zinc-800" />
          <div className="h-10 w-24 rounded-xl bg-zinc-800" />
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="h-11 flex-1 rounded-xl bg-zinc-950" />
          <div className="h-11 w-24 rounded-xl bg-zinc-800" />
          <div className="h-11 w-20 rounded-xl bg-zinc-900" />
        </div>
        <div className="mt-3 h-4 w-72 rounded bg-zinc-900" />
      </div>

      {Array.from({ length: 3 }).map((_, section) => (
        <div
          key={section}
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="h-7 w-52 rounded bg-zinc-800" />
              <div className="h-4 w-64 rounded bg-zinc-900" />
            </div>
            <div className="h-4 w-20 rounded bg-zinc-900" />
          </div>

          <div className="mt-6 grid gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3 flex-1">
                    <div className="h-5 w-24 rounded bg-zinc-800" />
                    <div className="h-6 w-80 rounded bg-zinc-800" />
                    <div className="h-4 w-52 rounded bg-zinc-900" />
                    <div className="h-4 w-40 rounded bg-zinc-900" />
                  </div>

                  <div className="flex gap-2">
                    <div className="h-9 w-24 rounded-lg bg-zinc-900" />
                    <div className="h-9 w-24 rounded-lg bg-zinc-900" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}