"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type InventoryItem = {
  id: string;
  status?: string;
  title?: string;
  cost?: number;
  estimated_value?: number;
  notes?: string;
};

type Sale = {
  id: string;
  inventory_item_id?: string;
  net_revenue?: number;
  realized_profit?: number;
};

function n(v: unknown) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function money(v: unknown) {
  return `$${n(v).toFixed(2)}`;
}

function percent(v: number) {
  return `${v.toFixed(1)}%`;
}

function getParentId(notes?: string) {
  if (!notes) return "";
  const m = notes.match(/Parent Bulk Lot ID:\s*([^\n\r]+)/i);
  return m?.[1]?.trim() ?? "";
}

function getSourceId(notes?: string) {
  if (!notes) return "";
  const m = notes.match(/Bulk Source Parent ID:\s*([^\n\r]+)/i);
  return m?.[1]?.trim() ?? "";
}

export default function ROIPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const [invRes, salesRes] = await Promise.all([
      fetch("/api/inventory"),
      fetch("/api/sales"),
    ]);

    const inv = await invRes.json();
    const s = await salesRes.json();

    setItems(inv.items || []);
    setSales(s.sales || []);

    setLoading(false);
  }

  const item = items.find((i) => String(i.id) === String(id));

  const liveChildren = items.filter(
    (i) => i.status === "bulk_lot_item" && getParentId(i.notes) === String(id)
  );

  const allLotItems = items.filter(
    (i) =>
      getParentId(i.notes) === String(id) ||
      getSourceId(i.notes) === String(id)
  );

  const extracted = allLotItems.filter((i) => i.status !== "bulk_lot_item");
  const soldItems = extracted.filter((i) => i.status === "sold");

  const relatedSales = sales.filter((s) =>
    soldItems.some((i) => String(i.id) === String(s.inventory_item_id))
  );

  const originalCost = allLotItems.reduce((s, i) => s + n(i.cost), 0);
  const remainingCost = liveChildren.reduce((s, i) => s + n(i.cost), 0);
  const extractedCost = extracted.reduce((s, i) => s + n(i.cost), 0);

  const realizedRevenue = relatedSales.reduce(
    (s, sale) => s + n(sale.net_revenue),
    0
  );

  const realizedProfit = relatedSales.reduce(
    (s, sale) => s + n(sale.realized_profit),
    0
  );

  const remainingValue = liveChildren.reduce(
    (s, i) => s + n(i.estimated_value),
    0
  );

  const projectedTotalValue = realizedRevenue + remainingValue;
  const projectedProfit = projectedTotalValue - originalCost;

  const realizedROI =
    originalCost > 0 ? (realizedProfit / originalCost) * 100 : 0;

  const projectedROI =
    originalCost > 0 ? (projectedProfit / originalCost) * 100 : 0;

  if (loading) return <div className="p-6">Loading...</div>;
  if (!item) return <div className="p-6">Not found</div>;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex flex-wrap gap-2">
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

      <Link href={`/inventory/${id}`} className="text-sm underline">
        ← Back to Lot
      </Link>

      <h1 className="mt-4 text-2xl font-bold">{item.title} - ROI</h1>

      <h2 className="mt-6 mb-2 text-lg font-semibold">Real Performance</h2>
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Card label="Original Cost" value={money(originalCost)} />
        <Card label="Real Revenue" value={money(realizedRevenue)} />
        <Card label="Real Profit" value={money(realizedProfit)} />
        <Card label="Real ROI" value={percent(realizedROI)} />
      </div>

      <h2 className="mt-8 mb-2 text-lg font-semibold">Projected (With Unsold)</h2>
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Card label="Remaining Value" value={money(remainingValue)} />
        <Card label="Projected Total Value" value={money(projectedTotalValue)} />
        <Card label="Projected Profit" value={money(projectedProfit)} />
        <Card label="Projected ROI" value={percent(projectedROI)} />
      </div>

      <h2 className="mt-8 mb-2 text-lg font-semibold">Cost Flow</h2>
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Card label="Remaining Cost" value={money(remainingCost)} />
        <Card label="Extracted Cost" value={money(extractedCost)} />
      </div>

      <h2 className="mt-8 mb-2 text-lg font-semibold">Breakdown</h2>
      <div className="grid grid-cols-4 gap-4">
        <Card label="Live Items" value={liveChildren.length} />
        <Card label="Extracted" value={extracted.length} />
        <Card label="Sold Items" value={soldItems.length} />
        <Card label="Sales Records" value={relatedSales.length} />
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: any }) {
  return (
    <div className="border rounded p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}