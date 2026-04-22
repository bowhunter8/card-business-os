export default function BreaksLoading() {
  return (
    <div className="app-page-wide space-y-3 animate-pulse">
      <div className="app-page-header gap-3">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded bg-zinc-800" />
          <div className="h-4 w-80 rounded bg-zinc-900" />
        </div>

        <div className="h-9 w-28 rounded bg-zinc-800" />
      </div>

      <div className="app-section p-4">
        <div className="flex flex-col gap-2 md:flex-row">
          <div className="h-10 flex-1 rounded bg-zinc-800" />
          <div className="h-10 w-28 rounded bg-zinc-700" />
        </div>
        <div className="mt-2 h-3 w-72 rounded bg-zinc-900" />
      </div>

      <div className="app-table-wrap">
        <div className="app-table-scroll">
          <table className="app-table">
            <thead className="app-thead">
              <tr>
                {Array.from({ length: 10 }).map((_, i) => (
                  <th key={i} className="app-th py-2">
                    <div className="h-3 w-16 rounded bg-zinc-800" />
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="app-tr">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="app-td py-3">
                      <div className="h-3 w-full max-w-[110px] rounded bg-zinc-800" />
                    </td>
                  ))}
                  <td className="app-td py-3">
                    <div className="h-8 w-24 rounded bg-zinc-700" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}