import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const INVENTORY_TABLE = "inventory_items";

type EntryMode = "single_card" | "bulk_lot";

type BulkLotItemInput = {
  player?: string;
  cardNumber?: string;
  year?: string;
  brand?: string;
  setName?: string;
  parallel?: string;
  rookie?: boolean;
  notes?: string;
  estimatedValue?: number;
};

type CreateInventoryPayload = {
  entryMode?: EntryMode;
  status?: string;

  title?: string;
  player?: string;
  year?: string;
  brand?: string;
  setName?: string;
  cardNumber?: string;
  team?: string;
  parallel?: string;
  variation?: string;
  rookie?: boolean;
  autograph?: boolean;
  relic?: boolean;
  serialNumber?: string;
  grade?: string;

  quantity?: number;
  unitCost?: number;
  totalCost?: number;
  estimatedValue?: number;
  source?: string;
  breakId?: string;
  acquiredDate?: string;
  notes?: string;

  bulkLot?: {
    lotName?: string;
    lotDescription?: string;
    itemCount?: number;
    estimatedTotalValue?: number;
    items?: BulkLotItemInput[];
  } | null;
};

type InventoryRowInsert = {
  status: string;
  entry_mode: EntryMode;
  title: string;
  player: string;
  year: string;
  brand: string;
  set_name: string;
  card_number: string;
  team: string;
  parallel: string;
  variation: string;
  rookie: boolean;
  autograph: boolean;
  relic: boolean;
  serial_number: string;
  grade: string;
  quantity: number;
  unit_cost: number;
  cost: number;
  estimated_value: number;
  source: string;
  break_id: string | null;
  acquired_date: string | null;
  notes: string;
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

function toSafeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toSafeBool(value: unknown): boolean {
  return value === true;
}

function toDateOnlyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function isFilledBulkItem(item: BulkLotItemInput | null | undefined): boolean {
  if (!item) return false;

  return Boolean(
    toSafeString(item.player) ||
      toSafeString(item.cardNumber) ||
      toSafeString(item.year) ||
      toSafeString(item.brand) ||
      toSafeString(item.setName) ||
      toSafeString(item.parallel) ||
      toSafeString(item.notes) ||
      toSafeNumber(item.estimatedValue, 0)
  );
}

function buildSingleTitle(body: CreateInventoryPayload): string {
  const manualTitle = toSafeString(body.title);
  if (manualTitle) return manualTitle;

  return [
    toSafeString(body.year),
    toSafeString(body.brand),
    toSafeString(body.setName),
    toSafeString(body.player),
    toSafeString(body.cardNumber) ? `#${toSafeString(body.cardNumber)}` : "",
    toSafeString(body.parallel),
    toSafeString(body.variation),
  ]
    .filter(Boolean)
    .join(" ");
}

function buildBulkChildTitle(
  item: BulkLotItemInput,
  fallbackLotName: string,
  index: number
): string {
  const built = [
    toSafeString(item.year),
    toSafeString(item.brand),
    toSafeString(item.setName),
    toSafeString(item.player),
    toSafeString(item.cardNumber) ? `#${toSafeString(item.cardNumber)}` : "",
    toSafeString(item.parallel),
  ]
    .filter(Boolean)
    .join(" ");

  return built || `${fallbackLotName} Item ${index + 1}`;
}

function buildBaseRow(
  body: CreateInventoryPayload,
  overrides?: Partial<InventoryRowInsert>
): InventoryRowInsert {
  const quantity = Math.max(1, Math.floor(toSafeNumber(body.quantity, 1)));
  const unitCost = Math.max(0, toSafeNumber(body.unitCost, 0));
  const totalCost = Math.max(
    0,
    toSafeNumber(body.totalCost, unitCost * quantity)
  );
  const estimatedValue = Math.max(0, toSafeNumber(body.estimatedValue, 0));

  return {
    status: toSafeString(body.status) || "inventory",
    entry_mode: body.entryMode === "bulk_lot" ? "bulk_lot" : "single_card",
    title: buildSingleTitle(body),
    player: toSafeString(body.player),
    year: toSafeString(body.year),
    brand: toSafeString(body.brand),
    set_name: toSafeString(body.setName),
    card_number: toSafeString(body.cardNumber),
    team: toSafeString(body.team),
    parallel: toSafeString(body.parallel),
    variation: toSafeString(body.variation),
    rookie: toSafeBool(body.rookie),
    autograph: toSafeBool(body.autograph),
    relic: toSafeBool(body.relic),
    serial_number: toSafeString(body.serialNumber),
    grade: toSafeString(body.grade),
    quantity,
    unit_cost: unitCost,
    cost: totalCost,
    estimated_value: estimatedValue,
    source: toSafeString(body.source),
    break_id: toSafeString(body.breakId) || null,
    acquired_date: toDateOnlyString(body.acquiredDate),
    notes: toSafeString(body.notes),
    ...overrides,
  };
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from(INVENTORY_TABLE)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: `Failed to load inventory: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: `Failed to load inventory: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = (await req.json()) as CreateInventoryPayload;

    const entryMode: EntryMode =
      body.entryMode === "bulk_lot" ? "bulk_lot" : "single_card";

    if (entryMode === "bulk_lot") {
      const lotName = toSafeString(body.bulkLot?.lotName || body.title);

      if (!lotName) {
        return NextResponse.json(
          { error: "Bulk lot name is required." },
          { status: 400 }
        );
      }

      const rawItems = Array.isArray(body.bulkLot?.items)
        ? body.bulkLot?.items ?? []
        : [];

      const cleanItems = rawItems.filter(isFilledBulkItem);

      if (cleanItems.length === 0) {
        return NextResponse.json(
          { error: "Bulk lot must include at least one child item." },
          { status: 400 }
        );
      }

      const quantity = cleanItems.length;
      const unitCost = Math.max(0, toSafeNumber(body.unitCost, 0));
      const totalCost = Math.max(
        0,
        toSafeNumber(body.totalCost, unitCost * quantity)
      );
      const parentEstimatedValue = Math.max(
        0,
        toSafeNumber(
          body.estimatedValue,
          cleanItems.reduce((sum: number, item: BulkLotItemInput) => {
            return sum + Math.max(0, toSafeNumber(item.estimatedValue, 0));
          }, 0)
        )
      );

      const parentNotes = [
        toSafeString(body.notes),
        toSafeString(body.bulkLot?.lotDescription),
        "Entry Mode: bulk_lot",
        `Bulk Lot Name: ${lotName}`,
        `Bulk Lot Item Count: ${cleanItems.length}`,
      ]
        .filter(Boolean)
        .join("\n");

      const parentRow = buildBaseRow(body, {
        status: "bulk_lot",
        entry_mode: "bulk_lot",
        title: toSafeString(body.title) || lotName,
        player: toSafeString(body.player) || lotName,
        quantity,
        unit_cost: unitCost,
        cost: totalCost,
        estimated_value: parentEstimatedValue,
        notes: parentNotes,
      });

      const { data: parentInsert, error: parentError } = await supabase
        .from(INVENTORY_TABLE)
        .insert(parentRow)
        .select("*")
        .single();

      if (parentError) {
        return NextResponse.json(
          { error: `Failed to create bulk lot: ${parentError.message}` },
          { status: 500 }
        );
      }

      const parentId =
        parentInsert && typeof parentInsert === "object" && "id" in parentInsert
          ? String(parentInsert.id)
          : "";

      const perItemCostRaw = totalCost / cleanItems.length;
      const roundedBase = Math.floor(perItemCostRaw * 100) / 100;

      const allocatedCosts: number[] = cleanItems.map(() => roundedBase);
      let remainderCents = Math.round(
        (totalCost - roundedBase * cleanItems.length) * 100
      );

      let distributeIndex = 0;
      while (remainderCents > 0) {
        allocatedCosts[distributeIndex] += 0.01;
        remainderCents -= 1;
        distributeIndex = (distributeIndex + 1) % allocatedCosts.length;
      }

      const childRows: InventoryRowInsert[] = cleanItems.map(
        (item: BulkLotItemInput, index: number) => {
          const childCost = Number(allocatedCosts[index].toFixed(2));

          const childNotes = [
            toSafeString(item.notes),
            "Entry Mode: bulk_lot_item",
            parentId ? `Parent Bulk Lot ID: ${parentId}` : "",
            `Parent Bulk Lot Name: ${lotName}`,
          ]
            .filter(Boolean)
            .join("\n");

          return {
            status: "bulk_lot_item",
            entry_mode: "bulk_lot",
            title: buildBulkChildTitle(item, lotName, index),
            player: toSafeString(item.player),
            year: toSafeString(item.year) || toSafeString(body.year),
            brand: toSafeString(item.brand) || toSafeString(body.brand),
            set_name: toSafeString(item.setName) || toSafeString(body.setName),
            card_number: toSafeString(item.cardNumber),
            team: "",
            parallel: toSafeString(item.parallel),
            variation: "",
            rookie: toSafeBool(item.rookie),
            autograph: false,
            relic: false,
            serial_number: "",
            grade: "",
            quantity: 1,
            unit_cost: childCost,
            cost: childCost,
            estimated_value: Math.max(0, toSafeNumber(item.estimatedValue, 0)),
            source: toSafeString(body.source),
            break_id: toSafeString(body.breakId) || null,
            acquired_date: toDateOnlyString(body.acquiredDate),
            notes: childNotes,
          };
        }
      );

      const { data: childInsert, error: childError } = await supabase
        .from(INVENTORY_TABLE)
        .insert(childRows)
        .select("*");

      if (childError) {
        return NextResponse.json(
          { error: `Parent created, but child items failed: ${childError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        item: parentInsert,
        childItems: childInsert ?? [],
        message: "Bulk lot created successfully.",
      });
    }

    const title = buildSingleTitle(body);

    if (!title && !toSafeString(body.player)) {
      return NextResponse.json(
        { error: "Title or player is required." },
        { status: 400 }
      );
    }

    const row = buildBaseRow(body, {
      status: toSafeString(body.status) || "inventory",
      entry_mode: "single_card",
      title,
      notes: [toSafeString(body.notes), "Entry Mode: single_card"]
        .filter(Boolean)
        .join("\n"),
    });

    const { data, error } = await supabase
      .from(INVENTORY_TABLE)
      .insert(row)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to create inventory item: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      item: data,
      message: "Inventory item created successfully.",
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: `Failed to create inventory item: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}