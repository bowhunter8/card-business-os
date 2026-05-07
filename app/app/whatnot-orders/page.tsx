import Link from "next/link";
import Script from "next/script";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CancelDetailsButton from "../search/CancelDetailsButton";

type WhatnotOrderRow = {
  id: string;
  break_id: string | null;
  order_id: string | null;
  order_numeric_id: string | null;
  buyer: string | null;
  seller: string | null;
  product_name: string | null;
  processed_date: string | null;
  processed_date_display: string | null;
  order_status: string | null;
  quantity: number | null;
  subtotal: number | null;
  shipping_price: number | null;
  taxes: number | null;
  total: number | null;
  source_file_name: string | null;
  created_at: string | null;
};

type WhatnotOrderSummaryRow = {
  break_id: string | null;
  subtotal: number | null;
  shipping_price: number | null;
  total: number | null;
};

type SuggestedGroup = {
  id: string;
  seller: string;
  date_key: string;
  date_label: string;
  order_count: number;
  total_paid: number;
  latest_order_created_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type PageLimit = 10 | 25 | 100;
type SortKey =
  | "created_at"
  | "processed_date"
  | "order_numeric_id"
  | "seller"
  | "product_name"
  | "break_id"
  | "total";
type SortDir = "asc" | "desc";

const DEFAULT_LIMIT: PageLimit = 10;
const LIMIT_OPTIONS: PageLimit[] = [10, 25, 100];
const BULK_ORDERS_FORM_ID = "bulk-delete-orders-page-form";

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value ?? 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  }).format(parsed);
}

