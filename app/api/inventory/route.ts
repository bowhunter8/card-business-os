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
  shippingPaid?: number;
  salesTaxPaid?: number;
  otherPurchaseFees?: number;
  totalPurchaseCost?: number;
  estimatedValue?: number;
  source?: string;
  breakId?: string;
  acquiredDate?: string;
  notes?: string;
  checklistId?: string;
  checklistItemId?: string;
  bulkLot?: {
    lotName?: string;
    lotDescription?: string;
    itemCount?: number;
    estimatedTotalValue?: number;
    items?: BulkLotItemInput[];
  } | null;
};


type AutoLinkChecklistRow = {
  id: string;
  year: string | number | null;
  manufacturer: string | null;
  brand: string | null;
  product_name: string | null;
  name: string | null;
};

type AutoLinkChecklistItemRow = {
  id: string;
  checklist_id: string;
  section_id: string | null;
  card_number: string | null;
  player_name: string | null;
  parallel_name: string | null;
  variation: string | null;
  auto_flag: boolean | null;
  relic_flag: boolean | null;
  serial_flag: boolean | null;
  print_run: number | null;
};

type AutoLinkSectionRow = {
  id: string;
  name: string | null;
};

type AutoLinkInventoryRow = {
  id: string;
  title: string | null;
  player_name: string | null;
  year: string | number | null;
  brand: string | null;
  set_name: string | null;
  card_number: string | null;
  parallel_name: string | null;
  notes: string | null;
  checklist_id: string | null;
  checklist_item_id: string | null;
};

type AutoLinkResult = {
  checklistId: string;
  checklistItemId: string;
};

type InventoryRowInsert = {
  user_id: string;
  title: string;
  player_name: string | null;
  year: string | null;
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
  shipping_paid: number;
  sales_tax_paid: number;
  other_purchase_fees: number;
  total_purchase_cost: number;
  source_type: string;
  source_break_id: string | null;
  checklist_id: string | null;
  checklist_item_id: string | null;
};

function toSafeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toMoneyNumber(value: unknown): number {
  const num = Math.max(0, toSafeNumber(value, 0));
  return Number(num.toFixed(2));
}

function toSafeBool(value: unknown): boolean {
  return value === true;
}

