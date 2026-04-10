<form method="get" action="/app/search" className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
  <div className="flex flex-col gap-3 md:flex-row">
    <input
      type="text"
      name="q"
      placeholder="Search breaks or staging orders from here"
      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2"
    />
    <div className="flex gap-3">
      <button
        type="submit"
        className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
      >
        Search Everywhere
      </button>
    </div>
  </div>

  <div className="mt-3 text-sm text-zinc-500">
    This opens a clean results page instead of filtering the table.
  </div>
</form>