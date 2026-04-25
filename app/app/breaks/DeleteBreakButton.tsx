'use client'

import { deleteBreakAction } from '@/app/actions/break-delete'

export default function DeleteBreakButton({
  breakId,
  breakName,
}: {
  breakId: string
  breakName: string
}) {
  return (
    <form
      action={deleteBreakAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Delete this break?\n\n${breakName}\n\nThis hides it from the Breaks page, but your backup/restore system can still recover it.`
        )

        if (!confirmed) {
          event.preventDefault()
        }
      }}
      className="inline-flex"
    >
      <input type="hidden" name="break_id" value={breakId} />
      <button type="submit" className="app-button-danger">
        Delete
      </button>
    </form>
  )
}