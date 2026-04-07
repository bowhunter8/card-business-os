import ExcelJS from "exceljs";

export type ChecklistCardInsert = {
  year: number | null;
  brand: string | null;
  set_name: string;
  subset_name: string | null;
  card_number: string;
  player_name: string;
  team_name: string | null;
  card_type: string | null;
  source_file: string | null;
  source_sheet: string | null;
  raw_text: string | null;
};

type ParsedResult = {
  totalRowsSeen: number;
  rows: ChecklistCardInsert[];
  errors: string[];
};

const TEAM_HINTS = [
  "angels",
  "astros",
  "athletics",
  "blue jays",
  "braves",
  "brewers",
  "cardinals",
  "cubs",
  "diamondbacks",
  "dodgers",
  "giants",
  "guardians",
  "mariners",
  "marlins",
  "mets",
  "nationals",
  "orioles",
  "padres",
  "phillies",
  "pirates",
  "rangers",
  "rays",
  "reds",
  "red sox",
  "rockies",
  "royals",
  "tigers",
  "twins",
  "white sox",
  "yankees",
  "team usa",
];

export async function parseChecklistFile(
  arrayBuffer: ArrayBuffer,
  fileName: string
): Promise<ParsedResult> {
  const ext = fileName.toLowerCase().split(".").pop();

  if (ext === "csv") {
    return parseCsvBuffer(arrayBuffer, fileName);
  }

  if (ext === "xlsx" || ext === "xlsm" || ext === "xltx" || ext === "xltm") {
    return parseExcelBuffer(arrayBuffer, fileName);
  }

  throw new Error(`Unsupported file type for "${fileName}". Use .xlsx or .csv`);
}

async function parseExcelBuffer(
  arrayBuffer: ArrayBuffer,
  fileName: string
): Promise<ParsedResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const rows: ChecklistCardInsert[] = [];
  const errors: string[] = [];
  let totalRowsSeen = 0;

  const meta = inferMetaFromFileName(fileName);

  for (const sheet of workbook.worksheets) {
    for (let rowNum = 1; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      const cells = trimTrailingEmpty(values.map(cellToString));

      if (!cells.some((x) => cleanCell(x))) continue;

      totalRowsSeen += 1;

      const parsed = parseAnyRow(cells, meta, fileName, sheet.name);
      if (parsed) rows.push(parsed);
    }
  }

  return {
    totalRowsSeen,
    rows: dedupeRows(rows),
    errors,
  };
}

function parseCsvBuffer(
  arrayBuffer: ArrayBuffer,
  fileName: string
): ParsedResult {
  const text = new TextDecoder("utf-8").decode(new Uint8Array(arrayBuffer));
  const lines = text.split(/\r?\n/);

  const rows: ChecklistCardInsert[] = [];
  const errors: string[] = [];
  const meta = inferMetaFromFileName(fileName);

  let totalRowsSeen = 0;

  for (const line of lines) {
    const cells = trimTrailingEmpty(parseCsvLine(line).map(cellToString));
    if (!cells.some((x) => cleanCell(x))) continue;

    totalRowsSeen += 1;

    const parsed = parseAnyRow(cells, meta, fileName, "CSV");
    if (parsed) rows.push(parsed);
  }

  return {
    totalRowsSeen,
    rows: dedupeRows(rows),
    errors,
  };
}

function parseAnyRow(
  rawCells: string[],
  meta: ReturnType<typeof inferMetaFromFileName>,
  fileName: string,
  sheetName: string
): ChecklistCardInsert | null {
  const cells = rawCells.map(cleanCell).filter(Boolean);
  if (!cells.length) return null;

  const joined = cells.join(" | ");
  if (shouldSkipRow(joined)) return null;

  // First try structured row parsing
  const structured = parseStructuredRow(cells, meta, fileName, sheetName);
  if (structured) return structured;

  // Then try looser text parsing
  const loose = parseLooseText(joined, meta, fileName, sheetName);
  if (loose) return loose;

  return null;
}

function parseStructuredRow(
  cells: string[],
  meta: ReturnType<typeof inferMetaFromFileName>,
  fileName: string,
  sheetName: string
): ChecklistCardInsert | null {
  const cardIndex = cells.findIndex(looksLikeCardNumber);
  if (cardIndex === -1) return null;

  let playerIndex = -1;
  let bestScore = -999;

  for (let i = 0; i < cells.length; i++) {
    if (i === cardIndex) continue;

    const score = scorePlayerCell(cells[i]) - Math.abs(i - cardIndex);
    if (score > bestScore) {
      bestScore = score;
      playerIndex = i;
    }
  }

  if (playerIndex === -1 || bestScore < 2) return null;

  const cardNumber = cleanCardNumber(cells[cardIndex]);
  const playerName = cleanPlayerName(cells[playerIndex]);

  if (!cardNumber || !playerName) return null;

  const teamName = findTeamInCells(cells, playerIndex);
  const typeText = buildTypeFromCells(cells, cardIndex, playerIndex, teamName);
  const split = splitTypeAndSubset(typeText);

  return {
    year: meta.year,
    brand: meta.brand,
    set_name: cleanText(meta.setName) || sheetName,
    subset_name: cleanText(split.subsetName) || cleanSubsetFromSheetName(sheetName),
    card_number: cardNumber,
    player_name: playerName,
    team_name: teamName,
    card_type: cleanText(split.cardType),
    source_file: fileName,
    source_sheet: sheetName,
    raw_text: cells.join(" | "),
  };
}

