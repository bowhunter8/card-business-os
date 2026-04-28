'use client'

import { useState } from 'react'
import { addApprovedUser } from './actions'

export default function AddUserForm() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="app-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-zinc-100">
            Add Approved User
          </div>
          <p className="app-muted mt-1">
            Add someone by email before they sign in. Their login email must
            match this exactly.
          </p>
        </div>

        <button
          type="button"
          className="app-button"
          onClick={() => setIsOpen((value) => !value)}
        >
          {isOpen ? 'Close' : 'Add User'}
        </button>
      </div>

      {isOpen ? (
        <form action={addApprovedUser} className="mt-4 grid gap-4 md:grid-cols-4">
          <div>
            <label className="app-label">Email</label>
            <input
              name="email"
              type="email"
              required
              className="app-input"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label className="app-label">Display Name</label>
            <input
              name="display_name"
              className="app-input"
              placeholder="Optional"
            />
          </div>

          <div>
            <label className="app-label">Role</label>
            <select name="role" defaultValue="user" className="app-input">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label className="app-label">Starting Status</label>
            <select name="status" defaultValue="active" className="app-input">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="md:col-span-4 flex justify-end">
            <button type="submit" className="app-button">
              Save Approved User
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}