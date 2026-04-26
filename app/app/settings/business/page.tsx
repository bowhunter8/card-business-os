import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type BusinessProfileRow = {
  id: string
  email: string
  legal_name: string | null
  business_name: string | null
  ein: string | null
  phone: string | null
  business_email: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
}

function cleanOptional(value: FormDataEntryValue | null) {
  const cleaned = String(value ?? '').trim()
  return cleaned || null
}

async function updateBusinessProfileAction(formData: FormData) {
  'use server'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const userEmail = String(user.email ?? '').trim().toLowerCase()

  const { error } = await supabase
    .from('app_users')
    .update({
      legal_name: cleanOptional(formData.get('legal_name')),
      business_name: cleanOptional(formData.get('business_name')),
      ein: cleanOptional(formData.get('ein')),
      phone: cleanOptional(formData.get('phone')),
      business_email: cleanOptional(formData.get('business_email')),
      address_line1: cleanOptional(formData.get('address_line1')),
      address_line2: cleanOptional(formData.get('address_line2')),
      city: cleanOptional(formData.get('city')),
      state: cleanOptional(formData.get('state')),
      zip: cleanOptional(formData.get('zip')),
      country: cleanOptional(formData.get('country')),
    })
    .ilike('email', userEmail)

  if (error) {
    redirect(`/app/settings/business?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/app/settings')
  revalidatePath('/app/settings/business')
  revalidatePath('/app/reports/tax/summary')

  redirect('/app/settings/business?saved=1')
}

export default async function BusinessTaxProfilePage({
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
    .select(`
      id,
      email,
      legal_name,
      business_name,
      ein,
      phone,
      business_email,
      address_line1,
      address_line2,
      city,
      state,
      zip,
      country
    `)
    .ilike('email', userEmail)
    .maybeSingle()

  const businessProfile = profile as BusinessProfileRow | null

  return (
    <div className="app-page-wide">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">Business / Tax Profile</h1>
          <p className="app-subtitle">
            Optional information that can print on tax reports, CPA records, and year-end summaries.
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
          Business / tax profile saved successfully.
        </div>
      ) : null}

      {error ? (
        <div className="app-alert-error">
          Business / tax profile save failed: {error}
        </div>
      ) : null}

      <div className="app-section max-w-5xl">
        <div className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="text-sm font-semibold text-zinc-200">
            Everything on this page is optional.
          </div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            These fields are for convenience only. They help identify the taxpayer or business on tax reports
            and make it easier to provide clean records to a CPA.
          </p>
        </div>

        <form action={updateBusinessProfileAction} className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Identity</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div>
                <label className="app-label" htmlFor="legal_name">
                  Name
                </label>
                <input
                  id="legal_name"
                  name="legal_name"
                  type="text"
                  defaultValue={businessProfile?.legal_name ?? ''}
                  placeholder="Example: Chris Smith"
                  className="app-input mt-1"
                />
              </div>

              <div>
                <label className="app-label" htmlFor="business_name">
                  Business Name
                </label>
                <input
                  id="business_name"
                  name="business_name"
                  type="text"
                  defaultValue={businessProfile?.business_name ?? ''}
                  placeholder="Example: Chris Cards LLC"
                  className="app-input mt-1"
                />
              </div>

              <div>
                <label className="app-label" htmlFor="ein">
                  EIN #
                </label>
                <input
                  id="ein"
                  name="ein"
                  type="text"
                  defaultValue={businessProfile?.ein ?? ''}
                  placeholder="Example: 12-3456789"
                  className="app-input mt-1"
                />
                <p className="mt-2 text-xs text-zinc-500">
                  Optional. Useful for CPA records if your business has an EIN.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Contact</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div>
                <label className="app-label" htmlFor="phone">
                  Phone
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="text"
                  defaultValue={businessProfile?.phone ?? ''}
                  placeholder="Example: 555-123-4567"
                  className="app-input mt-1"
                />
              </div>

              <div>
                <label className="app-label" htmlFor="business_email">
                  Email
                </label>
                <input
                  id="business_email"
                  name="business_email"
                  type="email"
                  defaultValue={businessProfile?.business_email ?? ''}
                  placeholder="Example: business@example.com"
                  className="app-input mt-1"
                />
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Mailing Address</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Enter either your personal mailing address or separate business mailing address.
            </p>

            <div className="mt-3 grid gap-4">
              <div>
                <label className="app-label" htmlFor="address_line1">
                  Address Line 1
                </label>
                <input
                  id="address_line1"
                  name="address_line1"
                  type="text"
                  defaultValue={businessProfile?.address_line1 ?? ''}
                  placeholder="Street address or PO box"
                  className="app-input mt-1"
                />
              </div>

              <div>
                <label className="app-label" htmlFor="address_line2">
                  Address Line 2
                </label>
                <input
                  id="address_line2"
                  name="address_line2"
                  type="text"
                  defaultValue={businessProfile?.address_line2 ?? ''}
                  placeholder="Apartment, suite, unit, etc."
                  className="app-input mt-1"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="md:col-span-2">
                  <label className="app-label" htmlFor="city">
                    City
                  </label>
                  <input
                    id="city"
                    name="city"
                    type="text"
                    defaultValue={businessProfile?.city ?? ''}
                    className="app-input mt-1"
                  />
                </div>

                <div>
                  <label className="app-label" htmlFor="state">
                    State
                  </label>
                  <input
                    id="state"
                    name="state"
                    type="text"
                    defaultValue={businessProfile?.state ?? ''}
                    placeholder="SD"
                    className="app-input mt-1"
                  />
                </div>

                <div>
                  <label className="app-label" htmlFor="zip">
                    ZIP
                  </label>
                  <input
                    id="zip"
                    name="zip"
                    type="text"
                    defaultValue={businessProfile?.zip ?? ''}
                    className="app-input mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="app-label" htmlFor="country">
                  Country
                </label>
                <input
                  id="country"
                  name="country"
                  type="text"
                  defaultValue={businessProfile?.country ?? ''}
                  placeholder="United States"
                  className="app-input mt-1"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="app-button-primary whitespace-nowrap">
              Save Business / Tax Profile
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