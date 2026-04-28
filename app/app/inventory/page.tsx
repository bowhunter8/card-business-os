import Link from 'next/link'
import Script from 'next/script'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { reverseSaleAction } from '@/app/actions/sale-safety'
import DeleteInventoryItemButton from './DeleteInventoryItemButton'
import CancelDetailsButton from '../search/CancelDetailsButton'

type InventoryRow = {
  id: string
  status: string | null
  item_type: string | null
  title: string | null
  player_name: string | null
  year: number | null
  brand: string | null
  set_name: string | null
  card_number: string | null
  parallel_name: string | null
  team: string | null
  quantity: number | null
  available_quantity: number | null
  cost_basis_unit: number | null
  cost_basis_total: number | null
  estimated_value_total: number | null
  storage_location: string | null
  notes: string | null
  created_at?: string
}

type SaleRow = {
  id: string
  inventory_item_id: string
  sale_date: string | null
  quantity_sold: number | null
  reversed_at: string | null
}

type SortKey =
  | 'created_at'
  | 'card'
  | 'status'
  | 'quantity'
  | 'available_quantity'
  | 'cost_basis_unit'
  | 'cost_basis_total'
  | 'estimated_value_total'
  | 'storage_location'

type SortDir = 'asc' | 'desc'
type BulkStatus = 'available' | 'listed' | 'personal' | 'junk'

const DEFAULT_LIMIT = 10
const LIMIT_OPTIONS = [10, 25, 100] as const
const BULK_INVENTORY_FORM_ID = 'bulk-delete-inventory-page-form'
const BULK_SELECTION_COUNT_ID = 'bulk-inventory-selected-count'
const BULK_SCROLL_RESTORE_ID = 'bulk-inventory-scroll-restore'
const BULK_PENDING_STATE_ID = 'bulk-inventory-pending-state'

function money(value: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function cleanSearchTerm(value: string) {
  return value.trim().replace(/,/g, ' ')
}

function getCardDisplay(item: InventoryRow) {
  return [
    item.year,
    item.brand,
    item.set_name,
    item.card_number ? `#${item.card_number}` : null,
    item.parallel_name,
    item.team,
  ]
    .filter(Boolean)
    .join(' • ')
}

function getPrimaryTitle(item: InventoryRow) {
  return item.title || item.player_name || 'Untitled item'
}

function getSortValue(item: InventoryRow, key: SortKey) {
  switch (key) {
    case 'created_at':
      return item.created_at || ''
    case 'card':
      return `${getPrimaryTitle(item)} ${getCardDisplay(item)}`
    case 'status':
      return item.status || ''
    case 'quantity':
      return Number(item.quantity ?? 0)
    case 'available_quantity':
      return Number(item.available_quantity ?? 0)
    case 'cost_basis_unit':
      return Number(item.cost_basis_unit ?? 0)
    case 'cost_basis_total':
      return Number(item.cost_basis_total ?? 0)
    case 'estimated_value_total':
      return Number(item.estimated_value_total ?? 0)
    case 'storage_location':
      return item.storage_location || ''
    default:
      return ''
  }
}

function compareValues(a: string | number, b: string | number) {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }

  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function sortRows(rows: InventoryRow[], sortKey: SortKey, sortDir: SortDir) {
  return [...rows].sort((left, right) => {
    const result = compareValues(getSortValue(left, sortKey), getSortValue(right, sortKey))
    return sortDir === 'asc' ? result : -result
  })
}

function getNextSortDir(currentKey: SortKey, currentDir: SortDir, nextKey: SortKey): SortDir {
  if (currentKey !== nextKey) return nextKey === 'created_at' ? 'desc' : 'asc'
  return currentDir === 'asc' ? 'desc' : 'asc'
}

function getSortIndicator(currentKey: SortKey, currentSortDir: SortDir, key: SortKey) {
  if (currentKey !== key) return '↕'
  return currentSortDir === 'asc' ? '↑' : '↓'
}

function renderStatusPill(status: string | null) {
  if (status === 'available') {
    return <span className="app-badge app-badge-success">For Sale</span>
  }

  if (status === 'personal') {
    return <span className="app-badge app-badge-info">Personal</span>
  }

  if (status === 'junk') {
    return <span className="app-badge app-badge-neutral">Junk</span>
  }

  if (status === 'listed') {
    return <span className="app-badge app-badge-info">Listed</span>
  }

  if (status === 'sold') {
    return <span className="app-badge app-badge-warning">Sold</span>
  }

  if (status === 'giveaway') {
    return <span className="app-badge app-badge-warning">Giveaway</span>
  }

  return (
    <span className="text-xs capitalize text-zinc-400">
      {(status || '—').replaceAll('_', ' ')}
    </span>
  )
}

function bulkStatusLabel(status: BulkStatus) {
  if (status === 'available') return 'For Sale'
  if (status === 'listed') return 'Listed'
  if (status === 'personal') return 'Personal'
  if (status === 'junk') return 'Junk'
  return status
}

function buildInventoryHref({
  q,
  sort,
  dir,
  page,
  limit,
}: {
  q?: string
  sort: SortKey
  dir: SortDir
  page: number
  limit: number
}) {
  const params = new URLSearchParams()

  if (q) {
    params.set('q', q)
  }

  params.set('sort', sort)
  params.set('dir', dir)
  params.set('page', String(page))
  params.set('limit', String(limit))

  return `/app/inventory?${params.toString()}`
}

function buildInventoryStatusHref({
  q,
  sort,
  dir,
  page,
  limit,
  statusKey,
  statusValue,
  scrollY,
}: {
  q?: string
  sort: SortKey
  dir: SortDir
  page: number
  limit: number
  statusKey: string
  statusValue: string
  scrollY?: string
}) {
  const params = new URLSearchParams()

  if (q) {
    params.set('q', q)
  }

  params.set('sort', sort)
  params.set('dir', dir)
  params.set('page', String(page))
  params.set('limit', String(limit))
  params.set(statusKey, statusValue)

  if (scrollY) {
    params.set('scroll_y', scrollY)
  }

  return `/app/inventory?${params.toString()}#inventory-status`
}

function readFormIds(formData: FormData, fieldName: string) {
  return Array.from(
    new Set(
      formData
        .getAll(fieldName)
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    )
  )
}

function readInventoryListFormState(formData: FormData) {
  const q = String(formData.get('q') ?? '').trim()
  const sort = String(formData.get('sort') ?? 'created_at').trim() as SortKey
  const dir = String(formData.get('dir') ?? 'desc').trim() as SortDir
  const page = Number(String(formData.get('page') ?? '1'))
  const limit = Number(String(formData.get('limit') ?? String(DEFAULT_LIMIT)))
  const scrollY = String(formData.get('scroll_y') ?? '').trim()

  const safeSort: SortKey = [
    'created_at',
    'card',
    'status',
    'quantity',
    'available_quantity',
    'cost_basis_unit',
    'cost_basis_total',
    'estimated_value_total',
    'storage_location',
  ].includes(sort)
    ? sort
    : 'created_at'

  const safeDir: SortDir = dir === 'asc' ? 'asc' : 'desc'
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const safeLimit = LIMIT_OPTIONS.includes(limit as (typeof LIMIT_OPTIONS)[number])
    ? limit
    : DEFAULT_LIMIT

  return {
    q,
    safeSort,
    safeDir,
    safePage,
    safeLimit,
    scrollY,
  }
}

async function bulkDeleteInventoryItemsAction(formData: FormData) {
  'use server'

  const itemIds = readFormIds(formData, 'selected_inventory_ids')
  const { q, safeSort, safeDir, safePage, safeLimit, scrollY } = readInventoryListFormState(formData)

  if (itemIds.length === 0) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'delete_error',
        statusValue: 'Select at least one inventory item to delete.',
        scrollY,
      })
    )
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase
    .from('inventory_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .in('id', itemIds)

  if (error) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'delete_error',
        statusValue: error.message,
        scrollY,
      })
    )
  }

  revalidatePath('/app/inventory')
  revalidatePath('/app/search')
  revalidatePath('/app/breaks')

  redirect(
    buildInventoryStatusHref({
      q,
      sort: safeSort,
      dir: safeDir,
      page: safePage,
      limit: safeLimit,
      statusKey: 'deleted_count',
      statusValue: `${itemIds.length} inventory item(s)`,
      scrollY,
    })
  )
}

