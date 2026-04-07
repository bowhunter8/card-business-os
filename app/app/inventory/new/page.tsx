"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type InventoryStatus =
  | "inventory"
  | "listed"
  | "sold"
  | "keep"
  | "personal"
  | "donation"
  | "bulk_lot";

type EntryMode = "single_card" | "bulk_lot";

type BulkLotItem = {
  id: string;
  player: string;
  cardNumber: string;
  year: string;
  brand: string;
  setName: string;
  parallel: string;
  rookie: boolean;
  notes: string;
  estimatedValue: string;
};

type FormState = {
  entryMode: EntryMode;

  // core inventory fields
  title: string;
  player: string;
  year: string;
  brand: string;
  setName: string;
  cardNumber: string;
  team: string;
  parallel: string;
  variation: string;
  rookie: boolean;
  autograph: boolean;
  relic: boolean;
  serialNumber: string;
  grade: string;

  quantity: string;
  unitCost: string;
  estimatedValue: string;
  source: string;
  breakId: string;
  acquiredDate: string;
  notes: string;

  // bulk lot fields
  lotName: string;
  lotDescription: string;
};

const EMPTY_BULK_ITEM: BulkLotItem = {
  id: "",
  player: "",
  cardNumber: "",
  year: "",
  brand: "",
  setName: "",
  parallel: "",
  rookie: false,
  notes: "",
  estimatedValue: "",
};

function createBulkItem(): BulkLotItem {
  return {
    ...EMPTY_BULK_ITEM,
    id: crypto.randomUUID(),
  };
}

function asNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return value.toFixed(2);
}

