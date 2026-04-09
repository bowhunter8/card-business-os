import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase environment variables for checklist search."
    );
  }

  return createClient(url, serviceRoleKey);
}

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

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((x) => x.trim())
    .filter((x) => x.length >= 2);
}

function extractYear(value: string): number | null {
  const match = value.match(/\b(19[5-9]\d|20[0-4]\d|2050)\b/);
  return match ? Number(match[1]) : null;
}

function extractCardNumber(value: string): string | null {
  const patterns = [
    /(?:card\s*#|no\.?\s*|number\s*|#)\s*([A-Z0-9\-\/]{1,12})\b/i,
    /\b([A-Z]{0,4}\d{1,4}[A-Z]{0,4})\b/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      const cleaned = cleanCardNumber(match[1]);
      if (cleaned) return cleaned;
    }
  }

  return null;
}

type SearchRequest = {
  q?: string;
  year?: number | string | null;
  set?: string | null;
  playerName?: string | null;
  cardNumber?: string | null;
  team?: string | null;
  sport?: string | null;
  limit?: number | null;
};

type CardRow = {
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

function scoreCard(
  card: CardRow,
  params: {
    q: string;
    year: number | null;
    set: string;
    playerName: string;
    cardNumber: string;
    team: string;
  }
) {
  let score = 0;
  const reasons: string[] = [];

  const searchBlob = normalizeText(
    [
      card.player_name,
      card.brand,
      card.set_name,
      card.subset,
      card.team,
      card.card_number,
      card.parallel,
      card.variation,
      ...(card.aliases ?? []),
    ]
      .filter(Boolean)
      .join(" ")
  );

  const tokens = tokenize(params.q);
  const cardPlayer = normalizeText(card.player_name);
  const cardSet = normalizeText(
    [card.brand, card.set_name, card.subset].filter(Boolean).join(" ")
  );
  const cardTeam = normalizeText(card.team);
  const cardNumber = cleanCardNumber(card.card_number);

  if (params.year && card.year === params.year) {
    score += 50;
    reasons.push("year");
  }

  if (params.set) {
    if (cardSet.includes(params.set)) {
      score += 60;
      reasons.push("set");
    }
  }

  if (params.playerName) {
    if (cardPlayer === params.playerName) {
      score += 100;
      reasons.push("exact player");
    } else if (
      cardPlayer.includes(params.playerName) ||
      params.playerName.includes(cardPlayer)
    ) {
      score += 65;
      reasons.push("player");
    }
  }

  if (params.cardNumber) {
    if (cardNumber === params.cardNumber) {
      score += 110;
      reasons.push("exact card #");
    } else if (cardNumber.includes(params.cardNumber)) {
      score += 35;
      reasons.push("partial card #");
    }
  }

  if (params.team) {
    if (cardTeam === params.team) {
      score += 20;
      reasons.push("team");
    } else if (cardTeam.includes(params.team)) {
      score += 10;
      reasons.push("partial team");
    }
  }

  let tokenHits = 0;
  for (const token of tokens) {
    if (searchBlob.includes(token)) tokenHits += 1;
  }
  if (tokenHits > 0) {
    score += Math.min(tokenHits * 8, 40);
    reasons.push(`tokens:${tokenHits}`);
  }

  if (card.rookie_flag && /\brc\b|\brookie\b/.test(params.q)) score += 10;
  if (card.autograph_flag && /\bauto\b|\bautograph\b/.test(params.q)) score += 10;
  if (card.relic_flag && /\brelic\b|\bpatch\b|\bjersey\b/.test(params.q)) score += 10;

  return { score, reasons };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient();
    const body = (await req.json()) as SearchRequest;

    const q = (body.q ?? "").trim();
    const explicitYear = body.year ? Number(body.year) : null;
    const parsedYear = explicitYear ?? extractYear(q);
    const parsedCardNumber = cleanCardNumber(
      body.cardNumber || extractCardNumber(q) || ""
    );
    const parsedSet = normalizeText(body.set || "");
    const parsedPlayer = normalizeText(body.playerName || "");
    const parsedTeam = normalizeText(body.team || "");
    const parsedSport = normalizeText(body.sport || "baseball");
    const limit = Math.max(1, Math.min(Number(body.limit ?? 20), 50));

    let query = supabase.from("checklist_cards").select("*").limit(300);

    if (parsedSport) {
      query = query.eq("normalized_sport", parsedSport);
    }

    if (parsedYear) {
      query = query.eq("year", parsedYear);
    }

    if (parsedSet) {
      query = query.ilike("normalized_set_name", `%${parsedSet}%`);
    }

    if (parsedPlayer) {
      query = query.ilike("normalized_player_name", `%${parsedPlayer}%`);
    }

    if (parsedCardNumber) {
      query = query.eq("normalized_card_number", parsedCardNumber);
    }

    if (parsedTeam) {
      query = query.ilike("normalized_team", `%${parsedTeam}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let pool = (data ?? []) as CardRow[];

    if (pool.length < 10) {
      let fallback = supabase.from("checklist_cards").select("*").limit(400);

      if (parsedSport) fallback = fallback.eq("normalized_sport", parsedSport);
      if (parsedYear) fallback = fallback.eq("year", parsedYear);

      const { data: fallbackData } = await fallback;

      if (fallbackData?.length) {
        const map = new Map<string, CardRow>();
        [...pool, ...(fallbackData as CardRow[])].forEach((row) =>
          map.set(row.id, row)
        );
        pool = [...map.values()];
      }
    }

    const scored = pool
      .map((card) => {
        const { score, reasons } = scoreCard(card, {
          q: normalizeText(q),
          year: parsedYear,
          set: parsedSet,
          playerName: parsedPlayer,
          cardNumber: parsedCardNumber,
          team: parsedTeam,
        });
        return { ...card, score, reasons };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return NextResponse.json({
      ok: true,
      query: {
        q,
        year: parsedYear,
        set: body.set ?? null,
        playerName: body.playerName ?? null,
        cardNumber: parsedCardNumber || null,
        team: body.team ?? null,
        sport: body.sport ?? "baseball",
      },
      results: scored,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Unknown checklist search error",
      },
      { status: 500 }
    );
  }
}