function toSafeYear(value: unknown): string | null {
  const text = toSafeString(value);
  return text || null;
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


function normalizeAutoLinkText(value: unknown): string {
  return toSafeString(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAutoLinkYear(value: unknown): string {
  return toSafeString(value).toLowerCase().replace(/\s+/g, "");
}

function normalizeAutoLinkCardNumber(value: unknown): string {
  return toSafeString(value)
    .toUpperCase()
    .replace(/^#/, "")
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-")
    .trim();
}

function normalizeAutoLinkPlayer(value: unknown): string {
  return normalizeAutoLinkText(value)
    .replace(/\b(?:chrome|paper)\b/g, " ")
    .replace(/\b(?:rc|rookie|rookie card)\b/g, " ")
    .replace(/\b(?:1st|first bowman|1st bowman)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function autoLinkTokenSet(value: unknown): Set<string> {
  return new Set(
    normalizeAutoLinkText(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  );
}

function autoLinkProductCompatible(
  checklist: AutoLinkChecklistRow,
  inventory: AutoLinkInventoryRow
): boolean {
  if (
    normalizeAutoLinkYear(checklist.year) &&
    normalizeAutoLinkYear(inventory.year) &&
    normalizeAutoLinkYear(checklist.year) !== normalizeAutoLinkYear(inventory.year)
  ) {
    return false;
  }

  const checklistText = normalizeAutoLinkText(
    [checklist.brand, checklist.product_name, checklist.name]
      .filter(Boolean)
      .join(" ")
  );

  const inventoryText = normalizeAutoLinkText(
    [inventory.brand, inventory.set_name, inventory.title]
      .filter(Boolean)
      .join(" ")
  );

  if (!checklistText || !inventoryText) return false;

  const ignoredTokens = new Set([
    "baseball",
    "card",
    "cards",
    "checklist",
    "the",
  ]);

  const checklistTokens = checklistText
    .split(" ")
    .filter(
      (token) =>
        token &&
        !ignoredTokens.has(token) &&
        !/^(?:19|20)\d{2}$/.test(token)
    );

  const inventoryTokens = autoLinkTokenSet(inventoryText);

  const productDiscriminators = [
    "chrome",
    "draft",
    "sapphire",
    "finest",
    "heritage",
    "prizm",
    "select",
    "donruss",
    "sterling",
    "pro",
    "debut",
    "update",
  ];

  for (const discriminator of productDiscriminators) {
    const checklistHas = checklistTokens.includes(discriminator);
    const inventoryHas = inventoryTokens.has(discriminator);

    if (checklistHas !== inventoryHas) return false;
  }

  const manufacturerTokens = new Set([
    "topps",
    "bowman",
    "panini",
    "donruss",
    "upper",
    "deck",
  ]);

  const checklistMakerTokens = checklistTokens.filter((token) =>
    manufacturerTokens.has(token)
  );

  if (
    checklistMakerTokens.length > 0 &&
    !checklistMakerTokens.some((token) => inventoryTokens.has(token))
  ) {
    return false;
  }

  const meaningfulChecklistTokens = checklistTokens.filter(
    (token) => !manufacturerTokens.has(token)
  );

  if (meaningfulChecklistTokens.length === 0) return true;

  return meaningfulChecklistTokens.some((token) =>
    inventoryTokens.has(token)
  );
}

function autoLinkSpecialEvidence(inventory: AutoLinkInventoryRow): string {
  return normalizeAutoLinkText(
    [
      inventory.parallel_name,
      inventory.notes,
      inventory.title,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function autoLinkSectionIdentity(sectionName: string | null): string {
  const genericWords = new Set([
    "base",
    "chrome",
    "prospect",
    "prospects",
    "autograph",
    "autographs",
    "auto",
    "autos",
    "cards",
    "card",
    "set",
    "retail",
  ]);

  return normalizeAutoLinkText(sectionName)
    .split(" ")
    .filter((token) => token && !genericWords.has(token))
    .join(" ")
    .trim();
}

function autoLinkSpecialness(
  item: AutoLinkChecklistItemRow,
  sectionName: string | null
): number {
  let score = 0;

  if (toSafeString(item.parallel_name)) score += 4;
  if (toSafeString(item.variation)) score += 4;
  if (item.auto_flag === true) score += 2;
  if (item.relic_flag === true) score += 2;
  if (item.serial_flag === true || Number(item.print_run ?? 0) > 0) score += 2;
  if (autoLinkSectionIdentity(sectionName)) score += 1;

  return score;
}

function autoLinkEvidenceScore(
  item: AutoLinkChecklistItemRow,
  sectionName: string | null,
  inventoryEvidence: string
): number {
  if (!inventoryEvidence) return 0;

  let score = 0;

  const phrases = [
    toSafeString(item.parallel_name),
    toSafeString(item.variation),
    autoLinkSectionIdentity(sectionName),
  ].filter(Boolean);

  for (const phrase of phrases) {
    const normalizedPhrase = normalizeAutoLinkText(phrase);

    if (normalizedPhrase && inventoryEvidence.includes(normalizedPhrase)) {
      score += 10;
      continue;
    }

    const tokens = normalizedPhrase
      .split(" ")
      .filter((token) => token.length >= 3);

    if (
      tokens.length > 0 &&
      tokens.every((token) => inventoryEvidence.includes(token))
    ) {
      score += 6;
    }
  }

  if (
    item.auto_flag === true &&
    /\b(auto|autograph|signed)\b/.test(inventoryEvidence)
  ) {
    score += 4;
  }

  if (
    item.relic_flag === true &&
    /\b(relic|patch|jersey|memorabilia)\b/.test(inventoryEvidence)
  ) {
    score += 4;
  }

  if (
    (item.serial_flag === true || Number(item.print_run ?? 0) > 0) &&
    /(?:\/\s*\d+\b|\b\d+\s*\/\s*\d+\b|numbered|serial)/.test(inventoryEvidence)
  ) {
    score += 4;
  }

  return score;
}

async function tryAutoLinkInventoryItem({
  supabase,
  inventory,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  inventory: AutoLinkInventoryRow;
}): Promise<AutoLinkResult | null> {
  if (inventory.checklist_item_id || inventory.checklist_id) return null;

  const year = normalizeAutoLinkYear(inventory.year);
  const player = normalizeAutoLinkPlayer(inventory.player_name);
  const cardNumber = normalizeAutoLinkCardNumber(inventory.card_number);
  const productText = normalizeAutoLinkText(
    [inventory.brand, inventory.set_name, inventory.title]
      .filter(Boolean)
      .join(" ")
  );

  // Do not guess. These four pieces are the minimum identity needed for the
  // save-time shortcut. Older/unlinked inventory remains handled by the normal
  // checklist matcher.
  if (!year || !player || !cardNumber || !productText) return null;

  const { data: checklistData, error: checklistError } = await supabase
    .from("checklists")
    .select("id, year, manufacturer, brand, product_name, name")
    .eq("is_active", true)
    .is("superseded_by_checklist_id", null);

  if (checklistError || !Array.isArray(checklistData)) return null;

  const compatibleChecklists = (checklistData as AutoLinkChecklistRow[]).filter(
    (checklist) =>
      normalizeAutoLinkYear(checklist.year) === year &&
      autoLinkProductCompatible(checklist, inventory)
  );

  if (compatibleChecklists.length === 0) return null;

  const checklistIds = compatibleChecklists.map((checklist) => checklist.id);

  const rawCardNumber = toSafeString(inventory.card_number);
  const cardNumberCandidates = Array.from(
    new Set([
      rawCardNumber,
      cardNumber,
      `#${cardNumber}`,
    ].filter(Boolean))
  );

  const { data: itemData, error: itemError } = await supabase
    .from("checklist_items")
    .select(
      "id, checklist_id, section_id, card_number, player_name, parallel_name, variation, auto_flag, relic_flag, serial_flag, print_run"
    )
    .in("checklist_id", checklistIds)
    .in("card_number", cardNumberCandidates);

  if (itemError || !Array.isArray(itemData)) return null;

  const playerAndNumberMatches = (
    itemData as AutoLinkChecklistItemRow[]
  ).filter(
    (item) =>
      normalizeAutoLinkCardNumber(item.card_number) === cardNumber &&
      normalizeAutoLinkPlayer(item.player_name) === player
  );

  if (playerAndNumberMatches.length === 0) return null;

  const sectionIds = Array.from(
    new Set(
      playerAndNumberMatches
        .map((item) => item.section_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const sectionNameById = new Map<string, string | null>();

  if (sectionIds.length > 0) {
    const { data: sectionData, error: sectionError } = await supabase
      .from("checklist_sections")
      .select("id, name")
      .in("id", sectionIds);

    if (!sectionError && Array.isArray(sectionData)) {
      for (const section of sectionData as AutoLinkSectionRow[]) {
        sectionNameById.set(section.id, section.name);
      }
    }
  }

  const evidence = autoLinkSpecialEvidence(inventory);

  const ranked = playerAndNumberMatches
    .map((item) => {
      const sectionName = item.section_id
        ? sectionNameById.get(item.section_id) ?? null
        : null;

      return {
        item,
        evidenceScore: autoLinkEvidenceScore(item, sectionName, evidence),
        specialness: autoLinkSpecialness(item, sectionName),
      };
    })
    .sort((left, right) => {
      if (right.evidenceScore !== left.evidenceScore) {
        return right.evidenceScore - left.evidenceScore;
      }

      return left.specialness - right.specialness;
    });

  if (ranked.length === 0) return null;

  const best = ranked[0];
  const second = ranked[1];

  if (best.evidenceScore > 0) {
    if (
      second &&
      second.evidenceScore === best.evidenceScore &&
      second.specialness === best.specialness
    ) {
      return null;
    }
  } else {
    // No special-version evidence: use the unique least-special/default row.
    // This follows the same family-first rule used by the checklist matcher.
    if (
      second &&
      second.specialness === best.specialness
    ) {
      return null;
    }
  }

  const { error: updateError } = await supabase
    .from(INVENTORY_TABLE)
    .update({
      checklist_id: best.item.checklist_id,
      checklist_item_id: best.item.id,
    })
    .eq("id", inventory.id);

  if (updateError) return null;

  return {
    checklistId: best.item.checklist_id,
    checklistItemId: best.item.id,
  };
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
  shippingPaid = 0,
  salesTaxPaid = 0,
  otherPurchaseFees = 0,
  totalPurchaseCost = totalCost,
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
  shippingPaid?: number;
  salesTaxPaid?: number;
  otherPurchaseFees?: number;
  totalPurchaseCost?: number;
  itemType: string;
  status: string;
  notes: string | null;
  playerName?: string | null;
  year?: string | null;
  brand?: string | null;
  setName?: string | null;
  cardNumber?: string | null;
  parallelName?: string | null;
  team?: string | null;
}): InventoryRowInsert {
  const sourceText = toSafeString(body.source);
  const breakUuid = toSafeUuid(body.breakId);
  const checklistUuid = toSafeUuid(body.checklistId);
  const checklistItemUuid = toSafeUuid(body.checklistItemId);

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
    shipping_paid: shippingPaid,
    sales_tax_paid: salesTaxPaid,
    other_purchase_fees: otherPurchaseFees,
    total_purchase_cost: totalPurchaseCost,
    source_type: breakUuid ? "break" : "manual",
    source_break_id: breakUuid,
    checklist_id: checklistUuid,
    checklist_item_id: checklistItemUuid,
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
      const shippingPaid = toMoneyNumber(body.shippingPaid);
      const salesTaxPaid = toMoneyNumber(body.salesTaxPaid);
      const otherPurchaseFees = toMoneyNumber(body.otherPurchaseFees);
      const totalPurchaseCost = toMoneyNumber(
        totalCost + shippingPaid + salesTaxPaid + otherPurchaseFees
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
        shippingPaid,
        salesTaxPaid,
        otherPurchaseFees,
        totalPurchaseCost,
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
    const shippingPaid = toMoneyNumber(body.shippingPaid);
    const salesTaxPaid = toMoneyNumber(body.salesTaxPaid);
    const otherPurchaseFees = toMoneyNumber(body.otherPurchaseFees);
    const totalPurchaseCost = toMoneyNumber(
      totalCost + shippingPaid + salesTaxPaid + otherPurchaseFees
    );

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
      shippingPaid,
      salesTaxPaid,
      otherPurchaseFees,
      totalPurchaseCost,
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

    let returnedItem = data;

    // Manual single-card entry shortcut:
    // if the card was not already launched from a checklist and the saved
    // structured identity is strong enough, quietly attach the exact checklist
    // IDs. Failure or ambiguity never blocks the inventory save.
    if (
      data &&
      typeof data === "object" &&
      !row.checklist_id &&
      !row.checklist_item_id
    ) {
      try {
        const autoLink = await tryAutoLinkInventoryItem({
          supabase,
          inventory: data as AutoLinkInventoryRow,
        });

        if (autoLink) {
          returnedItem = {
            ...data,
            checklist_id: autoLink.checklistId,
            checklist_item_id: autoLink.checklistItemId,
          };
        }
      } catch {
        // Auto-linking is a convenience only. The normal checklist matcher
        // remains the fallback, so a lookup failure must never fail the save.
      }
    }

    return NextResponse.json({
      success: true,
      item: returnedItem,
      message: "Inventory item created successfully.",
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: `Failed to create inventory item: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}
