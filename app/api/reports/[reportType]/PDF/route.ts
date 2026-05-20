import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getExpenseScheduleCArea } from "@/lib/reports/expense-categories";
import {
  buildReportFilename,
  formatReportDate,
  jsonError,
  moneyString,
  pdfDownloadResponse,
  unauthorizedError,
} from "@/lib/reports/report-export-utils";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    reportType: string;
  }>;
};

type ReportPeriod = "day" | "week" | "month" | "quarter" | "year" | "custom";

type InventoryItemRow = {
  id: string;
  title?: string | null;
  item_name?: string | null;
  player_name?: string | null;
  year?: string | number | null;
  set_name?: string | null;
  card_number?: string | null;
  item_number?: string | null;
  status?: string | null;
  purchase_price?: number | string | null;
  cost?: number | string | null;
  allocated_cost?: number | string | null;
  quantity?: number | string | null;
  available_quantity?: number | string | null;
  unit_cost?: number | string | null;
  total_cost?: number | string | null;
  cost_basis_unit?: number | string | null;
  cost_basis_total?: number | string | null;
  estimated_value_total?: number | string | null;
  current_value?: number | string | null;
  estimated_value?: number | string | null;
  sale_price?: number | string | null;
  sold_price?: number | string | null;
  created_at?: string | null;
  acquired_at?: string | null;
  purchase_date?: string | null;
  date_added?: string | null;
  notes?: string | null;
};

type SaleRow = {
  id: string;
  sale_date: string | null;
  gross_sale: number | null;
  platform_fees: number | null;
  shipping_cost: number | null;
  other_costs: number | null;
  net_proceeds: number | null;
  cost_of_goods_sold: number | null;
  profit: number | null;
  platform: string | null;
  notes: string | null;
  inventory_item_id: string | null;
};

type SaleInventoryRow = {
  id: string;
  title: string | null;
  player_name: string | null;
  year: number | null;
  set_name: string | null;
  card_number: string | null;
  notes: string | null;
  status: string | null;
};

type ExpenseRow = {
  id: string;
  expense_date: string | null;
  category: string | null;
  vendor: string | null;
  amount: number | null;
  notes: string | null;
  created_at: string | null;
};

type BreakRow = {
  id: string;
  break_date: string | null;
  source_name: string | null;
  product_name: string | null;
  order_number: string | null;
  total_cost: number | null;
};

type FinancialInventoryRow = {
  id: string;
  title: string | null;
  player_name: string | null;
  year: number | string | null;
  set_name: string | null;
  card_number: string | null;
  notes: string | null;
  status: string | null;
  available_quantity: number | null;
  cost_basis_unit: number | null;
  cost_basis_total: number | null;
  estimated_value_total: number | null;
  quantity?: number | string | null;
  unit_cost?: number | string | null;
  total_cost?: number | string | null;
  allocated_cost?: number | string | null;
  purchase_price?: number | string | null;
  cost?: number | string | null;
  current_value?: number | string | null;
  estimated_value?: number | string | null;
  sale_price?: number | string | null;
  sold_price?: number | string | null;
};

type TaxYearSettingsRow = {
  beginning_inventory: number | null;
  ending_inventory_snapshot: number | null;
  ending_inventory_locked_at: string | null;
  business_use_of_home: number | null;
  vehicle_expense: number | null;
  depreciation_expense: number | null;
  legal_professional: number | null;
  insurance: number | null;
  utilities: number | null;
  taxes_licenses: number | null;
  repairs_maintenance: number | null;
  notes: string | null;
};

type FinancialAccount =
  | "all"
  | "sales"
  | "cogs"
  | "selling-costs"
  | "expenses"
  | "purchases"
  | "inventory"
  | "schedule-c";


type PdfLine = {
  label: string;
  type?: "title" | "section" | "main" | "sub" | "note" | "spacer";
};

type PdfTableColumn = {
  key: string;
  label: string;
  width: number;
  align?: "left" | "right";
};

type PdfTableRow = Record<string, string>;

type PdfTable = {
  type: "table";
  columns: PdfTableColumn[];
  rows: PdfTableRow[];
  emptyMessage: string;
};

type PdfSummaryGrid = {
  type: "summaryGrid";
  cards: { label: string; value: string }[];
};

type PdfElement = PdfLine | PdfTable | PdfSummaryGrid;

const REPORT_LABELS: Record<string, string> = {
  inventory: "Inventory Report",
  sales: "Sales Report",
  expenses: "Expenses Report",
  cogs: "Realized COGS Report",
  financial: "Financial Report",
  "sales-tax": "Sales Tax Report",
};

function asString(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;

  const numeric =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^0-9.-]/g, ""));

  return Number.isFinite(numeric) ? numeric : 0;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function normalizeStatus(status: string | null | undefined) {
  const clean = asString(status).trim();
  return clean || "unknown";
}

function getItemDate(item: InventoryItemRow) {
  return (
    item.acquired_at ||
    item.purchase_date ||
    item.date_added ||
    item.created_at ||
    null
  );
}

function getItemCost(item: InventoryItemRow) {
  const quantity = asNumber(item.quantity ?? item.available_quantity ?? 1);
  const costBasisTotal = asNumber(item.cost_basis_total);
  const totalCost = asNumber(item.total_cost);
  const allocatedCost = asNumber(item.allocated_cost);
  const costBasisUnit = asNumber(item.cost_basis_unit);
  const unitCost = asNumber(item.unit_cost);
  const purchasePrice = asNumber(item.purchase_price);
  const legacyCost = asNumber(item.cost);

  if (costBasisTotal > 0) return costBasisTotal;
  if (totalCost > 0) return totalCost;
  if (allocatedCost > 0) return allocatedCost;
  if (costBasisUnit > 0) return costBasisUnit * Math.max(quantity, 1);
  if (unitCost > 0) return unitCost * Math.max(quantity, 1);
  if (purchasePrice > 0) return purchasePrice;
  if (legacyCost > 0) return legacyCost;

  return 0;
}

function getItemValue(item: InventoryItemRow) {
  const estimatedValueTotal = asNumber(item.estimated_value_total);
  const currentValue = asNumber(item.current_value);
  const estimatedValue = asNumber(item.estimated_value);
  const salePrice = asNumber(item.sale_price);
  const soldPrice = asNumber(item.sold_price);

  if (estimatedValueTotal > 0) return estimatedValueTotal;
  if (currentValue > 0) return currentValue;
  if (estimatedValue > 0) return estimatedValue;
  if (salePrice > 0) return salePrice;
  if (soldPrice > 0) return soldPrice;

  return 0;
}

function getBaseItemName(item: InventoryItemRow) {
  return item.title || item.item_name || item.player_name || "Untitled item";
}

function getItemNumber(item: InventoryItemRow) {
  return asString(item.item_number || item.card_number);
}

function matchesSearch(item: InventoryItemRow, search: string) {
  if (!search) return true;

  const haystack = [
    item.title,
    item.item_name,
    item.player_name,
    item.year,
    item.set_name,
    item.card_number,
    item.item_number,
    item.status,
    item.notes,
  ]
    .map(asString)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

function matchesDateRange(
  item: InventoryItemRow,
  startDate: string,
  endDate: string,
) {
  const rawDate = getItemDate(item);
  if (!rawDate) return true;

  const itemDate = new Date(rawDate);
  if (Number.isNaN(itemDate.getTime())) return true;

  if (startDate) {
    const fromDate = new Date(`${startDate}T00:00:00`);
    if (!Number.isNaN(fromDate.getTime()) && itemDate < fromDate) return false;
  }

  if (endDate) {
    const toDate = new Date(`${endDate}T23:59:59`);
    if (!Number.isNaN(toDate.getTime()) && itemDate > toDate) return false;
  }

  return true;
}

function matchesValueFilter(item: InventoryItemRow, valueFilter: string) {
  if (!valueFilter || valueFilter === "all") return true;

  const value = getItemValue(item);

  if (valueFilter === "no-value") return value <= 0;
  if (valueFilter === "under-10") return value > 0 && value < 10;
  if (valueFilter === "10-50") return value >= 10 && value <= 50;
  if (valueFilter === "50-100") return value > 50 && value <= 100;
  if (valueFilter === "over-100") return value > 100;

  return true;
}

function getDaysHeld(item: InventoryItemRow) {
  const rawDate = getItemDate(item);
  if (!rawDate) return null;

  const itemDate = new Date(rawDate);
  if (Number.isNaN(itemDate.getTime())) return null;

  const now = new Date();
  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  return Math.max(0, Math.floor((now.getTime() - itemDate.getTime()) / millisecondsPerDay));
}

function matchesAgingFilter(item: InventoryItemRow, agingFilter: string) {
  if (!agingFilter || agingFilter === "all") return true;

  const daysHeld = getDaysHeld(item);
  if (daysHeld === null) return false;

  const minimumDays = Number(agingFilter);
  if (!Number.isFinite(minimumDays) || minimumDays <= 0) return true;

  return daysHeld >= minimumDays;
}

function getWorkflowAction(item: InventoryItemRow) {
  const status = normalizeStatus(item.status).toLowerCase();
  const value = getItemValue(item);
  const cost = getItemCost(item);
  const daysHeld = getDaysHeld(item);
  const notes = asString(item.notes).toLowerCase();

  if ((status === "available" || status === "listed") && cost <= 0) return "Missing Cost Basis";

  if (status === "available") {
    if (notes.includes("photo") || notes.includes("scan")) return "Needs Photos / Scan";
    if (value <= 0) return "Missing Estimated Value";
    if (daysHeld !== null && daysHeld >= 90) return "90+ Days Available";
    if (daysHeld !== null && daysHeld >= 30) return "30+ Days Available";
    return "Ready To List";
  }

  if (status === "listed") {
    if (daysHeld !== null && daysHeld >= 90) return "Listed 90+ Days";
    if (daysHeld !== null && daysHeld >= 30) return "Listed 30+ Days";
    return "Monitor Listing";
  }

  if (status === "personal") return "Personal Collection Review";
  if (status === "junk") return "Disposal Candidate";
  if (status === "disposed") return "Finalized Disposal";
  if (status === "sold") return "Sold";

  return "Review Status";
}

function matchesActionNeededFilter(item: InventoryItemRow, actionFilter: string) {
  if (!actionFilter || actionFilter === "all") return true;

  const status = normalizeStatus(item.status).toLowerCase();
  const value = getItemValue(item);
  const cost = getItemCost(item);
  const daysHeld = getDaysHeld(item);
  const notes = asString(item.notes).toLowerCase();
  const action = getWorkflowAction(item);

  if (actionFilter === "ready-to-list") return action === "Ready To List";
  if (actionFilter === "missing-cost") return (status === "available" || status === "listed") && cost <= 0;
  if (actionFilter === "missing-value") return value <= 0;
  if (actionFilter === "needs-photos") return notes.includes("photo") || notes.includes("scan");
  if (actionFilter === "available-30") return status === "available" && daysHeld !== null && daysHeld >= 30;
  if (actionFilter === "available-90") return status === "available" && daysHeld !== null && daysHeld >= 90;
  if (actionFilter === "listed-30") return status === "listed" && daysHeld !== null && daysHeld >= 30;
  if (actionFilter === "listed-90") return status === "listed" && daysHeld !== null && daysHeld >= 90;
  if (actionFilter === "pc-review") return status === "personal";
  if (actionFilter === "notes-review") return Boolean(asString(item.notes).trim());
  if (actionFilter === "disposal-candidate") return status === "junk" || action === "Disposal Candidate";

  if (actionFilter === "needed") {
    return (
      status === "unknown" ||
      status === "junk" ||
      cost <= 0 ||
      action === "Missing Cost Basis" ||
      action === "Needs Photos / Scan" ||
      action === "30+ Days Available" ||
      action === "90+ Days Available" ||
      action === "Listed 30+ Days" ||
      action === "Listed 90+ Days" ||
      action === "Review Status" ||
      action === "Personal Collection Review"
    );
  }

  return true;
}

function clampYear(raw?: string | null) {
  const currentYear = new Date().getFullYear();
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > currentYear + 1) {
    return currentYear;
  }

  return parsed;
}

