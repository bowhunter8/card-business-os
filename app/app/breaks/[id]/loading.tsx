export default function BreakDetailLoading() {
  return (
    <div className="max-w-7xl space-y-6 animate-pulse">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="h-10 w-56 rounded-xl bg-zinc-800" />
          <div className="h-5 w-80 rounded-xl bg-zinc-900" />
        </div>

        <div className="flex gap-3">
          <div className="h-10 w-28 rounded-xl bg-zinc-800" />
          <div className="h-10 w-28 rounded-xl bg-zinc-800" />
          <div className="h-10 w-28 rounded-xl bg-zinc-800" />
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="h-4 w-24 rounded bg-zinc-800" />
        <div className="mt-4 h-6 w-64 rounded bg-zinc-800" />
        <div className="mt-3 h-4 w-full rounded bg-zinc-900" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
          >
            <div className="h-4 w-24 rounded bg-zinc-800" />
            <div className="mt-4 h-8 w-24 rounded bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  )
}