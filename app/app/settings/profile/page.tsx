import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type AppUserProfileRow = {
  id: string
  email: string
  display_name: string | null
}

async function updateProfileAction(formData: FormData) {
  'use server'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const userEmail = String(user.email ?? '').trim().toLowerCase()
  const displayName = String(formData.get('display_name') ?? '').trim()

  const { error } = await supabase
    .from('app_users')
    .update({
      display_name: displayName || null,
    })
    .ilike('email', userEmail)

  if (error) {
    redirect(`/app/settings/profile?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/app')
  revalidatePath('/app/settings')
  revalidatePath('/app/settings/profile')

  redirect('/app/settings/profile?saved=1')
}

export default async function ProfileSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    saved?: string
    error?: string
  }>
}) {
  const params = searchParams ? await searchParams : undefined
  const saved = String(params?.saved ?? '') === '1'
  const error = String(params?.error ?? '').trim()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const userEmail = String(user.email ?? '').trim().toLowerCase()

  const { data: profile } = await supabase
    .from('app_users')
    .select('id, email, display_name')
    .ilike('email', userEmail)
    .maybeSingle()

  const appProfile = profile as AppUserProfileRow | null

  return (
    <div className="app-page-wide">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Profile</h1>
          <p className="app-subtitle">
            Choose the name shown inside the app. This can be your real name, business name, or gamer tag.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/app/settings" className="app-button whitespace-nowrap">
            Back to Settings
          </Link>
        </div>
      </div>

      {saved ? (
        <div className="app-alert-success">
          Profile saved successfully.
        </div>
      ) : null}

      {error ? (
        <div className="app-alert-error">
          Profile save failed: {error}
        </div>
      ) : null}

      <div className="app-section max-w-3xl">
        <form action={updateProfileAction} className="space-y-5">
          <div>
            <label className="app-label" htmlFor="display_name">
              Display Name
            </label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              defaultValue={appProfile?.display_name ?? ''}
              placeholder="Example: Chris, Bowhunter, BreakerMike"
              className="app-input mt-1"
            />
            <p className="mt-2 text-xs text-zinc-500">
              Optional. If left blank, the app will show your login email instead.
            </p>
          </div>

          <div>
            <label className="app-label">Login Email</label>
            <div className="mt-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
              {user.email}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Your login email is managed through your account login and is not changed here.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="app-button-primary whitespace-nowrap">
              Save Profile
            </button>

            <Link href="/app/settings" className="app-button whitespace-nowrap">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}