function clampMonth(raw?: string | null) {
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) {
    return new Date().getMonth() + 1;
  }

  return parsed;
}

function clampQuarter(raw?: string | null) {
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 4) {
    return Math.floor(new Date().getMonth() / 3) + 1;
  }

  return parsed;
}

function normalizePeriod(raw?: string | null): ReportPeriod {
  if (raw === "daily" || raw === "day") return "day";
  if (raw === "weekly" || raw === "week") return "week";
  if (raw === "monthly" || raw === "month") return "month";
  if (raw === "quarterly" || raw === "quarter") return "quarter";
  if (raw === "yearly" || raw === "year") return "year";
  if (raw === "custom") return "custom";

  return "year";
}

function dateToInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseInputDate(value: string | undefined | null, fallback: Date) {
  if (!value) return fallback;

  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3) return fallback;

  const [year, month, day] = parts;
  if (!year || !month || !day) return fallback;

  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) return fallback;

  return date;
}

function getStartOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  result.setDate(result.getDate() + diff);

  return result;
}

function getEndOfWeek(date: Date) {
  const result = getStartOfWeek(date);

  result.setDate(result.getDate() + 6);

  return result;
}

function getSalesReportDateRange({
  selectedYear,
  period,
  start,
  end,
  month,
  quarter,
}: {
  selectedYear: number;
  period: ReportPeriod;
  start?: string | null;
  end?: string | null;
  month: number;
  quarter: number;
}) {
  const today = new Date();
  const defaultAnchor =
    selectedYear === today.getFullYear() ? today : new Date(selectedYear, 0, 1);

  if (period === "day") {
    const selectedDay = parseInputDate(start, defaultAnchor);

    return {
      startDate: dateToInputValue(selectedDay),
      endDate: dateToInputValue(selectedDay),
      label: `Daily Sales Report: ${dateToInputValue(selectedDay)}`,
    };
  }

  if (period === "week") {
    const selectedDay = parseInputDate(start, defaultAnchor);
    const weekStart = getStartOfWeek(selectedDay);
    const weekEnd = getEndOfWeek(selectedDay);

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      label: `Weekly Sales Report: ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    };
  }

  if (period === "month") {
    const monthStart = new Date(selectedYear, month - 1, 1);
    const monthEnd = new Date(selectedYear, month, 0);

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      label: `Monthly Sales Report: ${monthStart.toLocaleString("default", {
        month: "long",
      })} ${selectedYear}`,
    };
  }

  if (period === "quarter") {
    const quarterStartMonth = (quarter - 1) * 3;
    const quarterStart = new Date(selectedYear, quarterStartMonth, 1);
    const quarterEnd = new Date(selectedYear, quarterStartMonth + 3, 0);

    return {
      startDate: dateToInputValue(quarterStart),
      endDate: dateToInputValue(quarterEnd),
      label: `Quarterly Sales Report: Q${quarter} ${selectedYear}`,
    };
  }

  if (period === "custom") {
    const fallbackStart = new Date(selectedYear, 0, 1);
    const fallbackEnd = new Date(selectedYear, 11, 31);

    const customStart = parseInputDate(start, fallbackStart);
    const customEnd = parseInputDate(end, fallbackEnd);

    const normalizedStart =
      customStart.getTime() <= customEnd.getTime() ? customStart : customEnd;
    const normalizedEnd =
      customStart.getTime() <= customEnd.getTime() ? customEnd : customStart;

    return {
      startDate: dateToInputValue(normalizedStart),
      endDate: dateToInputValue(normalizedEnd),
      label: `Custom Sales Report: ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
    };
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
    label: `Yearly Sales Report: ${selectedYear}`,
  };
}

function getExpensesReportDateRange({
  selectedYear,
  period,
  start,
  end,
  month,
  quarter,
}: {
  selectedYear: number;
  period: ReportPeriod;
  start?: string | null;
  end?: string | null;
  month: number;
  quarter: number;
}) {
  const today = new Date();
  const defaultAnchor =
    selectedYear === today.getFullYear() ? today : new Date(selectedYear, 0, 1);

  if (period === "day") {
    const selectedDay = parseInputDate(start, defaultAnchor);

    return {
      startDate: dateToInputValue(selectedDay),
      endDate: dateToInputValue(selectedDay),
      label: `Daily Expenses Report ${dateToInputValue(selectedDay)}`,
    };
  }

  if (period === "week") {
    const selectedDay = parseInputDate(start, defaultAnchor);
    const weekStart = getStartOfWeek(selectedDay);
    const weekEnd = getEndOfWeek(selectedDay);

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      label: `Weekly Expenses Report ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    };
  }

  if (period === "month") {
    const monthStart = new Date(selectedYear, month - 1, 1);
    const monthEnd = new Date(selectedYear, month, 0);

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      label: `Monthly Expenses Report ${monthStart.toLocaleString("default", {
        month: "long",
      })} ${selectedYear}`,
    };
  }

  if (period === "quarter") {
    const quarterStartMonth = (quarter - 1) * 3;
    const quarterStart = new Date(selectedYear, quarterStartMonth, 1);
    const quarterEnd = new Date(selectedYear, quarterStartMonth + 3, 0);

    return {
      startDate: dateToInputValue(quarterStart),
      endDate: dateToInputValue(quarterEnd),
      label: `Quarterly Expenses Report Q${quarter} ${selectedYear}`,
    };
  }

  if (period === "custom") {
    const fallbackStart = new Date(selectedYear, 0, 1);
    const fallbackEnd = new Date(selectedYear, 11, 31);

    const customStart = parseInputDate(start, fallbackStart);
    const customEnd = parseInputDate(end, fallbackEnd);

    const normalizedStart =
      customStart.getTime() <= customEnd.getTime() ? customStart : customEnd;
    const normalizedEnd =
      customStart.getTime() <= customEnd.getTime() ? customEnd : customStart;

    return {
      startDate: dateToInputValue(normalizedStart),
      endDate: dateToInputValue(normalizedEnd),
      label: `Custom Expenses Report ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
    };
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
    label: `Yearly Expenses Report ${selectedYear}`,
  };
}

function buildSaleItemName(item: SaleInventoryRow | undefined) {
  if (!item) return "Unlinked sale";

  const parts = [
    item.year,
    item.set_name,
    item.player_name,
    item.card_number ? `#${item.card_number}` : null,
    item.notes,
  ];

  return parts.filter(Boolean).join(" • ") || item.title || "Untitled item";
}

function platformKey(value: string | null | undefined) {
  return String(value || "Unknown").trim() || "Unknown";
}

function pdfEscape(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/™/g, "\\231")
    .replace(/•/g, "\\225")
    .replace(/–/g, "\\226")
    .replace(/—/g, "\\227")
    .replace(/‘/g, "\\221")
    .replace(/’/g, "\\222")
    .replace(/“/g, "\\223")
    .replace(/”/g, "\\224")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ");
}

function formatDateForPdf(value: string | null | undefined) {
  if (!value) return "Unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toISOString().slice(0, 10);
}

function currency(value: number) {
  return `$${moneyString(value)}`;
}

function getDateRange(searchParams: URLSearchParams) {
  const startDate =
    searchParams.get("startDate") || searchParams.get("dateFrom") || "";
  const endDate =
    searchParams.get("endDate") || searchParams.get("dateTo") || "";

  if (startDate && endDate) {
    return `${formatReportDate(startDate)} to ${formatReportDate(endDate)}`;
  }

  if (startDate) {
    return `From ${formatReportDate(startDate)}`;
  }

  if (endDate) {
    return `Through ${formatReportDate(endDate)}`;
  }

  return "All dates";
}

function isTable(element: PdfElement): element is PdfTable {
  return "type" in element && element.type === "table";
}

