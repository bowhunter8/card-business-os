"use client";

import { useMemo, useState } from "react";
import ChecklistUploadPanel from "../checklists/ChecklistUploadPanel";

type SearchResult = {
  id: string;
  sport: string | null;
  year: number | null;
  brand: string | null;
  set_name: string | null;
  subset: string | null;
  player_name: string | null;
  card_number: string | null;
  team: string | null;
  variation: string | null;
  parallel: string | null;
  rookie_flag: boolean | null;
  autograph_flag: boolean | null;
  relic_flag: boolean | null;
  serial_numbered: boolean | null;
  score: number;
  reasons: string[];
};

type QueueItem = SearchResult & {
  localNotes?: string;
};

export default function FastEntryPage() {
  const [sport, setSport] = useState("baseball");
  const [year, setYear] = useState("");
  const [setName, setSetName] = useState("");
  const [team, setTeam] = useState("");
  const [breakId, setBreakId] = useState("");
  const [purchaseId, setPurchaseId] = useState("");
  const [breaker, setBreaker] = useState("");
  const [purchasePlatform, setPurchasePlatform] = useState("");
  const [acquiredDate, setAcquiredDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [breakCost, setBreakCost] = useState("");
  const [shipping, setShipping] = useState("");
  const [tax, setTax] = useState("");
  const [quickInput, setQuickInput] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const lockedSummary = useMemo(() => {
    return [
      breakId ? `Break: ${breakId}` : null,
      purchaseId ? `Order: ${purchaseId}` : null,
      breaker ? `Breaker: ${breaker}` : null,
      purchasePlatform ? `Platform: ${purchasePlatform}` : null,
      acquiredDate ? `Date: ${acquiredDate}` : null,
      year ? `Year: ${year}` : null,
      setName ? `Set: ${setName}` : null,
      team ? `Team/Spot: ${team}` : null,
    ]
      .filter(Boolean)
      .join(" • ");
  }, [breakId, purchaseId, breaker, purchasePlatform, acquiredDate, year, setName, team]);

  async function runSearch(queryText: string) {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/checklists/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: queryText,
          sport,
          year: year ? Number(year) : null,
          set: setName || null,
          team: team || null,
          limit: 15,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        setResults([]);
        setMessage(data.error || "Search failed");
        return;
      }

      setResults(data.results || []);
      if (!data.results?.length) {
        setMessage("No matches found.");
      }
    } catch {
      setResults([]);
      setMessage("Search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickSearch() {
    if (!quickInput.trim()) return;
    await runSearch(quickInput.trim());
  }

  async function handleBulkMatch() {
    const lines = bulkInput
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    if (!lines.length) return;

    setBulkLoading(true);
    setMessage("");

    try {
      const matched: SearchResult[] = [];

      for (const line of lines) {
        const res = await fetch("/api/checklists/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: line,
            sport,
            year: year ? Number(year) : null,
            set: setName || null,
            team: team || null,
            limit: 1,
          }),
        });

        const data = await res.json();
        if (data.ok && data.results?.[0]) {
          matched.push(data.results[0]);
        }
      }

      if (!matched.length) {
        setMessage("No bulk matches found.");
        return;
      }

      setQueue((prev) => {
        const map = new Map<string, QueueItem>();
        [...prev, ...matched].forEach((item) => map.set(item.id, item));
        return [...map.values()];
      });

      setMessage(`Added ${matched.length} matched card(s) to queue.`);
    } catch {
      setMessage("Bulk match failed.");
    } finally {
      setBulkLoading(false);
    }
  }

  function addToQueue(card: SearchResult) {
    setQueue((prev) => {
      if (prev.some((x) => x.id === card.id)) return prev;
      return [...prev, card];
    });
    setQuickInput("");
    setResults([]);
    setMessage(`Added ${card.player_name} to queue.`);
  }

  function removeFromQueue(id: string) {
    setQueue((prev) => prev.filter((x) => x.id !== id));
  }

  async function saveQueue() {
    if (!queue.length) return;
    if (!breakId.trim()) {
      setMessage("Break ID is required before saving.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/cards/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          breaker,
          purchase_platform: purchasePlatform,
          break_cost: breakCost ? Number(breakCost) : null,
          shipping: shipping ? Number(shipping) : null,
          tax: tax ? Number(tax) : null,
          acquired_date: acquiredDate || null,
          product:
            [year || null, setName || null].filter(Boolean).join(" ") || null,
          team_spot: team || null,
          items: queue.map((item) => ({
            checklist_card_id: item.id,
            break_id: breakId || null,
            purchase_id: purchaseId || null,
            year: item.year,
            brand: item.brand,
            set_name: item.set_name,
            subset: item.subset,
            player_name: item.player_name,
            card_number: item.card_number,
            team: item.team,
            variation: item.variation,
            parallel: item.parallel,
            notes: item.localNotes || null,
          })),
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        setMessage(data.error || "Save failed");
        return;
      }

      setMessage(`Saved ${data.insertedCount} card(s) to app records.`);
      setQueue([]);
      setBulkInput("");
      setResults([]);
      setQuickInput("");
    } catch {
      setMessage("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Fast Break Entry</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Save cards into workbook-shaped app records first, then sync safely to Excel later.
          </p>
        </div>

        <div className="mb-6">
          <ChecklistUploadPanel mode="compact" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-4 text-lg font-semibold">Locked Context</h2>

            <div className="grid gap-3">
              <div>
                <label className="mb-1 block text-sm text-neutral-300">Break ID</label>
                <input
                  value={breakId}
                  onChange={(e) => setBreakId(e.target.value)}
                  placeholder="B003"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Order #</label>
                <input
                  value={purchaseId}
                  onChange={(e) => setPurchaseId(e.target.value)}
                  placeholder="Whatnot / eBay order #"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Acquired Date</label>
                <input
                  type="date"
                  value={acquiredDate}
                  onChange={(e) => setAcquiredDate(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Breaker</label>
                <input
                  value={breaker}
                  onChange={(e) => setBreaker(e.target.value)}
                  placeholder="dcvsports / ericbcards"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Purchase Platform</label>
                <input
                  value={purchasePlatform}
                  onChange={(e) => setPurchasePlatform(e.target.value)}
                  placeholder="Whatnot / eBay"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-sm text-neutral-300">Break Cost</label>
                  <input
                    value={breakCost}
                    onChange={(e) => setBreakCost(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-neutral-300">Shipping</label>
                  <input
                    value={shipping}
                    onChange={(e) => setShipping(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-neutral-300">Tax</label>
                  <input
                    value={tax}
                    onChange={(e) => setTax(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Sport</label>
                <select
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                >
                  <option value="baseball">Baseball</option>
                  <option value="basketball">Basketball</option>
                  <option value="football">Football</option>
                  <option value="hockey">Hockey</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Year</label>
                <input
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2025"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Set</label>
                <input
                  value={setName}
                  onChange={(e) => setSetName(e.target.value)}
                  placeholder="Topps Chrome"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Team/Spot</label>
                <input
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  placeholder="Reds / Mariners"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
                />
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-neutral-950 p-3 text-sm text-neutral-400">
              {lockedSummary || "Nothing locked yet."}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 lg:col-span-2">
            <h2 className="mb-4 text-lg font-semibold">Quick Search</h2>

            <div className="flex gap-3">
              <input
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleQuickSearch();
                }}
                placeholder="elly 44 / gunnar rc / judge pink"
                className="flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
              />
              <button
                onClick={handleQuickSearch}
                disabled={loading}
                className="rounded-xl bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
              >
                {loading ? "Searching..." : "Search"}
              </button>
            </div>

            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-neutral-300">Bulk Paste Mode</h3>
              <textarea
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder={`Elly De La Cruz 44\nSpencer Steer 120\nJonathan India 88`}
                className="min-h-[140px] w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2"
              />
              <div className="mt-3">
                <button
                  onClick={handleBulkMatch}
                  disabled={bulkLoading}
                  className="rounded-xl border border-neutral-700 px-4 py-2 text-sm disabled:opacity-50"
                >
                  {bulkLoading ? "Matching..." : "Match Bulk Lines"}
                </button>
              </div>
            </div>

            {message ? (
              <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-300">
                {message}
              </div>
            ) : null}

            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-neutral-300">Results</h3>

              <div className="space-y-3">
                {results.map((card) => (
                  <div
                    key={card.id}
                    className="flex items-start justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4"
                  >
                    <div>
                      <div className="text-base font-semibold">
                        {card.player_name || "Unknown Player"}
                      </div>
                      <div className="mt-1 text-sm text-neutral-400">
                        {[card.year, card.brand, card.set_name, card.subset]
                          .filter(Boolean)
                          .join(" • ")}
                      </div>
                      <div className="mt-1 text-sm text-neutral-400">
                        {[
                          card.card_number ? `#${card.card_number}` : null,
                          card.team,
                          card.parallel,
                          card.variation,
                        ]
                          .filter(Boolean)
                          .join(" • ")}
                      </div>
                    </div>

                    <button
                      onClick={() => addToQueue(card)}
                      className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black"
                    >
                      Add
                    </button>
                  </div>
                ))}

                {!results.length ? (
                  <div className="rounded-xl border border-dashed border-neutral-800 p-6 text-sm text-neutral-500">
                    Search results will appear here.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Queue</h2>
            <button
              onClick={saveQueue}
              disabled={saving || !queue.length}
              className="rounded-xl bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
            >
              {saving ? "Saving..." : `Save ${queue.length} Card(s)`}
            </button>
          </div>

          <div className="space-y-3">
            {queue.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold">{item.player_name}</div>
                    <div className="mt-1 text-sm text-neutral-400">
                      {[item.year, item.brand, item.set_name, item.subset]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                    <div className="mt-1 text-sm text-neutral-400">
                      {[
                        item.card_number ? `#${item.card_number}` : null,
                        item.team,
                        item.parallel,
                        item.variation,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  </div>

                  <button
                    onClick={() => removeFromQueue(item.id)}
                    className="rounded-xl border border-neutral-700 px-3 py-1 text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}

            {!queue.length ? (
              <div className="rounded-xl border border-dashed border-neutral-800 p-6 text-sm text-neutral-500">
                Added cards will appear here before saving.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}