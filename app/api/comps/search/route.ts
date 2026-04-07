import { NextRequest, NextResponse } from "next/server";

type SearchPayload = {
  q?: string;
  query?: string;
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
  card?: {
    year?: string | number;
    brand?: string;
    setName?: string;
    playerName?: string;
    player_name?: string;
    cardNumber?: string;
    card_number?: string;
    parallel?: string;
    grade?: string;
    rookie?: boolean;
    subset?: string;
  };
};

type NormalizedSearchInput = {
  q?: string;
  year?: string;
  setName?: string;
  playerName?: string;
  cardNumber?: string;
  parallel?: string;
  grade?: string;
  brand?: string;
  subset?: string;
  rookie?: boolean;
  limit: number;
};

type ScrapedListing = {
  id: string;
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
  matchScore: number;
  reason: string[];
  sold: boolean;
};

type SearchMatch = {
  id: string;
  title: string;
  imageUrl: string | null;
  itemUrl: string | null;
  source: "ebay";
  price: number | null;
  shipping: number | null;
  total: number | null;
  sold: boolean;
  matchScore: number;
  reason: string[];
};

type QueryAttempt = {
  label: string;
  query: string;
  soldUrl: string;
  rawCount: number;
  acceptedCount: number;
  status: "ok" | "empty" | "error";
  warnings: string[];
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as SearchPayload;
    const input = normalizePayload(body);

    if (!hasEnoughToSearch(input)) {
      return NextResponse.json(
        {
          ok: false,
          warnings: ["Not enough card details to search matches yet."],
          matches: [],
          debug: {
            receivedKeys: Object.keys(body || {}),
            normalizedInput: input,
          },
        },
        { status: 400 }
      );
    }

    const searchPlan = buildSearchPlan(input);
    const attempts: QueryAttempt[] = [];
    let mergedRaw: ScrapedListing[] = [];
    let lastHtmlSample = "";
    let lastPageSignals: string[] = [];

    for (const plan of searchPlan) {
      const soldUrl = buildEbaySoldUrl(plan.query);

      try {
        const response = await fetch(soldUrl, {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
          cache: "no-store",
        });

        const html = await response.text();
        lastHtmlSample = sanitizeHtmlSample(html);
        lastPageSignals = detectPageSignals(html);

        if (!response.ok) {
          attempts.push({
            label: plan.label,
            query: plan.query,
            soldUrl,
            rawCount: 0,
            acceptedCount: 0,
            status: "error",
            warnings: [`eBay page request failed with status ${response.status}.`],
          });
          continue;
        }

        const parsed = parseEbayHtml(html).slice(0, Math.max(input.limit * 2, 24));
        mergedRaw = dedupeListings([...mergedRaw, ...parsed]);

        const acceptedSoFar = filterAndScoreListings(mergedRaw, input);

        attempts.push({
          label: plan.label,
          query: plan.query,
          soldUrl,
          rawCount: parsed.length,
          acceptedCount: acceptedSoFar.length,
          status: parsed.length > 0 ? "ok" : "empty",
          warnings:
            parsed.length === 0
              ? [
                  "No sold results found for this search.",
                  ...lastPageSignals,
                ].filter(Boolean)
              : acceptedSoFar.length === 0
                ? ["Results found, but none were strong enough after filtering."]
                : [],
        });

        if (acceptedSoFar.length >= getEarlyStopTarget(input)) {
          break;
        }
      } catch (error) {
        attempts.push({
          label: plan.label,
          query: plan.query,
          soldUrl,
          rawCount: 0,
          acceptedCount: 0,
          status: "error",
          warnings: [
            error instanceof Error
              ? error.message
              : "Unexpected scrape error during this attempt.",
          ],
        });
      }
    }

    const filtered = filterAndScoreListings(mergedRaw, input).slice(0, input.limit);

    const warnings: string[] = [];

    if (mergedRaw.length === 0) {
      warnings.push("No sold listings found from the scraped searches.");
      warnings.push(...lastPageSignals);
    } else if (filtered.length === 0) {
      warnings.push("Searches found results, but none were close enough to trust.");
    } else if (filtered.length < mergedRaw.length) {
      warnings.push("Some weak, duplicate, or outlier matches were filtered out.");
    }

    if (filtered.length > 0 && filtered.length < 3) {
      warnings.push("Very small match sample. Review manually before trusting pricing.");
    }

    if (attempts.length > 1 && filtered.length > 0) {
      const winningAttempt = attempts.find((attempt) => attempt.acceptedCount > 0);
      if (winningAttempt && winningAttempt.label !== "exact") {
        warnings.push(`Fallback search was needed. Best results came from "${winningAttempt.label}".`);
      }
    }

    const matches: SearchMatch[] = filtered.map((item) => ({
      id: item.id,
      title: item.title,
      imageUrl: item.imageUrl,
      itemUrl: item.itemUrl,
      source: "ebay",
      price: item.price,
      shipping: item.shipping,
      total: item.total,
      sold: item.sold,
      matchScore: item.matchScore,
      reason: item.reason,
    }));

    return NextResponse.json({
      ok: true,
      provider: "ebay-html-search",
      query: searchPlan[0]?.query || "",
      soldUrl: buildEbaySoldUrl(searchPlan[0]?.query || ""),
      matches,
      warnings,
      attempts,
      debug: {
        normalizedInput: input,
        rawCount: mergedRaw.length,
        acceptedCount: filtered.length,
        searchPlan: searchPlan.map((item) => item.query),
        pageSignals: lastPageSignals,
        htmlSample: lastHtmlSample,
      },
    });
  } catch (error) {
    console.error("Match search route error:", error);

    return NextResponse.json(
      {
        ok: false,
        warnings: [
          error instanceof Error
            ? error.message
            : "Unexpected server error while searching matches.",
        ],
        matches: [],
      },
      { status: 500 }
    );
  }
}

