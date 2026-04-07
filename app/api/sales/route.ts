import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SALES_TABLE = "sales";
const INVENTORY_TABLE = "inventory_items";

type SalePayload = {
  inventoryItemId?: string;
  title?: string;
  soldDate?: string;
  salePrice?: number | string;
  platformFee?: number | string;
  shippingCost?: number | string;
  tax?: number | string;
  otherCost?: number | string;
  notes?: string;
  buyer?: string;
  platform?: string;
  orderNumber?: string;
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
  quantity?: number;
  unit_cost?: number;
  cost?: number;
  estimated_value?: number;
  notes?: string;
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

function safeNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
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

function appendNotes(base: string, extra: string): string {
  return [base.trim(), extra.trim()].filter(Boolean).join("\n").trim();
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from(SALES_TABLE)
      .select("*")
      .order("sold_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: `Failed to load sales: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ sales: data ?? [] });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: `Failed to load sales: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = (await req.json()) as SalePayload;

    const inventoryItemId = safeString(body.inventoryItemId);
    const soldDate = toDateOnlyString(body.soldDate);
    const salePrice = safeNumber(body.salePrice, 0);
    const platformFee = safeNumber(body.platformFee, 0);
    const shippingCost = safeNumber(body.shippingCost, 0);
    const tax = safeNumber(body.tax, 0);
    const otherCost = safeNumber(body.otherCost, 0);

    if (salePrice <= 0) {
      return NextResponse.json(
        { error: "Sale price must be greater than 0." },
        { status: 400 }
      );
    }

    let inventoryItem: InventoryRow | null = null;

    if (inventoryItemId) {
      const { data: linkedItem, error: inventoryLoadError } = await supabase
        .from(INVENTORY_TABLE)
        .select("*")
        .eq("id", inventoryItemId)
        .single<InventoryRow>();

      if (inventoryLoadError || !linkedItem) {
        return NextResponse.json(
          {
            error: `Inventory item not found: ${
              inventoryLoadError?.message || "Missing inventory item."
            }`,
          },
          { status: 404 }
        );
      }

      inventoryItem = linkedItem;
    }

    const saleTitle =
      safeString(body.title) ||
      safeString(inventoryItem?.title) ||
      [
        safeString(inventoryItem?.year),
        safeString(inventoryItem?.brand),
        safeString(inventoryItem?.set_name),
        safeString(inventoryItem?.player),
        safeString(inventoryItem?.card_number)
          ? `#${safeString(inventoryItem?.card_number)}`
          : "",
      ]
        .filter(Boolean)
        .join(" ") ||
      "Sale";

    const allocatedCost = safeNumber(inventoryItem?.cost, 0);
    const netRevenue = salePrice - platformFee - shippingCost - tax - otherCost;
    const realizedProfit = netRevenue - allocatedCost;

    const saleInsert = {
      inventory_item_id: inventoryItemId || null,
      title: saleTitle,
      sold_date: soldDate,
      sale_price: Number(salePrice.toFixed(2)),
      platform_fee: Number(platformFee.toFixed(2)),
      shipping_cost: Number(shippingCost.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      other_cost: Number(otherCost.toFixed(2)),
      allocated_cost: Number(allocatedCost.toFixed(2)),
      net_revenue: Number(netRevenue.toFixed(2)),
      realized_profit: Number(realizedProfit.toFixed(2)),
      buyer: safeString(body.buyer),
      platform: safeString(body.platform),
      order_number: safeString(body.orderNumber),
      notes: safeString(body.notes),
    };

    const { data: createdSale, error: saleError } = await supabase
      .from(SALES_TABLE)
      .insert(saleInsert)
      .select("*")
      .single();

    if (saleError) {
      return NextResponse.json(
        { error: `Failed to create sale: ${saleError.message}` },
        { status: 500 }
      );
    }

    if (inventoryItemId && inventoryItem) {
      const inventoryNotes = appendNotes(
        safeString(inventoryItem.notes),
        `Sold via sales record: ${createdSale.id}`
      );

      const { error: inventoryUpdateError } = await supabase
        .from(INVENTORY_TABLE)
        .update({
          status: "sold",
          entry_mode:
            safeString(inventoryItem.entry_mode) || "single_card",
          notes: inventoryNotes,
        })
        .eq("id", inventoryItemId);

      if (inventoryUpdateError) {
        return NextResponse.json(
          {
            error: `Sale created, but inventory item failed to update: ${inventoryUpdateError.message}`,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      sale: createdSale,
      message: "Sale created successfully.",
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: `Failed to create sale: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}