import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createWorker } from "tesseract.js";

type IdentifyRequestBody = {
  imageBase64?: string | null;
  imageText?: string | null;
  sport?: string | null;
  year?: string | number | null;
  set?: string | null;
  playerName?: string | null;
  cardNumber?: string | null;
  team?: string | null;
  notes?: string | null;
  limit?: number | null;
};

type ChecklistCardRow = {
  id: string;
  sport: string | null;
  year: number | null;
  brand: string | null;
  set_name: string | null;
  subset: string | null;
  player_name: string | null;
  card_number: string | null;
  team: string | null;
  variation: string | null;
  parallel: string | null;
  rookie_flag: boolean | null;
  autograph_flag: boolean | null;
  relic_flag: boolean | null;
  serial_numbered: boolean | null;
  print_run: number | null;
  source_name: string | null;
  source_url: string | null;
  aliases: string[] | null;
  normalized_sport: string | null;
  normalized_brand: string | null;
  normalized_set_name: string | null;
  normalized_subset: string | null;
  normalized_player_name: string | null;
  normalized_card_number: string | null;
  normalized_team: string | null;
};

type IdentifyClues = {
  sport: string | null;
  year: number | null;
  set: string | null;
  playerName: string | null;
  cardNumber: string | null;
  team: string | null;
  notes: string | null;
  rawText: string;
  tokens: string[];
  flags: {
    rookie: boolean;
    autograph: boolean;
    relic: boolean;
    serialNumbered: boolean;
  };
};