export default function NewInventoryPage() {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  const [form, setForm] = useState<FormState>({
    entryMode: "single_card",

    title: "",
    player: "",
    year: "",
    brand: "",
    setName: "",
    cardNumber: "",
    team: "",
    parallel: "",
    variation: "",
    rookie: false,
    autograph: false,
    relic: false,
    serialNumber: "",
    grade: "",

    quantity: "1",
    unitCost: "0",
    estimatedValue: "0",
    source: "",
    breakId: "",
    acquiredDate: new Date().toISOString().slice(0, 10),
    notes: "",

    lotName: "",
    lotDescription: "",
  });

  const [bulkItems, setBulkItems] = useState<BulkLotItem[]>([createBulkItem()]);

  const isBulkLot = form.entryMode === "bulk_lot";

  const quantityNumber = useMemo(() => {
    if (isBulkLot) return bulkItems.length;
    return Math.max(1, Math.floor(asNumber(form.quantity) || 1));
  }, [isBulkLot, form.quantity, bulkItems.length]);

  const totalCost = useMemo(() => {
    return asNumber(form.unitCost) * quantityNumber;
  }, [form.unitCost, quantityNumber]);

  const totalEstimatedValue = useMemo(() => {
    if (!isBulkLot) {
      return asNumber(form.estimatedValue) * quantityNumber;
    }

    const itemTotal = bulkItems.reduce((sum, item) => {
      return sum + asNumber(item.estimatedValue);
    }, 0);

    return itemTotal;
  }, [isBulkLot, form.estimatedValue, quantityNumber, bulkItems]);

  const bulkEstimatedPerCard = useMemo(() => {
    if (!isBulkLot || bulkItems.length === 0) return 0;
    return totalEstimatedValue / bulkItems.length;
  }, [isBulkLot, totalEstimatedValue, bulkItems.length]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateBulkItem(id: string, patch: Partial<BulkLotItem>) {
    setBulkItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function addBulkItem() {
    setBulkItems((prev) => [...prev, createBulkItem()]);
  }

  function duplicateBulkItem(id: string) {
    const source = bulkItems.find((item) => item.id === id);
    if (!source) return;

    setBulkItems((prev) => [
      ...prev,
      {
        ...source,
        id: crypto.randomUUID(),
      },
    ]);
  }

  function removeBulkItem(id: string) {
    setBulkItems((prev) => {
      if (prev.length <= 1) {
        return [createBulkItem()];
      }
      return prev.filter((item) => item.id !== id);
    });
  }

  function clearBulkItems() {
    setBulkItems([createBulkItem()]);
  }

  function autoFillTitleForSingleCard() {
    const parts = [
      form.year,
      form.brand,
      form.setName,
      form.player,
      form.cardNumber ? `#${form.cardNumber}` : "",
      form.parallel,
      form.variation,
    ]
      .map((v) => v.trim())
      .filter(Boolean);

    updateForm("title", parts.join(" "));
  }

  function autoFillTitleForLot() {
    const parts = [
      form.lotName || "Bulk Lot",
      form.year,
      form.brand,
      form.setName,
    ]
      .map((v) => v.trim())
      .filter(Boolean);

    updateForm("title", parts.join(" - "));
  }

  function validate(): string | null {
    if (isBulkLot) {
      if (!form.lotName.trim()) {
        return "Bulk lot name is required.";
      }

      if (bulkItems.length === 0) {
        return "Add at least one item to the bulk lot.";
      }

      const hasAnyFilledItem = bulkItems.some(
        (item) =>
          item.player.trim() ||
          item.cardNumber.trim() ||
          item.year.trim() ||
          item.brand.trim() ||
          item.setName.trim() ||
          item.parallel.trim() ||
          item.notes.trim() ||
          item.estimatedValue.trim()
      );

      if (!hasAnyFilledItem) {
        return "Enter at least one card/item inside the bulk lot.";
      }
    } else {
      if (!form.player.trim() && !form.title.trim()) {
        return "Enter either a title or a player name.";
      }
    }

    if (quantityNumber < 1) {
      return "Quantity must be at least 1.";
    }

    if (asNumber(form.unitCost) < 0) {
      return "Unit cost cannot be negative.";
    }

    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    try {
      const payload = {
        entryMode: form.entryMode,
        status: isBulkLot ? ("bulk_lot" as InventoryStatus) : ("inventory" as InventoryStatus),

        title: form.title.trim(),
        player: form.player.trim(),
        year: form.year.trim(),
        brand: form.brand.trim(),
        setName: form.setName.trim(),
        cardNumber: form.cardNumber.trim(),
        team: form.team.trim(),
        parallel: form.parallel.trim(),
        variation: form.variation.trim(),
        rookie: form.rookie,
        autograph: form.autograph,
        relic: form.relic,
        serialNumber: form.serialNumber.trim(),
        grade: form.grade.trim(),

        quantity: quantityNumber,
        unitCost: asNumber(form.unitCost),
        totalCost,
        estimatedValue: isBulkLot ? totalEstimatedValue : asNumber(form.estimatedValue),
        source: form.source.trim(),
        breakId: form.breakId.trim(),
        acquiredDate: form.acquiredDate,
        notes: form.notes.trim(),

        bulkLot: isBulkLot
          ? {
              lotName: form.lotName.trim(),
              lotDescription: form.lotDescription.trim(),
              itemCount: bulkItems.length,
              estimatedTotalValue: totalEstimatedValue,
              items: bulkItems
                .filter(
                  (item) =>
                    item.player.trim() ||
                    item.cardNumber.trim() ||
                    item.year.trim() ||
                    item.brand.trim() ||
                    item.setName.trim() ||
                    item.parallel.trim() ||
                    item.notes.trim() ||
                    item.estimatedValue.trim()
                )
                .map((item) => ({
                  player: item.player.trim(),
                  cardNumber: item.cardNumber.trim(),
                  year: item.year.trim(),
                  brand: item.brand.trim(),
                  setName: item.setName.trim(),
                  parallel: item.parallel.trim(),
                  rookie: item.rookie,
                  notes: item.notes.trim(),
                  estimatedValue: asNumber(item.estimatedValue),
                })),
            }
          : null,
      };

      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Failed to save inventory item.");
      }

      setSuccess(isBulkLot ? "Bulk lot created." : "Inventory item created.");

      router.push("/inventory");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">New Inventory Entry</h1>
        <p className="text-sm text-neutral-600">
          Add a single card or create a bulk lot with child items.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Entry Mode</label>
              <select
                className="w-full rounded-xl border px-3 py-2"
                value={form.entryMode}
                onChange={(e) =>
                  updateForm("entryMode", e.target.value as EntryMode)
                }
              >
                <option value="single_card">Single Card</option>
                <option value="bulk_lot">Bulk Lot</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Acquired Date
              </label>
              <input
                type="date"
                className="w-full rounded-xl border px-3 py-2"
                value={form.acquiredDate}
                onChange={(e) => updateForm("acquiredDate", e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Source</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.source}
                onChange={(e) => updateForm("source", e.target.value)}
                placeholder="Break, eBay, trade, giveaway, etc."
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Break ID</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={form.breakId}
                onChange={(e) => updateForm("breakId", e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Unit Cost</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full rounded-xl border px-3 py-2"
                value={form.unitCost}
                onChange={(e) => updateForm("unitCost", e.target.value)}
              />
            </div>

            {!isBulkLot ? (
              <div>
                <label className="mb-1 block text-sm font-medium">Quantity</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.quantity}
                  onChange={(e) => updateForm("quantity", e.target.value)}
                />
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Lot Quantity
                </label>
                <input
                  className="w-full rounded-xl border bg-neutral-50 px-3 py-2"
                  value={bulkItems.length}
                  readOnly
                />
              </div>
            )}
          </div>
        </section>

        {!isBulkLot ? (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Single Card Details</h2>
              <button
                type="button"
                onClick={autoFillTitleForSingleCard}
                className="rounded-xl border px-3 py-2 text-sm"
              >
                Auto Fill Title
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-3">
                <label className="mb-1 block text-sm font-medium">Title</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.title}
                  onChange={(e) => updateForm("title", e.target.value)}
                  placeholder="Optional display title"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Player</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.player}
                  onChange={(e) => updateForm("player", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Year</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.year}
                  onChange={(e) => updateForm("year", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Brand</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.brand}
                  onChange={(e) => updateForm("brand", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Set Name</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.setName}
                  onChange={(e) => updateForm("setName", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Card Number
                </label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.cardNumber}
                  onChange={(e) => updateForm("cardNumber", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Team</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.team}
                  onChange={(e) => updateForm("team", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Parallel</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.parallel}
                  onChange={(e) => updateForm("parallel", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Variation</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.variation}
                  onChange={(e) => updateForm("variation", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Serial Number
                </label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.serialNumber}
                  onChange={(e) => updateForm("serialNumber", e.target.value)}
                  placeholder="e.g. 12/50"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Grade</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.grade}
                  onChange={(e) => updateForm("grade", e.target.value)}
                  placeholder="Raw, PSA 10, etc."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Est. Value
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.estimatedValue}
                  onChange={(e) => updateForm("estimatedValue", e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <label className="flex items-center gap-2 rounded-xl border p-3">
                <input
                  type="checkbox"
                  checked={form.rookie}
                  onChange={(e) => updateForm("rookie", e.target.checked)}
                />
                <span className="text-sm">Rookie</span>
              </label>

              <label className="flex items-center gap-2 rounded-xl border p-3">
                <input
                  type="checkbox"
                  checked={form.autograph}
                  onChange={(e) => updateForm("autograph", e.target.checked)}
                />
                <span className="text-sm">Autograph</span>
              </label>

              <label className="flex items-center gap-2 rounded-xl border p-3">
                <input
                  type="checkbox"
                  checked={form.relic}
                  onChange={(e) => updateForm("relic", e.target.checked)}
                />
                <span className="text-sm">Relic</span>
              </label>
            </div>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Bulk Lot Details</h2>
                <button
                  type="button"
                  onClick={autoFillTitleForLot}
                  className="rounded-xl border px-3 py-2 text-sm"
                >
                  Auto Fill Title
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium">Lot Name</label>
                  <input
                    className="w-full rounded-xl border px-3 py-2"
                    value={form.lotName}
                    onChange={(e) => updateForm("lotName", e.target.value)}
                    placeholder="Example: 2026 Heritage Commons Lot"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Title</label>
                  <input
                    className="w-full rounded-xl border px-3 py-2"
                    value={form.title}
                    onChange={(e) => updateForm("title", e.target.value)}
                    placeholder="Display title"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Year</label>
                  <input
                    className="w-full rounded-xl border px-3 py-2"
                    value={form.year}
                    onChange={(e) => updateForm("year", e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Brand</label>
                  <input
                    className="w-full rounded-xl border px-3 py-2"
                    value={form.brand}
                    onChange={(e) => updateForm("brand", e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Set Name</label>
                  <input
                    className="w-full rounded-xl border px-3 py-2"
                    value={form.setName}
                    onChange={(e) => updateForm("setName", e.target.value)}
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="mb-1 block text-sm font-medium">
                    Lot Description / Notes
                  </label>
                  <textarea
                    className="min-h-[96px] w-full rounded-xl border px-3 py-2"
                    value={form.lotDescription}
                    onChange={(e) => updateForm("lotDescription", e.target.value)}
                    placeholder="Example: Commons from Break B041, grouped for kid lots or donation review later."
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Bulk Lot Items</h2>
                  <p className="text-sm text-neutral-600">
                    These child items stay tied to the lot for future splitting,
                    selling, or donation handling.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={addBulkItem}
                    className="rounded-xl border px-3 py-2 text-sm"
                  >
                    Add Item
                  </button>
                  <button
                    type="button"
                    onClick={clearBulkItems}
                    className="rounded-xl border px-3 py-2 text-sm"
                  >
                    Reset Items
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {bulkItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-neutral-200 p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-medium">Item #{index + 1}</h3>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => duplicateBulkItem(item.id)}
                          className="rounded-xl border px-3 py-1.5 text-sm"
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => removeBulkItem(item.id)}
                          className="rounded-xl border px-3 py-1.5 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Player
                        </label>
                        <input
                          className="w-full rounded-xl border px-3 py-2"
                          value={item.player}
                          onChange={(e) =>
                            updateBulkItem(item.id, { player: e.target.value })
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Card #
                        </label>
                        <input
                          className="w-full rounded-xl border px-3 py-2"
                          value={item.cardNumber}
                          onChange={(e) =>
                            updateBulkItem(item.id, {
                              cardNumber: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Year
                        </label>
                        <input
                          className="w-full rounded-xl border px-3 py-2"
                          value={item.year}
                          onChange={(e) =>
                            updateBulkItem(item.id, { year: e.target.value })
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Est. Value
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-xl border px-3 py-2"
                          value={item.estimatedValue}
                          onChange={(e) =>
                            updateBulkItem(item.id, {
                              estimatedValue: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Brand
                        </label>
                        <input
                          className="w-full rounded-xl border px-3 py-2"
                          value={item.brand}
                          onChange={(e) =>
                            updateBulkItem(item.id, { brand: e.target.value })
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Set Name
                        </label>
                        <input
                          className="w-full rounded-xl border px-3 py-2"
                          value={item.setName}
                          onChange={(e) =>
                            updateBulkItem(item.id, { setName: e.target.value })
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Parallel
                        </label>
                        <input
                          className="w-full rounded-xl border px-3 py-2"
                          value={item.parallel}
                          onChange={(e) =>
                            updateBulkItem(item.id, { parallel: e.target.value })
                          }
                        />
                      </div>

                      <label className="flex items-center gap-2 rounded-xl border px-3 py-2">
                        <input
                          type="checkbox"
                          checked={item.rookie}
                          onChange={(e) =>
                            updateBulkItem(item.id, { rookie: e.target.checked })
                          }
                        />
                        <span className="text-sm">Rookie</span>
                      </label>

                      <div className="md:col-span-4">
                        <label className="mb-1 block text-sm font-medium">
                          Notes
                        </label>
                        <input
                          className="w-full rounded-xl border px-3 py-2"
                          value={item.notes}
                          onChange={(e) =>
                            updateBulkItem(item.id, { notes: e.target.value })
                          }
                          placeholder="Condition, insert type, grouping note, etc."
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">General Notes</h2>
          <textarea
            className="min-h-[120px] w-full rounded-xl border px-3 py-2"
            value={form.notes}
            onChange={(e) => updateForm("notes", e.target.value)}
            placeholder="Optional notes for this entry"
          />
        </section>

        <section className="rounded-2xl border bg-neutral-50 p-5">
          <h2 className="mb-4 text-lg font-semibold">Summary</h2>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-neutral-500">Mode</div>
              <div className="mt-1 font-semibold">
                {isBulkLot ? "Bulk Lot" : "Single Card"}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-neutral-500">Quantity</div>
              <div className="mt-1 font-semibold">{quantityNumber}</div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-neutral-500">Total Cost</div>
              <div className="mt-1 font-semibold">${money(totalCost)}</div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-neutral-500">Estimated Value</div>
              <div className="mt-1 font-semibold">
                ${money(totalEstimatedValue)}
              </div>
            </div>
          </div>

          {isBulkLot && (
            <div className="mt-4 rounded-2xl border bg-white p-4 text-sm">
              <div>
                Child items: <span className="font-semibold">{bulkItems.length}</span>
              </div>
              <div className="mt-1">
                Avg est. value per item:{" "}
                <span className="font-semibold">
                  ${money(bulkEstimatedPerCard)}
                </span>
              </div>
              <div className="mt-1 text-neutral-600">
                Parent record will save as a bulk lot, with child items included in
                the POST payload for backend creation.
              </div>
            </div>
          )}

          {!!error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!!success && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {success}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : isBulkLot
                ? "Create Bulk Lot"
                : "Create Inventory Item"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/inventory")}
              className="rounded-xl border px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}