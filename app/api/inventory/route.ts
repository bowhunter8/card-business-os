import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  user_id: string;
  title: string;
  player_name: string | null;
  year: number | null;
  brand: string | null;
  set_name: string | null;
  card_number: string | null;
  parallel_name: string | null;
  team: string | null;
  notes: string | null;
  status: string;
  item_type: string;
  quantity: number;
  available_quantity: number;
  cost_basis_unit: number;
  cost_basis_total: number;
  source_type: string;
  source_break_id: string | null;
};

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

function toSafeYear(value: unknown): number | null {
  const text = toSafeString(value);
  if (!text) return null;
  const year = Number(text);
  return Number.isInteger(year) ? year : null;
}

function toSafeUuid(value: unknown): string | null {
  const text = toSafeString(value);
  if (!text) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function userFriendlyCreateError(message: string) {
  if (
    message.includes("row-level security") ||
    message.includes("violates row-level security")
  ) {
    return (
      "Inventory could not be saved because your signed-in user could not be attached to the new inventory row. " +
      "This is not caused by your entry. Please refresh the page and try again. Technical detail: " +
      message
    );
  }

  if (
    message.includes("schema cache") ||
    message.includes("Could not find") ||
    message.includes("column")
  ) {
    return (
      "Inventory could not be saved because the manual inventory form and database fields are out of sync. " +
      "This is not caused by your entry. Technical detail: " +
      message
    );
  }

  return message;
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

function buildNotes(parts: Array<string | null | undefined>) {
  const text = parts
    .map((part) => toSafeString(part))
    .filter(Boolean)
    .join("\n");

  return text || null;
}

function buildBaseRow({
  body,
  userId,
  title,
  quantity,
  unitCost,
  totalCost,
  itemType,
  status,
  notes,
  playerName,
  year,
  brand,
  setName,
  cardNumber,
  parallelName,
  team,
}: {
  body: CreateInventoryPayload;
  userId: string;
  title: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  itemType: string;
  status: string;
  notes: string | null;
  playerName?: string | null;
  year?: number | null;
  brand?: string | null;
  setName?: string | null;
  cardNumber?: string | null;
  parallelName?: string | null;
  team?: string | null;
}): InventoryRowInsert {
  const sourceText = toSafeString(body.source);
  const breakUuid = toSafeUuid(body.breakId);

  return {
    user_id: userId,
    title,
    player_name: playerName ?? (toSafeString(body.player) || null),
    year: year ?? toSafeYear(body.year),
    brand: brand ?? (toSafeString(body.brand) || null),
    set_name: setName ?? (toSafeString(body.setName) || null),
    card_number: cardNumber ?? (toSafeString(body.cardNumber) || null),
    parallel_name: parallelName ?? (toSafeString(body.parallel) || null),
    team: team ?? (toSafeString(body.team) || null),
    notes,
    status,
    item_type: itemType,
    quantity,
    available_quantity: quantity,
    cost_basis_unit: unitCost,
    cost_basis_total: totalCost,
    source_type: breakUuid ? "break" : "manual",
    source_break_id: breakUuid,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();

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
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "You must be signed in to create inventory." },
        { status: 401 }
      );
    }

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

      const parentNotes = buildNotes([
        toSafeString(body.notes),
        toSafeString(body.bulkLot?.lotDescription),
        "Entry Mode: bulk_lot",
        `Bulk Lot Name: ${lotName}`,
        `Bulk Lot Item Count: ${cleanItems.length}`,
        toSafeString(body.acquiredDate)
          ? `Manual acquired date: ${toSafeString(body.acquiredDate)}`
          : "",
      ]);

      const parentRow = buildBaseRow({
        body,
        userId: user.id,
        title: toSafeString(body.title) || lotName,
        quantity,
        unitCost,
        totalCost,
        itemType: "single_card",
        status: "available",
        notes: parentNotes,
        playerName: lotName,
      });

      const { data: parentInsert, error: parentError } = await supabase
        .from(INVENTORY_TABLE)
        .insert(parentRow)
        .select("*")
        .single();

      if (parentError) {
        return NextResponse.json(
          {
            error: `Failed to create bulk lot: ${userFriendlyCreateError(
              parentError.message
            )}`,
          },
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

          const childNotes = buildNotes([
            toSafeString(item.notes),
            "Entry Mode: bulk_lot_item",
            parentId ? `Parent Bulk Lot ID: ${parentId}` : "",
            `Parent Bulk Lot Name: ${lotName}`,
          ]);

          return buildBaseRow({
            body,
            userId: user.id,
            title: buildBulkChildTitle(item, lotName, index),
            quantity: 1,
            unitCost: childCost,
            totalCost: childCost,
            itemType: "single_card",
            status: "available",
            notes: childNotes,
            playerName: toSafeString(item.player) || null,
            year: toSafeYear(item.year) || toSafeYear(body.year),
            brand: toSafeString(item.brand) || toSafeString(body.brand) || null,
            setName: toSafeString(item.setName) || toSafeString(body.setName) || null,
            cardNumber: toSafeString(item.cardNumber) || null,
            parallelName: toSafeString(item.parallel) || null,
            team: null,
          });
        }
      );

      const { data: childInsert, error: childError } = await supabase
        .from(INVENTORY_TABLE)
        .insert(childRows)
        .select("*");

      if (childError) {
        return NextResponse.json(
          {
            error: `Parent created, but child items failed: ${userFriendlyCreateError(
              childError.message
            )}`,
          },
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

    const quantity = Math.max(1, Math.floor(toSafeNumber(body.quantity, 1)));
    const unitCost = Math.max(0, toSafeNumber(body.unitCost, 0));
    const totalCost = Math.max(0, toSafeNumber(body.totalCost, unitCost * quantity));

    const notes = buildNotes([
      toSafeString(body.notes),
      toSafeString(body.variation) ? `Variation: ${toSafeString(body.variation)}` : "",
      toSafeString(body.serialNumber)
        ? `Serial Number: ${toSafeString(body.serialNumber)}`
        : "",
      toSafeString(body.grade) ? `Grade: ${toSafeString(body.grade)}` : "",
      toSafeBool(body.rookie) ? "Rookie" : "",
      toSafeBool(body.autograph) ? "Autograph" : "",
      toSafeBool(body.relic) ? "Relic" : "",
      toSafeString(body.acquiredDate)
        ? `Manual acquired date: ${toSafeString(body.acquiredDate)}`
        : "",
      toSafeNumber(body.estimatedValue, 0)
        ? `Estimated Value: ${toSafeNumber(body.estimatedValue, 0).toFixed(2)}`
        : "",
      "Entry Mode: single_card",
    ]);

    const row = buildBaseRow({
      body,
      userId: user.id,
      title,
      quantity,
      unitCost,
      totalCost,
      itemType: "single_card",
      status: "available",
      notes,
    });

    const { data, error } = await supabase
      .from(INVENTORY_TABLE)
      .insert(row)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        {
          error: `Failed to create inventory item: ${userFriendlyCreateError(
            error.message
          )}`,
        },
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
