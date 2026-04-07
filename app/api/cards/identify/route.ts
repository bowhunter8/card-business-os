import { NextRequest, NextResponse } from "next/server";

type IdentifyPayload = {
  imageName?: string;
  notes?: string;
  ocrFrontText?: string;
  ocrBackText?: string;
  existing?: {
    playerCard?: string;
    year?: string;
    brand?: string;
    setName?: string;
    cardNumber?: string;
    parallel?: string;
    serialNumber?: string;
    team?: string;
    grade?: string;
    rookie?: boolean;
    autograph?: boolean;
    relic?: boolean;
  };
};

type ParsedCard = {
  seedText: string;
  year: string;
  brand: string;
  setName: string;
  playerCard: string;
  cardNumber: string;
  parallel: string;
  serialNumber: string;
  team: string;
  grade: string;
  rookie: boolean;
  autograph: boolean;
  relic: boolean;
  confidenceScore: number;
  evidence: string[];
};

type Candidate = {
  id: string;
  title: string;
  confidence: string;
  confidenceScore: number;
  source: string;
  playerCard: string;
  details: string;
  estimatedMarketValue: number;
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
  notes?: string[];
};

type CompsRouteResult = {
  ok?: boolean;
  warnings?: string[];
  stats?: {
    estimatedMarketValue?: number | null;
    suggestedListingPrice?: number | null;
    sampleSize?: number | null;
    confidence?: string | null;
  };
  displaySales?: Array<{
    title?: string;
    price?: number;
    total?: number;
  }>;
  debug?: unknown;
};

const PLAYER_ALIASES: Array<{ name: string; aliases: string[] }> = [
  { name: "Cal Raleigh", aliases: ["cal raleigh", "raleigh"] },
  { name: "Ken Griffey Jr.", aliases: ["ken griffey jr", "ken griffey jr.", "griffey jr", "griffey"] },
  { name: "Shohei Ohtani", aliases: ["shohei ohtani", "ohtani"] },
  { name: "Paul Skenes", aliases: ["paul skenes", "skenes"] },
  { name: "Aaron Judge", aliases: ["aaron judge", "judge"] },
  { name: "Julio Rodriguez", aliases: ["julio rodriguez", "jrod", "rodriguez"] },
  { name: "Mike Trout", aliases: ["mike trout", "trout"] },
  { name: "Bobby Witt Jr.", aliases: ["bobby witt jr", "bobby witt jr.", "witt jr", "witt"] },
  { name: "Elly De La Cruz", aliases: ["elly de la cruz", "elly"] },
  { name: "Jackson Holliday", aliases: ["jackson holliday", "holliday"] },
  { name: "Wyatt Langford", aliases: ["wyatt langford", "langford"] },
  { name: "Dylan Crews", aliases: ["dylan crews", "crews"] },
  { name: "Randy Johnson", aliases: ["randy johnson", "johnson"] },
  { name: "Juan Soto", aliases: ["juan soto", "soto"] },
  { name: "Mookie Betts", aliases: ["mookie betts", "betts"] },
];

const BRAND_PATTERNS = [
  "topps chrome",
  "topps finest",
  "topps heritage",
  "topps archives",
  "topps update",
  "topps",
  "bowman chrome",
  "bowman sterling",
  "bowman",
  "panini prizm",
  "panini select",
  "donruss optic",
  "donruss",
  "leaf",
];

const SET_PATTERNS = [
  "profiles",
  "archives",
  "chrome",
  "heritage",
  "finest",
  "inception",
  "museum collection",
  "allen & ginter",
  "stadium club",
  "update",
  "series 1",
  "series 2",
  "cosmic chrome",
  "prizm",
  "select",
  "optic",
  "sterling",
];

const TEAM_PATTERNS: Record<string, string> = {
  pirates: "Pittsburgh Pirates",
  yankees: "New York Yankees",
  dodgers: "Los Angeles Dodgers",
  mariners: "Seattle Mariners",
  angels: "Los Angeles Angels",
  mets: "New York Mets",
  cubs: "Chicago Cubs",
  "red sox": "Boston Red Sox",
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
  diamondbacks: "Arizona Diamondbacks",
};

