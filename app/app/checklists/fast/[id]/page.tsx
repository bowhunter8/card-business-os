import Link from 'next/link'
import ChecklistBrowser from '@/app/components/ChecklistBrowser'

type PageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function FastChecklistPage({
  params,
}: PageProps) {
  const { id } = await params

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-300">
            HITS Checklist Browser Test
          </div>

          <h1 className="mt-1 text-2xl font-bold text-white">
            Fast Checklist Browser
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Safe test version. The existing checklist page is unchanged.
          </p>
        </div>

        <Link
          href={`/app/checklists/${encodeURIComponent(id)}`}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
        >
          Back to Current Checklist
        </Link>
      </div>

      <ChecklistBrowser checklistId={id} />
    </div>
  )
}