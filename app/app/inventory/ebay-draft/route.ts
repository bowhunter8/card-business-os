import { NextResponse } from "next/server";

import { getEbayDraftCsvForInventoryIds } from "@/app/actions/ebay-draft-export";
import { createClient } from "@/lib/supabase/server";

type BulkEbayDraftRequest = {
  inventoryIds?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BulkEbayDraftRequest;

    const inventoryIds = Array.isArray(body.inventoryIds)
      ? Array.from(
          new Set(
            body.inventoryIds
              .map((value) => String(value ?? "").trim())
              .filter(Boolean),
          ),
        )
      : [];

    if (inventoryIds.length === 0) {
      throw new Error("Select at least one inventory item to export.");
    }

    if (inventoryIds.length > 2000) {
      throw new Error("A maximum of 2,000 inventory items can be exported at once.");
    }

    const result = await getEbayDraftCsvForInventoryIds(inventoryIds);

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("You must be signed in to export eBay drafts.");
    }

    const exportedAt = new Date().toISOString();

    const { error: exportTrackingError } = await supabase
      .from("inventory_items")
      .update({
        ebay_exported_at: exportedAt,
        processing_status: "ebay_exported",
      })
      .eq("user_id", user.id)
      .in("id", inventoryIds);

    if (exportTrackingError) {
      throw new Error(
        `The eBay draft CSV was created, but HITS could not record the export: ${exportTrackingError.message}`,
      );
    }

    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
        "X-HITS-eBay-Exported-Count": String(result.itemCount),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to create the eBay draft export.";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