function normalizePayload(body: SearchPayload): NormalizedSearchInput {
  const nested = body.card || {};

  const yearValue =
    body.year != null && String(body.year).trim()
      ? String(body.year).trim()
      : nested.year != null && String(nested.year).trim()
        ? String(nested.year).trim()
        : undefined;

  return {
    q: cleanText(body.q) || cleanText(body.query),
    year: yearValue,
    setName: cleanText(body.setName) || cleanText(nested.setName),
    playerName:
      cleanText(body.playerName) ||
      cleanText(nested.playerName) ||
      cleanText(nested.player_name),
    cardNumber:
      cleanText(body.cardNumber) ||
      cleanText(nested.cardNumber) ||
      cleanText(nested.card_number),
    parallel: cleanText(body.parallel) || cleanText(nested.parallel),
    grade: cleanText(body.grade) || cleanText(nested.grade),
    brand: cleanText(body.brand) || cleanText(nested.brand),
    subset: cleanText(body.subset) || cleanText(nested.subset),
    rookie:
      typeof body.rookie === "boolean"
        ? body.rookie
        : typeof nested.rookie === "boolean"
          ? nested.rookie
          : undefined,
    limit:
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? clamp(Math.floor(body.limit), 6, 30)
        : 18,
  };
}

function hasEnoughToSearch(input: NormalizedSearchInput): boolean {
  if (input.q) return true;

  const fields = [
    input.playerName,
    input.brand,
    input.setName,
    input.cardNumber,
    input.parallel,
    input.year,
  ].filter(Boolean);

  return fields.length >= 2 || Boolean(input.playerName && input.cardNumber);
}

