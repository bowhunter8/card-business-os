"use client";

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  Archive,
  BarChart3,
  Camera,
  DollarSign,
  FileSpreadsheet,
  LayoutDashboard,
  Package,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  Truck,
  Upload,
  User,
  Wallet,
  X,
} from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type BreakItem = {
  id: string;
  date: string;
  breaker: string;
  product: string;
  format: string;
  teamOrSpot: string;
  purchasePrice: number;
  salesTax: number;
  shippingToYou: number;
  gradingFees: number;
  otherCost: number;
  notes: string;
};

type InventoryStatus =
  | "Received"
  | "Sorted"
  | "Ready to List"
  | "Listed"
  | "Sold"
  | "Bulk"
  | "Personal"
  | "Grading"
  | "Archived";

type CardItem = {
  id: string;
  breakId: string;
  playerCard: string;
  details: string;
  estimatedMarketValue: number;
  status: InventoryStatus;
  soldPrice: number;
  fees: number;
  shippingCharged: number;
  postagePaid: number;
  suppliesCost: number;
  imageName?: string;
  imageStoragePath?: string;
  imageUrl?: string;

  year: string;
  brand: string;
  setName: string;
  cardNumber: string;
  parallel: string;
  serialNumber: string;
  team: string;

  rookie: boolean;
  autograph: boolean;
  relic: boolean;

  rawCondition: string;
  gradingCompany: string;
  grade: string;
  graderCertNumber: string;

  storageLocation: string;
  askingPrice: number;
  soldPlatform: string;
  saleDate: string;
  orderNumber: string;
  costBasisOverride: number;
  notes: string;
};

type ScanCandidate = {
  id: string;
  title: string;
  playerCard: string;
  details: string;
  estimatedMarketValue: number;
  confidence: string;
  source: string;
  year?: string;
  brand?: string;
  setName?: string;
  cardNumber?: string;
  parallel?: string;
  serialNumber?: string;
  team?: string;
  rookie?: boolean;
  autograph?: boolean;
  relic?: boolean;
  askingPrice?: number;
};


type CompsDebugState = {
  input: unknown;
  stats?: {
    estimatedMarketValue?: number | null;
    suggestedListingPrice?: number | null;
    sampleSize?: number | null;
    confidence?: string | null;
  } | null;
  warnings?: string[];
  sales?: unknown[];
  raw: unknown;
};

type NewCardForm = {
  breakId: string;
  playerCard: string;
  details: string;
  estimatedMarketValue: string;
  status: InventoryStatus;
  soldPrice: string;
  fees: string;
  shippingCharged: string;
  postagePaid: string;
  suppliesCost: string;

  year: string;
  brand: string;
  setName: string;
  cardNumber: string;
  parallel: string;
  serialNumber: string;
  team: string;

  rookie: boolean;
  autograph: boolean;
  relic: boolean;

  rawCondition: string;
  gradingCompany: string;
  grade: string;
  graderCertNumber: string;

  storageLocation: string;
  askingPrice: string;
  soldPlatform: string;
  saleDate: string;
  orderNumber: string;
  costBasisOverride: string;
  notes: string;
};

type CompSearchInput = {
  query: string;
  card: {
    year: string;
    brand: string;
    setName: string;
    playerName: string;
    cardNumber: string;
    parallel: string;
    grade: string;
    rookie: boolean;
  };
};

