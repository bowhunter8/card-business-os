'use client'

export default function CancelDetailsButton() {
  function handleCancel(event: React.MouseEvent<HTMLButtonElement>) {
    const details = event.currentTarget.closest('details')

    if (details) {
      details.open = false
    }
  }

  return (
    <button type="button" onClick={handleCancel} className="app-button whitespace-nowrap">
      Cancel
    </button>
  )
}