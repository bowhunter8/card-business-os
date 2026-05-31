"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function safeText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function safeNumber(value: FormDataEntryValue | null) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function safeOptionalNumber(value: FormDataEntryValue | null) {
  if (value === null) return null;

  const text = String(value).trim();
  if (text === "") return null;

  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function safeOptionalInteger(value: FormDataEntryValue | null) {
  const num = safeOptionalNumber(value);
  if (num === null) return null;

  const integer = Math.trunc(num);
  return Number.isFinite(integer) ? integer : null;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function normalizeSalesTaxResponsibility(value: string) {
  if (
    value === "marketplace_collected" ||
    value === "seller_collected" ||
    value === "not_collected" ||
    value === "exempt_or_not_taxable"
  ) {
    return value;
  }

  return "marketplace_collected";
}

function normalizeSalesChannelType(value: string) {
  if (
    value === "marketplace" ||
    value === "local_sale" ||
    value === "card_show" ||
    value === "direct_private"
  ) {
    return value;
  }

  return "marketplace";
}

function getSafeUnitCost(item: {
  cost_basis_unit?: number | null;
  cost_basis_total?: number | null;
  quantity?: number | null;
}) {
  const unitCost = Number(item.cost_basis_unit ?? 0);
  const totalCost = Number(item.cost_basis_total ?? 0);
  const quantity = Number(item.quantity ?? 0);

  if (unitCost > 0) {
    return unitCost;
  }

  if (totalCost > 0 && quantity > 0) {
    return totalCost / quantity;
  }

  return 0;
}

function buildCostBasisErrorRedirect(
  inventoryItemId: string,
  fallbackPath = "/app/inventory",
) {
  const message =
    "Missing cost basis. Enter Unit Cost on the sell page before recording the sale. This protects accurate COGS and tax reporting.";

  if (!inventoryItemId) {
    return `${fallbackPath}?error=${encodeURIComponent(message)}`;
  }

  return `/app/inventory/${inventoryItemId}?error=${encodeURIComponent(message)}`;
}

async function requireUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

type SaleCalculationInput = {
  itemSalePrice: number;
  shippingCharged: number;
  platformFees: number;
  shippingCost: number;
  suppliesCost: number;
  otherCosts: number;
  unitCost: number;
  quantitySold: number;
};

type SalesTaxTrackingInput = {
  salesTaxCollected: number;
  salesTaxResponsibility: string;
  salesChannelType: string;
  taxState: string;
  taxNotes: string;
};

function calculateSaleNumbers(input: SaleCalculationInput) {
  const grossSale = roundMoney(input.itemSalePrice + input.shippingCharged);
  const shippingTotalCosts = roundMoney(
    input.shippingCost + input.suppliesCost,
  );
  const totalSellingCosts = roundMoney(
    input.platformFees + shippingTotalCosts + input.otherCosts,
  );
  const netProceeds = roundMoney(grossSale - totalSellingCosts);
  const cogs = roundMoney(input.unitCost * input.quantitySold);
  const profit = roundMoney(netProceeds - cogs);

  return {
    grossSale,
    shippingTotalCosts,
    totalSellingCosts,
    netProceeds,
    cogs,
    profit,
  };
}

async function getShippingDefaults({
  supabase,
  userId,
  shippingProfileId,
  shippingChargedInput,
  shippingCostInput,
  suppliesCostInput,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  shippingProfileId: string;
  shippingChargedInput: number;
  shippingCostInput: number;
  suppliesCostInput: number;
}) {
  let shippingCharged = shippingChargedInput;
  let shippingCost = shippingCostInput;
  let suppliesCost = suppliesCostInput;

  if (shippingProfileId) {
    const shippingProfileRes = await supabase
      .from("shipping_profiles")
      .select("shipping_charged_default, supplies_cost_default")
      .eq("id", shippingProfileId)
      .eq("user_id", userId)
      .single();

    if (!shippingProfileRes.error && shippingProfileRes.data) {
      shippingCharged = Number(
        shippingProfileRes.data.shipping_charged_default ?? 0,
      );
      suppliesCost = Number(shippingProfileRes.data.supplies_cost_default ?? 0);
      // Actual postage stays manual per sale by design.
      shippingCost = shippingCostInput;
    }
  }

  return {
    shippingCharged,
    shippingCost,
    suppliesCost,
  };
}

async function getInventoryItemForSale({
  supabase,
  userId,
  inventoryItemId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  inventoryItemId: string;
}) {
  const itemResponse = await supabase
    .from("inventory_items")
    .select(
      `
      id,
      title,
      player_name,
      year,
      set_name,
      card_number,
      notes,
      status,
      quantity,
      available_quantity,
      cost_basis_unit,
      cost_basis_total,
      source_type,
      source_break_id,
      created_at,
      team,
      brand
    `,
    )
    .eq("id", inventoryItemId)
    .eq("user_id", userId)
    .single();

  if (itemResponse.error || !itemResponse.data) {
    return null;
  }

  return itemResponse.data;
}

function dateOnly(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    const trimmed = String(value).trim();
    return trimmed ? trimmed.slice(0, 10) : null;
  }

  return date.toISOString().slice(0, 10);
}

