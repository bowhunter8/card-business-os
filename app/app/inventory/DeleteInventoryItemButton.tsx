'use client'

import { deleteInventoryItemAction } from '@/app/actions/inventory-delete'

export default function DeleteInventoryItemButton({
  itemId,
  itemName,
}: {
  itemId: string
  itemName: string
}) {
  return (
    <form
      action={deleteInventoryItemAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Delete this inventory item?\n\n${itemName}\n\nThis hides it from normal inventory, but your backup/restore system can still recover it.`
        )

        if (!confirmed) {
          event.preventDefault()
        }
      }}
      className="inline-flex"
    >
      <input type="hidden" name="item_id" value={itemId} />
      <button type="submit" className="app-button-danger">
        Delete
      </button>
    </form>
  )
}