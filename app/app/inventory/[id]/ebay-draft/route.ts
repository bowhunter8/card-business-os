import { NextResponse } from "next/server";

import { getEbayDraftCsvForInventoryIds } from "@/app/actions/ebay-draft-export";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const result = await getEbayDraftCsvForInventoryIds([id]);

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("You must be signed in to export an eBay draft.");
    }

    const { error: exportTrackingError } = await supabase
      .from("inventory_items")
      .update({
        ebay_exported_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

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