async function bulkUpdateInventoryStatusAction(formData: FormData) {
  'use server'

  const itemIds = readFormIds(formData, 'selected_inventory_ids')
  const requestedStatus = String(formData.get('bulk_status') ?? '').trim() as BulkStatus
  const { q, safeSort, safeDir, safePage, safeLimit, scrollY } = readInventoryListFormState(formData)

  const allowedStatuses: BulkStatus[] = ['available', 'listed', 'personal', 'junk']

  if (!allowedStatuses.includes(requestedStatus)) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: 'Choose a valid bulk status.',
        scrollY,
      })
    )
  }

  if (itemIds.length === 0) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: `Select at least one inventory item to mark ${bulkStatusLabel(requestedStatus)}.`,
        scrollY,
      })
    )
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase
    .from('inventory_items')
    .update({ status: requestedStatus })
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', itemIds)

  if (error) {
    redirect(
      buildInventoryStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'status_error',
        statusValue: error.message,
        scrollY,
      })
    )
  }

  revalidatePath('/app/inventory')
  revalidatePath('/app/search')
  revalidatePath('/app/breaks')
  revalidatePath('/app/reports/tax')

  redirect(
    buildInventoryStatusHref({
      q,
      sort: safeSort,
      dir: safeDir,
      page: safePage,
      limit: safeLimit,
      statusKey: 'status_updated',
      statusValue: `${itemIds.length} item(s) marked ${bulkStatusLabel(requestedStatus)}`,
      scrollY,
    })
  )
}

function getFilterHref(
  filter: '' | 'listed' | 'junk' | 'personal',
  sortKey: SortKey,
  sortDir: SortDir,
  limit: number
) {
  const params = new URLSearchParams()

  if (filter) {
    params.set('q', filter)
  }

  params.set('sort', sortKey)
  params.set('dir', sortDir)
  params.set('page', '1')
  params.set('limit', String(limit))

  const query = params.toString()
  return query ? `/app/inventory?${query}` : '/app/inventory'
}

function buildLimitHref({
  q,
  sort,
  dir,
  limit,
}: {
  q?: string
  sort: SortKey
  dir: SortDir
  limit: number
}) {
  const params = new URLSearchParams()

  if (q) {
    params.set('q', q)
  }

  params.set('sort', sort)
  params.set('dir', dir)
  params.set('page', '1')
  params.set('limit', String(limit))

  return `/app/inventory?${params.toString()}`
}