function isSummaryGrid(element: PdfElement): element is PdfSummaryGrid {
  return "type" in element && element.type === "summaryGrid";
}

function buildPdf(elements: PdfElement[]) {
  const pageWidth = 792;
  const pageHeight = 612;
  const marginX = 34;
  const startY = 558;
  const bottomY = 42;
  const rightX = pageWidth - marginX;
  const contentWidth = rightX - marginX;

  const pages: string[] = [];
  let current = "";
  let y = startY;
  let pageNumber = 1;

  function addRaw(value: string) {
    current += value;
  }

  function getApproxTextWidth(text: string, size: number) {
    return String(text ?? "").length * size * 0.48;
  }

  function addText(
    text: string,
    x: number,
    textY: number,
    size = 8,
    bold = false,
  ) {
    addRaw(
      `0 0 0 rg BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${textY} Td (${pdfEscape(
        text,
      )}) Tj ET\n`,
    );
  }

  function addRightText(
    text: string,
    x: number,
    textY: number,
    size = 8,
    bold = false,
  ) {
    addText(text, x - getApproxTextWidth(text, size), textY, size, bold);
  }

  function addRule(ruleY: number) {
    addRaw(`0.78 0.80 0.84 RG ${marginX} ${ruleY} m ${rightX} ${ruleY} l S\n`);
  }

  function addLightRule(ruleY: number) {
    addRaw(`0.90 0.91 0.93 RG ${marginX} ${ruleY} m ${rightX} ${ruleY} l S\n`);
  }

  function addFill(
    x: number,
    fillY: number,
    width: number,
    height: number,
    shade = "0.94 0.96 0.99",
  ) {
    addRaw(`${shade} rg ${x} ${fillY} ${width} ${height} re f\n`);
  }

  function newPage() {
    if (current) {
      addText(`Page ${pageNumber}`, marginX, 24, 7, false);
      pages.push(current);
      pageNumber += 1;
    }

    current = "";
    y = startY;
  }

  function ensureSpace(heightNeeded: number) {
    if (y - heightNeeded < bottomY) {
      newPage();
    }
  }

  function truncateText(text: string, maxWidth: number, size: number) {
    const clean = String(text ?? "")
      .replace(/\s+/g, " ")
      .trim();

    if (getApproxTextWidth(clean, size) <= maxWidth) {
      return clean;
    }

    let result = clean;

    while (
      result.length > 0 &&
      getApproxTextWidth(`${result}...`, size) > maxWidth
    ) {
      result = result.slice(0, -1);
    }

    return result ? `${result}...` : "";
  }

  function wrapText(text: string, maxWidth: number, size: number) {
    const rawParts = String(text || "").split(/\r?\n/);
    const wrapped: string[] = [];

    for (const rawPart of rawParts) {
      const words = rawPart.trim().split(/\s+/).filter(Boolean);

      if (words.length === 0) {
        wrapped.push("");
        continue;
      }

      let line = "";

      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;

        if (line && getApproxTextWidth(candidate, size) > maxWidth) {
          wrapped.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }

      if (line) {
        wrapped.push(line);
      }
    }

    return wrapped;
  }

  function addWrappedText(
    text: string,
    x: number,
    textY: number,
    maxWidth: number,
    size = 8,
    bold = false,
    lineHeight = 10,
  ) {
    const wrappedLines = wrapText(text, maxWidth, size);

    wrappedLines.forEach((wrappedLine, index) => {
      addText(wrappedLine, x, textY - index * lineHeight, size, bold);
    });

    return wrappedLines.length;
  }

  function addLineElement(line: PdfLine) {
    const type = line.type ?? "main";

    if (type === "spacer") {
      ensureSpace(8);
      y -= 8;
      return;
    }

    if (type === "title") {
      const lineHeight = 18;
      const wrappedLineCount = wrapText(line.label, contentWidth, 18).length;
      ensureSpace(wrappedLineCount * lineHeight + 34);
      addWrappedText(
        line.label,
        marginX,
        y,
        contentWidth,
        18,
        true,
        lineHeight,
      );
      y -= wrappedLineCount * lineHeight;
      addRule(y);
      y -= 18;
      return;
    }

    if (type === "section") {
      ensureSpace(28);
      y -= 4;
      addFill(marginX, y - 5, contentWidth, 18);
      addWrappedText(
        line.label,
        marginX + 4,
        y,
        contentWidth - 8,
        10,
        true,
        12,
      );
      y -= 22;
      return;
    }

    if (type === "note") {
      const lineHeight = 9;
      const wrappedLineCount = wrapText(line.label, contentWidth, 7).length;
      ensureSpace(wrappedLineCount * lineHeight + 4);
      addWrappedText(
        line.label,
        marginX,
        y,
        contentWidth,
        7,
        false,
        lineHeight,
      );
      y -= wrappedLineCount * lineHeight + 3;
      return;
    }

    const isMain = type === "main";
    const labelX = type === "sub" ? marginX + 18 : marginX;
    const size = isMain ? 9 : 8;
    const lineHeight = isMain ? 11 : 10;
    const labelMaxWidth = rightX - labelX;
    const wrappedLineCount = wrapText(line.label, labelMaxWidth, size).length;
    const blockHeight =
      Math.max(1, wrappedLineCount) * lineHeight + (isMain ? 4 : 3);

    ensureSpace(blockHeight);
    addWrappedText(
      line.label,
      labelX,
      y,
      labelMaxWidth,
      size,
      isMain,
      lineHeight,
    );
    y -= blockHeight;
  }

  function addSummaryGrid(summary: PdfSummaryGrid) {
    const cardGap = 10;
    const cardCount = Math.max(1, summary.cards.length);
    const cardWidth = (contentWidth - cardGap * (cardCount - 1)) / cardCount;
    const cardHeight = 42;

    ensureSpace(cardHeight + 10);

    summary.cards.forEach((card, index) => {
      const x = marginX + index * (cardWidth + cardGap);
      addRaw(
        `0.98 0.98 0.99 rg ${x} ${y - cardHeight + 7} ${cardWidth} ${cardHeight} re f\n`,
      );
      addRaw(
        `0.82 0.84 0.87 RG ${x} ${y - cardHeight + 7} ${cardWidth} ${cardHeight} re S\n`,
      );
      addText(card.label, x + 7, y - 8, 7, true);
      addText(card.value, x + 7, y - 26, 13, true);
    });

    y -= cardHeight + 12;
  }

  function addTableHeader(table: PdfTable) {
    const headerHeight = 18;
    addFill(
      marginX,
      y - headerHeight + 5,
      contentWidth,
      headerHeight,
      "0.93 0.95 0.98",
    );

    let x = marginX;

    table.columns.forEach((column) => {
      const label = truncateText(column.label, column.width - 6, 7);
      if (column.align === "right") {
        addRightText(label, x + column.width - 4, y - 7, 7, true);
      } else {
        addText(label, x + 3, y - 7, 7, true);
      }
      x += column.width;
    });

    y -= headerHeight;
    addLightRule(y + 5);
  }

  function addTable(table: PdfTable) {
    if (table.rows.length === 0) {
      addLineElement({ label: table.emptyMessage, type: "note" });
      return;
    }

    ensureSpace(38);
    addTableHeader(table);

    table.rows.forEach((row, index) => {
      const rowHeight = 18;
      ensureSpace(rowHeight + 4);

      if (y === startY) {
        addTableHeader(table);
      }

      if (index % 2 === 1) {
        addFill(
          marginX,
          y - rowHeight + 5,
          contentWidth,
          rowHeight,
          "0.985 0.985 0.985",
        );
      }

      let x = marginX;

      table.columns.forEach((column) => {
        const text = truncateText(row[column.key] ?? "", column.width - 6, 7);

        if (column.align === "right") {
          addRightText(text, x + column.width - 4, y - 7, 7, false);
        } else {
          addText(text, x + 3, y - 7, 7, false);
        }

        x += column.width;
      });

      y -= rowHeight;
      addLightRule(y + 5);
    });

    y -= 8;
  }

  newPage();

  for (const element of elements) {
    if (isTable(element)) {
      addTable(element);
      continue;
    }

    if (isSummaryGrid(element)) {
      addSummaryGrid(element);
      continue;
    }

    addLineElement(element);
  }

  if (current) {
    addText(`Page ${pageNumber}`, marginX, 24, 7, false);
    pages.push(current);
  }

  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");

  const pageObjectNumbers = pages.map((_, index) => 3 + index * 2);
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectNumbers
      .map((num) => `${num} 0 R`)
      .join(" ")}] /Count ${pages.length} >>`,
  );

  pages.forEach((content, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> >> >> /Contents ${contentObjectNumber} 0 R >>`,
    );

    objects.push(
      `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}endstream`,
    );
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function buildPlaceholderLines(
  reportName: string,
  reportLabel: string,
): PdfElement[] {
  return [
    { label: `${reportName} - ${reportLabel}`, type: "title" },
    { label: "COMING NEXT", type: "section" },
    {
      label:
        "This report type is connected to the shared dynamic PDF route. Its detailed rows will be wired after the inventory and sales reports are confirmed.",
      type: "note",
    },
  ];
}

