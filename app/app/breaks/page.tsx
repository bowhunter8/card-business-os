import Link from 'next/link'
import Script from 'next/script'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CancelDetailsButton from '../search/CancelDetailsButton'

type BreakRow = {
  id: string
  break_date: string
  source_name: string | null
  order_number: string | null
  product_name: string | null
  format_type: string | null
  teams: string[] | null
  total_cost: number | null
  allocation_method: string | null
  notes?: string | null
  reversed_at?: string | null
  cards_received?: number | null
}

type BreakInventoryRow = {
  source_break_id: string | null
  quantity: number | null
}

type BreakViewRow = BreakRow & {
  received: number
  entered: number
  remaining: number
  completionStatus: 'Open' | 'In Progress' | 'Complete' | 'Reversed'
}

type SortKey =
  | 'break_date'
  | 'product_name'
  | 'source_name'
  | 'order_number'
  | 'completionStatus'
  | 'entered'
  | 'received'
  | 'remaining'
  | 'total_cost'

type SortDir = 'asc' | 'desc'
type PageLimit = 10 | 25 | 100

const DEFAULT_LIMIT: PageLimit = 10
const LIMIT_OPTIONS: PageLimit[] = [10, 25, 100]
const BULK_BREAKS_FORM_ID = 'bulk-delete-breaks-page-form'
const BULK_SELECTION_COUNT_ID = 'breaks-bulk-selection-count'
const BULK_PENDING_STATE_ID = 'breaks-bulk-pending-state'

function money(value: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0))
}

function cleanText(value: string | null | undefined) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  }).format(parsed)
}

function getCompletionStatus(
  received: number,
  entered: number,
  reversedAt?: string | null
): 'Open' | 'In Progress' | 'Complete' | 'Reversed' {
  if (reversedAt) return 'Reversed'
  if (received <= 0) return 'Open'
  if (entered <= 0) return 'Open'
  if (entered < received) return 'In Progress'
  return 'Complete'
}