function soldAtFromSaleDate(value: string) {
  const safeDate = dateOnly(value);

  if (!safeDate) return new Date().toISOString();

  return `${safeDate}T00:00:00.000Z`;
}

function calculateDaysToSell({
  listedAt,
  soldAt,
}: {
  listedAt?: string | null;
  soldAt?: string | null;
}) {
  if (!listedAt || !soldAt) return null;

  const listedTime = new Date(listedAt).getTime();
  const soldTime = new Date(soldAt).getTime();

  if (!Number.isFinite(listedTime) || !Number.isFinite(soldTime)) {
    return null;
  }

  return Math.max(
    0,
    Math.round((soldTime - listedTime) / (1000 * 60 * 60 * 24)),
  );
}

async function recordHitsPulseSaleEvents({
  supabase,
  inventoryItem,
  saleDate,
  quantitySold,
  grossSale,
  platform,
  pulseCategory,
  pulseSubcategory,
  saleItemName,
  saleItemYear,
  saleItemSet,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  inventoryItem: {
    title?: string | null;
    player_name?: string | null;
    year?: number | null;
    set_name?: string | null;
    team?: string | null;
    brand?: string | null;
    created_at?: string | null;
  };
  saleDate: string;
  quantitySold: number;
  grossSale: number;
  platform: string;
  pulseCategory: string;
  pulseSubcategory: string;
  saleItemName: string;
  saleItemYear: number | null;
  saleItemSet: string;
}) {
  try {
    const safeQuantity = Math.max(1, Math.floor(Number(quantitySold || 1)));
    const soldAt = soldAtFromSaleDate(saleDate);
    const saleDateOnly = dateOnly(saleDate);
    const listDateOnly = dateOnly(inventoryItem.created_at);
    const daysToSell = calculateDaysToSell({
      listedAt: inventoryItem.created_at,
      soldAt,
    });
    const saleAmountPerUnit = roundMoney(Number(grossSale || 0) / safeQuantity);
    const pulseName =
      saleItemName || inventoryItem.player_name || inventoryItem.title || null;
    const pulseSet =
      saleItemSet || inventoryItem.set_name || inventoryItem.brand || null;
    const pulseYear = saleItemYear ?? inventoryItem.year ?? null;

    const pulseRows = Array.from({ length: safeQuantity }).map(() => ({
      list_date: listDateOnly,
      sale_date: saleDateOnly,
      sold_at: soldAt,
      player_name: pulseName,
      card_title:
        pulseName || inventoryItem.title || inventoryItem.player_name || null,
      sport: pulseSubcategory || null,
      team: inventoryItem.team || null,
      set_name: pulseSet,
      card_year: pulseYear,
      category: pulseCategory || "Sports Cards",
      sale_amount: saleAmountPerUnit,
      days_to_sell: daysToSell,
      source_platform: platform || null,
    }));

    const { error: pulseError } = await supabase
      .from("hits_pulse_sales_events")
      .insert(pulseRows);

    if (pulseError) {
      console.error("HITS Pulse event insert skipped:", pulseError.message);
    }
  } catch (error) {
    console.error("HITS Pulse event insert skipped:", error);
  }
}

