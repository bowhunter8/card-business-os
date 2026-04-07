import { NextRequest, NextResponse } from "next/server";

type MatchInput = {
  id?: string;
  title?: string;
  price?: number | null;
  shipping?: number | null;
  total?: number | null;
  sold?: boolean;
  matchScore?: number | null;
};

type PricePayload = {
  matches?: MatchInput[];
};

type PriceResult = {
  acceptedCount: number;
  low: number | null;
  high: number | null;
  averagePrice: number | null;
  medianPrice: number | null;
  suggestedListPrice: number | null;
  confidence: "low" | "medium" | "high";
  notes: string[];
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as PricePayload;
    const matches = Array.isArray(body.matches) ? body.matches : [];

    const accepted = matches
      .filter((match) => match && (match.sold ?? true))
      .map((match) => {
        const total =
          toFiniteNumber(match.total) ??
          ((toFiniteNumber(match.price) || 0) + (toFiniteNumber(match.shipping) || 0));

        return {
          ...match,
          total,
          matchScore: toFiniteNumber(match.matchScore) ?? 0,
        };
      })
      .filter((match) => match.total != null && match.total > 0);

    if (accepted.length === 0) {
      return NextResponse.json({
        ok: false,
        result: {
          acceptedCount: 0,
          low: null,
          high: null,
          averagePrice: null,
          medianPrice: null,
          suggestedListPrice: null,
          confidence: "low",
          notes: ["No accepted matches were sent for pricing."],
        } satisfies PriceResult,
      });
    }

    const totals = accepted
      .map((match) => match.total as number)
      .sort((a, b) => a - b);

    const low = totals[0];
    const high = totals[totals.length - 1];
    const averagePrice = round2(totals.reduce((sum, value) => sum + value, 0) / totals.length);
    const medianPrice = round2(computeMedian(totals));
    const avgScore =
      accepted.reduce((sum, match) => sum + (match.matchScore || 0), 0) / accepted.length;

    let suggestedListPrice = round2(medianPrice * 1.08);
    const notes: string[] = [];

    if (accepted.length >= 6 && avgScore >= 0.55) {
      suggestedListPrice = round2(medianPrice * 1.06);
      notes.push("Strong sample with good title alignment.");
    } else if (accepted.length >= 3) {
      suggestedListPrice = round2(((medianPrice * 0.75) + (averagePrice * 0.25)) * 1.08);
      notes.push("Moderate sample size. Suggested list price blends median and average.");
    } else {
      suggestedListPrice = round2(averagePrice * 1.12);
      notes.push("Small sample size. Use the result cautiously.");
    }

    if (accepted.length < 3) {
      notes.push("Review the selected titles manually before buying or listing.");
    }

    const confidence: "low" | "medium" | "high" =
      accepted.length >= 6 && avgScore >= 0.55
        ? "high"
        : accepted.length >= 3
          ? "medium"
          : "low";

    const result: PriceResult = {
      acceptedCount: accepted.length,
      low: round2(low),
      high: round2(high),
      averagePrice,
      medianPrice,
      suggestedListPrice,
      confidence,
      notes,
    };

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error("Comp pricing route error:", error);

    return NextResponse.json(
      {
        ok: false,
        result: {
          acceptedCount: 0,
          low: null,
          high: null,
          averagePrice: null,
          medianPrice: null,
          suggestedListPrice: null,
          confidence: "low",
          notes: [
            error instanceof Error
              ? error.message
              : "Unexpected pricing route error.",
          ],
        } satisfies PriceResult,
      },
      { status: 500 }
    );
  }
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

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;

  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}