function getSortValue(item: BreakViewRow, key: SortKey) {
  switch (key) {
    case 'break_date':
      return item.break_date || ''
    case 'product_name':
      return item.product_name || ''
    case 'source_name':
      return item.source_name || ''
    case 'order_number':
      return item.order_number || ''
    case 'completionStatus':
      return item.completionStatus || ''
    case 'entered':
      return item.entered
    case 'received':
      return item.received
    case 'remaining':
      return item.remaining
    case 'total_cost':
      return Number(item.total_cost ?? 0)
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

function sortRows(rows: BreakViewRow[], sortKey: SortKey, sortDir: SortDir) {
  return [...rows].sort((left, right) => {
    const result = compareValues(getSortValue(left, sortKey), getSortValue(right, sortKey))
    return sortDir === 'asc' ? result : -result
  })
}

function getNextSortDir(currentKey: SortKey, currentDir: SortDir, nextKey: SortKey): SortDir {
  if (currentKey !== nextKey) return nextKey === 'break_date' ? 'desc' : 'asc'
  return currentDir === 'asc' ? 'desc' : 'asc'
}

function getSortIndicator(currentKey: SortKey, currentDir: SortDir, key: SortKey) {
  if (currentKey !== key) return '↕'
  return currentDir === 'asc' ? '↑' : '↓'
}

function buildBreaksHref({
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

  if (q) params.set('q', q)
  params.set('sort', sort)
  params.set('dir', dir)
  params.set('page', String(page))
  params.set('limit', String(limit))

  return `/app/breaks?${params.toString()}`
}

function buildBreaksStatusHref({
  q,
  sort,
  dir,
  page,
  limit,
  statusKey,
  statusValue,
}: {
  q?: string
  sort: SortKey
  dir: SortDir
  page: number
  limit: number
  statusKey: string
  statusValue: string
}) {
  const params = new URLSearchParams()

  if (q) params.set('q', q)
  params.set('sort', sort)
  params.set('dir', dir)
  params.set('page', String(page))
  params.set('limit', String(limit))
  params.set(statusKey, statusValue)

  return `/app/breaks?${params.toString()}#breaks-status`
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

  if (q) params.set('q', q)
  params.set('sort', sort)
  params.set('dir', dir)
  params.set('page', '1')
  params.set('limit', String(limit))

  return `/app/breaks?${params.toString()}`
}

function getFilterHref(
  filter: '' | 'active' | 'open',
  sortKey: SortKey,
  sortDir: SortDir,
  limit: number
) {
  const params = new URLSearchParams()

  if (filter) params.set('q', filter)
  params.set('sort', sortKey)
  params.set('dir', sortDir)
  params.set('page', '1')
  params.set('limit', String(limit))

  const query = params.toString()
  return query ? `/app/breaks?${query}` : '/app/breaks'
}

function readFormIds(formData: FormData, fieldName: string) {
  return formData
    .getAll(fieldName)
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
}

function readBreakListFormState(formData: FormData) {
  const q = String(formData.get('q') ?? '').trim()
  const sort = String(formData.get('sort') ?? 'break_date').trim() as SortKey
  const dir = String(formData.get('dir') ?? 'desc').trim() as SortDir
  const page = Number(String(formData.get('page') ?? '1'))
  const limit = Number(String(formData.get('limit') ?? String(DEFAULT_LIMIT)))

  const safeSort: SortKey = [
    'break_date',
    'product_name',
    'source_name',
    'order_number',
    'completionStatus',
    'entered',
    'received',
    'remaining',
    'total_cost',
  ].includes(sort)
    ? sort
    : 'break_date'

  const safeDir: SortDir = dir === 'asc' ? 'asc' : 'desc'
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const safeLimit: PageLimit = LIMIT_OPTIONS.includes(limit as PageLimit)
    ? (limit as PageLimit)
    : DEFAULT_LIMIT

  return {
    q,
    safeSort,
    safeDir,
    safePage,
    safeLimit,
  }
}

async function deleteBreakAction(formData: FormData) {
  'use server'

  const breakId = String(formData.get('break_id') ?? '').trim()
  const { q, safeSort, safeDir, safePage, safeLimit } = readBreakListFormState(formData)

  if (!breakId) {
    redirect(
      buildBreaksStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'delete_error',
        statusValue: 'Missing break ID.',
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
    .from('breaks')
    .delete()
    .eq('user_id', user.id)
    .eq('id', breakId)

  if (error) {
    redirect(
      buildBreaksStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'delete_error',
        statusValue: error.message,
      })
    )
  }

  revalidatePath('/app/breaks')
  revalidatePath('/app/search')
  revalidatePath('/app/inventory')
  revalidatePath('/app/whatnot-orders')

  redirect(
    buildBreaksStatusHref({
      q,
      sort: safeSort,
      dir: safeDir,
      page: safePage,
      limit: safeLimit,
      statusKey: 'deleted_count',
      statusValue: '1 break',
    })
  )
}

async function bulkDeleteBreaksAction(formData: FormData) {
  'use server'

  const breakIds = readFormIds(formData, 'selected_break_ids')
  const { q, safeSort, safeDir, safePage, safeLimit } = readBreakListFormState(formData)

  if (breakIds.length === 0) {
    redirect(
      buildBreaksStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'delete_error',
        statusValue: 'Select at least one break to delete.',
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
    .from('breaks')
    .delete()
    .eq('user_id', user.id)
    .in('id', breakIds)

  if (error) {
    redirect(
      buildBreaksStatusHref({
        q,
        sort: safeSort,
        dir: safeDir,
        page: safePage,
        limit: safeLimit,
        statusKey: 'delete_error',
        statusValue: error.message,
      })
    )
  }

  revalidatePath('/app/breaks')
  revalidatePath('/app/search')
  revalidatePath('/app/inventory')
  revalidatePath('/app/whatnot-orders')

  redirect(
    buildBreaksStatusHref({
      q,
      sort: safeSort,
      dir: safeDir,
      page: safePage,
      limit: safeLimit,
      statusKey: 'deleted_count',
      statusValue: `${breakIds.length} break(s)`,
    })
  )
}

function SortHeader({
  label,
  sortKey,
  currentSortKey,
  currentSortDir,
  qRaw,
  limit,
}: {
  label: string
  sortKey: SortKey
  currentSortKey: SortKey
  currentSortDir: SortDir
  qRaw: string
  limit: number
}) {
  const params = new URLSearchParams()

  if (qRaw) params.set('q', qRaw)
  params.set('sort', sortKey)
  params.set('dir', getNextSortDir(currentSortKey, currentSortDir, sortKey))
  params.set('page', '1')
  params.set('limit', String(limit))

  return (
    <Link
      href={`/app/breaks?${params.toString()}`}
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

function BulkDeleteConfirmControl({ formId, pageBreakCount }: { formId: string; pageBreakCount: number }) {
  return (
    <div className="sticky top-[4.75rem] z-40 mb-3 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-2.5 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex flex-col gap-2">
        <div>
          <div className="text-sm font-semibold text-zinc-200">Bulk actions</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            Check break rows, then delete the selected breaks.
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <div
              id={BULK_SELECTION_COUNT_ID}
              data-bulk-selected-count="true"
              data-bulk-page-count={pageBreakCount}
              className="inline-flex w-fit rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-400"
            >
              0 of {pageBreakCount} selected
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
              Deleting selected breaks…
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
                This will delete the selected breaks. This cannot be undone from this screen.
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  form={formId}
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
        </div>
      </div>
    </div>
  )
}

function BulkSelectionScript({ formId }: { formId: string }) {
  const script = `
    (() => {
      const formId = ${JSON.stringify('${FORM_ID_PLACEHOLDER}')};
      const fieldName = 'selected_break_ids';
      const storageKey = 'card_business_os_breaks_bulk_selection_v1';
      let isBulkSubmitting = false;

      const form = () => document.getElementById(formId);
      const countNodes = () => Array.from(document.querySelectorAll('[data-bulk-selected-count="true"]'));
      const pendingNodes = () => Array.from(document.querySelectorAll('[data-bulk-pending-state="true"]'));
      const rowCheckboxes = () => Array.from(document.querySelectorAll('input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"][data-break-bulk-row-checkbox="true"]'));
      const allSelectionCheckboxes = () => Array.from(document.querySelectorAll('input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"]'));
      const pageToggleCheckboxes = () => Array.from(document.querySelectorAll('input[type="checkbox"][data-bulk-page-checkbox="true"][form="' + formId + '"]'));
      const toggles = () => Array.from(document.querySelectorAll('[data-bulk-action-toggle="true"]'));
      const submitButtons = () => Array.from(document.querySelectorAll('[data-bulk-submit="true"]'));
      const selectPageButtons = () => Array.from(document.querySelectorAll('[data-bulk-select-page="true"]'));
      const clearButtons = () => Array.from(document.querySelectorAll('[data-bulk-clear-selection="true"]'));

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
      if (urlParams.has('deleted_count')) {
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
        if (checkbox.checked) selectedIdsSet.add(id);
        else selectedIdsSet.delete(id);
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
          const row = checkbox.closest('[data-break-row-id]');
          if (row) row.classList.toggle('bg-zinc-900/40', selectedIdsSet.has(checkbox.value) && !isBulkSubmitting);
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

      function closeOpenConfirmations() {
        document.querySelectorAll('details[open]').forEach((details) => details.removeAttribute('open'));
      }

      function showPendingMessage(message) {
        pendingNodes().forEach((node) => {
          node.textContent = message;
          node.classList.remove('hidden');
        });
      }

      function applyInstantDeleteState(ids) {
        ids.forEach((id) => {
          const row = document.querySelector('[data-break-row-id="' + CSS.escape(id) + '"]');
          if (!row) return;
          row.classList.add('transition', 'duration-150', 'opacity-40');
          row.style.filter = 'grayscale(1)';
          row.querySelectorAll('a, button, input').forEach((node) => setDisabled(node, true));
          const titleNode = row.querySelector('[data-break-primary-title="true"]');
          if (titleNode && !titleNode.querySelector('[data-bulk-row-pending="true"]')) {
            const badge = document.createElement('span');
            badge.setAttribute('data-bulk-row-pending', 'true');
            badge.className = 'ml-2 inline-flex rounded-full border border-red-900/60 bg-red-950/30 px-2 py-0.5 text-[11px] font-medium text-red-200';
            badge.textContent = 'Deleting…';
            titleNode.appendChild(badge);
          }
        });
      }

      function setSubmitting(button) {
        isBulkSubmitting = true;
        const count = selectedCount();
        const ids = selectedIds();
        const label = button.getAttribute('data-bulk-label') || 'Delete Selected';
        button.setAttribute('data-original-label', button.textContent || label);
        button.textContent = 'Deleting…';
        showPendingMessage('Deleting ' + count + ' selected break(s)…');
        closeOpenConfirmations();
        applyInstantDeleteState(ids);
        window.setTimeout(() => updateBulkState(), 0);
      }

      document.addEventListener('change', (event) => {
        const target = event.target;
        if (target && target.matches && target.matches('input[type="checkbox"][data-bulk-page-checkbox="true"][form="' + formId + '"]')) {
          const shouldSelectPage = Boolean(target.checked);
          pageIds().forEach((id) => { if (shouldSelectPage) selectedIdsSet.add(id); else selectedIdsSet.delete(id); });
          saveStoredSelection(selectedIdsSet);
          syncStoredInputs();
          updateBulkState();
          return;
        }
        if (target && target.matches && target.matches('input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"][data-break-bulk-row-checkbox="true"]')) {
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
          allSelectionCheckboxes().forEach((checkbox) => { checkbox.checked = false; checkbox.indeterminate = false; });
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
          setSubmitting(submitButton);
        }
      }, true);

      document.addEventListener('submit', (event) => {
        if (event.target && event.target.id === formId) syncStoredInputs();
      });

      syncPageCheckboxesFromStoredSelection();
      syncStoredInputs();
      updateBulkState();
    })();
  `.replace('${FORM_ID_PLACEHOLDER}', formId)

  return <Script id="breaks-bulk-selection-script" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: script }} />
}

function DeleteBreakConfirmControl({
  breakId,
  breakLabel,
  qRaw,
  sortKey,
  sortDir,
  page,
  limit,
}: {
  breakId: string
  breakLabel: string
  qRaw: string
  sortKey: SortKey
  sortDir: SortDir
  page: number
  limit: PageLimit
}) {
  return (
    <details className="group relative">
      <summary className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/30 text-red-200 hover:bg-red-900/40">
        Delete
      </summary>

      <div className="mt-2 min-w-64 rounded-xl border border-red-900/60 bg-zinc-950 p-3 shadow-xl">
        <div className="text-sm font-semibold text-red-200">Confirm delete?</div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">
          This will delete this break: <span className="text-zinc-200">{breakLabel}</span>
        </div>

        <form action={deleteBreakAction} className="mt-3 flex flex-wrap gap-2">
          <input type="hidden" name="break_id" value={breakId} />
          <input type="hidden" name="q" value={qRaw} />
          <input type="hidden" name="sort" value={sortKey} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="limit" value={limit} />

          <button
            type="submit"
            className="app-button whitespace-nowrap border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/50"
          >
            Yes, Delete
          </button>

          <CancelDetailsButton />
        </form>
      </div>
    </details>
  )
}

function renderStatusPill(status: BreakViewRow['completionStatus']) {
  if (status === 'Complete') {
    return <span className="app-badge app-badge-success">Complete</span>
  }

  if (status === 'In Progress') {
    return <span className="app-badge app-badge-info">In Progress</span>
  }

  if (status === 'Reversed') {
    return <span className="app-badge app-badge-warning">Reversed</span>
  }

  return <span className="app-badge app-badge-warning">Open</span>
}

export default async function BreaksPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string
    sort?: string
    dir?: string
    page?: string
    limit?: string
    deleted_count?: string
    delete_error?: string
  }>
}) {
  const params = searchParams ? await searchParams : undefined
  const qRaw = String(params?.q ?? '').trim().toLowerCase()
  const deletedCount = String(params?.deleted_count ?? '').trim()
  const deleteError = String(params?.delete_error ?? '').trim()

  const requestedPage = Number(String(params?.page ?? '1'))
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1

  const requestedLimit = Number(String(params?.limit ?? String(DEFAULT_LIMIT)))
  const limit: PageLimit = LIMIT_OPTIONS.includes(requestedLimit as PageLimit)
    ? (requestedLimit as PageLimit)
    : DEFAULT_LIMIT

  const requestedSort = String(params?.sort ?? 'break_date').trim() as SortKey
  const requestedDir = String(params?.dir ?? 'desc').trim() as SortDir

  const sortKey: SortKey = [
    'break_date',
    'product_name',
    'source_name',
    'order_number',
    'completionStatus',
    'entered',
    'received',
    'remaining',
    'total_cost',
  ].includes(requestedSort)
    ? requestedSort
    : 'break_date'

  const sortDir: SortDir = requestedDir === 'asc' ? 'asc' : 'desc'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [breaksResponse, breakInventoryResponse] = await Promise.all([
    supabase
      .from('breaks')
      .select(`
        id,
        break_date,
        source_name,
        order_number,
        product_name,
        format_type,
        teams,
        total_cost,
        allocation_method,
        notes,
        reversed_at,
        cards_received
      `)
      .eq('user_id', user.id)
      .order('break_date', { ascending: false }),

    supabase
      .from('inventory_items')
      .select('source_break_id, quantity')
      .eq('user_id', user.id)
      .eq('source_type', 'break'),
  ])

  const allBreaks = (breaksResponse.data ?? []) as BreakRow[]
  const breakInventoryRows = (breakInventoryResponse.data ?? []) as BreakInventoryRow[]
  const error = breaksResponse.error || breakInventoryResponse.error

  const enteredMap = new Map<string, number>()
  for (const row of breakInventoryRows) {
    if (!row.source_break_id) continue
    enteredMap.set(
      row.source_break_id,
      (enteredMap.get(row.source_break_id) ?? 0) + Number(row.quantity ?? 0)
    )
  }

  const allRows: BreakViewRow[] = []
  let activeCount = 0
  let openCount = 0

  for (const item of allBreaks) {
    const received = Number(item.cards_received ?? 0)
    const entered = enteredMap.get(item.id) ?? 0
    const remaining = Math.max(0, received - entered)
    const completionStatus = getCompletionStatus(received, entered, item.reversed_at)

    const row: BreakViewRow = {
      ...item,
      received,
      entered,
      remaining,
      completionStatus,
    }

    allRows.push(row)

    if (!item.reversed_at) {
      activeCount += 1
      if (completionStatus === 'Open' || completionStatus === 'In Progress') {
        openCount += 1
      }
    }
  }

  const filteredBreaks =
    qRaw === 'active'
      ? allRows.filter((item) => !item.reversed_at)
      : qRaw === 'open'
        ? allRows.filter(
            (item) =>
              !item.reversed_at &&
              (item.completionStatus === 'Open' || item.completionStatus === 'In Progress')
          )
        : allRows

  const sortedBreaks = sortRows(filteredBreaks, sortKey, sortDir)

  const from = (page - 1) * limit
  const to = from + limit
  const breaks = sortedBreaks.slice(from, to)

  const hasPreviousPage = page > 1
  const hasNextPage = sortedBreaks.length > to

  const pageTitle =
    qRaw === 'active'
      ? 'Breaks — Active'
      : qRaw === 'open'
        ? 'Breaks — Open'
        : 'Breaks'

  const pageDescription =
    qRaw === 'active'
      ? 'Showing active breaks that have not been reversed.'
      : qRaw === 'open'
        ? 'Showing breaks that still need item entry.'
        : 'View and manage your recorded breaks.'

  return (
    <div className="app-page-wide space-y-3">
      <div className="app-page-header gap-3">
        <div className="min-w-0">
          <h1 className="app-title">{pageTitle}</h1>
          <p className="app-subtitle">{pageDescription}</p>
        </div>

        <Link href="/app/breaks/new" className="app-button-primary">
          Add Break
        </Link>
      </div>

      <div id="breaks-status" className="scroll-mt-28 space-y-3">
        {deletedCount ? (
          <div className="app-alert-success">
            Deleted {deletedCount} successfully.
          </div>
        ) : null}

        {deleteError ? (
          <div className="app-alert-error">
            Delete failed: {deleteError}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard label="All Breaks" value={allRows.length} />
        <SummaryCard label="Active" value={activeCount} />
        <SummaryCard label="Open" value={openCount} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={getFilterHref('', sortKey, sortDir, limit)}
          className={`app-chip ${qRaw === '' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          All
        </Link>
        <Link
          href={getFilterHref('active', sortKey, sortDir, limit)}
          className={`app-chip ${qRaw === 'active' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Active
        </Link>
        <Link
          href={getFilterHref('open', sortKey, sortDir, limit)}
          className={`app-chip ${qRaw === 'open' ? 'app-chip-active' : 'app-chip-idle'}`}
        >
          Open
        </Link>
      </div>

      <div className="app-section p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-zinc-500">Page {page}</div>

          <div className="flex flex-wrap gap-2">
            {LIMIT_OPTIONS.map((option) => (
              <Link
                key={option}
                href={buildLimitHref({
                  q: qRaw,
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

      {error ? (
        <div className="app-alert-error">
          Error loading breaks: {error.message}
        </div>
      ) : null}

      <div className="app-section">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Breaks</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              One row per break. Open details when you need the full record.
            </p>
          </div>

          <div className="text-xs text-zinc-500">{breaks.length} shown</div>
        </div>

        <form id={BULK_BREAKS_FORM_ID} action={bulkDeleteBreaksAction} className="hidden">
          <input type="hidden" name="q" value={qRaw} />
          <input type="hidden" name="sort" value={sortKey} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="limit" value={limit} />
        </form>
        <BulkSelectionScript formId={BULK_BREAKS_FORM_ID} />

        {breaks.length > 0 ? (
          <div className="mt-3">
            <BulkDeleteConfirmControl formId={BULK_BREAKS_FORM_ID} pageBreakCount={breaks.length} />
          </div>
        ) : null}

        <div className="mt-3 app-table-wrap">
          <div className="app-table-scroll">
            <table className="app-table">
              <thead className="app-thead">
                <tr>
                  <th className="app-th w-16">
                    <input
                      form={BULK_BREAKS_FORM_ID}
                      type="checkbox"
                      aria-label="Select all breaks on this page"
                      data-bulk-page-checkbox="true"
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Date"
                      sortKey="break_date"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th min-w-[220px]">
                    <SortHeader
                      label="Break"
                      sortKey="product_name"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Source"
                      sortKey="source_name"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Order #"
                      sortKey="order_number"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Status"
                      sortKey="completionStatus"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Entered"
                      sortKey="entered"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Received"
                      sortKey="received"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Remaining"
                      sortKey="remaining"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <SortHeader
                      label="Total Cost"
                      sortKey="total_cost"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th min-w-[150px]">Quick</th>
                </tr>
              </thead>
              <tbody>
                {breaks.map((item) => {
                  const breakLabel = cleanText(item.product_name || 'Untitled break')
                  const sourceLabel = cleanText(item.source_name || '—')
                  const orderLabel = cleanText(item.order_number || '—')

                  return (
                    <tr key={item.id} data-break-row-id={item.id} className="app-tr align-top">
                      <td className="app-td">
                        <input
                          form={BULK_BREAKS_FORM_ID}
                          type="checkbox"
                          name="selected_break_ids"
                          value={item.id}
                          aria-label={`Select ${breakLabel}`}
                          data-break-bulk-row-checkbox="true"
                          className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                        />
                      </td>

                      <td className="app-td whitespace-nowrap">{formatDate(item.break_date)}</td>

                      <td className="app-td">
                        <Link
                          href={`/app/breaks/${item.id}`}
                          data-break-primary-title="true"
                          className="block min-w-[200px] max-w-[420px] break-words font-medium text-zinc-100 hover:text-white hover:underline"
                          title={breakLabel}
                        >
                          {breakLabel}
                        </Link>
                      </td>

                      <td className="app-td">
                        <div className="max-w-32 break-words" title={sourceLabel}>
                          {sourceLabel}
                        </div>
                      </td>

                      <td className="app-td">
                        <div className="max-w-40 break-words" title={orderLabel}>
                          {orderLabel}
                        </div>
                      </td>

                      <td className="app-td whitespace-nowrap">
                        {renderStatusPill(item.completionStatus)}
                      </td>

                      <td className="app-td whitespace-nowrap">{item.entered}</td>
                      <td className="app-td whitespace-nowrap">{item.received}</td>
                      <td className="app-td whitespace-nowrap">{item.remaining}</td>
                      <td className="app-td whitespace-nowrap">{money(item.total_cost)}</td>

                      <td className="app-td whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {!item.reversed_at && item.remaining > 0 ? (
                            <Link href={`/app/breaks/${item.id}/add-cards`} className="app-button">
                              Add
                            </Link>
                          ) : null}

                          <DeleteBreakConfirmControl
                            breakId={item.id}
                            breakLabel={breakLabel}
                            qRaw={qRaw}
                            sortKey={sortKey}
                            sortDir={sortDir}
                            page={page}
                            limit={limit}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {breaks.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-zinc-400">
                      No breaks found for this view.
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
            Showing page {page} with up to {limit} breaks.
          </div>

          <div className="flex gap-2">
            {hasPreviousPage ? (
              <Link
                href={buildBreaksHref({
                  q: qRaw,
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
                href={buildBreaksHref({
                  q: qRaw,
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