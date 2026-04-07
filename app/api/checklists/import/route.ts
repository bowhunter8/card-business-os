import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseChecklistFile } from "../../../../lib/checklists/parseChecklistWorkbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImportRow = {
  year: number | null;
  brand: string | null;
  set_name: string;
  subset_name: string | null;
  card_number: string;
  player_name: string;
  team_name: string | null;
  card_type: string | null;
  source_file: string | null;
  source_sheet: string | null;
  raw_text: string | null;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function isDuplicateError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const err = error as {
    code?: string;
    message?: string;
    details?: string;
  };

  return (
    err.code === "23505" ||
    (err.message?.toLowerCase().includes("duplicate key") ?? false) ||
    (err.details?.toLowerCase().includes("already exists") ?? false)
  );
}

async function insertRowsSafely(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  rows: ImportRow[]
) {
  let insertedRows = 0;
  let skippedRows = 0;
  const errors: string[] = [];

  const batches = chunkArray(rows, 100);

  for (const batch of batches) {
    for (const row of batch) {
      const { error } = await supabase.from("checklist_cards").insert(row);

      if (!error) {
        insertedRows += 1;
        continue;
      }

      if (isDuplicateError(error)) {
        skippedRows += 1;
        continue;
      }

      skippedRows += 1;

      if (error.message && !errors.includes(error.message)) {
        errors.push(error.message);
      }
    }
  }

  return { insertedRows, skippedRows, errors };
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const uploadedFiles = formData.getAll("files").filter(Boolean) as File[];

    if (!uploadedFiles.length) {
      return NextResponse.json(
        { ok: false, error: "No files uploaded." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const fileResults: Array<{
      fileName: string;
      totalRowsSeen: number;
      normalizedRows: number;
      insertedRows: number;
      skippedRows: number;
      errors: string[];
    }> = [];

    let grandTotalRowsSeen = 0;
    let grandNormalizedRows = 0;
    let grandInsertedRows = 0;
    let grandSkippedRows = 0;

    for (const file of uploadedFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const parsed = await parseChecklistFile(arrayBuffer, file.name);

        grandTotalRowsSeen += parsed.totalRowsSeen;
        grandNormalizedRows += parsed.rows.length;

        if (parsed.rows.length === 0) {
          fileResults.push({
            fileName: file.name,
            totalRowsSeen: parsed.totalRowsSeen,
            normalizedRows: 0,
            insertedRows: 0,
            skippedRows: 0,
            errors: parsed.errors.length
              ? parsed.errors
              : ["No usable checklist rows were found in this file."],
          });
          continue;
        }

        const { insertedRows, skippedRows, errors } = await insertRowsSafely(
          supabase,
          parsed.rows
        );

        grandInsertedRows += insertedRows;
        grandSkippedRows += skippedRows;

        fileResults.push({
          fileName: file.name,
          totalRowsSeen: parsed.totalRowsSeen,
          normalizedRows: parsed.rows.length,
          insertedRows,
          skippedRows,
          errors: [...parsed.errors, ...errors],
        });
      } catch (error) {
        fileResults.push({
          fileName: file.name,
          totalRowsSeen: 0,
          normalizedRows: 0,
          insertedRows: 0,
          skippedRows: 0,
          errors: [
            error instanceof Error ? error.message : "Unknown import error.",
          ],
        });
      }
    }

    return NextResponse.json({
      ok: true,
      files: fileResults,
      totals: {
        files: uploadedFiles.length,
        totalRowsSeen: grandTotalRowsSeen,
        normalizedRows: grandNormalizedRows,
        insertedRows: grandInsertedRows,
        skippedRows: grandSkippedRows,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Import failed.",
      },
      { status: 500 }
    );
  }
}