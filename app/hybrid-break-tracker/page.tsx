"use client";

import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Plus,
  DollarSign,
  Archive,
  Gift,
  User,
  Package2,
  TrendingUp,
  ClipboardList,
  Search,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  Pencil,
  Trash2,
  X,
  Info,
  Upload,
  Download,
  FileUp,
  FileDown,
  Database,
  Table2,
  Store,
} from "lucide-react";

type BreakRow = {
  id: string;
  orderNo: string;
  date: string;
  breaker: string;
  product: string;
  teamSpot: string;
  platform: string;
  breakCost: number;
  shipping: number;
  tax: number;
};

type StatusType =
  | "Holding"
  | "Listed"
  | "Sold"
  | "Personal"
  | "Donation"
  | "Lot"
  | "Bulked";

type PackagingCostFields = {
  pennySleeveCost?: number | "";
  topLoaderCost?: number | "";
  cardSaverCost?: number | "";
  teamBagCost?: number | "";
  envelopeCost?: number | "";
  shellMailerCost?: number | "";
  paddedMailerCost?: number | "";
  boxCost?: number | "";
  shippingLabelCost?: number | "";
  otherPackagingLabel?: string;
  otherPackagingCost?: number | "";
};

type CardRow = {
  id: string;
  breakId: string;
  orderNo: string;
  acquiredDate: string;
  playerCard: string;
  details: string;
  qty: number;
  salesPlatform: string;
  listedPrice: number | "";
  soldPrice: number | "";
  saleDate: string;
  fees: number | "";
  shippingCost: number | "";
  estMarketValue: number;
  status: StatusType;
  notes: string;
  shippingProfile: string;
  shippingCharged: number | "";
  postagePaid: number | "";
  suppliesCost: number | "";
} & PackagingCostFields;

type ShippingProfile = {
  shippingCharged: number;
  postagePaid: number;
} & Required<PackagingCostFields>;

type ShippingProfileMap = Record<string, ShippingProfile>;

type AuditSource = "manual" | "csv" | "workbook" | "system";

type AuditEntry = {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  source: AuditSource;
  canUndo: boolean;
};

type HistorySnapshot = {
  id: string;
  timestamp: string;
  label: string;
  breaks: BreakRow[];
  cards: CardRow[];
  shippingProfiles: ShippingProfileMap;
  masterWorkbookName: string;
  lastWorkbookImportedAt: string;
  lastWorkbookExportedAt: string;
  hasUnsyncedChanges: boolean;
  lastSyncAction: string;
};

type CsvSource = "generic" | "ebay" | "collx";
type CsvBreakMode = "new" | "existing";

type CsvImportRow = {
  source: CsvSource;
  rawId: string;
  title: string;
  details: string;
  acquiredDate: string;
  purchasePrice: number | "";
  marketValue: number;
  qty: number;
  salesPlatform: string;
  notes: string;
  status: StatusType;
  orderNo: string;
};

type CsvImportPreview = {
  fileName: string;
  source: CsvSource;
  headers: string[];
  rows: CsvImportRow[];
  duplicateRawIds: string[];
  missingTitleCount: number;
  suspiciousRowsSkipped: number;
};

const initialBreaks: BreakRow[] = [
  {
    id: "B001",
    orderNo: "882838250",
    date: "2026-03-08",
    breaker: "dcvsports",
    product: "2025 Bowman's Best",
    teamSpot: "Random/Mets",
    platform: "Whatnot",
    breakCost: 20,
    shipping: 0.4,
    tax: 1.27,
  },
  {
    id: "B002",
    orderNo: "888766154",
    date: "2026-03-12",
    breaker: "ericbcards",
    product: "2025 Bowman's Best",
    teamSpot: "Mariners/Athletics",
    platform: "Whatnot",
    breakCost: 113,
    shipping: 4.29,
    tax: 7.28,
  },
];

const initialCards: CardRow[] = [
  {
    id: "C0001",
    breakId: "B001",
    orderNo: "882838250",
    acquiredDate: "2026-03-08",
    playerCard: "Elian Pena",
    details: "Refractor Auto",
    qty: 1,
    salesPlatform: "",
    listedPrice: "",
    soldPrice: "",
    saleDate: "",
    fees: "",
    shippingCost: "",
    estMarketValue: 25,
    status: "Holding",
    notes: "",
    shippingProfile: "",
    shippingCharged: "",
    postagePaid: "",
    suppliesCost: "",
  },
  {
    id: "C0002",
    breakId: "B001",
    orderNo: "882838250",
    acquiredDate: "2026-03-08",
    playerCard: "Mets 3 Card Base Lot",
    details: "Base",
    qty: 1,
    salesPlatform: "eBay",
    listedPrice: 0.99,
    soldPrice: "",
    saleDate: "",
    fees: "",
    shippingCost: "",
    estMarketValue: 3,
    status: "Listed",
    notes: "",
    shippingProfile: "",
    shippingCharged: "",
    postagePaid: "",
    suppliesCost: "",
  },
  {
    id: "C0003",
    breakId: "B002",
    orderNo: "888766154",
    acquiredDate: "2026-03-12",
    playerCard: "Jamie Arnold",
    details: "Auto /50",
    qty: 1,
    salesPlatform: "eBay",
    listedPrice: 149.99,
    soldPrice: 149.99,
    saleDate: "2026-03-20",
    fees: 20,
    shippingCost: 7.67,
    estMarketValue: 120,
    status: "Sold",
    notes: "",
    shippingProfile: "",
    shippingCharged: "",
    postagePaid: "",
    suppliesCost: "",
  },
  {
    id: "C0004",
    breakId: "B002",
    orderNo: "888766154",
    acquiredDate: "2026-03-12",
    playerCard: "Kade Anderson",
    details: "Base TP-6",
    qty: 1,
    salesPlatform: "",
    listedPrice: "",
    soldPrice: "",
    saleDate: "",
    fees: "",
    shippingCost: "",
    estMarketValue: 2.75,
    status: "Personal",
    notes: "Keep",
    shippingProfile: "",
    shippingCharged: "",
    postagePaid: "",
    suppliesCost: "",
  },
  {
    id: "C0005",
    breakId: "B002",
    orderNo: "888766154",
    acquiredDate: "2026-03-12",
    playerCard: "Bulk Commons",
    details: "Donation stack",
    qty: 3,
    salesPlatform: "",
    listedPrice: "",
    soldPrice: "",
    saleDate: "",
    fees: "",
    shippingCost: "",
    estMarketValue: 1,
    status: "Donation",
    notes: "Receipt pending",
    shippingProfile: "",
    shippingCharged: "",
    postagePaid: "",
    suppliesCost: "",
  },
  {
    id: "C0006",
    breakId: "B002",
    orderNo: "888766154",
    acquiredDate: "2026-03-12",
    playerCard: "Mariners Team Lot",
    details: "Base lot",
    qty: 7,
    salesPlatform: "",
    listedPrice: 9.99,
    soldPrice: "",
    saleDate: "",
    fees: "",
    shippingCost: "",
    estMarketValue: 8,
    status: "Lot",
    notes: "Potential kids lot",
    shippingProfile: "",
    shippingCharged: "",
    postagePaid: "",
    suppliesCost: "",
  },
];

const tabs = [
  "Dashboard",
  "Break Entry",
  "Card Entry",
  "Sales Entry",
  "Profit Engine / ROI",
  "Status Routing",
  "Reports / Tax Center",
  "Import / Export Hub",
  "Audit / Safety",
] as const;

const statusOptions: StatusType[] = [
  "Holding",
  "Listed",
  "Sold",
  "Personal",
  "Donation",
  "Lot",
  "Bulked",
];

const packagingFieldDefs: Array<{ key: keyof PackagingCostFields; label: string; isLabel?: boolean }> = [
  { key: "pennySleeveCost", label: "Penny sleeve" },
  { key: "topLoaderCost", label: "Top loader" },
  { key: "cardSaverCost", label: "Card saver" },
  { key: "teamBagCost", label: "Team bag" },
  { key: "envelopeCost", label: "Envelope" },
  { key: "shellMailerCost", label: "Shell mailer" },
  { key: "paddedMailerCost", label: "Padded mailer" },
  { key: "boxCost", label: "Box" },
  { key: "shippingLabelCost", label: "Shipping label" },
  { key: "otherPackagingLabel", label: "Other label", isLabel: true },
  { key: "otherPackagingCost", label: "Other cost" },
];

function emptyPackagingFields(): PackagingCostFields {
  return {
    pennySleeveCost: "",
    topLoaderCost: "",
    cardSaverCost: "",
    teamBagCost: "",
    envelopeCost: "",
    shellMailerCost: "",
    paddedMailerCost: "",
    boxCost: "",
    shippingLabelCost: "",
    otherPackagingLabel: "",
    otherPackagingCost: "",
  };
}

function createEmptyShippingProfile(): ShippingProfile {
  return {
    shippingCharged: 0,
    postagePaid: 0,
    pennySleeveCost: 0,
    topLoaderCost: 0,
    cardSaverCost: 0,
    teamBagCost: 0,
    envelopeCost: 0,
    shellMailerCost: 0,
    paddedMailerCost: 0,
    boxCost: 0,
    shippingLabelCost: 0,
    otherPackagingLabel: "",
    otherPackagingCost: 0,
  };
}

function getPackagingCostTotal(values: PackagingCostFields): number {
  const amounts: number[] = [
    values.pennySleeveCost,
    values.topLoaderCost,
    values.cardSaverCost,
    values.teamBagCost,
    values.envelopeCost,
    values.shellMailerCost,
    values.paddedMailerCost,
    values.boxCost,
    values.shippingLabelCost,
    values.otherPackagingCost,
  ].map((value) => Number(value ?? 0) || 0);

  return amounts.reduce((sum: number, value: number) => sum + value, 0);
}

function hasItemizedPackaging(values: PackagingCostFields): boolean {
  return getPackagingCostTotal(values) > 0;
}

const initialShippingProfiles: ShippingProfileMap = {
  "eBay PWE <=$20": {
    shippingCharged: 1.99,
    postagePaid: 0.74,
    pennySleeveCost: 0.02,
    topLoaderCost: 0.15,
    cardSaverCost: 0,
    teamBagCost: 0.03,
    envelopeCost: 0.09,
    shellMailerCost: 0,
    paddedMailerCost: 0,
    boxCost: 0,
    shippingLabelCost: 0.08,
    otherPackagingLabel: "",
    otherPackagingCost: 0,
  },
  "eBay BMWT >$20": {
    shippingCharged: 7.99,
    postagePaid: 5.15,
    pennySleeveCost: 0.02,
    topLoaderCost: 0,
    cardSaverCost: 0.24,
    teamBagCost: 0.03,
    envelopeCost: 0,
    shellMailerCost: 0,
    paddedMailerCost: 0.47,
    boxCost: 0,
    shippingLabelCost: 0.13,
    otherPackagingLabel: "",
    otherPackagingCost: 0,
  },
};

let activeShippingProfiles: ShippingProfileMap = initialShippingProfiles;

const statusStyles: Record<StatusType, string> = {
  Holding: "bg-slate-100 text-slate-700",
  Listed: "bg-blue-100 text-blue-700",
  Sold: "bg-emerald-100 text-emerald-700",
  Personal: "bg-violet-100 text-violet-700",
  Donation: "bg-amber-100 text-amber-700",
  Lot: "bg-orange-100 text-orange-700",
  Bulked: "bg-zinc-100 text-zinc-700",
};

const statusHelp: Record<StatusType, string> = {
  Holding: "Active inventory you still may sell individually.",
  Listed: "Actively listed for sale.",
  Sold: "Completed sale. Sales math, realized COGS, and profit apply here.",
  Personal: "Moved to your personal collection.",
  Donation: "Designated for donation tracking.",
  Lot: "Intentionally grouped together for sale as one unit.",
  Bulked:
    "Still inventory, but no longer worth individual attention. Good for low-priority cards you may later group, box, or review.",
};

function currency(n: number | string | ""): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
}

function percent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function toNumberOrBlank(value: string): number | "" {
  return value === "" ? "" : Number(value);
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value).trim();
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

function getCell<T = unknown>(
  row: Record<string, unknown>,
  candidates: string[],
  fallback?: T
): T | undefined {
  const normalized = Object.keys(row).reduce<Record<string, unknown>>((acc, key) => {
    acc[normalizeKey(key)] = row[key];
    return acc;
  }, {});
  for (const candidate of candidates) {
    const hit = normalized[normalizeKey(candidate)];
    if (hit !== undefined && hit !== null && hit !== "") return hit as T;
  }
  return fallback;
}

function parseExcelDate(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return trimmed;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const millis = excelEpoch.getTime() + value * 24 * 60 * 60 * 1000;
    const parsed = new Date(millis);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return "";
}