function buildSearchPlan(
  input: NormalizedSearchInput
): Array<{ label: string; query: string }> {
  const exact = buildQueryFromParts([
    input.year,
    input.brand,
    input.setName,
    input.playerName,
    normalizedCardNumber(input.cardNumber),
    input.parallel,
    input.grade,
    normalizedRookieText(input.rookie),
  ]);

  const noGrade = buildQueryFromParts([
    input.year,
    input.brand,
    input.setName,
    input.playerName,
    normalizedCardNumber(input.cardNumber),
    input.parallel,
    normalizedRookieText(input.rookie),
  ]);

  const noParallel = buildQueryFromParts([
    input.year,
    input.brand,
    input.setName,
    input.playerName,
    normalizedCardNumber(input.cardNumber),
    input.grade,
  ]);

  const noGradeNoParallel = buildQueryFromParts([
    input.year,
    input.brand,
    input.setName,
    input.playerName,
    normalizedCardNumber(input.cardNumber),
    normalizedRookieText(input.rookie),
  ]);

  const noNumber = buildQueryFromParts([
    input.year,
    input.brand,
    input.setName,
    input.playerName,
    input.parallel,
    input.grade,
    normalizedRookieText(input.rookie),
  ]);

  const setPlayer = buildQueryFromParts([
    input.year,
    input.playerName,
    input.brand,
    input.setName,
  ]);

  const playerNumber = buildQueryFromParts([
    input.playerName,
    normalizedCardNumber(input.cardNumber),
  ]);

  const playerOnly = buildQueryFromParts([
    input.playerName,
    input.brand || input.setName,
  ]);

  const manual = input.q ? normalizeQuery(input.q) : "";

  const raw = [
    { label: "exact", query: exact },
    { label: "no-grade", query: noGrade },
    { label: "no-parallel", query: noParallel },
    { label: "no-grade-no-parallel", query: noGradeNoParallel },
    { label: "no-number", query: noNumber },
    { label: "set-player", query: setPlayer },
    { label: "player-number", query: playerNumber },
    { label: "player-only", query: playerOnly },
    ...(manual ? [{ label: "manual", query: manual }] : []),
  ];

  const seen = new Set<string>();

  return raw.filter((item) => {
    const q = normalizeQuery(item.query);
    if (!q || seen.has(q)) return false;
    seen.add(q);
    item.query = q;
    return true;
  });
}

function buildQueryFromParts(parts: Array<string | undefined>): string {
  return normalizeQuery(
    parts
      .map((part) => cleanText(part))
      .filter(Boolean)
      .join(" ")
  );
}

function normalizeQuery(value: string): string {
  return dedupeWords(
    value
      .replace(/\s+/g, " ")
      .replace(/\s+#\s*/g, " #")
      .trim()
  );
}

function normalizedCardNumber(cardNumber?: string): string | undefined {
  const raw = cleanText(cardNumber);
  if (!raw) return undefined;

  const stripped = raw.replace(/^#/, "").trim();
  return stripped ? `#${stripped}` : undefined;
}

function normalizedRookieText(rookie?: boolean): string | undefined {
  return rookie ? "rookie" : undefined;
}

function buildEbaySoldUrl(query: string): string {
  const url = new URL("https://www.ebay.com/sch/i.html");
  url.searchParams.set("_nkw", query);
  url.searchParams.set("LH_Sold", "1");
  url.searchParams.set("LH_Complete", "1");
  url.searchParams.set("rt", "nc");
  return url.toString();
}

function parseEbayHtml(html: string): ScrapedListing[] {
  const blocks = extractItemBlocks(html);
  const listings: ScrapedListing[] = [];

  for (const block of blocks) {
    const title =
      htmlDecode(
        firstMatch(block, /class="s-item__title"[^>]*>([\s\S]*?)<\/span>/i) ||
          firstMatch(block, /class="s-item__title"[^>]*>([\s\S]*?)<\/div>/i) ||
          firstMatch(block, /role="heading"[^>]*>([\s\S]*?)<\/div>/i) ||
          ""
      )?.trim() || "";

    if (!title) continue;
    if (/shop on ebay/i.test(title)) continue;

    const itemUrl =
      firstMatch(block, /class="s-item__link"[^>]*href="([^"]+)"/i) ||
      firstMatch(block, /<a[^>]+href="([^"]+)"[^>]*>/i) ||
      null;

    const imageUrl =
      firstMatch(block, /class="s-item__image-img"[^>]+src="([^"]+)"/i) ||
      firstMatch(block, /class="s-item__image-img"[^>]+data-src="([^"]+)"/i) ||
      firstMatch(block, /<img[^>]+src="([^"]+)"/i) ||
      null;

    const priceText =
      htmlDecode(
        firstMatch(block, /class="s-item__price"[^>]*>([\s\S]*?)<\/span>/i) ||
          ""
      ) || "";

    const shippingText =
      htmlDecode(
        firstMatch(block, /class="s-item__shipping[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ||
          firstMatch(block, /class="s-item__logisticsCost[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ||
          ""
      ) || "";

    const condition =
      htmlDecode(
        firstMatch(block, /class="SECONDARY_INFO"[^>]*>([\s\S]*?)<\/span>/i) ||
          firstMatch(block, /class="s-item__subtitle"[^>]*>([\s\S]*?)<\/span>/i) ||
          ""
      ) || null;

    const location =
      htmlDecode(
        firstMatch(block, /class="s-item__location"[^>]*>([\s\S]*?)<\/span>/i) || ""
      ) || null;

    const listingType =
      htmlDecode(
        firstMatch(block, /class="s-item__purchase-options-with-icon"[^>]*>([\s\S]*?)<\/span>/i) ||
          ""
      ) || null;

    const endTime =
      htmlDecode(
        firstMatch(block, /class="s-item__ended-date"[^>]*>([\s\S]*?)<\/span>/i) ||
          firstMatch(block, /class="POSITIVE"[^>]*>([\s\S]*?)<\/span>/i) ||
          ""
      ) || null;

    const price = parseMoneyValue(priceText);
    const shipping = parseShippingValue(shippingText);
    const total = round2(price + shipping);

    if (price <= 0 || total <= 0) continue;

    const id = itemUrl
      ? `ebay-${stableId(itemUrl)}`
      : `ebay-${stableId(`${title}|${price}|${shipping}`)}`;

    listings.push({
      id,
      title,
      itemUrl,
      imageUrl,
      condition,
      listingType,
      endTime,
      price,
      shipping,
      total,
      currency: "USD",
      location,
      matchScore: 0,
      reason: [],
      sold: true,
    });
  }

  return listings;
}

