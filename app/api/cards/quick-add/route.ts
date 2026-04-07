import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuickAddItem = {
  checklist_card_id?: string | null;
  break_id?: string | null;
  purchase_id?: string | null;
  year?: number | null;
  brand?: string | null;
  set_name?: string | null;
  subset?: string | null;
  player_name?: string | null;
  card_number?: string | null;
  team?: string | null;
  variation?: string | null;
  parallel?: string | null;
  notes?: string | null;
};

type QuickAddBody = {
  breaker?: string | null;
  purchase_platform?: string | null;
  break_cost?: number | null;
  shipping?: number | null;
  tax?: number | null;
  acquired_date?: string | null;
  product?: string | null;
  team_spot?: string | null;
  items: QuickAddItem[];
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

function normalizeText(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v || null;
}

function normalizeMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureBreakEntry(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  body: QuickAddBody
) {
  const firstItem = body.items[0];
  const breakId = normalizeText(firstItem?.break_id);

  if (!breakId) {
    throw new Error("Break ID is required.");
  }

  const orderNumber = normalizeText(firstItem?.purchase_id);
  const acquiredDate = normalizeText(body.acquired_date) || todayIsoDate();

  const product =
    normalizeText(body.product) ||
    [normalizeText(firstItem?.year), normalizeText(firstItem?.brand), normalizeText(firstItem?.set_name)]
      .filter(Boolean)
      .join(" ") ||
    null;

  const teamSpot = normalizeText(body.team_spot) || normalizeText(firstItem?.team);

  const cardsReceived = body.items.length;
  const sellableLotsCards = body.items.length;

  const breakRow = {
    break_id: breakId,
    order_number: orderNumber,
    acquired_date: acquiredDate,
    breaker: normalizeText(body.breaker),
    product,
    team_spot: teamSpot,
    purchase_platform: normalizeText(body.purchase_platform),
    break_cost: normalizeMoney(body.break_cost),
    shipping: normalizeMoney(body.shipping),
    tax: normalizeMoney(body.tax),
    cards_received: cardsReceived,
    sellable_lots_cards: sellableLotsCards,
    notes: null,
    source: "quick_entry",
  };

  const { error } = await supabase
    .from("break_entries")
    .upsert(breakRow, { onConflict: "break_id" });

  if (error) {
    throw new Error(`Failed to save break entry: ${error.message}`);
  }

  return { breakId, orderNumber, acquiredDate };
}

function buildCardLotId(index: number) {
  const now = Date.now().toString().slice(-8);
  return `QE${now}${String(index + 1).padStart(4, "0")}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as QuickAddBody;

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No items provided." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { breakId, orderNumber, acquiredDate } = await ensureBreakEntry(
      supabase,
      body
    );

    const rows = body.items.map((item, index) => {
      const playerCard =
        normalizeText(item.player_name) ||
        normalizeText(item.card_number) ||
        `Card ${index + 1}`;

      const parallelDetails = [
        normalizeText(item.parallel),
        normalizeText(item.variation),
        normalizeText(item.subset),
      ]
        .filter(Boolean)
        .join(" • ");

      return {
        card_lot_id: buildCardLotId(index),
        break_id: breakId,
        order_number: orderNumber,
        acquired_date: acquiredDate,
        player_card: playerCard,
        card_number: normalizeText(item.card_number),
        parallel_details: parallelDetails || null,
        qty: 1,
        team: normalizeText(item.team),
        year: item.year ?? null,
        brand: normalizeText(item.brand),
        set_name: normalizeText(item.set_name),
        subset: normalizeText(item.subset),
        variation: normalizeText(item.variation),
        sales_platform: null,
        listed_price: null,
        sold_price: null,
        sale_date: null,
        fees: null,
        shipping_cost: null,
        est_market_value: null,
        status: "Holding",
        notes: normalizeText(item.notes),
        source: "quick_entry",
      };
    });

    const { error } = await supabase.from("inventory_entries").insert(rows);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      insertedCount: rows.length,
      breakId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Save failed.",
      },
      { status: 500 }
    );
  }
}