'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type OrderOption = {
  id: string
  order_numeric_id: string | null
  product_name: string | null
  seller: string | null
  processed_date: string | null
  processed_date_display: string | null
  total: number | null
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function dateDisplay(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US')
}

type Props = {
  primaryOrder: OrderOption
  recommendedOrders: OrderOption[]
}

export default function DraftBreakBuilder({
  primaryOrder,
  recommendedOrders,
}: Props) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<string[]>([primaryOrder.id])
  const [submitting, setSubmitting] = useState(false)

  const recommendedSelectedCount = useMemo(
    () => selectedIds.filter((id) => id !== primaryOrder.id).length,
    [selectedIds, primaryOrder.id]
  )

  function toggleOrder(id: string, forceChecked?: boolean) {
    setSelectedIds((current) => {
      const isSelected = current.includes(id)
      const shouldCheck = forceChecked ?? !isSelected

      if (shouldCheck) {
        if (isSelected) return current
        return [...current, id]
      }

      if (id === primaryOrder.id) {
        return current
      }

      return current.filter((value) => value !== id)
    })
  }

  function openDraftBreak() {
    if (!selectedIds.includes(primaryOrder.id)) {
      return
    }

    setSubmitting(true)

    const params = new URLSearchParams()
    params.set('whatnot_order_ids', selectedIds.join(','))

    router.push(`/app/breaks/new?${params.toString()}`)
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Build New Break From This Order</h2>
          <p className="mt-1 text-sm text-zinc-400">
            This opens the normal Add Break page with selected Whatnot orders prefilled, so you can edit everything before saving.
          </p>
        </div>

        <button
          type="button"
          onClick={openDraftBreak}
          disabled={submitting || !selectedIds.includes(primaryOrder.id)}
          className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Opening...' : 'Open In New Break Form'}
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={selectedIds.includes(primaryOrder.id)}
              onChange={(e) => toggleOrder(primaryOrder.id, e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-950"
            />
            <span>
              <span className="block font-medium">
                Include matched order{' '}
                {primaryOrder.order_numeric_id ? `#${primaryOrder.order_numeric_id}` : ''}
              </span>
              <span className="block text-sm text-zinc-400">
                {primaryOrder.product_name || 'Untitled order'}
              </span>
            </span>
          </label>
        </div>

        {recommendedOrders.length > 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="text-sm font-medium text-zinc-200">
              Recommended nearby orders from same seller and date
            </div>
            <div className="mt-1 text-sm text-zinc-400">
              Check any orders you want bundled into the same new break draft.
            </div>

            <div className="mt-4 space-y-3">
              {recommendedOrders.map((order) => (
                <label
                  key={order.id}
                  className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(order.id)}
                    onChange={(e) => toggleOrder(order.id, e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {order.order_numeric_id ? `#${order.order_numeric_id}` : 'No order #'} —{' '}
                      {money(order.total)}
                    </span>
                    <span className="block text-sm text-zinc-300">
                      {order.product_name || 'Untitled order'}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {order.seller || '—'} •{' '}
                      {order.processed_date_display || dateDisplay(order.processed_date)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
            No same-seller same-date staging orders were found to recommend for bundling.
          </div>
        )}

        <div className="text-sm text-zinc-400">
          Selected for draft: <span className="text-zinc-200">{selectedIds.length}</span>
          {recommendedOrders.length > 0 ? (
            <>
              {' '}
              <span className="text-zinc-500">({recommendedSelectedCount} recommended)</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}