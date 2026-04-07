import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const INVENTORY_TABLE = "inventory_items";

type BulkActionType =
  | "split_to_inventory"
  | "mark_donation"
  | "mark_listed"
  | "mark_sold";

type BulkActionPayload = {
  parentId?: string;
  childIds?: string[];
  action?: BulkActionType;
};

type InventoryRow = {
  id: string;
  status?: string;
  entry_mode?: string;
  title?: string;
  player?: string;
  year?: string;
  brand?: string;
  set_name?: string;
  card_number?: string;
  team?: string;
  parallel?: string;
  variation?: string;
  rookie?: boolean;
  autograph?: boolean;
  relic?: boolean;
  serial_number?: string;
  grade?: string;
  quantity?: number;
  unit_cost?: number;
  cost?: number;
  estimated_value?: number;
  source?: string;
  break_id?: string | null;
  acquired_date?: string | null;
  notes?: string;
  created_at?: string;
  updated_at?: string;
};

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceRole) {
    throw new Error(
      "Missing Supabase environment variables. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function getParentBulkLotId(notes?: string): string {
  if (!notes) return "";
  const match = notes.match(/Parent Bulk Lot ID:\s*([^\n\r]+)/i);
  return match?.[1]?.trim() ?? "";
}

function getBulkLotName(notes?: string): string {
  if (!notes) return "";
  const match = notes.match(/Bulk Lot Name:\s*(.+)/i);
  return match?.[1]?.trim() ?? "";
}

function getBulkSourceParentId(notes?: string): string {
  if (!notes) return "";
  const match = notes.match(/Bulk Source Parent ID:\s*([^\n\r]+)/i);
  return match?.[1]?.trim() ?? "";
}

function getBulkSourceParentName(notes?: string): string {
  if (!notes) return "";
  const match = notes.match(/Bulk Source Parent Name:\s*(.+)/i);
  return match?.[1]?.trim() ?? "";
}

function removeLineStartingWith(notes: string, prefix: string): string {
  return notes
    .split(/\r?\n/)
    .filter(
      (line) =>
        !line.trim().toLowerCase().startsWith(prefix.trim().toLowerCase())
    )
    .join("\n")
    .trim();
}

function appendLineIfMissing(notes: string, lineToAdd: string): string {
  const trimmed = lineToAdd.trim();
  if (!trimmed) return notes.trim();

  const lines = notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const hasLine = lines.some(
    (line) => line.toLowerCase() === trimmed.toLowerCase()
  );

  if (hasLine) return notes.trim();

  return [notes.trim(), trimmed].filter(Boolean).join("\n").trim();
}

function appendActionNote(notes: string, actionLabel: string): string {
  return [notes.trim(), actionLabel].filter(Boolean).join("\n").trim();
}

function getNextChildStatus(action: BulkActionType): string {
  switch (action) {
    case "split_to_inventory":
      return "inventory";
    case "mark_donation":
      return "donation";
    case "mark_listed":
      return "listed";
    case "mark_sold":
      return "sold";
    default:
      return "inventory";
  }
}

function getNextChildEntryMode(): string {
  return "single_card";
}

function buildActionNote(action: BulkActionType): string {
  switch (action) {
    case "split_to_inventory":
      return "Bulk Action: split to inventory";
    case "mark_donation":
      return "Bulk Action: marked as donation";
    case "mark_listed":
      return "Bulk Action: marked as listed";
    case "mark_sold":
      return "Bulk Action: marked as sold";
    default:
      return "Bulk Action: updated";
  }
}

function buildUpdatedChildNotes(
  originalNotes: string,
  action: BulkActionType,
  parentId: string,
  parentName: string
): string {
  let cleaned = originalNotes.trim();

  cleaned = removeLineStartingWith(cleaned, "Entry Mode:");
  cleaned = removeLineStartingWith(cleaned, "Bulk Action:");

  const existingSourceParentId = getBulkSourceParentId(cleaned);
  const existingSourceParentName = getBulkSourceParentName(cleaned);

  cleaned = appendLineIfMissing(
    cleaned,
    `Bulk Source Parent ID: ${existingSourceParentId || parentId}`
  );
  cleaned = appendLineIfMissing(
    cleaned,
    `Bulk Source Parent Name: ${existingSourceParentName || parentName}`
  );

  if (action === "split_to_inventory") {
    cleaned = removeLineStartingWith(cleaned, "Parent Bulk Lot ID:");
    cleaned = removeLineStartingWith(cleaned, "Parent Bulk Lot Name:");
    cleaned = removeLineStartingWith(cleaned, "Entry Mode: bulk_lot_item");
  } else {
    cleaned = removeLineStartingWith(cleaned, "Parent Bulk Lot ID:");
    cleaned = removeLineStartingWith(cleaned, "Parent Bulk Lot Name:");
    cleaned = removeLineStartingWith(cleaned, "Entry Mode: bulk_lot_item");
  }

  cleaned = appendLineIfMissing(cleaned, `Entry Mode: ${getNextChildEntryMode()}`);

  return appendActionNote(cleaned, buildActionNote(action));
}

function buildUpdatedParentNotes(
  originalNotes: string,
  remainingCount: number
): string {
  const withoutCount = removeLineStartingWith(
    originalNotes,
    "Bulk Lot Item Count:"
  );

  return [withoutCount, `Bulk Lot Item Count: ${remainingCount}`]
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = (await req.json()) as BulkActionPayload;

    const parentId = safeString(body.parentId);
    const action = body.action;
    const childIds = Array.isArray(body.childIds)
      ? body.childIds.map((id) => safeString(id)).filter(Boolean)
      : [];

    if (!parentId) {
      return NextResponse.json(
        { error: "Parent bulk lot ID is required." },
        { status: 400 }
      );
    }

    if (!action) {
      return NextResponse.json({ error: "Action is required." }, { status: 400 });
    }

    if (childIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one child item." },
        { status: 400 }
      );
    }

    const { data: parent, error: parentError } = await supabase
      .from(INVENTORY_TABLE)
      .select("*")
      .eq("id", parentId)
      .single<InventoryRow>();

    if (parentError || !parent) {
      return NextResponse.json(
        {
          error: `Parent bulk lot not found: ${
            parentError?.message || "Missing parent."
          }`,
        },
        { status: 404 }
      );
    }

    if (parent.status !== "bulk_lot") {
      return NextResponse.json(
        { error: "Selected parent is not a bulk lot." },
        { status: 400 }
      );
    }

    const parentName = safeString(parent.title) || getBulkLotName(parent.notes);

    const { data: selectedChildren, error: selectedChildrenError } =
      await supabase
        .from(INVENTORY_TABLE)
        .select("*")
        .in("id", childIds)
        .eq("status", "bulk_lot_item");

    if (selectedChildrenError) {
      return NextResponse.json(
        {
          error: `Failed to load selected child items: ${selectedChildrenError.message}`,
        },
        { status: 500 }
      );
    }

    const validChildren = (selectedChildren ?? []).filter(
      (child) => getParentBulkLotId(child.notes) === parentId
    ) as InventoryRow[];

    if (validChildren.length === 0) {
      return NextResponse.json(
        { error: "No valid child items found for this bulk lot." },
        { status: 400 }
      );
    }

    const nextStatus = getNextChildStatus(action);
    const nextEntryMode = getNextChildEntryMode();

    for (const child of validChildren) {
      const updatedNotes = buildUpdatedChildNotes(
        child.notes ?? "",
        action,
        parentId,
        parentName
      );

      const { error: updateChildError } = await supabase
        .from(INVENTORY_TABLE)
        .update({
          status: nextStatus,
          entry_mode: nextEntryMode,
          notes: updatedNotes,
        })
        .eq("id", child.id);

      if (updateChildError) {
        return NextResponse.json(
          {
            error: `Failed to update child item ${child.id}: ${updateChildError.message}`,
          },
          { status: 500 }
        );
      }
    }

    const { data: remainingChildren, error: remainingChildrenError } =
      await supabase
        .from(INVENTORY_TABLE)
        .select("*")
        .eq("status", "bulk_lot_item");

    if (remainingChildrenError) {
      return NextResponse.json(
        {
          error: `Failed to reload remaining child items: ${remainingChildrenError.message}`,
        },
        { status: 500 }
      );
    }

    const remainingForParent = (remainingChildren ?? []).filter(
      (row) => getParentBulkLotId((row as InventoryRow).notes) === parentId
    ) as InventoryRow[];

    const remainingQuantity = remainingForParent.length;
    const remainingCost = remainingForParent.reduce(
      (sum, row) => sum + safeNumber(row.cost),
      0
    );
    const remainingEstimatedValue = remainingForParent.reduce(
      (sum, row) => sum + safeNumber(row.estimated_value),
      0
    );
    const remainingUnitCost =
      remainingQuantity > 0
        ? Number((remainingCost / remainingQuantity).toFixed(2))
        : 0;

    const updatedParentNotes = buildUpdatedParentNotes(
      parent.notes ?? "",
      remainingQuantity
    );

    const { error: updateParentError } = await supabase
      .from(INVENTORY_TABLE)
      .update({
        quantity: remainingQuantity,
        cost: Number(remainingCost.toFixed(2)),
        estimated_value: Number(remainingEstimatedValue.toFixed(2)),
        unit_cost: remainingUnitCost,
        notes: updatedParentNotes,
      })
      .eq("id", parentId);

    if (updateParentError) {
      return NextResponse.json(
        {
          error: `Child items updated, but parent refresh failed: ${updateParentError.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      parentId,
      action,
      updatedChildCount: validChildren.length,
      remainingChildCount: remainingQuantity,
      remainingCost: Number(remainingCost.toFixed(2)),
      remainingEstimatedValue: Number(remainingEstimatedValue.toFixed(2)),
      bulkLotName: parentName,
      message: "Bulk lot action completed successfully.",
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: `Bulk action failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}