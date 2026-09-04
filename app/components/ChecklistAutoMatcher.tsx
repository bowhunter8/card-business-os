'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ensureChecklistInventoryMatches } from '@/app/actions/checklist-match-freshness'

type Props = {
  checklistId: string
}

type Message =
  | { kind: 'none'; text: '' }
  | { kind: 'success' | 'error'; text: string }

export default function ChecklistAutoMatcher({ checklistId }: Props) {
  const router = useRouter()
  const startedRef = useRef(false)
  const [isPending, startTransition] = useTransition()
  // Start false so the server render and the client's first render are identical.
  // The mount effect immediately calls run(false), which turns checking on.
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<Message>({ kind: 'none', text: '' })

  function run(force: boolean) {
    setChecking(true)
    setMessage({ kind: 'none', text: '' })

    startTransition(async () => {
      const result = await ensureChecklistInventoryMatches(checklistId, { force })

      setChecking(false)

      if (!result.ok) {
        setMessage({
          kind: 'error',
          text: `Inventory matching failed: ${result.error}`,
        })
        return
      }

      if (result.status === 'matched') {
        setMessage({
          kind: 'success',
          text: `Inventory matches updated${
            typeof result.candidateMatches === 'number'
              ? ` · ${result.candidateMatches} candidates found`
              : ''
          }.`,
        })
        router.refresh()
        return
      }

      if (force) {
        setMessage({
          kind: 'success',
          text: 'Inventory matches are already current.',
        })
      }
    })
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    run(false)
    // checklistId is stable for the lifetime of this checklist page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistId])

  const busy = checking || isPending

  return (
    <>
      <div className="flex min-w-0 flex-col items-end gap-1.5">
        <button
          type="button"
          className="app-button-primary"
          disabled={busy}
          onClick={() => run(true)}
        >
          {busy ? 'Finding Inventory...' : 'Refresh Matches'}
        </button>

        {message.kind !== 'none' && (
          <div
            className={
              message.kind === 'error'
                ? 'max-w-sm text-right text-xs text-red-300'
                : 'max-w-sm text-right text-xs text-emerald-300'
            }
          >
            {message.text}
          </div>
        )}
      </div>

      {busy && (
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center bg-black/70 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
          aria-label="Finding inventory matches"
        >
          <div className="flex min-w-70 flex-col items-center gap-4 rounded-2xl border border-zinc-700 bg-zinc-950/95 px-8 py-7 shadow-2xl">
            <span
              aria-hidden="true"
              className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-600 border-t-cyan-300"
            />
            <div className="text-center">
              <div className="text-base font-semibold text-zinc-100">
                Finding Inventory...
              </div>
              <div className="mt-1 text-sm text-zinc-400">
                Checking this checklist against your inventory.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