function buildInventoryLines(
  items: InventoryItemRow[],
  reportLabel: string,
): PdfElement[] {
  const totalCost = items.reduce((sum, item) => sum + getItemCost(item), 0);
  const totalValue = items.reduce((sum, item) => sum + getItemValue(item), 0);
  const totalGainLoss = totalValue - totalCost;
  const needsValueCount = items.filter((item) => getItemValue(item) <= 0).length;
  const aged90Count = items.filter((item) => {
    const daysHeld = getDaysHeld(item);
    return daysHeld !== null && daysHeld >= 90;
  }).length;

  const rows = items.slice(0, 250).map((item, index) => {
    const costBasis = getItemCost(item);
    const estimatedValue = getItemValue(item);
    const gainLoss = estimatedValue - costBasis;

    return {
      number: String(index + 1),
      item: getBaseItemName(item),
      status: normalizeStatus(item.status),
      date: formatDateForPdf(getItemDate(item)),
      daysHeld: getDaysHeld(item) === null ? "" : String(getDaysHeld(item)),
      workflow: getWorkflowAction(item),
      year: asString(item.year),
      set: asString(item.set_name),
      itemNumber: getItemNumber(item),
      cost: currency(costBasis),
      value: currency(estimatedValue),
      gainLoss: currency(gainLoss),
      notes: asString(item.notes),
    };
  });

  const elements: PdfElement[] = [
    { label: `Inventory Report - ${reportLabel}`, type: "title" },
    { label: "SUMMARY", type: "section" },
    {
      type: "summaryGrid",
      cards: [
        { label: "Items in report", value: String(items.length) },
        { label: "Total cost basis", value: currency(totalCost) },
        { label: "Estimated value", value: currency(totalValue) },
        { label: "Estimated gain/loss", value: currency(totalGainLoss) },
      ],
    },
    {
      type: "summaryGrid",
      cards: [
        { label: "Needs value", value: String(needsValueCount) },
        { label: "90+ days held", value: String(aged90Count) },
        { label: "Workflow mode", value: "Read-only" },
        { label: "Tax safety", value: "No COGS changes" },
      ],
    },
    { label: "INVENTORY ITEMS", type: "section" },
    {
      type: "table",
      emptyMessage: "No inventory items found for this report filter.",
      columns: [
        { key: "number", label: "#", width: 20, align: "right" },
        { key: "item", label: "Item", width: 150 },
        { key: "status", label: "Status", width: 52 },
        { key: "date", label: "Date", width: 56 },
        { key: "daysHeld", label: "Days", width: 38, align: "right" },
        { key: "workflow", label: "Workflow", width: 82 },
        { key: "year", label: "Year", width: 34 },
        { key: "set", label: "Set", width: 58 },
        { key: "itemNumber", label: "Item #", width: 42 },
        { key: "cost", label: "Cost", width: 54, align: "right" },
        { key: "value", label: "Value", width: 54, align: "right" },
        { key: "gainLoss", label: "Gain/Loss", width: 58, align: "right" },
        { key: "notes", label: "Notes", width: 78 },
      ],
      rows,
    },
  ];

  if (items.length > 250) {
    elements.push({
      label: `${items.length - 250} additional item(s) not shown in this PDF. Use the CSV export for the full detailed list.`,
      type: "note",
    });
  }

  return elements;
}

function buildSalesLines({
  sales,
  inventoryById,
  reportLabel,
  platformFilter,
  cogsNote = false,
}: {
  sales: SaleRow[];
  inventoryById: Map<string, SaleInventoryRow>;
  reportLabel: string;
  platformFilter: string;
  cogsNote?: boolean;
}): PdfElement[] {
  const totalGrossSales = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.gross_sale ?? 0), 0),
  );
  const totalPlatformFees = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.platform_fees ?? 0), 0),
  );
  const totalShippingCosts = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.shipping_cost ?? 0), 0),
  );
  const totalOtherCosts = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.other_costs ?? 0), 0),
  );
  const totalSellingCosts = roundMoney(
    totalPlatformFees + totalShippingCosts + totalOtherCosts,
  );
  const totalNetProceeds = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.net_proceeds ?? 0), 0),
  );
  const totalCOGS = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.cost_of_goods_sold ?? 0), 0),
  );
  const totalProfit = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.profit ?? 0), 0),
  );

  const rows = sales.slice(0, 250).map((sale, index) => {
    const inventoryItem = sale.inventory_item_id
      ? inventoryById.get(sale.inventory_item_id)
      : undefined;

    return {
      number: String(index + 1),
      date: formatDateForPdf(sale.sale_date),
      item: buildSaleItemName(inventoryItem),
      platform: platformKey(sale.platform),
      gross: currency(Number(sale.gross_sale ?? 0)),
      fees: currency(Number(sale.platform_fees ?? 0)),
      ship: currency(Number(sale.shipping_cost ?? 0)),
      other: currency(Number(sale.other_costs ?? 0)),
      net: currency(Number(sale.net_proceeds ?? 0)),
      cogs: currency(Number(sale.cost_of_goods_sold ?? 0)),
      profit: currency(Number(sale.profit ?? 0)),
      notes: asString(sale.notes),
    };
  });

  const elements: PdfElement[] = [
    { label: `${reportLabel}`, type: "title" },
    { label: "SUMMARY", type: "section" },
    {
      type: "summaryGrid",
      cards: [
        { label: "Sales count", value: String(sales.length) },
        { label: "Gross sales", value: currency(totalGrossSales) },
        { label: "Selling costs", value: currency(totalSellingCosts) },
        { label: "Profit", value: currency(totalProfit) },
      ],
    },
    {
      type: "summaryGrid",
      cards: [
        { label: "Platform filter", value: platformFilter || "All platforms" },
        { label: "Net proceeds", value: currency(totalNetProceeds) },
        { label: "Realized COGS", value: currency(totalCOGS) },
        {
          label: "Shipping/other",
          value: currency(totalShippingCosts + totalOtherCosts),
        },
      ],
    },
    ...(cogsNote
      ? [
          {
            label:
              "CPA note: Realized COGS includes only completed, non-reversed sales in the selected date range. Unsold inventory remains in ending inventory and is not deducted on this report.",
            type: "note" as const,
          },
        ]
      : []),
    { label: cogsNote ? "COGS DETAIL" : "SALES DETAIL", type: "section" },
    {
      type: "table",
      emptyMessage: "No sales found for this report range.",
      columns: [
        { key: "number", label: "#", width: 22, align: "right" },
        { key: "date", label: "Date", width: 58 },
        { key: "item", label: "Item", width: 170 },
        { key: "platform", label: "Platform", width: 58 },
        { key: "gross", label: "Gross", width: 55, align: "right" },
        { key: "fees", label: "Fees", width: 50, align: "right" },
        { key: "ship", label: "Ship", width: 48, align: "right" },
        { key: "other", label: "Other", width: 48, align: "right" },
        { key: "net", label: "Net", width: 55, align: "right" },
        { key: "cogs", label: "COGS", width: 55, align: "right" },
        { key: "profit", label: "Profit", width: 58, align: "right" },
        { key: "notes", label: "Notes", width: 103 },
      ],
      rows,
    },
  ];

  if (sales.length > 250) {
    elements.push({
      label: `${sales.length - 250} additional sale(s) not shown in this PDF. Use the CSV export for the full detailed list.`,
      type: "note",
    });
  }

  return elements;
}