function cleanText(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeCandidate(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeCandidate(value: string | null | undefined) {
  return cleanText(decodeCandidate(String(value ?? "")));
}

function looksLikeOrderNumber(value: string) {
  const cleaned = normalizeCandidate(value);

  if (!cleaned) return false;
  if (cleaned.includes(",")) return false;
  if (/\s/.test(cleaned)) return false;
  if (
    /UTC|USD|direct_order|completed|imported|subtotal|shipping|tax/i.test(
      cleaned,
    )
  ) {
    return false;
  }

  return /^[A-Za-z0-9_-]+$/.test(cleaned);
}

function getOrderNumberDisplay(order: WhatnotOrderRow) {
  const numericId = normalizeCandidate(order.order_numeric_id);
  const orderId = normalizeCandidate(order.order_id);

  if (looksLikeOrderNumber(numericId)) return numericId;
  if (looksLikeOrderNumber(orderId)) return orderId;

  return "—";
}

function getDescriptionDisplay(order: WhatnotOrderRow) {
  const cleanedProductName = cleanText(order.product_name);

  if (cleanedProductName) {
    return cleanedProductName;
  }

  return "Imported order";
}

function buildFocusHref(order: WhatnotOrderRow) {
  const params = new URLSearchParams();

  if (order.id) params.set("row_id", order.id);
  if (order.order_numeric_id)
    params.set("order_numeric_id", order.order_numeric_id);
  if (order.order_id) params.set("order_id", order.order_id);

  return `/app/whatnot-orders/focus?${params.toString()}`;
}

function buildOrdersHref({
  q,
  page,
  limit,
  sort,
  dir,
}: {
  q?: string;
  page: number;
  limit: number;
  sort?: SortKey;
  dir?: SortDir;
}) {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  params.set("page", String(page));
  params.set("limit", String(limit));

  if (sort) {
    params.set("sort", sort);
  }

  if (dir) {
    params.set("dir", dir);
  }

  const query = params.toString();
  return query ? `/app/whatnot-orders?${query}` : "/app/whatnot-orders";
}

function buildOrdersStatusHref({
  q,
  page,
  limit,
  sort,
  dir,
  statusKey,
  statusValue,
}: {
  q?: string;
  page: number;
  limit: number;
  sort?: SortKey;
  dir?: SortDir;
  statusKey: string;
  statusValue: string;
}) {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  params.set("page", String(page));
  params.set("limit", String(limit));

  if (sort) {
    params.set("sort", sort);
  }

  if (dir) {
    params.set("dir", dir);
  }

  params.set(statusKey, statusValue);

  return `/app/whatnot-orders?${params.toString()}#orders-status`;
}

function buildCombineSelectedHref(orderIds: string[]) {
  const params = new URLSearchParams();

  for (const orderId of orderIds) {
    params.append("order_ids", orderId);
  }

  return `/app/breaks/new?${params.toString()}`;
}

function readFormIds(formData: FormData, fieldName: string) {
  return formData
    .getAll(fieldName)
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function readOrdersListFormState(formData: FormData) {
  const q = String(formData.get("q") ?? "").trim();
  const page = Number(String(formData.get("page") ?? "1"));
  const limit = Number(String(formData.get("limit") ?? String(DEFAULT_LIMIT)));
  const sort = String(formData.get("sort") ?? "created_at").trim() as SortKey;
  const dir = String(formData.get("dir") ?? "desc").trim() as SortDir;

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeLimit: PageLimit = LIMIT_OPTIONS.includes(limit as PageLimit)
    ? (limit as PageLimit)
    : DEFAULT_LIMIT;
  const safeSort: SortKey = [
    "created_at",
    "processed_date",
    "order_numeric_id",
    "seller",
    "product_name",
    "break_id",
    "total",
  ].includes(sort)
    ? sort
    : "created_at";
  const safeDir: SortDir = dir === "asc" ? "asc" : "desc";

  return {
    q,
    safePage,
    safeLimit,
    safeSort,
    safeDir,
  };
}

async function deleteOrderAction(formData: FormData) {
  "use server";

  const orderId = String(formData.get("order_id") ?? "").trim();
  const isLinked = String(formData.get("is_linked") ?? "") === "1";
  const { q, safePage, safeLimit, safeSort, safeDir } =
    readOrdersListFormState(formData);

  if (!orderId) {
    redirect(
      buildOrdersStatusHref({
        q,
        page: safePage,
        limit: safeLimit,
        sort: safeSort,
        dir: safeDir,
        statusKey: "delete_error",
        statusValue: "Missing order ID.",
      }),
    );
  }

  if (isLinked) {
    redirect(
      buildOrdersStatusHref({
        q,
        page: safePage,
        limit: safeLimit,
        sort: safeSort,
        dir: safeDir,
        statusKey: "delete_error",
        statusValue:
          "This order is linked to a break. Roll back or unlink the break first, then delete the order.",
      }),
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("whatnot_orders")
    .delete()
    .eq("user_id", user.id)
    .eq("id", orderId)
    .is("break_id", null);

  if (error) {
    redirect(
      buildOrdersStatusHref({
        q,
        page: safePage,
        limit: safeLimit,
        sort: safeSort,
        dir: safeDir,
        statusKey: "delete_error",
        statusValue: error.message,
      }),
    );
  }

  revalidatePath("/app/whatnot-orders");
  revalidatePath("/app/search");
  revalidatePath("/app/breaks");

  redirect(
    buildOrdersStatusHref({
      q,
      page: safePage,
      limit: safeLimit,
      statusKey: "deleted_count",
      statusValue: "1 unassigned order",
    }),
  );
}

async function bulkDeleteOrdersAction(formData: FormData) {
  "use server";

  const orderIds = readFormIds(formData, "selected_order_ids");
  const { q, safePage, safeLimit, safeSort, safeDir } =
    readOrdersListFormState(formData);

  if (orderIds.length === 0) {
    redirect(
      buildOrdersStatusHref({
        q,
        page: safePage,
        limit: safeLimit,
        sort: safeSort,
        dir: safeDir,
        statusKey: "delete_error",
        statusValue: "Select at least one unassigned order to delete.",
      }),
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("whatnot_orders")
    .delete()
    .eq("user_id", user.id)
    .is("break_id", null)
    .in("id", orderIds);

  if (error) {
    redirect(
      buildOrdersStatusHref({
        q,
        page: safePage,
        limit: safeLimit,
        sort: safeSort,
        dir: safeDir,
        statusKey: "delete_error",
        statusValue: error.message,
      }),
    );
  }

  revalidatePath("/app/whatnot-orders");
  revalidatePath("/app/search");
  revalidatePath("/app/breaks");

  redirect(
    buildOrdersStatusHref({
      q,
      page: safePage,
      limit: safeLimit,
      statusKey: "deleted_count",
      statusValue: `${orderIds.length} unassigned order(s)`,
    }),
  );
}

async function combineSelectedOrdersAction(formData: FormData) {
  "use server";

  const orderIds = readFormIds(formData, "selected_order_ids");
  const { q, safePage, safeLimit, safeSort, safeDir } =
    readOrdersListFormState(formData);

  if (orderIds.length === 0) {
    redirect(
      buildOrdersStatusHref({
        q,
        page: safePage,
        limit: safeLimit,
        sort: safeSort,
        dir: safeDir,
        statusKey: "delete_error",
        statusValue:
          "Select at least one unassigned order to combine into a break.",
      }),
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("whatnot_orders")
    .select("id, break_id")
    .eq("user_id", user.id)
    .in("id", orderIds);

  if (error) {
    redirect(
      buildOrdersStatusHref({
        q,
        page: safePage,
        limit: safeLimit,
        sort: safeSort,
        dir: safeDir,
        statusKey: "delete_error",
        statusValue: error.message,
      }),
    );
  }

  const rows = (data ?? []) as { id: string; break_id: string | null }[];
  const foundIds = new Set(rows.map((row) => row.id));
  const missingCount = orderIds.filter(
    (orderId) => !foundIds.has(orderId),
  ).length;
  const linkedCount = rows.filter((row) => row.break_id).length;
  const unassignedIds = rows
    .filter((row) => !row.break_id)
    .map((row) => row.id);

  if (missingCount > 0 || linkedCount > 0 || unassignedIds.length === 0) {
    redirect(
      buildOrdersStatusHref({
        q,
        page: safePage,
        limit: safeLimit,
        sort: safeSort,
        dir: safeDir,
        statusKey: "delete_error",
        statusValue: "Only unassigned orders can be combined into a new break.",
      }),
    );
  }

  redirect(buildCombineSelectedHref(unassignedIds));
}

function BulkDeleteConfirmControl({ formId }: { formId: string }) {
  return (
    <details className="group">
      <summary className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/30 text-red-200 hover:bg-red-900/40">
        Delete Selected
      </summary>

      <div className="mt-2 rounded-xl border border-red-900/60 bg-zinc-950 p-3 shadow-xl md:min-w-72">
        <div className="text-sm font-semibold text-red-200">
          Confirm bulk delete?
        </div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">
          This will delete the selected unassigned orders only. Orders linked to
          breaks must be handled by rolling back or unlinking the break first.
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            form={formId}
            formAction={bulkDeleteOrdersAction}
            className="app-button whitespace-nowrap border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-900/50"
          >
            Yes, Delete Selected
          </button>

          <CancelDetailsButton />
        </div>
      </div>
    </details>
  );
}

function CombineSelectedOrdersControl({ formId }: { formId: string }) {
  return (
    <details className="group">
      <summary className="app-button-primary cursor-pointer list-none whitespace-nowrap">
        Combine Selected
      </summary>

      <div className="mt-2 rounded-xl border border-zinc-700 bg-zinc-950 p-3 shadow-xl md:min-w-72">
        <div className="text-sm font-semibold text-zinc-200">
          Create break from selected orders?
        </div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">
          This will open the new break flow with the selected unassigned orders
          attached. Linked orders are protected.
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            form={formId}
            formAction={combineSelectedOrdersAction}
            className="app-button-primary whitespace-nowrap"
          >
            Yes, Combine Selected
          </button>

          <CancelDetailsButton />
        </div>
      </div>
    </details>
  );
}

function getNextSortDir(
  currentKey: SortKey,
  currentDir: SortDir,
  nextKey: SortKey,
): SortDir {
  if (currentKey !== nextKey) return nextKey === "created_at" ? "desc" : "asc";
  return currentDir === "asc" ? "desc" : "asc";
}

function getSortIndicator(
  currentKey: SortKey,
  currentDir: SortDir,
  key: SortKey,
) {
  if (currentKey !== key) return "↕";
  return currentDir === "asc" ? "↑" : "↓";
}

function OrderSortHeader({
  label,
  sortKey,
  currentSortKey,
  currentSortDir,
  qRaw,
  limit,
}: {
  label: string;
  sortKey: SortKey;
  currentSortKey: SortKey;
  currentSortDir: SortDir;
  qRaw: string;
  limit: PageLimit;
}) {
  return (
    <Link
      href={buildOrdersHref({
        q: qRaw,
        page: 1,
        limit,
        sort: sortKey,
        dir: getNextSortDir(currentSortKey, currentSortDir, sortKey),
      })}
      className="inline-flex items-center gap-1 hover:text-zinc-100"
    >
      <span>{label}</span>
      <span className="text-[10px]">
        {getSortIndicator(currentSortKey, currentSortDir, sortKey)}
      </span>
    </Link>
  );
}

function OrdersSelectionScript({ formId }: { formId: string }) {
  const script = `
    (() => {
      const formId = ${JSON.stringify("${FORM_ID_PLACEHOLDER}")};
      const fieldName = "selected_order_ids";

      const rowCheckboxes = () =>
        Array.from(
          document.querySelectorAll(
            'input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"]'
          )
        );

      const selectAllCheckboxes = () =>
        Array.from(
          document.querySelectorAll(
            'input[type="checkbox"][data-orders-page-checkbox="true"][form="' + formId + '"]'
          )
        );

      function updateSelectAllState() {
        const rows = rowCheckboxes();
        const selectableRows = rows.filter((checkbox) => !checkbox.disabled);
        const checkedRows = selectableRows.filter((checkbox) => checkbox.checked);
        const allChecked =
          selectableRows.length > 0 && checkedRows.length === selectableRows.length;

        selectAllCheckboxes().forEach((checkbox) => {
          checkbox.checked = allChecked;
          checkbox.indeterminate = checkedRows.length > 0 && !allChecked;
          checkbox.disabled = selectableRows.length === 0;
          checkbox.setAttribute(
            "aria-checked",
            checkbox.indeterminate ? "mixed" : String(allChecked)
          );
        });
      }

      document.addEventListener(
        "change",
        (event) => {
          const target = event.target;

          if (
            target &&
            target.matches &&
            target.matches(
              'input[type="checkbox"][data-orders-page-checkbox="true"][form="' + formId + '"]'
            )
          ) {
            const shouldCheck = Boolean(target.checked);
            rowCheckboxes().forEach((checkbox) => {
              if (!checkbox.disabled) checkbox.checked = shouldCheck;
            });
            updateSelectAllState();
            return;
          }

          if (
            target &&
            target.matches &&
            target.matches(
              'input[type="checkbox"][form="' + formId + '"][name="' + fieldName + '"]'
            )
          ) {
            updateSelectAllState();
          }
        },
        true
      );

      updateSelectAllState();
    })();
  `.replace("${FORM_ID_PLACEHOLDER}", formId);

  return (
    <Script
      id="orders-page-selection-script"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}

function BulkActionsPanel({
  formId,
  qRaw,
  page,
  limit,
  sortKey,
  sortDir,
}: {
  formId: string;
  qRaw: string;
  page: number;
  limit: PageLimit;
  sortKey: SortKey;
  sortDir: SortDir;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/90 p-3 shadow-2xl shadow-black/30 backdrop-blur">
      <div className="flex flex-col gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-200">
            Bulk actions
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            Select unassigned orders, then combine them into a break or delete
            them. Linked orders are protected.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="app-chip app-chip-idle whitespace-nowrap">
            Select rows below
          </span>

          <Link
            href={buildOrdersHref({
              q: qRaw,
              page,
              limit,
              sort: sortKey,
              dir: sortDir,
            })}
            className="app-button whitespace-nowrap"
          >
            Clear Selection
          </Link>

          <CombineSelectedOrdersControl formId={formId} />
          <BulkDeleteConfirmControl formId={formId} />
        </div>
      </div>
    </div>
  );
}

function DeleteOrderConfirmControl({
  orderId,
  orderLabel,
  isLinked,
  qRaw,
  page,
  limit,
}: {
  orderId: string;
  orderLabel: string;
  isLinked: boolean;
  qRaw: string;
  page: number;
  limit: PageLimit;
}) {
  if (isLinked) {
    return (
      <div className="max-w-[190px] text-[11px] leading-snug text-amber-300">
        Linked to break — roll back or unlink break first.
      </div>
    );
  }

  return (
    <details className="group relative">
      <summary className="app-button cursor-pointer list-none whitespace-nowrap border-red-900/60 bg-red-950/30 text-red-200 hover:bg-red-900/40">
        Delete
      </summary>

      <div className="mt-2 min-w-64 rounded-xl border border-red-900/60 bg-zinc-950 p-3 shadow-xl">
        <div className="text-sm font-semibold text-red-200">
          Confirm delete?
        </div>
        <div className="mt-1 text-xs leading-relaxed text-zinc-400">
          This will delete this unassigned order:{" "}
          <span className="text-zinc-200">{orderLabel}</span>
        </div>

        <form action={deleteOrderAction} className="mt-3 flex flex-wrap gap-2">
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="is_linked" value={isLinked ? "1" : "0"} />
          <input type="hidden" name="q" value={qRaw} />
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
  );
}

export default async function WhatnotOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    page?: string;
    limit?: string;
    sort?: string;
    dir?: string;
    deleted_count?: string;
    delete_error?: string;
  }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const qRaw = String(params?.q ?? "")
    .trim()
    .toLowerCase();
  const deletedCount = String(params?.deleted_count ?? "").trim();
  const deleteError = String(params?.delete_error ?? "").trim();

  const requestedPage = Number(String(params?.page ?? "1"));
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0
      ? Math.floor(requestedPage)
      : 1;

  const requestedLimit = Number(String(params?.limit ?? String(DEFAULT_LIMIT)));
  const limit: PageLimit = LIMIT_OPTIONS.includes(requestedLimit as PageLimit)
    ? (requestedLimit as PageLimit)
    : DEFAULT_LIMIT;

  const requestedSort = String(params?.sort ?? "created_at").trim() as SortKey;
  const requestedDir = String(params?.dir ?? "desc").trim() as SortDir;
  const sortKey: SortKey = [
    "created_at",
    "processed_date",
    "order_numeric_id",
    "seller",
    "product_name",
    "break_id",
    "total",
  ].includes(requestedSort)
    ? requestedSort
    : "created_at";
  const sortDir: SortDir = requestedDir === "asc" ? "asc" : "desc";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  let filteredQuery = supabase
    .from("whatnot_orders")
    .select(
      `
      id,
      break_id,
      order_id,
      order_numeric_id,
      buyer,
      seller,
      product_name,
      processed_date,
      processed_date_display,
      order_status,
      quantity,
      subtotal,
      shipping_price,
      taxes,
      total,
      source_file_name,
      created_at
    `,
    )
    .eq("user_id", user.id);

  if (qRaw === "unassigned") {
    filteredQuery = filteredQuery.is("break_id", null);
  } else if (qRaw === "assigned") {
    filteredQuery = filteredQuery.not("break_id", "is", null);
  }

  const summaryQuery = supabase
    .from("whatnot_orders")
    .select(
      `
      break_id,
      subtotal,
      shipping_price,
      total
    `,
    )
    .eq("user_id", user.id);

  const suggestionsQuery =
    qRaw === "assigned"
      ? null
      : supabase
          .from("whatnot_order_group_suggestions")
          .select(
            `
            id,
            seller,
            date_key,
            date_label,
            order_count,
            total_paid,
            latest_order_created_at,
            created_at,
            updated_at
          `,
          )
          .eq("user_id", user.id)
          .order("latest_order_created_at", {
            ascending: false,
            nullsFirst: false,
          })
          .order("created_at", { ascending: false, nullsFirst: false })
          .limit(20);

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const [filteredRes, summaryRes, suggestionsRes] = await Promise.all([
    filteredQuery
      .order(sortKey, { ascending: sortDir === "asc", nullsFirst: false })
      .range(from, to),
    summaryQuery,
    suggestionsQuery,
  ]);

  const filteredOrders = (filteredRes.data ?? []) as WhatnotOrderRow[];
  const summaryRows = (summaryRes.data ?? []) as WhatnotOrderSummaryRow[];
  const suggestedGroups = (suggestionsRes?.data ?? []) as SuggestedGroup[];

  let totalOrders = 0;
  let subtotalTotal = 0;
  let shippingTotal = 0;
  let totalPaid = 0;
  let unassignedCount = 0;
  let assignedCount = 0;

  for (const order of summaryRows) {
    totalOrders += 1;
    subtotalTotal += Number(order.subtotal ?? 0);
    shippingTotal += Number(order.shipping_price ?? 0);
    totalPaid += Number(order.total ?? 0);

    if (!order.break_id) {
      unassignedCount += 1;
    } else {
      assignedCount += 1;
    }
  }

  const pageTitle =
    qRaw === "unassigned"
      ? "Orders — Unassigned"
      : qRaw === "assigned"
        ? "Orders — Assigned"
        : "Orders";

  const pageDescription =
    qRaw === "unassigned"
      ? "Showing only orders that have not yet been grouped into a break."
      : qRaw === "assigned"
        ? "Showing only orders that are already linked to a break."
        : "Orders are shown here as a staging area before grouping them into breaks or other purchase batches.";

  const hasPreviousPage = page > 1;
  const hasNextPage = filteredOrders.length === limit;

  return (
    <div className="app-page-wide flex h-[calc(100vh-6.5rem)] flex-col gap-3 overflow-hidden">
      <div className="app-page-header">
        <div>
          <h1 className="app-title">{pageTitle}</h1>
          <p className="app-subtitle">{pageDescription}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/app/imports/whatnot"
            className="app-button whitespace-nowrap"
          >
            Import More
          </Link>
          <Link href="/app/utilities" className="app-button whitespace-nowrap">
            Back to Utilities
          </Link>
        </div>
      </div>

      <div id="orders-status" className="scroll-mt-28 space-y-3">
        {deletedCount ? (
          <div className="app-alert-success">
            Deleted {deletedCount} successfully.
          </div>
        ) : null}

        {deleteError ? (
          <div className="app-alert-error">Delete blocked: {deleteError}</div>
        ) : null}
      </div>

      {filteredRes.error ? (
        <div className="app-alert-error">
          Order load error: {filteredRes.error.message}
        </div>
      ) : null}

      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-6">
        <Link
          href={buildOrdersHref({
            q: "",
            page: 1,
            limit,
            sort: sortKey,
            dir: sortDir,
          })}
          className={`app-metric-card transition hover:bg-zinc-800 ${qRaw === "" ? "border-sky-700 bg-sky-950/20" : ""}`}
        >
          <div className="text-sm text-zinc-400">Total Orders</div>
          <div className="mt-1 text-2xl font-semibold">{totalOrders}</div>
        </Link>

        <Link
          href={buildOrdersHref({
            q: "unassigned",
            page: 1,
            limit,
            sort: sortKey,
            dir: sortDir,
          })}
          className="app-metric-card transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Unassigned</div>
          <div className="mt-1 text-2xl font-semibold">{unassignedCount}</div>
        </Link>

        <Link
          href={buildOrdersHref({
            q: "assigned",
            page: 1,
            limit,
            sort: sortKey,
            dir: sortDir,
          })}
          className="app-metric-card transition hover:bg-zinc-800"
        >
          <div className="text-sm text-zinc-400">Assigned to Break</div>
          <div className="mt-1 text-2xl font-semibold">{assignedCount}</div>
        </Link>

        <div className="app-metric-card">
          <div className="text-sm text-zinc-400">Subtotal</div>
          <div className="mt-1 text-2xl font-semibold">
            {money(subtotalTotal)}
          </div>
        </div>

        <div className="app-metric-card">
          <div className="text-sm text-zinc-400">Shipping</div>
          <div className="mt-1 text-2xl font-semibold">
            {money(shippingTotal)}
          </div>
        </div>

        <div className="app-metric-card">
          <div className="text-sm text-zinc-400">Total Paid</div>
          <div className="mt-1 text-2xl font-semibold">{money(totalPaid)}</div>
        </div>
      </div>

      <div className="app-section p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-zinc-500">
            Page {page} • Sort columns using the table headers.
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={buildOrdersHref({
                q: "",
                page: 1,
                limit,
                sort: sortKey,
                dir: sortDir,
              })}
              className={`app-chip whitespace-nowrap ${qRaw === "" ? "app-chip-active" : "app-chip-idle"}`}
            >
              All Orders
            </Link>
            <Link
              href={buildOrdersHref({
                q: "unassigned",
                page: 1,
                limit,
                sort: sortKey,
                dir: sortDir,
              })}
              className={`app-chip whitespace-nowrap ${qRaw === "unassigned" ? "app-chip-active" : "app-chip-idle"}`}
            >
              Unassigned
            </Link>
            <Link
              href={buildOrdersHref({
                q: "assigned",
                page: 1,
                limit,
                sort: sortKey,
                dir: sortDir,
              })}
              className={`app-chip whitespace-nowrap ${qRaw === "assigned" ? "app-chip-active" : "app-chip-idle"}`}
            >
              Assigned
            </Link>

            {LIMIT_OPTIONS.map((option) => (
              <Link
                key={option}
                href={buildOrdersHref({
                  q: qRaw,
                  page: 1,
                  limit: option,
                  sort: sortKey,
                  dir: sortDir,
                })}
                className={`app-chip whitespace-nowrap ${limit === option ? "app-chip-active" : "app-chip-idle"}`}
              >
                {option} rows
              </Link>
            ))}
          </div>
        </div>
      </div>

      {void suggestedGroups}

      <div className="app-section flex min-h-0 flex-1 flex-col">

        <form id={BULK_ORDERS_FORM_ID} className="hidden">
          <input type="hidden" name="q" value={qRaw} />
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="limit" value={limit} />
          <input type="hidden" name="sort" value={sortKey} />
          <input type="hidden" name="dir" value={sortDir} />
        </form>
        <OrdersSelectionScript formId={BULK_ORDERS_FORM_ID} />

        {filteredOrders.length > 0 ? (
          <div className="sticky top-16 z-30">
            <BulkActionsPanel
              formId={BULK_ORDERS_FORM_ID}
              qRaw={qRaw}
              page={page}
              limit={limit}
              sortKey={sortKey}
              sortDir={sortDir}
            />
          </div>
        ) : null}

        {filteredOrders.length === 0 ? (
          <div className="app-empty mt-4">No orders found for this view.</div>
        ) : (
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto app-table-scroll">
            <table className="app-table">
              <thead className="app-thead">
                <tr>
                  <th className="app-th w-16">
                    <input
                      form={BULK_ORDERS_FORM_ID}
                      type="checkbox"
                      aria-label="Select all unassigned orders"
                      data-orders-page-checkbox="true"
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                    />
                  </th>
                  <th className="app-th">
                    <OrderSortHeader
                      label="Order #"
                      sortKey="order_numeric_id"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <OrderSortHeader
                      label="Date Added"
                      sortKey="created_at"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <OrderSortHeader
                      label="Order Date"
                      sortKey="processed_date"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <OrderSortHeader
                      label="Purchased From"
                      sortKey="seller"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th min-w-[240px]">
                    <OrderSortHeader
                      label="Description"
                      sortKey="product_name"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th">
                    <OrderSortHeader
                      label="Status"
                      sortKey="break_id"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th text-right">
                    <OrderSortHeader
                      label="Price"
                      sortKey="total"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      qRaw={qRaw}
                      limit={limit}
                    />
                  </th>
                  <th className="app-th min-w-[170px]">Quick</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const importedDate = formatDate(order.created_at);
                  const orderDate = formatDate(
                    order.processed_date_display || order.processed_date,
                  );
                  const orderNumber = getOrderNumberDisplay(order);
                  const seller = cleanText(order.seller || "Unknown Seller");
                  const productName = getDescriptionDisplay(order);
                  const isLinked = Boolean(order.break_id);

                  return (
                    <tr
                      key={order.id}
                      className="app-tr align-top cursor-pointer"
                    >
                      <td className="app-td">
                        {!isLinked ? (
                          <input
                            form={BULK_ORDERS_FORM_ID}
                            type="checkbox"
                            name="selected_order_ids"
                            value={order.id}
                            aria-label={`Select order ${orderNumber}`}
                            className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                          />
                        ) : (
                          <span className="text-xs text-zinc-600">—</span>
                        )}
                      </td>

                      <td className="app-td whitespace-nowrap">
                        <Link
                          href={buildFocusHref(order)}
                          className="font-medium hover:text-zinc-100"
                        >
                          {orderNumber}
                        </Link>
                      </td>
                      <td className="app-td whitespace-nowrap">
                        <Link
                          href={buildFocusHref(order)}
                          className="block hover:text-zinc-100"
                        >
                          {importedDate}
                        </Link>
                      </td>
                      <td className="app-td whitespace-nowrap">
                        <Link
                          href={buildFocusHref(order)}
                          className="block hover:text-zinc-100"
                        >
                          {orderDate}
                        </Link>
                      </td>
                      <td className="app-td">
                        <Link
                          href={buildFocusHref(order)}
                          className="block max-w-[160px] break-words hover:text-zinc-100"
                          title={seller}
                        >
                          {seller}
                        </Link>
                      </td>
                      <td className="app-td">
                        <Link
                          href={buildFocusHref(order)}
                          className="block min-w-[220px] max-w-[520px] break-words hover:text-zinc-100"
                          title={productName}
                        >
                          {productName}
                        </Link>
                      </td>
                      <td className="app-td whitespace-nowrap">
                        <Link href={buildFocusHref(order)} className="block">
                          {isLinked ? (
                            <span className="app-badge app-badge-success">
                              Linked
                            </span>
                          ) : (
                            <span className="app-badge app-badge-warning">
                              Unassigned
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="app-td whitespace-nowrap text-right">
                        <Link
                          href={buildFocusHref(order)}
                          className="block hover:text-zinc-100"
                        >
                          {money(order.total)}
                        </Link>
                      </td>
                      <td className="app-td whitespace-nowrap">
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          {order.break_id ? (
                            <Link
                              href={`/app/breaks/${order.break_id}`}
                              className="app-button whitespace-nowrap"
                            >
                              Break
                            </Link>
                          ) : null}

                          <DeleteOrderConfirmControl
                            orderId={order.id}
                            orderLabel={orderNumber}
                            isLinked={isLinked}
                            qRaw={qRaw}
                            page={page}
                            limit={limit}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="app-section p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-zinc-300">
            Showing page {page} with up to {limit} orders.
          </div>

          <div className="flex items-center gap-2 whitespace-nowrap">
            {hasPreviousPage ? (
              <Link
                href={buildOrdersHref({
                  q: qRaw,
                  page: page - 1,
                  limit,
                  sort: sortKey,
                  dir: sortDir,
                })}
                className="app-button whitespace-nowrap"
              >
                Previous
              </Link>
            ) : (
              <span className="app-button pointer-events-none whitespace-nowrap opacity-50">
                Previous
              </span>
            )}

            {hasNextPage ? (
              <Link
                href={buildOrdersHref({
                  q: qRaw,
                  page: page + 1,
                  limit,
                  sort: sortKey,
                  dir: sortDir,
                })}
                className="app-button-primary whitespace-nowrap"
              >
                Next
              </Link>
            ) : (
              <span className="app-button-primary pointer-events-none whitespace-nowrap opacity-50">
                Next
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
