import "server-only";

import { createClient } from "@/lib/supabase/server";

const EBAY_TRADING_CARD_CATEGORY_ID = "261328";
const EBAY_DEFAULT_COUNTRY_OF_ORIGIN = "United States";
const EBAY_DEFAULT_SPORT = "Baseball";
const EBAY_DEFAULT_FORMAT = "FixedPrice";
const EBAY_TITLE_MAX_LENGTH = 80;

const EBAY_INFO_ROWS = [
  "#INFO,Version=0.0.2,Template= eBay-draft-listings-template_US,,,,,,,,",
  "#INFO Action and Category ID are required fields. 1) Set Action to Draft 2) Please find the category ID for your listings here: https://pages.ebay.com/sellerinformation/news/categorychanges.html,,,,,,,,,,",
  "\"#INFO After you've successfully uploaded your draft from the Seller Hub Reports tab, complete your drafts to active listings here: https://www.ebay.com/sh/lst/drafts\",,,,,,,,,,",
  "#INFO,,,,,,,,,,",
];

const EBAY_HEADERS = [
  "Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)",
  "Custom label (SKU)",
  "Category ID",
  "Title",
  "UPC",
  "Price",
  "Quantity",
  "Item photo URL",
  "Condition ID",
  "Description",
  "Format",
  "C:Sport",
  "C:Player/Athlete",
  "C:Manufacturer",
  "C:Set",
  "C:Card Number",
  "C:Year Manufactured",
  "C:Season",
  "C:Parallel/Variety",
  "C:Autographed",
  "C:Signed By",
  "C:Features",
  "C:Print Run",
  "C:Team",
  "C:Country of Origin",
] as const;

type InventoryItemForEbay = {
  id: string;
  status: string | null;
  item_type: string | null;
  title: string | null;
  player_name: string | null;
  year: string | number | null;
  brand: string | null;
  set_name: string | null;
  card_number: string | null;
  parallel_name: string | null;
  team: string | null;
  quantity: number | null;
  available_quantity: number | null;
  notes: string | null;
};

type EbayDraftRow = Record<(typeof EBAY_HEADERS)[number], string>;

export type EbayDraftCsvResult = {
  filename: string;
  csv: string;
  itemCount: number;
};

