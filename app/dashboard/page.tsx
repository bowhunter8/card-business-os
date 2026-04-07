"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type InventoryItem = {
  id: string;
  status?: string;
  entry_mode?: string;
  title?: string;
  player?: string;
  year?: string;
  brand?: string;
  set_name?: string;
  card_number?: string;
  cost?: number;
  estimated_value?: number;
  break_id?: string | null;
  acquired_date?: string | null;
  created_at?: string;
};

type Sale = {
  id: string;
  created_at?: string;
  inventory_item_id?: string | null;
  title?: string;
  sold_date?: string | null;
  sale_price?: number;
  allocated_cost?: number;
  net_revenue?: number;
  realized_profit?: number;
  platform?: string;
  buyer?: string;
};

function safeNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function money(value: unknown): string {
  return `$${safeNumber(value).toFixed(2)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function getInventoryTitle(item: InventoryItem): string {
  const explicit = (item.title ?? "").trim();
  if (explicit) return explicit;

  return (
    [
      item.year,
      item.brand,
      item.set_name,
      item.player,
      item.card_number ? `#${item.card_number}` : "",
    ]
      .map((v) => (v ?? "").trim())
      .filter(Boolean)
      .join(" ") || "Untitled Item"
  );
}

function getSaleTitle(sale: Sale): string {
  return (sale.title ?? "").trim() || "Sale";
}

function getProfitTone(value: number): string {
  if (value > 0) return "text-green-700";
  if (value < 0) return "text-red-700";
  return "text-neutral-700";
}

