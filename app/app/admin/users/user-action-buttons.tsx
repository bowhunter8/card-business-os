'use client'

import { useTransition } from 'react'
import {
  setBetaUnlimited,
  setSubscriptionStatus,
  setUserRole,
  toggleUserActive,
} from './actions'

type SubscriptionStatus =
  | 'beta'
  | 'trial'
  | 'active'
  | 'comped'
  | 'past_due'
  | 'expired'
  | 'canceled'
  | 'inactive'

type UserActionButtonsProps = {
  userId: string
  isCurrentUser: boolean
  isRowAdmin: boolean
  isRowActive: boolean
  email: string
  subscriptionStatus?: string | null
  betaUnlimited?: boolean | null
}

export default function UserActionButtons({
  userId,
  isCurrentUser,
  isRowAdmin,
  isRowActive,
  email,
  subscriptionStatus,
  betaUnlimited,
}: UserActionButtonsProps) {
  const [isPending, startTransition] = useTransition()

  const currentStatus = (subscriptionStatus || 'beta') as SubscriptionStatus
  const isBetaUnlimited = Boolean(betaUnlimited)

  function handleSubscriptionChange(nextStatus: string) {
    if (
      !confirm(`Change subscription status for ${email} to ${nextStatus}?`)
    ) {
      return
    }

    startTransition(() => {
      void setSubscriptionStatus(userId, nextStatus as SubscriptionStatus)
    })
  }

  function handleBetaToggle() {
    const nextValue = !isBetaUnlimited

    if (
      !confirm(
        nextValue
          ? `Give unlimited beta access to ${email}?`
          : `Remove unlimited beta access for ${email}?`
      )
    ) {
      return
    }

    startTransition(() => {
      void setBetaUnlimited(userId, nextValue)
    })
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <select
        defaultValue={currentStatus}
        className="app-input min-w-[130px]"
        disabled={isPending}
        onChange={(event) => {
          handleSubscriptionChange(event.currentTarget.value)
        }}
      >
        <option value="beta">Beta</option>
        <option value="trial">Trial</option>
        <option value="active">Active</option>
        <option value="comped">Comped</option>
        <option value="past_due">Past Due</option>
        <option value="expired">Expired</option>
        <option value="canceled">Canceled</option>
        <option value="inactive">Inactive</option>
      </select>

      <button
        type="button"
        className={isBetaUnlimited ? 'app-button' : 'app-button-danger'}
        disabled={isPending}
        onClick={handleBetaToggle}
      >
        {isBetaUnlimited ? 'Beta: On' : 'Beta: Off'}
      </button>

      {isRowActive ? (
        <form
          action={toggleUserActive.bind(null, userId, false)}
          onSubmit={(event) => {
            if (
              !confirm(
                `Are you sure you want to deactivate access for ${email}?`
              )
            ) {
              event.preventDefault()
            }
          }}
        >
          <button
            className="app-button app-button-danger"
            disabled={isCurrentUser}
          >
            Deactivate
          </button>
        </form>
      ) : (
        <form
          action={toggleUserActive.bind(null, userId, true)}
          onSubmit={(event) => {
            if (
              !confirm(
                `Are you sure you want to reactivate access for ${email}?`
              )
            ) {
              event.preventDefault()
            }
          }}
        >
          <button className="app-button">Activate</button>
        </form>
      )}

      {isRowAdmin ? (
        <form
          action={setUserRole.bind(null, userId, 'user')}
          onSubmit={(event) => {
            if (
              !confirm(
                `Are you sure you want to remove admin access for ${email}?`
              )
            ) {
              event.preventDefault()
            }
          }}
        >
          <button className="app-button" disabled={isCurrentUser}>
            Demote
          </button>
        </form>
      ) : (
        <form
          action={setUserRole.bind(null, userId, 'admin')}
          onSubmit={(event) => {
            if (
              !confirm(`Are you sure you want to make ${email} an admin?`)
            ) {
              event.preventDefault()
            }
          }}
        >
          <button className="app-button">Make Admin</button>
        </form>
      )}
    </div>
  )
}