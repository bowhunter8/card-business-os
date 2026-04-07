"use client";

import ChecklistUploadPanel from "../../checklists/ChecklistUploadPanel";
import Link from "next/link";

export default function AdminChecklistsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Checklist Bulk Import</h1>
            <p className="mt-2 text-zinc-400">
              Upload one or more checklist Excel or CSV files into{" "}
              <code className="rounded bg-zinc-900 px-1 py-0.5">
                checklist_cards
              </code>
              .
            </p>
          </div>

          <Link
            href="/fast-entry"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900"
          >
            Back to Quick Entry
          </Link>
        </div>

        <ChecklistUploadPanel mode="full" />
      </div>
    </main>
  );
}