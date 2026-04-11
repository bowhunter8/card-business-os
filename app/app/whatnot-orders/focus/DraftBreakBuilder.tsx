'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type DraftOrder = {
  id: string
  order_numeric_id: string | null
  product_name: string | null
  seller: string | null
  processed_date: string | null
  processed_date_display: string | null
  total: number | null
}

type Props = {
  primaryOrder: DraftOrder
  recommendedOrders: DraftOrder[]
}

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function dateDisplay(value: string | null | undefined, fallback?: string | null) {
  if (fallback) return fallback
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US')
}

export default function DraftBreakBuilder({
  primaryOrder,
  recommendedOrders,
}: Props) {
  const router = useRouter()

  const uniqueRecommendedOrders = useMemo(() => {
    const seen = new Set<string>()
    const rows: DraftOrder[] = []

    for (const order of recommendedOrders) {
      if (!order?.id) continue
      if (order.id === primaryOrder.id) continue
      if (seen.has(order.id)) continue
      seen.add(order.id)
      rows.push(order)
    }

    return rows
  }, [primaryOrder.id, recommendedOrders])

  const defaultSelectedIds = useMemo(
    () => [primaryOrder.id, ...uniqueRecommendedOrders.map((order) => order.id)],
    [primaryOrder.id, uniqueRecommendedOrders]
  )

  const [selectedOrderIds, setSelectedOrderIds] =
    useState<string[]>(defaultSelectedIds)

  function toggleOrder(orderId: string) {
    setSelectedOrderIds((current) => {
      if (orderId === primaryOrder.id) {
        return current.includes(orderId) ? current : [...current, orderId]
      }

      if (current.includes(orderId)) {
        return current.filter((id) => id !== orderId)
      }

      return [...current, orderId]
    })
  }

  function openBreakForm() {
    const uniqueIds = Array.from(new Set(selectedOrderIds)).filter(Boolean)

    if (!uniqueIds.includes(primaryOrder.id)) {
      uniqueIds.unshift(primaryOrder.id)
    }

    const params = new URLSearchParams()
    params.set('whatnot_order_ids', uniqueIds.join(','))
    router.push(`/app/breaks/new?${params.toString()}`)
  }

  const selectedCount = Array.from(new Set(selectedOrderIds)).length

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Build New Break From This Order</h2>
          <p className="mt-1 text-sm text-zinc-400">
            This opens the normal Add Break page with selected Whatnot orders
            prefilled, so you can edit everything before saving.
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            The matched order is always included. Suggested associated orders are
            checked by default.
          </p>
        </div>

        <button
          type="button"
          onClick={openBreakForm}
          className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
        >
          Open In New Break Form
        </button>
      </div>

      <div className="mt-6 space-y-3">
        <label className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <input
            type="checkbox"
            checked
            disabled
            className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-950"
          />

          <div className="min-w-0">
            <div className="font-medium">
              Include matched order{' '}
              {primaryOrder.order_numeric_id
                ? `#${primaryOrder.order_numeric_id}`
                : '(no order #)'}
            </div>

            <div className="mt-1 text-sm text-zinc-300">
              {primaryOrder.product_name || 'Untitled order'}
            </div>

            <div className="mt-1 text-xs text-zinc-500">
              {primaryOrder.seller || '—'} •{' '}
              {dateDisplay(
                primaryOrder.processed_date,
                primaryOrder.processed_date_display
              )}{' '}
              • {money(primaryOrder.total)}
            </div>
          </div>
        </label>

        {uniqueRecommendedOrders.length > 0 ? (
          <div className="space-y-3">
            <div className="pt-2 text-sm font-medium text-zinc-300">
              Suggested Associated Orders
            </div>

            {uniqueRecommendedOrders.map((order) => {
              const checked = selectedOrderIds.includes(order.id)

              return (
                <label
                  key={order.id}
                  className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOrder(order.id)}
                    className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                  />

                  <div className="min-w-0">
                    <div className="font-medium">
                      {order.order_numeric_id
                        ? `Suggested order #${order.order_numeric_id}`
                        : 'Suggested order'}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      {order.product_name || 'Untitled order'}
                    </div>

                    <div className="mt-1 text-xs text-zinc-500">
                      {order.seller || '—'} •{' '}
                      {dateDisplay(
                        order.processed_date,
                        order.processed_date_display
                      )}{' '}
                      • {money(order.total)} • same seller / same date
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
            No same-seller same-date staging orders were found to recommend for
            bundling.
          </div>
        )}
      </div>

      <div className="mt-5 text-sm text-zinc-400">
        Selected orders to send into the new break form:{' '}
        <span className="font-medium text-zinc-200">{selectedCount}</span>
      </div>
    </div>
  )
}