function buildExpensesLines({
  expenses,
  reportLabel,
  categoryFilter,
}: {
  expenses: ExpenseRow[];
  reportLabel: string;
  categoryFilter: string;
}): PdfElement[] {
  const totalExpenses = roundMoney(
    expenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0),
  );

  const categorySummary = Array.from(
    expenses.reduce((map, expense) => {
      const category =
        String(expense.category || "Uncategorized").trim() || "Uncategorized";
      const current = map.get(category) ?? { count: 0, amount: 0 };

      map.set(category, {
        count: current.count + 1,
        amount: roundMoney(current.amount + Number(expense.amount ?? 0)),
      });

      return map;
    }, new Map<string, { count: number; amount: number }>()),
  )
    .map(([category, values]) => ({
      category,
      scheduleCArea: getExpenseScheduleCArea(category),
      count: values.count,
      amount: values.amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  const largestCategory = categorySummary[0];

  const summaryRows = categorySummary.map((row, index) => ({
    number: String(index + 1),
    category: row.category,
    scheduleCArea: row.scheduleCArea,
    count: String(row.count),
    amount: currency(row.amount),
  }));

  const detailRows = expenses.slice(0, 250).map((expense, index) => {
    const category =
      String(expense.category || "Uncategorized").trim() || "Uncategorized";

    return {
      number: String(index + 1),
      date: formatDateForPdf(expense.expense_date),
      category,
      scheduleCArea: getExpenseScheduleCArea(category),
      vendor: asString(expense.vendor),
      amount: currency(Number(expense.amount ?? 0)),
      notes: asString(expense.notes),
    };
  });

  const elements: PdfElement[] = [
    { label: `${reportLabel}`, type: "title" },
    { label: "SUMMARY", type: "section" },
    {
      type: "summaryGrid",
      cards: [
        { label: "Expense count", value: String(expenses.length) },
        { label: "Total expenses", value: currency(totalExpenses) },
        { label: "Category filter", value: categoryFilter || "All categories" },
        {
          label: "Largest category",
          value: largestCategory ? largestCategory.category : "None",
        },
      ],
    },
    { label: "CATEGORY SUMMARY", type: "section" },
    {
      type: "table",
      emptyMessage: "No manual expenses found for this report range.",
      columns: [
        { key: "number", label: "#", width: 24, align: "right" },
        { key: "category", label: "Category", width: 190 },
        { key: "scheduleCArea", label: "Schedule C Area", width: 310 },
        { key: "count", label: "Count", width: 70, align: "right" },
        { key: "amount", label: "Amount", width: 130, align: "right" },
      ],
      rows: summaryRows,
    },
    { label: "EXPENSE DETAIL", type: "section" },
    {
      type: "table",
      emptyMessage: "No manual expenses found for this report range.",
      columns: [
        { key: "number", label: "#", width: 24, align: "right" },
        { key: "date", label: "Date", width: 62 },
        { key: "category", label: "Category", width: 150 },
        { key: "scheduleCArea", label: "Schedule C Area", width: 205 },
        { key: "vendor", label: "Vendor", width: 115 },
        { key: "amount", label: "Amount", width: 70, align: "right" },
        { key: "notes", label: "Notes", width: 98 },
      ],
      rows: detailRows,
    },
  ];

  if (expenses.length > 250) {
    elements.push({
      label: `${expenses.length - 250} additional expense(s) not shown in this PDF. Use the CSV export for the full detailed list.`,
      type: "note",
    });
  }

  return elements;
}



function buildSalesTaxLines({
  sales,
  reportLabel,
  platformFilter,
}: {
  sales: SaleRow[];
  reportLabel: string;
  platformFilter: string;
}): PdfElement[] {
  const totalGrossSales = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.gross_sale ?? 0), 0),
  );
  const totalPlatformFees = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.platform_fees ?? 0), 0),
  );
  const totalShippingCosts = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.shipping_cost ?? 0), 0),
  );
  const totalNetProceeds = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.net_proceeds ?? 0), 0),
  );

  // Dedicated sales-tax columns are not stored on sales records yet.
  // Keep these explicit so the report is clear and future-safe when fields are added.
  const trackedSalesTaxCollected = 0;
  const marketplaceRemittedTax = 0;
  const taxableAmountTracked = 0;
  const nonTaxableOrUnknownSales = totalGrossSales;

  const platformSummary = Array.from(
    sales.reduce((map, sale) => {
      const platform = platformKey(sale.platform);
      const current = map.get(platform) ?? {
        count: 0,
        gross: 0,
        tax: 0,
        marketplaceTax: 0,
        net: 0,
      };

      map.set(platform, {
        count: current.count + 1,
        gross: current.gross + Number(sale.gross_sale ?? 0),
        tax: current.tax,
        marketplaceTax: current.marketplaceTax,
        net: current.net + Number(sale.net_proceeds ?? 0),
      });

      return map;
    }, new Map<string, { count: number; gross: number; tax: number; marketplaceTax: number; net: number }>()),
  )
    .map(([platform, values], index) => ({
      number: String(index + 1),
      platform,
      count: String(values.count),
      gross: currency(roundMoney(values.gross)),
      trackedTax: currency(roundMoney(values.tax)),
      marketplaceTax: currency(roundMoney(values.marketplaceTax)),
      net: currency(roundMoney(values.net)),
    }))
    .sort((a, b) => a.platform.localeCompare(b.platform));

  const detailRows = sales.slice(0, 250).map((sale, index) => ({
    number: String(index + 1),
    date: formatDateForPdf(sale.sale_date),
    platform: platformKey(sale.platform),
    gross: currency(Number(sale.gross_sale ?? 0)),
    trackedTax: currency(0),
    marketplaceTax: currency(0),
    taxable: currency(0),
    net: currency(Number(sale.net_proceeds ?? 0)),
    notes: asString(sale.notes) || "Not tracked yet",
  }));

  const elements: PdfElement[] = [
    { label: reportLabel, type: "title" },
    { label: "SUMMARY", type: "section" },
    {
      type: "summaryGrid",
      cards: [
        { label: "Sales count", value: String(sales.length) },
        { label: "Gross sales", value: currency(totalGrossSales) },
        { label: "Tracked sales tax", value: currency(trackedSalesTaxCollected) },
        { label: "Marketplace tax", value: currency(marketplaceRemittedTax) },
      ],
    },
    {
      type: "summaryGrid",
      cards: [
        { label: "Platform filter", value: platformFilter || "All platforms" },
        { label: "Taxable tracked", value: currency(taxableAmountTracked) },
        { label: "Unknown / not tracked", value: currency(nonTaxableOrUnknownSales) },
        { label: "Net proceeds", value: currency(totalNetProceeds) },
      ],
    },
    {
      label:
        "Sales tax note: dedicated sales-tax fields are not currently stored on sales records, so tax columns show $0.00 until marketplace-collected/remitted tax fields are added. Marketplace reports should be kept as supporting records.",
      type: "note",
    },
    {
      label:
        "CPA note: marketplace-facilitator sales tax is usually tracked separately from business income. Review marketplace 1099s, payout reports, and state requirements before relying on this report for filing.",
      type: "note",
    },
    { label: "PLATFORM SUMMARY", type: "section" },
    {
      type: "table",
      emptyMessage: "No platform sales-tax records found for this report range.",
      columns: [
        { key: "number", label: "#", width: 24, align: "right" },
        { key: "platform", label: "Platform", width: 190 },
        { key: "count", label: "Count", width: 70, align: "right" },
        { key: "gross", label: "Gross", width: 110, align: "right" },
        { key: "trackedTax", label: "Tracked Tax", width: 110, align: "right" },
        { key: "marketplaceTax", label: "Mkt Tax", width: 110, align: "right" },
        { key: "net", label: "Net", width: 110, align: "right" },
      ],
      rows: platformSummary,
    },
    { label: "SALES TAX DETAIL", type: "section" },
    {
      type: "table",
      emptyMessage: "No sales found for this sales-tax report range.",
      columns: [
        { key: "number", label: "#", width: 24, align: "right" },
        { key: "date", label: "Date", width: 62 },
        { key: "platform", label: "Platform", width: 80 },
        { key: "gross", label: "Gross", width: 70, align: "right" },
        { key: "trackedTax", label: "Tax", width: 64, align: "right" },
        { key: "marketplaceTax", label: "Mkt Tax", width: 72, align: "right" },
        { key: "taxable", label: "Taxable", width: 72, align: "right" },
        { key: "net", label: "Net", width: 70, align: "right" },
        { key: "notes", label: "Notes", width: 210 },
      ],
      rows: detailRows,
    },
  ];

  if (sales.length > 250) {
    elements.push({
      label: `${sales.length - 250} additional sale(s) not shown in this PDF. Use the CSV export for the full detailed list.`,
      type: "note",
    });
  }

  return elements;
}

function normalizeFinancialAccount(raw?: string | null): FinancialAccount {
  const clean = String(raw || "all").trim();

  if (
    clean === "sales" ||
    clean === "cogs" ||
    clean === "selling-costs" ||
    clean === "expenses" ||
    clean === "purchases" ||
    clean === "inventory" ||
    clean === "schedule-c"
  ) {
    return clean;
  }

  return "all";
}

function getFinancialAccountLabel(account: FinancialAccount) {
  if (account === "sales") return "Sales / income";
  if (account === "cogs") return "COGS / cost basis";
  if (account === "selling-costs") return "Selling costs";
  if (account === "expenses") return "Manual expenses";
  if (account === "purchases") return "Purchases / breaks";
  if (account === "inventory") return "Inventory value";
  if (account === "schedule-c") return "Schedule C support";

  return "All financial accounts";
}

function getFinancialReportDateRange({
  selectedYear,
  period,
  start,
  end,
  month,
  quarter,
}: {
  selectedYear: number;
  period: ReportPeriod;
  start?: string | null;
  end?: string | null;
  month: number;
  quarter: number;
}) {
  const today = new Date();
  const defaultAnchor =
    selectedYear === today.getFullYear() ? today : new Date(selectedYear, 0, 1);

  if (period === "day") {
    const selectedDay = parseInputDate(start, defaultAnchor);

    return {
      startDate: dateToInputValue(selectedDay),
      endDate: dateToInputValue(selectedDay),
      label: `Daily Financial Report ${dateToInputValue(selectedDay)}`,
    };
  }

  if (period === "week") {
    const selectedDay = parseInputDate(start, defaultAnchor);
    const weekStart = getStartOfWeek(selectedDay);
    const weekEnd = getEndOfWeek(selectedDay);

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      label: `Weekly Financial Report ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    };
  }

  if (period === "month") {
    const monthStart = new Date(selectedYear, month - 1, 1);
    const monthEnd = new Date(selectedYear, month, 0);

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      label: `Monthly Financial Report ${monthStart.toLocaleString("default", {
        month: "long",
      })} ${selectedYear}`,
    };
  }

  if (period === "quarter") {
    const quarterStartMonth = (quarter - 1) * 3;
    const quarterStart = new Date(selectedYear, quarterStartMonth, 1);
    const quarterEnd = new Date(selectedYear, quarterStartMonth + 3, 0);

    return {
      startDate: dateToInputValue(quarterStart),
      endDate: dateToInputValue(quarterEnd),
      label: `Quarterly Financial Report Q${quarter} ${selectedYear}`,
    };
  }

  if (period === "custom") {
    const fallbackStart = new Date(selectedYear, 0, 1);
    const fallbackEnd = new Date(selectedYear, 11, 31);

    const customStart = parseInputDate(start, fallbackStart);
    const customEnd = parseInputDate(end, fallbackEnd);

    const normalizedStart =
      customStart.getTime() <= customEnd.getTime() ? customStart : customEnd;
    const normalizedEnd =
      customStart.getTime() <= customEnd.getTime() ? customEnd : customStart;

    return {
      startDate: dateToInputValue(normalizedStart),
      endDate: dateToInputValue(normalizedEnd),
      label: `Custom Financial Report ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
    };
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
    label: `Yearly Financial Report ${selectedYear}`,
  };
}

function financialMatchesSearch(values: unknown[], search: string) {
  if (!search) return true;

  const haystack = values.map(asString).join(" ").toLowerCase();

  return haystack.includes(search.toLowerCase());
}

function getFinancialInventoryCost(row: FinancialInventoryRow) {
  const quantity = asNumber(row.available_quantity ?? row.quantity ?? 1);
  const costBasisTotal = asNumber(row.cost_basis_total);
  const totalCost = asNumber(row.total_cost);
  const allocatedCost = asNumber(row.allocated_cost);
  const costBasisUnit = asNumber(row.cost_basis_unit);
  const unitCost = asNumber(row.unit_cost);
  const purchasePrice = asNumber(row.purchase_price);
  const legacyCost = asNumber(row.cost);

  if (costBasisTotal > 0) return costBasisTotal;
  if (totalCost > 0) return totalCost;
  if (allocatedCost > 0) return allocatedCost;
  if (costBasisUnit > 0) return costBasisUnit * Math.max(quantity, 1);
  if (unitCost > 0) return unitCost * Math.max(quantity, 1);
  if (purchasePrice > 0) return purchasePrice;
  if (legacyCost > 0) return legacyCost;

  return 0;
}