function extractItemBlocks(html: string): string[] {
  const patterns = [
    '<li class="s-item',
    '<div class="s-item__wrapper',
    '<div class="srp-results srp-list clearfix',
  ];

  for (const pattern of patterns) {
    const parts = html.split(pattern);
    if (parts.length > 1) {
      return parts.slice(1).map((part) => pattern + part).slice(0, 80);
    }
  }

  return [];
}

function detectPageSignals(html: string): string[] {
  const signals: string[] = [];
  const lower = html.toLowerCase();

  if (lower.includes("verify you are a human")) signals.push("eBay may be returning a human verification page.");
  if (lower.includes("puzzle") && lower.includes("security")) signals.push("eBay security page detected.");
  if (lower.includes("robot") || lower.includes("automated access")) signals.push("Possible anti-bot response detected.");
  if (lower.includes("sign in to check out")) signals.push("Returned page may not be a normal sold-results page.");
  if (lower.includes("_nkw") && lower.includes("ebay") && !lower.includes("s-item")) {
    signals.push("Search page loaded, but expected listing markup was not found.");
  }

  return signals;
}

function sanitizeHtmlSample(html: string): string {
  return html
    .replace(/\s+/g, " ")
    .replace(/></g, "> <")
    .slice(0, 1200);
}

function filterAndScoreListings(
  listings: ScrapedListing[],
  input: NormalizedSearchInput
): ScrapedListing[] {
  const deduped = dedupeListings(listings);

  const scored = deduped
    .map((listing) => {
      const scoredInfo = scoreTitleAgainstCard(listing.title, input);

      return {
        ...listing,
        matchScore: scoredInfo.score,
        reason: scoredInfo.reasons,
      };
    })
    .filter((listing) => listing.title && listing.total > 0)
    .filter((listing) => !isBadCompTitle(listing.title, input));

  const kept = scored
    .filter((listing) => listing.matchScore >= getMinimumConfidence(input))
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return a.total - b.total;
    });

  if (kept.length <= 3) return kept;

  const totals = kept.map((listing) => listing.total).sort((a, b) => a - b);
  const q1 = quantile(totals, 0.25);
  const q3 = quantile(totals, 0.75);
  const iqr = q3 - q1;
  const lower = q1 - iqr * 2.0;
  const upper = q3 + iqr * 2.0;

  const trimmed = kept.filter((listing) => listing.total >= lower && listing.total <= upper);
  return trimmed.length >= 2 ? trimmed : kept;
}

