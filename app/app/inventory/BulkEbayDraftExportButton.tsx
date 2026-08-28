"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function selectedInventoryIds() {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[data-inventory-bulk-row-checkbox="true"][name="selected_inventory_ids"]:checked',
    ),
  )
    .map((input) => String(input.value || "").trim())
    .filter(Boolean);
}

function filenameFromDisposition(value: string | null) {
  if (!value) return "HITS-eBay-Drafts.csv";

  const quoted = value.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];

  const plain = value.match(/filename=([^;]+)/i);
  return plain?.[1]?.trim() || "HITS-eBay-Drafts.csv";
}

export default function BulkEbayDraftExportButton() {
  const router = useRouter();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    if (isExporting) return;

    const inventoryIds = selectedInventoryIds();

    if (inventoryIds.length === 0) {
      setError("Select at least one inventory item first.");
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      const response = await fetch("/app/inventory/ebay-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          inventoryIds,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.error || "Unable to create the eBay draft export.",
        );
      }

      const blob = await response.blob();
      const filename = filenameFromDisposition(
        response.headers.get("content-disposition"),
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      router.refresh();
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Unable to create the eBay draft export.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={handleExport}
        disabled={isExporting}
        className="app-button whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
        title="Export selected inventory items to one eBay Seller Hub draft CSV"
      >
        {isExporting ? "Exporting eBay Drafts..." : "Export eBay Drafts"}
      </button>

      {error ? (
        <div className="mt-1 max-w-64 text-[11px] text-red-300">{error}</div>
      ) : null}
    </div>
  );
}
