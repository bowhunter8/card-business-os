export default function BreaksLoading() {
  return (
    <div className="max-w-7xl space-y-6 animate-pulse">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="h-10 w-40 rounded-xl bg-zinc-800" />
          <div className="h-5 w-72 rounded-xl bg-zinc-900" />
        </div>
        <div className="h-10 w-28 rounded-xl bg-zinc-800" />
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="h-11 flex-1 rounded-xl bg-zinc-950" />
          <div className="h-11 w-28 rounded-xl bg-zinc-800" />
        </div>
        <div className="mt-3 h-4 w-72 rounded bg-zinc-900" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
          <div className="h-5 w-full rounded bg-zinc-900" />
        </div>

        <div className="divide-y divide-zinc-800">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-10 gap-4 px-4 py-4"
            >
              <div className="h-5 rounded bg-zinc-900" />
              <div className="h-5 rounded bg-zinc-900" />
              <div className="h-5 rounded bg-zinc-900" />
              <div className="h-5 rounded bg-zinc-900" />
              <div className="h-5 rounded bg-zinc-900" />
              <div className="h-5 rounded bg-zinc-900" />
              <div className="h-5 rounded bg-zinc-900" />
              <div className="h-5 rounded bg-zinc-900" />
              <div className="h-5 rounded bg-zinc-900" />
              <div className="h-10 rounded-xl bg-zinc-900" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}