export default function AppLoading() {
  return (
    <div className="max-w-7xl space-y-8 animate-pulse">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="h-10 w-56 rounded-xl bg-zinc-800" />
          <div className="h-5 w-96 max-w-full rounded-xl bg-zinc-900" />
        </div>
        <div className="h-5 w-56 rounded-xl bg-zinc-900" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
          >
            <div className="h-4 w-28 rounded bg-zinc-800" />
            <div className="mt-4 h-10 w-20 rounded bg-zinc-800" />
            <div className="mt-4 h-4 w-32 rounded bg-zinc-900" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
          >
            <div className="h-4 w-36 rounded bg-zinc-800" />
            <div className="mt-4 h-10 w-28 rounded bg-zinc-800" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
          >
            <div className="h-7 w-40 rounded bg-zinc-800" />
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="h-4 w-28 rounded bg-zinc-800" />
                <div className="mt-4 h-8 w-16 rounded bg-zinc-800" />
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="h-4 w-28 rounded bg-zinc-800" />
                <div className="mt-3 h-4 w-24 rounded bg-zinc-800" />
                <div className="mt-2 h-4 w-20 rounded bg-zinc-900" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}