function parseLooseText(
  text: string,
  meta: ReturnType<typeof inferMetaFromFileName>,
  fileName: string,
  sheetName: string
): ChecklistCardInsert | null {
  const clean = cleanCell(text);
  if (!clean) return null;
  if (shouldSkipRow(clean)) return null;

  const cardMatch = clean.match(/\b#?([A-Z]{0,6}-?\d{1,4}[A-Z]?)\b/i);
  if (!cardMatch) return null;

  const cardNumber = cleanCardNumber(cardMatch[1]);
  const teamName = extractTeamFromText(clean);

  const playerCandidates = extractCandidatePhrases(clean)
    .filter((x) => !looksLikeCardNumber(x))
    .filter((x) => !looksLikeTeamName(x))
    .filter((x) => scorePlayerCell(x) >= 3);

  if (!playerCandidates.length) return null;

  playerCandidates.sort((a, b) => scorePlayerCell(b) - scorePlayerCell(a));
  const playerName = cleanPlayerName(playerCandidates[0]);
  if (!playerName) return null;

  const typeText = extractTypeText(clean, playerName, cardMatch[0], teamName);
  const split = splitTypeAndSubset(typeText);

  return {
    year: meta.year,
    brand: meta.brand,
    set_name: cleanText(meta.setName) || sheetName,
    subset_name: cleanText(split.subsetName) || cleanSubsetFromSheetName(sheetName),
    card_number: cardNumber,
    player_name: playerName,
    team_name: teamName,
    card_type: cleanText(split.cardType),
    source_file: fileName,
    source_sheet: sheetName,
    raw_text: clean,
  };
}

function findTeamInCells(cells: string[], playerIndex: number): string | null {
  const candidates = cells
    .map((cell, index) => ({ cell, index }))
    .filter(({ index }) => index !== playerIndex)
    .filter(({ cell }) => looksLikeTeamName(cell));

  if (!candidates.length) return null;

  candidates.sort(
    (a, b) => Math.abs(a.index - playerIndex) - Math.abs(b.index - playerIndex)
  );

  return cleanText(candidates[0].cell);
}

function buildTypeFromCells(
  cells: string[],
  cardIndex: number,
  playerIndex: number,
  teamName: string | null
): string | null {
  const pieces = cells.filter((cell, index) => {
    if (index === cardIndex || index === playerIndex) return false;
    if (teamName && cleanCell(cell).toLowerCase() === teamName.toLowerCase()) return false;
    if (looksLikeCardNumber(cell)) return false;
    if (looksLikeTeamName(cell)) return false;
    if (scorePlayerCell(cell) >= 4) return false;
    return true;
  });

  return pieces.length ? pieces.join(" - ") : null;
}

function extractTeamFromText(text: string): string | null {
  const lower = text.toLowerCase();

  for (const hint of TEAM_HINTS) {
    if (lower.includes(hint)) {
      return hint
        .split(" ")
        .map(capWord)
        .join(" ");
    }
  }

  return null;
}

function extractCandidatePhrases(text: string): string[] {
  const cleaned = text
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b(topps|bowman|panini|donruss|leaf|chrome|heritage|holiday|shoebox|t205|allen & ginter|allen and ginter|best|pro debut)\b/gi, " ")
    .replace(/\b#?[A-Z]{0,6}-?\d{1,4}[A-Z]?\b/gi, " ")
    .replace(/\b(rc|tc|sp|ssp|checklist|team card)\b/gi, " ")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const chunks = cleaned
    .split(/,|\/|\|| - /)
    .map((x) => x.trim())
    .filter(Boolean);

  const out = new Set<string>();

  for (const chunk of chunks) {
    out.add(chunk);

    const words = chunk.split(/\s+/).filter(Boolean);
    for (let len = 2; len <= 5; len++) {
      for (let i = 0; i + len <= words.length; i++) {
        out.add(words.slice(i, i + len).join(" "));
      }
    }
  }

  return [...out];
}

function extractTypeText(
  text: string,
  playerName: string,
  cardToken: string,
  teamName: string | null
): string | null {
  let value = ` ${text} `;

  value = value.replace(new RegExp(escapeRegex(playerName), "i"), " ");
  value = value.replace(new RegExp(escapeRegex(cardToken), "i"), " ");
  if (teamName) {
    value = value.replace(new RegExp(escapeRegex(teamName), "i"), " ");
  }

  value = value
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b(topps|bowman|panini|donruss|leaf)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return value || null;
}

function splitTypeAndSubset(value: string | null): {
  cardType: string | null;
  subsetName: string | null;
} {
  const raw = cleanText(value);
  if (!raw) return { cardType: null, subsetName: null };

  const parts = raw
    .split(/\s+-\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      cardType: parts[0],
      subsetName: parts.slice(1).join(" - "),
    };
  }

  return {
    cardType: raw,
    subsetName: null,
  };
}