async function insertSaleAndUpdateInventory({
  supabase,
  userId,
  inventoryItemId,
  saleDate,
  quantitySold,
  grossSale,
  platformFees,
  shippingTotalCosts,
  otherCosts,
  netProceeds,
  cogs,
  profit,
  platform,
  notes,
  newAvailableQty,
  nextStatus,
  shippingCharged,
  shippingCost,
  suppliesCost,
  unitCost,
  itemQuantity,
  salesTaxCollected,
  salesTaxResponsibility,
  salesChannelType,
  taxState,
  taxNotes,
  pulseCategory,
  pulseSubcategory,
  saleItemName,
  saleItemYear,
  saleItemSet,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  inventoryItemId: string;
  saleDate: string;
  quantitySold: number;
  grossSale: number;
  platformFees: number;
  shippingTotalCosts: number;
  otherCosts: number;
  netProceeds: number;
  cogs: number;
  profit: number;
  platform: string;
  notes: string;
  newAvailableQty: number;
  nextStatus: string;
  shippingCharged: number;
  shippingCost: number;
  suppliesCost: number;
  unitCost: number;
  itemQuantity: number;
  pulseCategory: string;
  pulseSubcategory: string;
  saleItemName: string;
  saleItemYear: number | null;
  saleItemSet: string;
} & SalesTaxTrackingInput) {
  const saleInsert = await supabase
    .from("sales")
    .insert({
      user_id: userId,
      inventory_item_id: inventoryItemId,
      sale_date: saleDate,
      quantity_sold: quantitySold,
      gross_sale: grossSale,
      platform_fees: platformFees,
      shipping_cost: shippingTotalCosts,
      other_costs: otherCosts,
      net_proceeds: netProceeds,
      cost_of_goods_sold: cogs,
      profit,
      platform: platform || null,
      notes: notes || null,
      shipping_charged: shippingCharged,
      supplies_cost: suppliesCost,
      sales_tax_collected: salesTaxCollected,
      sales_tax_responsibility: salesTaxResponsibility,
      sales_channel_type: salesChannelType,
      tax_state: taxState || null,
      tax_notes: taxNotes || null,
      sale_item_name: saleItemName || null,
      sale_item_year: saleItemYear,
      sale_item_set: saleItemSet || null,
    })
    .select("id")
    .single();

  if (saleInsert.error || !saleInsert.data) {
    return {
      ok: false as const,
      error: saleInsert.error?.message ?? "Could not record sale",
    };
  }

  const updateInventory = await supabase
    .from("inventory_items")
    .update({
      available_quantity: newAvailableQty,
      status: nextStatus,
      cost_basis_unit: unitCost,
      cost_basis_total: roundMoney(unitCost * itemQuantity),
    })
    .eq("id", inventoryItemId)
    .eq("user_id", userId);

  if (updateInventory.error) {
    return {
      ok: false as const,
      error: updateInventory.error.message,
    };
  }

  await supabase.from("inventory_transactions").insert({
    user_id: userId,
    inventory_item_id: inventoryItemId,
    transaction_type: "sale",
    quantity_change: -quantitySold,
    to_status: nextStatus,
    linked_entity_type: "sale",
    linked_entity_id: saleInsert.data.id,
    amount: grossSale,
    event_date: saleDate,
    notes:
      notes ||
      `Recorded sale${saleItemName ? ` for ${saleItemName}` : ""}. Unit cost ${unitCost.toFixed(2)}, quantity ${quantitySold}, COGS ${cogs.toFixed(2)}. Shipping charged ${shippingCharged.toFixed(2)}, postage ${shippingCost.toFixed(2)}, supplies ${suppliesCost.toFixed(2)}. Sales tax collected ${salesTaxCollected.toFixed(2)} (${salesTaxResponsibility}, ${salesChannelType}). Do not also enter sale-level supplies as a separate manual expense.`,
  });

  const pulseItem = await getInventoryItemForSale({
    supabase,
    userId,
    inventoryItemId,
  });

  if (pulseItem) {
    await recordHitsPulseSaleEvents({
      supabase,
      inventoryItem: pulseItem,
      saleDate,
      quantitySold,
      grossSale,
      platform,
      pulseCategory,
      pulseSubcategory,
      saleItemName,
      saleItemYear,
      saleItemSet,
    });
  }

  return {
    ok: true as const,
    saleId: saleInsert.data.id,
  };
}

