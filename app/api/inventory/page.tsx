"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type InventoryStatus =
  | "inventory"
  | "listed"
  | "sold"
  | "keep"
  | "personal"
  | "donation"
  | "bulk_lot"
  | "bulk_lot_item";

type InventoryItem = {
  id: string;
  created_at?: string;
  updated_at?: string;

  status?: string;
  entry_mode?: string;

  title?: string;
  player?: string;
  year?: string;
  brand?: string;
  set_name?: string;
  card_number?: string;
  team?: string;
  parallel?: string;
  variation?: string;

  rookie?: boolean;
  autograph?: boolean;
  relic?: boolean;

  serial_number?: string;
  grade?: string;

  quantity?: number;
  unit_cost?: number;
  cost?: number;
  estimated_value?: number;

  source?: string;
  break_id?: string | null;
  acquired_date?: string | null;
  notes?: string;
};

type FilterKey =
  | "all"
  | "inventory"
  | "bulk_lot"
  | "listed"
  | "sold"
  | "keep"
  | "donation";

function money(value: unknown): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
}

function safeNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function compactText(...parts: Array<string | undefined | null>): string {
  return parts.map((p) => (p ?? "").trim()).filter(Boolean).join(" ");
}

function getDisplayTitle(item: InventoryItem): string {
  const explicit = (item.title ?? "").trim();
  if (explicit) return explicit;

  return (
    compactText(
      item.year,
      item.brand,
      item.set_name,
      item.player,
      item.card_number ? `#${item.card_number}` : "",
      item.parallel,
      item.variation
    ) || "Untitled Item"
  );
}

function getBulkLotItemCount(notes?: string): number {
  if (!notes) return 0;
  const match = notes.match(/Bulk Lot Item Count:\s*(\d+)/i);
  if (!match) return 0;
  const count = Number(match[1]);
  return Number.isFinite(count) ? count : 0;
}

function getBulkLotName(notes?: string): string {
  if (!notes) return "";
  const match = notes.match(/Bulk Lot Name:\s*(.+)/i);
  return match?.[1]?.trim() ?? "";
}