export default function DashboardPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const [inventoryRes, salesRes] = await Promise.all([
          fetch("/api/inventory", { cache: "no-store" }),
          fetch("/api/sales", { cache: "no-store" }),
        ]);

        const inventoryData = await inventoryRes.json().catch(() => null);
        const salesData = await salesRes.json().catch(() => null);

        if (!inventoryRes.ok) {
          throw new Error(inventoryData?.error || "Failed to load inventory.");
        }

        if (!salesRes.ok) {
          throw new Error(salesData?.error || "Failed to load sales.");
        }

        if (!active) return;

        setInventory(Array.isArray(inventoryData?.items) ? inventoryData.items : []);
        setSales(Array.isArray(salesData?.sales) ? salesData.sales : []);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const mainInventory = inventory.filter((item) => item.status !== "bulk_lot_item");
    const liveSellable = inventory.filter(
      (item) => item.status === "inventory" || item.status === "listed"
    );
    const bulkLots = inventory.filter((item) => item.status === "bulk_lot");
    const soldInventory = inventory.filter((item) => item.status === "sold");
    const listedInventory = inventory.filter((item) => item.status === "listed");
    const donationInventory = inventory.filter((item) => item.status === "donation");

    const totalInventoryCost = mainInventory.reduce(
      (sum, item) => sum + safeNumber(item.cost),
      0
    );

    const totalEstimatedValue = mainInventory.reduce(
      (sum, item) => sum + safeNumber(item.estimated_value),
      0
    );

    const liveInventoryCost = liveSellable.reduce(
      (sum, item) => sum + safeNumber(item.cost),
      0
    );

    const liveInventoryValue = liveSellable.reduce(
      (sum, item) => sum + safeNumber(item.estimated_value),
      0
    );

    const grossSales = sales.reduce((sum, sale) => sum + safeNumber(sale.sale_price), 0);
    const netRevenue = sales.reduce((sum, sale) => sum + safeNumber(sale.net_revenue), 0);
    const realizedProfit = sales.reduce(
      (sum, sale) => sum + safeNumber(sale.realized_profit),
      0
    );
    const allocatedCostSold = sales.reduce(
      (sum, sale) => sum + safeNumber(sale.allocated_cost),
      0
    );

    const realizedRoi =
      allocatedCostSold > 0 ? (realizedProfit / allocatedCostSold) * 100 : 0;

    const projectedBusinessValue = netRevenue + liveInventoryValue;
    const projectedBusinessProfit = projectedBusinessValue - totalInventoryCost;
    const projectedBusinessRoi =
      totalInventoryCost > 0
        ? (projectedBusinessProfit / totalInventoryCost) * 100
        : 0;

    const uniqueBreakIds = new Set(
      inventory
        .map((item) => (item.break_id ?? "").trim())
        .filter(Boolean)
    );

    return {
      inventoryCount: mainInventory.length,
      liveSellableCount: liveSellable.length,
      bulkLotCount: bulkLots.length,
      soldInventoryCount: soldInventory.length,
      listedInventoryCount: listedInventory.length,
      donationCount: donationInventory.length,
      salesCount: sales.length,
      uniqueBreakCount: uniqueBreakIds.size,
      totalInventoryCost,
      totalEstimatedValue,
      liveInventoryCost,
      liveInventoryValue,
      grossSales,
      netRevenue,
      realizedProfit,
      allocatedCostSold,
      realizedRoi,
      projectedBusinessValue,
      projectedBusinessProfit,
      projectedBusinessRoi,
    };
  }, [inventory, sales]);

  const topProfitableSales = useMemo(() => {
    return [...sales]
      .sort((a, b) => safeNumber(b.realized_profit) - safeNumber(a.realized_profit))
      .slice(0, 5);
  }, [sales]);

  const recentSales = useMemo(() => {
    return [...sales]
      .sort((a, b) => {
        const aTime = new Date(a.sold_date || a.created_at || 0).getTime();
        const bTime = new Date(b.sold_date || b.created_at || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 8);
  }, [sales]);

  const recentInventory = useMemo(() => {
    return [...inventory]
      .filter((item) => item.status !== "bulk_lot_item")
      .sort((a, b) => {
        const aTime = new Date(a.created_at || a.acquired_date || 0).getTime();
        const bTime = new Date(b.created_at || b.acquired_date || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 8);
  }, [inventory]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Dashboard
          </Link>
          <Link
            href="/inventory"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Inventory
          </Link>
          <Link
            href="/sales"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Sales
          </Link>
          <Link
            href="/sales/new"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Record Sale
          </Link>
        </div>

        <div className="rounded-2xl border bg-white p-8 text-sm text-neutral-600">
          Loading dashboard...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Dashboard
          </Link>
          <Link
            href="/inventory"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Inventory
          </Link>
          <Link
            href="/sales"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Sales
          </Link>
          <Link
            href="/sales/new"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Record Sale
          </Link>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/dashboard"
          className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium"
        >
          Dashboard
        </Link>
        <Link
          href="/inventory"
          className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium"
        >
          Inventory
        </Link>
        <Link
          href="/sales"
          className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium"
        >
          Sales
        </Link>
        <Link
          href="/sales/new"
          className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium"
        >
          Record Sale
        </Link>
      </div>

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-neutral-600">
            Business snapshot across inventory, bulk lots, and realized sales.
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

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Business Snapshot</h2>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Inventory Items" value={metrics.inventoryCount} />
          <MetricCard label="Live Sellable" value={metrics.liveSellableCount} />
          <MetricCard label="Bulk Lots" value={metrics.bulkLotCount} />
          <MetricCard label="Sales Count" value={metrics.salesCount} />
          <MetricCard label="Sold Items" value={metrics.soldInventoryCount} />
          <MetricCard label="Break IDs" value={metrics.uniqueBreakCount} />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Inventory Value</h2>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total Inventory Cost" value={money(metrics.totalInventoryCost)} />
          <MetricCard label="Total Est. Value" value={money(metrics.totalEstimatedValue)} />
          <MetricCard label="Live Inventory Cost" value={money(metrics.liveInventoryCost)} />
          <MetricCard label="Live Inventory Value" value={money(metrics.liveInventoryValue)} />
          <MetricCard label="Listed Count" value={metrics.listedInventoryCount} />
          <MetricCard label="Donation Count" value={metrics.donationCount} />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Realized Sales Performance</h2>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Gross Sales" value={money(metrics.grossSales)} />
          <MetricCard label="Net Revenue" value={money(metrics.netRevenue)} />
          <MetricCard label="Allocated Cost Sold" value={money(metrics.allocatedCostSold)} />
          <MetricCard
            label="Realized Profit"
            value={money(metrics.realizedProfit)}
            valueClassName={getProfitTone(metrics.realizedProfit)}
          />
          <MetricCard
            label="Realized ROI"
            value={`${metrics.realizedRoi.toFixed(1)}%`}
            valueClassName={getProfitTone(metrics.realizedProfit)}
          />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Projected Business View</h2>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Projected Value" value={money(metrics.projectedBusinessValue)} />
          <MetricCard
            label="Projected Profit"
            value={money(metrics.projectedBusinessProfit)}
            valueClassName={getProfitTone(metrics.projectedBusinessProfit)}
          />
          <MetricCard
            label="Projected ROI"
            value={`${metrics.projectedBusinessRoi.toFixed(1)}%`}
            valueClassName={getProfitTone(metrics.projectedBusinessProfit)}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Top Profitable Sales</h2>
            <Link href="/sales" className="text-sm font-medium underline">
              View all sales
            </Link>
          </div>

          {topProfitableSales.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-sm text-neutral-600">
              No sales yet.
            </div>
          ) : (
            <div className="space-y-3">
              {topProfitableSales.map((sale) => (
                <div
                  key={sale.id}
                  className="rounded-xl border border-neutral-200 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="font-medium">{getSaleTitle(sale)}</div>
                      <div className="mt-1 text-sm text-neutral-600">
                        {formatDate(sale.sold_date)} · {sale.platform || "-"} ·{" "}
                        {sale.buyer || "-"}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`font-semibold ${getProfitTone(safeNumber(sale.realized_profit))}`}>
                        {money(sale.realized_profit)}
                      </div>
                      <div className="text-sm text-neutral-500">
                        Net {money(sale.net_revenue)}
                      </div>
                    </div>
                  </div>

                  {sale.inventory_item_id && (
                    <div className="mt-3">
                      <Link
                        href={`/inventory/${sale.inventory_item_id}`}
                        className="text-sm font-medium underline"
                      >
                        View linked item
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Recent Sales</h2>
            <Link href="/sales/new" className="text-sm font-medium underline">
              Record sale
            </Link>
          </div>

          {recentSales.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-sm text-neutral-600">
              No sales recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentSales.map((sale) => (
                <div
                  key={sale.id}
                  className="rounded-xl border border-neutral-200 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="font-medium">{getSaleTitle(sale)}</div>
                      <div className="mt-1 text-sm text-neutral-600">
                        {formatDate(sale.sold_date)} · {sale.platform || "-"}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`font-semibold ${getProfitTone(safeNumber(sale.realized_profit))}`}>
                        {money(sale.realized_profit)}
                      </div>
                      <div className="text-sm text-neutral-500">
                        Sale {money(sale.sale_price)}
                      </div>
                    </div>
                  </div>

                  {sale.inventory_item_id && (
                    <div className="mt-3">
                      <Link
                        href={`/inventory/${sale.inventory_item_id}`}
                        className="text-sm font-medium underline"
                      >
                        View linked item
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Recent Inventory Activity</h2>
          <Link href="/inventory" className="text-sm font-medium underline">
            View inventory
          </Link>
        </div>

        {recentInventory.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-sm text-neutral-600">
            No inventory items found.
          </div>
        ) : (
          <div className="space-y-3">
            {recentInventory.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-neutral-200 p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="font-medium">{getInventoryTitle(item)}</div>
                    <div className="mt-1 text-sm text-neutral-600">
                      {item.status || "-"} · {item.break_id || "No break ID"} ·{" "}
                      {formatDate(item.acquired_date || item.created_at)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-semibold">{money(item.cost)}</div>
                    <div className="text-sm text-neutral-500">
                      Est. {money(item.estimated_value)}
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <Link
                    href={`/inventory/${item.id}`}
                    className="text-sm font-medium underline"
                  >
                    View item
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${valueClassName}`}>{value}</div>
    </div>
  );
}