function SortHeader({
  label,
  sortKey,
  currentSortKey,
  currentSortDir,
  q,
  limit,
}: {
  label: string
  sortKey: SortKey
  currentSortKey: SortKey
  currentSortDir: SortDir
  q: string
  limit: number
}) {
  const params = new URLSearchParams()

  if (q) {
    params.set('q', q)
  }

  params.set('sort', sortKey)
  params.set('dir', getNextSortDir(currentSortKey, currentSortDir, sortKey))
  params.set('page', '1')
  params.set('limit', String(limit))

  return (
    <Link
      href={`/app/inventory?${params.toString()}`}
      className="inline-flex items-center gap-1 hover:text-zinc-100"
    >
      <span>{label}</span>
      <span className="text-[10px]">{getSortIndicator(currentSortKey, currentSortDir, sortKey)}</span>
    </Link>
  )
}

function SummaryCard({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="app-card-tight p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-base font-semibold leading-tight">{value}</div>
    </div>
  )
}

function BulkStatusConfirmControl({
  formId,
  status,
  label,
  helpText,
}: {
  formId: string
  status: BulkStatus
  label: string
  helpText: string
}) {
  return (
    <details className="group">
      <summary
        data-bulk-action-toggle="true"
        className="app-button cursor-pointer list-none whitespace-nowrap"
      >
        {label}
      </summary>

      <div className="mt-2 rounded-xl border border-zinc-700 bg-zinc-950 p-3 shadow-xl md:min-w-72">
        <div className="text-sm font-semibold text-zinc-200">Confirm status update?</div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">{helpText}</div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            form={formId}
            formAction={bulkUpdateInventoryStatusAction}
            data-bulk-submit="true"
            data-bulk-status={status}
            data-bulk-label={label}
            className="app-button-primary whitespace-nowrap"
          >
            Yes, {label}
          </button>

          <CancelDetailsButton />
        </div>
      </div>
    </details>
  )
}

function BulkDeleteConfirmControl({ formId }: { formId: string }) {
  return (
    <details className="group">
      <summary
        data-bulk-action-toggle="true"
        className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/30 text-red-200 hover:bg-red-900/40"
      >
        Delete Selected
      </summary>

      <div className="mt-2 rounded-xl border border-red-900/60 bg-zinc-950 p-3 shadow-xl md:min-w-72">
        <div className="text-sm font-semibold text-red-200">Confirm bulk delete?</div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">
          This will delete the selected inventory items. This cannot be undone from this screen.
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            form={formId}
            formAction={bulkDeleteInventoryItemsAction}
            data-bulk-submit="true"
            data-bulk-delete="true"
            data-bulk-label="Delete Selected"
            className="app-button whitespace-nowrap border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/50"
          >
            Yes, Delete Selected
          </button>

          <CancelDetailsButton />
        </div>
      </div>
    </details>
  )
}

function BulkActionsPanel({ formId, pageItemCount }: { formId: string; pageItemCount: number }) {
  return (
    <div className="fixed left-4 right-4 top-[5.5rem] z-50 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-3 shadow-2xl shadow-black/40 backdrop-blur md:left-[calc(220px+1rem)]">
      <div className="flex flex-col gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-200">Bulk actions</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            Check inventory rows, then update their status or delete the selected rows.
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div
              id={BULK_SELECTION_COUNT_ID}
              data-bulk-selected-count="true"
              data-bulk-page-count={pageItemCount}
              className="inline-flex w-fit rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-400"
            >
              0 of {pageItemCount} selected
            </div>
            <button
              type="button"
              data-bulk-select-page="true"
              className="app-button whitespace-nowrap px-2.5 py-1 text-xs"
            >
              Select all on page
            </button>
            <button
              type="button"
              data-bulk-clear-selection="true"
              className="app-button whitespace-nowrap px-2.5 py-1 text-xs"
            >
              Clear selection
            </button>
            <div
              id={BULK_PENDING_STATE_ID}
              data-bulk-pending-state="true"
              className="hidden w-fit rounded-full border border-sky-900/60 bg-sky-950/30 px-2.5 py-1 text-xs font-medium text-sky-200"
              aria-live="polite"
            >
              Updating selected items…
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <BulkStatusConfirmControl
            formId={formId}
            status="available"
            label="Mark For Sale"
            helpText="This will mark the selected inventory items as For Sale / Available."
          />
          <BulkStatusConfirmControl
            formId={formId}
            status="listed"
            label="Mark Listed"
            helpText="This will mark the selected inventory items as Listed."
          />
          <BulkStatusConfirmControl
            formId={formId}
            status="personal"
            label="Move to Personal"
            helpText="This will move the selected inventory items to Personal Collection status."
          />
          <BulkStatusConfirmControl
            formId={formId}
            status="junk"
            label="Mark Junk"
            helpText="This will mark the selected inventory items as Junk."
          />
          <BulkDeleteConfirmControl formId={formId} />
        </div>
      </div>
    </div>
  )
}

