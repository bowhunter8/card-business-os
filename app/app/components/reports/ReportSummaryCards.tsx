type SummaryCard = {
  label: string
  value: string
  note?: string
}

type ReportSummaryCardsProps = {
  cards: SummaryCard[]
}

function SingleSummaryCard({
  label,
  value,
  note,
}: SummaryCard) {
  return (
    <div className="app-card-tight px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>

      <div className="mt-0.5 text-lg font-semibold leading-none text-zinc-100">
        {value}
      </div>

      {note ? (
        <div className="mt-0.5 text-[11px] leading-tight text-zinc-500">
          {note}
        </div>
      ) : null}
    </div>
  )
}

export default function ReportSummaryCards({
  cards,
}: ReportSummaryCardsProps) {
  if (!cards.length) {
    return null
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
      {cards.map((card) => (
        <SingleSummaryCard
          key={`${card.label}-${card.value}`}
          {...card}
        />
      ))}
    </div>
  )
}
