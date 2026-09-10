import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import ChecklistBrowser from '@/app/components/ChecklistBrowser'
import ChecklistProblemReport from '@/app/components/ChecklistProblemReport'

type ChecklistRow = {
  id: string
  owner_user_id: string | null
  visibility: string
  sport: string | null
  year: string | null
  manufacturer: string | null
  brand: string | null
  product_name: string | null
  name: string
  source_type: string | null
  source_reference: string | null
  verified: boolean
  is_active: boolean
  superseded_by_checklist_id: string | null
  superseded_at: string | null
  supersede_reason: string | null
  notes: string | null
  created_at: string
}

type PageProps = {
  params: Promise<{
    id: string
  }>
  searchParams: Promise<{
    buildSuccess?: string | string[]
    buildError?: string | string[]
    editSuccess?: string | string[]
    editError?: string | string[]
  }>
}

function clean(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function checklistMeta(checklist: ChecklistRow) {
  const parts = [
    clean(checklist.year),
    clean(checklist.manufacturer),
    clean(checklist.brand),
    clean(checklist.product_name),
  ].filter(Boolean)

  return Array.from(new Set(parts)).join(' • ')
}

export default async function ChecklistDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const queryParams = await searchParams

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: appUserData } = await supabase
    .from('app_users')
    .select('role, is_active')
    .eq('email', user.email ?? '')
    .maybeSingle()

  const isAdmin =
    appUserData?.is_active === true &&
    clean(appUserData?.role).toLowerCase() === 'admin'

  const { data: checklistData, error: checklistError } = await supabase
    .from('checklists')
    .select(
      'id, owner_user_id, visibility, sport, year, manufacturer, brand, product_name, name, source_type, source_reference, verified, is_active, superseded_by_checklist_id, superseded_at, supersede_reason, notes, created_at'
    )
    .eq('id', id)
    .maybeSingle()

  if (checklistError) {
    throw new Error(`Unable to load checklist: ${checklistError.message}`)
  }

  if (!checklistData) notFound()

  const checklist = checklistData as ChecklistRow

  const { data: adminChecklistOptionsData } = isAdmin
    ? await supabase
        .from('checklists')
        .select('id, year, manufacturer, brand, product_name, name')
        .eq('is_active', true)
        .neq('id', checklist.id)
        .order('year', { ascending: false })
        .order('name', { ascending: true })
    : { data: [] }

  const adminChecklistOptions = adminChecklistOptionsData ?? []
  const meta = checklistMeta(checklist)

  async function updateChecklistMetadataAction(formData: FormData) {
    'use server'

    const actionSupabase = await createClient()
    const {
      data: { user: actionUser },
    } = await actionSupabase.auth.getUser()

    if (!actionUser?.email) redirect('/login')

    const { data: actionAppUser } = await actionSupabase
      .from('app_users')
      .select('role, is_active')
      .eq('email', actionUser.email)
      .maybeSingle()

    const actionIsAdmin =
      actionAppUser?.is_active === true &&
      clean(actionAppUser?.role).toLowerCase() === 'admin'

    if (!actionIsAdmin) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'Admin access is required to edit checklist metadata.'
        )}`
      )
    }

    const nextName = clean(String(formData.get('name') ?? ''))
    const nextYear = clean(String(formData.get('year') ?? ''))
    const nextManufacturer = clean(String(formData.get('manufacturer') ?? ''))
    const nextBrand = clean(String(formData.get('brand') ?? ''))
    const nextProductName = clean(String(formData.get('product_name') ?? ''))

    if (!nextName) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'Checklist name is required.'
        )}`
      )
    }

    const { error: updateError } = await actionSupabase
      .from('checklists')
      .update({
        name: nextName,
        year: nextYear || null,
        manufacturer: nextManufacturer || null,
        brand: nextBrand || null,
        product_name: nextProductName || null,
      })
      .eq('id', checklist.id)

    if (updateError) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          updateError.message
        )}`
      )
    }

    revalidatePath('/app/checklists')
    revalidatePath(`/app/checklists/${checklist.id}`)

    redirect(
      `/app/checklists/${checklist.id}?editSuccess=${encodeURIComponent(
        'Checklist metadata updated.'
      )}#checklist-browser`
    )
  }


  async function updateChecklistLibraryStateAction(formData: FormData) {
    'use server'

    const actionSupabase = await createClient()
    const {
      data: { user: actionUser },
    } = await actionSupabase.auth.getUser()

    if (!actionUser?.email) redirect('/login')

    const { data: actionAppUser } = await actionSupabase
      .from('app_users')
      .select('role, is_active')
      .eq('email', actionUser.email)
      .maybeSingle()

    const actionIsAdmin =
      actionAppUser?.is_active === true &&
      clean(actionAppUser?.role).toLowerCase() === 'admin'

    if (!actionIsAdmin) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'Admin access is required to manage checklist library settings.'
        )}`
      )
    }

    const nextVisibility =
      clean(String(formData.get('visibility') ?? 'private')) === 'global'
        ? 'global'
        : 'private'
    const nextVerified = String(formData.get('verified') ?? '') === 'true'

    const { error } = await actionSupabase
      .from('checklists')
      .update({
        visibility: nextVisibility,
        verified: nextVerified,
      })
      .eq('id', checklist.id)

    if (error) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          error.message
        )}`
      )
    }

    revalidatePath('/app/checklists')
    revalidatePath(`/app/checklists/${checklist.id}`)

    redirect(
      `/app/checklists/${checklist.id}?editSuccess=${encodeURIComponent(
        'Checklist library settings updated.'
      )}#checklist-browser`
    )
  }

  async function supersedeChecklistAction(formData: FormData) {
    'use server'

    const actionSupabase = await createClient()
    const {
      data: { user: actionUser },
    } = await actionSupabase.auth.getUser()

    if (!actionUser?.email) redirect('/login')

    const { data: actionAppUser } = await actionSupabase
      .from('app_users')
      .select('role, is_active')
      .eq('email', actionUser.email)
      .maybeSingle()

    const actionIsAdmin =
      actionAppUser?.is_active === true &&
      clean(actionAppUser?.role).toLowerCase() === 'admin'

    if (!actionIsAdmin) redirect('/app/checklists')

    const replacementId = clean(
      String(formData.get('replacement_checklist_id') ?? '')
    )
    const reason =
      clean(String(formData.get('supersede_reason') ?? '')) ||
      'Replaced by a newer or corrected HITS checklist.'

    if (!replacementId || replacementId === checklist.id) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'Choose a different active checklist as the replacement.'
        )}`
      )
    }

    const { data: replacement } = await actionSupabase
      .from('checklists')
      .select('id, name, is_active')
      .eq('id', replacementId)
      .eq('is_active', true)
      .maybeSingle()

    if (!replacement) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'The replacement checklist could not be found or is not active.'
        )}`
      )
    }

    const { error } = await actionSupabase
      .from('checklists')
      .update({
        is_active: false,
        superseded_by_checklist_id: replacement.id,
        superseded_at: new Date().toISOString(),
        supersede_reason: reason,
      })
      .eq('id', checklist.id)

    if (error) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          error.message
        )}`
      )
    }

    revalidatePath('/app/checklists')
    revalidatePath(`/app/checklists/${checklist.id}`)
    revalidatePath(`/app/checklists/${replacement.id}`)

    redirect(
      `/app/checklists/${replacement.id}?editSuccess=${encodeURIComponent(
        `Superseded "${checklist.name}" with this checklist.`
      )}`
    )
  }

  async function deleteChecklistAction(formData: FormData) {
    'use server'

    const actionSupabase = await createClient()
    const {
      data: { user: actionUser },
    } = await actionSupabase.auth.getUser()

    if (!actionUser?.email) redirect('/login')

    const { data: actionAppUser } = await actionSupabase
      .from('app_users')
      .select('role, is_active')
      .eq('email', actionUser.email)
      .maybeSingle()

    const actionIsAdmin =
      actionAppUser?.is_active === true &&
      clean(actionAppUser?.role).toLowerCase() === 'admin'

    if (!actionIsAdmin) redirect('/app/checklists')

    const confirmation = clean(String(formData.get('confirmation') ?? ''))
    if (confirmation !== checklist.name) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          `Delete cancelled. Type the exact checklist name: ${checklist.name}`
        )}`
      )
    }

    // Never delete inventory. Block hard deletion when this checklist currently
    // has saved inventory matches so the admin can supersede it instead.
    //
    // IMPORTANT: Do this check entirely in the database. The old version first
    // downloaded every checklist item ID into the app and then checked those IDs
    // in batches. Large products (for example, 14,400-card Prizm checklists)
    // could overwhelm the request and fail with "TypeError: fetch failed".
    //
    // This joined query asks Supabase for at most ONE matching row belonging to
    // this checklist, so the amount of data returned stays tiny regardless of
    // checklist size.
    const { data: existingMatches, error: matchCheckError } =
      await actionSupabase
        .from('checklist_inventory_matches')
        .select(
          'checklist_item_id, checklist_items!inner(checklist_id)'
        )
        .eq('checklist_items.checklist_id', checklist.id)
        .limit(1)

    if (matchCheckError) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          matchCheckError.message
        )}`
      )
    }

    const hasInventoryMatches = (existingMatches ?? []).length > 0

    if (hasInventoryMatches) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          'This checklist has inventory matches, so HITS blocked permanent deletion. Supersede it instead; inventory will remain safe.'
        )}`
      )
    }

    const { error: deleteError } = await actionSupabase
      .from('checklists')
      .delete()
      .eq('id', checklist.id)

    if (deleteError) {
      redirect(
        `/app/checklists/${checklist.id}?editError=${encodeURIComponent(
          `Delete failed: ${deleteError.message}`
        )}`
      )
    }

    revalidatePath('/app/checklists')
    redirect(
      `/app/checklists?deleted=${encodeURIComponent(
        `Deleted checklist: ${checklist.name}`
      )}`
    )
  }

  const buildSuccessMessage = firstParam(queryParams.buildSuccess)
  const buildErrorMessage = firstParam(queryParams.buildError)
  const editSuccessMessage = firstParam(queryParams.editSuccess)
  const editErrorMessage = firstParam(queryParams.editError)

  return (
    <div id="checklist-top" className="app-page-wide space-y-5">
      <div className="app-page-header">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="app-badge app-badge-info">
              {checklist.visibility === 'global' ? 'HITS Library' : 'Private'}
            </span>

            {checklist.verified && (
              <span className="app-badge app-badge-success">Verified</span>
            )}

            {clean(checklist.source_type) && (
              <span className="app-badge">
                Source: {checklist.source_type}
              </span>
            )}
          </div>

          <h1 className="app-title">{checklist.name}</h1>

          {meta && <p className="app-subtitle">{meta}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app/checklists" className="app-button">
            Back to Checklist Library
          </Link>

          <Link href="/app/checklists/import" className="app-button">
            Import Another
          </Link>

          <ChecklistProblemReport
            checklistId={checklist.id}
            checklistName={checklist.name}
            checklistItemId={null}
            sectionName={null}
            teamName={null}
            cardNumber={null}
            playerName={null}
            buttonLabel="Report a Problem"
          />

          {isAdmin && (
            <details className="relative">
              <summary className="app-button cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                Edit Checklist
              </summary>

              <div className="absolute right-0 z-50 mt-2 w-[min(92vw,560px)] rounded-xl border border-cyan-900 bg-zinc-950 p-4 shadow-2xl">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">Edit Checklist Metadata</h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    Admin only. This changes checklist metadata only — cards,
                    sections, matches, and import history are not modified.
                  </p>
                </div>

                <form action={updateChecklistMetadataAction} className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Checklist Name
                    </span>
                    <input
                      name="name"
                      defaultValue={checklist.name}
                      required
                      className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-600"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Year
                      </span>
                      <input
                        name="year"
                        defaultValue={clean(checklist.year)}
                        placeholder="2026 or 2025-26"
                        className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-600"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Manufacturer
                      </span>
                      <input
                        name="manufacturer"
                        defaultValue={clean(checklist.manufacturer)}
                        placeholder="Topps, Panini, Bowman..."
                        className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-600"
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Brand
                      </span>
                      <input
                        name="brand"
                        defaultValue={clean(checklist.brand)}
                        placeholder="Prizm, Chrome..."
                        className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-600"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Product Name
                      </span>
                      <input
                        name="product_name"
                        defaultValue={clean(checklist.product_name)}
                        placeholder="Baseball Prizm"
                        className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-600"
                      />
                    </label>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button type="submit" className="app-button-primary">
                      Save Checklist
                    </button>
                  </div>
                </form>

                <div className="my-5 border-t border-zinc-800" />

                <form action={updateChecklistLibraryStateAction} className="space-y-3">
                  <div>
                    <h3 className="font-semibold">Library Settings</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Control whether users can see this checklist and whether
                      you have verified its library data.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Visibility
                      </span>
                      <select
                        name="visibility"
                        defaultValue={checklist.visibility}
                        className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                      >
                        <option value="private">Private</option>
                        <option value="global">HITS Library</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Verification
                      </span>
                      <select
                        name="verified"
                        defaultValue={checklist.verified ? 'true' : 'false'}
                        className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                      >
                        <option value="false">Unverified</option>
                        <option value="true">Verified</option>
                      </select>
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <button type="submit" className="app-button">
                      Save Library Settings
                    </button>
                  </div>
                </form>

                <div className="my-5 border-t border-zinc-800" />

                <form action={supersedeChecklistAction} className="space-y-3">
                  <div>
                    <h3 className="font-semibold">Supersede Checklist</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Use this when a newer or corrected checklist replaces this
                      one. The old checklist becomes inactive instead of being
                      destroyed.
                    </p>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Replacement Checklist
                    </span>
                    <select
                      name="replacement_checklist_id"
                      required
                      defaultValue=""
                      className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                    >
                      <option value="" disabled>
                        Choose the newer/corrected checklist…
                      </option>
                      {adminChecklistOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {[option.year, option.manufacturer, option.name]
                            .filter(Boolean)
                            .join(' • ')}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Reason
                    </span>
                    <input
                      name="supersede_reason"
                      placeholder="Example: Revised manufacturer checklist replaced incomplete release."
                      className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                    />
                  </label>

                  <div className="flex justify-end">
                    <button type="submit" className="app-button-warning">
                      Supersede This Checklist
                    </button>
                  </div>
                </form>

                <div className="my-5 border-t border-red-950" />

                <form action={deleteChecklistAction} className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-red-300">
                      Permanently Delete Checklist
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      For mistakes, test imports, or unusable duplicates only.
                      HITS blocks deletion when saved inventory matches exist.
                      Inventory items themselves are never deleted.
                    </p>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Type the exact checklist name to confirm
                    </span>
                    <div className="mb-1 text-xs text-zinc-300">
                      {checklist.name}
                    </div>
                    <input
                      name="confirmation"
                      required
                      autoComplete="off"
                      className="w-full rounded-lg border border-red-900 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-red-600"
                    />
                  </label>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-950/70"
                    >
                      Delete Checklist Permanently
                    </button>
                  </div>
                </form>
              </div>
            </details>
          )}
        </div>
      </div>

      {editSuccessMessage && (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          {editSuccessMessage}
        </div>
      )}

      {editErrorMessage && (
        <div className="rounded-xl border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          Checklist update failed: {editErrorMessage}
        </div>
      )}

      {buildSuccessMessage && (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          {buildSuccessMessage}
        </div>
      )}

      {buildErrorMessage && (
        <div className="rounded-xl border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          Build failed: {buildErrorMessage}
        </div>
      )}

      <section id="checklist-browser" className="scroll-mt-6">
        <ChecklistBrowser checklistId={checklist.id} />
      </section>

      {(clean(checklist.source_reference) || clean(checklist.notes)) && (
        <section className="app-section p-4">
          <h2 className="text-base font-semibold">Checklist Source</h2>

          {clean(checklist.source_reference) && (
            <div className="mt-2 text-sm text-zinc-400">
              File:{' '}
              <span className="text-zinc-200">
                {checklist.source_reference}
              </span>
            </div>
          )}

          {clean(checklist.notes) && (
            <div className="mt-2 text-sm text-zinc-400">
              {checklist.notes}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