function scoreTitleAgainstCard(
  title: string,
  input: NormalizedSearchInput
): { score: number; reasons: string[] } {
  const normalized = normalizeForMatch(title);
  const compact = compactForMatch(title);

  let score = 0.08;
  const reasons: string[] = [];

  if (input.playerName) {
    const playerWords = splitWords(input.playerName);
    const matchedWords = playerWords.filter((word) =>
      hasLooseWord(normalized, compact, word)
    );

    if (playerWords.length > 0) {
      score += (matchedWords.length / playerWords.length) * 0.5;
    }

    if (matchedWords.length > 0) reasons.push("player match");
    if (matchesExactPhrase(normalized, input.playerName)) {
      score += 0.08;
      reasons.push("exact player phrase");
    }
  }

  if (input.year && hasLooseWord(normalized, compact, input.year)) {
    score += 0.06;
    reasons.push("year");
  }

  if (input.brand && matchesExactPhrase(normalized, input.brand)) {
    score += 0.08;
    reasons.push("brand");
  }

  if (input.setName && matchesExactPhrase(normalized, input.setName)) {
    score += 0.08;
    reasons.push("set");
  }

  if (input.subset && matchesExactPhrase(normalized, input.subset)) {
    score += 0.05;
    reasons.push("subset");
  }

  if (input.cardNumber && matchesCardNumber(title, input.cardNumber)) {
    score += 0.1;
    reasons.push("card number");
  }

  if (input.parallel && matchesParallel(normalized, input.parallel)) {
    score += 0.08;
    reasons.push("parallel");
  }

  if (input.grade && matchesGrade(normalized, input.grade)) {
    score += 0.06;
    reasons.push("grade");
  }

  if (input.rookie && /\b(rookie|rc)\b/i.test(title)) {
    score += 0.04;
    reasons.push("rookie");
  }

  if (/\bauto\b|\bautograph\b/i.test(title)) {
    reasons.push("auto mention");
  }

  if (/\blot\b|\bteam set\b|\bteam lot\b|\bcomplete set\b/i.test(title)) {
    score -= 0.3;
  }
  if (/\breprint\b|\bcustom\b|\bproxy\b|\bdigital\b/i.test(title)) {
    score -= 0.45;
  }
  if (/\bsealed\b|\bhobby box\b|\bjumbo box\b|\bblaster\b|\bpack\b|\bmega\b/i.test(title)) {
    score -= 0.35;
  }

  return {
    score: Math.max(0, Math.min(1, round3(score))),
    reasons: dedupeReasonList(reasons),
  };
}

function isBadCompTitle(title: string, input: NormalizedSearchInput): boolean {
  const normalized = normalizeForMatch(title);

  if (/\breprint\b|\bcustom\b|\bproxy\b|\bdigital\b|\bart card\b/i.test(title)) {
    return true;
  }

  if (/\bsealed\b|\bhobby box\b|\bjumbo box\b|\bblaster\b|\bpack\b|\bmega\b/i.test(title)) {
    return true;
  }

  if (/\blot\b|\bteam lot\b|\bcomplete set\b|\bset break\b|\bcase break\b|\bbox break\b/i.test(title)) {
    return true;
  }

  if (input.playerName) {
    const playerWords = splitWords(input.playerName);
    const matched = playerWords.filter((word) =>
      hasLooseWord(normalized, compactForMatch(title), word)
    ).length;

    if (playerWords.length >= 2 && matched === 0) {
      return true;
    }
  }

  return false;
}