type ScoredCandidate = ChecklistCardRow & {
  score: number;
  reasons: string[];
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9#/\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCardNumber(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toUpperCase()
    .replace(/NO\.?/g, "")
    .replace(/NUMBER/g, "")
    .replace(/CARD/g, "")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9\-\/#]/g, "")
    .replace(/^#/, "");
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  return unique(
    normalized
      .split(" ")
      .map((x) => x.trim())
      .filter((x) => x.length >= 2)
  );
}

function extractYear(text: string): number | null {
  const matches = text.match(/\b(19[5-9]\d|20[0-4]\d|2050)\b/g);
  if (!matches?.length) return null;

  // Prefer most recent realistic card year seen in text
  const years = matches
    .map((m) => Number(m))
    .filter((n) => n >= 1950 && n <= 2050);

  if (!years.length) return null;
  return years.sort((a, b) => b - a)[0];
}

function extractCardNumber(text: string): string | null {
  const patterns = [
    /(?:card\s*#|no\.?\s*|number\s*|#)\s*([A-Z0-9\-\/]{1,12})\b/i,
    /\b([A-Z]{0,4}\d{1,4}[A-Z]{0,4})\b/, // CHR44, US250, etc.
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const cleaned = cleanCardNumber(match[1]);
      if (cleaned) return cleaned;
    }
  }

  return null;
}

function detectFlags(text: string) {
  const normalized = normalizeText(text);
  return {
    rookie: /\brookie\b|\brc\b/.test(normalized),
    autograph: /\bauto\b|\bautograph\b|\bsigned\b/.test(normalized),
    relic:
      /\brelic\b|\bmemorabilia\b|\bjersey\b|\bpatch\b|\bbat\b/.test(normalized),
    serialNumbered:
      /\b\/\d{1,4}\b|\bserial numbered\b|\bnumbered\b/.test(normalized),
  };
}

function looksLikeBase64Image(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith("data:image/");
}

async function runOcrFromBase64Image(imageBase64: string): Promise<string> {
  const worker = await createWorker("eng");

  try {
    const { data } = await worker.recognize(imageBase64);
    return data.text || "";
  } finally {
    await worker.terminate();
  }
}

function chooseManualOverExtracted(
  manual: string | number | null | undefined,
  extracted: string | number | null | undefined
) {
  if (manual === null || manual === undefined) return extracted ?? null;
  if (typeof manual === "string" && manual.trim() === "") {
    return extracted ?? null;
  }
  return manual;
}

function buildClues(params: {
  manual: IdentifyRequestBody;
  rawOcrText: string;
}): IdentifyClues {
  const { manual, rawOcrText } = params;

  const mergedFreeText = [
    rawOcrText || "",
    manual.notes || "",
    manual.set || "",
    manual.playerName || "",
    manual.team || "",
    manual.cardNumber || "",
    manual.year ? String(manual.year) : "",
    manual.sport || "",
  ]
    .filter(Boolean)
    .join(" ");

  const extractedYear = extractYear(mergedFreeText);
  const extractedCardNumber = extractCardNumber(mergedFreeText);
  const flags = detectFlags(mergedFreeText);

  const yearValue = chooseManualOverExtracted(manual.year, extractedYear);
  const cardNumberValue = chooseManualOverExtracted(
    manual.cardNumber,
    extractedCardNumber
  );

  const setValue = chooseManualOverExtracted(manual.set, null);
  const playerValue = chooseManualOverExtracted(manual.playerName, null);
  const teamValue = chooseManualOverExtracted(manual.team, null);
  const sportValue = chooseManualOverExtracted(manual.sport, null);

  const rawText = mergedFreeText.trim();
  const tokens = tokenize(rawText);

  return {
    sport: sportValue ? String(sportValue).trim() : null,
    year: yearValue ? Number(yearValue) : null,
    set: setValue ? String(setValue).trim() : null,
    playerName: playerValue ? String(playerValue).trim() : null,
    cardNumber: cardNumberValue ? cleanCardNumber(String(cardNumberValue)) : null,
    team: teamValue ? String(teamValue).trim() : null,
    notes: manual.notes ? String(manual.notes).trim() : null,
    rawText,
    tokens,
    flags,
  };
}

async function fetchCandidatePool(clues: IdentifyClues): Promise<ChecklistCardRow[]> {
  const pools: ChecklistCardRow[] = [];

  // Pass 1: narrower search
  let query1 = supabase
    .from("checklist_cards")
    .select("*")
    .limit(150);

  if (clues.year) query1 = query1.eq("year", clues.year);
  if (clues.sport) query1 = query1.eq("normalized_sport", normalizeText(clues.sport));
  if (clues.cardNumber) {
    query1 = query1.eq("normalized_card_number", cleanCardNumber(clues.cardNumber));
  }
  if (clues.playerName) {
    query1 = query1.ilike("normalized_player_name", `%${normalizeText(clues.playerName)}%`);
  }
  if (clues.set) {
    query1 = query1.ilike("normalized_set_name", `%${normalizeText(clues.set)}%`);
  }

  const { data: data1, error: error1 } = await query1;
  if (error1) {
    console.error("Checklist query1 error:", error1);
  } else if (data1?.length) {
    pools.push(...data1);
  }

  // Pass 2: broader fallback if not enough results
  if (pools.length < 25) {
    let query2 = supabase
      .from("checklist_cards")
      .select("*")
      .limit(250);

    if (clues.year) query2 = query2.eq("year", clues.year);

    // If player present, lean on player strongly
    if (clues.playerName) {
      query2 = query2.ilike(
        "normalized_player_name",
        `%${normalizeText(clues.playerName)}%`
      );
    } else if (clues.team) {
      query2 = query2.ilike("normalized_team", `%${normalizeText(clues.team)}%`);
    }

    const { data: data2, error: error2 } = await query2;
    if (error2) {
      console.error("Checklist query2 error:", error2);
    } else if (data2?.length) {
      pools.push(...data2);
    }
  }

  // Pass 3: set-only fallback if user typed year+set and wants all cards for player/year/set
  if (pools.length < 25 && clues.year && clues.set) {
    let query3 = supabase
      .from("checklist_cards")
      .select("*")
      .eq("year", clues.year)
      .ilike("normalized_set_name", `%${normalizeText(clues.set)}%`)
      .limit(300);

    if (clues.playerName) {
      query3 = query3.ilike(
        "normalized_player_name",
        `%${normalizeText(clues.playerName)}%`
      );
    }

    const { data: data3, error: error3 } = await query3;
    if (error3) {
      console.error("Checklist query3 error:", error3);
    } else if (data3?.length) {
      pools.push(...data3);
    }
  }

  // Deduplicate by id
  const map = new Map<string, ChecklistCardRow>();
  for (const row of pools) {
    if (!row?.id) continue;
    if (!map.has(row.id)) map.set(row.id, row);
  }

  return [...map.values()];
}

function scoreCandidate(card: ChecklistCardRow, clues: IdentifyClues): ScoredCandidate {
  let score = 0;
  const reasons: string[] = [];

  const cardYear = card.year ?? null;
  const cardPlayer = normalizeText(card.player_name);
  const cardSet = normalizeText(card.set_name);
  const cardSubset = normalizeText(card.subset);
  const cardBrand = normalizeText(card.brand);
  const cardTeam = normalizeText(card.team);
  const cardNumber = cleanCardNumber(card.card_number);
  const aliases = (card.aliases ?? []).map(normalizeText);

  const queryPlayer = normalizeText(clues.playerName);
  const querySet = normalizeText(clues.set);
  const queryTeam = normalizeText(clues.team);
  const queryCardNumber = cleanCardNumber(clues.cardNumber);
  const rawTokens = clues.tokens;

  if (clues.year && cardYear === clues.year) {
    score += 40;
    reasons.push("Exact year match");
  } else if (clues.year && cardYear !== clues.year) {
    score -= 20;
  }

  if (queryCardNumber && cardNumber === queryCardNumber) {
    score += 80;
    reasons.push("Exact card number match");
  } else if (queryCardNumber && cardNumber && cardNumber.includes(queryCardNumber)) {
    score += 35;
    reasons.push("Partial card number match");
  }

  if (queryPlayer) {
    if (cardPlayer === queryPlayer) {
      score += 90;
      reasons.push("Exact player match");
    } else if (cardPlayer.includes(queryPlayer) || queryPlayer.includes(cardPlayer)) {
      score += 55;
      reasons.push("Partial player match");
    }
  }

  if (querySet) {
    const combinedSet = [cardBrand, cardSet, cardSubset].filter(Boolean).join(" ");
    const aliasHit = aliases.some((a) => a.includes(querySet) || querySet.includes(a));
    if (cardSet === querySet || combinedSet.includes(querySet)) {
      score += 70;
      reasons.push("Set match");
    } else if (aliasHit) {
      score += 50;
      reasons.push("Alias set match");
    }
  }

  if (queryTeam) {
    if (cardTeam === queryTeam) {
      score += 25;
      reasons.push("Exact team match");
    } else if (cardTeam.includes(queryTeam) || queryTeam.includes(cardTeam)) {
      score += 15;
      reasons.push("Partial team match");
    }
  }

  if (clues.flags.rookie && card.rookie_flag) {
    score += 12;
    reasons.push("Rookie indicator match");
  }
  if (clues.flags.autograph && card.autograph_flag) {
    score += 12;
    reasons.push("Autograph indicator match");
  }
  if (clues.flags.relic && card.relic_flag) {
    score += 12;
    reasons.push("Relic indicator match");
  }
  if (clues.flags.serialNumbered && card.serial_numbered) {
    score += 8;
    reasons.push("Serial-numbered indicator match");
  }

  // Token overlap
  const searchable = normalizeText(
    [
      card.player_name,
      card.brand,
      card.set_name,
      card.subset,
      card.team,
      card.card_number,
      card.variation,
      card.parallel,
      ...(card.aliases ?? []),
    ]
      .filter(Boolean)
      .join(" ")
  );

  let tokenHits = 0;
  for (const token of rawTokens) {
    if (token.length < 2) continue;
    if (searchable.includes(token)) tokenHits += 1;
  }

  if (tokenHits > 0) {
    score += Math.min(tokenHits * 4, 28);
    reasons.push(`Token overlap (${tokenHits})`);
  }

  // Slight bump for source quality
  if ((card.source_name ?? "").toLowerCase().includes("topps")) {
    score += 3;
  } else if ((card.source_name ?? "").toLowerCase().includes("beckett")) {
    score += 2;
  }

  return {
    ...card,
    score,
    reasons,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as IdentifyRequestBody;

    const limit = Math.max(1, Math.min(Number(body.limit ?? 25), 100));

    let ocrText = (body.imageText ?? "").trim();

    // OCR from image if no imageText already provided
    if (!ocrText && looksLikeBase64Image(body.imageBase64 ?? null)) {
      try {
        ocrText = await runOcrFromBase64Image(body.imageBase64!);
      } catch (ocrError) {
        console.error("OCR failed:", ocrError);
      }
    }

    const clues = buildClues({
      manual: body,
      rawOcrText: ocrText,
    });

    const candidatePool = await fetchCandidatePool(clues);

    const scored = candidatePool
      .map((card) => scoreCandidate(card, clues))
      .filter((card) => card.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const confidence =
      scored.length === 0
        ? "none"
        : scored[0].score >= 180
        ? "high"
        : scored[0].score >= 110
        ? "medium"
        : "low";

    return NextResponse.json({
      ok: true,
      confidence,
      query: {
        sport: body.sport ?? null,
        year: body.year ?? null,
        set: body.set ?? null,
        playerName: body.playerName ?? null,
        cardNumber: body.cardNumber ?? null,
        team: body.team ?? null,
        notes: body.notes ?? null,
        hasImage: Boolean(body.imageBase64),
        hasImageText: Boolean(body.imageText),
      },
      ocrText,
      clues,
      candidateCount: scored.length,
      candidates: scored.map((card) => ({
        id: card.id,
        score: card.score,
        reasons: card.reasons,
        sport: card.sport,
        year: card.year,
        brand: card.brand,
        set_name: card.set_name,
        subset: card.subset,
        player_name: card.player_name,
        card_number: card.card_number,
        team: card.team,
        variation: card.variation,
        parallel: card.parallel,
        rookie_flag: card.rookie_flag,
        autograph_flag: card.autograph_flag,
        relic_flag: card.relic_flag,
        serial_numbered: card.serial_numbered,
        print_run: card.print_run,
        source_name: card.source_name,
        source_url: card.source_url,
      })),
    });
  } catch (error) {
    console.error("Checklist identify route error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error in checklist identify route",
      },
      { status: 500 }
    );
  }
}