export async function createSaleAction(formData: FormData) {
  const { supabase, user } = await requireUser();

  const inventoryItemId = safeText(formData.get("inventory_item_id"));
  const saleDate = safeText(formData.get("sale_date"));
  const quantitySold = safeNumber(formData.get("quantity_sold"));

  const saleItemName = safeText(formData.get("sale_item_name"));
  const saleItemYear = safeOptionalInteger(formData.get("sale_item_year"));
  const saleItemSet = safeText(formData.get("sale_item_set"));

  const enteredUnitCost = safeOptionalNumber(formData.get("sale_unit_cost"));
  const itemSalePrice = safeNumber(formData.get("gross_sale"));
  const shippingChargedInput = safeNumber(formData.get("shipping_charged"));
  const platformFees = safeNumber(formData.get("platform_fees"));
  const shippingCostInput =
    safeOptionalNumber(formData.get("shipping_cost")) ??
    safeOptionalNumber(formData.get("postage_cost")) ??
    0;
  const suppliesCostInput = safeNumber(formData.get("supplies_cost"));
  const otherCosts = safeNumber(formData.get("other_costs"));

  const platform = safeText(formData.get("platform"));
  const notes = safeText(formData.get("notes"));
  const shippingProfileId = safeText(formData.get("shipping_profile_id"));
  const pulseCategory =
    safeText(formData.get("pulse_category")) || "Sports Cards";
  const pulseSubcategory =
    safeText(formData.get("pulse_subcategory")) || "Baseball";

  const salesTaxCollected = roundMoney(
    safeNumber(formData.get("sales_tax_collected")),
  );
  const salesTaxResponsibility = normalizeSalesTaxResponsibility(
    safeText(formData.get("sales_tax_responsibility")),
  );
  const salesChannelType = normalizeSalesChannelType(
    safeText(formData.get("sales_channel_type")),
  );
  const taxState = safeText(formData.get("tax_state")).toUpperCase();
  const taxNotes = safeText(formData.get("tax_notes"));

  if (!inventoryItemId) {
    redirect("/app/inventory?error=Missing inventory item id");
  }

  if (!saleDate) {
    redirect(
      `/app/sales/new?inventory_item_id=${inventoryItemId}&error=Sale date is required`,
    );
  }

  if (quantitySold < 1) {
    redirect(
      `/app/sales/new?inventory_item_id=${inventoryItemId}&error=Quantity sold must be at least 1`,
    );
  }

  if (!saleItemName) {
    redirect(
      `/app/inventory/${inventoryItemId}/sell?error=${encodeURIComponent(
        "Player / Item Name is required before recording sale.",
      )}`,
    );
  }

  const { shippingCharged, shippingCost, suppliesCost } =
    await getShippingDefaults({
      supabase,
      userId: user.id,
      shippingProfileId,
      shippingChargedInput,
      shippingCostInput,
      suppliesCostInput,
    });

  const item = await getInventoryItemForSale({
    supabase,
    userId: user.id,
    inventoryItemId,
  });

  if (!item) {
    redirect("/app/inventory?error=Inventory item not found");
  }

  const availableQty = Number(item.available_quantity ?? 0);

  if (quantitySold > availableQty) {
    redirect(
      `/app/sales/new?inventory_item_id=${inventoryItemId}&error=Quantity sold exceeds available quantity`,
    );
  }

  const unitCost =
    enteredUnitCost && enteredUnitCost > 0
      ? enteredUnitCost
      : getSafeUnitCost(item);

  if (unitCost <= 0) {
    redirect(
      `/app/inventory/${inventoryItemId}/sell?error=${encodeURIComponent(
        "Unit Cost is required before recording sale.",
      )}`,
    );
  }

  const { grossSale, shippingTotalCosts, netProceeds, cogs, profit } =
    calculateSaleNumbers({
      itemSalePrice,
      shippingCharged,
      platformFees,
      shippingCost,
      suppliesCost,
      otherCosts,
      unitCost,
      quantitySold,
    });

  const newAvailableQty = availableQty - quantitySold;
  const nextStatus = newAvailableQty > 0 ? "available" : "sold";

  const result = await insertSaleAndUpdateInventory({
    supabase,
    userId: user.id,
    inventoryItemId,
    saleDate,
    quantitySold,
    grossSale,
    platformFees,
    shippingTotalCosts,
    otherCosts,
    netProceeds,
    cogs,
    profit,
    platform,
    notes,
    newAvailableQty,
    nextStatus,
    shippingCharged,
    shippingCost,
    suppliesCost,
    unitCost,
    itemQuantity: Number(item.quantity ?? quantitySold),
    pulseCategory,
    pulseSubcategory,
    saleItemName,
    saleItemYear,
    saleItemSet,
    salesTaxCollected,
    salesTaxResponsibility,
    salesChannelType,
    taxState,
    taxNotes,
  });

  if (!result.ok) {
    redirect(
      `/app/sales/new?inventory_item_id=${inventoryItemId}&error=${encodeURIComponent(result.error)}`,
    );
  }

  redirect(`/app/inventory/${inventoryItemId}?saleRecorded=1`);
}