function dedupeListings(listings: ScrapedListing[]): ScrapedListing[] {
  const seen = new Set<string>();
  const out: ScrapedListing[] = [];

  for (const listing of listings) {
    const key = [
      normalizeForMatch(listing.title),
      listing.total.toFixed(2),
      cleanText(listing.itemUrl || "") || "",
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(listing);
  }

  return out;
}

function getMinimumConfidence(input: NormalizedSearchInput): number {
  if (input.grade || input.parallel) return 0.24;
  if (input.playerName && input.cardNumber) return 0.2;
  if (input.playerName) return 0.16;
  return 0.12;
}

function getEarlyStopTarget(input: NormalizedSearchInput): number {
  if (input.grade || input.parallel) return 5;
  return 7;
}

function matchesParallel(normalizedTitle: string, parallel: string): boolean {
  const target = normalizeForMatch(parallel).trim();
  if (!target) return true;

  const synonyms: Record<string, string[]> = {
    refractor: ["refractor"],
    "gold refractor": ["gold refractor", "gold ref", "gold wave refractor"],
    "orange refractor": ["orange refractor", "orange ref"],
    "blue refractor": ["blue refractor", "blue ref"],
    "green refractor": ["green refractor", "green ref"],
    "red refractor": ["red refractor", "red ref"],
    "purple refractor": ["purple refractor", "purple ref"],
    xfractor: ["x-fractor", "xfractor"],
    "x-fractor": ["x-fractor", "xfractor"],
    holo: ["holo", "holoprizm", "holo prizm"],
    silver: ["silver", "prizm silver"],
  };

  const direct = synonyms[target] || [target];
  return direct.some(
    (term) =>
      normalizedTitle.includes(` ${term} `) || normalizedTitle.includes(term)
  );
}

function matchesGrade(normalizedTitle: string, grade: string): boolean {
  const target = normalizeForMatch(grade).trim();
  if (!target) return true;

  const plain = target.replace(/\s+/g, "");
  return (
    normalizedTitle.includes(target) ||
    normalizedTitle.replace(/\s+/g, "").includes(plain)
  );
}

function matchesCardNumber(title: string, cardNumber: string): boolean {
  const raw = cleanText(cardNumber)?.replace(/^#/, "");
  if (!raw) return true;

  const escaped = escapeRegExp(raw);
  const pattern = new RegExp(`(?:#|no\\.?\\s*)${escaped}\\b|\\b${escaped}\\b`, "i");
  return pattern.test(title);
}

function matchesExactPhrase(normalizedTitle: string, phrase: string): boolean {
  const target = normalizeForMatch(phrase).trim();
  return Boolean(
    (target && normalizedTitle.includes(` ${target} `)) ||
      normalizedTitle.includes(target)
  );
}

function splitWords(value: string): string[] {
  return normalizeForMatch(value).trim().split(" ").filter(Boolean);
}

function hasLooseWord(
  normalizedTitle: string,
  compactTitle: string,
  word: string
): boolean {
  const normalizedWord = normalizeForMatch(word).trim();
  if (!normalizedWord) return false;

  if (normalizedWord.includes(" ")) {
    return normalizedTitle.includes(normalizedWord);
  }

  return (
    normalizedTitle.includes(` ${normalizedWord} `) ||
    compactTitle.includes(normalizedWord)
  );
}

function normalizeForMatch(value: string): string {
  return ` ${value
    .toLowerCase()
    .replace(/[^a-z0-9#./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function compactForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseMoneyValue(text: string): number {
  if (!text) return 0;

  const cleaned = text.replace(/,/g, "");
  const matches = cleaned.match(/\$?\d+(?:\.\d{1,2})?/g);
  if (!matches || matches.length === 0) return 0;

  const values = matches
    .map((m) => safeNumber(m.replace("$", "")))
    .filter((n) => n > 0);

  if (values.length === 0) return 0;
  return round2(Math.min(...values));
}

function parseShippingValue(text: string): number {
  if (!text) return 0;
  if (/free/i.test(text)) return 0;

  const cleaned = text.replace(/,/g, "");
  const match = cleaned.match(/\$?\d+(?:\.\d{1,2})?/);
  if (!match) return 0;

  return round2(safeNumber(match[0].replace("$", "")));
}

function firstMatch(text: string, regex: RegExp): string | null {
  const match = text.match(regex);
  return match?.[1] ?? null;
}

function htmlDecode(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  const pos = (values.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;

  if (values[base + 1] !== undefined) {
    return values[base] + rest * (values[base + 1] - values[base]);
  }

  return values[base];
}

function cleanText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function dedupeWords(value: string): string {
  const words = value.split(" ").filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const word of words) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }

  return out.join(" ");
}

function dedupeReasonList(reasons: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const reason of reasons) {
    const key = reason.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(reason);
  }

  return out;
}

function safeNumber(value: string | number | undefined | null): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stableId(value: string): string {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}