const PARALLEL_PATTERNS = [
  "superfractor",
  "gold refractor",
  "orange refractor",
  "blue refractor",
  "green refractor",
  "red refractor",
  "purple refractor",
  "wave refractor",
  "x-fractor",
  "refractor",
  "mojo",
  "lava",
  "atomic",
  "rainbow foil",
  "cracked ice",
  "gold",
  "orange",
  "blue",
  "green",
  "red",
  "purple",
  "black",
  "pink",
  "sepia",
  "silver",
  "holo",
];

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as IdentifyPayload;

    const parsed = parseCard(body);
    const warnings: string[] = [];

    if (!parsed.seedText) {
      return NextResponse.json(
        {
          ok: false,
          candidates: [],
          warnings: ["No usable text or card hints were provided."],
          parsed,
          debug: {
            receivedKeys: Object.keys(body || {}),
          },
        },
        { status: 400 }
      );
    }

    const searchPlans = buildSearchPlans(parsed, body.existing || {});
    const origin = new URL(request.url).origin;

    const candidates: Candidate[] = [];
    const compsAttempts: Array<Record<string, unknown>> = [];

    for (const plan of searchPlans) {
      const compsResult = await fetchComps(origin, plan.query, {
        year: plan.year,
        brand: plan.brand,
        setName: plan.setName,
        playerName: plan.playerCard,
        cardNumber: plan.cardNumber,
        parallel: plan.parallel,
        grade: plan.grade,
        rookie: plan.rookie,
      });

      const sampleSize = toFiniteNumber(compsResult?.stats?.sampleSize) ?? 0;
      const estimatedMarketValue = toFiniteNumber(compsResult?.stats?.estimatedMarketValue) ?? 0;
      const suggestedAsk = toFiniteNumber(compsResult?.stats?.suggestedListingPrice) ?? 0;

      const compConfidence = String(compsResult?.stats?.confidence || "").toLowerCase();
      let score = plan.baseScore;

      if (sampleSize >= 5) score += 30;
      else if (sampleSize >= 3) score += 20;
      else if (sampleSize >= 1) score += 8;

      if (estimatedMarketValue > 0) score += 10;
      if (compConfidence === "high") score += 20;
      else if (compConfidence === "medium") score += 10;

      const sales = Array.isArray(compsResult?.displaySales) ? compsResult.displaySales : [];
      const salesPreview = sales.slice(0, 3).map((sale) => sale?.title).filter(Boolean) as string[];

      const notes = [
        ...plan.notes,
        ...(Array.isArray(compsResult?.warnings) ? compsResult.warnings : []),
      ].filter(Boolean);

      candidates.push({
        id: plan.id,
        title:
          [
            plan.year,
            plan.brand,
            plan.setName,
            plan.playerCard,
            plan.cardNumber ? `#${plan.cardNumber}` : "",
            plan.parallel,
          ]
            .filter(Boolean)
            .join(" ") || plan.query,
        confidence: scoreToConfidence(score),
        confidenceScore: score,
        source: sampleSize > 0 ? "OCR + existing fields + real comps search" : "OCR + existing fields",
        playerCard: plan.playerCard,
        details: buildDetails(plan),
        estimatedMarketValue,
        year: plan.year || undefined,
        brand: plan.brand || undefined,
        setName: plan.setName || undefined,
        cardNumber: plan.cardNumber || undefined,
        parallel: plan.parallel || undefined,
        serialNumber: plan.serialNumber || undefined,
        team: plan.team || undefined,
        rookie: plan.rookie,
        autograph: plan.autograph,
        relic: plan.relic,
        askingPrice: suggestedAsk || undefined,
        notes: [...notes, ...salesPreview.map((title) => `Comp hit: ${title}`)].slice(0, 6),
      });

      compsAttempts.push({
        label: plan.id,
        query: plan.query,
        sampleSize,
        estimatedMarketValue,
        confidence: compConfidence || null,
        warnings: compsResult?.warnings || [],
      });
    }

    const deduped = dedupeCandidates(candidates).sort(
      (a, b) => b.confidenceScore - a.confidenceScore
    );

    if (deduped.length === 0) {
      warnings.push("No candidate cards were produced.");
    }

    if (!deduped.some((candidate) => (candidate.estimatedMarketValue || 0) > 0)) {
      warnings.push("No real comps were found yet. Identification is based on OCR and typed fields only.");
    }

    return NextResponse.json({
      ok: true,
      candidates: deduped.slice(0, 6),
      warnings,
      parsed,
      debug: {
        seedText: parsed.seedText,
        evidence: parsed.evidence,
        searchPlans: searchPlans.map((plan) => ({
          id: plan.id,
          query: plan.query,
          baseScore: plan.baseScore,
        })),
        compsAttempts,
      },
    });
  } catch (error) {
    console.error("cards/identify route error:", error);

    return NextResponse.json(
      {
        ok: false,
        candidates: [],
        warnings: [
          error instanceof Error ? error.message : "Unexpected server error in identify route.",
        ],
      },
      { status: 500 }
    );
  }
}

