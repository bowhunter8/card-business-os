"use client";

import { useState } from "react";

type TaxPdfExportButtonProps = {
  year: number;
  readinessWarnings?: string[];
};

export default function TaxPdfExportButton({
  year,
  readinessWarnings = [],
}: TaxPdfExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [showReadinessReview, setShowReadinessReview] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const warnings = readinessWarnings.filter(
    (warning) => warning.trim().length > 0,
  );

  async function runExport() {
    if (isExporting) return;

    try {
      setIsExporting(true);

      const response = await fetch(`/api/reports/tax/pdf?year=${year}`);

      if (!response.ok) {
        throw new Error(`PDF export failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `tax-summary-${year}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
      setShowReadinessReview(false);
      setAcknowledged(false);
    } catch (error) {
      console.error(error);
      window.alert("PDF export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  function handleExportClick() {
    if (isExporting) return;
    setAcknowledged(false);
    setShowReadinessReview(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleExportClick}
        disabled={isExporting}
        className="app-button disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isExporting ? "Exporting PDF..." : "Export Tax PDF Summary"}
      </button>

      {showReadinessReview && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-4">
          <div className="mx-auto my-6 flex max-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col rounded-2xl border border-sky-700/70 bg-zinc-950 shadow-2xl shadow-black/60">
            <div className="shrink-0 border-b border-sky-900/60 p-5 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-zinc-100">
                    Tax Export Readiness Review
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Review these items before exporting the {year} PDF summary
                    for TurboTax, CPA review, or filing support.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowReadinessReview(false);
                    setAcknowledged(false);
                  }}
                  className="app-button"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div
                className={
                  warnings.length > 0
                    ? "mt-5 rounded-2xl border border-amber-700/70 bg-amber-950/30 p-4 text-sm text-amber-100"
                    : "mt-5 rounded-2xl border border-emerald-700/70 bg-emerald-950/30 p-4 text-sm text-emerald-100"
                }
              >
                {warnings.length > 0 ? (
                  <div>
                    <div className="font-semibold">
                      Review these readiness warnings before exporting:
                    </div>
                    <ul className="mt-3 list-disc space-y-2 pl-5">
                      {warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="font-semibold">
                    No major readiness warnings were detected from the current
                    tracked data. Still review records before filing.
                  </div>
                )}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-sky-800/70 bg-black/30 p-4">
                  <h3 className="font-semibold text-zinc-100">Inventory</h3>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    <li>Beginning inventory has been reviewed.</li>
                    <li>Ending inventory is locked before final filing.</li>
                    <li>Quantities and cost basis have been checked.</li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-sky-800/70 bg-black/30 p-4">
                  <h3 className="font-semibold text-zinc-100">Expenses</h3>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    <li>
                      Shipping, supplies, fees, and other expenses are entered.
                    </li>
                    <li>Uncategorized expenses have been reviewed.</li>
                    <li>
                      Giveaways and disposals include notes when applicable.
                    </li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-sky-800/70 bg-black/30 p-4">
                  <h3 className="font-semibold text-zinc-100">Review</h3>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    <li>This export is bookkeeping and tax support.</li>
                    <li>Keep detailed workbook records and receipts.</li>
                    <li>
                      Final filing treatment should be reviewed before
                      submission.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-sky-800/70 bg-black/30 p-4">
                <h3 className="font-semibold text-zinc-100">
                  Recommended backup records to keep
                </h3>
                <p className="mt-2 text-sm text-zinc-400">
                  Keep these supporting records with your tax export so the
                  numbers can be reviewed later by you, your CPA, or a tax
                  preparer.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <ul className="space-y-2 text-sm text-zinc-300">
                    <li>
                      Marketplace order / purchase exports, including Whatnot
                      purchase reports.
                    </li>
                    <li>
                      Marketplace sales, payout, refund, and cancellation
                      reports when available.
                    </li>
                    <li>
                      Bank, credit card, PayPal, Stripe, or payment processor
                      records.
                    </li>
                    <li>Shipping label, postage, and delivery receipts.</li>
                  </ul>
                  <ul className="space-y-2 text-sm text-zinc-300">
                    <li>
                      Supply, packaging, software, subscription, and equipment
                      receipts.
                    </li>
                    <li>HITS™ tax workbook exports and PDF tax summaries.</li>
                    <li>Year-end inventory snapshots and carryover records.</li>
                    <li>
                      Giveaway, disposal, donation, or write-off notes and
                      supporting records.
                    </li>
                  </ul>
                </div>
              </div>

              <label className="mt-5 flex items-start gap-3 rounded-2xl border border-sky-800/70 bg-black/30 p-4 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950"
                />
                <span>
                  I understand this export is a bookkeeping/tax support
                  document. I have reviewed the readiness warnings and know I
                  should keep backup records, receipts, marketplace exports, and
                  final filing support before relying on this report.
                </span>
              </label>

              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowReadinessReview(false);
                    setAcknowledged(false);
                  }}
                  className="app-button"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={runExport}
                  disabled={!acknowledged || isExporting}
                  className="app-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isExporting ? "Exporting PDF..." : "Export PDF Anyway"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