type SearchCompsResult = {
  ok: boolean;
  warnings?: string[];
  stats: {
    estimatedMarketValue: number | null;
    suggestedListingPrice: number | null;
    sampleSize: number;
    confidence: string;
  };
  displaySales: unknown[];
  raw: unknown;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function buildCompSearchInputFromCard(card: {
  year: string;
  brand: string;
  setName: string;
  playerName: string;
  cardNumber: string;
  parallel: string;
  grade: string;
  rookie: boolean;
}): CompSearchInput {
  const query = [
    card.year,
    card.brand,
    card.setName,
    card.playerName,
    card.cardNumber ? `#${card.cardNumber}` : "",
    card.parallel,
    card.grade,
    card.rookie ? "rookie" : "",
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  return {
    query,
    card,
  };
}

async function searchComps(input: CompSearchInput): Promise<SearchCompsResult> {
  const response = await fetch("/api/comps/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const raw = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(raw?.error || `Comps request failed (${response.status})`);
  }

  const possibleSales = [
    raw?.displaySales,
    raw?.sales,
    raw?.comps,
    raw?.results,
    raw?.data?.displaySales,
    raw?.data?.sales,
    raw?.data?.comps,
    raw?.data?.results,
  ];
  const displaySales = (possibleSales.find(Array.isArray) || []) as unknown[];

  const prices = displaySales
    .map((sale: any) =>
      toFiniteNumber(sale?.price) ??
      toFiniteNumber(sale?.soldPrice) ??
      toFiniteNumber(sale?.sold_price) ??
      toFiniteNumber(sale?.amount) ??
      toFiniteNumber(sale?.value)
    )
    .filter((price): price is number => price != null && price > 0);

  const average = prices.length
    ? prices.reduce((sum, price) => sum + price, 0) / prices.length
    : null;
  const med = median(prices);

  const estimatedMarketValue =
    toFiniteNumber(raw?.stats?.estimatedMarketValue) ??
    toFiniteNumber(raw?.estimatedMarketValue) ??
    toFiniteNumber(raw?.estimated_market_value) ??
    med ??
    average;

  const suggestedListingPrice =
    toFiniteNumber(raw?.stats?.suggestedListingPrice) ??
    toFiniteNumber(raw?.suggestedListingPrice) ??
    toFiniteNumber(raw?.suggested_price) ??
    (estimatedMarketValue != null ? Math.round(estimatedMarketValue * 1.1 * 100) / 100 : null);

  const sampleSize =
    toFiniteNumber(raw?.stats?.sampleSize) ??
    toFiniteNumber(raw?.sampleSize) ??
    prices.length;

  const confidence =
    raw?.stats?.confidence ??
    raw?.confidence ??
    (sampleSize >= 5 ? "high" : sampleSize >= 3 ? "medium" : sampleSize >= 1 ? "low" : "none");

  const warnings = Array.isArray(raw?.warnings)
    ? raw.warnings.filter(Boolean)
    : prices.length === 0
      ? ["No usable priced comps were returned."]
      : [];

  return {
    ok: Boolean(raw?.ok ?? true),
    warnings,
    stats: {
      estimatedMarketValue,
      suggestedListingPrice,
      sampleSize: Number(sampleSize || 0),
      confidence,
    },
    displaySales,
    raw,
  };
}

type ParsedScanResult = {
  playerCard: string;
  details: string;
  estimatedMarketValue: string;
  year: string;
  brand: string;
  setName: string;
  cardNumber: string;
  parallel: string;
  serialNumber: string;
  team: string;
  rookie: boolean;
  autograph: boolean;
  relic: boolean;
  askingPrice: string;
  confidence: string;
  summaryBits: string[];
  strongPlayerMatch: boolean;
};

const INVENTORY_STATUS_OPTIONS: InventoryStatus[] = [
  "Received",
  "Sorted",
  "Ready to List",
  "Listed",
  "Sold",
  "Bulk",
  "Personal",
  "Grading",
  "Archived",
];

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(asNumber(value));
}

function pct(value: unknown) {
  return `${(asNumber(value) * 100).toFixed(1)}%`;
}

function calcBreakLandedCost(item: BreakItem) {
  return (
    asNumber(item.purchasePrice) +
    asNumber(item.salesTax) +
    asNumber(item.shippingToYou) +
    asNumber(item.gradingFees) +
    asNumber(item.otherCost)
  );
}

function addUniqueWords(base: string, additions: string[]) {
  const existing = base
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  const seen = new Set(existing.map((word) => word.toLowerCase()));
  const next = [...existing];

  additions.forEach((word) => {
    const normalized = word.toLowerCase();
    if (!seen.has(normalized)) {
      next.push(word);
      seen.add(normalized);
    }
  });

  return next.join(" ").trim();
}

function normalizeLegacyStatus(value: string | null | undefined): InventoryStatus {
  const status = (value || "").trim();

  if (status === "Holding") return "Received";
  if (status === "Bulked") return "Bulk";
  if (status === "Listed") return "Listed";
  if (status === "Sold") return "Sold";
  if (status === "Personal") return "Personal";

  if (INVENTORY_STATUS_OPTIONS.includes(status as InventoryStatus)) {
    return status as InventoryStatus;
  }

  return "Received";
}

function emptyCardForm(defaultBreakId: string): NewCardForm {
  return {
    breakId: defaultBreakId,
    playerCard: "",
    details: "",
    estimatedMarketValue: "",
    status: "Received",
    soldPrice: "",
    fees: "",
    shippingCharged: "",
    postagePaid: "",
    suppliesCost: "",

    year: "",
    brand: "",
    setName: "",
    cardNumber: "",
    parallel: "",
    serialNumber: "",
    team: "",

    rookie: false,
    autograph: false,
    relic: false,

    rawCondition: "",
    gradingCompany: "",
    grade: "",
    graderCertNumber: "",

    storageLocation: "",
    askingPrice: "",
    soldPlatform: "",
    saleDate: "",
    orderNumber: "",
    costBasisOverride: "",
    notes: "",
  };
}

function cleanScanText(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSuggestedAskPrice(marketValue: number) {
  if (!Number.isFinite(marketValue) || marketValue <= 0) return 0;
  if (marketValue < 2) return Number((marketValue + 0.49).toFixed(2));
  if (marketValue < 5) return Number((marketValue + 0.99).toFixed(2));
  if (marketValue < 20) return Number((marketValue * 1.12).toFixed(2));
  return Number((marketValue * 1.08).toFixed(2));
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function includesWord(text: string, word: string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function detectBrand(text: string) {
  const lower = text.toLowerCase();

  if (lower.includes("topps chrome")) return "Topps Chrome";
  if (lower.includes("topps finest")) return "Topps Finest";
  if (lower.includes("topps inception")) return "Topps Inception";
  if (lower.includes("topps heritage")) return "Topps Heritage";
  if (lower.includes("topps")) return "Topps";
  if (lower.includes("bowman chrome")) return "Bowman Chrome";
  if (lower.includes("bowman sterling")) return "Bowman Sterling";
  if (lower.includes("bowman")) return "Bowman";
  if (lower.includes("panini prizm")) return "Panini Prizm";
  if (lower.includes("panini select")) return "Panini Select";
  if (lower.includes("donruss optic")) return "Donruss Optic";
  if (lower.includes("optic")) return "Donruss Optic";
  if (lower.includes("donruss")) return "Donruss";
  if (lower.includes("leaf")) return "Leaf";

  return "";
}

function detectSetName(text: string) {
  const lower = text.toLowerCase();

  const setCandidates = [
    "Chrome",
    "Heritage",
    "Bowman Chrome",
    "Finest",
    "Inception",
    "Museum Collection",
    "Allen & Ginter",
    "Stadium Club",
    "Archives",
    "Update",
    "Series 1",
    "Series 2",
    "Cosmic Chrome",
    "Prizm",
    "Select",
    "Optic",
    "Sterling",
  ];

  for (const candidate of setCandidates) {
    if (lower.includes(candidate.toLowerCase())) return candidate;
  }

  return "";
}

function detectParallel(text: string) {
  const lower = text.toLowerCase();

  const parallels = [
    "Superfractor",
    "Gold Refractor",
    "Orange Refractor",
    "Blue Refractor",
    "Green Refractor",
    "Red Refractor",
    "Purple Refractor",
    "Wave Refractor",
    "X-Fractor",
    "Refractor",
    "Mojo",
    "Lava",
    "Atomic",
    "Rainbow Foil",
    "Cracked Ice",
    "Gold",
    "Orange",
    "Blue",
    "Green",
    "Red",
    "Purple",
    "Black",
    "Pink",
    "Sepia",
    "Silver",
    "Holo",
  ];

  for (const candidate of parallels) {
    if (lower.includes(candidate.toLowerCase())) return candidate;
  }

  return "";
}

function detectTeam(text: string) {
  const lower = text.toLowerCase();

  const teams: Record<string, string> = {
    pirates: "Pittsburgh Pirates",
    yankees: "New York Yankees",
    dodgers: "Los Angeles Dodgers",
    mariners: "Seattle Mariners",
    angels: "Los Angeles Angels",
    mets: "New York Mets",
    cubs: "Chicago Cubs",
    "red sox": "Boston Red Sox",
    redsox: "Boston Red Sox",
    orioles: "Baltimore Orioles",
    royals: "Kansas City Royals",
    reds: "Cincinnati Reds",
    padres: "San Diego Padres",
    phillies: "Philadelphia Phillies",
    braves: "Atlanta Braves",
    astros: "Houston Astros",
    tigers: "Detroit Tigers",
    giants: "San Francisco Giants",
    athletics: "Athletics",
  };

  for (const [key, value] of Object.entries(teams)) {
    if (lower.includes(key)) return value;
  }

  return "";
}

function detectPlayer(text: string) {
  const normalized = text.toLowerCase();

  const players: Array<{ patterns: string[]; value: string; strong: string[] }> = [
    { patterns: ["paul skenes", "skenes"], value: "Paul Skenes", strong: ["paul skenes"] },
    { patterns: ["shohei ohtani", "ohtani"], value: "Shohei Ohtani", strong: ["shohei ohtani"] },
    { patterns: ["aaron judge", "judge"], value: "Aaron Judge", strong: ["aaron judge"] },
    {
      patterns: ["ken griffey jr", "ken griffey jr.", "griffey"],
      value: "Ken Griffey Jr.",
      strong: ["ken griffey jr", "ken griffey jr."],
    },
    { patterns: ["cal raleigh", "raleigh"], value: "Cal Raleigh", strong: ["cal raleigh"] },
    { patterns: ["elian pena", "pena"], value: "Elian Pena", strong: ["elian pena"] },
    { patterns: ["bobby witt jr", "bobby witt jr."], value: "Bobby Witt Jr.", strong: ["bobby witt jr"] },
    { patterns: ["jackson holliday"], value: "Jackson Holliday", strong: ["jackson holliday"] },
    { patterns: ["elly de la cruz"], value: "Elly De La Cruz", strong: ["elly de la cruz"] },
    { patterns: ["wyatt langford"], value: "Wyatt Langford", strong: ["wyatt langford"] },
    { patterns: ["dylan crews"], value: "Dylan Crews", strong: ["dylan crews"] },
    { patterns: ["mike trout", "trout"], value: "Mike Trout", strong: ["mike trout"] },
    { patterns: ["mookie betts"], value: "Mookie Betts", strong: ["mookie betts"] },
    { patterns: ["juan soto"], value: "Juan Soto", strong: ["juan soto"] },
    { patterns: ["julio rodriguez"], value: "Julio Rodriguez", strong: ["julio rodriguez"] },
  ];

  for (const player of players) {
    for (const strongPattern of player.strong) {
      if (includesWord(normalized, strongPattern)) {
        return { playerCard: player.value, strongPlayerMatch: true };
      }
    }
  }

  for (const player of players) {
    for (const pattern of player.patterns) {
      if (includesWord(normalized, pattern)) {
        return { playerCard: player.value, strongPlayerMatch: false };
      }
    }
  }

  return { playerCard: "", strongPlayerMatch: false };
}

function parseScanText(rawText: string): ParsedScanResult {
  const text = cleanScanText(rawText);
  const lower = text.toLowerCase();

  const year = firstMatch(lower, [/\b(19\d{2}|20\d{2})\b/]);
  const brand = detectBrand(text);
  const setName = detectSetName(text);
  const playerDetection = detectPlayer(text);
  const parallel = detectParallel(text);
  const serialNumber = firstMatch(text, [
    /\b(\d{1,3}\/\d{1,3})\b/,
    /\b(?:serial|sn)\s*#?\s*(\d{1,3}\/\d{1,3})\b/i,
  ]);

  const cardNumber = firstMatch(text, [
    /\b(?:card|#)\s*([A-Z]{0,4}\d{1,4})\b/i,
    /\bno\.?\s*([A-Z]{0,4}\d{1,4})\b/i,
  ]);

  const rookie = /\b(rc|rookie)\b/i.test(text);
  const autograph = /\b(auto|autograph)\b/i.test(text);
  const relic = /\b(relic|patch|jersey)\b/i.test(text);
  const team = detectTeam(text);

  let estimatedMarketValue = "";
  let confidence = "Low";

  if (
    playerDetection.playerCard === "Paul Skenes" &&
    autograph &&
    parallel &&
    serialNumber.endsWith("/50") &&
    playerDetection.strongPlayerMatch
  ) {
    estimatedMarketValue = "50";
    confidence = "High";
  } else if (playerDetection.playerCard) {
    if (autograph) {
      estimatedMarketValue = playerDetection.strongPlayerMatch ? "20" : "12";
      confidence = playerDetection.strongPlayerMatch ? "Medium" : "Low";
    } else if (parallel || rookie || serialNumber) {
      estimatedMarketValue = playerDetection.strongPlayerMatch ? "8" : "5";
      confidence = playerDetection.strongPlayerMatch ? "Medium" : "Low";
    } else {
      estimatedMarketValue = playerDetection.strongPlayerMatch ? "3" : "";
      confidence = playerDetection.strongPlayerMatch ? "Low" : "Low";
    }
  } else if (brand || setName || cardNumber || serialNumber || parallel) {
    estimatedMarketValue = "";
    confidence = "Low";
  }

  const askingPrice = estimatedMarketValue
    ? String(getSuggestedAskPrice(asNumber(estimatedMarketValue)))
    : "";

  const summaryBits = [
    year,
    brand,
    setName,
    playerDetection.playerCard,
    cardNumber ? `#${cardNumber}` : "",
    parallel,
    serialNumber ? `SN ${serialNumber}` : "",
    rookie ? "RC" : "",
    autograph ? "Auto" : "",
    relic ? "Relic" : "",
    team,
  ].filter(Boolean);

  const details = [brand, setName, parallel, serialNumber, rookie ? "RC" : "", autograph ? "Auto" : "", relic ? "Relic" : ""]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    playerCard: playerDetection.playerCard,
    details,
    estimatedMarketValue,
    year,
    brand,
    setName,
    cardNumber,
    parallel,
    serialNumber,
    team,
    rookie,
    autograph,
    relic,
    askingPrice,
    confidence,
    summaryBits,
    strongPlayerMatch: playerDetection.strongPlayerMatch,
  };
}

function buildCandidatesFromParsed(parsed: ParsedScanResult, seedText: string): ScanCandidate[] {
  const candidates: ScanCandidate[] = [];

  const genericTitle =
    [
      parsed.year,
      parsed.brand,
      parsed.setName,
      parsed.playerCard,
      parsed.cardNumber ? `#${parsed.cardNumber}` : "",
      parsed.parallel,
      parsed.serialNumber || "",
    ]
      .filter(Boolean)
      .join(" ") || seedText;

  candidates.push({
    id: "cand-generic-first",
    title: genericTitle,
    playerCard: parsed.playerCard,
    details: parsed.details || seedText,
    estimatedMarketValue: asNumber(parsed.estimatedMarketValue),
    confidence: parsed.confidence,
    source: "Parsed from your text/image name",
    year: parsed.year,
    brand: parsed.brand,
    setName: parsed.setName,
    cardNumber: parsed.cardNumber,
    parallel: parsed.parallel,
    serialNumber: parsed.serialNumber,
    team: parsed.team,
    rookie: parsed.rookie,
    autograph: parsed.autograph,
    relic: parsed.relic,
    askingPrice: asNumber(parsed.askingPrice),
  });

  if (!parsed.strongPlayerMatch) {
    return candidates;
  }

  if (parsed.playerCard === "Paul Skenes") {
    candidates.push({
      id: "cand-skenes",
      title: `${parsed.year || "2026"} ${parsed.brand || "Topps"} ${parsed.playerCard} ${
        parsed.parallel || ""
      } ${parsed.autograph ? "Auto" : ""} ${parsed.serialNumber || ""}`.replace(/\s+/g, " ").trim(),
      playerCard: "Paul Skenes",
      details: parsed.details || "Topps card",
      estimatedMarketValue: asNumber(parsed.estimatedMarketValue) || 20,
      confidence: parsed.confidence,
      source: "Strong text match",
      year: parsed.year || "2026",
      brand: parsed.brand || "Topps",
      setName: parsed.setName || "",
      cardNumber: parsed.cardNumber || "",
      parallel: parsed.parallel || "",
      serialNumber: parsed.serialNumber || "",
      team: parsed.team || "Pittsburgh Pirates",
      rookie: parsed.rookie,
      autograph: parsed.autograph,
      relic: parsed.relic,
      askingPrice: asNumber(parsed.askingPrice) || getSuggestedAskPrice(asNumber(parsed.estimatedMarketValue) || 20),
    });
  }

  if (parsed.playerCard === "Shohei Ohtani") {
    candidates.push({
      id: "cand-ohtani",
      title: `${parsed.year || "2026"} ${parsed.brand || "Topps"} ${parsed.playerCard} ${parsed.parallel || ""}`.replace(/\s+/g, " ").trim(),
      playerCard: "Shohei Ohtani",
      details: parsed.details || "Topps card",
      estimatedMarketValue: asNumber(parsed.estimatedMarketValue) || 20,
      confidence: parsed.confidence,
      source: "Strong text match",
      year: parsed.year || "2026",
      brand: parsed.brand || "Topps",
      setName: parsed.setName || "",
      cardNumber: parsed.cardNumber || "",
      parallel: parsed.parallel || "",
      serialNumber: parsed.serialNumber || "",
      team: parsed.team || "Los Angeles Dodgers",
      rookie: false,
      autograph: parsed.autograph,
      relic: parsed.relic,
      askingPrice: asNumber(parsed.askingPrice) || getSuggestedAskPrice(asNumber(parsed.estimatedMarketValue) || 20),
    });
  }

  if (parsed.playerCard === "Aaron Judge") {
    candidates.push({
      id: "cand-judge",
      title: `${parsed.year || "2026"} ${parsed.brand || "Bowman"} ${parsed.playerCard} ${parsed.parallel || ""}`.replace(/\s+/g, " ").trim(),
      playerCard: "Aaron Judge",
      details: parsed.details || "Card",
      estimatedMarketValue: asNumber(parsed.estimatedMarketValue) || 8,
      confidence: parsed.confidence,
      source: "Strong text match",
      year: parsed.year || "2026",
      brand: parsed.brand || "Bowman",
      setName: parsed.setName || "",
      cardNumber: parsed.cardNumber || "",
      parallel: parsed.parallel || "",
      serialNumber: parsed.serialNumber || "",
      team: parsed.team || "New York Yankees",
      rookie: false,
      autograph: parsed.autograph,
      relic: parsed.relic,
      askingPrice: asNumber(parsed.askingPrice) || getSuggestedAskPrice(asNumber(parsed.estimatedMarketValue) || 8),
    });
  }

  if (parsed.playerCard === "Ken Griffey Jr.") {
    candidates.push({
      id: "cand-griffey",
      title: `${parsed.brand || "Topps"} ${parsed.playerCard} ${parsed.autograph ? "Auto" : ""}`.replace(/\s+/g, " ").trim(),
      playerCard: "Ken Griffey Jr.",
      details: parsed.details || "Card",
      estimatedMarketValue: asNumber(parsed.estimatedMarketValue) || 12,
      confidence: parsed.confidence,
      source: "Strong text match",
      year: parsed.year || "",
      brand: parsed.brand || "Topps",
      setName: parsed.setName || "",
      cardNumber: parsed.cardNumber || "",
      parallel: parsed.parallel || "",
      serialNumber: parsed.serialNumber || "",
      team: parsed.team || "Seattle Mariners",
      rookie: false,
      autograph: parsed.autograph,
      relic: parsed.relic,
      askingPrice: asNumber(parsed.askingPrice) || getSuggestedAskPrice(asNumber(parsed.estimatedMarketValue) || 12),
    });
  }

  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      const key = [
        candidate.playerCard,
        candidate.details,
        candidate.brand,
        candidate.parallel,
        candidate.serialNumber,
        candidate.cardNumber,
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
          <div className="mt-1 text-sm text-slate-500">{sub}</div>
        </div>
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function ShellCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          {right}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="md:col-span-2 xl:col-span-3">
      <div className="mb-1 text-sm font-semibold text-slate-900">{title}</div>
      {subtitle ? <div className="text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function CheckboxField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-2xl border border-slate-300 px-3 py-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      <span>{label}</span>
    </label>
  );
}

export default function Page() {
  const supabase = createClientComponentClient();
  const CARD_IMAGE_BUCKET = "card-images";

  const [mounted, setMounted] = useState(false);
  const [activeView, setActiveView] = useState("dashboard");

  const [breaks, setBreaks] = useState<BreakItem[]>([]);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);

  const [showBreakForm, setShowBreakForm] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string>("");

  const [scannerFile, setScannerFile] = useState<File | null>(null);
  const [scannerImageName, setScannerImageName] = useState("");
  const [scannerPreview, setScannerPreview] = useState("");
  const [scannerNotes, setScannerNotes] = useState("");
  const [scanConfidence, setScanConfidence] = useState("");
  const [scanMode, setScanMode] = useState<"upload" | "camera">("upload");
  const [scanCandidates, setScanCandidates] = useState<ScanCandidate[]>([]);
  const [scanStatusMessage, setScanStatusMessage] = useState("");
  const [compsDebug, setCompsDebug] = useState<CompsDebugState | null>(null);

  const [newBreak, setNewBreak] = useState({
    date: "2026-03-25",
    breaker: "",
    product: "",
    format: "PYT",
    teamOrSpot: "",
    purchasePrice: "",
    salesTax: "",
    shippingToYou: "",
    gradingFees: "",
    otherCost: "",
    notes: "",
  });

  const [newCard, setNewCard] = useState<NewCardForm>(emptyCardForm(""));

  async function removeCardImage(storagePath?: string | null) {
    if (!storagePath) return;

    const { error } = await supabase.storage.from(CARD_IMAGE_BUCKET).remove([storagePath]);

    if (error) {
      console.log("Storage delete warning:", error.message);
    }
  }

  async function loadCards() {
    setCardsLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log("No logged in user for cards");
      setCards([]);
      setCardsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("cards")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.log("Load cards error:", error.message);
      setCardsLoading(false);
      return;
    }

    const mappedCards: CardItem[] =
      data?.map((item) => {
        let imageUrl: string | undefined;

        if (item.image_path) {
          const { data: publicUrlData } = supabase.storage
            .from(CARD_IMAGE_BUCKET)
            .getPublicUrl(item.image_path);

          imageUrl = publicUrlData?.publicUrl || undefined;
        }

        return {
          id: item.id,
          breakId: item.break_id || "",
          playerCard: item.player_card || "",
          details: item.details || "",
          estimatedMarketValue: asNumber(item.estimated_market_value),
          status: normalizeLegacyStatus(item.status),
          soldPrice: asNumber(item.sold_price),
          fees: asNumber(item.fees),
          shippingCharged: asNumber(item.shipping_charged),
          postagePaid: asNumber(item.postage_paid),
          suppliesCost: asNumber(item.supplies_cost),
          imageName: item.image_name || undefined,
          imageStoragePath: item.image_path || undefined,
          imageUrl,

          year: item.year || "",
          brand: item.brand || "",
          setName: item.set_name || "",
          cardNumber: item.card_number || "",
          parallel: item.parallel || "",
          serialNumber: item.serial_number || "",
          team: item.team || "",

          rookie: Boolean(item.rookie),
          autograph: Boolean(item.autograph),
          relic: Boolean(item.relic),

          rawCondition: item.raw_condition || "",
          gradingCompany: item.grading_company || "",
          grade: item.grade || "",
          graderCertNumber: item.grader_cert_number || "",

          storageLocation: item.storage_location || "",
          askingPrice: asNumber(item.asking_price),
          soldPlatform: item.sold_platform || "",
          saleDate: item.sale_date || "",
          orderNumber: item.order_number || "",
          costBasisOverride: asNumber(item.cost_basis_override),
          notes: item.notes || "",
        };
      }) || [];

    setCards(mappedCards);
    setCardsLoading(false);
  }

  async function loadBreaks() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log("No logged in user for breaks");
      return;
    }

    const { data, error } = await supabase
      .from("breaks")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: true });

    if (error) {
      console.log("Load breaks error:", error.message);
      return;
    }

    const mappedBreaks: BreakItem[] =
      data?.map((item) => ({
        id: item.id,
        date: item.date,
        breaker: item.breaker,
        product: item.product,
        format: item.format || "",
        teamOrSpot: item.team_or_spot || "",
        purchasePrice: asNumber(item.purchase_price),
        salesTax: asNumber(item.sales_tax),
        shippingToYou: asNumber(item.shipping_to_you),
        gradingFees: asNumber(item.grading_fees),
        otherCost: asNumber(item.other_cost),
        notes: item.notes || "",
      })) || [];

    setBreaks(mappedBreaks);
    setNewCard((prev) => ({
      ...prev,
      breakId: prev.breakId || mappedBreaks[0]?.id || "",
    }));
  }

  useEffect(() => {
    const savedView = window.localStorage.getItem("card-app-active-view");
    if (savedView) {
      setActiveView(savedView);
    }

    setMounted(true);

    async function init() {
      await loadBreaks();
      await loadCards();
    }

    init();
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem("card-app-active-view", activeView);
  }, [activeView, mounted]);

  useEffect(() => {
    return () => {
      if (scannerPreview && scannerPreview.startsWith("blob:")) {
        URL.revokeObjectURL(scannerPreview);
      }
    };
  }, [scannerPreview]);

  const nav = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "breaks", label: "Breaks", icon: Package },
    { id: "inventory", label: "Card Inventory", icon: Archive },
    { id: "shipping", label: "Shipping", icon: Truck },
    { id: "roi", label: "Break ROI", icon: BarChart3 },
  ];

  const data = useMemo(() => {
    const cardsByBreak = breaks.reduce<Record<string, CardItem[]>>((acc, currentBreak) => {
      acc[currentBreak.id] = cards.filter((card) => card.breakId === currentBreak.id);
      return acc;
    }, {});

    const perBreak: Record<
      string,
      { landedCost: number; totalMarketValue: number; perCardCostMap: Record<string, number> }
    > = {};

    breaks.forEach((currentBreak) => {
      const breakCards = cardsByBreak[currentBreak.id] || [];
      const landedCost = calcBreakLandedCost(currentBreak);
      const totalMarketValue = breakCards.reduce(
        (sum, card) => sum + asNumber(card.estimatedMarketValue),
        0
      );
      const equalSplitCost = breakCards.length > 0 ? landedCost / breakCards.length : 0;

      perBreak[currentBreak.id] = {
        landedCost,
        totalMarketValue,
        perCardCostMap: {},
      };

      breakCards.forEach((card) => {
        const override = asNumber(card.costBasisOverride);
        const unitCost =
          override > 0
            ? override
            : totalMarketValue > 0
            ? landedCost * (asNumber(card.estimatedMarketValue) / totalMarketValue)
            : equalSplitCost;

        perBreak[currentBreak.id].perCardCostMap[card.id] = unitCost;
      });
    });

    const enrichedCards = cards.map((card) => {
      const breakData = perBreak[card.breakId] || {
        landedCost: 0,
        totalMarketValue: 0,
        perCardCostMap: {},
      };

      const unitCost = breakData.perCardCostMap[card.id] || 0;
      const totalShippingCost = asNumber(card.postagePaid) + asNumber(card.suppliesCost);
      const shippingProfit = asNumber(card.shippingCharged) - totalShippingCost;
      const netProceeds =
        asNumber(card.soldPrice) +
        asNumber(card.shippingCharged) -
        asNumber(card.fees) -
        totalShippingCost;
      const realizedProfit = card.status === "Sold" ? netProceeds - unitCost : 0;

      return {
        ...card,
        unitCost,
        totalShippingCost,
        shippingProfit,
        netProceeds,
        realizedProfit,
      };
    });

    const soldCards = enrichedCards.filter((card) => card.status === "Sold");
    const openCards = enrichedCards.filter(
      (card) => !["Sold", "Personal", "Archived"].includes(card.status)
    );
    const listedCards = enrichedCards.filter((card) => card.status === "Listed");
    const personalCards = enrichedCards.filter((card) => card.status === "Personal");

    const totals = {
      totalInvested: breaks.reduce((sum, item) => sum + calcBreakLandedCost(item), 0),
      netProceeds: soldCards.reduce((sum, card) => sum + card.netProceeds, 0),
      realizedProfit: soldCards.reduce((sum, card) => sum + card.realizedProfit, 0),
      shippingProfit: soldCards.reduce((sum, card) => sum + card.shippingProfit, 0),
      inventoryOnHandCost: openCards.reduce((sum, card) => sum + card.unitCost, 0),
      personalCostBasis: personalCards.reduce((sum, card) => sum + card.unitCost, 0),
      listedAskValue: listedCards.reduce((sum, card) => sum + asNumber(card.askingPrice), 0),
      breaks: breaks.length,
      soldCount: soldCards.length,
      openCount: openCards.length,
      personalCount: personalCards.length,
      listedCount: listedCards.length,
    };

    const breakRows = breaks.map((breakItem) => {
      const breakCards = enrichedCards.filter((card) => card.breakId === breakItem.id);
      const invested = calcBreakLandedCost(breakItem);
      const soldBreakCards = breakCards.filter((card) => card.status === "Sold");
      const openBreakCards = breakCards.filter(
        (card) => !["Sold", "Personal", "Archived"].includes(card.status)
      );

      const grossSales = soldBreakCards.reduce((sum, card) => sum + asNumber(card.soldPrice), 0);
      const netProceeds = soldBreakCards.reduce((sum, card) => sum + card.netProceeds, 0);
      const realizedProfit = soldBreakCards.reduce((sum, card) => sum + card.realizedProfit, 0);
      const inventoryOnHand = openBreakCards.reduce((sum, card) => sum + card.unitCost, 0);
      const unsoldEstMv = openBreakCards.reduce(
        (sum, card) => sum + asNumber(card.estimatedMarketValue),
        0
      );
      const economicProfit = realizedProfit + (unsoldEstMv - inventoryOnHand);
      const economicRoiPct = invested > 0 ? economicProfit / invested : 0;

      return {
        ...breakItem,
        invested,
        grossSales,
        netProceeds,
        realizedProfit,
        inventoryOnHand,
        unsoldEstMv,
        economicRoiPct,
      };
    });

    const shippingRows = [
      {
        profile: "eBay PWE <= $4.99",
        rows: enrichedCards.filter(
          (card) => asNumber(card.shippingCharged) > 0 && asNumber(card.shippingCharged) < 5
        ),
      },
      {
        profile: "BMWT / $5+",
        rows: enrichedCards.filter((card) => asNumber(card.shippingCharged) >= 5),
      },
      {
        profile: "Local / No Ship",
        rows: enrichedCards.filter((card) => asNumber(card.shippingCharged) === 0),
      },
    ].map((group) => ({
      profile: group.profile,
      orders: group.rows.length,
      charged: group.rows.reduce((sum, row) => sum + asNumber(row.shippingCharged), 0),
      postage: group.rows.reduce((sum, row) => sum + asNumber(row.postagePaid), 0),
      supplies: group.rows.reduce((sum, row) => sum + asNumber(row.suppliesCost), 0),
      profit: group.rows.reduce((sum, row) => sum + row.shippingProfit, 0),
    }));

    return { totals, enrichedCards, breakRows, shippingRows };
  }, [breaks, cards]);

  function resetScanner() {
    if (scannerPreview && scannerPreview.startsWith("blob:")) {
      URL.revokeObjectURL(scannerPreview);
    }
    setScannerFile(null);
    setScannerImageName("");
    setScannerPreview("");
    setScannerNotes("");
    setScanConfidence("");
    setScanCandidates([]);
    setScanStatusMessage("");
  }

  function resetCardForm() {
    setNewCard(emptyCardForm(breaks[0]?.id || ""));
    setEditingCardId("");
    resetScanner();
  }

  function openNewCardForm() {
    if (!breaks.length) {
      alert("Add a break first before creating cards.");
      return;
    }
    resetCardForm();
    setShowCardForm(true);
  }

  async function addBreak() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert("You must be signed in to save breaks.");
      return;
    }

    const payload = {
      user_id: user.id,
      date: newBreak.date,
      breaker: newBreak.breaker.trim(),
      product: newBreak.product.trim(),
      format: newBreak.format.trim(),
      team_or_spot: newBreak.teamOrSpot.trim(),
      purchase_price: asNumber(newBreak.purchasePrice),
      sales_tax: asNumber(newBreak.salesTax),
      shipping_to_you: asNumber(newBreak.shippingToYou),
      grading_fees: asNumber(newBreak.gradingFees),
      other_cost: asNumber(newBreak.otherCost),
      notes: newBreak.notes.trim(),
    };

    const { error } = await supabase.from("breaks").insert(payload);

    if (error) {
      alert(error.message);
      return;
    }

    setNewBreak({
      date: "2026-03-25",
      breaker: "",
      product: "",
      format: "PYT",
      teamOrSpot: "",
      purchasePrice: "",
      salesTax: "",
      shippingToYou: "",
      gradingFees: "",
      otherCost: "",
      notes: "",
    });

    setShowBreakForm(false);
    await loadBreaks();
  }

  async function deleteBreak(id: string) {
    const { error } = await supabase.from("breaks").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadBreaks();
    await loadCards();
  }

  async function uploadCardImage(userId: string, breakId: string) {
    if (!scannerFile) {
      return {
        imagePath: null as string | null,
        imageName: scannerImageName.trim() || null,
      };
    }

    const extension = scannerFile.name.split(".").pop() || "jpg";
    const filePath = `${userId}/${breakId}/${crypto.randomUUID()}.${extension}`;

    const { error } = await supabase.storage
      .from(CARD_IMAGE_BUCKET)
      .upload(filePath, scannerFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: scannerFile.type || undefined,
      });

    if (error) {
      throw new Error(error.message);
    }

    return {
      imagePath: filePath,
      imageName: scannerFile.name,
    };
  }

  async function saveCard() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert("You must be signed in to save cards.");
      return;
    }

    const chosenBreakId = newCard.breakId || breaks[0]?.id || "";

    if (!chosenBreakId) {
      alert("Please create or select a break before saving a card.");
      return;
    }

    if (!newCard.playerCard.trim()) {
      alert("Please enter at least a player / card name.");
      return;
    }

    const soldPrice = asNumber(newCard.soldPrice);
    const askPrice = asNumber(newCard.askingPrice);
    const fees = asNumber(newCard.fees);
    const shippingCharged = asNumber(newCard.shippingCharged);
    const postagePaid = asNumber(newCard.postagePaid);
    const suppliesCost = asNumber(newCard.suppliesCost);

    let finalStatus = newCard.status;

    if (soldPrice > 0) {
      finalStatus = "Sold";
    } else if (newCard.status === "Personal") {
      finalStatus = "Personal";
    } else if (newCard.grade.trim() || newCard.gradingCompany.trim()) {
      finalStatus = "Grading";
    } else if (askPrice > 0) {
      finalStatus = "Listed";
    }

    if (newCard.status === "Sold" && soldPrice <= 0) {
      alert("Cannot mark as Sold without a sold price.");
      return;
    }

    if (newCard.status === "Listed" && askPrice <= 0) {
      alert("Cannot mark as Listed without an asking price.");
      return;
    }

    if (finalStatus === "Sold" && soldPrice <= 0) {
      alert("Sold cards must have a sold price.");
      return;
    }

    let saleDate = newCard.saleDate;
    if (finalStatus === "Sold" && !saleDate) {
      saleDate = new Date().toISOString().split("T")[0];
    }

    if (finalStatus === "Sold" && fees <= 0) {
      const proceed = window.confirm("This card is marked Sold but fees are still 0. Save anyway?");
      if (!proceed) return;
    }

    if (finalStatus === "Sold" && shippingCharged <= 0 && postagePaid <= 0 && suppliesCost <= 0) {
      const proceed = window.confirm(
        "This card is marked Sold but shipping fields are blank/0. Save anyway?"
      );
      if (!proceed) return;
    }

    try {
      const existingCard = editingCardId ? cards.find((c) => c.id === editingCardId) : null;

      let imageStoragePathToSave: string | null = existingCard?.imageStoragePath || null;
      let imageNameToSave: string | null = existingCard?.imageName || null;

      if (scannerImageName.trim()) {
        imageNameToSave = scannerImageName.trim();
      }

      if (scannerFile) {
        const uploaded = await uploadCardImage(user.id, chosenBreakId);
        imageStoragePathToSave = uploaded.imagePath;
        imageNameToSave = uploaded.imageName;

        if (
          existingCard?.imageStoragePath &&
          existingCard.imageStoragePath !== uploaded.imagePath
        ) {
          await removeCardImage(existingCard.imageStoragePath);
        }
      }

      const payload = {
        user_id: user.id,
        break_id: chosenBreakId,
        player_card: newCard.playerCard.trim(),
        details: newCard.details.trim(),
        estimated_market_value: asNumber(newCard.estimatedMarketValue),
        status: finalStatus,
        sold_price: soldPrice,
        fees,
        shipping_charged: shippingCharged,
        postage_paid: postagePaid,
        supplies_cost: suppliesCost,
        image_path: imageStoragePathToSave,
        image_name: imageNameToSave,

        year: newCard.year.trim(),
        brand: newCard.brand.trim(),
        set_name: newCard.setName.trim(),
        card_number: newCard.cardNumber.trim(),
        parallel: newCard.parallel.trim(),
        serial_number: newCard.serialNumber.trim(),
        team: newCard.team.trim(),

        rookie: newCard.rookie,
        autograph: newCard.autograph,
        relic: newCard.relic,

        raw_condition: newCard.rawCondition.trim(),
        grading_company: newCard.gradingCompany.trim(),
        grade: newCard.grade.trim(),
        grader_cert_number: newCard.graderCertNumber.trim(),

        storage_location: newCard.storageLocation.trim(),
        asking_price: askPrice,
        sold_platform: newCard.soldPlatform.trim(),
        sale_date: saleDate || null,
        order_number: newCard.orderNumber.trim(),
        cost_basis_override: asNumber(newCard.costBasisOverride),
        notes: newCard.notes.trim(),
      };

      if (editingCardId) {
        const { error } = await supabase
          .from("cards")
          .update(payload)
          .eq("id", editingCardId)
          .eq("user_id", user.id);

        if (error) {
          alert(error.message);
          return;
        }
      } else {
        const { error } = await supabase.from("cards").insert(payload);

        if (error) {
          alert(error.message);
          return;
        }
      }

      await loadCards();
      setShowCardForm(false);
      resetCardForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image upload failed.";
      alert(message);
    }
  }

  function editCard(card: CardItem) {
    setEditingCardId(card.id);
    setNewCard({
      breakId: card.breakId,
      playerCard: card.playerCard,
      details: card.details,
      estimatedMarketValue: String(card.estimatedMarketValue || ""),
      status: card.status,
      soldPrice: String(card.soldPrice || ""),
      fees: String(card.fees || ""),
      shippingCharged: String(card.shippingCharged || ""),
      postagePaid: String(card.postagePaid || ""),
      suppliesCost: String(card.suppliesCost || ""),

      year: card.year || "",
      brand: card.brand || "",
      setName: card.setName || "",
      cardNumber: card.cardNumber || "",
      parallel: card.parallel || "",
      serialNumber: card.serialNumber || "",
      team: card.team || "",

      rookie: Boolean(card.rookie),
      autograph: Boolean(card.autograph),
      relic: Boolean(card.relic),

      rawCondition: card.rawCondition || "",
      gradingCompany: card.gradingCompany || "",
      grade: card.grade || "",
      graderCertNumber: card.graderCertNumber || "",

      storageLocation: card.storageLocation || "",
      askingPrice: String(card.askingPrice || ""),
      soldPlatform: card.soldPlatform || "",
      saleDate: card.saleDate || "",
      orderNumber: card.orderNumber || "",
      costBasisOverride: String(card.costBasisOverride || ""),
      notes: card.notes || "",
    });

    resetScanner();
    setScannerImageName(card.imageName || "");
    setScannerPreview(card.imageUrl || "");
    setScannerFile(null);
    setShowCardForm(true);
  }

  async function deleteCard(id: string) {
    const existingCard = cards.find((card) => card.id === id);

    const { error } = await supabase.from("cards").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    if (existingCard?.imageStoragePath) {
      await removeCardImage(existingCard.imageStoragePath);
    }

    if (editingCardId === id) {
      setShowCardForm(false);
      resetCardForm();
    }

    await loadCards();
  }

  function applyParsedToForm(parsed: ParsedScanResult) {
    setNewCard((prev) => {
      const nextDetails = parsed.details
        ? addUniqueWords(prev.details, parsed.details.split(/\s+/).filter(Boolean))
        : prev.details;

      return {
        ...prev,
        playerCard: prev.playerCard || parsed.playerCard,
        details: nextDetails,
        estimatedMarketValue: prev.estimatedMarketValue || parsed.estimatedMarketValue,
        year: prev.year || parsed.year,
        brand: prev.brand || parsed.brand,
        setName: prev.setName || parsed.setName,
        cardNumber: prev.cardNumber || parsed.cardNumber,
        parallel: prev.parallel || parsed.parallel,
        serialNumber: prev.serialNumber || parsed.serialNumber,
        team: prev.team || parsed.team,
        rookie: prev.rookie || parsed.rookie,
        autograph: prev.autograph || parsed.autograph,
        relic: prev.relic || parsed.relic,
        askingPrice: prev.askingPrice || parsed.askingPrice,
      };
    });
  }

  function handleScanFile(file: File) {
    if (scannerPreview && scannerPreview.startsWith("blob:")) {
      URL.revokeObjectURL(scannerPreview);
    }

    const objectUrl = URL.createObjectURL(file);
    const cleanedName = cleanScanText(file.name);
    const parsed = parseScanText(cleanedName);
    const candidates = buildCandidatesFromParsed(parsed, cleanedName);

    setScannerFile(file);
    setScannerImageName(file.name);
    setScannerPreview(objectUrl);
    setScannerNotes(cleanedName);
    setScanConfidence(parsed.confidence);
    setScanCandidates(candidates);

    const summary = parsed.summaryBits.length
      ? parsed.summaryBits.join(" • ")
      : "Basic image loaded. Add notes for a safer match.";

    setScanStatusMessage(
      `Safer scan parse: ${summary}${parsed.strongPlayerMatch ? "" : " • no strong player match yet"}`
    );

    if (
      parsed.playerCard ||
      parsed.brand ||
      parsed.setName ||
      parsed.parallel ||
      parsed.serialNumber ||
      parsed.cardNumber
    ) {
      applyParsedToForm(parsed);
    }
  }

  function applyScannerDemo() {
    const normalizedNotes = scannerNotes.trim();
    const seedText = normalizedNotes || scannerImageName || "Unknown card";
    const parsed = parseScanText(seedText);
    const candidates = buildCandidatesFromParsed(parsed, seedText);

    setScanCandidates(candidates);
    setScanConfidence(parsed.confidence);
    applyParsedToForm(parsed);

    const summary = parsed.summaryBits.length
      ? parsed.summaryBits.join(" • ")
      : "No strong fields parsed yet.";

    setScanStatusMessage(
      `Found ${candidates.length} safer candidate${candidates.length === 1 ? "" : "s"} • ${summary}${
        parsed.strongPlayerMatch ? "" : " • generic result prioritized"
      }`
    );
  }

  function applyCandidate(candidate: ScanCandidate) {
    setNewCard((prev) => ({
      ...prev,
      playerCard: candidate.playerCard || prev.playerCard,
      details: candidate.details || prev.details,
      estimatedMarketValue:
        candidate.estimatedMarketValue > 0
          ? String(candidate.estimatedMarketValue)
          : prev.estimatedMarketValue,
      year: candidate.year || prev.year,
      brand: candidate.brand || prev.brand,
      setName: candidate.setName || prev.setName,
      cardNumber: candidate.cardNumber || prev.cardNumber,
      parallel: candidate.parallel || prev.parallel,
      serialNumber: candidate.serialNumber || prev.serialNumber,
      team: candidate.team || prev.team,
      rookie: candidate.rookie ?? prev.rookie,
      autograph: candidate.autograph ?? prev.autograph,
      relic: candidate.relic ?? prev.relic,
      askingPrice:
        candidate.askingPrice && candidate.askingPrice > 0
          ? String(candidate.askingPrice)
          : prev.askingPrice,
    }));

    setScanConfidence(candidate.confidence);
    setScanStatusMessage(`Applied candidate: ${candidate.title}`);
  }

  async function runCompsSearch() {
    try {
      setCompsDebug(null);
      setScanStatusMessage("Searching real sold comps...");

      const input = buildCompSearchInputFromCard({
        year: newCard.year,
        brand: newCard.brand,
        setName: newCard.setName,
        playerName: newCard.playerCard,
        cardNumber: newCard.cardNumber,
        parallel: newCard.parallel,
        grade: newCard.grade,
        rookie: newCard.rookie,
      });

      const result = await searchComps(input);
      const warnings = result.warnings?.filter(Boolean) || [];

      setCompsDebug({
        input,
        stats: result.stats
          ? {
              estimatedMarketValue: result.stats.estimatedMarketValue ?? null,
              suggestedListingPrice: result.stats.suggestedListingPrice ?? null,
              sampleSize: result.stats.sampleSize ?? null,
              confidence: result.stats.confidence ?? null,
            }
          : null,
        warnings,
        sales: Array.isArray((result as any).displaySales)
          ? (result as any).displaySales
          : Array.isArray((result as any).sales)
            ? (result as any).sales
            : [],
        raw: result,
      });

      if (!result.ok) {
        setScanStatusMessage(warnings[0] || "Comps search failed.");
        return;
      }

      const mv = result.stats.estimatedMarketValue;
      const ask = result.stats.suggestedListingPrice;
      const sampleSize = result.stats.sampleSize ?? 0;

      setNewCard((prev) => ({
        ...prev,
        estimatedMarketValue:
          mv != null && mv > 0 ? String(mv) : prev.estimatedMarketValue,
        askingPrice:
          ask != null && ask > 0 ? String(ask) : prev.askingPrice,
      }));

      const warningText = warnings.length ? ` • ${warnings[0]}` : "";

      setScanStatusMessage(
        `Comps found (${sampleSize} sales) • MV: ${
          mv != null ? money(mv) : "-"
        } • Suggested Ask: ${ask != null ? money(ask) : "-"} • ${result.stats.confidence} confidence${warningText}`
      );
    } catch (error) {
      console.error(error);
      setCompsDebug(null);
      const message = error instanceof Error ? error.message : "Error fetching comps.";
      setScanStatusMessage(message);
    }
  }

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-900 p-3 text-white">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <div className="text-lg font-semibold">Card Business App</div>
                <div className="text-sm text-slate-500">Workbook-aligned inventory build</div>
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Business snapshot
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>Total breaks</span>
                  <span className="font-semibold">{data.totals.breaks}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Sold cards</span>
                  <span className="font-semibold">{data.totals.soldCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Open inventory</span>
                  <span className="font-semibold">{data.totals.openCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Listed cards</span>
                  <span className="font-semibold">{data.totals.listedCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Shipping profit</span>
                  <span className="font-semibold">{money(data.totals.shippingProfit)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              {nav.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition ${
                      active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="p-5 md:p-8">
          {activeView === "dashboard" && (
            <div className="space-y-6">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-sm font-medium text-slate-500">
                  Connected to Supabase for breaks, cards, and card images
                </div>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard</h1>
                <p className="mt-2 text-sm text-slate-600">
                  This version uses a safer scanner parser that prioritizes your exact typed text and avoids aggressive player guesses.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <MetricCard
                  icon={DollarSign}
                  label="Total Invested"
                  value={money(data.totals.totalInvested)}
                  sub={`${data.totals.breaks} breaks`}
                />
                <MetricCard
                  icon={Wallet}
                  label="Net Proceeds"
                  value={money(data.totals.netProceeds)}
                  sub={`${data.totals.soldCount} sold cards`}
                />
                <MetricCard
                  icon={BarChart3}
                  label="Realized Profit"
                  value={money(data.totals.realizedProfit)}
                  sub="After fees and shipping"
                />
                <MetricCard
                  icon={Truck}
                  label="Shipping Profit"
                  value={money(data.totals.shippingProfit)}
                  sub="Buyer paid minus shipping cost"
                />
                <MetricCard
                  icon={FileSpreadsheet}
                  label="Inventory On Hand"
                  value={money(data.totals.inventoryOnHandCost)}
                  sub={`${data.totals.openCount} open cards`}
                />
                <MetricCard
                  icon={User}
                  label="Personal Collection"
                  value={money(data.totals.personalCostBasis)}
                  sub={`${data.totals.personalCount} personal cards`}
                />
                <MetricCard
                  icon={Tag}
                  label="Listed Ask Value"
                  value={money(data.totals.listedAskValue)}
                  sub={`${data.totals.listedCount} listed cards`}
                />
              </div>
            </div>
          )}

          {activeView === "breaks" && (
            <div className="space-y-6">
              <ShellCard
                title="Break Tracker"
                subtitle="Loaded from Supabase"
                right={
                  <button
                    onClick={() => setShowBreakForm(true)}
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    <Plus className="mr-2 inline h-4 w-4" />
                    Add Break
                  </button>
                }
              >
                <TableWrap>
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-3 pr-4 font-medium">ID</th>
                        <th className="pb-3 pr-4 font-medium">Date</th>
                        <th className="pb-3 pr-4 font-medium">Breaker</th>
                        <th className="pb-3 pr-4 font-medium">Product</th>
                        <th className="pb-3 pr-4 font-medium">Spot</th>
                        <th className="pb-3 pr-4 text-right font-medium">Landed Cost</th>
                        <th className="pb-3 text-right font-medium">Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breaks.map((item) => (
                        <tr key={item.id} className="border-b border-slate-100">
                          <td className="py-3 pr-4 font-medium">{item.id}</td>
                          <td className="py-3 pr-4">{item.date}</td>
                          <td className="py-3 pr-4">{item.breaker}</td>
                          <td className="py-3 pr-4">{item.product}</td>
                          <td className="py-3 pr-4">{item.teamOrSpot}</td>
                          <td className="py-3 pr-4 text-right">{money(calcBreakLandedCost(item))}</td>
                          <td className="py-3 text-right">
                            <button
                              type="button"
                              onClick={() => deleteBreak(item.id)}
                              className="rounded-xl border border-red-300 p-2 text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </ShellCard>

              {showBreakForm && (
                <ShellCard
                  title="Add Break"
                  right={
                    <button
                      type="button"
                      onClick={() => setShowBreakForm(false)}
                      className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  }
                >
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <input
                      className="rounded-2xl border border-slate-300 px-3 py-2"
                      type="date"
                      value={newBreak.date}
                      onChange={(e) => setNewBreak({ ...newBreak, date: e.target.value })}
                    />
                    <input
                      className="rounded-2xl border border-slate-300 px-3 py-2"
                      placeholder="Breaker"
                      value={newBreak.breaker}
                      onChange={(e) => setNewBreak({ ...newBreak, breaker: e.target.value })}
                    />
                    <input
                      className="rounded-2xl border border-slate-300 px-3 py-2"
                      placeholder="Product"
                      value={newBreak.product}
                      onChange={(e) => setNewBreak({ ...newBreak, product: e.target.value })}
                    />
                    <input
                      className="rounded-2xl border border-slate-300 px-3 py-2"
                      placeholder="Format"
                      value={newBreak.format}
                      onChange={(e) => setNewBreak({ ...newBreak, format: e.target.value })}
                    />
                    <input
                      className="rounded-2xl border border-slate-300 px-3 py-2"
                      placeholder="Team or spot"
                      value={newBreak.teamOrSpot}
                      onChange={(e) => setNewBreak({ ...newBreak, teamOrSpot: e.target.value })}
                    />
                    <input
                      className="rounded-2xl border border-slate-300 px-3 py-2"
                      type="number"
                      placeholder="Purchase price"
                      value={newBreak.purchasePrice}
                      onChange={(e) => setNewBreak({ ...newBreak, purchasePrice: e.target.value })}
                    />
                    <input
                      className="rounded-2xl border border-slate-300 px-3 py-2"
                      type="number"
                      placeholder="Sales tax"
                      value={newBreak.salesTax}
                      onChange={(e) => setNewBreak({ ...newBreak, salesTax: e.target.value })}
                    />
                    <input
                      className="rounded-2xl border border-slate-300 px-3 py-2"
                      type="number"
                      placeholder="Shipping to you"
                      value={newBreak.shippingToYou}
                      onChange={(e) => setNewBreak({ ...newBreak, shippingToYou: e.target.value })}
                    />
                    <input
                      className="rounded-2xl border border-slate-300 px-3 py-2"
                      type="number"
                      placeholder="Grading fees"
                      value={newBreak.gradingFees}
                      onChange={(e) => setNewBreak({ ...newBreak, gradingFees: e.target.value })}
                    />
                    <input
                      className="rounded-2xl border border-slate-300 px-3 py-2"
                      type="number"
                      placeholder="Other cost"
                      value={newBreak.otherCost}
                      onChange={(e) => setNewBreak({ ...newBreak, otherCost: e.target.value })}
                    />
                    <textarea
                      className="rounded-2xl border border-slate-300 px-3 py-2 md:col-span-2 xl:col-span-3"
                      rows={3}
                      placeholder="Notes"
                      value={newBreak.notes}
                      onChange={(e) => setNewBreak({ ...newBreak, notes: e.target.value })}
                    />
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={addBreak}
                      className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                    >
                      Save Break
                    </button>
                  </div>
                </ShellCard>
              )}
            </div>
          )}

          {activeView === "inventory" && (
            <div className="space-y-6">
              <ShellCard
                title="Card Inventory"
                subtitle="Expanded to support workbook-style intake, storage, listing, grading, and sale tracking"
                right={
                  <button
                    type="button"
                    onClick={openNewCardForm}
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    <Plus className="mr-2 inline h-4 w-4" />
                    Add Card
                  </button>
                }
              >
                {cardsLoading ? (
                  <div className="text-sm text-slate-500">Loading cards...</div>
                ) : (
                  <TableWrap>
                    <table className="min-w-full text-sm" style={{ tableLayout: "fixed" }}>
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-500">
                          <th className="pb-3 pr-4 font-medium">Card</th>
                          <th className="pb-3 pr-4 font-medium">Break</th>
                          <th className="pb-3 pr-4 font-medium">Status</th>
                          <th className="pb-3 pr-4 font-medium">Storage</th>
                          <th className="pb-3 pr-4 text-right font-medium">Est. MV</th>
                          <th className="pb-3 pr-4 text-right font-medium">Ask</th>
                          <th className="pb-3 pr-4 text-right font-medium">Unit Cost</th>
                          <th className="pb-3 pr-4 text-right font-medium">Sold</th>
                          <th className="pb-3 pr-4 text-right font-medium">Profit</th>
                          <th
                            className="pb-3 pr-4 font-medium"
                            style={{ width: "150px", minWidth: "150px", maxWidth: "150px" }}
                          >
                            Image
                          </th>
                          <th className="pb-3 pr-4 text-right font-medium">Edit</th>
                          <th className="pb-3 text-right font-medium">Delete</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.enrichedCards.map((card) => (
                          <tr key={card.id} className="border-b border-slate-100">
                            <td className="py-3 pr-4 align-middle">
                              <div className="font-medium break-words">{card.playerCard}</div>
                              <div className="text-xs text-slate-500 break-words">
                                {[card.year, card.brand, card.setName, card.cardNumber && `#${card.cardNumber}`]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </div>
                              <div className="text-xs text-slate-500 break-words">
                                {[
                                  card.parallel,
                                  card.serialNumber && `SN ${card.serialNumber}`,
                                  card.rookie ? "RC" : "",
                                  card.autograph ? "Auto" : "",
                                  card.relic ? "Relic" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </div>
                            </td>

                            <td className="py-3 pr-4 align-middle break-all">{card.breakId}</td>
                            <td className="py-3 pr-4 align-middle">{card.status}</td>

                            <td className="py-3 pr-4 align-middle">
                              <div className="break-words">{card.storageLocation || "-"}</div>
                            </td>

                            <td className="py-3 pr-4 text-right align-middle">
                              {money(card.estimatedMarketValue)}
                            </td>

                            <td className="py-3 pr-4 text-right align-middle">
                              {card.askingPrice > 0 ? money(card.askingPrice) : "-"}
                            </td>

                            <td className="py-3 pr-4 text-right align-middle">{money(card.unitCost)}</td>

                            <td className="py-3 pr-4 text-right align-middle">
                              {card.status === "Sold" ? money(card.soldPrice) : "-"}
                            </td>

                            <td className="py-3 pr-4 text-right align-middle">
                              {card.status === "Sold" ? money(card.realizedProfit) : "-"}
                            </td>

                            <td
                              className="py-3 pr-4 align-middle"
                              style={{
                                width: "150px",
                                minWidth: "150px",
                                maxWidth: "150px",
                                overflow: "hidden",
                              }}
                            >
                              {card.imageUrl ? (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    width: "140px",
                                    maxWidth: "140px",
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: "48px",
                                      height: "48px",
                                      minWidth: "48px",
                                      minHeight: "48px",
                                      maxWidth: "48px",
                                      maxHeight: "48px",
                                      borderRadius: "8px",
                                      overflow: "hidden",
                                      border: "1px solid #e2e8f0",
                                      background: "#ffffff",
                                      position: "relative",
                                      flexShrink: 0,
                                    }}
                                  >
                                    <img
                                      src={card.imageUrl}
                                      alt={card.imageName || "Card thumbnail"}
                                      style={{
                                        width: "48px",
                                        height: "48px",
                                        minWidth: "48px",
                                        minHeight: "48px",
                                        maxWidth: "48px",
                                        maxHeight: "48px",
                                        objectFit: "cover",
                                        display: "block",
                                      }}
                                    />
                                  </div>

                                  <div
                                    style={{
                                      fontSize: "12px",
                                      color: "#64748b",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      maxWidth: "80px",
                                    }}
                                  >
                                    {card.imageName || "Image"}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-xs text-slate-500">-</div>
                              )}
                            </td>

                            <td className="py-3 pr-4 text-right align-middle">
                              <button
                                type="button"
                                onClick={() => editCard(card)}
                                className="rounded-xl border border-slate-300 p-2 text-slate-700"
                                style={{ position: "relative", zIndex: 5 }}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            </td>

                            <td className="py-3 text-right align-middle">
                              <button
                                type="button"
                                onClick={() => deleteCard(card.id)}
                                className="rounded-xl border border-red-300 p-2 text-red-700"
                                style={{ position: "relative", zIndex: 5 }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                )}
              </ShellCard>

              {showCardForm && (
                <div className="space-y-6">
                  <ShellCard
                    title={editingCardId ? `Edit Card ${editingCardId}` : "Scan Intake"}
                    subtitle="Use scanner upload or mobile camera, then apply suggested matches"
                  >
                    <div className="mb-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setScanMode("upload")}
                        className={`rounded-2xl px-4 py-2 text-sm font-medium ${
                          scanMode === "upload"
                            ? "bg-slate-900 text-white"
                            : "border border-slate-300 text-slate-700"
                        }`}
                      >
                        <Upload className="mr-2 inline h-4 w-4" />
                        Hardware Scanner / Upload
                      </button>

                      <button
                        type="button"
                        onClick={() => setScanMode("camera")}
                        className={`rounded-2xl px-4 py-2 text-sm font-medium ${
                          scanMode === "camera"
                            ? "bg-slate-900 text-white"
                            : "border border-slate-300 text-slate-700"
                        }`}
                      >
                        <Camera className="mr-2 inline h-4 w-4" />
                        Mobile Camera
                      </button>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 text-sm font-medium text-slate-700">
                          {scanMode === "upload"
                            ? "Upload a scanned image file"
                            : "Take a picture with your device camera"}
                        </div>

                        <input
                          type="file"
                          accept="image/*"
                          capture={scanMode === "camera" ? "environment" : undefined}
                          className="mb-4 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            handleScanFile(file);
                          }}
                        />

                        {scannerImageName ? (
                          <div className="mb-3 rounded-xl bg-white px-3 py-2 text-sm text-slate-700">
                            Selected image: {scannerImageName}
                          </div>
                        ) : null}

                        {scannerPreview ? (
                          <img
                            src={scannerPreview}
                            alt="Card scan preview"
                            className="mb-4 max-h-72 w-full rounded-2xl border border-slate-200 bg-white object-contain"
                          />
                        ) : (
                          <div className="mb-4 flex h-48 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm text-slate-400">
                            No image selected yet
                          </div>
                        )}

                        <textarea
                          className="min-h-[120px] w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm"
                          placeholder="Type exact details like: 2026 Topps Chrome Paul Skenes RC #145 Refractor 12/50 Pirates"
                          value={scannerNotes}
                          onChange={(event) => setScannerNotes(event.target.value)}
                        />

                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={applyScannerDemo}
                            className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                          >
                            <Search className="mr-2 inline h-4 w-4" />
                            Find Candidates
                          </button>

                          <button
                            type="button"
                            onClick={resetScanner}
                            className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                          >
                            Clear Scan
                          </button>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 text-base font-semibold">Recognition Result</div>
                        <div className="space-y-3 text-sm">
                          <div className="rounded-xl bg-slate-50 p-3">
                            <span className="font-medium">Mode:</span>{" "}
                            {scanMode === "upload" ? "Scanner / Upload" : "Mobile Camera"}
                          </div>
                          <div className="rounded-xl bg-slate-50 p-3">
                            <span className="font-medium">Image:</span> {scannerImageName || "None yet"}
                          </div>
                          <div className="rounded-xl bg-slate-50 p-3">
                            <span className="font-medium">Confidence:</span>{" "}
                            {scanConfidence || "Not run yet"}
                          </div>
                          <div className="rounded-xl bg-slate-50 p-3">
                            <span className="font-medium">Status:</span>{" "}
                            {scanStatusMessage || "Waiting for image or exact notes."}
                          </div>
                        </div>
                      </div>
                    </div>
                  </ShellCard>

                  <ShellCard
                    title="Match Candidates"
                    subtitle="Generic parsed result is shown first unless your text strongly supports a named player"
                  >
                    <div className="space-y-3">
                      {scanCandidates.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                          No candidates yet. Upload a file or type exact notes, then click Find Candidates.
                        </div>
                      ) : (
                        scanCandidates.map((candidate) => (
                          <div
                            key={candidate.id}
                            className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between"
                          >
                            <div>
                              <div className="font-medium">{candidate.title}</div>
                              <div className="mt-1 text-sm text-slate-500">{candidate.source}</div>
                              <div className="mt-2 text-sm text-slate-600">
                                {[
                                  candidate.playerCard,
                                  candidate.brand,
                                  candidate.setName,
                                  candidate.cardNumber ? `#${candidate.cardNumber}` : "",
                                  candidate.parallel,
                                  candidate.serialNumber,
                                  candidate.team,
                                  candidate.rookie ? "RC" : "",
                                  candidate.autograph ? "Auto" : "",
                                  candidate.relic ? "Relic" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </div>
                              <div className="mt-1 text-sm text-slate-600">
                                Est. {money(candidate.estimatedMarketValue)} • Ask{" "}
                                {candidate.askingPrice ? money(candidate.askingPrice) : "-"} •{" "}
                                {candidate.confidence} confidence
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => applyCandidate(candidate)}
                              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                            >
                              Apply Candidate
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </ShellCard>

                  <ShellCard
                    title={editingCardId ? "Edit Card" : "Add Card"}
                    subtitle="Review or edit recognized details before saving"
                    right={
                      <button
                        type="button"
                        onClick={() => {
                          setShowCardForm(false);
                          resetCardForm();
                        }}
                        className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    }
                  >
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <SectionHeading
                        title="Link + core identity"
                        subtitle="These fields line up with your main intake / inventory workflow"
                      />

                      <select
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        value={newCard.breakId}
                        onChange={(e) => setNewCard({ ...newCard, breakId: e.target.value })}
                      >
                        {breaks.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.id} - {item.product}
                          </option>
                        ))}
                      </select>

                      <select
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        value={newCard.status}
                        onChange={(e) =>
                          setNewCard({ ...newCard, status: e.target.value as InventoryStatus })
                        }
                      >
                        {INVENTORY_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        placeholder="Player / card"
                        value={newCard.playerCard}
                        onChange={(e) => setNewCard({ ...newCard, playerCard: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        placeholder="Year"
                        value={newCard.year}
                        onChange={(e) => setNewCard({ ...newCard, year: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        placeholder="Brand (Topps, Bowman, etc.)"
                        value={newCard.brand}
                        onChange={(e) => setNewCard({ ...newCard, brand: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        placeholder="Set / product line"
                        value={newCard.setName}
                        onChange={(e) => setNewCard({ ...newCard, setName: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        placeholder="Card number"
                        value={newCard.cardNumber}
                        onChange={(e) => setNewCard({ ...newCard, cardNumber: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        placeholder="Parallel"
                        value={newCard.parallel}
                        onChange={(e) => setNewCard({ ...newCard, parallel: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        placeholder="Serial number (e.g. 12/50)"
                        value={newCard.serialNumber}
                        onChange={(e) => setNewCard({ ...newCard, serialNumber: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        placeholder="Team"
                        value={newCard.team}
                        onChange={(e) => setNewCard({ ...newCard, team: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2 md:col-span-2 xl:col-span-3"
                        placeholder="Details"
                        value={newCard.details}
                        onChange={(e) => setNewCard({ ...newCard, details: e.target.value })}
                      />

                      <SectionHeading
                        title="Flags + grading"
                        subtitle="Useful for filtering, listing, pricing, and workbook alignment"
                      />

                      <CheckboxField
                        checked={newCard.rookie}
                        label="Rookie"
                        onChange={(value) => setNewCard({ ...newCard, rookie: value })}
                      />

                      <CheckboxField
                        checked={newCard.autograph}
                        label="Autograph"
                        onChange={(value) => setNewCard({ ...newCard, autograph: value })}
                      />

                      <CheckboxField
                        checked={newCard.relic}
                        label="Relic / Patch"
                        onChange={(value) => setNewCard({ ...newCard, relic: value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        placeholder="Raw condition"
                        value={newCard.rawCondition}
                        onChange={(e) => setNewCard({ ...newCard, rawCondition: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        placeholder="Grading company"
                        value={newCard.gradingCompany}
                        onChange={(e) => setNewCard({ ...newCard, gradingCompany: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        placeholder="Grade"
                        value={newCard.grade}
                        onChange={(e) => setNewCard({ ...newCard, grade: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        placeholder="Grader cert #"
                        value={newCard.graderCertNumber}
                        onChange={(e) =>
                          setNewCard({ ...newCard, graderCertNumber: e.target.value })
                        }
                      />

                      <SectionHeading
                        title="Storage + value"
                        subtitle="Matches real inventory handling better than basic holding/listed only"
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        type="number"
                        placeholder="Estimated market value"
                        value={newCard.estimatedMarketValue}
                        onChange={(e) =>
                          setNewCard({ ...newCard, estimatedMarketValue: e.target.value })
                        }
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        type="number"
                        placeholder="Ask price"
                        value={newCard.askingPrice}
                        onChange={(e) => setNewCard({ ...newCard, askingPrice: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        placeholder="Storage location"
                        value={newCard.storageLocation}
                        onChange={(e) => setNewCard({ ...newCard, storageLocation: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        type="number"
                        placeholder="Cost basis override"
                        value={newCard.costBasisOverride}
                        onChange={(e) =>
                          setNewCard({ ...newCard, costBasisOverride: e.target.value })
                        }
                      />

                      <SectionHeading
                        title="Sale tracking"
                        subtitle="Platform, order, shipping, fees, and final economics"
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        type="number"
                        placeholder="Sold price"
                        value={newCard.soldPrice}
                        onChange={(e) => setNewCard({ ...newCard, soldPrice: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        type="number"
                        placeholder="Fees"
                        value={newCard.fees}
                        onChange={(e) => setNewCard({ ...newCard, fees: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        type="number"
                        placeholder="Shipping charged"
                        value={newCard.shippingCharged}
                        onChange={(e) =>
                          setNewCard({ ...newCard, shippingCharged: e.target.value })
                        }
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        type="number"
                        placeholder="Postage paid"
                        value={newCard.postagePaid}
                        onChange={(e) => setNewCard({ ...newCard, postagePaid: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        type="number"
                        placeholder="Supplies cost"
                        value={newCard.suppliesCost}
                        onChange={(e) => setNewCard({ ...newCard, suppliesCost: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        placeholder="Sold platform"
                        value={newCard.soldPlatform}
                        onChange={(e) => setNewCard({ ...newCard, soldPlatform: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        type="date"
                        value={newCard.saleDate}
                        onChange={(e) => setNewCard({ ...newCard, saleDate: e.target.value })}
                      />

                      <input
                        className="rounded-2xl border border-slate-300 px-3 py-2"
                        placeholder="Order number"
                        value={newCard.orderNumber}
                        onChange={(e) => setNewCard({ ...newCard, orderNumber: e.target.value })}
                      />

                      <SectionHeading
                        title="Notes"
                        subtitle="Use this for comps notes, defects, listing notes, or personal/inventory reasoning"
                      />

                      <textarea
                        className="rounded-2xl border border-slate-300 px-3 py-2 md:col-span-2 xl:col-span-3"
                        rows={4}
                        placeholder="Notes"
                        value={newCard.notes}
                        onChange={(e) => setNewCard({ ...newCard, notes: e.target.value })}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={saveCard}
                        className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                      >
                        {editingCardId ? "Save Changes" : "Save Card"}
                      </button>

                      <button
                        type="button"
                        onClick={applyScannerDemo}
                        className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                      >
                        Re-run Candidate Fill
                      </button>

                      <button
                        type="button"
                        onClick={runCompsSearch}
                        className="rounded-2xl bg-green-600 px-4 py-2 text-sm font-medium text-white"
                      >
                        Get Real Comps
                      </button>
                    </div>

                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-emerald-900">
                            Comps Debug Panel
                          </div>
                          <div className="text-xs text-emerald-700">
                            Visible comps response for troubleshooting UI updates
                          </div>
                        </div>
                        <div className="text-xs text-emerald-800">
                          {compsDebug?.stats?.sampleSize != null
                            ? `${compsDebug.stats.sampleSize} sale(s)`
                            : "No comps loaded yet"}
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-emerald-200 bg-white p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                            Estimated MV
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-900">
                            {compsDebug?.stats?.estimatedMarketValue != null
                              ? money(compsDebug.stats.estimatedMarketValue)
                              : "-"}
                          </div>
                        </div>

                        <div className="rounded-xl border border-emerald-200 bg-white p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                            Suggested Ask
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-900">
                            {compsDebug?.stats?.suggestedListingPrice != null
                              ? money(compsDebug.stats.suggestedListingPrice)
                              : "-"}
                          </div>
                        </div>

                        <div className="rounded-xl border border-emerald-200 bg-white p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                            Confidence
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-900">
                            {compsDebug?.stats?.confidence || "-"}
                          </div>
                        </div>

                        <div className="rounded-xl border border-emerald-200 bg-white p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                            Warning
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-900">
                            {compsDebug?.warnings?.[0] || "-"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 xl:grid-cols-2">
                        <div className="rounded-xl border border-emerald-200 bg-white p-3">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                            Search input
                          </div>
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-700">
                            {compsDebug ? JSON.stringify(compsDebug.input, null, 2) : "No response yet."}
                          </pre>
                        </div>

                        <div className="rounded-xl border border-emerald-200 bg-white p-3">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                            Raw comps response
                          </div>
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-700">
                            {compsDebug ? JSON.stringify(compsDebug.raw, null, 2) : "No response yet."}
                          </pre>
                        </div>
                      </div>

                      <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3">
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                          Displayed sales
                        </div>

                        {compsDebug?.sales && compsDebug.sales.length > 0 ? (
                          <div className="space-y-2">
                            {compsDebug.sales.slice(0, 10).map((sale, index) => (
                              <pre
                                key={index}
                                className="overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700"
                              >
                                {JSON.stringify(sale, null, 2)}
                              </pre>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-slate-500">No displayed sales returned yet.</div>
                        )}
                      </div>
                    </div>
                  </ShellCard>
                </div>
              )}
            </div>
          )}

          {activeView === "shipping" && (
            <ShellCard
              title="Shipping Profit Center"
              subtitle="What buyer paid, cost to ship, and shipping margin"
            >
              <TableWrap>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="pb-3 pr-4 font-medium">Profile</th>
                      <th className="pb-3 pr-4 text-right font-medium">Orders</th>
                      <th className="pb-3 pr-4 text-right font-medium">Charged</th>
                      <th className="pb-3 pr-4 text-right font-medium">Postage</th>
                      <th className="pb-3 pr-4 text-right font-medium">Supplies</th>
                      <th className="pb-3 text-right font-medium">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.shippingRows.map((row) => (
                      <tr key={row.profile} className="border-b border-slate-100">
                        <td className="py-3 pr-4 font-medium">{row.profile}</td>
                        <td className="py-3 pr-4 text-right">{row.orders}</td>
                        <td className="py-3 pr-4 text-right">{money(row.charged)}</td>
                        <td className="py-3 pr-4 text-right">{money(row.postage)}</td>
                        <td className="py-3 pr-4 text-right">{money(row.supplies)}</td>
                        <td className="py-3 text-right">{money(row.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </ShellCard>
          )}

          {activeView === "roi" && (
            <ShellCard title="Break ROI" subtitle="Break-by-break performance">
              <TableWrap>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="pb-3 pr-4 font-medium">Break</th>
                      <th className="pb-3 pr-4 text-right font-medium">Invested</th>
                      <th className="pb-3 pr-4 text-right font-medium">Gross Sales</th>
                      <th className="pb-3 pr-4 text-right font-medium">Net Proceeds</th>
                      <th className="pb-3 pr-4 text-right font-medium">Realized Profit</th>
                      <th className="pb-3 pr-4 text-right font-medium">Inv. On Hand</th>
                      <th className="pb-3 pr-4 text-right font-medium">Unsold MV</th>
                      <th className="pb-3 text-right font-medium">Economic ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.breakRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="py-3 pr-4">
                          <div className="font-medium">{row.id}</div>
                          <div className="text-xs text-slate-500">{row.product}</div>
                        </td>
                        <td className="py-3 pr-4 text-right">{money(row.invested)}</td>
                        <td className="py-3 pr-4 text-right">{money(row.grossSales)}</td>
                        <td className="py-3 pr-4 text-right">{money(row.netProceeds)}</td>
                        <td className="py-3 pr-4 text-right">{money(row.realizedProfit)}</td>
                        <td className="py-3 pr-4 text-right">{money(row.inventoryOnHand)}</td>
                        <td className="py-3 pr-4 text-right">{money(row.unsoldEstMv)}</td>
                        <td className="py-3 text-right">{pct(row.economicRoiPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </ShellCard>
          )}
        </main>
      </div>
    </div>
  );
}