function getFinancialInventoryValue(row: FinancialInventoryRow) {
  const estimatedValueTotal = asNumber(row.estimated_value_total);
  const currentValue = asNumber(row.current_value);
  const estimatedValue = asNumber(row.estimated_value);
  const salePrice = asNumber(row.sale_price);
  const soldPrice = asNumber(row.sold_price);

  if (estimatedValueTotal > 0) return estimatedValueTotal;
  if (currentValue > 0) return currentValue;
  if (estimatedValue > 0) return estimatedValue;
  if (salePrice > 0) return salePrice;
  if (soldPrice > 0) return soldPrice;

  return 0;
}

function buildFinancialInventoryItemName(item: FinancialInventoryRow) {
  const title = item.title || item.player_name || "Untitled item";

  const parts = [
    item.year ? String(item.year) : "",
    item.set_name || "",
    item.card_number ? `#${item.card_number}` : "",
  ].filter(Boolean);

  return parts.length ? `${title} - ${parts.join(" ")}` : title;
}

function buildFinancialLines({
  account,
  reportLabel,
  startDate,
  endDate,
  sales,
  expenses,
  breaks,
  endingInventory,
  taxSettings,
}: {
  account: FinancialAccount;
  reportLabel: string;
  startDate: string;
  endDate: string;
  sales: SaleRow[];
  expenses: ExpenseRow[];
  breaks: BreakRow[];
  endingInventory: FinancialInventoryRow[];
  taxSettings: TaxYearSettingsRow | null;
}): PdfElement[] {
  const totalGrossSales = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.gross_sale ?? 0), 0),
  );
  const totalPlatformFees = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.platform_fees ?? 0), 0),
  );
  const totalShippingCosts = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.shipping_cost ?? 0), 0),
  );
  const totalOtherSellingCosts = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.other_costs ?? 0), 0),
  );
  const totalSellingCosts = roundMoney(
    totalPlatformFees + totalShippingCosts + totalOtherSellingCosts,
  );
  const totalNetProceeds = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.net_proceeds ?? 0), 0),
  );
  const totalCOGS = roundMoney(
    sales.reduce((sum, row) => sum + Number(row.cost_of_goods_sold ?? 0), 0),
  );
  const totalManualExpenses = roundMoney(
    expenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
  );
  const totalBreakPurchases = roundMoney(
    breaks.reduce((sum, row) => sum + Number(row.total_cost ?? 0), 0),
  );
  const beginningInventory = roundMoney(Number(taxSettings?.beginning_inventory ?? 0));
  const liveEndingInventoryCost = roundMoney(
    endingInventory.reduce((sum, row) => sum + getFinancialInventoryCost(row), 0),
  );
  const lockedEndingInventory =
    taxSettings?.ending_inventory_snapshot != null
      ? roundMoney(Number(taxSettings.ending_inventory_snapshot ?? 0))
      : null;
  const endingInventoryCost = lockedEndingInventory ?? liveEndingInventoryCost;
  const endingInventoryEstimatedValue = roundMoney(
    endingInventory.reduce((sum, row) => sum + getFinancialInventoryValue(row), 0),
  );
  const scheduleCExtraExpenses = roundMoney(
    Number(taxSettings?.business_use_of_home ?? 0) +
      Number(taxSettings?.vehicle_expense ?? 0) +
      Number(taxSettings?.depreciation_expense ?? 0) +
      Number(taxSettings?.legal_professional ?? 0) +
      Number(taxSettings?.insurance ?? 0) +
      Number(taxSettings?.utilities ?? 0) +
      Number(taxSettings?.taxes_licenses ?? 0) +
      Number(taxSettings?.repairs_maintenance ?? 0),
  );
  const grossIncomeAfterCOGS = roundMoney(totalGrossSales - totalCOGS);
  const netBusinessProfitAfterTrackedExpenses = roundMoney(
    totalGrossSales - totalCOGS - totalSellingCosts - totalManualExpenses - scheduleCExtraExpenses,
  );
  const purchasesForCogsSupport = roundMoney(
    totalCOGS + endingInventoryCost - beginningInventory,
  );

  const elements: PdfElement[] = [
    { label: `${reportLabel} - ${getFinancialAccountLabel(account)}`, type: "title" },
    { label: `Range: ${formatReportDate(startDate)} to ${formatReportDate(endDate)}`, type: "note" },
    { label: "SUMMARY", type: "section" },
    {
      type: "summaryGrid",
      cards: [
        { label: "Gross sales", value: currency(totalGrossSales) },
        { label: "Realized COGS", value: currency(totalCOGS) },
        { label: "Gross income", value: currency(grossIncomeAfterCOGS) },
        { label: "Net profit", value: currency(netBusinessProfitAfterTrackedExpenses) },
      ],
    },
    {
      type: "summaryGrid",
      cards: [
        { label: "Selling costs", value: currency(totalSellingCosts) },
        { label: "Manual expenses", value: currency(totalManualExpenses) },
        { label: "Net proceeds", value: currency(totalNetProceeds) },
        { label: "Break purchases", value: currency(totalBreakPurchases) },
      ],
    },
    {
      type: "summaryGrid",
      cards: [
        { label: "Beginning inventory", value: currency(beginningInventory) },
        { label: "Purchases support", value: currency(purchasesForCogsSupport) },
        { label: "Ending inventory", value: currency(endingInventoryCost) },
        { label: "Ending est. value", value: currency(endingInventoryEstimatedValue) },
      ],
    },
  ];

  const includeSales =
    account === "all" ||
    account === "sales" ||
    account === "selling-costs" ||
    account === "cogs";
  const includeExpenses = account === "all" || account === "expenses" || account === "schedule-c";
  const includeBreaks = account === "all" || account === "purchases" || account === "cogs";
  const includeInventory = account === "all" || account === "inventory" || account === "cogs" || account === "schedule-c";
  const includeScheduleC = account === "all" || account === "schedule-c";

  if (account === "all" || account === "cogs" || account === "schedule-c") {
    elements.push(
      { label: "COGS TIE-OUT", type: "section" },
      {
        type: "table",
        emptyMessage: "No COGS support rows available.",
        columns: [
          { key: "account", label: "Account", width: 230 },
          { key: "amount", label: "Amount", width: 110, align: "right" },
          { key: "note", label: "Notes", width: 384 },
        ],
        rows: [
          { account: "Beginning inventory", amount: currency(beginningInventory), note: "From tax year settings." },
          { account: "Purchases support", amount: currency(purchasesForCogsSupport), note: "COGS + ending inventory - beginning inventory." },
          {
            account: "Ending inventory",
            amount: currency(endingInventoryCost),
            note: lockedEndingInventory == null ? "Current live inventory value." : "Locked year-end inventory snapshot.",
          },
          { account: "Realized COGS", amount: currency(totalCOGS), note: "Sold item cost basis from sales." },
        ],
      },
    );
  }

  if (includeSales) {
    elements.push(
      { label: account === "selling-costs" ? "SELLING COSTS / SALES DETAIL" : "SALES DETAIL", type: "section" },
      {
        type: "table",
        emptyMessage: "No sales found for this report range.",
        columns: [
          { key: "number", label: "#", width: 24, align: "right" },
          { key: "date", label: "Date", width: 62 },
          { key: "platform", label: "Platform", width: 70 },
          { key: "gross", label: "Gross", width: 70, align: "right" },
          { key: "fees", label: "Fees", width: 60, align: "right" },
          { key: "ship", label: "Ship", width: 60, align: "right" },
          { key: "other", label: "Other", width: 60, align: "right" },
          { key: "net", label: "Net", width: 70, align: "right" },
          { key: "cogs", label: "COGS", width: 70, align: "right" },
          { key: "profit", label: "Profit", width: 70, align: "right" },
          { key: "notes", label: "Notes", width: 108 },
        ],
        rows: sales.slice(0, 250).map((sale, index) => ({
          number: String(index + 1),
          date: formatDateForPdf(sale.sale_date),
          platform: platformKey(sale.platform),
          gross: currency(Number(sale.gross_sale ?? 0)),
          fees: currency(Number(sale.platform_fees ?? 0)),
          ship: currency(Number(sale.shipping_cost ?? 0)),
          other: currency(Number(sale.other_costs ?? 0)),
          net: currency(Number(sale.net_proceeds ?? 0)),
          cogs: currency(Number(sale.cost_of_goods_sold ?? 0)),
          profit: currency(Number(sale.profit ?? 0)),
          notes: asString(sale.notes),
        })),
      },
    );
  }

  if (includeExpenses) {
    const expenseSummaryRows = Array.from(
      expenses.reduce((map, expense) => {
        const category =
          String(expense.category || "Uncategorized").trim() || "Uncategorized";
        const current = map.get(category) ?? { count: 0, amount: 0 };

        map.set(category, {
          count: current.count + 1,
          amount: roundMoney(current.amount + Number(expense.amount ?? 0)),
        });

        return map;
      }, new Map<string, { count: number; amount: number }>()),
    )
      .map(([category, values]) => ({
        category,
        scheduleCArea: getExpenseScheduleCArea(category),
        count: String(values.count),
        amount: currency(values.amount),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));

    elements.push(
      { label: "MANUAL EXPENSE SUMMARY", type: "section" },
      {
        type: "table",
        emptyMessage: "No manual expenses found for this report range.",
        columns: [
          { key: "category", label: "Category", width: 190 },
          { key: "scheduleCArea", label: "Schedule C Area", width: 360 },
          { key: "count", label: "Count", width: 70, align: "right" },
          { key: "amount", label: "Amount", width: 104, align: "right" },
        ],
        rows: expenseSummaryRows,
      },
    );
  }

  if (includeBreaks) {
    elements.push(
      { label: "BREAK PURCHASES / ACQUISITIONS", type: "section" },
      {
        type: "table",
        emptyMessage: "No break purchases found for this report range.",
        columns: [
          { key: "number", label: "#", width: 24, align: "right" },
          { key: "date", label: "Date", width: 70 },
          { key: "product", label: "Product", width: 230 },
          { key: "source", label: "Source", width: 150 },
          { key: "order", label: "Order #", width: 130 },
          { key: "cost", label: "Total Cost", width: 120, align: "right" },
        ],
        rows: breaks.slice(0, 250).map((row, index) => ({
          number: String(index + 1),
          date: formatDateForPdf(row.break_date),
          product: asString(row.product_name),
          source: asString(row.source_name),
          order: asString(row.order_number),
          cost: currency(Number(row.total_cost ?? 0)),
        })),
      },
    );
  }

  if (includeInventory) {
    elements.push(
      { label: "ENDING INVENTORY DETAIL", type: "section" },
      {
        type: "table",
        emptyMessage: "No ending inventory found.",
        columns: [
          { key: "number", label: "#", width: 24, align: "right" },
          { key: "item", label: "Item", width: 250 },
          { key: "status", label: "Status", width: 70 },
          { key: "qty", label: "Qty", width: 55, align: "right" },
          { key: "unitCost", label: "Unit Cost", width: 80, align: "right" },
          { key: "inventoryCost", label: "Inventory Cost", width: 105, align: "right" },
          { key: "estimatedValue", label: "Est. Value", width: 140, align: "right" },
        ],
        rows: endingInventory.slice(0, 250).map((row, index) => {
          const availableQty = asNumber(row.available_quantity ?? row.quantity ?? 1);
          const unitCost = asNumber(row.cost_basis_unit ?? row.unit_cost ?? 0);
          const rowCost = getFinancialInventoryCost(row);

          return {
            number: String(index + 1),
            item: buildFinancialInventoryItemName(row),
            status: asString(row.status),
            qty: String(availableQty),
            unitCost: currency(unitCost),
            inventoryCost: currency(rowCost),
            estimatedValue: currency(getFinancialInventoryValue(row)),
          };
        }),
      },
    );
  }

  if (includeScheduleC) {
    elements.push(
      { label: "EXTRA SCHEDULE C SUPPORT", type: "section" },
      {
        type: "table",
        emptyMessage: "No extra Schedule C support rows have been entered.",
        columns: [
          { key: "account", label: "Account", width: 300 },
          { key: "amount", label: "Amount", width: 120, align: "right" },
          { key: "note", label: "Notes", width: 304 },
        ],
        rows: [
          { account: "Business use of home", amount: currency(Number(taxSettings?.business_use_of_home ?? 0)), note: "Tax year setting." },
          { account: "Vehicle expense", amount: currency(Number(taxSettings?.vehicle_expense ?? 0)), note: "Tax year setting." },
          { account: "Depreciation expense", amount: currency(Number(taxSettings?.depreciation_expense ?? 0)), note: "Tax year setting." },
          { account: "Legal and professional", amount: currency(Number(taxSettings?.legal_professional ?? 0)), note: "Tax year setting." },
          { account: "Insurance", amount: currency(Number(taxSettings?.insurance ?? 0)), note: "Tax year setting." },
          { account: "Utilities", amount: currency(Number(taxSettings?.utilities ?? 0)), note: "Tax year setting." },
          { account: "Taxes and licenses", amount: currency(Number(taxSettings?.taxes_licenses ?? 0)), note: "Tax year setting." },
          { account: "Repairs and maintenance", amount: currency(Number(taxSettings?.repairs_maintenance ?? 0)), note: "Tax year setting." },
        ],
      },
    );
  }

  elements.push({
    label:
      "CPA note: This report is for bookkeeping and business review. Final tax filing treatment should be reviewed with the year-end tax center and a qualified tax professional when needed.",
    type: "note",
  });

  return elements;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { reportType } = await context.params;

    if (reportType === "tax") {
      return jsonError(
        "Tax PDF exports use their existing dedicated route.",
        400,
      );
    }

    const reportName = REPORT_LABELS[reportType];

    if (!reportName) {
      return jsonError("Unsupported report type.", 404);
    }

    const searchParams = request.nextUrl.searchParams;

    if (reportType === "sales-tax") {
      const selectedYear = clampYear(searchParams.get("year"));
      const selectedPeriod = normalizePeriod(searchParams.get("period"));
      const selectedMonth = clampMonth(searchParams.get("month"));
      const selectedQuarter = clampQuarter(searchParams.get("quarter"));
      const selectedPlatformRaw = String(searchParams.get("platform") || "").trim();
      const selectedPlatform =
        selectedPlatformRaw && selectedPlatformRaw !== "all"
          ? selectedPlatformRaw
          : "";
      const search = String(searchParams.get("q") || "").trim();
      const explicitStartDate =
        searchParams.get("startDate") || searchParams.get("dateFrom") || "";
      const explicitEndDate =
        searchParams.get("endDate") || searchParams.get("dateTo") || "";
      const selectedStart =
        searchParams.get("start") ||
        explicitStartDate ||
        searchParams.get("date");
      const selectedEnd = searchParams.get("end") || explicitEndDate;

      const calculatedRange = getSalesReportDateRange({
        selectedYear,
        period: selectedPeriod,
        start: selectedStart,
        end: selectedEnd,
        month: selectedMonth,
        quarter: selectedQuarter,
      });

      const startDate = explicitStartDate || calculatedRange.startDate;
      const endDate = explicitEndDate || calculatedRange.endDate;
      const label =
        explicitStartDate || explicitEndDate
          ? `Sales Tax Report: ${formatReportDate(startDate)} to ${formatReportDate(endDate)}`
          : calculatedRange.label.replace("Sales Report", "Sales Tax Report");

      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return unauthorizedError();
      }

      let salesQuery = supabase
        .from("sales")
        .select(
          `
          id,
          sale_date,
          gross_sale,
          platform_fees,
          shipping_cost,
          other_costs,
          net_proceeds,
          cost_of_goods_sold,
          profit,
          platform,
          notes,
          inventory_item_id
        `,
        )
        .eq("user_id", user.id)
        .is("reversed_at", null)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate)
        .order("sale_date", { ascending: false });

      if (selectedPlatform) {
        salesQuery = salesQuery.eq("platform", selectedPlatform);
      }

      const { data: salesData, error: salesError } = await salesQuery;

      if (salesError) {
        return jsonError(`Could not export sales tax PDF: ${salesError.message}`);
      }

      const sales = ((salesData ?? []) as SaleRow[]).filter((sale) => {
        if (!search) return true;

        const haystack = [
          sale.sale_date,
          sale.gross_sale,
          sale.platform_fees,
          sale.shipping_cost,
          sale.other_costs,
          sale.net_proceeds,
          sale.cost_of_goods_sold,
          sale.profit,
          sale.platform,
          sale.notes,
        ]
          .map(asString)
          .join(" ")
          .toLowerCase();

        return haystack.includes(search.toLowerCase());
      });

      const pdfBuffer = buildPdf(
        buildSalesTaxLines({
          sales,
          reportLabel: label,
          platformFilter: selectedPlatform,
        }),
      );

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName: "sales-tax-report",
          startDate,
          endDate,
          extension: "pdf",
        }),
      });
    }

    if (reportType === "financial") {
      const selectedYear = clampYear(searchParams.get("year"));
      const selectedPeriod = normalizePeriod(searchParams.get("period"));
      const selectedMonth = clampMonth(searchParams.get("month"));
      const selectedQuarter = clampQuarter(searchParams.get("quarter"));
      const selectedAccount = normalizeFinancialAccount(searchParams.get("account"));
      const search = String(searchParams.get("q") || "").trim();
      const explicitStartDate =
        searchParams.get("startDate") || searchParams.get("dateFrom") || "";
      const explicitEndDate =
        searchParams.get("endDate") || searchParams.get("dateTo") || "";
      const selectedStart =
        searchParams.get("start") ||
        explicitStartDate ||
        searchParams.get("date");
      const selectedEnd = searchParams.get("end") || explicitEndDate;

      const calculatedRange = getFinancialReportDateRange({
        selectedYear,
        period: selectedPeriod,
        start: selectedStart,
        end: selectedEnd,
        month: selectedMonth,
        quarter: selectedQuarter,
      });

      const startDate = explicitStartDate || calculatedRange.startDate;
      const endDate = explicitEndDate || calculatedRange.endDate;
      const label =
        explicitStartDate || explicitEndDate
          ? `Financial Report: ${formatReportDate(startDate)} to ${formatReportDate(endDate)}`
          : calculatedRange.label;

      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return unauthorizedError();
      }

      const [breaksRes, salesRes, inventoryRes, expensesRes, taxSettingsRes] =
        await Promise.all([
          supabase
            .from("breaks")
            .select("id, break_date, source_name, product_name, order_number, total_cost")
            .eq("user_id", user.id)
            .is("reversed_at", null)
            .gte("break_date", startDate)
            .lte("break_date", endDate)
            .order("break_date", { ascending: false }),

          supabase
            .from("sales")
            .select(`
              id,
              sale_date,
              gross_sale,
              platform_fees,
              shipping_cost,
              other_costs,
              net_proceeds,
              cost_of_goods_sold,
              profit,
              platform,
              notes,
              inventory_item_id
            `)
            .eq("user_id", user.id)
            .is("reversed_at", null)
            .gte("sale_date", startDate)
            .lte("sale_date", endDate)
            .order("sale_date", { ascending: false }),

          supabase
            .from("inventory_items")
            .select(`
              id,
              title,
              player_name,
              year,
              set_name,
              card_number,
              notes,
              status,
              available_quantity,
              quantity,
              cost_basis_unit,
              cost_basis_total,
              unit_cost,
              total_cost,
              allocated_cost,
              purchase_price,
              cost,
              current_value,
              estimated_value,
              estimated_value_total,
              sale_price,
              sold_price
            `)
            .eq("user_id", user.id)
            .gt("available_quantity", 0)
            .order("year", { ascending: false }),

          supabase
            .from("expenses")
            .select(`
              id,
              expense_date,
              category,
              vendor,
              amount,
              notes,
              created_at
            `)
            .eq("user_id", user.id)
            .gte("expense_date", startDate)
            .lte("expense_date", endDate)
            .order("expense_date", { ascending: false })
            .order("created_at", { ascending: false }),

          supabase
            .from("tax_year_settings")
            .select(`
              beginning_inventory,
              ending_inventory_snapshot,
              ending_inventory_locked_at,
              business_use_of_home,
              vehicle_expense,
              depreciation_expense,
              legal_professional,
              insurance,
              utilities,
              taxes_licenses,
              repairs_maintenance,
              notes
            `)
            .eq("user_id", user.id)
            .eq("tax_year", selectedYear)
            .maybeSingle(),
        ]);

      if (breaksRes.error) return jsonError(`Could not load break purchases for financial PDF: ${breaksRes.error.message}`);
      if (salesRes.error) return jsonError(`Could not load sales for financial PDF: ${salesRes.error.message}`);
      if (inventoryRes.error) return jsonError(`Could not load inventory for financial PDF: ${inventoryRes.error.message}`);
      if (expensesRes.error) return jsonError(`Could not load expenses for financial PDF: ${expensesRes.error.message}`);
      if (taxSettingsRes.error) return jsonError(`Could not load tax settings for financial PDF: ${taxSettingsRes.error.message}`);

      const breaks = ((breaksRes.data ?? []) as BreakRow[]).filter((row) =>
        financialMatchesSearch([row.break_date, row.source_name, row.product_name, row.order_number, row.total_cost], search),
      );
      const sales = ((salesRes.data ?? []) as SaleRow[]).filter((row) =>
        financialMatchesSearch([row.sale_date, row.gross_sale, row.platform_fees, row.shipping_cost, row.other_costs, row.net_proceeds, row.cost_of_goods_sold, row.profit, row.platform, row.notes], search),
      );
      const endingInventory = ((inventoryRes.data ?? []) as FinancialInventoryRow[]).filter((row) =>
        financialMatchesSearch([row.title, row.player_name, row.year, row.set_name, row.card_number, row.notes, row.status], search),
      );
      const expenses = ((expensesRes.data ?? []) as ExpenseRow[]).filter((row) =>
        financialMatchesSearch([row.expense_date, row.category, row.vendor, row.amount, row.notes], search),
      );
      const taxSettings = (taxSettingsRes.data ?? null) as TaxYearSettingsRow | null;

      const pdfBuffer = buildPdf(
        buildFinancialLines({
          account: selectedAccount,
          reportLabel: label,
          startDate,
          endDate,
          sales,
          expenses,
          breaks,
          endingInventory,
          taxSettings,
        }),
      );

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName: "financial-report",
          startDate,
          endDate,
          extension: "pdf",
        }),
      });
    }

    if (reportType === "sales" || reportType === "cogs") {
      const selectedYear = clampYear(searchParams.get("year"));
      const selectedPeriod = normalizePeriod(searchParams.get("period"));
      const selectedMonth = clampMonth(searchParams.get("month"));
      const selectedQuarter = clampQuarter(searchParams.get("quarter"));
      const selectedPlatformRaw = String(
        searchParams.get("platform") || "",
      ).trim();
      const selectedPlatform =
        selectedPlatformRaw && selectedPlatformRaw !== "all"
          ? selectedPlatformRaw
          : "";
      const explicitStartDate =
        searchParams.get("startDate") || searchParams.get("dateFrom") || "";
      const explicitEndDate =
        searchParams.get("endDate") || searchParams.get("dateTo") || "";
      const selectedStart =
        searchParams.get("start") ||
        explicitStartDate ||
        searchParams.get("date");
      const selectedEnd = searchParams.get("end") || explicitEndDate;

      const calculatedRange = getSalesReportDateRange({
        selectedYear,
        period: selectedPeriod,
        start: selectedStart,
        end: selectedEnd,
        month: selectedMonth,
        quarter: selectedQuarter,
      });

      const startDate = explicitStartDate || calculatedRange.startDate;
      const endDate = explicitEndDate || calculatedRange.endDate;
      const label =
        explicitStartDate || explicitEndDate
          ? `${reportType === "cogs" ? "Realized COGS Report" : "Sales Report"}: ${formatReportDate(
              startDate,
            )} to ${formatReportDate(endDate)}`
          : calculatedRange.label;

      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return unauthorizedError();
      }

      let salesQuery = supabase
        .from("sales")
        .select(
          `
          id,
          sale_date,
          gross_sale,
          platform_fees,
          shipping_cost,
          other_costs,
          net_proceeds,
          cost_of_goods_sold,
          profit,
          platform,
          notes,
          inventory_item_id
        `,
        )
        .eq("user_id", user.id)
        .is("reversed_at", null)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate)
        .order("sale_date", { ascending: false });

      if (selectedPlatform) {
        salesQuery = salesQuery.eq("platform", selectedPlatform);
      }

      const { data: salesData, error: salesError } = await salesQuery;

      if (salesError) {
        return jsonError(`Could not export sales PDF: ${salesError.message}`);
      }

      const sales = (salesData ?? []) as SaleRow[];

      const inventoryIds = Array.from(
        new Set(
          sales
            .map((sale) => sale.inventory_item_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const inventoryRes =
        inventoryIds.length > 0
          ? await supabase
              .from("inventory_items")
              .select(
                "id, title, player_name, year, set_name, card_number, notes, status",
              )
              .eq("user_id", user.id)
              .in("id", inventoryIds)
          : { data: [], error: null };

      if (inventoryRes.error) {
        return jsonError(
          `Could not load inventory item details for sales PDF: ${inventoryRes.error.message}`,
        );
      }

      const inventoryItems = (inventoryRes.data ?? []) as SaleInventoryRow[];
      const inventoryById = new Map(
        inventoryItems.map((item) => [item.id, item]),
      );

      const pdfBuffer = buildPdf(
        buildSalesLines({
          sales,
          inventoryById,
          reportLabel:
            reportType === "cogs"
              ? label.replace("Sales Report", "Realized COGS Report")
              : label,
          platformFilter: selectedPlatform,
          cogsNote: reportType === "cogs",
        }),
      );

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName: reportType === "cogs" ? "cogs-report" : "sales-report",
          startDate,
          endDate,
          extension: "pdf",
        }),
      });
    }

    if (reportType === "expenses") {
      const selectedYear = clampYear(searchParams.get("year"));
      const selectedPeriod = normalizePeriod(searchParams.get("period"));
      const selectedMonth = clampMonth(searchParams.get("month"));
      const selectedQuarter = clampQuarter(searchParams.get("quarter"));
      const selectedCategory = String(
        searchParams.get("category") || "",
      ).trim();
      const selectedStart =
        searchParams.get("start") ||
        searchParams.get("startDate") ||
        searchParams.get("date");
      const selectedEnd =
        searchParams.get("end") || searchParams.get("endDate");

      const { startDate, endDate, label } = getExpensesReportDateRange({
        selectedYear,
        period: selectedPeriod,
        start: selectedStart,
        end: selectedEnd,
        month: selectedMonth,
        quarter: selectedQuarter,
      });

      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return unauthorizedError();
      }

      let expensesQuery = supabase
        .from("expenses")
        .select(
          `
          id,
          expense_date,
          category,
          vendor,
          amount,
          notes,
          created_at
        `,
        )
        .eq("user_id", user.id)
        .gte("expense_date", startDate)
        .lte("expense_date", endDate)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (selectedCategory) {
        expensesQuery = expensesQuery.eq("category", selectedCategory);
      }

      const { data, error } = await expensesQuery;

      if (error) {
        return jsonError(`Could not export expenses PDF: ${error.message}`);
      }

      const expenses = (data ?? []) as ExpenseRow[];

      const pdfBuffer = buildPdf(
        buildExpensesLines({
          expenses,
          reportLabel: label,
          categoryFilter: selectedCategory,
        }),
      );

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName: "expenses-report",
          startDate,
          endDate,
          extension: "pdf",
        }),
      });
    }

    const reportLabel = getDateRange(searchParams);
    const startDate = String(
      searchParams.get("startDate") || searchParams.get("dateFrom") || "",
    ).trim();
    const endDate = String(
      searchParams.get("endDate") || searchParams.get("dateTo") || "",
    ).trim();

    if (reportType !== "inventory") {
      const pdfBuffer = buildPdf(
        buildPlaceholderLines(reportName, reportLabel),
      );

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          extension: "pdf",
        }),
      });
    }

    const search = String(searchParams.get("q") || "").trim();
    const selectedStatus = String(searchParams.get("status") || "all").trim();
    const selectedValue = String(searchParams.get("value") || "all").trim();
    const selectedAging = String(searchParams.get("aging") || "all").trim();
    const selectedAction = String(searchParams.get("action") || "all").trim();

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return unauthorizedError();
    }

    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return jsonError(`Could not export inventory PDF: ${error.message}`);
    }

    const allInventoryItems = (data ?? []) as InventoryItemRow[];

    const inventoryItems = allInventoryItems.filter((item) => {
      const status = normalizeStatus(item.status);

      if (selectedStatus !== "all" && status !== selectedStatus) return false;
      if (!matchesSearch(item, search)) return false;
      if (!matchesDateRange(item, startDate, endDate)) return false;
      if (!matchesValueFilter(item, selectedValue)) return false;
      if (!matchesAgingFilter(item, selectedAging)) return false;
      if (!matchesActionNeededFilter(item, selectedAction)) return false;

      return true;
    });

    const pdfBuffer = buildPdf(
      buildInventoryLines(inventoryItems, reportLabel),
    );

    return pdfDownloadResponse({
      pdf: pdfBuffer,
      filename: buildReportFilename({
        reportName: "inventory-report",
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        extension: "pdf",
      }),
    });
  } catch (error) {
    console.error("Dynamic report PDF export failed:", error);
    return jsonError("Unable to build PDF report.");
  }
}