function BulkSelectionScript({ formId }: { formId: string }) {
  const script = `
    (() => {
      const formId = ${JSON.stringify('${FORM_ID_PLACEHOLDER}')};
      const fieldName = 'selected_inventory_ids';
      const storageKey = 'card_business_os_inventory_bulk_selection_v2';
      let isBulkSubmitting = false;

      const form = () => document.getElementById(formId);
      const countNodes = () => Array.from(document.querySelectorAll('[data-bulk-selected-count="true"]'));
      const pendingNodes = () => Array.from(document.querySelectorAll('[data-bulk-pending-state="true"]'));
      const rowCheckboxes = () => Array.from(document.querySelectorAll('input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"][data-inventory-bulk-row-checkbox="true"]'));
      const allSelectionCheckboxes = () => Array.from(document.querySelectorAll('input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"]'));
      const pageToggleCheckboxes = () => Array.from(document.querySelectorAll('input[type="checkbox"][data-bulk-page-checkbox="true"][form="' + formId + '"]'));
      const toggles = () => Array.from(document.querySelectorAll('[data-bulk-action-toggle="true"]'));
      const submitButtons = () => Array.from(document.querySelectorAll('[data-bulk-submit="true"]'));
      const selectPageButtons = () => Array.from(document.querySelectorAll('[data-bulk-select-page="true"]'));
      const clearButtons = () => Array.from(document.querySelectorAll('[data-bulk-clear-selection="true"]'));
      const scrollInputs = () => Array.from(document.querySelectorAll('input[name="scroll_y"][form="' + formId + '"], form#' + formId + ' input[name="scroll_y"]'));
      const statusInputs = () => Array.from(document.querySelectorAll('input[name="bulk_status"][form="' + formId + '"], form#' + formId + ' input[name="bulk_status"]'));

      function loadStoredSelection() {
        try {
          const raw = window.sessionStorage.getItem(storageKey);
          const parsed = raw ? JSON.parse(raw) : [];
          if (!Array.isArray(parsed)) return new Set();
          return new Set(parsed.map((value) => String(value || '').trim()).filter(Boolean));
        } catch (_error) {
          return new Set();
        }
      }

      function saveStoredSelection(selection) {
        try {
          window.sessionStorage.setItem(storageKey, JSON.stringify(Array.from(selection)));
        } catch (_error) {}
      }

      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('deleted_count') || urlParams.has('status_updated')) {
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch (_error) {}
      }

      let selectedIdsSet = loadStoredSelection();

      function setDisabled(node, disabled) {
        node.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        node.classList.toggle('pointer-events-none', disabled);
        node.classList.toggle('opacity-50', disabled);
        if ('disabled' in node) node.disabled = disabled;
      }

      function pageIds() {
        return rowCheckboxes().map((checkbox) => checkbox.value).filter(Boolean);
      }

      function selectedCount() {
        return selectedIdsSet.size;
      }

      function selectedIds() {
        return Array.from(selectedIdsSet);
      }

      function syncStoredInputs() {
        const bulkForm = form();
        if (!bulkForm) return;

        bulkForm.querySelectorAll('input[data-bulk-persisted-selection="true"]').forEach((input) => input.remove());

        selectedIds().forEach((id) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = fieldName;
          input.value = id;
          input.setAttribute('data-bulk-persisted-selection', 'true');
          bulkForm.appendChild(input);
        });
      }

      function syncPageCheckboxesFromStoredSelection() {
        rowCheckboxes().forEach((checkbox) => {
          checkbox.checked = selectedIdsSet.has(checkbox.value);
        });
      }

      function syncStoredSelectionFromPageCheckbox(checkbox) {
        const id = String(checkbox.value || '').trim();
        if (!id) return;
        if (checkbox.checked) {
          selectedIdsSet.add(id);
        } else {
          selectedIdsSet.delete(id);
        }
        saveStoredSelection(selectedIdsSet);
        syncStoredInputs();
      }

      function updateBulkState() {
        syncPageCheckboxesFromStoredSelection();
        syncStoredInputs();

        const currentPageIds = pageIds();
        const totalOnPage = currentPageIds.length;
        const selectedOnPage = currentPageIds.filter((id) => selectedIdsSet.has(id)).length;
        const count = selectedCount();
        const hasSelection = count > 0;
        const allPageSelected = totalOnPage > 0 && selectedOnPage === totalOnPage;

        countNodes().forEach((node) => {
          node.textContent = count + ' selected' + (totalOnPage > 0 ? ' • ' + selectedOnPage + ' of ' + totalOnPage + ' on this page' : '');
          node.classList.toggle('text-zinc-400', !hasSelection);
          node.classList.toggle('text-zinc-100', hasSelection);
          node.classList.toggle('border-zinc-800', !hasSelection);
          node.classList.toggle('border-emerald-900/60', hasSelection);
          node.classList.toggle('bg-zinc-950', !hasSelection);
          node.classList.toggle('bg-emerald-950/20', hasSelection);
        });

        rowCheckboxes().forEach((checkbox) => {
          const row = checkbox.closest('[data-inventory-row-id]');
          if (row) {
            row.classList.toggle('bg-zinc-900/40', selectedIdsSet.has(checkbox.value) && !isBulkSubmitting);
          }
        });

        pageToggleCheckboxes().forEach((checkbox) => {
          checkbox.checked = allPageSelected;
          checkbox.indeterminate = selectedOnPage > 0 && !allPageSelected;
          checkbox.setAttribute('aria-checked', checkbox.indeterminate ? 'mixed' : String(allPageSelected));
          setDisabled(checkbox, totalOnPage === 0 || isBulkSubmitting);
        });

        toggles().forEach((node) => setDisabled(node, !hasSelection || isBulkSubmitting));
        submitButtons().forEach((node) => setDisabled(node, !hasSelection || isBulkSubmitting));
        selectPageButtons().forEach((node) => {
          setDisabled(node, totalOnPage === 0 || allPageSelected || isBulkSubmitting);
          node.textContent = allPageSelected ? 'All rows on this page selected' : 'Select all on page';
        });
        clearButtons().forEach((node) => setDisabled(node, !hasSelection || isBulkSubmitting));
      }

      function rememberScrollPosition() {
        scrollInputs().forEach((input) => {
          input.value = String(Math.max(0, Math.round(window.scrollY || 0)));
        });
      }

      function setBulkStatus(value) {
        statusInputs().forEach((input) => {
          input.value = value || '';
        });
      }

      function statusLabel(status) {
        if (status === 'available') return 'For Sale';
        if (status === 'listed') return 'Listed';
        if (status === 'personal') return 'Personal';
        if (status === 'junk') return 'Junk';
        return 'Updated';
      }

      function statusPillClasses(status) {
        if (status === 'personal') return 'app-badge app-badge-info';
        if (status === 'junk') return 'app-badge app-badge-danger';
        if (status === 'listed') return 'app-badge app-badge-warning';
        return 'app-badge app-badge-success';
      }

      function closeOpenConfirmations() {
        document.querySelectorAll('details[open]').forEach((details) => {
          details.removeAttribute('open');
        });
      }

      function showPendingMessage(message) {
        pendingNodes().forEach((node) => {
          node.textContent = message;
          node.classList.remove('hidden');
        });
      }

      function applyInstantRowState({ ids, status, isDelete }) {
        ids.forEach((id) => {
          const row = document.querySelector('[data-inventory-row-id="' + CSS.escape(id) + '"]');
          if (!row) return;

          row.classList.add('transition', 'duration-150');

          if (isDelete) {
            row.classList.add('opacity-40');
            row.style.filter = 'grayscale(1)';
            row.querySelectorAll('a, button, input').forEach((node) => setDisabled(node, true));
            const titleNode = row.querySelector('[data-inventory-primary-title="true"]');
            if (titleNode && !titleNode.querySelector('[data-bulk-row-pending="true"]')) {
              const badge = document.createElement('span');
              badge.setAttribute('data-bulk-row-pending', 'true');
              badge.className = 'ml-2 inline-flex rounded-full border border-red-900/60 bg-red-950/30 px-2 py-0.5 text-[11px] font-medium text-red-200';
              badge.textContent = 'Deleting…';
              titleNode.appendChild(badge);
            }
            return;
          }

          row.classList.add('bg-emerald-950/10');
          const statusCell = row.querySelector('[data-inventory-status-cell="true"]');
          if (statusCell) {
            statusCell.innerHTML = '';
            const badge = document.createElement('span');
            badge.className = statusPillClasses(status);
            badge.textContent = statusLabel(status);
            statusCell.appendChild(badge);
          }
        });
      }

      function setSubmitting(button) {
        isBulkSubmitting = true;
        const count = selectedCount();
        const ids = selectedIds();
        const status = button.getAttribute('data-bulk-status') || '';
        const isDelete = button.getAttribute('data-bulk-delete') === 'true';
        const label = button.getAttribute('data-bulk-label') || (isDelete ? 'Delete Selected' : 'Update Selected');

        button.setAttribute('data-original-label', button.textContent || label);
        button.textContent = isDelete ? 'Deleting…' : 'Updating…';
        showPendingMessage(isDelete ? 'Deleting ' + count + ' selected item(s)…' : 'Updating ' + count + ' selected item(s)…');
        closeOpenConfirmations();
        applyInstantRowState({ ids, status, isDelete });

        // Do not disable the clicked submit button during the same click event.
        // In React/Next formAction flows, disabling it immediately can prevent
        // the browser from completing the submit, which makes the UI look stuck.
        window.setTimeout(() => updateBulkState(), 0);
      }

      document.addEventListener('change', (event) => {
        const target = event.target;

        if (target && target.matches && target.matches('input[type="checkbox"][data-bulk-page-checkbox="true"][form="' + formId + '"]')) {
          const shouldSelectPage = Boolean(target.checked);
          pageIds().forEach((id) => {
            if (shouldSelectPage) selectedIdsSet.add(id);
            else selectedIdsSet.delete(id);
          });
          saveStoredSelection(selectedIdsSet);
          syncStoredInputs();
          updateBulkState();
          return;
        }

        if (target && target.matches && target.matches('input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"][data-inventory-bulk-row-checkbox="true"]')) {
          syncStoredSelectionFromPageCheckbox(target);
          updateBulkState();
          return;
        }
      }, true);

      document.addEventListener('click', (event) => {
        const toggle = event.target && event.target.closest ? event.target.closest('[data-bulk-action-toggle="true"]') : null;
        if (toggle && (selectedCount() === 0 || isBulkSubmitting)) {
          event.preventDefault();
          updateBulkState();
          return;
        }

        const selectPageButton = event.target && event.target.closest ? event.target.closest('[data-bulk-select-page="true"]') : null;
        if (selectPageButton) {
          event.preventDefault();
          event.stopPropagation();
          if (isBulkSubmitting) return;
          pageIds().forEach((id) => selectedIdsSet.add(id));
          saveStoredSelection(selectedIdsSet);
          updateBulkState();
          return;
        }

        const clearButton = event.target && event.target.closest ? event.target.closest('[data-bulk-clear-selection="true"]') : null;
        if (clearButton) {
          event.preventDefault();
          event.stopPropagation();
          if (isBulkSubmitting) return;
          selectedIdsSet = new Set();
          saveStoredSelection(selectedIdsSet);
          allSelectionCheckboxes().forEach((checkbox) => {
            checkbox.checked = false;
            checkbox.indeterminate = false;
          });
          syncStoredInputs();
          updateBulkState();
          return;
        }

        const submitButton = event.target && event.target.closest ? event.target.closest('[data-bulk-submit="true"]') : null;
        if (submitButton) {
          if (selectedCount() === 0 || isBulkSubmitting) {
            event.preventDefault();
            updateBulkState();
            return;
          }
          syncStoredInputs();
          setBulkStatus(submitButton.getAttribute('data-bulk-status') || '');
          rememberScrollPosition();
          setSubmitting(submitButton);
        }
      }, true);

      document.addEventListener('submit', (event) => {
        if (event.target && event.target.id === formId) {
          syncStoredInputs();
          rememberScrollPosition();
        }
      });

      syncPageCheckboxesFromStoredSelection();
      syncStoredInputs();
      updateBulkState();
    })();
  `.replace('${FORM_ID_PLACEHOLDER}', formId)

  return <Script id="bulk-selection-script" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: script }} />
}