function clean(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLeadingHash(value: string | null | undefined) {
  return clean(value).replace(/^#/, "");
}

function includesLoose(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function joinUnique(parts: Array<string | null | undefined>) {
  const output: string[] = [];

  for (const rawPart of parts) {
    const part = clean(rawPart);
    if (!part) continue;

    const alreadyIncluded = output.some(
      (existing) =>
        existing.toLowerCase() === part.toLowerCase() ||
        existing.toLowerCase().includes(part.toLowerCase()),
    );

    if (!alreadyIncluded) output.push(part);
  }

  return output.join(" ");
}

function manufacturerFor(item: InventoryItemForEbay) {
  const source = `${clean(item.brand)} ${clean(item.set_name)} ${clean(item.title)}`.toLowerCase();

  if (
    source.includes("topps") ||
    source.includes("bowman")
  ) {
    return "Topps";
  }

  if (source.includes("upper deck")) return "Upper Deck";

  if (
    source.includes("panini") ||
    source.includes("donruss") ||
    source.includes("prizm") ||
    source.includes("select") ||
    source.includes("optic") ||
    source.includes("mosaic")
  ) {
    return "Panini";
  }

  if (source.includes("leaf")) return "Leaf";

  return clean(item.brand);
}

function setFor(item: InventoryItemForEbay) {
  const setName = clean(item.set_name);
  if (setName) return setName;

  const year = clean(item.year);
  const brand = clean(item.brand);

  return joinUnique([year, brand]);
}

function featureData(item: InventoryItemForEbay) {
  const source = [
    item.title,
    item.notes,
    item.parallel_name,
    item.set_name,
    item.item_type,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");

  const features: string[] = [];

  if (/\b1st\s+bowman\b/i.test(source)) {
    features.push("1st Bowman");
  }

  if (/\bfuture\s+stars?\b/i.test(source)) {
    features.push("Future Stars");
  }

  if (
    /\brookie\s+card\b/i.test(source) ||
    /\brookie\b/i.test(source) ||
    /(^|[\s(/-])rc([\s)/-]|$)/i.test(source)
  ) {
    features.push("Rookie");
  }

  if (
    /\berror\b/i.test(source) ||
    /\berr\b/i.test(source)
  ) {
    features.push("Error");
  }

  const serialMatch =
    source.match(/(?:^|[\s(])(\d{1,6})\s*\/\s*(\d{1,6})(?:\b|\))/) ||
    source.match(/(?:^|[\s(])\/\s*(\d{1,6})(?:\b|\))/);

  let serialNumber = "";
  let printRun = "";

  if (serialMatch) {
    if (serialMatch.length >= 3 && serialMatch[2]) {
      serialNumber = `${serialMatch[1]}/${serialMatch[2]}`;
      printRun = serialMatch[2];
    } else if (serialMatch[1]) {
      printRun = serialMatch[1];
    }

    features.push("Serial Numbered");
  }

  const isAutographed =
    /\bauto\b/i.test(source) ||
    /\bautograph(?:ed)?\b/i.test(source) ||
    /\bsigned\b/i.test(source);

  return {
    features: Array.from(new Set(features)).join("|"),
    printRun,
    serialNumber,
    autographed: isAutographed ? "Yes" : "",
    signedBy: isAutographed ? clean(item.player_name) : "",
  };
}

function buildEbayTitle(item: InventoryItemForEbay) {
  const player = clean(item.player_name);
  const year = clean(item.year);
  const setName = setFor(item);
  const parallel = clean(item.parallel_name);
  const cardNumber = stripLeadingHash(item.card_number);
  const team = clean(item.team);
  const source = `${clean(item.title)} ${clean(item.notes)}`;
  const features = featureData(item);

  const specialTerms: string[] = [];

  if (/\b1st\s+bowman\b/i.test(source)) specialTerms.push("1st Bowman");

  if (
    /\bauto\b/i.test(source) ||
    /\bautograph(?:ed)?\b/i.test(source)
  ) {
    specialTerms.push("Auto");
  }

  if (/\bfuture\s+stars?\b/i.test(source)) specialTerms.push("Future Stars");

  if (
    /\brookie\s+card\b/i.test(source) ||
    /\brookie\b/i.test(source) ||
    /(^|[\s(/-])rc([\s)/-]|$)/i.test(source)
  ) {
    specialTerms.push("Rookie Card");
  }

  if (/\bbloody\s+elbow\b/i.test(source)) {
    specialTerms.push("Bloody Elbow Error");
  } else if (/\berror\b/i.test(source) || /\berr\b/i.test(source)) {
    specialTerms.push("Error");
  }

  const parts = [
    player,
    year,
    setName,
    parallel,
    cardNumber ? `#${cardNumber}` : "",
    features.serialNumber,
    ...specialTerms,
    team,
  ];

  let title = joinUnique(parts);

  if (!title) {
    title = clean(item.title) || player || "Trading Card";
  }

  if (title.length <= EBAY_TITLE_MAX_LENGTH) return title;

  // Preserve the beginning of the title, where the player/year/set/card info
  // normally lives, and avoid cutting in the middle of a word when possible.
  const shortened = title.slice(0, EBAY_TITLE_MAX_LENGTH + 1);
  const lastSpace = shortened.lastIndexOf(" ");

  return shortened
    .slice(0, lastSpace >= 55 ? lastSpace : EBAY_TITLE_MAX_LENGTH)
    .trim();
}

function buildDescription(item: InventoryItemForEbay) {
  const player = clean(item.player_name);
  const year = clean(item.year);
  const setName = setFor(item);
  const parallel = clean(item.parallel_name);
  const cardNumber = stripLeadingHash(item.card_number);
  const features = featureData(item);

  const source = `${clean(item.title)} ${clean(item.notes)}`;
  const descriptors: string[] = [];

  if (/\b1st\s+bowman\b/i.test(source)) descriptors.push("1st Bowman");

  if (features.autographed === "Yes") {
    descriptors.push("Autograph");
  }

  if (/\bfuture\s+stars?\b/i.test(source)) descriptors.push("Future Stars");

  if (
    /\brookie\s+card\b/i.test(source) ||
    /\brookie\b/i.test(source) ||
    /(^|[\s(/-])rc([\s)/-]|$)/i.test(source)
  ) {
    descriptors.push("Rookie Card");
  }

  if (/\berror\b/i.test(source) || /\berr\b/i.test(source)) {
    descriptors.push("Error");
  }

  const opening = joinUnique([
    year,
    setName,
    player,
    ...descriptors,
    cardNumber ? `#${cardNumber}` : "",
    parallel,
  ]);

  const serialText = features.printRun
    ? features.serialNumber
      ? `, serial numbered ${features.serialNumber}`
      : `, serial numbered /${features.printRun}`
    : "";

  const firstSentence = `${opening || clean(item.title) || "Trading card"}${serialText}.`;

  return `${firstSentence} Card pictured is the card you will receive. Please review photos for condition. Card will be packaged securely for shipping.`;
}

function csvEscape(value: string) {
  if (
    value.includes(",") ||
    value.includes("\"") ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }

  return value;
}

function buildRow(item: InventoryItemForEbay): EbayDraftRow {
  const featureInfo = featureData(item);
  const year = clean(item.year);

  return {
    "Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)":
      "Draft",
    "Custom label (SKU)": item.id,
    "Category ID": EBAY_TRADING_CARD_CATEGORY_ID,
    Title: buildEbayTitle(item),
    UPC: "",
    Price: "",
    Quantity: "1",
    "Item photo URL": "",
    "Condition ID": "",
    Description: buildDescription(item),
    Format: EBAY_DEFAULT_FORMAT,
    "C:Sport": EBAY_DEFAULT_SPORT,
    "C:Player/Athlete": clean(item.player_name),
    "C:Manufacturer": manufacturerFor(item),
    "C:Set": setFor(item),
    "C:Card Number": stripLeadingHash(item.card_number),
    "C:Year Manufactured": year,
    "C:Season": year,
    "C:Parallel/Variety": clean(item.parallel_name),
    "C:Autographed": featureInfo.autographed,
    "C:Signed By": featureInfo.signedBy,
    "C:Features": featureInfo.features,
    "C:Print Run": featureInfo.printRun,
    "C:Team": clean(item.team),
    "C:Country of Origin": EBAY_DEFAULT_COUNTRY_OF_ORIGIN,
  };
}

function buildCsv(items: InventoryItemForEbay[]) {
  const headerLine = EBAY_HEADERS.map(csvEscape).join(",");

  const dataLines = items.map((item) => {
    const row = buildRow(item);
    return EBAY_HEADERS.map((header) => csvEscape(row[header])).join(",");
  });

  // The BOM helps Excel open the file as UTF-8 without changing eBay's
  // tested Seller Hub Reports structure.
  return `\uFEFF${[...EBAY_INFO_ROWS, headerLine, ...dataLines].join("\r\n")}\r\n`;
}

function assertExportable(item: InventoryItemForEbay) {
  const availableQuantity = Number(item.available_quantity ?? 0);

  if (!Number.isFinite(availableQuantity) || availableQuantity <= 0) {
    throw new Error(
      `${clean(item.title) || clean(item.player_name) || "Inventory item"} has no available quantity to export.`,
    );
  }

  if (
    item.status === "giveaway" ||
    item.status === "personal" ||
    item.status === "junk" ||
    item.status === "sold"
  ) {
    throw new Error(
      `${clean(item.title) || clean(item.player_name) || "Inventory item"} is not currently sellable and cannot be exported to an eBay draft.`,
    );
  }
}

export async function getEbayDraftCsvForInventoryIds(
  inventoryItemIds: string[],
): Promise<EbayDraftCsvResult> {
  const ids = Array.from(
    new Set(
      inventoryItemIds
        .map((value) => clean(value))
        .filter(Boolean),
    ),
  );

  if (ids.length === 0) {
    throw new Error("Select at least one inventory item to export.");
  }

  if (ids.length > 2000) {
    throw new Error("A single HITS eBay draft export cannot exceed 2,000 items.");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to export eBay drafts.");
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .select(
      `
        id,
        status,
        item_type,
        title,
        player_name,
        year,
        brand,
        set_name,
        card_number,
        parallel_name,
        team,
        quantity,
        available_quantity,
        notes
      `,
    )
    .eq("user_id", user.id)
    .in("id", ids)
    .is("deleted_at", null);

  if (error) {
    throw new Error(`Unable to load inventory for eBay export: ${error.message}`);
  }

  const items = (data ?? []) as InventoryItemForEbay[];

  if (items.length !== ids.length) {
    throw new Error(
      "One or more selected inventory items could not be found or do not belong to the signed-in user.",
    );
  }

  // Supabase does not guarantee that an IN query returns rows in the same
  // order as the supplied IDs. Preserve the user's selection/order here.
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const orderedItems = ids
    .map((itemId) => itemsById.get(itemId))
    .filter((item): item is InventoryItemForEbay => Boolean(item));

  orderedItems.forEach(assertExportable);

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);

  return {
    filename: `HITS-eBay-Drafts-${timestamp}.csv`,
    csv: buildCsv(orderedItems),
    itemCount: orderedItems.length,
  };
}