function statusFromUnknown(value: unknown): StatusType {
  const raw = String(value ?? "").trim();
  return statusOptions.includes(raw as StatusType) ? (raw as StatusType) : "Holding";
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function getBreakLandedCost(breakRow: BreakRow): number {
  return (
    Number(breakRow.breakCost || 0) +
    Number(breakRow.shipping || 0) +
    Number(breakRow.tax || 0)
  );
}

function getBreakQty(cards: CardRow[], breakId: string): number {
  return cards
    .filter((c) => c.breakId === breakId)
    .reduce((sum, c) => sum + Number(c.qty || 0), 0);
}

function getUnitCost(cards: CardRow[], breaks: BreakRow[], card: CardRow): number {
  const breakRow = breaks.find((b) => b.id === card.breakId);
  if (!breakRow) return 0;
  const totalQty = getBreakQty(cards, card.breakId);
  if (!totalQty) return 0;
  return getBreakLandedCost(breakRow) / totalQty;
}

function getShippingRevUsed(card: CardRow): number {
  if (card.status !== "Sold") return 0;
  if (card.shippingCharged !== "") return Number(card.shippingCharged || 0);

  if (card.shippingProfile && activeShippingProfiles[card.shippingProfile]) {
    return activeShippingProfiles[card.shippingProfile].shippingCharged;
  }

  if (card.salesPlatform !== "eBay") return 0;

  const sold = Number(card.soldPrice || 0);
  return sold <= 20
    ? activeShippingProfiles["eBay PWE <=$20"]?.shippingCharged || 0
    : activeShippingProfiles["eBay BMWT >$20"]?.shippingCharged || 0;
}

function getPostageUsed(card: CardRow): number {
  if (card.status !== "Sold") return 0;
  if (card.postagePaid !== "") return Number(card.postagePaid || 0);

  if (card.shippingProfile && activeShippingProfiles[card.shippingProfile]) {
    return activeShippingProfiles[card.shippingProfile].postagePaid;
  }

  if (card.salesPlatform !== "eBay") return 0;

  const sold = Number(card.soldPrice || 0);
  return sold <= 20
    ? activeShippingProfiles["eBay PWE <=$20"]?.postagePaid || 0
    : activeShippingProfiles["eBay BMWT >$20"]?.postagePaid || 0;
}

function getSuppliesUsed(card: CardRow): number {
  if (card.status !== "Sold") return 0;

  const itemizedSupplies = getPackagingCostTotal(card);
  if (itemizedSupplies > 0) return itemizedSupplies;

  if (card.suppliesCost !== "") return Number(card.suppliesCost || 0);

  if (card.shippingProfile && activeShippingProfiles[card.shippingProfile]) {
    return getPackagingCostTotal(activeShippingProfiles[card.shippingProfile]);
  }

  if (card.salesPlatform !== "eBay") return 0;

  const sold = Number(card.soldPrice || 0);
  return sold <= 20
    ? getPackagingCostTotal(activeShippingProfiles["eBay PWE <=$20"] || {})
    : getPackagingCostTotal(activeShippingProfiles["eBay BMWT >$20"] || {});
}

function getShippingCost(card: CardRow): number {
  if (card.status !== "Sold" || card.soldPrice === "") return 0;
  if (card.shippingCost !== "") return Number(card.shippingCost || 0);
  return getPostageUsed(card) + getSuppliesUsed(card);
}

function getNetProceeds(card: CardRow): number {
  if (card.status !== "Sold" || card.soldPrice === "") return 0;
  return (
    Number(card.soldPrice || 0) +
    getShippingRevUsed(card) -
    Number(card.fees || 0) -
    getShippingCost(card)
  );
}

function getTotalCost(cards: CardRow[], breaks: BreakRow[], card: CardRow): number {
  return Number(card.qty || 0) * getUnitCost(cards, breaks, card);
}

function getRealizedCogs(cards: CardRow[], breaks: BreakRow[], card: CardRow): number {
  return card.status === "Sold" ? getTotalCost(cards, breaks, card) : 0;
}

function getProfit(cards: CardRow[], breaks: BreakRow[], card: CardRow): number {
  return card.status === "Sold"
    ? getNetProceeds(card) - getRealizedCogs(cards, breaks, card)
    : 0;
}

function getNextBreakId(breaks: BreakRow[]): string {
  const nums = breaks.map((b) => Number(String(b.id).replace(/\D/g, "") || 0));
  return `B${String((Math.max(0, ...nums) || 0) + 1).padStart(3, "0")}`;
}

function getNextCardId(cards: CardRow[]): string {
  const nums = cards.map((c) => Number(String(c.id).replace(/\D/g, "") || 0));
  return `C${String((Math.max(0, ...nums) || 0) + 1).padStart(4, "0")}`;
}


function parseCsvDate(value: unknown): string {
  const text = getText(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text;
}

function getCsvCell(row: Record<string, unknown>, candidates: string[]): string {
  return getText(getCell(row, candidates, ""));
}

function inferCsvSource(fileName: string): CsvSource {
  const lower = fileName.toLowerCase();
  if (lower.includes("ebay")) return "ebay";
  if (lower.includes("collx")) return "collx";
  return "generic";
}

function buildCardDetails(parts: Array<string | number | undefined | null>): string {
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

function mapEbayCsvRow(row: Record<string, unknown>): CsvImportRow | null {
  const rawId = getCsvCell(row, ["CollectibleId", "ID", "Id"]);
  const title = getCsvCell(row, ["Title", "Name"]);
  const purchasePrice = toNumberOrBlank(getCsvCell(row, ["Purchase Price (USD)", "Purchase Price", "Price Paid"]));
  const acquiredDate = parseCsvDate(getCsvCell(row, ["Purchase Date MM-DD-YYYY", "Purchase Date", "Date"]));
  const player = getCsvCell(row, ["Player"]);
  const setName = getCsvCell(row, ["Set"]);
  const year = getCsvCell(row, ["Year"]);
  const manufacturer = getCsvCell(row, ["Card Manufacturer", "Manufacturer"]);
  const cardNumber = getCsvCell(row, ["Card Number", "Number"]);
  const condition = getCsvCell(row, ["Card Condition", "Condition"]);
  const grader = getCsvCell(row, ["Professional Grader"]);
  const grade = getCsvCell(row, ["Grade"]);
  const notes = getCsvCell(row, ["Notes"]);

  if (!title && !rawId) return null;

  return {
    source: "ebay",
    rawId,
    title: title || buildCardDetails([year, manufacturer, setName, cardNumber]).slice(0, 120),
    details: buildCardDetails([player, year, manufacturer, setName, `#${cardNumber}`, condition, grader, grade]),
    acquiredDate,
    purchasePrice,
    marketValue: typeof purchasePrice === "number" ? purchasePrice : 0,
    qty: 1,
    salesPlatform: "eBay",
    notes: buildCardDetails(["Imported from eBay CSV", notes]),
    status: "Holding",
    orderNo: "",
  };
}

function mapCollxCsvRow(row: Record<string, unknown>): CsvImportRow | null {
  const rawId = getCsvCell(row, ["collx_id", "id"]);
  const name = getCsvCell(row, ["name", "title"]);
  const year = getCsvCell(row, ["year"]);
  const brand = getCsvCell(row, ["brand"]);
  const setName = getCsvCell(row, ["set"]);
  const number = getCsvCell(row, ["number"]);
  const team = getCsvCell(row, ["team"]);
  const flags = getCsvCell(row, ["flags"]);
  const condition = getCsvCell(row, ["condition"]);
  const location = getCsvCell(row, ["location"]);
  const notes = getCsvCell(row, ["notes"]);
  const added = parseCsvDate(getCsvCell(row, ["added", "date"]));
  const marketValue = toNumber(getCsvCell(row, ["market_value", "market value"]), 0);
  const askingPrice = toNumberOrBlank(getCsvCell(row, ["asking_price", "asking price"]));
  const soldForPrice = toNumberOrBlank(getCsvCell(row, ["sold_for_price", "sold price"]));
  const purchasePrice = toNumberOrBlank(getCsvCell(row, ["purchase_price", "purchase price"]));
  const quantity = Math.max(1, toNumber(getCsvCell(row, ["quantity", "qty"]), 1));

  if (!name && !rawId) return null;

  const status: StatusType =
    typeof soldForPrice === "number" && soldForPrice > 0
      ? "Sold"
      : typeof askingPrice === "number" && askingPrice > 0
        ? "Listed"
        : "Holding";

  return {
    source: "collx",
    rawId,
    title: name || buildCardDetails([year, brand, setName, number]).slice(0, 120),
    details: buildCardDetails([year, brand, setName, `#${number}`, team, flags, condition, location]),
    acquiredDate: added,
    purchasePrice,
    marketValue,
    qty: quantity,
    salesPlatform: status === "Sold" || status === "Listed" ? "CollX" : "",
    notes: buildCardDetails(["Imported from CollX CSV", notes]),
    status,
    orderNo: "",
  };
}

function mapGenericCsvRow(row: Record<string, unknown>): CsvImportRow | null {
  const rawId = getCsvCell(row, ["id", "card id", "cardid", "collectibleid", "collx_id"]);
  const title = getCsvCell(row, ["title", "name", "player/card", "player card", "playercard"]);
  const details = getCsvCell(row, ["details", "parallel/details", "description", "set"]);
  const acquiredDate = parseCsvDate(getCsvCell(row, ["date", "purchase date", "added", "acquired date"]));
  const purchasePrice = toNumberOrBlank(getCsvCell(row, ["purchase price", "purchase price (usd)", "price", "cost"]));
  const marketValue = toNumber(getCsvCell(row, ["market value", "market_value", "est market value"]), 0);
  const qty = Math.max(1, toNumber(getCsvCell(row, ["quantity", "qty"]), 1));
  const notes = getCsvCell(row, ["notes"]);
  if (!title && !rawId) return null;

  return {
    source: "generic",
    rawId,
    title: title || "Imported CSV Row",
    details,
    acquiredDate,
    purchasePrice,
    marketValue,
    qty,
    salesPlatform: "",
    notes: buildCardDetails(["Imported from generic CSV", notes]),
    status: "Holding",
    orderNo: "",
  };
}

function parseCsvRows(
  rows: Record<string, unknown>[],
  source: CsvSource
): { rows: CsvImportRow[]; duplicateRawIds: string[]; missingTitleCount: number; suspiciousRowsSkipped: number } {
  const mapped: CsvImportRow[] = [];
  let suspiciousRowsSkipped = 0;
  let missingTitleCount = 0;
  const idCounts = new Map<string, number>();

  for (const row of rows) {
    const item =
      source === "ebay"
        ? mapEbayCsvRow(row)
        : source === "collx"
          ? mapCollxCsvRow(row)
          : mapGenericCsvRow(row);

    if (!item) {
      suspiciousRowsSkipped += 1;
      continue;
    }

    if (!item.title.trim()) {
      missingTitleCount += 1;
    }

    if (item.rawId) {
      idCounts.set(item.rawId, (idCounts.get(item.rawId) ?? 0) + 1);
    }

    mapped.push(item);
  }

  const duplicateRawIds = [...idCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort();

  return { rows: mapped, duplicateRawIds, missingTitleCount, suspiciousRowsSkipped };
}

function cloneDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeAuditId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function KPI({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </Card>
  );
}

function SectionTitle({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-2xl bg-slate-900 p-2 text-white">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 p-4 md:p-8">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function PackagingCostBuilder({
  value,
  onChange,
}: {
  value: PackagingCostFields;
  onChange: (patch: Partial<PackagingCostFields>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {packagingFieldDefs
          .filter((field) => !field.isLabel && field.key !== "otherPackagingCost")
          .map((field) => (
            <label key={String(field.key)} className="text-sm">
              <div className="mb-1 text-slate-600">{field.label}</div>
              <input
                type="number"
                step="0.01"
                value={value[field.key] ?? ""}
                onChange={(e) =>
                  onChange({
                    [field.key]: toNumberOrBlank(e.target.value),
                  })
                }
                className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              />
            </label>
          ))}
      </div>

      <div className="grid gap-3 md:grid-cols-[1.4fr_.8fr]">
        <label className="text-sm">
          <div className="mb-1 text-slate-600">Other packaging label</div>
          <input
            value={value.otherPackagingLabel ?? ""}
            onChange={(e) => onChange({ otherPackagingLabel: e.target.value })}
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
            placeholder="Rigid mailer, tape, printer ink, etc."
          />
        </label>
        <label className="text-sm">
          <div className="mb-1 text-slate-600">Other packaging cost</div>
          <input
            type="number"
            step="0.01"
            value={value.otherPackagingCost ?? ""}
            onChange={(e) => onChange({ otherPackagingCost: toNumberOrBlank(e.target.value) })}
            className="w-full rounded-2xl border border-slate-200 px-3 py-2"
          />
        </label>
      </div>

      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
        Itemized packaging total: <span className="font-semibold text-slate-900">{currency(getPackagingCostTotal(value))}</span>
      </div>
    </div>
  );
}

export default function HybridBreakTrackerPage() {
  const [activeTab, setActiveTab] =
    useState<(typeof tabs)[number]>("Dashboard");
  const [breaks, setBreaks] = useState<BreakRow[]>(initialBreaks);
  const [cards, setCards] = useState<CardRow[]>(initialCards);
  const [cardSearch, setCardSearch] = useState("");
  const [lastImportName, setLastImportName] = useState("");
  const [lastImportType, setLastImportType] = useState("None");
  const workbookImportRef = useRef<HTMLInputElement | null>(null);

const csvImportRef = useRef<HTMLInputElement | null>(null);
const [pendingCsvSource, setPendingCsvSource] = useState<CsvSource>("generic");
const [csvImportPreview, setCsvImportPreview] = useState<CsvImportPreview | null>(null);
const [csvTargetBreakId, setCsvTargetBreakId] = useState(initialBreaks[0]?.id ?? "");
  const [shippingProfiles, setShippingProfiles] = useState<ShippingProfileMap>(initialShippingProfiles);
  const [profileDraftName, setProfileDraftName] = useState("Custom Profile");
  const [profileDraft, setProfileDraft] = useState<ShippingProfile>(createEmptyShippingProfile());
  const [editingProfileName, setEditingProfileName] = useState<string | null>(null);
  activeShippingProfiles = shippingProfiles;
const [csvBreakMode, setCsvBreakMode] = useState<CsvBreakMode>("new");
const [csvNewBreak, setCsvNewBreak] = useState({
  id: getNextBreakId(initialBreaks),
  orderNo: "",
  date: new Date().toISOString().slice(0, 10),
  breaker: "",
  product: "",
  teamSpot: "",
  platform: "eBay",
  breakCost: "",
  shipping: "",
  tax: "",
});
const [masterWorkbookName, setMasterWorkbookName] = useState("");
const [lastWorkbookImportedAt, setLastWorkbookImportedAt] = useState("");
const [lastWorkbookExportedAt, setLastWorkbookExportedAt] = useState("");
const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);
const [lastSyncAction, setLastSyncAction] = useState("No workbook sync yet");
const [selectedReportYear, setSelectedReportYear] = useState("All");
const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);

  const [newBreak, setNewBreak] = useState({
    id: getNextBreakId(initialBreaks),
    orderNo: "",
    date: "2026-03-31",
    breaker: "",
    product: "",
    teamSpot: "",
    platform: "Whatnot",
    breakCost: "",
    shipping: "",
    tax: "",
  });

  const [newCard, setNewCard] = useState({
    breakId: initialBreaks[0]?.id ?? "",
    orderNo: initialBreaks[0]?.orderNo ?? "",
    acquiredDate: "2026-03-31",
    playerCard: "",
    details: "",
    qty: 1,
    salesPlatform: "",
    listedPrice: "",
    soldPrice: "",
    saleDate: "",
    fees: "",
    shippingCost: "",
    estMarketValue: "",
    status: "Holding" as StatusType,
    notes: "",
    shippingProfile: "",
    shippingCharged: "",
    postagePaid: "",
    suppliesCost: "",
  });

  const [editingBreak, setEditingBreak] = useState<BreakRow | null>(null);
  const [editingBreakOriginalId, setEditingBreakOriginalId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<CardRow | null>(null);

  function buildCardPatchFromShippingProfile(profileName: string): Partial<CardRow> {
    if (!profileName) return { shippingProfile: "" };
    const profile = shippingProfiles[profileName];
    if (!profile) return { shippingProfile: profileName };
    return {
      shippingProfile: profileName,
      shippingCharged: profile.shippingCharged,
      postagePaid: profile.postagePaid,
      suppliesCost: "",
      pennySleeveCost: profile.pennySleeveCost,
      topLoaderCost: profile.topLoaderCost,
      cardSaverCost: profile.cardSaverCost,
      teamBagCost: profile.teamBagCost,
      envelopeCost: profile.envelopeCost,
      shellMailerCost: profile.shellMailerCost,
      paddedMailerCost: profile.paddedMailerCost,
      boxCost: profile.boxCost,
      shippingLabelCost: profile.shippingLabelCost,
      otherPackagingLabel: profile.otherPackagingLabel,
      otherPackagingCost: profile.otherPackagingCost,
    };
  }

  function startNewShippingProfile() {
    setEditingProfileName(null);
    setProfileDraftName(`Profile ${Object.keys(shippingProfiles).length + 1}`);
    setProfileDraft(createEmptyShippingProfile());
  }

  function editShippingProfile(profileName: string) {
    const profile = shippingProfiles[profileName];
    if (!profile) return;
    setEditingProfileName(profileName);
    setProfileDraftName(profileName);
    setProfileDraft({ ...profile });
  }

  function saveShippingProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedName = profileDraftName.trim();
    if (!trimmedName) {
      alert("Profile name is required.");
      return;
    }

    recordMutation(
      editingProfileName ? "Shipping profile updated" : "Shipping profile created",
      `${editingProfileName ?? "New profile"} → ${trimmedName}`,
      "manual"
    );

    setShippingProfiles((prev) => {
      const next = { ...prev };
      if (editingProfileName && editingProfileName !== trimmedName) {
        delete next[editingProfileName];
      }
      next[trimmedName] = {
        ...profileDraft,
        shippingCharged: Number(profileDraft.shippingCharged || 0),
        postagePaid: Number(profileDraft.postagePaid || 0),
        pennySleeveCost: Number(profileDraft.pennySleeveCost || 0),
        topLoaderCost: Number(profileDraft.topLoaderCost || 0),
        cardSaverCost: Number(profileDraft.cardSaverCost || 0),
        teamBagCost: Number(profileDraft.teamBagCost || 0),
        envelopeCost: Number(profileDraft.envelopeCost || 0),
        shellMailerCost: Number(profileDraft.shellMailerCost || 0),
        paddedMailerCost: Number(profileDraft.paddedMailerCost || 0),
        boxCost: Number(profileDraft.boxCost || 0),
        shippingLabelCost: Number(profileDraft.shippingLabelCost || 0),
        otherPackagingLabel: profileDraft.otherPackagingLabel || "",
        otherPackagingCost: Number(profileDraft.otherPackagingCost || 0),
      };
      return next;
    });

    setEditingProfileName(trimmedName);
  }

  function deleteShippingProfile(profileName: string) {
    const ok = window.confirm(`Delete shipping profile ${profileName}?`);
    if (!ok) return;
    recordMutation("Shipping profile deleted", profileName, "manual");
    setShippingProfiles((prev) => {
      const next = { ...prev };
      delete next[profileName];
      return next;
    });
    if (editingProfileName === profileName) {
      startNewShippingProfile();
    }
  }

  const markWorkbookDirty = (reason: string) => {
    setHasUnsyncedChanges(true);
    setLastSyncAction(reason);
  };

  const markWorkbookSyncedFromImport = (fileName: string) => {
    const now = new Date().toLocaleString();
    setMasterWorkbookName(fileName);
    setLastWorkbookImportedAt(now);
    setHasUnsyncedChanges(false);
    setLastSyncAction(`Workbook imported from ${fileName} at ${now}`);
  };


const markWorkbookSyncedToExport = (fileName: string) => {
  const now = new Date().toLocaleString();
  setMasterWorkbookName(fileName);
  setLastWorkbookExportedAt(now);
  setHasUnsyncedChanges(false);
  setLastSyncAction(`Workbook exported to ${fileName} at ${now}`);
};

const logAudit = (
  action: string,
  details: string,
  source: AuditSource,
  canUndo = false
) => {
  const entry: AuditEntry = {
    id: makeAuditId("audit"),
    timestamp: new Date().toLocaleString(),
    action,
    details,
    source,
    canUndo,
  };
  setAuditLog((prev) => [entry, ...prev].slice(0, 100));
};

const pushUndoSnapshot = (label: string) => {
  const snapshot: HistorySnapshot = {
    id: makeAuditId("undo"),
    timestamp: new Date().toLocaleString(),
    label,
    breaks: cloneDeep(breaks),
    cards: cloneDeep(cards),
    shippingProfiles: cloneDeep(shippingProfiles),
    masterWorkbookName,
    lastWorkbookImportedAt,
    lastWorkbookExportedAt,
    hasUnsyncedChanges,
    lastSyncAction,
  };
  setUndoStack((prev) => [snapshot, ...prev].slice(0, 25));
};

const recordMutation = (
  label: string,
  details: string,
  source: AuditSource,
  markDirty = true
) => {
  pushUndoSnapshot(label);
  logAudit(label, details, source, true);
  if (markDirty) {
    markWorkbookDirty(details);
  }
};

const undoLastChange = () => {
  const snapshot = undoStack[0];
  if (!snapshot) {
    alert("There is no undo history yet.");
    return;
  }

  setBreaks(cloneDeep(snapshot.breaks));
  setCards(cloneDeep(snapshot.cards));
  setShippingProfiles(cloneDeep(snapshot.shippingProfiles));
  setMasterWorkbookName(snapshot.masterWorkbookName);
  setLastWorkbookImportedAt(snapshot.lastWorkbookImportedAt);
  setLastWorkbookExportedAt(snapshot.lastWorkbookExportedAt);
  setHasUnsyncedChanges(snapshot.hasUnsyncedChanges);
  setLastSyncAction(snapshot.lastSyncAction);
  setUndoStack((prev) => prev.slice(1));
  logAudit("Undo applied", `Reverted to snapshot: ${snapshot.label}`, "system", false);
};

const resetCsvNewBreak = (source: CsvSource) => {
    setCsvNewBreak({
      id: getNextBreakId(breaks),
      orderNo: "",
      date: new Date().toISOString().slice(0, 10),
      breaker: "",
      product: "",
      teamSpot: "",
      platform: source === "ebay" ? "eBay" : source === "collx" ? "CollX" : "CSV",
      breakCost: "",
      shipping: "",
      tax: "",
    });
  };


  const reportYears = useMemo(() => {
    const years = new Set<string>();

    breaks.forEach((b) => {
      if (/^\d{4}/.test(b.date)) years.add(b.date.slice(0, 4));
    });

    cards.forEach((c) => {
      const acquired = String(c.acquiredDate || "");
      const sold = String(c.saleDate || "");
      if (/^\d{4}/.test(acquired)) years.add(acquired.slice(0, 4));
      if (/^\d{4}/.test(sold)) years.add(sold.slice(0, 4));
    });

    return ["All", ...Array.from(years).sort()];
  }, [breaks, cards]);

  const taxReport = useMemo(() => {
    const year = selectedReportYear;
    const matchesYear = (dateStr: string) =>
      year === "All" || (dateStr && dateStr.slice(0, 4) === year);

    const soldCards = cards.filter((c) => c.status === "Sold" && matchesYear(String(c.saleDate || c.acquiredDate || "")));
    const donatedCards = cards.filter((c) => c.status === "Donation" && matchesYear(String(c.acquiredDate || "")));
    const personalCards = cards.filter((c) => c.status === "Personal" && matchesYear(String(c.acquiredDate || "")));
    const acquiredBreaks = breaks.filter((b) => matchesYear(String(b.date || "")));
    const yearEndInventoryCards = cards.filter((c) => ["Holding", "Listed", "Bulked", "Lot"].includes(c.status));

    const grossSales = soldCards.reduce((sum, c) => sum + Number(c.soldPrice || 0), 0);
    const shippingIncome = soldCards.reduce((sum, c) => sum + getShippingRevUsed(c), 0);
    const fees = soldCards.reduce((sum, c) => sum + Number(c.fees || 0), 0);
    const postageAndSupplies = soldCards.reduce((sum, c) => sum + getShippingCost(c), 0);
    const netProceeds = soldCards.reduce((sum, c) => sum + getNetProceeds(c), 0);
    const realizedCogs = soldCards.reduce((sum, c) => sum + getRealizedCogs(cards, breaks, c), 0);
    const realizedProfit = soldCards.reduce((sum, c) => sum + getProfit(cards, breaks, c), 0);
    const donationsCost = donatedCards.reduce((sum, c) => sum + getTotalCost(cards, breaks, c), 0);
    const personalCost = personalCards.reduce((sum, c) => sum + getTotalCost(cards, breaks, c), 0);
    const inventoryOnHand = yearEndInventoryCards.reduce((sum, c) => sum + getTotalCost(cards, breaks, c), 0);
    const estInventoryMarketValue = yearEndInventoryCards.reduce((sum, c) => sum + Number(c.estMarketValue || 0), 0);
    const landedPurchases = acquiredBreaks.reduce((sum, b) => sum + getBreakLandedCost(b), 0);

    return {
      year,
      soldCards,
      donatedCards,
      personalCards,
      grossSales,
      shippingIncome,
      fees,
      postageAndSupplies,
      netProceeds,
      realizedCogs,
      realizedProfit,
      donationsCost,
      personalCost,
      inventoryOnHand,
      estInventoryMarketValue,
      landedPurchases,
    };
  }, [selectedReportYear, breaks, cards]);


  function exportTaxSummaryCsv() {
    const summaryRows = [
      { metric: "Report Year", value: taxReport.year },
      { metric: "Gross Sales", value: taxReport.grossSales },
      { metric: "Shipping Income", value: taxReport.shippingIncome },
      { metric: "Marketplace Fees", value: taxReport.fees },
      { metric: "Postage and Supplies", value: taxReport.postageAndSupplies },
      { metric: "Net Proceeds", value: taxReport.netProceeds },
      { metric: "Realized COGS", value: taxReport.realizedCogs },
      { metric: "Realized Profit", value: taxReport.realizedProfit },
      { metric: "Donation Cost Basis", value: taxReport.donationsCost },
      { metric: "Personal Transfer Cost Basis", value: taxReport.personalCost },
      { metric: "Ending Inventory Cost Basis", value: taxReport.inventoryOnHand },
      { metric: "Ending Inventory Est. Market Value", value: taxReport.estInventoryMarketValue },
      { metric: "Break Purchases (Landed)", value: taxReport.landedPurchases },
      { metric: "Sold Row Count", value: taxReport.soldCards.length },
      { metric: "Donation Row Count", value: taxReport.donatedCards.length },
      { metric: "Personal Row Count", value: taxReport.personalCards.length },
    ];

    const ws = XLSX.utils.json_to_sheet(summaryRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tax Summary");
    XLSX.writeFile(wb, `tax_summary_${taxReport.year === "All" ? "all_years" : taxReport.year}.csv`);
  }

  const dashboard = useMemo(() => {
    const invested = breaks.reduce((sum, b) => sum + getBreakLandedCost(b), 0);
    const netProceeds = cards.reduce((sum, c) => sum + getNetProceeds(c), 0);
    const realizedCogs = cards.reduce(
      (sum, c) => sum + getRealizedCogs(cards, breaks, c),
      0
    );
    const realizedProfit = cards.reduce(
      (sum, c) => sum + getProfit(cards, breaks, c),
      0
    );
    const inventoryOnHand = cards
      .filter((c) => ["Holding", "Listed", "Bulked", "Lot"].includes(c.status))
      .reduce((sum, c) => sum + getTotalCost(cards, breaks, c), 0);
    const personalCost = cards
      .filter((c) => c.status === "Personal")
      .reduce((sum, c) => sum + getTotalCost(cards, breaks, c), 0);
    const donationCost = cards
      .filter((c) => c.status === "Donation")
      .reduce((sum, c) => sum + getTotalCost(cards, breaks, c), 0);

    return {
      invested,
      netProceeds,
      realizedCogs,
      realizedProfit,
      inventoryOnHand,
      personalCost,
      donationCost,
      recovery: invested ? (netProceeds + inventoryOnHand) / invested : 0,
    };
  }, [breaks, cards]);

  const breakScorecard = useMemo(() => {
    return breaks.map((b) => {
      const related = cards.filter((c) => c.breakId === b.id);
      const invested = getBreakLandedCost(b);
      const soldQty = related
        .filter((c) => c.status === "Sold")
        .reduce((sum, c) => sum + Number(c.qty || 0), 0);
      const openQty = related
        .filter((c) => ["Holding", "Listed", "Bulked", "Lot"].includes(c.status))
        .reduce((sum, c) => sum + Number(c.qty || 0), 0);
      const netProceeds = related.reduce((sum, c) => sum + getNetProceeds(c), 0);
      const realizedProfit = related.reduce(
        (sum, c) => sum + getProfit(cards, breaks, c),
        0
      );
      const inventoryOnHand = related
        .filter((c) => ["Holding", "Listed", "Bulked", "Lot"].includes(c.status))
        .reduce((sum, c) => sum + getTotalCost(cards, breaks, c), 0);
      const openEstMv = related
        .filter((c) => ["Holding", "Listed", "Bulked", "Lot"].includes(c.status))
        .reduce((sum, c) => sum + Number(c.estMarketValue || 0), 0);
      const economicProfit = realizedProfit + (openEstMv - inventoryOnHand);

      return {
        ...b,
        invested,
        cardsIn: related.reduce((sum, c) => sum + Number(c.qty || 0), 0),
        soldQty,
        openQty,
        netProceeds,
        realizedProfit,
        inventoryOnHand,
        openEstMv,
        economicProfit,
        recovery: invested ? (netProceeds + inventoryOnHand) / invested : 0,
        roi: invested ? realizedProfit / invested : 0,
        economicRoi: invested ? economicProfit / invested : 0,
        stage:
          related.length === 0
            ? "Awaiting Cards"
            : soldQty === 0 && openQty > 0
              ? "Open / Unsold"
              : soldQty > 0 && openQty > 0
                ? "Partially Realized"
                : soldQty > 0 && openQty === 0
                  ? "Closed"
                  : "Review",
      };
    });
  }, [breaks, cards]);

  const profitCenter = useMemo(() => {
    const soldCards = cards
      .filter((c) => c.status === "Sold")
      .map((card) => ({
        ...card,
        shippingRevenue: getShippingRevUsed(card),
        shippingExpense: getShippingCost(card),
        costBasis: getRealizedCogs(cards, breaks, card),
        netProceeds: getNetProceeds(card),
        profit: getProfit(cards, breaks, card),
      }));

    const listedCards = cards
      .filter((c) => c.status === "Listed")
      .map((card) => {
        const costBasis = getTotalCost(cards, breaks, card);
        const expectedSold = Number(card.listedPrice || 0);
        const projectedShippingRevenue =
          card.shippingCharged !== ""
            ? Number(card.shippingCharged || 0)
            : card.shippingProfile && shippingProfiles[card.shippingProfile]
              ? shippingProfiles[card.shippingProfile].shippingCharged
              : 0;
        const projectedFees = expectedSold ? expectedSold * 0.13 : 0;
        const projectedShippingCost =
          card.shippingCost !== ""
            ? Number(card.shippingCost || 0)
            : getPostageUsed({ ...card, status: "Sold", soldPrice: expectedSold } as CardRow) +
              getSuppliesUsed({ ...card, status: "Sold", soldPrice: expectedSold } as CardRow);

        const projectedNet =
          expectedSold + projectedShippingRevenue - projectedFees - projectedShippingCost;
        const projectedProfit = projectedNet - costBasis;
        const minimumProfitableList = costBasis > 0
          ? Math.ceil((costBasis + projectedShippingCost) / 0.87 * 100) / 100
          : 0;

        return {
          ...card,
          costBasis,
          projectedFees,
          projectedShippingRevenue,
          projectedShippingCost,
          projectedNet,
          projectedProfit,
          minimumProfitableList,
        };
      });

    const unsoldCards = cards
      .filter((c) => ["Holding", "Listed", "Bulked", "Lot"].includes(c.status))
      .map((card) => {
        const costBasis = getTotalCost(cards, breaks, card);
        const marketGap = Number(card.estMarketValue || 0) - costBasis;
        return {
          ...card,
          costBasis,
          marketGap,
        };
      });

    const topProfits = [...soldCards].sort((a, b) => b.profit - a.profit).slice(0, 10);
    const biggestLosses = [...soldCards].sort((a, b) => a.profit - b.profit).slice(0, 10);
    const bestBreaks = [...breakScorecard].sort((a, b) => b.economicProfit - a.economicProfit).slice(0, 10);
    const worstBreaks = [...breakScorecard].sort((a, b) => a.economicProfit - b.economicProfit).slice(0, 10);
    const staleListed = [...listedCards]
      .sort((a, b) => a.projectedProfit - b.projectedProfit)
      .slice(0, 12);

    const realizedMargin = soldCards.length
      ? soldCards.reduce((sum, card) => sum + card.profit, 0) /
        Math.max(1, soldCards.reduce((sum, card) => sum + Number(card.soldPrice || 0), 0))
      : 0;

    const positiveSales = soldCards.filter((card) => card.profit > 0).length;
    const negativeSales = soldCards.filter((card) => card.profit < 0).length;
    const breakEvenSales = soldCards.filter((card) => Math.abs(card.profit) < 0.01).length;

    return {
      soldCards,
      listedCards,
      unsoldCards,
      topProfits,
      biggestLosses,
      bestBreaks,
      worstBreaks,
      staleListed,
      realizedMargin,
      positiveSales,
      negativeSales,
      breakEvenSales,
      projectedListedProfit: listedCards.reduce((sum, card) => sum + card.projectedProfit, 0),
      inventoryValueGap: unsoldCards.reduce((sum, card) => sum + card.marketGap, 0),
    };
  }, [cards, breaks, breakScorecard, shippingProfiles]);


  const filteredCards = useMemo(() => {
    const q = cardSearch.trim().toLowerCase();
    if (!q) return cards;

    return cards.filter((c) =>
      [
        c.id,
        c.breakId,
        c.orderNo,
        c.playerCard,
        c.details,
        c.status,
        c.salesPlatform,
        c.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [cards, cardSearch]);

  const queueGroups = useMemo(() => {
    return statusOptions.map((status) => ({
      status,
      cards: cards.filter((c) => c.status === status),
      totalCost: cards
        .filter((c) => c.status === status)
        .reduce((sum, c) => sum + getTotalCost(cards, breaks, c), 0),
      totalQty: cards
        .filter((c) => c.status === status)
        .reduce((sum, c) => sum + Number(c.qty || 0), 0),
    }));
  }, [cards, breaks]);

  const workbookPayload = useMemo(() => {
    const breakTrackerRows = breaks.map((b) => ({
      breakId: b.id,
      orderNo: b.orderNo,
      date: b.date,
      breaker: b.breaker,
      product: b.product,
      teamSpot: b.teamSpot,
      purchasePlatform: b.platform,
      breakCost: Number(b.breakCost || 0),
      shipping: Number(b.shipping || 0),
      tax: Number(b.tax || 0),
      totalLandedCost: getBreakLandedCost(b),
      cardsReceived: cards
        .filter((c) => c.breakId === b.id)
        .reduce((sum, c) => sum + Number(c.qty || 0), 0),
    }));

    const inventoryRows = cards.map((c) => ({
      cardId: c.id,
      breakId: c.breakId,
      orderNo: c.orderNo,
      acquiredDate: c.acquiredDate,
      playerCard: c.playerCard,
      details: c.details,
      qty: Number(c.qty || 0),
      salesPlatform: c.salesPlatform,
      listedPrice: c.listedPrice,
      soldPrice: c.soldPrice,
      saleDate: c.saleDate,
      fees: c.fees,
      shippingCost: getShippingCost(c),
      netProceeds: getNetProceeds(c),
      estMarketValue: Number(c.estMarketValue || 0),
      unitCost: getUnitCost(cards, breaks, c),
      totalCost: getTotalCost(cards, breaks, c),
      realizedCogs: getRealizedCogs(cards, breaks, c),
      profit: getProfit(cards, breaks, c),
      status: c.status,
      notes: c.notes,
      shippingProfile: c.shippingProfile,
      shippingCharged: getShippingRevUsed(c),
      postagePaid: getPostageUsed(c),
      suppliesCost: getSuppliesUsed(c),
      pennySleeveCost: c.pennySleeveCost ?? "",
      topLoaderCost: c.topLoaderCost ?? "",
      cardSaverCost: c.cardSaverCost ?? "",
      teamBagCost: c.teamBagCost ?? "",
      envelopeCost: c.envelopeCost ?? "",
      shellMailerCost: c.shellMailerCost ?? "",
      paddedMailerCost: c.paddedMailerCost ?? "",
      boxCost: c.boxCost ?? "",
      shippingLabelCost: c.shippingLabelCost ?? "",
      otherPackagingLabel: c.otherPackagingLabel ?? "",
      otherPackagingCost: c.otherPackagingCost ?? "",
    }));

    return {
      breakTracker: breakTrackerRows,
      cardInventory: inventoryRows,
      personalCollection: inventoryRows.filter((r) => r.status === "Personal"),
      donationTracker: inventoryRows.filter((r) => r.status === "Donation"),
      lotsTracker: inventoryRows.filter((r) => r.status === "Lot"),
      breakRoi: breakScorecard,
    };
  }, [breaks, cards, breakScorecard]);

  function addBreak(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmedId = newBreak.id.trim();
    if (!trimmedId) {
      alert("Break ID is required.");
      return;
    }
    if (breaks.some((b) => b.id === trimmedId)) {
      alert("That Break ID already exists.");
      return;
    }

    const row: BreakRow = {
      id: trimmedId,
      orderNo: newBreak.orderNo,
      date: newBreak.date,
      breaker: newBreak.breaker,
      product: newBreak.product,
      teamSpot: newBreak.teamSpot,
      platform: newBreak.platform,
      breakCost: Number(newBreak.breakCost || 0),
      shipping: Number(newBreak.shipping || 0),
      tax: Number(newBreak.tax || 0),
    };

    recordMutation("Break added", `${trimmedId} · ${newBreak.product || "No product"}`, "manual");
    setBreaks((prev) => [...prev, row]);
    setNewBreak({
      id: getNextBreakId([...breaks, row]),
      orderNo: "",
      date: "2026-03-31",
      breaker: "",
      product: "",
      teamSpot: "",
      platform: "Whatnot",
      breakCost: "",
      shipping: "",
      tax: "",
    });
    setActiveTab("Card Entry");
    markWorkbookDirty(`Break ${trimmedId} added in app`);
  }

  function addCard(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!newCard.breakId) {
      alert("Choose a break first.");
      return;
    }

    const breakRow = breaks.find((b) => b.id === newCard.breakId);
    if (!breakRow) {
      alert("Selected break was not found.");
      return;
    }

    const row: CardRow = {
      id: getNextCardId(cards),
      breakId: newCard.breakId,
      orderNo: breakRow.orderNo || newCard.orderNo,
      acquiredDate: newCard.acquiredDate,
      playerCard: newCard.playerCard,
      details: newCard.details,
      qty: Number(newCard.qty || 1),
      salesPlatform: newCard.salesPlatform,
      listedPrice:
        newCard.listedPrice === "" ? "" : Number(newCard.listedPrice),
      soldPrice: newCard.soldPrice === "" ? "" : Number(newCard.soldPrice),
      saleDate: newCard.saleDate,
      fees: newCard.fees === "" ? "" : Number(newCard.fees),
      shippingCost:
        newCard.shippingCost === "" ? "" : Number(newCard.shippingCost),
      estMarketValue: Number(newCard.estMarketValue || 0),
      status: newCard.status,
      notes: newCard.notes,
      shippingProfile: newCard.shippingProfile,
      shippingCharged:
        newCard.shippingCharged === "" ? "" : Number(newCard.shippingCharged),
      postagePaid:
        newCard.postagePaid === "" ? "" : Number(newCard.postagePaid),
      suppliesCost:
        newCard.suppliesCost === "" ? "" : Number(newCard.suppliesCost),
    };

    recordMutation("Card added", `${row.id} · ${row.playerCard || "Untitled card"}`, "manual");
    setCards((prev) => [...prev, row]);

    setNewCard((prev) => ({
      ...prev,
      playerCard: "",
      details: "",
      qty: 1,
      listedPrice: "",
      soldPrice: "",
      saleDate: "",
      fees: "",
      shippingCost: "",
      estMarketValue: "",
      status: "Holding",
      notes: "",
      shippingProfile: "",
      shippingCharged: "",
      postagePaid: "",
      suppliesCost: "",
    }));

    setActiveTab("Sales Entry");
    markWorkbookDirty(`Card added to break ${newCard.breakId}`);
  }

  function updateCard(cardId: string, patch: Partial<CardRow>) {
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, ...patch } : c)));
    markWorkbookDirty(`Card ${cardId} updated in app`);
  }

  function quickMarkSold(cardId: string) {
    const card = cards.find((c) => c.id === cardId);
    recordMutation("Quick sold applied", `${cardId} · ${card?.playerCard || "Card"}`, "manual");
    setCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? {
              ...c,
              status: "Sold",
              salesPlatform: c.salesPlatform || "eBay",
              soldPrice: c.soldPrice || c.listedPrice || 10,
              saleDate: c.saleDate || "2026-03-31",
              fees: c.fees || 1.5,
            }
          : c
      )
    );
    markWorkbookDirty(`Card ${cardId} quick-marked sold`);
  }

  function openEditBreak(breakRow: BreakRow) {
    setEditingBreak({ ...breakRow });
    setEditingBreakOriginalId(breakRow.id);
  }

  function saveEditBreak(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingBreak || !editingBreakOriginalId) return;

    const trimmedId = editingBreak.id.trim();

    if (!trimmedId) {
      alert("Break ID is required.");
      return;
    }

    const duplicate = breaks.some(
      (b) => b.id === trimmedId && b.id !== editingBreakOriginalId
    );
    if (duplicate) {
      alert("That Break ID already exists.");
      return;
    }

    const original = breaks.find((b) => b.id === editingBreakOriginalId);
    if (!original) return;

    recordMutation(
      "Break updated",
      `${editingBreakOriginalId} → ${trimmedId}`,
      "manual"
    );

    setBreaks((prev) =>
      prev.map((b) =>
        b.id === editingBreakOriginalId
          ? {
              ...editingBreak,
              id: trimmedId,
              breakCost: Number(editingBreak.breakCost || 0),
              shipping: Number(editingBreak.shipping || 0),
              tax: Number(editingBreak.tax || 0),
            }
          : b
      )
    );

    if (original.id !== trimmedId || original.orderNo !== editingBreak.orderNo) {
      setCards((prev) =>
        prev.map((c) =>
          c.breakId === editingBreakOriginalId
            ? {
                ...c,
                breakId: trimmedId,
                orderNo: editingBreak.orderNo,
              }
            : c
        )
      );
    }

    setEditingBreak(null);
    setEditingBreakOriginalId(null);
    markWorkbookDirty(`Break ${trimmedId} edited in app`);
  }

  function deleteBreak(breakId: string) {
    const linkedCount = cards.filter((c) => c.breakId === breakId).length;
    const confirmed = window.confirm(
      linkedCount > 0
        ? `Delete break ${breakId} and its ${linkedCount} linked card rows?`
        : `Delete break ${breakId}?`
    );
    if (!confirmed) return;

    recordMutation("Break deleted", `${breakId} with ${linkedCount} linked card row(s)`, "manual");
    setBreaks((prev) => prev.filter((b) => b.id !== breakId));
    setCards((prev) => prev.filter((c) => c.breakId !== breakId));
    if (editingBreak?.id === breakId) {
      setEditingBreak(null);
      setEditingBreakOriginalId(null);
    }
    markWorkbookDirty(`Break ${breakId} deleted in app`);
  }

  function openEditCard(cardRow: CardRow) {
    setEditingCard({ ...cardRow });
  }

  function saveEditCard(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingCard) return;

    const breakRow = breaks.find((b) => b.id === editingCard.breakId);
    if (!breakRow) {
      alert("Selected break was not found.");
      return;
    }

    recordMutation("Card updated", `${editingCard.id} · ${editingCard.playerCard || "Card"}`, "manual");
    setCards((prev) =>
      prev.map((c) =>
        c.id === editingCard.id
          ? {
              ...editingCard,
              orderNo: breakRow.orderNo || editingCard.orderNo,
              qty: Number(editingCard.qty || 1),
              estMarketValue: Number(editingCard.estMarketValue || 0),
            }
          : c
      )
    );
    setEditingCard(null);
    markWorkbookDirty(`Card ${editingCard.id} edited in app`);
  }

  function deleteCard(cardId: string) {
    const confirmed = window.confirm(`Delete card row ${cardId}?`);
    if (!confirmed) return;

    const card = cards.find((c) => c.id === cardId);
    recordMutation("Card deleted", `${cardId} · ${card?.playerCard || "Card"}`, "manual");
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    if (editingCard?.id === cardId) setEditingCard(null);
    markWorkbookDirty(`Card ${cardId} deleted in app`);
  }

  async function loadExcelJs() {
    const mod = await import("exceljs");
    return mod.default ?? mod;
  }

  async function importWorkbookFromFile(file: File) {
    try {
      if (hasUnsyncedChanges) {
        const proceed = window.confirm(
          "You have unsynced app changes. Importing a workbook will replace the current app dataset. Continue?"
        );
        if (!proceed) return;
      }
      const ExcelJS = await loadExcelJs();
      const workbook = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await workbook.xlsx.load(buffer);

      const breakSheet =
        workbook.getWorksheet("Break Tracker") ||
        workbook.worksheets.find(
          (ws: { name: string }) => ws.name.trim().toLowerCase() === "break tracker"
        );

      const cardSheet =
        workbook.getWorksheet("Card Inventory") ||
        workbook.worksheets.find(
          (ws: { name: string }) => ws.name.trim().toLowerCase() === "card inventory"
        );

      if (!breakSheet || !cardSheet) {
        alert('Could not find required sheets. Expected "Break Tracker" and "Card Inventory".');
        return;
      }

      function rowToValues(row: { values: unknown }): unknown[] {
        const values = row.values;
        return Array.isArray(values) ? values.slice(1) : [];
      }

      function detectHeaderRow(
        worksheet: { actualRowCount: number; getRow: (n: number) => { values: unknown } },
        expectedHeaders: string[],
        scanLimit = 25
      ): number {
        let bestRow = 1;
        let bestScore = -1;
        const maxRow = Math.min(worksheet.actualRowCount || scanLimit, scanLimit);

        for (let r = 1; r <= maxRow; r += 1) {
          const rowValues = rowToValues(worksheet.getRow(r)).map((v) =>
            normalizeKey(String(v ?? ""))
          );
          const score = expectedHeaders.reduce((sum, header) => {
            return sum + (rowValues.includes(normalizeKey(header)) ? 1 : 0);
          }, 0);

          if (score > bestScore) {
            bestScore = score;
            bestRow = r;
          }
        }

        return bestRow;
      }

      function worksheetToObjects(
        worksheet: { actualRowCount: number; getRow: (n: number) => { values: unknown } },
        headerCandidates: string[],
        primaryCandidates: string[],
        scanLimit = 25
      ): { rows: Record<string, unknown>[]; headerRow: number } {
        const headerRow = detectHeaderRow(worksheet, headerCandidates, scanLimit);
        const headerValues = rowToValues(worksheet.getRow(headerRow)).map((h) =>
          String(h ?? "").trim()
        );

        const rows: Record<string, unknown>[] = [];
        let blankPrimaryStreak = 0;

        for (let r = headerRow + 1; r <= worksheet.actualRowCount; r += 1) {
          const rowValues = rowToValues(worksheet.getRow(r));
          const obj: Record<string, unknown> = {};

          headerValues.forEach((header, idx) => {
            if (!header) return;
            obj[header] = rowValues[idx];
          });

          const primaryValue = getCell(obj, primaryCandidates, "");
          const hasPrimary = hasMeaningfulValue(primaryValue);

          if (hasPrimary) {
            rows.push(obj);
            blankPrimaryStreak = 0;
          } else {
            blankPrimaryStreak += 1;
            if (blankPrimaryStreak >= 25) break;
          }
        }

        return { rows, headerRow };
      }

      const breakParsed = worksheetToObjects(
        breakSheet,
        [
          "Break ID",
          "Order #",
          "Date",
          "Breaker",
          "Product",
          "Team/Spot",
          "Purchase Platform",
          "Break Cost",
          "Shipping",
          "Tax",
        ],
        ["Break ID", "breakId", "Break", "ID"]
      );

      const cardParsed = worksheetToObjects(
        cardSheet,
        [
          "Card/Lot ID",
          "Break ID",
          "Order #",
          "Acquired Date",
          "Player/Card",
          "Parallel/Details",
          "Qty",
          "Sales Platform",
          "Listed Price",
          "Sold Price",
          "Sale Date",
          "Fees",
          "Shipping Cost",
          "Net Proceeds",
          "Est Market Value When Cards Recv'd",
          "Unit Cost",
          "Total Cost",
          "Realized COGS",
          "Profit",
          "Status",
        ],
        ["Card/Lot ID", "Card ID", "cardId", "Player/Card"]
      );

      const breakRowsRaw = breakParsed.rows;
      const cardRowsRaw = cardParsed.rows;

      const importedBreaks: BreakRow[] = breakRowsRaw
        .map((row, idx) => {
          const id =
            String(
              getCell(row, ["Break ID", "breakId", "break id", "id"]) ??
                `B${String(idx + 1).padStart(3, "0")}`
            ).trim() || `B${String(idx + 1).padStart(3, "0")}`;

          return {
            id,
            orderNo: String(getCell(row, ["Order #", "orderNo", "order number"], "") ?? ""),
            date: parseExcelDate(getCell(row, ["Date", "date"], "")),
            breaker: String(getCell(row, ["Breaker", "breaker"], "") ?? ""),
            product: String(getCell(row, ["Product", "product"], "") ?? ""),
            teamSpot: String(
              getCell(row, ["Team/Spot", "Team / Spot", "teamSpot", "team spot"], "") ?? ""
            ),
            platform: String(
              getCell(
                row,
                ["Purchase Platform", "PurchasePlatform", "platform", "purchase platform"],
                ""
              ) ?? ""
            ),
            breakCost: toNumber(getCell(row, ["Break Cost", "break cost", "breakCost"], 0)),
            shipping: toNumber(getCell(row, ["Shipping", "shipping"], 0)),
            tax: toNumber(getCell(row, ["Tax", "tax"], 0)),
          };
        })
        .filter((b) => {
          const id = String(b.id ?? "").trim();
          return id !== "" && id.toLowerCase() !== "0";
        });

      const importedCards: CardRow[] = cardRowsRaw
        .map((row, idx) => {
          const cardId =
            String(
              getCell(row, ["Card/Lot ID", "Card ID", "cardId", "card id", "id"]) ??
                `C${String(idx + 1).padStart(4, "0")}`
            ).trim() || `C${String(idx + 1).padStart(4, "0")}`;

          return {
            id: cardId,
            breakId: String(getCell(row, ["Break ID", "breakId", "break id"], "") ?? ""),
            orderNo: String(getCell(row, ["Order #", "orderNo", "order number"], "") ?? ""),
            acquiredDate: parseExcelDate(
              getCell(row, ["Acquired Date", "acquiredDate", "date acquired"], "")
            ),
            playerCard: String(
              getCell(row, ["Player/Card", "playerCard", "player / card", "card", "player"], "") ??
                ""
            ),
            details: String(
              getCell(row, ["Parallel/Details", "parallel/details", "details"], "") ?? ""
            ),
            qty: toNumber(getCell(row, ["Qty", "qty", "quantity"], 1), 1),
            salesPlatform: String(
              getCell(row, ["Sales Platform", "salesPlatform", "sales platform", "platform"], "") ??
                ""
            ),
            listedPrice: toNumberOrBlank(
              String(getCell(row, ["Listed Price", "listedPrice", "listed price"], "") ?? "")
            ),
            soldPrice: toNumberOrBlank(
              String(getCell(row, ["Sold Price", "soldPrice", "sold price"], "") ?? "")
            ),
            saleDate: parseExcelDate(getCell(row, ["Sale Date", "saleDate", "sale date"], "")),
            fees: toNumberOrBlank(String(getCell(row, ["Fees", "fees"], "") ?? "")),
            shippingCost: toNumberOrBlank(
              String(getCell(row, ["Shipping Cost", "shippingCost", "shipping cost"], "") ?? "")
            ),
            estMarketValue: toNumber(
              getCell(
                row,
                [
                  "Est Market Value When Cards Recv'd",
                  "Est Market Value",
                  "estMarketValue",
                  "market value",
                ],
                0
              )
            ),
            status: statusFromUnknown(getCell(row, ["Status", "status"], "Holding")),
            notes: String(getCell(row, ["Notes", "notes"], "") ?? ""),
            shippingProfile: String(
              getCell(row, ["Shipping Profile", "shippingProfile", "shipping profile"], "") ?? ""
            ),
            shippingCharged: toNumberOrBlank(
              String(getCell(row, ["Shipping Charged", "shippingCharged"], "") ?? "")
            ),
            postagePaid: toNumberOrBlank(
              String(getCell(row, ["Postage Paid", "postagePaid"], "") ?? "")
            ),
            suppliesCost: toNumberOrBlank(
              String(getCell(row, ["Supplies Cost", "suppliesCost"], "") ?? "")
            ),
            pennySleeveCost: toNumberOrBlank(
              String(getCell(row, ["Penny Sleeve Cost", "pennySleeveCost"], "") ?? "")
            ),
            topLoaderCost: toNumberOrBlank(
              String(getCell(row, ["Top Loader Cost", "topLoaderCost"], "") ?? "")
            ),
            cardSaverCost: toNumberOrBlank(
              String(getCell(row, ["Card Saver Cost", "cardSaverCost"], "") ?? "")
            ),
            teamBagCost: toNumberOrBlank(
              String(getCell(row, ["Team Bag Cost", "teamBagCost"], "") ?? "")
            ),
            envelopeCost: toNumberOrBlank(
              String(getCell(row, ["Envelope Cost", "envelopeCost"], "") ?? "")
            ),
            shellMailerCost: toNumberOrBlank(
              String(getCell(row, ["Shell Mailer Cost", "shellMailerCost"], "") ?? "")
            ),
            paddedMailerCost: toNumberOrBlank(
              String(getCell(row, ["Padded Mailer Cost", "paddedMailerCost"], "") ?? "")
            ),
            boxCost: toNumberOrBlank(
              String(getCell(row, ["Box Cost", "boxCost"], "") ?? "")
            ),
            shippingLabelCost: toNumberOrBlank(
              String(getCell(row, ["Shipping Label Cost", "shippingLabelCost"], "") ?? "")
            ),
            otherPackagingLabel: String(
              getCell(row, ["Other Packaging Label", "otherPackagingLabel"], "") ?? ""
            ),
            otherPackagingCost: toNumberOrBlank(
              String(getCell(row, ["Other Packaging Cost", "otherPackagingCost"], "") ?? "")
            ),
          };
        })
        .filter((c) => {
          const breakId = String(c.breakId ?? "").trim();
          const name = String(c.playerCard ?? "").trim();
          return breakId !== "" && name !== "";
        });

      if (importedBreaks.length === 0) {
        alert("Break Tracker was found, but no usable break rows were imported.");
        return;
      }

      pushUndoSnapshot("Workbook import");
      setBreaks(importedBreaks);
      setCards(importedCards);
      setLastImportName(file.name);
      setLastImportType(
        `Workbook (Break hdr row ${breakParsed.headerRow}, Card hdr row ${cardParsed.headerRow})`
      );
      setNewBreak((prev) => ({
        ...prev,
        id: getNextBreakId(importedBreaks),
      }));
      setNewCard((prev) => ({
        ...prev,
        breakId: importedBreaks[0]?.id ?? "",
        orderNo: importedBreaks[0]?.orderNo ?? "",
      }));
      setCsvTargetBreakId(importedBreaks[0]?.id ?? "");
      resetCsvNewBreak("generic");
      markWorkbookSyncedFromImport(file.name);
      logAudit(
        "Workbook imported",
        `${file.name} · ${importedBreaks.length} breaks · ${importedCards.length} cards`,
        "workbook",
        true
      );

      alert(
        `Imported ${importedBreaks.length} breaks and ${importedCards.length} card rows from ${file.name}.`
      );
    } catch (error) {
      console.error(error);
      alert(
        "Import failed. Please make sure the workbook has readable Break Tracker and Card Inventory sheets."
      );
    }
  }

  async function exportWorkbook() {
    try {
      const ExcelJS = await loadExcelJs();
      const workbook = new ExcelJS.Workbook();

      const sheets: Array<[string, Record<string, unknown>[]]> = [
        ["Break Tracker", workbookPayload.breakTracker as Record<string, unknown>[]],
        ["Card Inventory", workbookPayload.cardInventory as Record<string, unknown>[]],
        ["Personal Collection", workbookPayload.personalCollection as Record<string, unknown>[]],
        ["Donation Tracker", workbookPayload.donationTracker as Record<string, unknown>[]],
        ["Lots Tracker", workbookPayload.lotsTracker as Record<string, unknown>[]],
        ["Break ROI", workbookPayload.breakRoi as unknown as Record<string, unknown>[]],
      ];

      sheets.forEach(([name, rows]) => {
        const ws = workbook.addWorksheet(name);
        if (!rows.length) return;

        const columns = Object.keys(rows[0]);
        ws.columns = columns.map((key) => ({
          header: key,
          key,
          width: Math.max(14, key.length + 2),
        }));

        rows.forEach((row) => {
          ws.addRow(row);
        });

        ws.getRow(1).font = { bold: true };
      });

    const rawBuffer = await workbook.xlsx.writeBuffer();
const uint8 =
  rawBuffer instanceof Uint8Array
    ? rawBuffer
    : new Uint8Array(rawBuffer as ArrayBuffer);

const blob = new Blob([uint8], {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `baseball_card_tracker_sync_${stamp}.xlsx`;
      markWorkbookSyncedToExport(a.download);
      logAudit("Workbook exported", a.download, "workbook", false);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("Export failed.");
    }
  }


async function importCsvFromFile(file: File, source: CsvSource) {
  try {
    // Read CSV as binary so Excel-style exports (including eBay/CollX) parse correctly
    const data = await file.arrayBuffer();

    const workbook = XLSX.read(data, {
      type: "array",
      raw: false,
      codepage: 65001,
    });

    const firstSheetName = workbook.SheetNames[0];
    const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;

    if (!sheet) {
      alert("Could not read CSV file.");
      return;
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });

    console.log("CSV HEADERS:", rawRows[0] ? Object.keys(rawRows[0]) : []);

    const headers = rawRows.length ? Object.keys(rawRows[0]) : [];
    const parsed = parseCsvRows(rawRows, source);

    if (parsed.rows.length === 0) {
      alert("No usable rows were found in that CSV.");
      return;
    }

    setCsvImportPreview({
      fileName: file.name,
      source,
      headers,
      rows: parsed.rows,
      duplicateRawIds: parsed.duplicateRawIds,
      missingTitleCount: parsed.missingTitleCount,
      suspiciousRowsSkipped: parsed.suspiciousRowsSkipped,
    });

    const firstBreakId = breaks[0]?.id ?? "";
    setCsvTargetBreakId(firstBreakId);
    setCsvBreakMode("new");
    resetCsvNewBreak(source);
  } catch (error) {
    console.error(error);
    alert("CSV import failed. Please make sure the file is a readable CSV export.");
  }
}

function startCsvImport(source: CsvSource) {
  setPendingCsvSource(source);
  setCsvBreakMode("new");
  resetCsvNewBreak(source);
  csvImportRef.current?.click();
}

function applyCsvImport(preview: CsvImportPreview) {
  const creatingNewBreak = csvBreakMode === "new";

  let targetBreakId = csvTargetBreakId;
  let targetOrderNo = "";

  if (creatingNewBreak) {
    const trimmedId = csvNewBreak.id.trim();
    if (!trimmedId) {
      alert("New Break ID is required.");
      return;
    }
    if (breaks.some((b) => b.id === trimmedId)) {
      alert("That new Break ID already exists. Please use the next sequence or choose another ID.");
      return;
    }

    const newBreakRow: BreakRow = {
      id: trimmedId,
      orderNo: csvNewBreak.orderNo,
      date: csvNewBreak.date,
      breaker: csvNewBreak.breaker,
      product: csvNewBreak.product,
      teamSpot: csvNewBreak.teamSpot,
      platform: csvNewBreak.platform,
      breakCost: Number(csvNewBreak.breakCost || 0),
      shipping: Number(csvNewBreak.shipping || 0),
      tax: Number(csvNewBreak.tax || 0),
    };

    setBreaks((prev) => [...prev, newBreakRow]);
    targetBreakId = newBreakRow.id;
    targetOrderNo = newBreakRow.orderNo;
    setNewBreak((prev) => ({ ...prev, id: getNextBreakId([...breaks, newBreakRow]) }));
  } else {
    if (!csvTargetBreakId) {
      alert("Choose a target Break ID before confirming CSV import.");
      return;
    }

    const targetBreak = breaks.find((b) => b.id === csvTargetBreakId);
    if (!targetBreak) {
      alert("Selected target Break ID was not found.");
      return;
    }
    targetBreakId = targetBreak.id;
    targetOrderNo = targetBreak.orderNo;
  }

  const existingMaxCardNum = cards.reduce((max, card) => {
    const n = Number(String(card.id).replace(/\D/g, "") || 0);
    return Math.max(max, n);
  }, 0);

  const newRows: CardRow[] = preview.rows.map((row, idx) => {
    const nextNumericId = existingMaxCardNum + idx + 1;
    const nextId = `C${String(nextNumericId).padStart(4, "0")}`;

    const details = row.details;
    const listedPrice = row.status === "Listed" && row.purchasePrice !== "" ? row.purchasePrice : "";
    const soldPrice = row.status === "Sold" && row.purchasePrice !== "" ? row.purchasePrice : "";

    return {
      id: nextId,
      breakId: targetBreakId,
      orderNo: row.orderNo || targetOrderNo,
      acquiredDate: row.acquiredDate,
      playerCard: row.title,
      details,
      qty: row.qty,
      salesPlatform: row.salesPlatform,
      listedPrice,
      soldPrice,
      saleDate: row.status === "Sold" ? row.acquiredDate : "",
      fees: "",
      shippingCost: "",
      estMarketValue:
        row.marketValue || (typeof row.purchasePrice === "number" ? row.purchasePrice : 0),
      status: row.status,
      notes: row.notes,
      shippingProfile: "",
      shippingCharged: "",
      postagePaid: "",
      suppliesCost: "",
    };
  });

  const actionLabel = csvBreakMode === "new" ? "CSV import created new break" : "CSV import added to existing break";
  recordMutation(
    actionLabel,
    `${preview.fileName} → ${targetBreakId} (${newRows.length} card row(s))`,
    "csv"
  );

  setCards((prev) => [...prev, ...newRows]);
  setLastImportName(preview.fileName);
  setLastImportType(`${preview.source.toUpperCase()} CSV → Card Inventory`);
  setCsvImportPreview(null);
  setCsvTargetBreakId(targetBreakId);
  resetCsvNewBreak(preview.source);
  setNewCard((prev) => ({ ...prev, breakId: targetBreakId, orderNo: targetOrderNo }));
  markWorkbookDirty(
    creatingNewBreak
      ? `${preview.source.toUpperCase()} CSV imported into new break ${targetBreakId}`
      : `${preview.source.toUpperCase()} CSV imported into existing break ${targetBreakId}`
  );

  alert(
    `Imported ${newRows.length} card rows from ${preview.fileName} into ${creatingNewBreak ? `new break ${targetBreakId}` : `break ${targetBreakId}`}.`
  );
}

function placeholderImport(kind: string) {
  alert(`${kind} import is the next connector to build in this hub.`);
}

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                Hybrid app prototype mapped to workbook logic
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                Baseball Card Break Tracker
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                Full edit version: break landed cost, automatic equal-cost allocation,
                sales math, status routing, import/export hub, and workbook-ready sync logic.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KPI label="Breaks" value={breaks.length} sub="Break Tracker rows" />
              <KPI label="Cards / Lots" value={cards.length} sub="Card Inventory rows" />
              <KPI
                label="Net Proceeds"
                value={currency(dashboard.netProceeds)}
                sub="Workbook-style sold card math"
              />
              <KPI
                label="Recovery"
                value={percent(dashboard.recovery)}
                sub="Net proceeds + inventory on hand"
              />
            </div>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                activeTab === tab
                  ? "bg-slate-900 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Dashboard" && (
          <div className="space-y-6">
            <SectionTitle
              title="Workbook logic dashboard"
              subtitle="These KPIs reflect the formulas the workbook is using."
              icon={TrendingUp}
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KPI
                label="Total Invested"
                value={currency(dashboard.invested)}
                sub="Sum of Break Tracker landed cost"
              />
              <KPI
                label="Realized COGS"
                value={currency(dashboard.realizedCogs)}
                sub="Sold rows only"
              />
              <KPI
                label="Realized Profit"
                value={currency(dashboard.realizedProfit)}
                sub="Net proceeds - realized COGS"
              />
              <KPI
                label="Inventory On Hand"
                value={currency(dashboard.inventoryOnHand)}
                sub="Holding + Listed + Bulked + Lot"
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.25fr_.9fr]">
              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Break ROI preview</h3>
                  <span className="text-xs text-slate-500">
                    Mirrors Break ROI / Profit Engine concepts
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="pb-3 pr-4">Break</th>
                        <th className="pb-3 pr-4">Invested</th>
                        <th className="pb-3 pr-4">Cards In</th>
                        <th className="pb-3 pr-4">Net Proceeds</th>
                        <th className="pb-3 pr-4">Open Cost</th>
                        <th className="pb-3 pr-4">Profit</th>
                        <th className="pb-3 pr-4">Stage</th>
                        <th className="pb-3">Cash Recovery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakScorecard.map((b) => (
                        <tr key={b.id} className="border-b border-slate-100">
                          <td className="py-3 pr-4">
                            <div className="font-medium">{b.id}</div>
                            <div className="text-xs text-slate-500">{b.product}</div>
                          </td>
                          <td className="py-3 pr-4">{currency(b.invested)}</td>
                          <td className="py-3 pr-4">{b.cardsIn}</td>
                          <td className="py-3 pr-4">{currency(b.netProceeds)}</td>
                          <td className="py-3 pr-4">{currency(b.inventoryOnHand)}</td>
                          <td
                            className={`py-3 pr-4 font-medium ${
                              b.realizedProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {currency(b.realizedProfit)}
                          </td>
                          <td className="py-3 pr-4">{b.stage}</td>
                          <td className="py-3">{percent(b.recovery)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="text-lg font-semibold">Workbook logic locked in</h3>
                <div className="mt-4 space-y-3 text-sm">
                  {[
                    "Break Tracker landed cost = break cost + shipping + tax.",
                    "Card Inventory unit cost = break landed cost ÷ total qty in that break.",
                    "Editing a break automatically recalculates linked card costs.",
                    "Editing a card can change player/details, qty, break assignment, status, and sales data.",
                    "Status drives Personal / Donation / Lot routing.",
                    "Import / Export Hub lets you grow beyond one workbook format.",
                  ].map((item) => (
                    <div key={item} className="flex gap-3 rounded-2xl bg-slate-50 p-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <div>{item}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeTab === "Break Entry" && (
          <div className="space-y-6">
            <SectionTitle
              title="Break Entry"
              subtitle="Adds rows using the same base fields as the Break Tracker tab."
              icon={ClipboardList}
            />

            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.25fr]">
              <Card className="p-5">
                <form className="space-y-4" onSubmit={addBreak}>
                  <div className="grid gap-4 md:grid-cols-2">
                    {[
                      ["Break ID", "id"],
                      ["Order #", "orderNo"],
                      ["Date", "date"],
                      ["Breaker", "breaker"],
                      ["Product", "product"],
                      ["Team / Spot", "teamSpot"],
                      ["Platform", "platform"],
                      ["Break Cost", "breakCost"],
                      ["Shipping", "shipping"],
                      ["Tax", "tax"],
                    ].map(([label, key]) => (
                      <label key={key} className="block text-sm">
                        <div className="mb-1 text-slate-600">{label}</div>
                        <input
                          type={
                            key === "date"
                              ? "date"
                              : ["breakCost", "shipping", "tax"].includes(key)
                                ? "number"
                                : "text"
                          }
                          value={newBreak[key as keyof typeof newBreak]}
                          onChange={(e) =>
                            setNewBreak((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          className="w-full rounded-2xl border border-slate-200 px-3 py-2 outline-none transition focus:border-slate-400"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                    Break Tracker landed cost preview:{" "}
                    <span className="font-semibold text-slate-900">
                      {currency(
                        Number(newBreak.breakCost || 0) +
                          Number(newBreak.shipping || 0) +
                          Number(newBreak.tax || 0)
                      )}
                    </span>
                  </div>

                  <button className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                    <Plus className="h-4 w-4" /> Add Break
                  </button>
                </form>
              </Card>

              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Break Tracker preview</h3>
                  <div className="text-xs text-slate-500">Edit or delete breaks here</div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="pb-3 pr-4">Break</th>
                        <th className="pb-3 pr-4">Order #</th>
                        <th className="pb-3 pr-4">Date</th>
                        <th className="pb-3 pr-4">Product</th>
                        <th className="pb-3 pr-4">Cards</th>
                        <th className="pb-3 pr-4">Landed Cost</th>
                        <th className="pb-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breaks.map((b) => (
                        <tr key={b.id} className="border-b border-slate-100">
                          <td className="py-3 pr-4 font-medium">{b.id}</td>
                          <td className="py-3 pr-4">{b.orderNo}</td>
                          <td className="py-3 pr-4">{b.date}</td>
                          <td className="py-3 pr-4">{b.product}</td>
                          <td className="py-3 pr-4">{getBreakQty(cards, b.id)}</td>
                          <td className="py-3 pr-4">{currency(getBreakLandedCost(b))}</td>
                          <td className="py-3">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => openEditBreak(b)}
                                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteBreak(b.id)}
                                className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeTab === "Card Entry" && (
          <div className="space-y-6">
            <SectionTitle
              title="Card Entry with automatic cost allocation"
              subtitle="Unit cost is calculated like your workbook: break landed cost divided by total qty logged to that break."
              icon={Archive}
            />

            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.25fr]">
              <Card className="p-5">
                <form className="space-y-4" onSubmit={addCard}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm">
                      <div className="mb-1 text-slate-600">Break ID</div>
                      <select
                        value={newCard.breakId}
                        onChange={(e) => {
                          const nextBreak = breaks.find((b) => b.id === e.target.value);
                          setNewCard((p) => ({
                            ...p,
                            breakId: e.target.value,
                            orderNo: nextBreak?.orderNo || "",
                          }));
                        }}
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                      >
                        {breaks.map((b) => (
                          <option key={b.id}>{b.id}</option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm">
                      <div className="mb-1 text-slate-600">Acquired Date</div>
                      <input
                        type="date"
                        value={newCard.acquiredDate}
                        onChange={(e) =>
                          setNewCard((p) => ({ ...p, acquiredDate: e.target.value }))
                        }
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                      />
                    </label>

                    <label className="text-sm md:col-span-2">
                      <div className="mb-1 text-slate-600">Player / Card</div>
                      <input
                        value={newCard.playerCard}
                        onChange={(e) =>
                          setNewCard((p) => ({ ...p, playerCard: e.target.value }))
                        }
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                      />
                    </label>

                    <label className="text-sm md:col-span-2">
                      <div className="mb-1 text-slate-600">Parallel / Details</div>
                      <input
                        value={newCard.details}
                        onChange={(e) =>
                          setNewCard((p) => ({ ...p, details: e.target.value }))
                        }
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                      />
                    </label>

                    <label className="text-sm">
                      <div className="mb-1 text-slate-600">Qty</div>
                      <input
                        type="number"
                        value={newCard.qty}
                        onChange={(e) =>
                          setNewCard((p) => ({ ...p, qty: Number(e.target.value) || 1 }))
                        }
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                      />
                    </label>

                    <label className="text-sm">
                      <div className="mb-1 text-slate-600">Est. Market Value</div>
                      <input
                        type="number"
                        value={newCard.estMarketValue}
                        onChange={(e) =>
                          setNewCard((p) => ({ ...p, estMarketValue: e.target.value }))
                        }
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                      />
                    </label>

                    <label className="text-sm">
                      <div className="mb-1 flex items-center gap-2 text-slate-600">
                        <span>Status</span>
                        <Info className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <select
                        value={newCard.status}
                        onChange={(e) =>
                          setNewCard((p) => ({
                            ...p,
                            status: e.target.value as StatusType,
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                      >
                        {statusOptions.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                      <div className="mt-2 text-xs text-slate-500">
                        {statusHelp[newCard.status]}
                      </div>
                    </label>

                    <label className="text-sm md:col-span-2">
                      <div className="mb-1 text-slate-600">Notes</div>
                      <input
                        value={newCard.notes}
                        onChange={(e) =>
                          setNewCard((p) => ({ ...p, notes: e.target.value }))
                        }
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                      />
                    </label>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                    Estimated unit cost after save:{" "}
                    <span className="font-semibold text-slate-900">
                      {currency(
                        getUnitCost(
                          [
                            ...cards,
                            {
                              ...newCard,
                              id: "TEMP",
                              qty: Number(newCard.qty || 1),
                              salesPlatform: newCard.salesPlatform,
                              listedPrice: toNumberOrBlank(newCard.listedPrice),
                              soldPrice: toNumberOrBlank(newCard.soldPrice),
                              fees: toNumberOrBlank(newCard.fees),
                              shippingCost: toNumberOrBlank(newCard.shippingCost),
                              estMarketValue: Number(newCard.estMarketValue || 0),
                              shippingCharged: toNumberOrBlank(newCard.shippingCharged),
                              postagePaid: toNumberOrBlank(newCard.postagePaid),
                              suppliesCost: toNumberOrBlank(newCard.suppliesCost),
                            },
                          ] as CardRow[],
                          breaks,
                          {
                            ...newCard,
                            id: "TEMP",
                            qty: Number(newCard.qty || 1),
                            salesPlatform: newCard.salesPlatform,
                            listedPrice: toNumberOrBlank(newCard.listedPrice),
                            soldPrice: toNumberOrBlank(newCard.soldPrice),
                            fees: toNumberOrBlank(newCard.fees),
                            shippingCost: toNumberOrBlank(newCard.shippingCost),
                            estMarketValue: Number(newCard.estMarketValue || 0),
                            shippingCharged: toNumberOrBlank(newCard.shippingCharged),
                            postagePaid: toNumberOrBlank(newCard.postagePaid),
                            suppliesCost: toNumberOrBlank(newCard.suppliesCost),
                          } as CardRow
                        )
                      )}
                    </span>
                  </div>

                  <button className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                    <Plus className="h-4 w-4" /> Add Card / Lot
                  </button>
                </form>
              </Card>

              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Card Inventory preview</h3>
                  <div className="relative w-full max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      value={cardSearch}
                      onChange={(e) => setCardSearch(e.target.value)}
                      placeholder="Search cards, break IDs, order #, notes..."
                      className="w-full rounded-2xl border border-slate-200 py-2 pl-9 pr-3 text-sm"
                    />
                  </div>
                </div>

                <div className="max-h-[520px] overflow-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-white text-left text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="px-3 py-3">Card</th>
                        <th className="px-3 py-3">Break</th>
                        <th className="px-3 py-3">Qty</th>
                        <th className="px-3 py-3">Unit Cost</th>
                        <th className="px-3 py-3">Total Cost</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCards.map((c) => (
                        <tr key={c.id} className="border-b border-slate-100">
                          <td className="px-3 py-3">
                            <div className="font-medium">{c.playerCard}</div>
                            <div className="text-xs text-slate-500">{c.details}</div>
                          </td>
                          <td className="px-3 py-3">{c.breakId}</td>
                          <td className="px-3 py-3">{c.qty}</td>
                          <td className="px-3 py-3">
                            {currency(getUnitCost(cards, breaks, c))}
                          </td>
                          <td className="px-3 py-3">
                            {currency(getTotalCost(cards, breaks, c))}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-medium ${statusStyles[c.status]}`}
                            >
                              {c.status}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => openEditCard(c)}
                                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteCard(c.id)}
                                className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeTab === "Sales Entry" && (
          <div className="space-y-6">
            <SectionTitle
              title="Sales Entry"
              subtitle="Sold-row logic: shipping profile defaults, shipping cost, net proceeds, realized COGS, and profit only fill when status is Sold."
              icon={DollarSign}
            />

            <Card className="p-5">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="pb-3 pr-4">Card</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 pr-4">Listed</th>
                      <th className="pb-3 pr-4">Sold</th>
                      <th className="pb-3 pr-4">Profile</th>
                      <th className="pb-3 pr-4">Postage</th>
                      <th className="pb-3 pr-4">Supplies</th>
                      <th className="pb-3 pr-4">Fees</th>
                      <th className="pb-3 pr-4">Net</th>
                      <th className="pb-3 pr-4">COGS</th>
                      <th className="pb-3 pr-4">Profit</th>
                      <th className="pb-3 pr-4">Edit</th>
                      <th className="pb-3">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100 align-top">
                        <td className="py-3 pr-4">
                          <div className="font-medium">{c.playerCard}</div>
                          <div className="text-xs text-slate-500">
                            {c.breakId} · {c.id}
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <select
                            value={c.status}
                            onChange={(e) =>
                              updateCard(c.id, {
                                status: e.target.value as StatusType,
                              })
                            }
                            className="rounded-xl border border-slate-200 px-2 py-1"
                          >
                            {statusOptions.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 pr-4 font-medium">{currency(getPostageUsed(c))}</td>
                        <td className="py-3 pr-4 font-medium">{currency(getSuppliesUsed(c))}</td>
                        <td className="py-3 pr-4">
                          <input
                            type="number"
                            value={c.listedPrice}
                            onChange={(e) =>
                              updateCard(c.id, {
                                listedPrice:
                                  e.target.value === "" ? "" : Number(e.target.value),
                              })
                            }
                            className="w-24 rounded-xl border border-slate-200 px-2 py-1"
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <input
                            type="number"
                            value={c.soldPrice}
                            onChange={(e) =>
                              updateCard(c.id, {
                                soldPrice:
                                  e.target.value === "" ? "" : Number(e.target.value),
                              })
                            }
                            className="w-24 rounded-xl border border-slate-200 px-2 py-1"
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <select
                            value={c.shippingProfile}
                            onChange={(e) =>
                              updateCard(c.id, { ...buildCardPatchFromShippingProfile(e.target.value) })
                            }
                            className="rounded-xl border border-slate-200 px-2 py-1"
                          >
                            <option value="">Auto / blank</option>
                            {Object.keys(shippingProfiles).map((p) => (
                              <option key={p}>{p}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 pr-4">
                          <input
                            type="number"
                            value={c.fees}
                            onChange={(e) =>
                              updateCard(c.id, {
                                fees: e.target.value === "" ? "" : Number(e.target.value),
                              })
                            }
                            className="w-20 rounded-xl border border-slate-200 px-2 py-1"
                          />
                        </td>
                        <td className="py-3 pr-4 font-medium">{currency(getNetProceeds(c))}</td>
                        <td className="py-3 pr-4 font-medium">
                          {currency(getRealizedCogs(cards, breaks, c))}
                        </td>
                        <td
                          className={`py-3 pr-4 font-medium ${
                            getProfit(cards, breaks, c) >= 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }`}
                        >
                          {currency(getProfit(cards, breaks, c))}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => quickMarkSold(c.id)}
                              className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
                            >
                              Quick sold
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditCard(c)}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          </div>
                        </td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => deleteCard(c.id)}
                            className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Reusable shipping profiles</h3>
                <p className="text-sm text-slate-500">
                  Save common mailing setups once, then apply them to sold cards with one click.
                </p>
              </div>
              <button
                type="button"
                onClick={startNewShippingProfile}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
                New profile
              </button>
            </div>

            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-3">
                {Object.entries(shippingProfiles as ShippingProfileMap).map(([name, profile]) => (
                  <div key={name} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{name}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Shipping charged {currency(profile.shippingCharged)} · Postage {currency(profile.postagePaid)} · Packaging {currency(getPackagingCostTotal(profile))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => editShippingProfile(name)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteShippingProfile(name)}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <form className="space-y-4" onSubmit={saveShippingProfile}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm md:col-span-2">
                    <div className="mb-1 text-slate-600">Profile name</div>
                    <input
                      value={profileDraftName}
                      onChange={(e) => setProfileDraftName(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                    />
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-slate-600">Shipping charged</div>
                    <input
                      type="number"
                      step="0.01"
                      value={profileDraft.shippingCharged}
                      onChange={(e) => setProfileDraft((prev) => ({ ...prev, shippingCharged: Number(e.target.value || 0) }))}
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                    />
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-slate-600">Postage paid</div>
                    <input
                      type="number"
                      step="0.01"
                      value={profileDraft.postagePaid}
                      onChange={(e) => setProfileDraft((prev) => ({ ...prev, postagePaid: Number(e.target.value || 0) }))}
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                    />
                  </label>
                </div>

                <PackagingCostBuilder
                  value={profileDraft}
                  onChange={(patch) => setProfileDraft((prev) => ({ ...prev, ...patch }))}
                />

                <div className="flex gap-3">
                  <button type="submit" className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                    Save profile
                  </button>
                  <button type="button" onClick={startNewShippingProfile} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
                    Reset
                  </button>
                </div>
              </form>
            </div>
          </Card>
          </div>
        )}


        {activeTab === "Profit Engine / ROI" && (
          <div className="space-y-6">
            <SectionTitle
              title="Profit Engine + Break ROI Dashboard"
              subtitle="Surface true sale profitability, projected listed margins, and the breaks that are carrying or dragging your business."
              icon={TrendingUp}
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KPI
                label="Profitable Sales"
                value={profitCenter.positiveSales}
                sub={`${profitCenter.soldCards.length} sold row(s) tracked`}
              />
              <KPI
                label="Loss Sales"
                value={profitCenter.negativeSales}
                sub={`${profitCenter.breakEvenSales} near break-even`}
              />
              <KPI
                label="Realized Margin"
                value={percent(profitCenter.realizedMargin)}
                sub="Realized profit ÷ gross sold price"
              />
              <KPI
                label="Projected Listed Profit"
                value={currency(profitCenter.projectedListedProfit)}
                sub="Based on listed price, est. fees, and shipping"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KPI
                label="Best Break Economic Profit"
                value={profitCenter.bestBreaks[0] ? currency(profitCenter.bestBreaks[0].economicProfit) : currency(0)}
                sub={profitCenter.bestBreaks[0] ? `${profitCenter.bestBreaks[0].id} · ${profitCenter.bestBreaks[0].product}` : "No break data"}
              />
              <KPI
                label="Worst Break Economic Profit"
                value={profitCenter.worstBreaks[0] ? currency(profitCenter.worstBreaks[0].economicProfit) : currency(0)}
                sub={profitCenter.worstBreaks[0] ? `${profitCenter.worstBreaks[0].id} · ${profitCenter.worstBreaks[0].product}` : "No break data"}
              />
              <KPI
                label="Unsold Value Gap"
                value={currency(profitCenter.inventoryValueGap)}
                sub="Estimated market value - cost basis on unsold cards"
              />
              <KPI
                label="Listed Cards"
                value={profitCenter.listedCards.length}
                sub="Projected profit shown below"
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Top profitable sales</h3>
                  <span className="text-xs text-slate-500">First 10 sold rows by profit</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="pb-3 pr-4">Card</th>
                        <th className="pb-3 pr-4">Sold</th>
                        <th className="pb-3 pr-4">Net</th>
                        <th className="pb-3 pr-4">COGS</th>
                        <th className="pb-3">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitCenter.topProfits.map((card) => (
                        <tr key={card.id} className="border-b border-slate-100">
                          <td className="py-3 pr-4">
                            <div className="font-medium">{card.playerCard}</div>
                            <div className="text-xs text-slate-500">{card.breakId} · {card.saleDate || "No sale date"}</div>
                          </td>
                          <td className="py-3 pr-4">{currency(card.soldPrice)}</td>
                          <td className="py-3 pr-4">{currency(card.netProceeds)}</td>
                          <td className="py-3 pr-4">{currency(card.costBasis)}</td>
                          <td className={`py-3 font-medium ${card.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {currency(card.profit)}
                          </td>
                        </tr>
                      ))}
                      {profitCenter.topProfits.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-sm text-slate-500">
                            No sold rows yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Biggest losses</h3>
                  <span className="text-xs text-slate-500">Sales dragging profit</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="pb-3 pr-4">Card</th>
                        <th className="pb-3 pr-4">Sold</th>
                        <th className="pb-3 pr-4">Shipping</th>
                        <th className="pb-3 pr-4">Fees</th>
                        <th className="pb-3">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitCenter.biggestLosses.map((card) => (
                        <tr key={card.id} className="border-b border-slate-100">
                          <td className="py-3 pr-4">
                            <div className="font-medium">{card.playerCard}</div>
                            <div className="text-xs text-slate-500">{card.breakId} · {card.id}</div>
                          </td>
                          <td className="py-3 pr-4">{currency(card.soldPrice)}</td>
                          <td className="py-3 pr-4">{currency(card.shippingExpense)}</td>
                          <td className="py-3 pr-4">{currency(card.fees)}</td>
                          <td className={`py-3 font-medium ${card.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {currency(card.profit)}
                          </td>
                        </tr>
                      ))}
                      {profitCenter.biggestLosses.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-sm text-slate-500">
                            No sold rows yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Break ROI leaderboard</h3>
                  <span className="text-xs text-slate-500">Economic profit includes open estimated market value</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="pb-3 pr-4">Break</th>
                        <th className="pb-3 pr-4">Invested</th>
                        <th className="pb-3 pr-4">Net Proceeds</th>
                        <th className="pb-3 pr-4">Open MV</th>
                        <th className="pb-3 pr-4">Economic Profit</th>
                        <th className="pb-3">ROI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitCenter.bestBreaks.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="py-3 pr-4">
                            <div className="font-medium">{row.id}</div>
                            <div className="text-xs text-slate-500">{row.product}</div>
                          </td>
                          <td className="py-3 pr-4">{currency(row.invested)}</td>
                          <td className="py-3 pr-4">{currency(row.netProceeds)}</td>
                          <td className="py-3 pr-4">{currency(row.openEstMv)}</td>
                          <td className={`py-3 pr-4 font-medium ${row.economicProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {currency(row.economicProfit)}
                          </td>
                          <td className="py-3">{percent(row.economicRoi)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Breaks needing attention</h3>
                  <span className="text-xs text-slate-500">Lowest economic profit first</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="pb-3 pr-4">Break</th>
                        <th className="pb-3 pr-4">Stage</th>
                        <th className="pb-3 pr-4">Open Cost</th>
                        <th className="pb-3 pr-4">Open MV</th>
                        <th className="pb-3 pr-4">Economic Profit</th>
                        <th className="pb-3">Recovery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitCenter.worstBreaks.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="py-3 pr-4">
                            <div className="font-medium">{row.id}</div>
                            <div className="text-xs text-slate-500">{row.product}</div>
                          </td>
                          <td className="py-3 pr-4">{row.stage}</td>
                          <td className="py-3 pr-4">{currency(row.inventoryOnHand)}</td>
                          <td className="py-3 pr-4">{currency(row.openEstMv)}</td>
                          <td className={`py-3 pr-4 font-medium ${row.economicProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {currency(row.economicProfit)}
                          </td>
                          <td className="py-3">{percent(row.recovery)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Listed card pricing intelligence</h3>
                  <span className="text-xs text-slate-500">Projected from listed price and current shipping profile</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="pb-3 pr-4">Card</th>
                        <th className="pb-3 pr-4">Listed</th>
                        <th className="pb-3 pr-4">Min Profit List</th>
                        <th className="pb-3 pr-4">Projected Profit</th>
                        <th className="pb-3">Signal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitCenter.staleListed.map((card) => (
                        <tr key={card.id} className="border-b border-slate-100">
                          <td className="py-3 pr-4">
                            <div className="font-medium">{card.playerCard}</div>
                            <div className="text-xs text-slate-500">{card.breakId} · cost {currency(card.costBasis)}</div>
                          </td>
                          <td className="py-3 pr-4">{currency(card.listedPrice)}</td>
                          <td className="py-3 pr-4">{currency(card.minimumProfitableList)}</td>
                          <td className={`py-3 pr-4 font-medium ${card.projectedProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {currency(card.projectedProfit)}
                          </td>
                          <td className="py-3">
                            <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                              card.projectedProfit > 5
                                ? "bg-emerald-100 text-emerald-700"
                                : card.projectedProfit >= 0
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-rose-100 text-rose-700"
                            }`}>
                              {card.projectedProfit > 5 ? "Healthy" : card.projectedProfit >= 0 ? "Thin" : "Loss risk"}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {profitCenter.staleListed.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-sm text-slate-500">
                            No listed cards to analyze yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Unsold inventory value gap</h3>
                  <span className="text-xs text-slate-500">Estimated market value compared with allocated cost</span>
                </div>

                <div className="space-y-3">
                  {profitCenter.unsoldCards
                    .sort((a, b) => (Number(b.estMarketValue || 0) - b.costBasis) - (Number(a.estMarketValue || 0) - a.costBasis))
                    .slice(0, 10)
                    .map((card) => (
                      <div key={card.id} className="rounded-2xl bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="font-medium text-slate-900">{card.playerCard}</div>
                            <div className="mt-1 text-xs text-slate-500">{card.breakId} · {card.status} · qty {card.qty}</div>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                            card.marketGap >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          }`}>
                            {card.marketGap >= 0 ? "Above cost" : "Below cost"}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                          <div>Cost basis: <span className="font-medium text-slate-900">{currency(card.costBasis)}</span></div>
                          <div>Est. MV: <span className="font-medium text-slate-900">{currency(card.estMarketValue)}</span></div>
                          <div>Gap: <span className={`font-medium ${card.marketGap >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{currency(card.marketGap)}</span></div>
                        </div>
                      </div>
                    ))}
                  {profitCenter.unsoldCards.length === 0 && (
                    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                      No unsold cards to analyze yet.
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeTab === "Status Routing" && (
          <div className="space-y-6">
            <SectionTitle
              title="Status Routing"
              subtitle="These queues mirror workbook behavior where Personal, Donation, and Lot tabs are fed from Card Inventory status."
              icon={Package2}
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {queueGroups.map((group) => {
                const iconMap = {
                  Personal: User,
                  Donation: Gift,
                  Lot: Package2,
                  Sold: DollarSign,
                  Listed: Archive,
                  Holding: ClipboardList,
                  Bulked: Package2,
                };
                const Icon = iconMap[group.status];

                return (
                  <Card key={group.status} className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-slate-100 p-2">
                          <Icon className="h-5 w-5 text-slate-700" />
                        </div>
                        <div>
                          <div className="font-semibold">{group.status}</div>
                          <div className="text-xs text-slate-500">
                            {group.cards.length} rows · {group.totalQty} qty
                          </div>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${statusStyles[group.status]}`}
                      >
                        {group.status}
                      </span>
                    </div>

                    <div className="mt-4 text-sm text-slate-500">Tracked cost basis</div>
                    <div className="mt-1 text-2xl font-semibold">
                      {currency(group.totalCost)}
                    </div>

                    <div className="mt-4 space-y-2">
                      {group.cards.slice(0, 3).map((c) => (
                        <div key={c.id} className="rounded-2xl bg-slate-50 p-3 text-sm">
                          <div className="font-medium">{c.playerCard}</div>
                          <div className="text-xs text-slate-500">
                            {c.breakId} · {currency(getTotalCost(cards, breaks, c))}
                          </div>
                        </div>
                      ))}

                      {group.cards.length === 0 && (
                        <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-500">
                          No rows in this bucket.
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>

            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Info className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-900">Quick Status Help</h3>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {statusOptions.map((status) => (
                  <div key={status} className="rounded-xl bg-slate-50 p-3 text-xs">
                    <div className="mb-1">
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusStyles[status]}`}
                      >
                        {status}
                      </span>
                    </div>
                    <div className="text-slate-600">{statusHelp[status]}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}



        {activeTab === "Reports / Tax Center" && (
          <div className="space-y-6">
            <SectionTitle
              title="Reports / Tax Center"
              subtitle="See tax-relevant totals from your current workbook-backed dataset and export a summary report."
              icon={FileSpreadsheet}
            />

            <Card className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Tax reporting basis</div>
                  <div className="mt-1 text-sm text-slate-500">
                    These totals are built from your current break and card records. Sold rows drive realized sales metrics. Donation and personal rows are shown separately for review.
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className="text-sm">
                    <div className="mb-1 text-slate-600">Report year</div>
                    <select
                      value={selectedReportYear}
                      onChange={(e) => setSelectedReportYear(e.target.value)}
                      className="rounded-2xl border border-slate-200 px-3 py-2"
                    >
                      {reportYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={exportTaxSummaryCsv}
                    className="inline-flex items-center gap-2 self-end rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    <Download className="h-4 w-4" />
                    Export Tax Summary CSV
                  </button>
                </div>
              </div>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KPI label="Gross Sales" value={currency(taxReport.grossSales)} sub="Sold price only" />
              <KPI label="Shipping Income" value={currency(taxReport.shippingIncome)} sub="Shipping charged on sold rows" />
              <KPI label="Marketplace Fees" value={currency(taxReport.fees)} sub="Sold rows only" />
              <KPI label="Postage + Supplies" value={currency(taxReport.postageAndSupplies)} sub="Shipping cost used on sold rows" />
              <KPI label="Net Proceeds" value={currency(taxReport.netProceeds)} sub="Sales + shipping income - fees - shipping cost" />
              <KPI label="Realized COGS" value={currency(taxReport.realizedCogs)} sub="Cost basis of sold rows" />
              <KPI label="Realized Profit" value={currency(taxReport.realizedProfit)} sub="Net proceeds - realized COGS" />
              <KPI label="Break Purchases" value={currency(taxReport.landedPurchases)} sub="Landed cost of breaks acquired in report year" />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KPI label="Ending Inventory Cost" value={currency(taxReport.inventoryOnHand)} sub="Holding + Listed + Bulked + Lot" />
              <KPI label="Ending Inventory Est. MV" value={currency(taxReport.estInventoryMarketValue)} sub="Current estimate on unsold inventory" />
              <KPI label="Donation Cost Basis" value={currency(taxReport.donationsCost)} sub={`${taxReport.donatedCards.length} donation row(s)`} />
              <KPI label="Personal Transfer Cost" value={currency(taxReport.personalCost)} sub={`${taxReport.personalCards.length} personal row(s)`} />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Sold rows included in report</h3>
                  <span className="text-xs text-slate-500">First 12 rows</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-slate-500">
                      <tr className="border-b border-slate-200">
                        <th className="pb-3 pr-4">Card</th>
                        <th className="pb-3 pr-4">Sale Date</th>
                        <th className="pb-3 pr-4">Sold</th>
                        <th className="pb-3 pr-4">Fees</th>
                        <th className="pb-3 pr-4">Net</th>
                        <th className="pb-3">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxReport.soldCards.slice(0, 12).map((c) => (
                        <tr key={c.id} className="border-b border-slate-100">
                          <td className="py-3 pr-4">
                            <div className="font-medium">{c.playerCard}</div>
                            <div className="text-xs text-slate-500">{c.breakId} · {c.id}</div>
                          </td>
                          <td className="py-3 pr-4">{c.saleDate || "—"}</td>
                          <td className="py-3 pr-4">{currency(c.soldPrice)}</td>
                          <td className="py-3 pr-4">{currency(c.fees)}</td>
                          <td className="py-3 pr-4">{currency(getNetProceeds(c))}</td>
                          <td className={`py-3 ${getProfit(cards, breaks, c) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {currency(getProfit(cards, breaks, c))}
                          </td>
                        </tr>
                      ))}
                      {taxReport.soldCards.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-sm text-slate-500">
                            No sold rows found for this report year.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Disposition review</h3>
                  <span className="text-xs text-slate-500">Donation and personal tracking</span>
                </div>
                <div className="space-y-4">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-sm font-medium text-slate-900">Donation rows</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {taxReport.donatedCards.length} row(s) · {currency(taxReport.donationsCost)} tracked cost basis
                    </div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-sm font-medium text-slate-900">Personal rows</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {taxReport.personalCards.length} row(s) · {currency(taxReport.personalCost)} tracked cost basis
                    </div>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                    This center is a business reporting tool built from your app data. It is useful for bookkeeping and prep, but you should still review final tax treatment with a qualified tax professional.
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}
        {activeTab === "Import / Export Hub" && (
          <div className="space-y-6">
            <SectionTitle
              title="Import / Export Hub"
              subtitle="One place for workbook sync today, plus future CSV connectors for eBay, CollX, and other marketplaces."
              icon={Database}
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KPI label="Breaks Loaded" value={breaks.length} sub="Current app dataset" />
              <KPI label="Cards Loaded" value={cards.length} sub="Current app dataset" />
              <KPI
                label="Last Import Type"
                value={lastImportType}
                sub={lastImportName || "No file imported yet"}
              />
              <KPI label="Export Sheets" value={6} sub="Workbook sync export" />
            </div>

            <Card className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Workbook master sync</div>
                  <div className="mt-1 text-sm text-slate-500">
                    The currently loaded workbook is treated as the source of truth. App edits and CSV imports mark the workbook as needing sync back to Excel.
                  </div>
                </div>
                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${hasUnsyncedChanges ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {hasUnsyncedChanges ? "Unsynced app changes" : "Workbook in sync"}
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-slate-500">Master workbook</div>
                  <div className="mt-1 font-medium text-slate-900">{masterWorkbookName || "Not loaded yet"}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-slate-500">Last workbook import</div>
                  <div className="mt-1 font-medium text-slate-900">{lastWorkbookImportedAt || "None"}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-slate-500">Last workbook export</div>
                  <div className="mt-1 font-medium text-slate-900">{lastWorkbookExportedAt || "None"}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-slate-500">Latest sync action</div>
                  <div className="mt-1 font-medium text-slate-900">{lastSyncAction}</div>
                </div>
              </div>
            </Card>

            <input
              ref={workbookImportRef}
              type="file"
              accept=".xlsx,.xlsm,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void importWorkbookFromFile(file);
                }
                e.currentTarget.value = "";
              }}
            />

<input
  ref={csvImportRef}
  type="file"
  accept=".csv,text/csv"
  className="hidden"
  onChange={(e) => {
    const file = e.target.files?.[0];
    if (file) {
      void importCsvFromFile(file, pendingCsvSource);
    }
    e.currentTarget.value = "";
  }}
/>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-100 p-2">
                    <FileSpreadsheet className="h-5 w-5 text-slate-700" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Workbook Connector</h3>
                    <p className="text-sm text-slate-500">
                      Use this for your current Excel workflow.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    Auto-detects the real header row in <strong>Break Tracker</strong> and{" "}
                    <strong>Card Inventory</strong>.
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    Ignores formula-filled blank rows that do not have a real ID/key.
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    Exports a fresh sync workbook with break, inventory, personal, donation,
                    lots, and ROI sheets.
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => workbookImportRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Upload className="h-4 w-4" />
                    Import My Workbook
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void exportWorkbook();
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    <Download className="h-4 w-4" />
                    Export Sync Workbook
                  </button>
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-100 p-2">
                    <Table2 className="h-5 w-5 text-slate-700" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">CSV Connectors</h3>
                    <p className="text-sm text-slate-500">
                      These are the next import paths so the app is not locked to one workbook.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    onClick={() => startCsvImport("generic")}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <FileUp className="h-4 w-4 text-slate-500" />
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          Import Generic CSV
                        </div>
                        <div className="text-xs text-slate-500">
                          Flexible column mapping for custom exports
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">Next</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => startCsvImport("ebay")}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <Store className="h-4 w-4 text-slate-500" />
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          Import eBay CSV
                        </div>
                        <div className="text-xs text-slate-500">
                          Sales, fees, shipping, and marketplace exports
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">Next</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => startCsvImport("collx")}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <Table2 className="h-4 w-4 text-slate-500" />
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          Import CollX CSV
                        </div>
                        <div className="text-xs text-slate-500">
                          Bring in cards from CollX exports
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">Next</span>
                  </button>
                </div>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.25fr]">
              <Card className="p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <RefreshCw className="h-4 w-4" /> Hub design
                </div>

                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    1. Multiple source formats feed one internal data structure.
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    2. Break cost allocation and status routing stay the same no matter the source.
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    3. Workbook sync remains your accounting/tax-friendly connector.
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    4. CSV imports become ingestion tools, not separate systems.
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-3 text-amber-800">
                    Workbook import/export is your master sync loop. CSV imports feed Card Inventory and should be exported back to workbook after review.
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="text-lg font-semibold">Sheet-ready payload preview</h3>
                <div className="mt-4 max-h-[520px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                  <pre>{JSON.stringify(workbookPayload, null, 2)}</pre>
                </div>
              </Card>
            </div>

            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-100 p-2">
                  <FileDown className="h-5 w-5 text-slate-700" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Planned connector order</h3>
                  <p className="text-sm text-slate-500">
                    Best sequence so we keep your workbook safe while expanding import flexibility.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm">
                {[
                  "1. Stabilize workbook import/export",
                  "2. Add generic CSV mapping",
                  "3. Add eBay CSV importer",
                  "4. Add CollX CSV importer",
                ].map((step) => (
                  <div key={step} className="rounded-2xl bg-slate-50 p-4 text-slate-700">
                    {step}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {activeTab === "Audit / Safety" && (
  <div className="space-y-6">
    <SectionTitle
      title="Audit / Safety"
      subtitle="Track major changes, imports, exports, and use undo to recover from recent mistakes."
      icon={ClipboardList}
    />

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KPI label="Undo snapshots" value={undoStack.length} sub="Recent restorable states" />
      <KPI label="Audit entries" value={auditLog.length} sub="Latest actions recorded" />
      <KPI
        label="Workbook sync state"
        value={hasUnsyncedChanges ? "Dirty" : "Synced"}
        sub={hasUnsyncedChanges ? "Export workbook to sync" : "App matches workbook"}
      />
      <KPI label="Master workbook" value={masterWorkbookName || "None"} sub={lastWorkbookImportedAt || "No workbook imported yet"} />
    </div>

    <Card className="p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Safety controls</h3>
          <p className="text-sm text-slate-500">
            Use undo after accidental edits or imports. Recent major actions are logged below.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={undoLastChange}
            disabled={undoStack.length === 0}
            className={`rounded-2xl px-4 py-2 text-sm font-medium ${
              undoStack.length === 0
                ? "cursor-not-allowed bg-slate-200 text-slate-500"
                : "bg-slate-900 text-white"
            }`}
          >
            Undo Last Change
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm">
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-slate-500">Latest sync action</div>
          <div className="mt-1 font-medium text-slate-900">{lastSyncAction}</div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-slate-500">Last workbook import</div>
          <div className="mt-1 font-medium text-slate-900">{lastWorkbookImportedAt || "None"}</div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-slate-500">Last workbook export</div>
          <div className="mt-1 font-medium text-slate-900">{lastWorkbookExportedAt || "None"}</div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-slate-500">Latest undo snapshot</div>
          <div className="mt-1 font-medium text-slate-900">{undoStack[0]?.label || "No snapshot yet"}</div>
        </div>
      </div>
    </Card>

    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Recent audit log</h3>
        <span className="text-xs text-slate-500">Newest first</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="pb-3 pr-4">Time</th>
              <th className="pb-3 pr-4">Action</th>
              <th className="pb-3 pr-4">Details</th>
              <th className="pb-3 pr-4">Source</th>
              <th className="pb-3">Undo</th>
            </tr>
          </thead>
          <tbody>
            {auditLog.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-sm text-slate-500">
                  No audit entries yet. Imports, exports, edits, deletions, and shipping profile changes will appear here.
                </td>
              </tr>
            ) : (
              auditLog.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100 align-top">
                  <td className="py-3 pr-4 whitespace-nowrap">{entry.timestamp}</td>
                  <td className="py-3 pr-4 font-medium">{entry.action}</td>
                  <td className="py-3 pr-4 text-slate-600">{entry.details}</td>
                  <td className="py-3 pr-4">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 uppercase">
                      {entry.source}
                    </span>
                  </td>
                  <td className="py-3">{entry.canUndo ? "Undo available" : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  </div>
        )}
      </div>

      <Modal
        open={!!editingBreak}
        title={editingBreak ? `Edit Break ${editingBreak.id}` : "Edit Break"}
        onClose={() => {
          setEditingBreak(null);
          setEditingBreakOriginalId(null);
        }}
      >
        {editingBreak && (
          <form className="space-y-4" onSubmit={saveEditBreak}>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["Break ID", "id"],
                ["Order #", "orderNo"],
                ["Date", "date"],
                ["Breaker", "breaker"],
                ["Product", "product"],
                ["Team / Spot", "teamSpot"],
                ["Platform", "platform"],
                ["Break Cost", "breakCost"],
                ["Shipping", "shipping"],
                ["Tax", "tax"],
              ].map(([label, key]) => (
                <label key={key} className="block text-sm">
                  <div className="mb-1 text-slate-600">{label}</div>
                  <input
                    type={
                      key === "date"
                        ? "date"
                        : ["breakCost", "shipping", "tax"].includes(key)
                          ? "number"
                          : "text"
                    }
                    value={String(editingBreak[key as keyof BreakRow] ?? "")}
                    onChange={(e) =>
                      setEditingBreak((prev) =>
                        prev
                          ? {
                              ...prev,
                              [key]: ["breakCost", "shipping", "tax"].includes(key)
                                ? Number(e.target.value || 0)
                                : e.target.value,
                            }
                          : prev
                      )
                    }
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                  />
                </label>
              ))}
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              New landed cost:{" "}
              <span className="font-semibold text-slate-900">
                {currency(getBreakLandedCost(editingBreak))}
              </span>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Save Break
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingBreak(null);
                  setEditingBreakOriginalId(null);
                }}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!editingCard}
        title={editingCard ? `Edit Card ${editingCard.id}` : "Edit Card"}
        onClose={() => setEditingCard(null)}
      >
        {editingCard && (
          <form className="space-y-4" onSubmit={saveEditCard}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <div className="mb-1 text-slate-600">Break ID</div>
                <select
                  value={editingCard.breakId}
                  onChange={(e) => {
                    const nextBreak = breaks.find((b) => b.id === e.target.value);
                    setEditingCard((prev) =>
                      prev
                        ? {
                            ...prev,
                            breakId: e.target.value,
                            orderNo: nextBreak?.orderNo || "",
                          }
                        : prev
                    );
                  }}
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                >
                  {breaks.map((b) => (
                    <option key={b.id}>{b.id}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-600">Order #</div>
                <input
                  value={editingCard.orderNo}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev ? { ...prev, orderNo: e.target.value } : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-600">Acquired Date</div>
                <input
                  type="date"
                  value={editingCard.acquiredDate}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev ? { ...prev, acquiredDate: e.target.value } : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-600">Qty</div>
                <input
                  type="number"
                  value={editingCard.qty}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev ? { ...prev, qty: Number(e.target.value || 1) } : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                />
              </label>

              <label className="text-sm md:col-span-2">
                <div className="mb-1 text-slate-600">Player / Card</div>
                <input
                  value={editingCard.playerCard}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev ? { ...prev, playerCard: e.target.value } : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                />
              </label>

              <label className="text-sm md:col-span-2">
                <div className="mb-1 text-slate-600">Parallel / Details</div>
                <input
                  value={editingCard.details}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev ? { ...prev, details: e.target.value } : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <div className="mb-1 flex items-center gap-2 text-slate-600">
                  <span>Status</span>
                  <Info className="h-3.5 w-3.5 text-slate-400" />
                </div>
                <select
                  value={editingCard.status}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev ? { ...prev, status: e.target.value as StatusType } : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                >
                  {statusOptions.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-slate-500">
                  {statusHelp[editingCard.status]}
                </div>
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-600">Est. Market Value</div>
                <input
                  type="number"
                  value={editingCard.estMarketValue}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev
                        ? { ...prev, estMarketValue: Number(e.target.value || 0) }
                        : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-600">Sales Platform</div>
                <input
                  value={editingCard.salesPlatform}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev ? { ...prev, salesPlatform: e.target.value } : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-600">Listed Price</div>
                <input
                  type="number"
                  value={editingCard.listedPrice}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev
                        ? { ...prev, listedPrice: toNumberOrBlank(e.target.value) }
                        : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-600">Sold Price</div>
                <input
                  type="number"
                  value={editingCard.soldPrice}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev
                        ? { ...prev, soldPrice: toNumberOrBlank(e.target.value) }
                        : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-600">Sale Date</div>
                <input
                  type="date"
                  value={editingCard.saleDate}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev ? { ...prev, saleDate: e.target.value } : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-600">Fees</div>
                <input
                  type="number"
                  value={editingCard.fees}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev ? { ...prev, fees: toNumberOrBlank(e.target.value) } : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-600">Shipping Profile</div>
                <select
                  value={editingCard.shippingProfile}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev ? { ...prev, ...buildCardPatchFromShippingProfile(e.target.value) } : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                >
                  <option value="">Auto / blank</option>
                  {Object.keys(shippingProfiles).map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>

              <div className="md:col-span-2 rounded-2xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">Packaging / supplies cost builder</div>
                    <div className="text-xs text-slate-500">
                      Track penny sleeves, top loaders, mailers, labels, and other packaging per sale.
                    </div>
                  </div>
                  <div className="text-sm text-slate-500">Current packaging total: <span className="font-semibold text-slate-900">{currency(getPackagingCostTotal(editingCard))}</span></div>
                </div>
                <PackagingCostBuilder
                  value={editingCard}
                  onChange={(patch) =>
                    setEditingCard((prev) => (prev ? { ...prev, ...patch } : prev))
                  }
                />
              </div>

              <label className="text-sm">
                <div className="mb-1 text-slate-600">Shipping Cost Override</div>
                <input
                  type="number"
                  value={editingCard.shippingCost}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev
                        ? { ...prev, shippingCost: toNumberOrBlank(e.target.value) }
                        : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-600">Shipping Charged Override</div>
                <input
                  type="number"
                  value={editingCard.shippingCharged}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev
                        ? { ...prev, shippingCharged: toNumberOrBlank(e.target.value) }
                        : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-600">Postage Paid Override</div>
                <input
                  type="number"
                  value={editingCard.postagePaid}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev
                        ? { ...prev, postagePaid: toNumberOrBlank(e.target.value) }
                        : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <div className="mb-1 text-slate-600">Supplies Cost Override</div>
                <input
                  type="number"
                  value={editingCard.suppliesCost}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev
                        ? { ...prev, suppliesCost: toNumberOrBlank(e.target.value) }
                        : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                />
              </label>

              <label className="text-sm md:col-span-2">
                <div className="mb-1 text-slate-600">Notes</div>
                <input
                  value={editingCard.notes}
                  onChange={(e) =>
                    setEditingCard((prev) =>
                      prev ? { ...prev, notes: e.target.value } : prev
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2"
                />
              </label>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <div>
                Recalculated unit cost:{" "}
                <span className="font-semibold text-slate-900">
                  {currency(getUnitCost(cards, breaks, editingCard))}
                </span>
              </div>
              <div className="mt-1">
                Recalculated total cost:{" "}
                <span className="font-semibold text-slate-900">
                  {currency(getTotalCost(cards, breaks, editingCard))}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Save Card
              </button>
              <button
                type="button"
                onClick={() => setEditingCard(null)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>

<Modal
  open={!!csvImportPreview}
  title={
    csvImportPreview
      ? `Review ${csvImportPreview.source.toUpperCase()} CSV: ${csvImportPreview.fileName}`
      : "Review CSV import"
  }
  onClose={() => setCsvImportPreview(null)}
>
  {csvImportPreview && (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KPI label="Rows detected" value={csvImportPreview.rows.length} sub="Usable CSV rows" />
        <KPI
          label="Duplicate source IDs"
          value={csvImportPreview.duplicateRawIds.length}
          sub={csvImportPreview.duplicateRawIds.slice(0, 3).join(", ") || "None found"}
        />
        <KPI
          label="Missing title rows"
          value={csvImportPreview.missingTitleCount}
          sub="Rows with no usable card title"
        />
        <KPI
          label="Skipped rows"
          value={csvImportPreview.suspiciousRowsSkipped}
          sub="Blank or suspicious CSV rows"
        />
      </div>

      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 md:col-span-2">
            <div className="font-medium text-slate-900">Break assignment</div>
            <div className="mt-3 flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                <input type="radio" name="csv-break-mode" checked={csvBreakMode === "new"} onChange={() => setCsvBreakMode("new")} />
                <span>Create new break</span>
              </label>
              <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                <input type="radio" name="csv-break-mode" checked={csvBreakMode === "existing"} onChange={() => setCsvBreakMode("existing")} />
                <span>Use existing break</span>
              </label>
            </div>
            <div className="mt-3 text-xs text-slate-500">
              Default is <strong>Create new break</strong>. The next break ID is generated from the currently loaded workbook/app dataset.
            </div>
          </div>

          {csvBreakMode === "existing" ? (
            <label className="text-sm md:col-span-2">
              <div className="mb-1 text-slate-600">Target Break ID</div>
              <select
                value={csvTargetBreakId}
                onChange={(e) => setCsvTargetBreakId(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2"
              >
                {breaks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} — {b.product}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="text-sm">
                <div className="mb-1 text-slate-600">New Break ID</div>
                <input value={csvNewBreak.id} onChange={(e) => setCsvNewBreak((prev) => ({ ...prev, id: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm">
                <div className="mb-1 text-slate-600">Order #</div>
                <input value={csvNewBreak.orderNo} onChange={(e) => setCsvNewBreak((prev) => ({ ...prev, orderNo: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm">
                <div className="mb-1 text-slate-600">Date</div>
                <input type="date" value={csvNewBreak.date} onChange={(e) => setCsvNewBreak((prev) => ({ ...prev, date: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm">
                <div className="mb-1 text-slate-600">Breaker / Seller</div>
                <input value={csvNewBreak.breaker} onChange={(e) => setCsvNewBreak((prev) => ({ ...prev, breaker: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm md:col-span-2">
                <div className="mb-1 text-slate-600">Product / Batch</div>
                <input value={csvNewBreak.product} onChange={(e) => setCsvNewBreak((prev) => ({ ...prev, product: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm md:col-span-2">
                <div className="mb-1 text-slate-600">Team / Spot</div>
                <input value={csvNewBreak.teamSpot} onChange={(e) => setCsvNewBreak((prev) => ({ ...prev, teamSpot: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm">
                <div className="mb-1 text-slate-600">Platform</div>
                <input value={csvNewBreak.platform} onChange={(e) => setCsvNewBreak((prev) => ({ ...prev, platform: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm">
                <div className="mb-1 text-slate-600">Break Cost</div>
                <input type="number" value={csvNewBreak.breakCost} onChange={(e) => setCsvNewBreak((prev) => ({ ...prev, breakCost: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm">
                <div className="mb-1 text-slate-600">Shipping</div>
                <input type="number" value={csvNewBreak.shipping} onChange={(e) => setCsvNewBreak((prev) => ({ ...prev, shipping: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2" />
              </label>
              <label className="text-sm">
                <div className="mb-1 text-slate-600">Tax</div>
                <input type="number" value={csvNewBreak.tax} onChange={(e) => setCsvNewBreak((prev) => ({ ...prev, tax: e.target.value }))} className="w-full rounded-2xl border border-slate-200 px-3 py-2" />
              </label>
            </>
          )}

          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 md:col-span-2">
            <div className="font-medium text-slate-900">How this import works</div>
            <div className="mt-2">
              CSV imports add rows into <strong>Card Inventory</strong> and attach them to either a new break or an existing break. eBay imports default to purchase-style inventory rows. CollX imports use market value, asking, and sold values when present.
            </div>
          </div>
        </div>

        {(csvImportPreview.duplicateRawIds.length > 0 || csvImportPreview.missingTitleCount > 0) && (
          <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
            Review warnings before confirming. Duplicate source IDs do not block import, but they may mean the CSV contains repeated rows.
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">CSV preview</h3>
          <span className="text-xs text-slate-500">First 12 rows</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="pb-3 pr-4">Source ID</th>
                <th className="pb-3 pr-4">Title</th>
                <th className="pb-3 pr-4">Details</th>
                <th className="pb-3 pr-4">Date</th>
                <th className="pb-3 pr-4">Qty</th>
                <th className="pb-3 pr-4">Purchase</th>
                <th className="pb-3 pr-4">Market</th>
                <th className="pb-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {csvImportPreview.rows.slice(0, 12).map((row, idx) => (
                <tr key={`${row.rawId}-${idx}`} className="border-b border-slate-100 align-top">
                  <td className="py-3 pr-4">{row.rawId || "—"}</td>
                  <td className="py-3 pr-4 font-medium">{row.title}</td>
                  <td className="py-3 pr-4 text-slate-600">{row.details || "—"}</td>
                  <td className="py-3 pr-4">{row.acquiredDate || "—"}</td>
                  <td className="py-3 pr-4">{row.qty}</td>
                  <td className="py-3 pr-4">{currency(row.purchasePrice)}</td>
                  <td className="py-3 pr-4">{currency(row.marketValue)}</td>
                  <td className="py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusStyles[row.status]}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => applyCsvImport(csvImportPreview)}
          className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Confirm CSV Import
        </button>
        <button
          type="button"
          onClick={() => setCsvImportPreview(null)}
          className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )}
</Modal>

    </div>
  );
}