function ScrollRestoreScript({ scrollY }: { scrollY: string }) {
  const numericScrollY = Number(scrollY)

  if (!Number.isFinite(numericScrollY) || numericScrollY < 1) {
    return null
  }

  const script = `
    (() => {
      const y = ${Math.round(numericScrollY)};
      requestAnimationFrame(() => window.scrollTo({ top: y, left: 0, behavior: 'auto' }));
    })();
  `

  return <Script id={BULK_SCROLL_RESTORE_ID} strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: script }} />
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string
    sort?: string
    dir?: string
    saved?: string
    page?: string
    limit?: string
    deleted_count?: string
    delete_error?: string
    status_updated?: string
    status_error?: string
    scroll_y?: string
  }>
}) {
  const params = searchParams ? await searchParams : undefined
  const qRaw = String(params?.q ?? '')
  const q = cleanSearchTerm(qRaw)
  const qNormalized = q.toLowerCase()
  const saved = String(params?.saved ?? '')
  const deletedCount = String(params?.deleted_count ?? '').trim()
  const deleteError = String(params?.delete_error ?? '').trim()
  const statusUpdated = String(params?.status_updated ?? '').trim()
  const statusError = String(params?.status_error ?? '').trim()
  const scrollY = String(params?.scroll_y ?? '').trim()
  const requestedPage = Number(String(params?.page ?? '1'))
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1

  const requestedLimit = Number(String(params?.limit ?? String(DEFAULT_LIMIT)))
  const limit = LIMIT_OPTIONS.includes(requestedLimit as (typeof LIMIT_OPTIONS)[number])
    ? requestedLimit
    : DEFAULT_LIMIT

  const requestedSort = String(params?.sort ?? 'created_at').trim() as SortKey
  const requestedDir = String(params?.dir ?? 'desc').trim() as SortDir

  const sortKey: SortKey = [
    'created_at',
    'card',
    'status',
    'quantity',
    'available_quantity',
    'cost_basis_unit',
    'cost_basis_total',
    'estimated_value_total',
    'storage_location',
  ].includes(requestedSort)
    ? requestedSort
    : 'created_at'

  const sortDir: SortDir = requestedDir === 'asc' ? 'asc' : 'desc'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  let query = supabase
    .from('inventory_items')
    .select(`
      id,
      status,
      item_type,
      title,
      player_name,
      year,
      brand,
      set_name,
      card_number,
      parallel_name,
      team,
      quantity,
      available_quantity,
      cost_basis_unit,
      cost_basis_total,
      estimated_value_total,
      storage_location,
      notes,
      created_at
    `)
    .eq('user_id', user.id)
    .is('deleted_at', null)

  if (qNormalized !== 'junk') {
    query = query.neq('status', 'junk')
  }

  if (qNormalized === 'listed') {
    query = query.eq('status', 'listed')
  } else if (qNormalized === 'junk') {
    query = query.eq('status', 'junk')
  } else if (qNormalized === 'personal') {
    query = query.eq('status', 'personal')
  } else if (q) {
    query = query.or(
      [
        `title.ilike.%${q}%`,
        `player_name.ilike.%${q}%`,
        `brand.ilike.%${q}%`,
        `set_name.ilike.%${q}%`,
        `card_number.ilike.%${q}%`,
        `parallel_name.ilike.%${q}%`,
        `team.ilike.%${q}%`,
        `notes.ilike.%${q}%`,
        `storage_location.ilike.%${q}%`,
      ].join(',')
    )
  }

  const dbSortKey = sortKey === 'card' ? 'created_at' : sortKey

  const from = (page - 1) * limit
  const to = from + limit - 1

  const response = await query
    .order(dbSortKey, { ascending: sortDir === 'asc' })
    .range(from, to)

  const rawItems = (response.data ?? []) as InventoryRow[]
  const items = sortKey === 'card' ? sortRows(rawItems, sortKey, sortDir) : rawItems
  const error = response.error

  const soldOutItemIds = items
    .filter((item) => Number(item.available_quantity ?? 0) <= 0)
    .map((item) => item.id)

  const latestActiveSaleByItemId = new Map<string, SaleRow>()

  if (soldOutItemIds.length > 0) {
    const salesResponse = await supabase
      .from('sales')
      .select(`
        id,
        inventory_item_id,
        sale_date,
        quantity_sold,
        reversed_at
      `)
      .eq('user_id', user.id)
      .in('inventory_item_id', soldOutItemIds)
      .order('sale_date', { ascending: false })

    const salesRows = (salesResponse.data ?? []) as SaleRow[]

    for (const sale of salesRows) {
      if (sale.reversed_at) continue
      if (latestActiveSaleByItemId.has(sale.inventory_item_id)) continue
      latestActiveSaleByItemId.set(sale.inventory_item_id, sale)
    }
  }

  const pageDescription =
    qNormalized === 'listed'
      ? 'Showing listed inventory items.'
      : qNormalized === 'junk'
        ? 'Showing junk items you are not planning to sell.'
        : qNormalized === 'personal'
          ? 'Showing personal collection items.'
          : 'View and manage your inventory items.'

  const showingSearchText =
    q && qNormalized !== 'listed' && qNormalized !== 'junk' && qNormalized !== 'personal'
      ? `Showing results for "${q}"`
      : qNormalized === 'listed'
        ? 'Showing listed inventory.'
        : qNormalized === 'junk'
          ? 'Showing junk inventory.'
          : qNormalized === 'personal'
            ? 'Showing personal inventory.'
            : ''

  const totalItems = items.length
  const totalAvailableUnits = items.reduce(
    (sum, item) => sum + Number(item.available_quantity ?? 0),
    0
  )
  const totalCost = items.reduce((sum, item) => sum + Number(item.cost_basis_total ?? 0), 0)
  const totalEstimatedValue = items.reduce(
    (sum, item) => sum + Number(item.estimated_value_total ?? 0),
    0
  )

  const hasPreviousPage = page > 1
  const hasNextPage = items.length === limit

  return (
    <div className="app-page-wide space-y-3">
      <div className="app-page-header gap-3">
        <div className="min-w-0">
          <h1 className="app-title">Inventory</h1>
          <p className="app-subtitle">{pageDescription}</p>
        </div>

        <Link href="/app/inventory/new" className="app-button-primary">
          Add Inventory
        </Link>
      </div>

      <div id="inventory-status" className="scroll-mt-28 space-y-3">
        {saved === '1' ? (
          <div className="app-alert-success">
            Quick sale recorded, inventory updated, and tax tracking kept in sync.
          </div>
        ) : null}

        {deletedCount ? (
          <div className="app-alert-success">
            Deleted {deletedCount} successfully.
          </div>
        ) : null}

        {statusUpdated ? (
          <div className="app-alert-success">
            Updated {statusUpdated} successfully.
          </div>
        ) : null}

        {deleteError ? (
          <div className="app-alert-error">
            Delete failed: {deleteError}
          </div>
        ) : null}

        {statusError ? (
          <div className="app-alert-error">
            Status update failed: {statusError}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Rows On This Page" value={totalItems} />
        <SummaryCard label="Available Units" value={totalAvailableUnits} />
        <SummaryCard label="Total Cost" value={money(totalCost)} />
        <SummaryCard label="Est. Value" value={money(totalEstimatedValue)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={getFilterHref('', sortKey, sortDir, limit)}
          className={`app-chip ${q === '' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          All
        </Link>
        <Link
          href={getFilterHref('listed', sortKey, sortDir, limit)}
          className={`app-chip ${qNormalized === 'listed' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Listed
        </Link>
        <Link
          href={getFilterHref('personal', sortKey, sortDir, limit)}
          className={`app-chip ${qNormalized === 'personal' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Personal
        </Link>
        <Link
          href={getFilterHref('junk', sortKey, sortDir, limit)}
          className={`app-chip ${qNormalized === 'junk' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Junk
        </Link>
      </div>

      <div className="app-section p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            {showingSearchText ? (
              <div className="text-xs text-zinc-400">{showingSearchText}</div>
            ) : (
              <div className="text-xs text-zinc-500">
                Use the global search bar at the top for new searches.
              </div>
            )}
            <div className="mt-1 text-xs text-zinc-500">Page {page}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            {LIMIT_OPTIONS.map((option) => (
              <Link
                key={option}
                href={buildLimitHref({
                  q,
                  sort: sortKey,
                  dir: sortDir,
                  limit: option,
                })}
                className={`app-chip ${limit === option ? 'app-chip-active' : 'app-chip-idle'}`}
              >
                {option} rows
              </Link>
            ))}
          </div>
        </div>
      </div>

      {error ? <div className="app-alert-error">Error loading inventory: {error.message}</div> : null}

      <div className="app-section">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Inventory</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              One row per item. Open details when you need the full record.
            </p>
          </div>

          <div className="text-xs text-zinc-500">{items.length} shown</div>
        </div>

        <form id={BULK_INVENTORY_FORM_ID} className="hidden">
          <input type="hidden" name="q" value={q} />
          <input type="hidden" name="sort" value={sortKey} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="limit" value={limit} />
          <input type="hidden" name="scroll_y" value="" />
          <input type="hidden" name="bulk_status" value="" />
        </form>

        <BulkSelectionScript formId={BULK_INVENTORY_FORM_ID} />
        <ScrollRestoreScript scrollY={scrollY} />

        {items.length > 0 ? (
          <>
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-500">
              Bulk actions are pinned near the top of the screen while you work through inventory rows.
            </div>
            <BulkActionsPanel formId={BULK_INVENTORY_FORM_ID} pageItemCount={items.length} />
          </>
        ) : null}

        <div className="mt-4 app-table-wrap pb-40">
          <div className="app-table-scroll">
            <table className="app-table">
              <thead className="app-thead">
                <tr>
                  <th className="app-th w-16">
                    <input
                      form={BULK_INVENTORY_FORM_ID}
                      type="checkbox"
                      data-bulk-page-checkbox="true"
                      aria-label="Select all inventory items on this page"
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                    />
                  </th>
                  <th className="app-th min-w-[260px]">
                    <SortHeader
                      label="Item"
                      sortKey="card"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Status"
                      sortKey="status"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Qty"
                      sortKey="quantity"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Available"
                      sortKey="available_quantity"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Unit Cost"
                      sortKey="cost_basis_unit"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Total Cost"
                      sortKey="cost_basis_total"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Est. Value"
                      sortKey="estimated_value_total"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Location"
                      sortKey="storage_location"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      q={q}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th min-w-[230px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const itemLine = getCardDisplay(item)
                  const quantity = Number(item.quantity ?? 0)
                  const available = Number(item.available_quantity ?? 0)
                  const hasAvailable = available > 0
                  const isLotLike = quantity > 1 || available > 1
                  const latestActiveSale = latestActiveSaleByItemId.get(item.id) ?? null
                  const itemName = `${getPrimaryTitle(item)}${itemLine ? ` • ${itemLine}` : ''}`

                  return (
                    <tr key={item.id} data-inventory-row-id={item.id} className="app-tr align-top">
                      <td className="app-td">
                        <input
                          form={BULK_INVENTORY_FORM_ID}
                          type="checkbox"
                          name="selected_inventory_ids"
                          value={item.id}
                          data-inventory-bulk-row-checkbox="true"
                          aria-label={`Select ${itemName}`}
                          className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                        />
                      </td>

                      <td className="app-td">
                        <div className="min-w-[240px] max-w-[520px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <div
                              data-inventory-primary-title="true"
                              className="break-words font-medium leading-tight"
                            >
                              {getPrimaryTitle(item)}
                            </div>
                            {isLotLike ? (
                              <span className="app-badge app-badge-warning shrink-0">Lot / Multi Qty</span>
                            ) : null}
                          </div>
                          <div
                            className="mt-0.5 break-words text-xs text-zinc-400"
                            title={itemLine || getPrimaryTitle(item)}
                          >
                            {itemLine || '—'}
                          </div>
                        </div>
                      </td>

                      <td data-inventory-status-cell="true" className="app-td whitespace-nowrap">{renderStatusPill(item.status)}</td>
                      <td className="app-td whitespace-nowrap">{item.quantity ?? 0}</td>

                      <td className="app-td whitespace-nowrap">
                        <div className="font-medium leading-tight">{item.available_quantity ?? 0}</div>
                        {hasAvailable && isLotLike ? (
                          <div className="mt-0.5 text-[11px] text-zinc-500">partial sell ready</div>
                        ) : null}
                      </td>

                      <td className="app-td whitespace-nowrap">{money(item.cost_basis_unit)}</td>
                      <td className="app-td whitespace-nowrap">{money(item.cost_basis_total)}</td>
                      <td className="app-td whitespace-nowrap">{money(item.estimated_value_total)}</td>

                      <td className="app-td">
                        <div className="max-w-28 break-words" title={item.storage_location || '—'}>
                          {item.storage_location || '—'}
                        </div>
                      </td>

                      <td className="app-td">
                        <div className="flex flex-wrap items-center gap-1">
                          <Link href={`/app/inventory/${item.id}`} className="app-button">
                            Details
                          </Link>

                          <Link href={`/app/inventory/${item.id}/edit`} className="app-button">
                            Edit
                          </Link>

                          {hasAvailable ? (
                            <>
                              <Link href={`/app/inventory/${item.id}/sell`} className="app-button-primary">
                                Sell
                              </Link>
                              {isLotLike ? (
                                <Link href={`/app/inventory/${item.id}/sell`} className="app-button">
                                  Sell Qty
                                </Link>
                              ) : null}
                            </>
                          ) : latestActiveSale ? (
                            <form action={reverseSaleAction} className="inline-flex">
                              <input type="hidden" name="sale_id" value={latestActiveSale.id} />
                              <input type="hidden" name="inventory_item_id" value={item.id} />
                              <input
                                type="hidden"
                                name="reversal_reason"
                                value="Quick reverse from inventory list"
                              />
                              <button type="submit" className="app-button-danger">
                                Reverse Sale
                              </button>
                            </form>
                          ) : null}

                          <DeleteInventoryItemButton itemId={item.id} itemName={itemName} />
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {items.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-zinc-400">
                      {q ? 'No inventory items match your search.' : 'No inventory items found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="app-section p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-zinc-300">
            Showing page {page} with up to {limit} rows.
          </div>

          <div className="flex gap-2">
            {hasPreviousPage ? (
              <Link
                href={buildInventoryHref({
                  q,
                  sort: sortKey,
                  dir: sortDir,
                  page: page - 1,
                  limit,
                })}
                className="app-button"
              >
                Previous
              </Link>
            ) : (
              <span className="app-button pointer-events-none opacity-50">Previous</span>
            )}

            {hasNextPage ? (
              <Link
                href={buildInventoryHref({
                  q,
                  sort: sortKey,
                  dir: sortDir,
                  page: page + 1,
                  limit,
                })}
                className="app-button-primary"
              >
                Next
              </Link>
            ) : (
              <span className="app-button-primary pointer-events-none opacity-50">Next</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}