function parseCard(body: IdentifyPayload): ParsedCard {
  const existing = body.existing || {};

  const seedText = cleanText(
    [
      body.imageName,
      body.notes,
      body.ocrFrontText,
      body.ocrBackText,
      existing.playerCard,
      existing.year,
      existing.brand,
      existing.setName,
      existing.cardNumber,
      existing.parallel,
      existing.serialNumber,
      existing.team,
      existing.grade,
      existing.rookie ? "rookie" : "",
      existing.autograph ? "autograph" : "",
      existing.relic ? "relic" : "",
    ]
      .filter(Boolean)
      .join(" ")
  );

  const evidence: string[] = [];
  let confidenceScore = 0;

  const year = firstMatch(seedText, [/\b(19\d{2}|20\d{2})\b/i]) || cleanText(existing.year);
  if (year) {
    evidence.push(`year:${year}`);
    confidenceScore += 10;
  }

  const brand = detectPattern(seedText, BRAND_PATTERNS) || cleanText(existing.brand);
  if (brand) {
    evidence.push(`brand:${brand}`);
    confidenceScore += 10;
  }

  const setName = detectPattern(seedText, SET_PATTERNS) || cleanText(existing.setName);
  if (setName) {
    evidence.push(`set:${setName}`);
    confidenceScore += 10;
  }

  const player = detectPlayer(seedText);
  const playerCard = player.name || cleanText(existing.playerCard);
  if (playerCard) {
    evidence.push(`player:${playerCard}`);
    confidenceScore += player.confidence === "high" ? 35 : player.confidence === "medium" ? 20 : 8;
  }

  const cardNumber =
    firstMatch(seedText, [
      /\bcard\s*#?\s*([A-Z]{0,8}\d{1,5}(?:-\d{1,3})?)\b/i,
      /\b#\s*([A-Z]{0,8}\d{1,5}(?:-\d{1,3})?)\b/i,
      /\bno\.?\s*([A-Z]{0,8}\d{1,5}(?:-\d{1,3})?)\b/i,
    ]) || cleanText(existing.cardNumber);

  if (cardNumber) {
    evidence.push(`card:${cardNumber}`);
    confidenceScore += 15;
  }

  const serialNumber =
    firstMatch(seedText, [/\b(\d{1,3}\/\d{1,3})\b/i]) || cleanText(existing.serialNumber);
  if (serialNumber) {
    evidence.push(`serial:${serialNumber}`);
    confidenceScore += 8;
  }

  const parallel = detectPattern(seedText, PARALLEL_PATTERNS) || cleanText(existing.parallel);
  if (parallel) {
    evidence.push(`parallel:${parallel}`);
    confidenceScore += 8;
  }

  const team = detectTeam(seedText) || cleanText(existing.team);
  if (team) {
    evidence.push(`team:${team}`);
    confidenceScore += 6;
  }

  const grade =
    firstMatch(seedText, [/\b(?:psa|sgc|bgs|cgc)\s*(\d{1,2}(?:\.\d)?)\b/i]) || cleanText(existing.grade);

  const rookie = /\b(rc|rookie)\b/i.test(seedText) || Boolean(existing.rookie);
  const autograph = /\b(auto|autograph)\b/i.test(seedText) || Boolean(existing.autograph);
  const relic = /\b(relic|patch|jersey)\b/i.test(seedText) || Boolean(existing.relic);

  if (rookie) confidenceScore += 4;
  if (autograph) confidenceScore += 4;
  if (relic) confidenceScore += 4;

  return {
    seedText,
    year,
    brand,
    setName,
    playerCard,
    cardNumber,
    parallel,
    serialNumber,
    team,
    grade,
    rookie,
    autograph,
    relic,
    confidenceScore,
    evidence,
  };
}

