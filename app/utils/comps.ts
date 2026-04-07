export type CompSearchInput = {
  q?: string;
  year?: string | number;
  setName?: string;
  playerName?: string;
  cardNumber?: string;
  parallel?: string;
  grade?: string;
  brand?: string;
  subset?: string;
  rookie?: boolean;
  limit?: number;
};

export type SoldComp = {
  title: string;
  itemUrl: string | null;
  imageUrl: string | null;
  condition: string | null;
  listingType: string | null;
  endTime: string | null;
  price: number;
  shipping: number;
  total: number;
  currency: string;
  location: string | null;
  confidence: number;
};

export type PricingStats = {
  sampleSize: number;
  rawSampleSize: number;
  low: number | null;
  high: number | null;
  average: number | null;
  median: number | null;
  estimatedMarketValue: number | null;
  suggestedListingPrice: number | null;
  confidence: "low" | "medium" | "high";
};

export type CompSearchResponse = {
  ok: boolean;
  provider: "ebay-finding";
  query: string;
  comps: SoldComp[];
  stats: PricingStats;
  warnings: string[];
};

export async function searchComps(
  input: CompSearchInput
): Promise<CompSearchResponse> {
  const res = await fetch("/api/comps/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(cleanCompInput(input)),
  });

  let data: unknown = null;

  try {
    data = await res.json();
  } catch {
    throw new Error("Could not read comps response.");
  }

  if (!res.ok) {
    const message = getErrorMessage(data) ?? "Comp search failed.";
    throw new Error(message);
  }

  return normalizeCompSearchResponse(data);
}

export function buildCompSearchInputFromCard(card: {
  year?: string | number | null;
  brand?: string | null;
  set_name?: string | null;
  setName?: string | null;
  subset?: string | null;
  player_name?: string | null;
  playerName?: string | null;
  card_number?: string | null;
  cardNumber?: string | null;
  parallel?: string | null;
  grade?: string | null;
  rookie?: boolean | null;
}): CompSearchInput {
  return cleanCompInput({
    year: card.year ?? undefined,
    brand: card.brand ?? undefined,
    setName: card.set_name ?? card.setName ?? undefined,
    subset: card.subset ?? undefined,
    playerName: card.player_name ?? card.playerName ?? undefined,
    cardNumber: card.card_number ?? card.cardNumber ?? undefined,
    parallel: card.parallel ?? undefined,
    grade: card.grade ?? undefined,
    rookie: card.rookie ?? undefined,
    limit: 12,
  });
}

export function buildCompQueryPreview(input: CompSearchInput): string {
  if (input.q && input.q.trim()) return normalizeWhitespace(input.q);

  const parts = [
    input.year,
    input.brand,
    input.setName,
    input.subset,
    input.playerName,
    input.cardNumber ? `#${String(input.cardNumber).trim()}` : undefined,
    input.parallel,
    input.rookie ? "rookie" : undefined,
    input.grade,
  ]
    .map((value) => {
      if (value == null) return "";
      return String(value).trim();
    })
    .filter(Boolean);

  return dedupeWords(parts.join(" "));
}

function cleanCompInput(input: CompSearchInput): CompSearchInput {
  const cleaned: CompSearchInput = {};

  if (hasText(input.q)) cleaned.q = normalizeWhitespace(input.q as string);
  if (hasValue(input.year)) cleaned.year = normalizeScalar(input.year);
  if (hasText(input.setName)) cleaned.setName = normalizeWhitespace(input.setName as string);
  if (hasText(input.playerName)) cleaned.playerName = normalizeWhitespace(input.playerName as string);
  if (hasText(input.cardNumber)) cleaned.cardNumber = normalizeWhitespace(input.cardNumber as string);
  if (hasText(input.parallel)) cleaned.parallel = normalizeWhitespace(input.parallel as string);
  if (hasText(input.grade)) cleaned.grade = normalizeWhitespace(input.grade as string);
  if (hasText(input.brand)) cleaned.brand = normalizeWhitespace(input.brand as string);
  if (hasText(input.subset)) cleaned.subset = normalizeWhitespace(input.subset as string);
  if (typeof input.rookie === "boolean") cleaned.rookie = input.rookie;
  if (typeof input.limit === "number" && Number.isFinite(input.limit)) {
    cleaned.limit = Math.max(1, Math.min(30, Math.floor(input.limit)));
  }

  return cleaned;
}

function normalizeCompSearchResponse(data: unknown): CompSearchResponse {
  const obj = asObject(data);

  const statsObj = asObject(obj.stats);
  const compsRaw = Array.isArray(obj.comps) ? obj.comps : [];
  const warningsRaw = Array.isArray(obj.warnings) ? obj.warnings : [];

  return {
    ok: obj.ok === true,
    provider: "ebay-finding",
    query: typeof obj.query === "string" ? obj.query : "",
    comps: compsRaw.map(normalizeSoldComp).filter(Boolean) as SoldComp[],
    stats: {
      sampleSize: toNumberOrZero(statsObj.sampleSize),
      rawSampleSize: toNumberOrZero(statsObj.rawSampleSize),
      low: toNullableNumber(statsObj.low),
      high: toNullableNumber(statsObj.high),
      average: toNullableNumber(statsObj.average),
      median: toNullableNumber(statsObj.median),
      estimatedMarketValue: toNullableNumber(statsObj.estimatedMarketValue),
      suggestedListingPrice: toNullableNumber(statsObj.suggestedListingPrice),
      confidence:
        statsObj.confidence === "high" ||
        statsObj.confidence === "medium" ||
        statsObj.confidence === "low"
          ? statsObj.confidence
          : "low",
    },
    warnings: warningsRaw
      .map((item) => (typeof item === "string" ? item : ""))
      .filter(Boolean),
  };
}

function normalizeSoldComp(value: unknown): SoldComp | null {
  const obj = asObject(value);
  const title = typeof obj.title === "string" ? obj.title : "";

  if (!title) return null;

  return {
    title,
    itemUrl: typeof obj.itemUrl === "string" ? obj.itemUrl : null,
    imageUrl: typeof obj.imageUrl === "string" ? obj.imageUrl : null,
    condition: typeof obj.condition === "string" ? obj.condition : null,
    listingType: typeof obj.listingType === "string" ? obj.listingType : null,
    endTime: typeof obj.endTime === "string" ? obj.endTime : null,
    price: toNumberOrZero(obj.price),
    shipping: toNumberOrZero(obj.shipping),
    total: toNumberOrZero(obj.total),
    currency: typeof obj.currency === "string" ? obj.currency : "USD",
    location: typeof obj.location === "string" ? obj.location : null,
    confidence: toNumberOrZero(obj.confidence),
  };
}

function getErrorMessage(data: unknown): string | null {
  const obj = asObject(data);
  const warnings = Array.isArray(obj.warnings) ? obj.warnings : [];

  const firstWarning = warnings.find((item) => typeof item === "string");
  if (typeof firstWarning === "string" && firstWarning.trim()) {
    return firstWarning;
  }

  return null;
}

function asObject(value: unknown): Record<string, any> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, any>;
  }

  return {};
}

function toNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;

  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toNumberOrZero(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function normalizeScalar(value: string | number | undefined): string | number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") return normalizeWhitespace(value);
  return undefined;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function dedupeWords(value: string): string {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const word of normalizeWhitespace(value).split(" ")) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }

  return out.join(" ");
}