'use client'

import { useState } from 'react'

type EstimateCardInput = {
  title: string | null
  playerName: string | null
  year: string | number | null
  brand: string | null
  setName: string | null
  cardNumber: string | null
  parallel: string | null
  team: string | null
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function parseManualValue(value: string) {
  const cleaned = value.replace(/\$/g, '').replace(/,/g, '').trim()
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export default function EstimateValueHelper({
  item,
  inputId,
}: {
  item: EstimateCardInput
  inputId: string
}) {
  void item
  const [estimatedValue, setEstimatedValue] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null)


  function handleApplyEstimate() {
    const parsed = parseManualValue(estimatedValue)

    if (parsed == null) {
      setMessageType('error')
      setMessage('Enter a valid estimated value first.')
      return
    }

    const input = document.getElementById(inputId) as HTMLInputElement | null

    if (!input) {
      setMessageType('error')
      setMessage('Estimated value input was not found on this page.')
      return
    }

    input.value = parsed.toFixed(2)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))

    setMessageType('success')
    setMessage(`Applied ${money(parsed)} to the field. Click Save Changes to keep it.`)
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`${inputId}-manual-estimate`}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={estimatedValue}
          onChange={(event) => {
            setEstimatedValue(event.target.value)
            setMessage(null)
            setMessageType(null)
          }}
          placeholder="Example: 1.60"
          className="app-input max-w-40 px-2.5 py-1 text-xs"
        />

        <button
          type="button"
          onClick={handleApplyEstimate}
          className="app-button-primary whitespace-nowrap px-2.5 py-1 text-xs"
        >
          Apply
        </button>
      </div>

      {message ? (
        <div
          className={`mt-2 text-[11px] leading-snug ${
            messageType === 'success' ? 'text-emerald-300' : 'text-red-300'
          }`}
        >
          {message}
        </div>
      ) : null}
    </div>
  )
}