export async function quickSellAction(formData: FormData) {
  const { supabase, user } = await requireUser();

  const inventoryItemId = safeText(formData.get("inventory_item_id"));
  const mode = safeText(formData.get("mode"));
  const saleDate =
    safeText(formData.get("sale_date")) ||
    new Date().toISOString().slice(0, 10);

  const itemSalePrice = safeNumber(formData.get("gross_sale"));
  const shippingCharged = safeNumber(formData.get("shipping_charged"));
  const platformFees = safeNumber(formData.get("platform_fees"));
  const shippingCost =
    safeOptionalNumber(formData.get("shipping_cost")) ??
    safeOptionalNumber(formData.get("postage_cost")) ??
    0;
  const suppliesCost = safeNumber(formData.get("supplies_cost"));
  const otherCosts = safeNumber(formData.get("other_costs"));

  const platform = safeText(formData.get("platform"));
  const notes = safeText(formData.get("notes"));
  const pulseCategory =
    safeText(formData.get("pulse_category")) || "Sports Cards";
  const pulseSubcategory =
    safeText(formData.get("pulse_subcategory")) || "Baseball";

  const salesTaxCollected = roundMoney(
    safeNumber(formData.get("sales_tax_collected")),
  );
  const salesTaxResponsibility = normalizeSalesTaxResponsibility(
    safeText(formData.get("sales_tax_responsibility")),
  );
  const salesChannelType = normalizeSalesChannelType(
    safeText(formData.get("sales_channel_type")),
  );
  const taxState = safeText(formData.get("tax_state")).toUpperCase();
  const taxNotes = safeText(formData.get("tax_notes"));

  if (!inventoryItemId) {
    redirect("/app/inventory?error=Missing inventory item id");
  }

  const item = await getInventoryItemForSale({
    supabase,
    userId: user.id,
    inventoryItemId,
  });

  if (!item) {
    redirect("/app/inventory?error=Inventory item not found");
  }

  const availableQty = Number(item.available_quantity ?? 0);

  if (availableQty < 1) {
    redirect("/app/inventory?error=No available quantity to sell");
  }

  const quantitySold =
    mode === "sell_all"
      ? availableQty
      : Math.min(
          Math.max(safeNumber(formData.get("quantity_sold")) || 1, 1),
          availableQty,
        );

  const unitCost = getSafeUnitCost(item);

  if (unitCost <= 0) {
    redirect(buildCostBasisErrorRedirect(inventoryItemId));
  }

  const { grossSale, shippingTotalCosts, netProceeds, cogs, profit } =
    calculateSaleNumbers({
      itemSalePrice,
      shippingCharged,
      platformFees,
      shippingCost,
      suppliesCost,
      otherCosts,
      unitCost,
      quantitySold,
    });

  const newAvailableQty = availableQty - quantitySold;
  const nextStatus = newAvailableQty > 0 ? "available" : "sold";
  const saleItemName =
    safeText(formData.get("sale_item_name")) ||
    String(item.player_name ?? item.title ?? "Quick sale").trim();
  const saleItemYear =
    safeOptionalInteger(formData.get("sale_item_year")) ?? null;
  const saleItemSet = safeText(formData.get("sale_item_set"));

  const result = await insertSaleAndUpdateInventory({
    supabase,
    userId: user.id,
    inventoryItemId,
    saleDate,
    quantitySold,
    grossSale,
    platformFees,
    shippingTotalCosts,
    otherCosts,
    netProceeds,
    cogs,
    profit,
    platform,
    notes,
    newAvailableQty,
    nextStatus,
    shippingCharged,
    shippingCost,
    suppliesCost,
    unitCost,
    itemQuantity: Number(item.quantity ?? quantitySold),
    pulseCategory,
    pulseSubcategory,
    saleItemName,
    saleItemYear,
    saleItemSet,
    salesTaxCollected,
    salesTaxResponsibility,
    salesChannelType,
    taxState,
    taxNotes,
  });

  if (!result.ok) {
    redirect(`/app/inventory?error=${encodeURIComponent(result.error)}`);
  }

  redirect(`/app/inventory/${inventoryItemId}?saleRecorded=1`);
}

