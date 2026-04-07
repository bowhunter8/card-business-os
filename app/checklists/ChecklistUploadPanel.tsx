"use client";

import { useState } from "react";
import Link from "next/link";

type ImportSummary = {
  ok: boolean;
  files?: Array<{
    fileName: string;
    totalRowsSeen: number;
    normalizedRows: number;
    insertedRows: number;
    skippedRows: number;
    errors: string[];
  }>;
  totals?: {
    files: number;
    totalRowsSeen: number;
    normalizedRows: number;
    insertedRows: number;
    skippedRows: number;
  };
  error?: string;
};

export default function ChecklistUploadPanel({
  mode = "compact",
}: {
  mode?: "compact" | "full";
}) {
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();

    if (!files || files.length === 0) {
      alert("Please choose at least one checklist file.");
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => {
        formData.append("files", file);
      });

      const res = await fetch("/api/checklists/import", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      setResult(json);

      if (!res.ok) {
        console.error(json);
      }
    } catch (error) {
      console.error(error);
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : "Upload failed.",
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-lg">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-medium">Upload checklist files</div>
            <div className="mt-1 text-sm text-zinc-400">
              Supports .xlsx and .csv
            </div>
          </div>

          {mode === "compact" && (
            <Link
              href="/admin/checklists"
              className="text-sm text-blue-400 hover:underline"
            >
              Bulk Import Page →
            </Link>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="file"
            accept=".xlsx,.csv"
            multiple
            onChange={(e) => setFiles(e.target.files)}
            className="block w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm"
          />

          <button
            type="submit"
            disabled={uploading}
            className="rounded-xl bg-white px-5 py-3 font-semibold text-black disabled:opacity-50"
          >
            {uploading ? "Importing..." : "Import Checklists"}
          </button>
        </div>
      </form>

      {result && (
        <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="mb-4 text-lg font-semibold">Import Results</h2>

          {!result.ok && (
            <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-200">
              {result.error || "Import failed."}
            </div>
          )}

          {result.ok && result.totals && (
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label="Files" value={result.totals.files} />
              <Stat label="Rows Seen" value={result.totals.totalRowsSeen} />
              <Stat label="Normalized" value={result.totals.normalizedRows} />
              <Stat label="Inserted" value={result.totals.insertedRows} />
              <Stat label="Skipped" value={result.totals.skippedRows} />
            </div>
          )}

          {mode === "full" &&
            result.files?.map((file) => (
              <div
                key={file.fileName}
                className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4"
              >
                <div className="mb-2 font-semibold">{file.fileName}</div>
                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                  <Stat label="Rows Seen" value={file.totalRowsSeen} />
                  <Stat label="Normalized" value={file.normalizedRows} />
                  <Stat label="Inserted" value={file.insertedRows} />
                  <Stat label="Skipped" value={file.skippedRows} />
                  <Stat label="Errors" value={file.errors.length} />
                </div>

                {file.errors.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-200">
                    <div className="mb-2 font-medium">Notes / Errors</div>
                    <ul className="list-disc space-y-1 pl-5">
                      {file.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}