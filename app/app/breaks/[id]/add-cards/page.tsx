import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { addBreakCardsAction } from '@/app/actions/breaks'
import BreakCardEntryGrid from './BreakCardEntryGrid'

type BreakRow = {
  id: string
  break_date: string
  source_name: string | null
  product_name: string | null
  format_type: string | null
  teams: string[] | null
  total_cost: number | null
  allocation_method: string | null
  order_number?: string | null
  cards_received?: number | null
}

function money(value: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function extractYear(productName: string | null) {
  if (!productName) return ''
  const match = productName.match(/\b(19|20)\d{2}\b/)
  return match ? match[0] : ''
}

function extractSet(productName: string | null) {
  if (!productName) return ''
  const year = extractYear(productName)
  return productName.replace(year, '').trim()
}

export default async function AddBreakCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string }>
}) {
  const { id } = await params
  const pageParams = searchParams ? await searchParams : undefined
  const pageError = pageParams?.error

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const response = await supabase
    .from('breaks')
    .select(`
      id,
      break_date,
      source_name,
      product_name,
      format_type,
      teams,
      total_cost,
      allocation_method,
      order_number,
      cards_received
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (response.error || !response.data) {
    notFound()
  }

  const item = response.data as BreakRow
  const defaultYear = extractYear(item.product_name)
  const defaultSet = extractSet(item.product_name)

  const cardsReceived = Math.max(0, Number(item.cards_received ?? 0))
  const rowCount = cardsReceived > 0 ? Math.min(cardsReceived, 50) : 1

  return (
    <div className="max-w-7xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Add Cards From Break</h1>
          <p className="mt-2 text-zinc-400">
            Enter the cards you want tracked individually. Blank rows will be grouped into one common lot automatically.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href={`/app/breaks/${item.id}`}
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Back to Break
          </Link>
        </div>
      </div>

      {pageError ? (
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {pageError}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Break</div>
          <div className="mt-2 text-lg font-semibold">
            {item.product_name || 'Untitled break'}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Date</div>
          <div className="mt-2 text-lg font-semibold">{item.break_date}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Source</div>
          <div className="mt-2 text-lg font-semibold">
            {item.source_name || '—'}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Order #</div>
          <div className="mt-2 text-lg font-semibold">
            {item.order_number || '—'}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Total Cost</div>
          <div className="mt-2 text-lg font-semibold">{money(item.total_cost)}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="text-sm text-zinc-400">Cards Received</div>
          <div className="mt-2 text-lg font-semibold">{cardsReceived}</div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="text-sm font-medium text-zinc-200">How this works</div>
        <div className="mt-2 space-y-1 text-sm text-zinc-400">
          <p>Only enter the cards you want tracked individually.</p>
          <p>Leave the rest blank.</p>
          <p>Any unfilled rows from this break will be grouped into one common / bulk lot automatically.</p>
          <p>Total cards recorded from this break cannot exceed the Cards Received count.</p>
          <p>Equal break cost is split across all received cards exactly.</p>
          <p>Speed mode: Tab works normally, and Enter/Return moves to the next row’s Player field.</p>
        </div>
      </div>

      <form
        action={addBreakCardsAction}
        className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
      >
        <input type="hidden" name="break_id" value={item.id} />
        <input type="hidden" name="card_count" value={rowCount} />
        <input type="hidden" name="cards_received" value={cardsReceived} />

        <div className="mb-5 text-sm text-zinc-400">
          This break has <span className="font-medium text-zinc-200">{cardsReceived}</span> card(s) received, so this form is locked to that maximum.
        </div>

        <BreakCardEntryGrid
          rowCount={rowCount}
          defaultYear={defaultYear}
          defaultSet={defaultSet}
        />

        <div className="mt-5 flex justify-end gap-3">
          <Link
            href={`/app/breaks/${item.id}`}
            className="rounded-xl border border-zinc-700 px-4 py-2 hover:bg-zinc-800"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-xl bg-white px-5 py-2 font-medium text-black hover:bg-zinc-200"
          >
            Add Cards To Inventory
          </button>
        </div>
      </form>
    </div>
  )
}