export async function updateSaleAction(formData: FormData) {
  const { supabase, user } = await requireUser();

  const saleId = safeText(formData.get("sale_id"));
  const inventoryItemId = safeText(formData.get("inventory_item_id"));
  const saleDate = safeText(formData.get("sale_date"));
  const quantitySold = safeNumber(formData.get("quantity_sold"));
  const grossSale = safeNumber(formData.get("gross_sale"));
  const platformFees = safeNumber(formData.get("platform_fees"));
  const shippingCost = safeNumber(formData.get("shipping_cost"));
  const otherCosts = safeNumber(formData.get("other_costs"));
  const platform = safeText(formData.get("platform"));
  const notes = safeText(formData.get("notes"));

  if (!saleId) {
    redirect("/app/sales?error=Missing sale id");
  }

  if (!inventoryItemId) {
    redirect("/app/sales?error=Missing inventory item id");
  }

  if (!saleDate) {
    redirect(`/app/sales/${saleId}/edit?error=Sale date is required`);
  }

  if (quantitySold < 1) {
    redirect(
      `/app/sales/${saleId}/edit?error=Quantity sold must be at least 1`,
    );
  }

  const [saleResponse, itemResponse] = await Promise.all([
    supabase
      .from("sales")
      .select(
        `
        id,
        inventory_item_id,
        quantity_sold,
        gross_sale,
        platform_fees,
        shipping_cost,
        other_costs,
        net_proceeds,
        cost_of_goods_sold,
        profit,
        shipping_charged,
        supplies_cost,
        sales_tax_collected,
        sales_tax_responsibility,
        sales_channel_type,
        tax_state,
        tax_notes,
        sale_item_name,
        sale_item_year,
        sale_item_set,
        reversed_at
      `,
      )
      .eq("id", saleId)
      .eq("user_id", user.id)
      .single(),

    supabase
      .from("inventory_items")
      .select(
        `
        id,
        available_quantity,
        quantity,
        cost_basis_unit,
        cost_basis_total,
        status
      `,
      )
      .eq("id", inventoryItemId)
      .eq("user_id", user.id)
      .single(),
  ]);

  if (saleResponse.error || !saleResponse.data) {
    redirect("/app/sales?error=Sale not found");
  }

  if (itemResponse.error || !itemResponse.data) {
    redirect("/app/inventory?error=Inventory item not found");
  }

  const existingSale = saleResponse.data;
  const item = itemResponse.data;

  if (existingSale.reversed_at) {
    redirect(
      `/app/sales/${saleId}/edit?error=Cannot edit a deleted/reversed sale`,
    );
  }

  const oldQtySold = Number(existingSale.quantity_sold ?? 0);
  const currentAvailableQty = Number(item.available_quantity ?? 0);
  const editableMaxQty = currentAvailableQty + oldQtySold;

  if (quantitySold > editableMaxQty) {
    redirect(
      `/app/sales/${saleId}/edit?error=Quantity sold exceeds editable max quantity`,
    );
  }

  const unitCost = getSafeUnitCost(item);

  if (unitCost <= 0) {
    redirect(
      buildCostBasisErrorRedirect(inventoryItemId, `/app/sales/${saleId}/edit`),
    );
  }

  const salesTaxCollected =
    safeOptionalNumber(formData.get("sales_tax_collected")) ??
    Number(existingSale.sales_tax_collected ?? 0);
  const salesTaxResponsibility = normalizeSalesTaxResponsibility(
    safeText(formData.get("sales_tax_responsibility")) ||
      String(existingSale.sales_tax_responsibility ?? "marketplace_collected"),
  );
  const salesChannelType = normalizeSalesChannelType(
    safeText(formData.get("sales_channel_type")) ||
      String(existingSale.sales_channel_type ?? "marketplace"),
  );
  const taxState =
    safeText(formData.get("tax_state")).toUpperCase() ||
    String(existingSale.tax_state ?? "");
  const taxNotes =
    safeText(formData.get("tax_notes")) || String(existingSale.tax_notes ?? "");
  const saleItemName =
    safeText(formData.get("sale_item_name")) ||
    String(existingSale.sale_item_name ?? "");
  const saleItemYear =
    safeOptionalInteger(formData.get("sale_item_year")) ??
    (existingSale.sale_item_year === null
      ? null
      : Number(existingSale.sale_item_year ?? 0));
  const saleItemSet =
    safeText(formData.get("sale_item_set")) ||
    String(existingSale.sale_item_set ?? "");

  const netProceeds = roundMoney(
    grossSale - platformFees - shippingCost - otherCosts,
  );
  const cogs = roundMoney(unitCost * quantitySold);
  const profit = roundMoney(netProceeds - cogs);

  const restoredAvailableQty = currentAvailableQty + oldQtySold;
  const newAvailableQty = restoredAvailableQty - quantitySold;
  const nextStatus = newAvailableQty > 0 ? "available" : "sold";

  const saleUpdate = await supabase
    .from("sales")
    .update({
      sale_date: saleDate,
      quantity_sold: quantitySold,
      gross_sale: grossSale,
      platform_fees: platformFees,
      shipping_cost: shippingCost,
      other_costs: otherCosts,
      net_proceeds: netProceeds,
      cost_of_goods_sold: cogs,
      profit,
      platform: platform || null,
      notes: notes || null,
      sales_tax_collected: roundMoney(salesTaxCollected),
      sales_tax_responsibility: salesTaxResponsibility,
      sales_channel_type: salesChannelType,
      tax_state: taxState || null,
      tax_notes: taxNotes || null,
      sale_item_name: saleItemName || null,
      sale_item_year: saleItemYear,
      sale_item_set: saleItemSet || null,
      reversed_at: null,
    })
    .eq("id", saleId)
    .eq("user_id", user.id);

  if (saleUpdate.error) {
    redirect(
      `/app/sales/${saleId}/edit?error=${encodeURIComponent(saleUpdate.error.message)}`,
    );
  }

  const inventoryUpdate = await supabase
    .from("inventory_items")
    .update({
      available_quantity: newAvailableQty,
      status: nextStatus,
    })
    .eq("id", inventoryItemId)
    .eq("user_id", user.id);

  if (inventoryUpdate.error) {
    redirect(
      `/app/sales/${saleId}/edit?error=${encodeURIComponent(inventoryUpdate.error.message)}`,
    );
  }

  await supabase.from("inventory_transactions").insert({
    user_id: user.id,
    inventory_item_id: inventoryItemId,
    transaction_type: "sale_edit",
    quantity_change: oldQtySold - quantitySold,
    to_status: nextStatus,
    linked_entity_type: "sale",
    linked_entity_id: saleId,
    amount: grossSale,
    event_date: saleDate,
    notes:
      notes ||
      `Edited sale. Previous qty ${oldQtySold}, new qty ${quantitySold}. Unit cost ${unitCost.toFixed(2)}, COGS ${cogs.toFixed(2)}. Sales tax collected ${roundMoney(salesTaxCollected).toFixed(2)} (${salesTaxResponsibility}, ${salesChannelType}).`,
  });

  redirect(`/app/inventory/${inventoryItemId}?updatedSale=1`);
}

