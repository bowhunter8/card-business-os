import Link from 'next/link'

export default function SettingsPage() {
  return (
    <div className="app-page-wide">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">User Settings</h1>
          <p className="app-subtitle">
            Manage your account profile, business/tax report details, preferences, and reusable app settings.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/app/settings/profile" className="app-card transition hover:bg-zinc-800">
          <div className="text-lg font-semibold">Profile</div>
          <div className="mt-1 text-sm text-zinc-400">
            Update your display name. If blank, the app will use your login email.
          </div>
        </Link>

        <Link href="/app/settings/business" className="app-card transition hover:bg-zinc-800">
          <div className="text-lg font-semibold">Business / Tax Profile</div>
          <div className="mt-1 text-sm text-zinc-400">
            Optional business name, EIN, mailing address, phone, and email for tax reports and CPA records.
          </div>
        </Link>

        <Link href="/app/settings/shipping" className="app-card transition hover:bg-zinc-800">
          <div className="text-lg font-semibold">Shipping Profiles</div>
          <div className="mt-1 text-sm text-zinc-400">
            Manage PWE, bubble mailers, boxes, and reusable shipping charged/supplies cost presets.
          </div>
        </Link>

        <div className="app-card opacity-60">
          <div className="text-lg font-semibold">Preferences</div>
          <div className="mt-1 text-sm text-zinc-400">
            Future home for themes, accent colors, default views, and other personalization options.
          </div>
        </div>
      </div>
    </div>
  )
}