function getStatusTone(status?: string): string {
  switch (status) {
    case "sold":
      return "bg-green-100 text-green-700 border-green-200";
    case "listed":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "keep":
    case "personal":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "donation":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "bulk_lot":
      return "bg-orange-100 text-orange-700 border-orange-200";
    default:
      return "bg-neutral-100 text-neutral-700 border-neutral-200";
  }
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/inventory", { cache: "no-store" });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load inventory.");
        }

        if (!active) return;
        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load inventory.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const parentVisibleItems = useMemo(() => {
    return items.filter((item) => item.status !== "bulk_lot_item");
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();

    return parentVisibleItems.filter((item) => {
      if (filter !== "all" && item.status !== filter) {
        return false;
      }

      if (!term) return true;

      const haystack = [
        item.title,
        item.player,
        item.year,
        item.brand,
        item.set_name,
        item.card_number,
        item.team,
        item.parallel,
        item.variation,
        item.source,
        item.break_id,
        item.notes,
      ]
        .map((v) => (v ?? "").toString().toLowerCase())
        .join(" ");

      return haystack.includes(term);
    });
  }, [parentVisibleItems, filter, search]);

  const stats = useMemo(() => {
    const visible = parentVisibleItems;

    const inventoryCount = visible.filter((i) => i.status === "inventory").length;
    const bulkLotCount = visible.filter((i) => i.status === "bulk_lot").length;
    const listedCount = visible.filter((i) => i.status === "listed").length;
    const soldCount = visible.filter((i) => i.status === "sold").length;

    const totalCost = visible.reduce((sum, item) => sum + safeNumber(item.cost), 0);
    const totalEstimated = visible.reduce(
      (sum, item) => sum + safeNumber(item.estimated_value),
      0
    );

    return {
      totalItems: visible.length,
      inventoryCount,
      bulkLotCount,
      listedCount,
      soldCount,
      totalCost,
      totalEstimated,
    };
  }, [parentVisibleItems]);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="text-sm text-neutral-600">
            Bulk lot child items are hidden here so your main inventory stays clean.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/inventory/new"
            className="rounded-xl bg-black px-4 py-2 text-white"
          >
            New Inventory Entry
          </Link>
        </div>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-6">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm text-neutral-500">Visible Items</div>
          <div className="mt-1 text-2xl font-semibold">{stats.totalItems}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm text-neutral-500">Inventory</div>
          <div className="mt-1 text-2xl font-semibold">{stats.inventoryCount}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm text-neutral-500">Bulk Lots</div>
          <div className="mt-1 text-2xl font-semibold">{stats.bulkLotCount}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm text-neutral-500">Listed</div>
          <div className="mt-1 text-2xl font-semibold">{stats.listedCount}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm text-neutral-500">Sold</div>
          <div className="mt-1 text-2xl font-semibold">{stats.soldCount}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm text-neutral-500">Est. Value</div>
          <div className="mt-1 text-2xl font-semibold">
            {money(stats.totalEstimated)}
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <div>
            <label className="mb-1 block text-sm font-medium">Search</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Search inventory, break ID, notes, player, brand..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Filter</label>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterKey)}
            >
              <option value="all">All Visible Items</option>
              <option value="inventory">Inventory</option>
              <option value="bulk_lot">Bulk Lots</option>
              <option value="listed">Listed</option>
              <option value="sold">Sold</option>
              <option value="keep">Keep</option>
              <option value="donation">Donation</option>
            </select>
          </div>
        </div>
      </section>

      {!!error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border bg-white p-8 text-sm text-neutral-600">
          Loading inventory...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-2xl border bg-white p-8 text-sm text-neutral-600">
          No inventory items found for the current search/filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => {
            const isBulkLot = item.status === "bulk_lot";
            const itemCount = isBulkLot ? getBulkLotItemCount(item.notes) : 0;
            const lotName = isBulkLot ? getBulkLotName(item.notes) : "";

            return (
              <div
                key={item.id}
                className="rounded-2xl border bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusTone(
                          item.status
                        )}`}
                      >
                        {item.status || "inventory"}
                      </span>

                      {isBulkLot && (
                        <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">
                          parent lot
                        </span>
                      )}
                    </div>

                    <h2 className="break-words text-lg font-semibold">
                      {getDisplayTitle(item)}
                    </h2>

                    {isBulkLot && lotName && lotName !== getDisplayTitle(item) && (
                      <p className="mt-1 text-sm text-neutral-600">
                        Lot Name: {lotName}
                      </p>
                    )}

                    <div className="mt-3 grid gap-2 text-sm text-neutral-600 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <span className="font-medium text-neutral-900">Player:</span>{" "}
                        {item.player || "-"}
                      </div>
                      <div>
                        <span className="font-medium text-neutral-900">Break ID:</span>{" "}
                        {item.break_id || "-"}
                      </div>
                      <div>
                        <span className="font-medium text-neutral-900">Source:</span>{" "}
                        {item.source || "-"}
                      </div>
                      <div>
                        <span className="font-medium text-neutral-900">
                          Acquired:
                        </span>{" "}
                        {formatDate(item.acquired_date)}
                      </div>
                    </div>

                    {isBulkLot && (
                      <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-3 text-sm">
                        <div className="grid gap-2 md:grid-cols-3">
                          <div>
                            <span className="font-medium text-neutral-900">
                              Child Items:
                            </span>{" "}
                            {itemCount || item.quantity || 0}
                          </div>
                          <div>
                            <span className="font-medium text-neutral-900">
                              Lot Cost:
                            </span>{" "}
                            {money(item.cost)}
                          </div>
                          <div>
                            <span className="font-medium text-neutral-900">
                              Lot Est. Value:
                            </span>{" "}
                            {money(item.estimated_value)}
                          </div>
                        </div>
                      </div>
                    )}

                    {!isBulkLot && (
                      <div className="mt-4 grid gap-2 text-sm md:grid-cols-3 xl:grid-cols-6">
                        <div className="rounded-xl bg-neutral-50 p-3">
                          <div className="text-neutral-500">Qty</div>
                          <div className="font-semibold">{item.quantity ?? 0}</div>
                        </div>
                        <div className="rounded-xl bg-neutral-50 p-3">
                          <div className="text-neutral-500">Unit Cost</div>
                          <div className="font-semibold">{money(item.unit_cost)}</div>
                        </div>
                        <div className="rounded-xl bg-neutral-50 p-3">
                          <div className="text-neutral-500">Total Cost</div>
                          <div className="font-semibold">{money(item.cost)}</div>
                        </div>
                        <div className="rounded-xl bg-neutral-50 p-3">
                          <div className="text-neutral-500">Est. Value</div>
                          <div className="font-semibold">
                            {money(item.estimated_value)}
                          </div>
                        </div>
                        <div className="rounded-xl bg-neutral-50 p-3">
                          <div className="text-neutral-500">Brand / Set</div>
                          <div className="font-semibold">
                            {compactText(item.brand, item.set_name) || "-"}
                          </div>
                        </div>
                        <div className="rounded-xl bg-neutral-50 p-3">
                          <div className="text-neutral-500">Card #</div>
                          <div className="font-semibold">{item.card_number || "-"}</div>
                        </div>
                      </div>
                    )}

                    {!!item.notes && (
                      <div className="mt-4">
                        <div className="mb-1 text-sm font-medium text-neutral-900">
                          Notes
                        </div>
                        <div className="whitespace-pre-wrap rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">
                          {item.notes}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-row gap-2 lg:flex-col">
                    <Link
                      href={`/inventory/${item.id}`}
                      className="rounded-xl border px-4 py-2 text-sm"
                    >
                      View Details
                    </Link>

                    <Link
                      href={`/inventory/${item.id}/edit`}
                      className="rounded-xl border px-4 py-2 text-sm"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section className="mt-6 rounded-2xl border bg-neutral-50 p-4 text-sm text-neutral-600">
        Main inventory view hides child rows with status <span className="font-medium">bulk_lot_item</span>.
        Bulk lots stay visible as parent records so the screen does not get cluttered.
      </section>
    </div>
  );
}