function scorePlayerCell(value: string): number {
  const v = cleanCell(value).replace(/,+$/, "");
  if (!v) return -100;
  if (looksLikeCardNumber(v)) return -100;
  if (looksLikeTeamName(v)) return -60;
  if (shouldSkipRow(v)) return -60;

  let score = 0;
  const words = v.split(/\s+/).filter(Boolean);

  if (words.length >= 2 && words.length <= 5) score += 3;
  if (/^[A-Za-z0-9'().,\-\/& ]+$/.test(v)) score += 2;
  if (/[A-Za-z]/.test(v)) score += 1;
  if (/,$/.test(value.trim())) score += 1;

  return score;
}

function looksLikeCardNumber(value: string): boolean {
  const v = cleanCell(value).toUpperCase();

  return (
    /^\d{1,4}[A-Z]?$/.test(v) ||
    /^[A-Z]{1,8}-\d{1,4}[A-Z]?$/.test(v) ||
    /^\d{1,4}-\d{1,4}$/.test(v) ||
    /^#\d{1,4}[A-Z]?$/.test(v)
  );
}

function looksLikeTeamName(value: string): boolean {
  const v = cleanCell(value);
  if (!v) return false;
  if (looksLikeCardNumber(v)) return false;
  if (/^(rc|tc|sp|ssp|checklist|team card)$/i.test(v)) return false;

  const lower = v.toLowerCase();
  if (TEAM_HINTS.some((hint) => lower.includes(hint))) return true;

  const words = v.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 4 && /^[A-Za-z'().\-& ]+$/.test(v);
}

function shouldSkipRow(value: string): boolean {
  const v = cleanCell(value).toLowerCase();

  return (
    !v ||
    /subject to change|pack odds|autograph odds|print run|sell sheet|copyright|topps\.com|page \d+|continued/i.test(v)
  );
}

function inferMetaFromFileName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();

  const yearMatch = base.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? Number(yearMatch[0]) : null;

  let brand: string | null = null;
  if (/topps/i.test(base)) brand = "Topps";
  else if (/bowman/i.test(base)) brand = "Bowman";
  else if (/panini/i.test(base)) brand = "Panini";
  else if (/leaf/i.test(base)) brand = "Leaf";
  else if (/donruss/i.test(base)) brand = "Donruss";

  let setName = base;
  if (year) {
    setName = setName.replace(new RegExp(`\\b${year}\\b`, "i"), "").trim();
  }
  setName = setName.replace(/\bchecklist\b/gi, "").trim();
  setName = setName.replace(/\s+/g, " ").trim();

  return {
    year,
    brand,
    setName: setName || base,
  };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function cellToString(value: unknown): string {
  if (value == null) return "";

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    if ("text" in record) {
      return String(record.text ?? "").trim();
    }

    if ("result" in record) {
      return String(record.result ?? "").trim();
    }

    if ("richText" in record) {
      const richText = record.richText;
      if (Array.isArray(richText)) {
        return richText
          .map((part) =>
            typeof part === "object" && part !== null && "text" in part
              ? String((part as { text?: unknown }).text ?? "")
              : ""
          )
          .join("")
          .trim();
      }
    }
  }

  return String(value).trim();
}

function trimTrailingEmpty(row: string[]): string[] {
  const copy = [...row];
  while (copy.length && !cleanCell(copy[copy.length - 1])) {
    copy.pop();
  }
  return copy;
}

function cleanCell(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = String(value).replace(/\s+/g, " ").trim();
  return v || null;
}

function cleanPlayerName(value: string): string {
  return value.replace(/\s+/g, " ").replace(/,+$/, "").trim();
}

function cleanCardNumber(value: string): string {
  return value
    .replace(/^#/, "")
    .replace(/\s+/g, "")
    .replace(/,+$/, "")
    .trim()
    .toUpperCase();
}

function cleanSubsetFromSheetName(sheetName: string): string | null {
  const s = sheetName.trim();
  if (!s || /sheet\d+/i.test(s) || /^csv$/i.test(s)) return null;
  return s;
}

function dedupeRows(rows: ChecklistCardInsert[]): ChecklistCardInsert[] {
  const seen = new Set<string>();
  const result: ChecklistCardInsert[] = [];

  for (const row of rows) {
    if (!row.set_name || !row.card_number || !row.player_name) continue;

    const key = [
      row.year ?? "",
      row.brand ?? "",
      row.set_name ?? "",
      row.subset_name ?? "",
      row.card_number ?? "",
      row.player_name ?? "",
      row.team_name ?? "",
    ]
      .join("||")
      .toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }

  return result;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}