function buildSearchPlans(parsed: ParsedCard, existing: IdentifyPayload["existing"]) {
  const plans: Array<
    ParsedCard & {
      id: string;
      query: string;
      baseScore: number;
      notes: string[];
    }
  > = [];

  const exactQuery = buildQuery([
    parsed.year,
    parsed.brand,
    parsed.setName,
    parsed.playerCard,
    parsed.cardNumber ? `#${parsed.cardNumber}` : "",
    parsed.parallel,
    parsed.grade,
    parsed.rookie ? "rookie" : "",
  ]);

  if (exactQuery) {
    plans.push({
      ...parsed,
      id: "exact",
      query: exactQuery,
      baseScore: parsed.confidenceScore + 25,
      notes: ["Exact OCR/typed-field match search"],
    });
  }

  const broadQuery = buildQuery([
    parsed.year,
    parsed.brand,
    parsed.setName,
    parsed.playerCard,
    parsed.cardNumber ? `#${parsed.cardNumber}` : "",
  ]);

  if (broadQuery && broadQuery !== exactQuery) {
    plans.push({
      ...parsed,
      id: "broad",
      query: broadQuery,
      baseScore: parsed.confidenceScore + 15,
      notes: ["Broader card identity search"],
    });
  }

  const playerSetQuery = buildQuery([
    parsed.year,
    parsed.playerCard,
    parsed.brand,
    parsed.setName,
  ]);

  if (playerSetQuery && playerSetQuery !== exactQuery && playerSetQuery !== broadQuery) {
    plans.push({
      ...parsed,
      id: "player-set",
      query: playerSetQuery,
      baseScore: parsed.confidenceScore + 8,
      notes: ["Player + set fallback search"],
    });
  }

  if (!plans.length && existing) {
    const fallbackParsed: ParsedCard = {
      ...parsed,
      playerCard: cleanText(existing.playerCard),
      year: cleanText(existing.year),
      brand: cleanText(existing.brand),
      setName: cleanText(existing.setName),
      cardNumber: cleanText(existing.cardNumber),
      parallel: cleanText(existing.parallel),
      serialNumber: cleanText(existing.serialNumber),
      team: cleanText(existing.team),
      grade: cleanText(existing.grade),
      rookie: Boolean(existing.rookie),
      autograph: Boolean(existing.autograph),
      relic: Boolean(existing.relic),
    };

    const fallbackQuery = buildQuery([
      fallbackParsed.year,
      fallbackParsed.brand,
      fallbackParsed.setName,
      fallbackParsed.playerCard,
      fallbackParsed.cardNumber ? `#${fallbackParsed.cardNumber}` : "",
    ]);

    if (fallbackQuery) {
      plans.push({
        ...fallbackParsed,
        id: "existing-fallback",
        query: fallbackQuery,
        baseScore: 20,
        notes: ["Existing form fields fallback search"],
      });
    }
  }

  return plans.slice(0, 4);
}

async function fetchComps(
  origin: string,
  query: string,
  card: {
    year?: string;
    brand?: string;
    setName?: string;
    playerName?: string;
    cardNumber?: string;
    parallel?: string;
    grade?: string;
    rookie?: boolean;
  }
): Promise<CompsRouteResult | null> {
  try {
    const response = await fetch(`${origin}/api/comps/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        card,
      }),
      cache: "no-store",
    });

    const json = (await response.json().catch(() => null)) as CompsRouteResult | null;
    return json;
  } catch {
    return null;
  }
}

function buildDetails(input: {
  brand?: string;
  setName?: string;
  parallel?: string;
  serialNumber?: string;
  rookie?: boolean;
  autograph?: boolean;
  relic?: boolean;
}) {
  return [
    input.brand,
    input.setName,
    input.parallel,
    input.serialNumber,
    input.rookie ? "RC" : "",
    input.autograph ? "Auto" : "",
    input.relic ? "Relic" : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function dedupeCandidates(candidates: Candidate[]) {
  const seen = new Set<string>();
  const out: Candidate[] = [];

  for (const candidate of candidates) {
    const key = [
      cleanText(candidate.playerCard),
      cleanText(candidate.year),
      cleanText(candidate.brand),
      cleanText(candidate.setName),
      cleanText(candidate.cardNumber),
      cleanText(candidate.parallel),
    ]
      .filter(Boolean)
      .join("|")
      .toLowerCase();

    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }

  return out;
}

function buildQuery(parts: Array<string | undefined | null>) {
  return parts
    .map((part) => cleanText(part))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function cleanText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectPattern(text: string, patterns: string[]) {
  const lower = text.toLowerCase();

  for (const pattern of patterns) {
    if (lower.includes(pattern.toLowerCase())) {
      return toTitle(pattern);
    }
  }

  return "";
}

function detectTeam(text: string) {
  const lower = text.toLowerCase();

  for (const [key, value] of Object.entries(TEAM_PATTERNS)) {
    if (lower.includes(key)) return value;
  }

  return "";
}

function detectPlayer(text: string) {
  const lower = text.toLowerCase();

  for (const player of PLAYER_ALIASES) {
    if (lower.includes(player.name.toLowerCase())) {
      return { name: player.name, confidence: "high" as const };
    }
  }

  for (const player of PLAYER_ALIASES) {
    for (const alias of player.aliases) {
      if (lower.includes(alias.toLowerCase())) {
        return {
          name: player.name,
          confidence: alias.includes(" ") ? ("medium" as const) : ("low" as const),
        };
      }
    }
  }

  return { name: "", confidence: "low" as const };
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }
  return "";
}

function toTitle(str: string) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function scoreToConfidence(score: number) {
  if (score >= 80) return "high";
  if (score >= 45) return "medium";
  return "low";
}

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