export async function deleteSaleAction(formData: FormData) {
  const { supabase, user } = await requireUser();

  const saleId = safeText(formData.get("sale_id"));
  const inventoryItemId = safeText(formData.get("inventory_item_id"));

  if (!saleId) {
    redirect("/app/sales?error=Missing sale id");
  }

  if (!inventoryItemId) {
    redirect("/app/sales?error=Missing inventory item id");
  }

  const [saleResponse, itemResponse] = await Promise.all([
    supabase
      .from("sales")
      .select(
        `
        id,
        inventory_item_id,
        sale_date,
        quantity_sold,
        gross_sale,
        notes,
        reversed_at
      `,
      )
      .eq("id", saleId)
      .eq("user_id", user.id)
      .single(),

    supabase
      .from("inventory_items")
      .select(
        `
        id,
        available_quantity,
        quantity,
        status
      `,
      )
      .eq("id", inventoryItemId)
      .eq("user_id", user.id)
      .single(),
  ]);

  if (saleResponse.error || !saleResponse.data) {
    redirect("/app/sales?error=Sale not found");
  }

  if (itemResponse.error || !itemResponse.data) {
    redirect("/app/inventory?error=Inventory item not found");
  }

  const sale = saleResponse.data;
  const item = itemResponse.data;

  if (sale.reversed_at) {
    redirect(`/app/inventory/${inventoryItemId}?error=Sale already deleted`);
  }

  const qtySold = Number(sale.quantity_sold ?? 0);
  const currentAvailableQty = Number(item.available_quantity ?? 0);
  const restoredAvailableQty = currentAvailableQty + qtySold;
  const nextStatus = restoredAvailableQty > 0 ? "available" : "sold";

  const saleDelete = await supabase
    .from("sales")
    .update({
      reversed_at: new Date().toISOString(),
    })
    .eq("id", saleId)
    .eq("user_id", user.id);

  if (saleDelete.error) {
    redirect(
      `/app/sales/${saleId}/edit?error=${encodeURIComponent(saleDelete.error.message)}`,
    );
  }

  const inventoryUpdate = await supabase
    .from("inventory_items")
    .update({
      available_quantity: restoredAvailableQty,
      status: nextStatus,
    })
    .eq("id", inventoryItemId)
    .eq("user_id", user.id);

  if (inventoryUpdate.error) {
    redirect(
      `/app/sales/${saleId}/edit?error=${encodeURIComponent(inventoryUpdate.error.message)}`,
    );
  }

  await supabase.from("inventory_transactions").insert({
    user_id: user.id,
    inventory_item_id: inventoryItemId,
    transaction_type: "sale_delete",
    quantity_change: qtySold,
    to_status: nextStatus,
    linked_entity_type: "sale",
    linked_entity_id: saleId,
    amount: Number(sale.gross_sale ?? 0),
    event_date: sale.sale_date,
    notes: sale.notes || "Sale deleted/reversed from edit screen.",
  });

  redirect(`/app/inventory/${inventoryItemId}?deletedSale=1`);
}
