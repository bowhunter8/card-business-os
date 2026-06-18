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
  quantity?: number | string | null;
  available_quantity?: number | string | null;
  cost_basis_unit?: number | string | null;
  cost_basis_total?: number | string | null;
  estimated_value_total?: number | string | null;
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
  sales_tax_collected?: number | string | null;
  sales_tax_responsibility?: string | null;
  sales_channel_type?: string | null;
  tax_state?: string | null;
  tax_notes?: string | null;
};

type ShippingSaleRow = SaleRow & {
  shipping_charged?: number | string | null;
  shipping_amount_charged?: number | string | null;
  buyer_shipping_charged?: number | string | null;
  shipping_income?: number | string | null;
  shipping_collected?: number | string | null;
  shipping_revenue?: number | string | null;
  postage_cost?: number | string | null;
  actual_postage_cost?: number | string | null;
  supplies_cost?: number | string | null;
  shipping_supplies_cost?: number | string | null;
  packaging_cost?: number | string | null;
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


type DisposalTransactionRow = {
  id: string;
  inventory_item_id: string | null;
  transaction_type: string | null;
  quantity_change: number | null;
  notes: string | null;
  disposal_reason: string | null;
  disposal_notes: string | null;
  finalized_for_tax: boolean | null;
  created_at: string | null;
};

type DisposalInventoryRow = {
  id: string;
  title: string | null;
  item_name?: string | null;
  player_name: string | null;
  year: number | string | null;
  set_name: string | null;
  card_number: string | null;
  notes: string | null;
  cost_basis_total: number | null;
  cost_basis_unit: number | null;
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
  "profit-loss": "Profit & Loss Statement",
  "sales-tax": "Sales Tax Report",
  shipping: "Shipping Report",
  "cpa-packet": "CPA Export Packet",
  "open-lots": "Open Lots Report",
  "write-offs": "Write-Offs Report",
  "break-profitability": "Break Profitability Report",
  "platform-profitability": "Platform Profitability Report",
  "marketplace-fees": "Marketplace Fee Report",
  operations: "Operations Report",
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
  const costBasisUnit = asNumber(item.cost_basis_unit);

  if (costBasisTotal > 0) return costBasisTotal;
  if (costBasisUnit > 0) return costBasisUnit * Math.max(quantity, 1);

  return 0;
}

function getItemValue(item: InventoryItemRow) {
  const estimatedValueTotal = asNumber(item.estimated_value_total);

  if (estimatedValueTotal > 0) return estimatedValueTotal;

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

function normalizeSalesTaxResponsibility(value: string | null | undefined) {
  const clean = String(value || "").trim();

  if (
    clean === "marketplace_collected" ||
    clean === "seller_collected" ||
    clean === "not_collected" ||
    clean === "exempt_or_not_taxable"
  ) {
    return clean;
  }

  return "marketplace_collected";
}

function normalizeSalesChannelType(value: string | null | undefined) {
  const clean = String(value || "").trim();

  if (
    clean === "marketplace" ||
    clean === "local_sale" ||
    clean === "card_show" ||
    clean === "direct_private"
  ) {
    return clean;
  }

  return "marketplace";
}

function formatSalesTaxResponsibility(value: string | null | undefined) {
  const clean = normalizeSalesTaxResponsibility(value);

  if (clean === "marketplace_collected") return "Marketplace";
  if (clean === "seller_collected") return "Seller remit";
  if (clean === "not_collected") return "No tax";
  if (clean === "exempt_or_not_taxable") return "Exempt";

  return "Marketplace";
}

function formatSalesTaxResponsibilityLong(value: string | null | undefined) {
  const clean = normalizeSalesTaxResponsibility(value);

  if (clean === "marketplace_collected") return "Marketplace collected/remitted";
  if (clean === "seller_collected") return "Seller collected / possible remit";
  if (clean === "not_collected") return "No tax collected";
  if (clean === "exempt_or_not_taxable") return "Exempt / not taxable";

  return "Marketplace collected/remitted";
}

function formatSalesChannelType(value: string | null | undefined) {
  const clean = normalizeSalesChannelType(value);

  if (clean === "marketplace") return "Marketplace";
  if (clean === "local_sale") return "Local sale";
  if (clean === "card_show") return "Card show";
  if (clean === "direct_private") return "Direct/private";

  return "Marketplace";
}

function firstPositiveNumber(values: unknown[]) {
  for (const value of values) {
    const parsed = asNumber(value);
    if (parsed > 0) return parsed;
  }

  return 0;
}

function getShippingCharged(sale: ShippingSaleRow) {
  return firstPositiveNumber([
    sale.shipping_charged,
    sale.shipping_amount_charged,
    sale.buyer_shipping_charged,
    sale.shipping_income,
    sale.shipping_collected,
    sale.shipping_revenue,
  ]);
}

function getPostageCost(sale: ShippingSaleRow) {
  return firstPositiveNumber([
    sale.actual_postage_cost,
    sale.postage_cost,
    sale.shipping_cost,
  ]);
}

function getShippingSuppliesCost(sale: ShippingSaleRow) {
  const explicitSupplies = firstPositiveNumber([
    sale.supplies_cost,
    sale.shipping_supplies_cost,
    sale.packaging_cost,
  ]);

  if (explicitSupplies > 0) return explicitSupplies;

  // Current sales records commonly use other_costs for shipping supplies/packaging.
  // Keep this fallback so the report is useful before dedicated supplies columns exist.
  return asNumber(sale.other_costs);
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


function buildOpenLotsLines(
  items: InventoryItemRow[],
  reportLabel: string,
): PdfElement[] {
  const openStatuses = new Set([
    "available",
    "listed",
    "personal",
  ]);

  const filtered = items.filter((item) =>
    openStatuses.has(normalizeStatus(item.status).toLowerCase()),
  );

  const totalCost = filtered.reduce(
    (sum, item) => sum + getItemCost(item),
    0,
  );

  const totalValue = filtered.reduce(
    (sum, item) => sum + getItemValue(item),
    0,
  );

  const rows = filtered.slice(0, 250).map((item, index) => {
    const quantity = asNumber(
      item.available_quantity ?? item.quantity ?? 1,
    );

    const cost = getItemCost(item);
    const value = getItemValue(item);

    return {
      number: String(index + 1),
      item: getBaseItemName(item),
      status: normalizeStatus(item.status),
      qty: String(quantity),
      daysHeld:
        getDaysHeld(item) === null
          ? ""
          : String(getDaysHeld(item)),
      workflow: getWorkflowAction(item),
      year: asString(item.year),
      set: asString(item.set_name),
      itemNumber: getItemNumber(item),
      cost: currency(cost),
      value: currency(value),
      notes: asString(item.notes),
    };
  });

  const elements: PdfElement[] = [
    {
      label: `Open Lots Report - ${reportLabel}`,
      type: "title",
    },

    {
      label: "SUMMARY",
      type: "section",
    },

    {
      type: "summaryGrid",
      cards: [
        {
          label: "Open lots/items",
          value: String(filtered.length),
        },
        {
          label: "Open inventory cost",
          value: currency(totalCost),
        },
        {
          label: "Estimated value",
          value: currency(totalValue),
        },
        {
          label: "Statuses included",
          value: "Available/List/PC",
        },
      ],
    },

    {
      label: "OPEN LOTS DETAIL",
      type: "section",
    },

    {
      type: "table",
      emptyMessage: "No open inventory lots found.",
      columns: [
        { key: "number", label: "#", width: 22, align: "right" },
        { key: "item", label: "Item", width: 180 },
        { key: "status", label: "Status", width: 60 },
        { key: "qty", label: "Qty", width: 40, align: "right" },
        { key: "daysHeld", label: "Days", width: 40, align: "right" },
        { key: "workflow", label: "Workflow", width: 90 },
        { key: "year", label: "Year", width: 40 },
        { key: "set", label: "Set", width: 70 },
        { key: "itemNumber", label: "Item #", width: 50 },
        { key: "cost", label: "Cost", width: 60, align: "right" },
        { key: "value", label: "Value", width: 60, align: "right" },
        { key: "notes", label: "Notes", width: 80 },
      ],
      rows,
    },
  ];

  if (filtered.length > 250) {
    elements.push({
      label: `${filtered.length - 250} additional open lot item(s) not shown in this PDF.`,
      type: "note",
    });
  }

  return elements;
}


function getWriteOffPdfDate(item: InventoryItemRow) {
  const row = item as Record<string, unknown>;

  return (
    asString(row.disposed_at) ||
    asString(row.disposal_date) ||
    asString(row.updated_at) ||
    asString(row.created_at) ||
    getItemDate(item)
  );
}

function getWriteOffPdfReason(item: InventoryItemRow) {
  const row = item as Record<string, unknown>;

  return (
    asString(row.disposal_reason) ||
    asString(row.disposed_reason) ||
    asString(row.write_off_reason) ||
    asString(row.reason) ||
    asString(item.notes) ||
    ""
  );
}

function matchesWriteOffPdfDateRange(item: InventoryItemRow, startDate: string, endDate: string) {
  const rawDate = getWriteOffPdfDate(item);
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

function buildWriteOffsLines({
  items,
  reportLabel,
  statusFilter,
}: {
  items: InventoryItemRow[];
  reportLabel: string;
  statusFilter: string;
}): PdfElement[] {
  const disposedCount = items.filter((item) => normalizeStatus(item.status).toLowerCase() === "disposed").length;
  const junkCount = items.filter((item) => normalizeStatus(item.status).toLowerCase() === "junk").length;
  const totalQuantity = items.reduce((sum, item) => sum + Math.max(asNumber(item.quantity ?? item.available_quantity ?? 1), 1), 0);
  const totalCost = roundMoney(items.reduce((sum, item) => sum + getItemCost(item), 0));
  const totalValue = roundMoney(items.reduce((sum, item) => sum + getItemValue(item), 0));
  const totalGainLoss = roundMoney(totalValue - totalCost);

  const rows = items.slice(0, 250).map((item, index) => {
    const costBasis = getItemCost(item);
    const estimatedValue = getItemValue(item);

    return {
      number: String(index + 1),
      item: getBaseItemName(item),
      status: normalizeStatus(item.status),
      qty: String(Math.max(asNumber(item.quantity ?? item.available_quantity ?? 1), 1)),
      date: formatDateForPdf(getWriteOffPdfDate(item)),
      year: asString(item.year),
      set: asString(item.set_name),
      itemNumber: getItemNumber(item),
      cost: currency(costBasis),
      value: currency(estimatedValue),
      gainLoss: currency(estimatedValue - costBasis),
      reason: getWriteOffPdfReason(item),
    };
  });

  const elements: PdfElement[] = [
    { label: `Write-Off / Disposal Review - ${reportLabel}`, type: "title" },
    { label: "SUMMARY", type: "section" },
    {
      type: "summaryGrid",
      cards: [
        { label: "Records", value: String(items.length) },
        { label: "Quantity", value: String(totalQuantity) },
        { label: "Disposed", value: String(disposedCount) },
        { label: "Junk", value: String(junkCount) },
      ],
    },
    {
      type: "summaryGrid",
      cards: [
        { label: "Cost basis", value: currency(totalCost) },
        { label: "Est. value", value: currency(totalValue) },
        { label: "Gain/Loss", value: currency(totalGainLoss) },
        { label: "Status filter", value: statusFilter || "all" },
      ],
    },
    {
      label:
        "CPA note: write-off and disposal records document inventory review/removal. Confirm final tax treatment and avoid double counting giveaways, donations, disposal losses, manual expenses, or COGS.",
      type: "note",
    },
    { label: "WRITE-OFF / DISPOSAL DETAIL", type: "section" },
    {
      type: "table",
      emptyMessage: "No write-off or disposal records found for this report range.",
      columns: [
        { key: "number", label: "#", width: 22, align: "right" },
        { key: "item", label: "Item", width: 170 },
        { key: "status", label: "Status", width: 58 },
        { key: "qty", label: "Qty", width: 38, align: "right" },
        { key: "date", label: "Date", width: 58 },
        { key: "year", label: "Year", width: 36 },
        { key: "set", label: "Set", width: 70 },
        { key: "itemNumber", label: "Item #", width: 50 },
        { key: "cost", label: "Cost", width: 62, align: "right" },
        { key: "value", label: "Value", width: 62, align: "right" },
        { key: "gainLoss", label: "Gain/Loss", width: 68, align: "right" },
        { key: "reason", label: "Reason / Notes", width: 130 },
      ],
      rows,
    },
  ];

  if (items.length > 250) {
    elements.push({
      label: `${items.length - 250} additional write-off/disposal record(s) not shown in this PDF. Use the CSV export for the full detailed list.`,
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




function buildShippingLines({
  sales,
  reportLabel,
  platformFilter,
}: {
  sales: ShippingSaleRow[];
  reportLabel: string;
  platformFilter: string;
}): PdfElement[] {
  const shipmentCount = sales.length;
  const totalShippingCharged = roundMoney(
    sales.reduce((sum, sale) => sum + getShippingCharged(sale), 0),
  );
  const totalPostageCost = roundMoney(
    sales.reduce((sum, sale) => sum + getPostageCost(sale), 0),
  );
  const totalSuppliesCost = roundMoney(
    sales.reduce((sum, sale) => sum + getShippingSuppliesCost(sale), 0),
  );
  const totalShippingCost = roundMoney(totalPostageCost + totalSuppliesCost);
  const shippingProfitLoss = roundMoney(totalShippingCharged - totalShippingCost);
  const underchargedSales = sales.filter((sale) => {
    const charged = getShippingCharged(sale);
    const cost = getPostageCost(sale) + getShippingSuppliesCost(sale);
    return cost > charged;
  });
  const missingChargedCount = sales.filter(
    (sale) => getShippingCharged(sale) <= 0 && (getPostageCost(sale) > 0 || getShippingSuppliesCost(sale) > 0),
  ).length;
  const averageMargin = shipmentCount > 0 ? shippingProfitLoss / shipmentCount : 0;

  const platformRows = Array.from(
    sales.reduce((map, sale) => {
      const platform = platformKey(sale.platform);
      const charged = getShippingCharged(sale);
      const postage = getPostageCost(sale);
      const supplies = getShippingSuppliesCost(sale);
      const cost = postage + supplies;
      const current = map.get(platform) ?? {
        count: 0,
        charged: 0,
        postage: 0,
        supplies: 0,
        cost: 0,
        margin: 0,
        undercharged: 0,
      };

      map.set(platform, {
        count: current.count + 1,
        charged: current.charged + charged,
        postage: current.postage + postage,
        supplies: current.supplies + supplies,
        cost: current.cost + cost,
        margin: current.margin + (charged - cost),
        undercharged: current.undercharged + (cost > charged ? 1 : 0),
      });

      return map;
    }, new Map<string, { count: number; charged: number; postage: number; supplies: number; cost: number; margin: number; undercharged: number }>()),
  )
    .map(([platform, values]) => ({
      platform,
      count: String(values.count),
      charged: currency(roundMoney(values.charged)),
      postage: currency(roundMoney(values.postage)),
      supplies: currency(roundMoney(values.supplies)),
      cost: currency(roundMoney(values.cost)),
      margin: currency(roundMoney(values.margin)),
      undercharged: String(values.undercharged),
    }))
    .sort((a, b) => a.platform.localeCompare(b.platform));

  const detailRows = sales.slice(0, 250).map((sale, index) => {
    const charged = getShippingCharged(sale);
    const postage = getPostageCost(sale);
    const supplies = getShippingSuppliesCost(sale);
    const cost = postage + supplies;
    const margin = charged - cost;

    return {
      number: String(index + 1),
      date: formatDateForPdf(sale.sale_date),
      platform: platformKey(sale.platform),
      charged: currency(charged),
      postage: currency(postage),
      supplies: currency(supplies),
      cost: currency(roundMoney(cost)),
      margin: currency(roundMoney(margin)),
      status: margin < 0 ? "Undercharged" : margin > 0 ? "Covered" : "Break-even",
      notes: asString(sale.notes),
    };
  });

  const elements: PdfElement[] = [
    { label: reportLabel, type: "title" },
    { label: "SUMMARY", type: "section" },
    {
      type: "summaryGrid",
      cards: [
        { label: "Shipments", value: String(shipmentCount) },
        { label: "Shipping charged", value: currency(totalShippingCharged) },
        { label: "Postage cost", value: currency(totalPostageCost) },
        { label: "Ship P/L", value: currency(shippingProfitLoss) },
      ],
    },
    {
      type: "summaryGrid",
      cards: [
        { label: "Supplies cost", value: currency(totalSuppliesCost) },
        { label: "Total ship cost", value: currency(totalShippingCost) },
        { label: "Avg margin", value: currency(roundMoney(averageMargin)) },
        { label: "Undercharged", value: String(underchargedSales.length) },
      ],
    },
    {
      label:
        platformFilter || missingChargedCount > 0
          ? `Platform filter: ${platformFilter || "All platforms"}. ${missingChargedCount} shipment(s) have shipping cost but no separate shipping charged value currently stored.`
          : `Platform filter: ${platformFilter || "All platforms"}.`,
      type: "note",
    },
    {
      label:
        "Shipping note: postage comes from actual postage/shipping cost fields. Supplies use dedicated supplies/packaging fields when present and fall back to other selling costs where dedicated supplies fields are not yet available.",
      type: "note",
    },
    { label: "PLATFORM SHIPPING SUMMARY", type: "section" },
    {
      type: "table",
      emptyMessage: "No shipping records found for this report range.",
      columns: [
        { key: "platform", label: "Platform", width: 150 },
        { key: "count", label: "Count", width: 55, align: "right" },
        { key: "charged", label: "Charged", width: 90, align: "right" },
        { key: "postage", label: "Postage", width: 90, align: "right" },
        { key: "supplies", label: "Supplies", width: 90, align: "right" },
        { key: "cost", label: "Cost", width: 90, align: "right" },
        { key: "margin", label: "P/L", width: 90, align: "right" },
        { key: "undercharged", label: "Under", width: 69, align: "right" },
      ],
      rows: platformRows,
    },
    { label: "SHIPPING DETAIL", type: "section" },
    {
      type: "table",
      emptyMessage: "No shipping records found for this report range.",
      columns: [
        { key: "number", label: "#", width: 24, align: "right" },
        { key: "date", label: "Date", width: 62 },
        { key: "platform", label: "Platform", width: 80 },
        { key: "charged", label: "Charged", width: 78, align: "right" },
        { key: "postage", label: "Postage", width: 78, align: "right" },
        { key: "supplies", label: "Supplies", width: 78, align: "right" },
        { key: "cost", label: "Cost", width: 78, align: "right" },
        { key: "margin", label: "P/L", width: 78, align: "right" },
        { key: "status", label: "Status", width: 92 },
        { key: "notes", label: "Notes", width: 76 },
      ],
      rows: detailRows,
    },
  ];

  if (sales.length > 250) {
    elements.push({
      label: `${sales.length - 250} additional shipment(s) not shown in this PDF. Use the CSV export for the full detailed list.`,
      type: "note",
    });
  }

  return elements;
}

function buildSalesTaxLines({
  sales,
  reportLabel,
  platformFilter,
  responsibilityFilter,
  channelFilter,
  taxStateFilter,
}: {
  sales: SaleRow[];
  reportLabel: string;
  platformFilter: string;
  responsibilityFilter: string;
  channelFilter: string;
  taxStateFilter: string;
}): PdfElement[] {
  const totalGrossSales = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.gross_sale), 0),
  );
  const totalNetProceeds = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.net_proceeds), 0),
  );
  const totalSalesTaxCollected = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.sales_tax_collected), 0),
  );
  const marketplaceCollectedTax = roundMoney(
    sales
      .filter(
        (row) =>
          normalizeSalesTaxResponsibility(row.sales_tax_responsibility) ===
          "marketplace_collected",
      )
      .reduce((sum, row) => sum + asNumber(row.sales_tax_collected), 0),
  );
  const sellerCollectedTax = roundMoney(
    sales
      .filter(
        (row) =>
          normalizeSalesTaxResponsibility(row.sales_tax_responsibility) ===
          "seller_collected",
      )
      .reduce((sum, row) => sum + asNumber(row.sales_tax_collected), 0),
  );
  const noTaxCollectedCount = sales.filter(
    (row) =>
      normalizeSalesTaxResponsibility(row.sales_tax_responsibility) ===
      "not_collected",
  ).length;
  const exemptOrNotTaxableCount = sales.filter(
    (row) =>
      normalizeSalesTaxResponsibility(row.sales_tax_responsibility) ===
      "exempt_or_not_taxable",
  ).length;

  const responsibilityRows = Array.from(
    sales.reduce((map, sale) => {
      const responsibility = normalizeSalesTaxResponsibility(
        sale.sales_tax_responsibility,
      );
      const current = map.get(responsibility) ?? {
        count: 0,
        gross: 0,
        tax: 0,
        net: 0,
      };

      map.set(responsibility, {
        count: current.count + 1,
        gross: current.gross + asNumber(sale.gross_sale),
        tax: current.tax + asNumber(sale.sales_tax_collected),
        net: current.net + asNumber(sale.net_proceeds),
      });

      return map;
    }, new Map<string, { count: number; gross: number; tax: number; net: number }>()),
  )
    .map(([responsibility, values]) => ({
      responsibility: formatSalesTaxResponsibilityLong(responsibility),
      count: String(values.count),
      gross: currency(roundMoney(values.gross)),
      tax: currency(roundMoney(values.tax)),
      net: currency(roundMoney(values.net)),
    }))
    .sort((a, b) => a.responsibility.localeCompare(b.responsibility));

  const channelRows = Array.from(
    sales.reduce((map, sale) => {
      const channel = normalizeSalesChannelType(sale.sales_channel_type);
      const responsibility = normalizeSalesTaxResponsibility(
        sale.sales_tax_responsibility,
      );
      const current = map.get(channel) ?? {
        count: 0,
        gross: 0,
        tax: 0,
        sellerTax: 0,
      };

      map.set(channel, {
        count: current.count + 1,
        gross: current.gross + asNumber(sale.gross_sale),
        tax: current.tax + asNumber(sale.sales_tax_collected),
        sellerTax:
          current.sellerTax +
          (responsibility === "seller_collected"
            ? asNumber(sale.sales_tax_collected)
            : 0),
      });

      return map;
    }, new Map<string, { count: number; gross: number; tax: number; sellerTax: number }>()),
  )
    .map(([channel, values]) => ({
      channel: formatSalesChannelType(channel),
      count: String(values.count),
      gross: currency(roundMoney(values.gross)),
      tax: currency(roundMoney(values.tax)),
      sellerTax: currency(roundMoney(values.sellerTax)),
    }))
    .sort((a, b) => a.channel.localeCompare(b.channel));

  const detailRows = sales.slice(0, 250).map((sale, index) => ({
    number: String(index + 1),
    date: formatDateForPdf(sale.sale_date),
    platform: platformKey(sale.platform),
    channel: formatSalesChannelType(sale.sales_channel_type),
    responsibility: formatSalesTaxResponsibility(sale.sales_tax_responsibility),
    state: asString(sale.tax_state) || "—",
    tax: currency(asNumber(sale.sales_tax_collected)),
    gross: currency(asNumber(sale.gross_sale)),
    net: currency(asNumber(sale.net_proceeds)),
    notes: asString(sale.tax_notes || sale.notes),
  }));

  const elements: PdfElement[] = [
    { label: reportLabel, type: "title" },
    { label: "SUMMARY", type: "section" },
    {
      type: "summaryGrid",
      cards: [
        { label: "Sales count", value: String(sales.length) },
        { label: "Gross sales", value: currency(totalGrossSales) },
        { label: "Total tax", value: currency(totalSalesTaxCollected) },
        { label: "Seller review", value: currency(sellerCollectedTax) },
      ],
    },
    {
      type: "summaryGrid",
      cards: [
        { label: "Marketplace", value: currency(marketplaceCollectedTax) },
        { label: "No tax", value: String(noTaxCollectedCount) },
        { label: "Exempt", value: String(exemptOrNotTaxableCount) },
        { label: "Net proceeds", value: currency(totalNetProceeds) },
      ],
    },
    {
      label:
        `Filters: platform ${platformFilter || "All platforms"}, responsibility ${responsibilityFilter ? formatSalesTaxResponsibilityLong(responsibilityFilter) : "All"}, channel ${channelFilter ? formatSalesChannelType(channelFilter) : "All"}, state ${taxStateFilter || "All"}.`,
      type: "note",
    },
    {
      label:
        "Sales tax note: marketplace-collected/remitted tax is normally reconciliation support. Seller-collected tax is the amount to review for possible state/local remittance, especially for card shows, local sales, and direct/private sales.",
      type: "note",
    },
    {
      label:
        "CPA note: this report separates marketplace facilitator tax from seller-collected tax. Confirm state-specific filing and remittance rules before relying on this report for filing.",
      type: "note",
    },
    { label: "RESPONSIBILITY SUMMARY", type: "section" },
    {
      type: "table",
      emptyMessage: "No sales tax responsibility records found for this report range.",
      columns: [
        { key: "responsibility", label: "Responsibility", width: 245 },
        { key: "count", label: "Sales", width: 65, align: "right" },
        { key: "gross", label: "Gross", width: 130, align: "right" },
        { key: "tax", label: "Tax", width: 130, align: "right" },
        { key: "net", label: "Net", width: 154, align: "right" },
      ],
      rows: responsibilityRows,
    },
    { label: "CHANNEL SUMMARY", type: "section" },
    {
      type: "table",
      emptyMessage: "No sales tax channel records found for this report range.",
      columns: [
        { key: "channel", label: "Channel", width: 190 },
        { key: "count", label: "Sales", width: 65, align: "right" },
        { key: "gross", label: "Gross", width: 130, align: "right" },
        { key: "tax", label: "Tax", width: 130, align: "right" },
        { key: "sellerTax", label: "Seller Review", width: 209, align: "right" },
      ],
      rows: channelRows,
    },
    { label: "SALES TAX DETAIL", type: "section" },
    {
      type: "table",
      emptyMessage: "No sales found for this sales-tax report range.",
      columns: [
        { key: "number", label: "#", width: 22, align: "right" },
        { key: "date", label: "Date", width: 58 },
        { key: "platform", label: "Platform", width: 68 },
        { key: "channel", label: "Channel", width: 82 },
        { key: "responsibility", label: "Resp.", width: 82 },
        { key: "state", label: "State", width: 38 },
        { key: "tax", label: "Tax", width: 58, align: "right" },
        { key: "gross", label: "Gross", width: 64, align: "right" },
        { key: "net", label: "Net", width: 64, align: "right" },
        { key: "notes", label: "Notes", width: 188 },
      ],
      rows: detailRows,
    },
  ];

  if (sales.length > 250) {
    elements.push({
      label: `${sales.length - 250} additional sale(s) not shown in this PDF. Use CSV export for the full detailed list.`,
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
  const costBasisUnit = asNumber(row.cost_basis_unit);

  if (costBasisTotal > 0) return costBasisTotal;
  if (costBasisUnit > 0) return costBasisUnit * Math.max(quantity, 1);

  return 0;
}

function getFinancialInventoryValue(row: FinancialInventoryRow) {
  const estimatedValueTotal = asNumber(row.estimated_value_total);

  if (estimatedValueTotal > 0) return estimatedValueTotal;

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


function buildProfitLossLines({
  reportLabel,
  startDate,
  endDate,
  sales,
  expenses,
}: {
  reportLabel: string;
  startDate: string;
  endDate: string;
  sales: SaleRow[];
  expenses: ExpenseRow[];
}): PdfElement[] {
  const grossSales = roundMoney(
    sales.reduce((sum, sale) => sum + asNumber(sale.gross_sale), 0),
  );
  const platformFees = roundMoney(
    sales.reduce((sum, sale) => sum + asNumber(sale.platform_fees), 0),
  );
  const shippingCosts = roundMoney(
    sales.reduce((sum, sale) => sum + asNumber(sale.shipping_cost), 0),
  );
  const otherSellingCosts = roundMoney(
    sales.reduce((sum, sale) => sum + asNumber(sale.other_costs), 0),
  );
  const sellingCosts = roundMoney(
    platformFees + shippingCosts + otherSellingCosts,
  );
  const cogs = roundMoney(
    sales.reduce((sum, sale) => sum + asNumber(sale.cost_of_goods_sold), 0),
  );
  const manualExpenses = roundMoney(
    expenses.reduce((sum, expense) => sum + asNumber(expense.amount), 0),
  );
  const grossProfit = roundMoney(grossSales - cogs);
  const netProfit = roundMoney(grossProfit - sellingCosts - manualExpenses);
  const netMargin = grossSales > 0 ? (netProfit / grossSales) * 100 : 0;

  const expenseSummaryRows = Array.from(
    expenses.reduce((map, expense) => {
      const category =
        String(expense.category || "Uncategorized").trim() || "Uncategorized";
      const current = map.get(category) ?? { count: 0, amount: 0 };

      map.set(category, {
        count: current.count + 1,
        amount: roundMoney(current.amount + asNumber(expense.amount)),
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

  const profitLossRows: PdfTableRow[] = [
    {
      section: "Income",
      line: "Gross sales / receipts",
      amount: currency(grossSales),
      notes: "Completed, non-reversed sales in the selected range.",
    },
    {
      section: "COGS",
      line: "Cost of goods sold",
      amount: currency(-cogs),
      notes: "Realized cost basis from sold items only.",
    },
    {
      section: "Gross Profit",
      line: "Gross profit after COGS",
      amount: currency(grossProfit),
      notes: "Gross sales minus realized COGS.",
    },
    {
      section: "Selling Costs",
      line: "Platform fees",
      amount: currency(-platformFees),
      notes: "Marketplace/platform fee fields from sales records.",
    },
    {
      section: "Selling Costs",
      line: "Shipping / postage costs",
      amount: currency(-shippingCosts),
      notes: "Sale-level shipping_cost values.",
    },
    {
      section: "Selling Costs",
      line: "Other direct selling costs",
      amount: currency(-otherSellingCosts),
      notes: "Sale-level other_costs values, commonly supplies/packing costs.",
    },
    {
      section: "Expenses",
      line: "Manual expenses",
      amount: currency(-manualExpenses),
      notes: "Expense tracker entries in the selected range.",
    },
    {
      section: "Net Profit",
      line: "Net profit / loss",
      amount: currency(netProfit),
      notes: "Gross profit minus selling costs and manual expenses.",
    },
  ];

  return [
    { label: reportLabel, type: "title" },
    { label: `Range: ${formatReportDate(startDate)} to ${formatReportDate(endDate)}`, type: "note" },
    {
      label:
        "Profit & Loss note: this is a read-only management statement based on completed non-reversed sales, realized COGS, selling costs, and tracked manual expenses.",
      type: "note",
    },
    { label: "SUMMARY", type: "section" },
    {
      type: "summaryGrid",
      cards: [
        { label: "Gross sales", value: currency(grossSales) },
        { label: "Realized COGS", value: currency(cogs) },
        { label: "Gross profit", value: currency(grossProfit) },
        { label: "Net profit", value: currency(netProfit) },
      ],
    },
    {
      type: "summaryGrid",
      cards: [
        { label: "Selling costs", value: currency(sellingCosts) },
        { label: "Manual expenses", value: currency(manualExpenses) },
        { label: "Sales records", value: String(sales.length) },
        { label: "Net margin", value: `${netMargin.toFixed(1)}%` },
      ],
    },
    { label: "PROFIT & LOSS STATEMENT", type: "section" },
    {
      type: "table",
      emptyMessage: "No profit and loss rows found for this report range.",
      columns: [
        { key: "section", label: "Section", width: 145 },
        { key: "line", label: "Line", width: 235 },
        { key: "amount", label: "Amount", width: 115, align: "right" },
        { key: "notes", label: "Notes", width: 229 },
      ],
      rows: profitLossRows,
    },
    { label: "EXPENSE CATEGORY SUPPORT", type: "section" },
    {
      type: "table",
      emptyMessage: "No manual expenses found for this P&L report range.",
      columns: [
        { key: "category", label: "Category", width: 190 },
        { key: "scheduleCArea", label: "Schedule C Area", width: 360 },
        { key: "count", label: "Count", width: 70, align: "right" },
        { key: "amount", label: "Amount", width: 104, align: "right" },
      ],
      rows: expenseSummaryRows,
    },
    {
      label:
        "CPA note: this P&L is for bookkeeping/business review. Final tax filing should still be reviewed with the Year-End Tax Center and CPA-ready tax reports.",
      type: "note",
    },
  ];
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
          const unitCost = asNumber(row.cost_basis_unit ?? 0);
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


function formatDisposalReason(value: string | null | undefined) {
  if (!value) return "Not specified";

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildDisposalItemName(item: DisposalInventoryRow | undefined) {
  if (!item) return "Inventory item not found";

  const title = item.title || item.item_name || item.player_name || "Untitled item";
  const parts = [
    item.year ? String(item.year) : "",
    item.set_name || "",
    item.card_number ? `#${item.card_number}` : "",
  ].filter(Boolean);

  return parts.length ? `${title} - ${parts.join(" ")}` : title;
}


function getBreakDate(row: BreakRow) {
  return row.break_date || null;
}

function getBreakSource(row: BreakRow & Record<string, unknown>) {
  return (
    asString(row.source_name) ||
    asString(row.seller_name) ||
    asString(row.breaker_name) ||
    "Unknown source"
  );
}

function getBreakProduct(row: BreakRow) {
  return row.product_name || row.order_number || "Untitled break";
}

function getInventoryBreakId(row: InventoryItemRow & Record<string, unknown>) {
  return (
    asString(row.break_id) ||
    asString(row.source_break_id) ||
    asString(row.order_id)
  );
}

function getItemRemainingQuantity(row: InventoryItemRow) {
  const availableQuantity = asNumber(row.available_quantity);
  const quantity = asNumber(row.quantity);
  const status = normalizeStatus(row.status).toLowerCase();

  if (availableQuantity > 0) return availableQuantity;
  if (quantity > 0 && status !== "sold" && status !== "disposed") return quantity;

  return 0;
}

function getBreakSuggestedAction({
  itemCount,
  soldItemCount,
  remainingItemCount,
  projectedProfitLoss,
  realizedProfit,
}: {
  itemCount: number;
  soldItemCount: number;
  remainingItemCount: number;
  projectedProfitLoss: number;
  realizedProfit: number;
}) {
  if (itemCount === 0) return "No inventory linked";
  if (soldItemCount === 0 && remainingItemCount > 0) return "No sales yet";
  if (projectedProfitLoss < 0 && remainingItemCount > 0) return "Reprice / sell remaining";
  if (projectedProfitLoss < 0) return "Loss review";
  if (remainingItemCount > 0 && realizedProfit > 0) return "Profit locked / review remaining";
  if (remainingItemCount > 0) return "Monitor remaining inventory";
  return "Completed break review";
}

function matchesBreakProfitabilityStatus(row: Record<string, unknown>, status: string) {
  if (!status || status === "all") return true;

  const remainingItemCount = asNumber(row.remainingItemCount);
  const soldItemCount = asNumber(row.soldItemCount);
  const itemCount = asNumber(row.itemCount);
  const projectedProfitLoss = asNumber(row.projectedProfitLoss);

  if (status === "open") return remainingItemCount > 0;
  if (status === "profitable") return projectedProfitLoss > 0;
  if (status === "loss") return projectedProfitLoss < 0;
  if (status === "unsold") return soldItemCount === 0;
  if (status === "partial") return soldItemCount > 0 && remainingItemCount > 0;
  if (status === "complete") return remainingItemCount <= 0 && itemCount > 0;

  return asString(row.status).toLowerCase() === status.toLowerCase();
}

function matchesBreakProfitabilityBucket(row: Record<string, unknown>, profitability: string) {
  if (!profitability || profitability === "all") return true;

  const projectedProfitLoss = asNumber(row.projectedProfitLoss);
  const remainingItemCount = asNumber(row.remainingItemCount);
  const soldItemCount = asNumber(row.soldItemCount);
  const itemCount = asNumber(row.itemCount);

  if (profitability === "green") return projectedProfitLoss > 0;
  if (profitability === "red") return projectedProfitLoss < 0;
  if (profitability === "unrealized") return remainingItemCount > soldItemCount;
  if (profitability === "needs-review") {
    return itemCount === 0 || projectedProfitLoss < 0 || soldItemCount === 0;
  }

  return true;
}



function buildMarketplaceFeesLines({
  sales,
  reportLabel,
  platformFilter,
  search,
}: {
  sales: SaleRow[];
  reportLabel: string;
  platformFilter: string;
  search: string;
}): PdfElement[] {
  const filteredSales = sales.filter((sale) => {
    if (platformFilter && platformFilter !== "all" && platformKey(sale.platform) !== platformFilter) {
      return false;
    }

    if (!search) return true;

    const haystack = [
      sale.sale_date,
      sale.platform,
      sale.gross_sale,
      sale.platform_fees,
      sale.net_proceeds,
      sale.profit,
      sale.notes,
    ]
      .map(asString)
      .join(" ")
      .toLowerCase();

    return haystack.includes(search.toLowerCase());
  });

  const totalGrossSales = roundMoney(
    filteredSales.reduce((sum, sale) => sum + asNumber(sale.gross_sale), 0),
  );
  const totalPlatformFees = roundMoney(
    filteredSales.reduce((sum, sale) => sum + asNumber(sale.platform_fees), 0),
  );
  const totalNetProceeds = roundMoney(
    filteredSales.reduce((sum, sale) => sum + asNumber(sale.net_proceeds), 0),
  );
  const totalProfit = roundMoney(
    filteredSales.reduce((sum, sale) => sum + asNumber(sale.profit), 0),
  );
  const averageFeeRate =
    totalGrossSales > 0 ? roundMoney((totalPlatformFees / totalGrossSales) * 100) : 0;

  const platformRows = Array.from(
    filteredSales.reduce((map, sale) => {
      const platform = platformKey(sale.platform);
      const current = map.get(platform) ?? {
        count: 0,
        gross: 0,
        fees: 0,
        net: 0,
        profit: 0,
      };

      map.set(platform, {
        count: current.count + 1,
        gross: current.gross + asNumber(sale.gross_sale),
        fees: current.fees + asNumber(sale.platform_fees),
        net: current.net + asNumber(sale.net_proceeds),
        profit: current.profit + asNumber(sale.profit),
      });

      return map;
    }, new Map<string, { count: number; gross: number; fees: number; net: number; profit: number }>()),
  )
    .map(([platform, values]) => {
      const feeRate = values.gross > 0 ? roundMoney((values.fees / values.gross) * 100) : 0;

      return {
        platform,
        sales: String(values.count),
        gross: currency(roundMoney(values.gross)),
        fees: currency(roundMoney(values.fees)),
        feeRate: `${feeRate.toFixed(1)}%`,
        net: currency(roundMoney(values.net)),
        profit: currency(roundMoney(values.profit)),
        review:
          feeRate > 20
            ? "High fee rate review"
            : values.fees <= 0 && values.gross > 0
              ? "No fee recorded"
              : "OK",
      };
    })
    .sort((a, b) => asNumber(b.fees) - asNumber(a.fees));

  const detailRows = filteredSales.slice(0, 250).map((sale, index) => {
    const gross = asNumber(sale.gross_sale);
    const fees = asNumber(sale.platform_fees);
    const feeRate = gross > 0 ? roundMoney((fees / gross) * 100) : 0;

    return {
      number: String(index + 1),
      date: formatDateForPdf(sale.sale_date),
      platform: platformKey(sale.platform),
      gross: currency(gross),
      fees: currency(fees),
      feeRate: `${feeRate.toFixed(1)}%`,
      net: currency(asNumber(sale.net_proceeds)),
      profit: currency(asNumber(sale.profit)),
      notes: asString(sale.notes),
    };
  });

  const elements: PdfElement[] = [
    { label: `Marketplace Fee Report - ${reportLabel}`, type: "title" },
    { label: "SUMMARY", type: "section" },
    {
      type: "summaryGrid",
      cards: [
        { label: "Sales", value: String(filteredSales.length) },
        { label: "Gross sales", value: currency(totalGrossSales) },
        { label: "Platform fees", value: currency(totalPlatformFees) },
        { label: "Fee rate", value: `${averageFeeRate.toFixed(1)}%` },
      ],
    },
    {
      type: "summaryGrid",
      cards: [
        { label: "Net proceeds", value: currency(totalNetProceeds) },
        { label: "Profit", value: currency(totalProfit) },
        { label: "Platform filter", value: platformFilter || "All platforms" },
        { label: "Search", value: search || "None" },
      ],
    },
    {
      label:
        "Marketplace fee note: platform fees are selling costs. Use this report to compare fee burden by marketplace and spot missing or unusually high fee records.",
      type: "note",
    },
    { label: "PLATFORM FEE SUMMARY", type: "section" },
    {
      type: "table",
      emptyMessage: "No marketplace fee records found for this report range.",
      columns: [
        { key: "platform", label: "Platform", width: 170 },
        { key: "sales", label: "Sales", width: 55, align: "right" },
        { key: "gross", label: "Gross Sales", width: 105, align: "right" },
        { key: "fees", label: "Fees", width: 100, align: "right" },
        { key: "feeRate", label: "Fee Rate", width: 75, align: "right" },
        { key: "net", label: "Net", width: 100, align: "right" },
        { key: "profit", label: "Profit", width: 100, align: "right" },
        { key: "review", label: "Review", width: 119 },
      ],
      rows: platformRows,
    },
    { label: "SALE FEE DETAIL", type: "section" },
    {
      type: "table",
      emptyMessage: "No sale fee records found for this report range.",
      columns: [
        { key: "number", label: "#", width: 22, align: "right" },
        { key: "date", label: "Date", width: 58 },
        { key: "platform", label: "Platform", width: 88 },
        { key: "gross", label: "Gross", width: 76, align: "right" },
        { key: "fees", label: "Fees", width: 72, align: "right" },
        { key: "feeRate", label: "Rate", width: 58, align: "right" },
        { key: "net", label: "Net", width: 76, align: "right" },
        { key: "profit", label: "Profit", width: 76, align: "right" },
        { key: "notes", label: "Notes", width: 198 },
      ],
      rows: detailRows,
    },
  ];

  if (filteredSales.length > 250) {
    elements.push({
      label: `${filteredSales.length - 250} additional sale(s) not shown in this PDF. Use CSV export for the full detail.`,
      type: "note",
    });
  }

  return elements;
}


function buildPlatformProfitabilityLines({
  sales,
  reportLabel,
  platformFilter,
  search,
}: {
  sales: SaleRow[];
  reportLabel: string;
  platformFilter: string;
  search: string;
}): PdfElement[] {
  const filteredSales = sales.filter((sale) => {
    if (platformFilter && platformFilter !== "all" && platformKey(sale.platform) !== platformFilter) return false;

    if (search) {
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

      if (!haystack.includes(search.toLowerCase())) return false;
    }

    return true;
  });

  const totalGrossSales = roundMoney(
    filteredSales.reduce((sum, sale) => sum + Number(sale.gross_sale ?? 0), 0),
  );
  const totalPlatformFees = roundMoney(
    filteredSales.reduce((sum, sale) => sum + Number(sale.platform_fees ?? 0), 0),
  );
  const totalShippingCosts = roundMoney(
    filteredSales.reduce((sum, sale) => sum + Number(sale.shipping_cost ?? 0), 0),
  );
  const totalOtherCosts = roundMoney(
    filteredSales.reduce((sum, sale) => sum + Number(sale.other_costs ?? 0), 0),
  );
  const totalSellingCosts = roundMoney(totalPlatformFees + totalShippingCosts + totalOtherCosts);
  const totalNetProceeds = roundMoney(
    filteredSales.reduce((sum, sale) => sum + Number(sale.net_proceeds ?? 0), 0),
  );
  const totalCOGS = roundMoney(
    filteredSales.reduce((sum, sale) => sum + Number(sale.cost_of_goods_sold ?? 0), 0),
  );
  const totalProfit = roundMoney(
    filteredSales.reduce((sum, sale) => sum + Number(sale.profit ?? 0), 0),
  );

  const platformRows = Array.from(
    filteredSales.reduce((map, sale) => {
      const platform = platformKey(sale.platform);
      const current = map.get(platform) ?? {
        count: 0,
        gross: 0,
        fees: 0,
        shipping: 0,
        other: 0,
        net: 0,
        cogs: 0,
        profit: 0,
      };

      map.set(platform, {
        count: current.count + 1,
        gross: current.gross + Number(sale.gross_sale ?? 0),
        fees: current.fees + Number(sale.platform_fees ?? 0),
        shipping: current.shipping + Number(sale.shipping_cost ?? 0),
        other: current.other + Number(sale.other_costs ?? 0),
        net: current.net + Number(sale.net_proceeds ?? 0),
        cogs: current.cogs + Number(sale.cost_of_goods_sold ?? 0),
        profit: current.profit + Number(sale.profit ?? 0),
      });

      return map;
    }, new Map<string, { count: number; gross: number; fees: number; shipping: number; other: number; net: number; cogs: number; profit: number }>()),
  )
    .map(([platform, values]) => {
      const sellingCosts = roundMoney(values.fees + values.shipping + values.other);
      const marginPercent = values.gross > 0 ? values.profit / values.gross : null;
      const averageProfit = values.count > 0 ? values.profit / values.count : 0;

      return {
        platform,
        count: String(values.count),
        gross: currency(roundMoney(values.gross)),
        fees: currency(roundMoney(values.fees)),
        shipping: currency(roundMoney(values.shipping)),
        other: currency(roundMoney(values.other)),
        sellingCosts: currency(sellingCosts),
        net: currency(roundMoney(values.net)),
        cogs: currency(roundMoney(values.cogs)),
        profit: currency(roundMoney(values.profit)),
        avgProfit: currency(roundMoney(averageProfit)),
        margin: marginPercent === null ? "" : `${(marginPercent * 100).toFixed(1)}%`,
      };
    })
    .sort((a, b) => a.platform.localeCompare(b.platform));

  const detailRows = filteredSales.slice(0, 250).map((sale, index) => ({
    number: String(index + 1),
    date: formatDateForPdf(sale.sale_date),
    platform: platformKey(sale.platform),
    gross: currency(Number(sale.gross_sale ?? 0)),
    fees: currency(Number(sale.platform_fees ?? 0)),
    shipping: currency(Number(sale.shipping_cost ?? 0)),
    other: currency(Number(sale.other_costs ?? 0)),
    net: currency(Number(sale.net_proceeds ?? 0)),
    cogs: currency(Number(sale.cost_of_goods_sold ?? 0)),
    profit: currency(Number(sale.profit ?? 0)),
    notes: asString(sale.notes),
  }));

  const elements: PdfElement[] = [
    { label: `Platform Profitability Report - ${reportLabel}`, type: "title" },
    { label: "SUMMARY", type: "section" },
    {
      type: "summaryGrid",
      cards: [
        { label: "Sales", value: String(filteredSales.length) },
        { label: "Gross sales", value: currency(totalGrossSales) },
        { label: "Net proceeds", value: currency(totalNetProceeds) },
        { label: "Profit", value: currency(totalProfit) },
      ],
    },
    {
      type: "summaryGrid",
      cards: [
        { label: "Platform fees", value: currency(totalPlatformFees) },
        { label: "Shipping costs", value: currency(totalShippingCosts) },
        { label: "Other costs", value: currency(totalOtherCosts) },
        { label: "Selling costs", value: currency(totalSellingCosts) },
      ],
    },
    {
      label:
        "Platform profitability note: this report compares sales performance by platform using completed, non-reversed sales. Profit depends on accurate sale links, COGS, platform fees, shipping cost, and other selling costs.",
      type: "note",
    },
    { label: "PLATFORM SUMMARY", type: "section" },
    {
      type: "table",
      emptyMessage: "No platform profitability records found for this report range.",
      columns: [
        { key: "platform", label: "Platform", width: 110 },
        { key: "count", label: "Sales", width: 42, align: "right" },
        { key: "gross", label: "Gross", width: 72, align: "right" },
        { key: "fees", label: "Fees", width: 62, align: "right" },
        { key: "shipping", label: "Ship", width: 62, align: "right" },
        { key: "other", label: "Other", width: 62, align: "right" },
        { key: "net", label: "Net", width: 72, align: "right" },
        { key: "cogs", label: "COGS", width: 72, align: "right" },
        { key: "profit", label: "Profit", width: 72, align: "right" },
        { key: "avgProfit", label: "Avg", width: 58, align: "right" },
        { key: "margin", label: "Margin", width: 40, align: "right" },
      ],
      rows: platformRows,
    },
    { label: "SALE DETAIL", type: "section" },
    {
      type: "table",
      emptyMessage: "No sales found for this platform profitability report range.",
      columns: [
        { key: "number", label: "#", width: 22, align: "right" },
        { key: "date", label: "Date", width: 58 },
        { key: "platform", label: "Platform", width: 72 },
        { key: "gross", label: "Gross", width: 58, align: "right" },
        { key: "fees", label: "Fees", width: 52, align: "right" },
        { key: "shipping", label: "Ship", width: 52, align: "right" },
        { key: "other", label: "Other", width: 52, align: "right" },
        { key: "net", label: "Net", width: 58, align: "right" },
        { key: "cogs", label: "COGS", width: 58, align: "right" },
        { key: "profit", label: "Profit", width: 58, align: "right" },
        { key: "notes", label: "Notes", width: 184 },
      ],
      rows: detailRows,
    },
  ];

  if (filteredSales.length > 250) {
    elements.push({
      label: `${filteredSales.length - 250} additional sale(s) not shown in this PDF. Use CSV export for the full detail.`,
      type: "note",
    });
  }

  return elements;
}

function buildOperationsLines({
  reportLabel,
  sales,
  expenses,
  breaks,
  inventoryItems,
  search,
}: {
  reportLabel: string;
  sales: SaleRow[];
  expenses: ExpenseRow[];
  breaks: BreakRow[];
  inventoryItems: InventoryItemRow[];
  search: string;
}): PdfElement[] {
  const filteredSales = sales.filter((sale) =>
    financialMatchesSearch(
      [sale.sale_date, sale.platform, sale.gross_sale, sale.net_proceeds, sale.profit, sale.notes],
      search,
    ),
  );
  const filteredExpenses = expenses.filter((expense) =>
    financialMatchesSearch(
      [expense.expense_date, expense.category, expense.vendor, expense.amount, expense.notes],
      search,
    ),
  );
  const filteredBreaks = breaks.filter((row) =>
    financialMatchesSearch(
      [row.break_date, row.source_name, row.product_name, row.order_number, row.total_cost],
      search,
    ),
  );
  const filteredInventory = inventoryItems.filter((item) =>
    financialMatchesSearch(
      [item.title, item.item_name, item.player_name, item.year, item.set_name, item.card_number, item.item_number, item.status, item.notes],
      search,
    ),
  );

  const openInventory = filteredInventory.filter((item) => {
    const status = normalizeStatus(item.status).toLowerCase();
    return status !== "sold" && status !== "disposed" && status !== "archived";
  });
  const actionNeeded = openInventory.filter((item) => matchesActionNeededFilter(item, "needed"));
  const aged90 = openInventory.filter((item) => {
    const daysHeld = getDaysHeld(item);
    return daysHeld !== null && daysHeld >= 90;
  });
  const missingCost = openInventory.filter((item) => getItemCost(item) <= 0);
  const missingValue = openInventory.filter((item) => getItemValue(item) <= 0);

  const totalGrossSales = roundMoney(filteredSales.reduce((sum, sale) => sum + Number(sale.gross_sale ?? 0), 0));
  const totalNetProceeds = roundMoney(filteredSales.reduce((sum, sale) => sum + Number(sale.net_proceeds ?? 0), 0));
  const totalProfit = roundMoney(filteredSales.reduce((sum, sale) => sum + Number(sale.profit ?? 0), 0));
  const totalExpenses = roundMoney(filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0));
  const totalBreakCost = roundMoney(filteredBreaks.reduce((sum, row) => sum + Number(row.total_cost ?? 0), 0));
  const openInventoryCost = roundMoney(openInventory.reduce((sum, item) => sum + getItemCost(item), 0));
  const openInventoryValue = roundMoney(openInventory.reduce((sum, item) => sum + getItemValue(item), 0));

  const rows: PdfTableRow[] = [
    {
      section: "Sales",
      metric: "Completed sales",
      count: String(filteredSales.length),
      amount: currency(totalGrossSales),
      notes: "Gross sales in selected range.",
    },
    {
      section: "Sales",
      metric: "Net proceeds",
      count: String(filteredSales.length),
      amount: currency(totalNetProceeds),
      notes: "After platform/selling costs as recorded.",
    },
    {
      section: "Sales",
      metric: "Profit",
      count: String(filteredSales.length),
      amount: currency(totalProfit),
      notes: "Profit field from completed sales.",
    },
    {
      section: "Expenses",
      metric: "Manual expenses",
      count: String(filteredExpenses.length),
      amount: currency(totalExpenses),
      notes: "Expenses in selected range.",
    },
    {
      section: "Purchases",
      metric: "Break purchases",
      count: String(filteredBreaks.length),
      amount: currency(totalBreakCost),
      notes: "Break/acquisition records in selected range.",
    },
    {
      section: "Inventory",
      metric: "Open inventory",
      count: String(openInventory.length),
      amount: currency(openInventoryCost),
      notes: "Current non-sold inventory cost basis.",
    },
    {
      section: "Inventory",
      metric: "Estimated value",
      count: String(openInventory.length),
      amount: currency(openInventoryValue),
      notes: "Current estimated value for open inventory.",
    },
    {
      section: "Workflow",
      metric: "Action needed",
      count: String(actionNeeded.length),
      amount: "",
      notes: "Missing cost/value, stale listed/available, PC review, junk/disposal candidates.",
    },
    {
      section: "Workflow",
      metric: "90+ day inventory",
      count: String(aged90.length),
      amount: "",
      notes: "Open inventory held 90+ days.",
    },
    {
      section: "Workflow",
      metric: "Missing cost basis",
      count: String(missingCost.length),
      amount: "",
      notes: "Open inventory with zero/missing cost basis.",
    },
    {
      section: "Workflow",
      metric: "Missing estimated value",
      count: String(missingValue.length),
      amount: "",
      notes: "Open inventory with no current estimated value.",
    },
  ];

  return [
    { label: `Operations Report - ${reportLabel}`, type: "title" },
    { label: "SUMMARY", type: "section" },
    {
      type: "summaryGrid",
      cards: [
        { label: "Sales", value: String(filteredSales.length) },
        { label: "Breaks", value: String(filteredBreaks.length) },
        { label: "Expenses", value: String(filteredExpenses.length) },
        { label: "Open inventory", value: String(openInventory.length) },
      ],
    },
    {
      type: "summaryGrid",
      cards: [
        { label: "Gross sales", value: currency(totalGrossSales) },
        { label: "Profit", value: currency(totalProfit) },
        { label: "Expenses", value: currency(totalExpenses) },
        { label: "Open cost basis", value: currency(openInventoryCost) },
      ],
    },
    {
      label:
        "Operations note: this is a read-only workflow report for business review. It does not change inventory, COGS, sales, expenses, or tax records.",
      type: "note",
    },
    { label: "OPERATIONS DETAIL", type: "section" },
    {
      type: "table",
      emptyMessage: "No operations rows found for this report range.",
      columns: [
        { key: "section", label: "Section", width: 100 },
        { key: "metric", label: "Metric", width: 190 },
        { key: "count", label: "Count", width: 70, align: "right" },
        { key: "amount", label: "Amount", width: 110, align: "right" },
        { key: "notes", label: "Notes", width: 254 },
      ],
      rows,
    },
  ];
}

function buildBreakProfitabilityLines({
  breaks,
  inventoryItems,
  sales,
  reportLabel,
  sourceFilter,
  statusFilter,
  profitabilityFilter,
  search,
}: {
  breaks: (BreakRow & Record<string, unknown>)[];
  inventoryItems: (InventoryItemRow & Record<string, unknown>)[];
  sales: SaleRow[];
  reportLabel: string;
  sourceFilter: string;
  statusFilter: string;
  profitabilityFilter: string;
  search: string;
}): PdfElement[] {
  const inventoryByBreakId = new Map<string, (InventoryItemRow & Record<string, unknown>)[]>();

  inventoryItems.forEach((item) => {
    const breakId = getInventoryBreakId(item);
    if (!breakId) return;

    const existing = inventoryByBreakId.get(breakId) ?? [];
    existing.push(item);
    inventoryByBreakId.set(breakId, existing);
  });

  const salesByInventoryId = new Map<string, SaleRow[]>();

  sales.forEach((sale) => {
    const inventoryId = sale.inventory_item_id;
    if (!inventoryId) return;

    const existing = salesByInventoryId.get(inventoryId) ?? [];
    existing.push(sale);
    salesByInventoryId.set(inventoryId, existing);
  });

  const rowsRaw = breaks.map((breakRow) => {
    const linkedItems = inventoryByBreakId.get(breakRow.id) ?? [];
    const linkedSales = linkedItems.flatMap((item) => salesByInventoryId.get(item.id) ?? []);
    const breakCost = asNumber(breakRow.total_cost);
    const grossSales = roundMoney(linkedSales.reduce((sum, sale) => sum + asNumber(sale.gross_sale), 0));
    const netProceeds = roundMoney(linkedSales.reduce((sum, sale) => sum + asNumber(sale.net_proceeds), 0));
    const realizedCogs = roundMoney(linkedSales.reduce((sum, sale) => sum + asNumber(sale.cost_of_goods_sold), 0));
    const realizedProfit = roundMoney(linkedSales.reduce((sum, sale) => sum + asNumber(sale.profit), 0));

    const soldItemIds = new Set(
      linkedSales
        .map((sale) => sale.inventory_item_id)
        .filter((id): id is string => Boolean(id)),
    );

    const remainingItems = linkedItems.filter((item) => {
      const status = normalizeStatus(item.status).toLowerCase();
      return status !== "sold" && status !== "disposed" && getItemRemainingQuantity(item) > 0;
    });

    const remainingCostBasis = roundMoney(remainingItems.reduce((sum, item) => sum + getItemCost(item), 0));
    const remainingEstimatedValue = roundMoney(remainingItems.reduce((sum, item) => sum + getItemValue(item), 0));
    const projectedTotalValue = roundMoney(netProceeds + remainingEstimatedValue);
    const projectedProfitLoss = roundMoney(projectedTotalValue - breakCost);
    const roiPercent = breakCost > 0 ? projectedProfitLoss / breakCost : null;

    const baseRow = {
      id: breakRow.id,
      breakDate: getBreakDate(breakRow) || "",
      source: getBreakSource(breakRow),
      product: getBreakProduct(breakRow),
      orderNumber: asString(breakRow.order_number),
      status: asString((breakRow as Record<string, unknown>).status) || "open",
      notes: asString((breakRow as Record<string, unknown>).notes),
      breakCost,
      itemCount: linkedItems.length,
      soldItemCount: soldItemIds.size,
      remainingItemCount: remainingItems.length,
      grossSales,
      netProceeds,
      realizedCogs,
      realizedProfit,
      remainingCostBasis,
      remainingEstimatedValue,
      projectedTotalValue,
      projectedProfitLoss,
      roiPercent,
    };

    return {
      ...baseRow,
      suggestedAction: getBreakSuggestedAction(baseRow),
    };
  });

  const filteredRows = rowsRaw.filter((row) => {
    if (sourceFilter && sourceFilter !== "all" && row.source !== sourceFilter) return false;
    if (!matchesBreakProfitabilityStatus(row, statusFilter)) return false;
    if (!matchesBreakProfitabilityBucket(row, profitabilityFilter)) return false;

    if (search) {
      const haystack = [
        row.breakDate,
        row.source,
        row.product,
        row.orderNumber,
        row.status,
        row.notes,
        row.suggestedAction,
      ].join(" ").toLowerCase();

      if (!haystack.includes(search.toLowerCase())) return false;
    }

    return true;
  });

  const totalBreakCost = roundMoney(filteredRows.reduce((sum, row) => sum + row.breakCost, 0));
  const totalNetProceeds = roundMoney(filteredRows.reduce((sum, row) => sum + row.netProceeds, 0));
  const totalRealizedProfit = roundMoney(filteredRows.reduce((sum, row) => sum + row.realizedProfit, 0));
  const totalRemainingBasis = roundMoney(filteredRows.reduce((sum, row) => sum + row.remainingCostBasis, 0));
  const totalRemainingValue = roundMoney(filteredRows.reduce((sum, row) => sum + row.remainingEstimatedValue, 0));
  const projectedProfitLoss = roundMoney(filteredRows.reduce((sum, row) => sum + row.projectedProfitLoss, 0));
  const lossBreakCount = filteredRows.filter((row) => row.projectedProfitLoss < 0).length;
  const noSalesCount = filteredRows.filter((row) => row.soldItemCount === 0).length;

  const detailRows = filteredRows.slice(0, 250).map((row, index) => ({
    number: String(index + 1),
    date: formatDateForPdf(row.breakDate),
    source: row.source,
    product: row.product,
    order: row.orderNumber,
    cost: currency(row.breakCost),
    items: `${row.soldItemCount}/${row.itemCount}`,
    remaining: String(row.remainingItemCount),
    net: currency(row.netProceeds),
    realized: currency(row.realizedProfit),
    basis: currency(row.remainingCostBasis),
    value: currency(row.remainingEstimatedValue),
    projected: currency(row.projectedProfitLoss),
    roi: row.roiPercent === null ? "" : `${(row.roiPercent * 100).toFixed(1)}%`,
    action: row.suggestedAction,
  }));

  const elements: PdfElement[] = [
    { label: `Break Profitability Report - ${reportLabel}`, type: "title" },
    { label: "SUMMARY", type: "section" },
    {
      type: "summaryGrid",
      cards: [
        { label: "Breaks", value: String(filteredRows.length) },
        { label: "Break cost", value: currency(totalBreakCost) },
        { label: "Net proceeds", value: currency(totalNetProceeds) },
        { label: "Projected P/L", value: currency(projectedProfitLoss) },
      ],
    },
    {
      type: "summaryGrid",
      cards: [
        { label: "Realized profit", value: currency(totalRealizedProfit) },
        { label: "Remaining basis", value: currency(totalRemainingBasis) },
        { label: "Remaining value", value: currency(totalRemainingValue) },
        { label: "Loss breaks", value: String(lossBreakCount) },
      ],
    },
    {
      label: `Filters: source ${sourceFilter || "all"}, status ${statusFilter || "all"}, profitability ${profitabilityFilter || "all"}, no-sales breaks ${noSalesCount}.`,
      type: "note",
    },
    {
      label:
        "Tax-safe note: realized profit is based on completed linked sales. Unsold items remain inventory; their remaining cost basis should not be deducted until sold, disposed, given away with documentation, or otherwise finalized.",
      type: "note",
    },
    { label: "BREAK PROFITABILITY DETAIL", type: "section" },
    {
      type: "table",
      emptyMessage: "No breaks matched this profitability report filter.",
      columns: [
        { key: "number", label: "#", width: 22, align: "right" },
        { key: "date", label: "Date", width: 56 },
        { key: "source", label: "Source", width: 82 },
        { key: "product", label: "Break", width: 132 },
        { key: "order", label: "Order #", width: 62 },
        { key: "cost", label: "Cost", width: 58, align: "right" },
        { key: "items", label: "Items", width: 42, align: "right" },
        { key: "remaining", label: "Remain", width: 42, align: "right" },
        { key: "net", label: "Net", width: 56, align: "right" },
        { key: "realized", label: "Realized", width: 62, align: "right" },
        { key: "basis", label: "Basis", width: 58, align: "right" },
        { key: "value", label: "Value", width: 58, align: "right" },
        { key: "projected", label: "Proj P/L", width: 64, align: "right" },
        { key: "roi", label: "ROI", width: 42, align: "right" },
      ],
      rows: detailRows,
    },
  ];

  if (filteredRows.length > 250) {
    elements.push({
      label: `${filteredRows.length - 250} additional break(s) not shown in this PDF. Use CSV export for the full detail.`,
      type: "note",
    });
  }

  return elements;
}

function buildCpaPacketLines({
  selectedYear,
  startDate,
  endDate,
  sales,
  expenses,
  breaks,
  endingInventory,
  taxSettings,
  disposalTransactions,
  disposalItemsById,
}: {
  selectedYear: number;
  startDate: string;
  endDate: string;
  sales: SaleRow[];
  expenses: ExpenseRow[];
  breaks: BreakRow[];
  endingInventory: FinancialInventoryRow[];
  taxSettings: TaxYearSettingsRow | null;
  disposalTransactions: DisposalTransactionRow[];
  disposalItemsById: Map<string, DisposalInventoryRow>;
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
  const missingCostBasisCount = endingInventory.filter(
    (row) => getFinancialInventoryCost(row) <= 0,
  ).length;
  const unlinkedSalesCount = sales.filter((sale) => !sale.inventory_item_id).length;
  const uncategorizedExpenseCount = expenses.filter((expense) => {
    const category = String(expense.category ?? "").trim().toLowerCase();
    return !category || category === "uncategorized" || category.includes("uncategorized") || category === "other" || category.includes("other");
  }).length;
  const disposalRowsMissingReason = disposalTransactions.filter((row) => !String(row.disposal_reason ?? "").trim()).length;
  const disposalRowsMissingNotes = disposalTransactions.filter((row) => !String(row.disposal_notes ?? "").trim()).length;

  const readinessWarnings: string[] = [];

  if (!taxSettings) {
    readinessWarnings.push("No yearly tax settings record exists yet. Beginning inventory and extra Schedule C lines are using zero defaults.");
  }

  if (beginningInventory === 0 && (totalCOGS > 0 || endingInventoryCost > 0)) {
    readinessWarnings.push("Beginning inventory is zero. Confirm this is correct before filing.");
  }

  if (lockedEndingInventory == null) {
    readinessWarnings.push("Ending inventory is not locked. The packet is using current live inventory cost, which can change if inventory changes.");
  }

  if (missingCostBasisCount > 0) {
    readinessWarnings.push(`${missingCostBasisCount} open inventory item(s) have missing or zero cost basis.`);
  }

  if (unlinkedSalesCount > 0) {
    readinessWarnings.push(`${unlinkedSalesCount} sale(s) are not linked to an inventory item.`);
  }

  if (uncategorizedExpenseCount > 0) {
    readinessWarnings.push(`${uncategorizedExpenseCount} manual expense record(s) are categorized as other or uncategorized.`);
  }

  if (expenses.length === 0 && sales.length > 0) {
    readinessWarnings.push("No manual expenses were recorded for the year. Confirm supplies, subscriptions, equipment, and other business costs were not missed.");
  }

  if (disposalTransactions.length > 0) {
    readinessWarnings.push("Finalized disposal / write-off review records exist. Review them so they are not double counted as expenses, giveaways, donations, or separate losses.");
  }

  if (disposalRowsMissingReason > 0) {
    readinessWarnings.push(`${disposalRowsMissingReason} finalized disposal item(s) are missing a disposal reason.`);
  }

  if (disposalRowsMissingNotes > 0) {
    readinessWarnings.push(`${disposalRowsMissingNotes} finalized disposal item(s) are missing detailed notes.`);
  }

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

  const platformRows = Array.from(
    sales.reduce((map, sale) => {
      const platform = platformKey(sale.platform);
      const current = map.get(platform) ?? {
        count: 0,
        gross: 0,
        fees: 0,
        shipping: 0,
        other: 0,
        net: 0,
        cogs: 0,
        profit: 0,
      };

      map.set(platform, {
        count: current.count + 1,
        gross: current.gross + Number(sale.gross_sale ?? 0),
        fees: current.fees + Number(sale.platform_fees ?? 0),
        shipping: current.shipping + Number(sale.shipping_cost ?? 0),
        other: current.other + Number(sale.other_costs ?? 0),
        net: current.net + Number(sale.net_proceeds ?? 0),
        cogs: current.cogs + Number(sale.cost_of_goods_sold ?? 0),
        profit: current.profit + Number(sale.profit ?? 0),
      });

      return map;
    }, new Map<string, { count: number; gross: number; fees: number; shipping: number; other: number; net: number; cogs: number; profit: number }>()),
  )
    .map(([platform, values]) => ({
      platform,
      count: String(values.count),
      gross: currency(roundMoney(values.gross)),
      fees: currency(roundMoney(values.fees)),
      shipping: currency(roundMoney(values.shipping)),
      other: currency(roundMoney(values.other)),
      net: currency(roundMoney(values.net)),
      profit: currency(roundMoney(values.profit)),
    }))
    .sort((a, b) => a.platform.localeCompare(b.platform));

  const disposalRows = disposalTransactions.slice(0, 250).map((row, index) => {
    const item = row.inventory_item_id ? disposalItemsById.get(row.inventory_item_id) : undefined;

    return {
      number: String(index + 1),
      date: formatDateForPdf(row.created_at),
      item: buildDisposalItemName(item),
      qty: String(Math.abs(Number(row.quantity_change ?? 0))),
      reason: formatDisposalReason(row.disposal_reason),
      cost: currency(Number(item?.cost_basis_total ?? 0)),
      notes: row.disposal_notes || row.notes || "",
    };
  });

  const financialSections = buildFinancialLines({
    account: "all",
    reportLabel: `Year-End Financial Support ${selectedYear}`,
    startDate,
    endDate,
    sales,
    expenses,
    breaks,
    endingInventory,
    taxSettings,
  });

  const elements: PdfElement[] = [
    { label: `HITS™ CPA Export Packet - Tax Year ${selectedYear}`, type: "title" },
    { label: `Range: ${formatReportDate(startDate)} to ${formatReportDate(endDate)}`, type: "note" },
    { label: `Generated: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`, type: "note" },
    {
      label:
        "This packet is intended as accountant-ready support for bookkeeping, Schedule C review, inventory basis review, sales support, expense support, platform/shipping review, and year-end tax preparation. It is not a substitute for professional tax advice.",
      type: "note",
    },
    { label: "YEAR-END EXECUTIVE SUMMARY", type: "section" },
    {
      type: "summaryGrid",
      cards: [
        { label: "Gross sales", value: currency(totalGrossSales) },
        { label: "Realized COGS", value: currency(totalCOGS) },
        { label: "Gross income", value: currency(grossIncomeAfterCOGS) },
        { label: "Tracked net profit", value: currency(netBusinessProfitAfterTrackedExpenses) },
      ],
    },
    {
      type: "summaryGrid",
      cards: [
        { label: "Selling costs", value: currency(totalSellingCosts) },
        { label: "Manual expenses", value: currency(totalManualExpenses) },
        { label: "Extra Sch. C", value: currency(scheduleCExtraExpenses) },
        { label: "Net proceeds", value: currency(totalNetProceeds) },
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
    { label: "TAX READINESS REVIEW", type: "section" },
    {
      type: "table",
      emptyMessage: "No tax readiness warnings were found for this packet.",
      columns: [
        { key: "number", label: "#", width: 30, align: "right" },
        { key: "warning", label: "Review Item", width: 694 },
      ],
      rows: readinessWarnings.map((warning, index) => ({
        number: String(index + 1),
        warning,
      })),
    },
    { label: "SCHEDULE C SUPPORT SUMMARY", type: "section" },
    {
      type: "table",
      emptyMessage: "No Schedule C support rows available.",
      columns: [
        { key: "account", label: "Account / Area", width: 250 },
        { key: "amount", label: "Amount", width: 120, align: "right" },
        { key: "note", label: "CPA Notes", width: 354 },
      ],
      rows: [
        { account: "Gross sales / receipts", amount: currency(totalGrossSales), note: "Sales records for the selected tax year." },
        { account: "Realized COGS", amount: currency(totalCOGS), note: "Sold-item cost basis from completed, non-reversed sales." },
        { account: "Selling costs", amount: currency(totalSellingCosts), note: "Platform fees, shipping cost, and other selling costs from sales records." },
        { account: "Manual expenses", amount: currency(totalManualExpenses), note: "Expense records grouped below by Schedule C area." },
        { account: "Extra Schedule C settings", amount: currency(scheduleCExtraExpenses), note: "Home office, vehicle, depreciation, insurance, utilities, licenses, repairs, and professional fees from tax year settings." },
        { account: "Beginning inventory", amount: currency(beginningInventory), note: "Tax year settings." },
        { account: "Purchases support", amount: currency(purchasesForCogsSupport), note: "COGS + ending inventory - beginning inventory." },
        { account: "Ending inventory", amount: currency(endingInventoryCost), note: lockedEndingInventory == null ? "Current live inventory; not locked." : "Locked year-end inventory snapshot." },
      ],
    },
    { label: "EXPENSE CATEGORY SUPPORT", type: "section" },
    {
      type: "table",
      emptyMessage: "No manual expenses found for this tax year.",
      columns: [
        { key: "category", label: "Category", width: 190 },
        { key: "scheduleCArea", label: "Schedule C Area", width: 360 },
        { key: "count", label: "Count", width: 70, align: "right" },
        { key: "amount", label: "Amount", width: 104, align: "right" },
      ],
      rows: expenseSummaryRows,
    },
    { label: "PLATFORM / SHIPPING SUPPORT", type: "section" },
    {
      type: "table",
      emptyMessage: "No sales found for platform or shipping support.",
      columns: [
        { key: "platform", label: "Platform", width: 150 },
        { key: "count", label: "Sales", width: 55, align: "right" },
        { key: "gross", label: "Gross", width: 82, align: "right" },
        { key: "fees", label: "Fees", width: 82, align: "right" },
        { key: "shipping", label: "Postage/Ship", width: 92, align: "right" },
        { key: "other", label: "Other", width: 82, align: "right" },
        { key: "net", label: "Net", width: 82, align: "right" },
        { key: "profit", label: "Profit", width: 99, align: "right" },
      ],
      rows: platformRows,
    },
    {
      label:
        "Shipping note: this packet uses the shipping/postage cost and other selling cost fields currently stored on sales records. If shipping charged is stored separately later, this section can be expanded into charged vs postage vs supplies and undercharged-shipping alerts.",
      type: "note",
    },
  ];

  elements.push(...financialSections);

  elements.push(
    { label: "DISPOSAL / WRITE-OFF REVIEW", type: "section" },
    {
      type: "table",
      emptyMessage: "No finalized disposal / write-off review records found for this tax year.",
      columns: [
        { key: "number", label: "#", width: 24, align: "right" },
        { key: "date", label: "Date", width: 62 },
        { key: "item", label: "Item", width: 250 },
        { key: "qty", label: "Qty", width: 45, align: "right" },
        { key: "reason", label: "Reason", width: 130 },
        { key: "cost", label: "Cost Basis", width: 80, align: "right" },
        { key: "notes", label: "Notes", width: 133 },
      ],
      rows: disposalRows,
    },
    {
      label:
        "Disposal note: finalized disposal records document inventory that left the business. Review these with the CPA so they are not double counted as separate manual expenses, giveaways, donations, or inventory losses.",
      type: "note",
    },
    {
      label:
        "Loss note: selling an item below cost should still be recorded honestly using the actual sale amount and actual cost basis. The loss flows through realized COGS/profit reporting; do not change cost basis just to improve the numbers.",
      type: "note",
    },
  );

  if (disposalTransactions.length > 250) {
    elements.push({
      label: `${disposalTransactions.length - 250} additional disposal review item(s) not shown in this PDF. Use the CSV packet when available for the full detailed list.`,
      type: "note",
    });
  }

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


    if (reportType === "cpa-packet") {
      const selectedYear = clampYear(searchParams.get("year"));
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;

      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return unauthorizedError();
      }

      const [breaksRes, salesRes, inventoryRes, expensesRes, taxSettingsRes, disposalTransactionsRes] =
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
              estimated_value_total
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

          supabase
            .from("inventory_transactions")
            .select(`
              id,
              inventory_item_id,
              transaction_type,
              quantity_change,
              notes,
              disposal_reason,
              disposal_notes,
              finalized_for_tax,
              created_at
            `)
            .eq("user_id", user.id)
            .eq("transaction_type", "disposal_writeoff_review")
            .eq("finalized_for_tax", true)
            .gte("created_at", `${startDate}T00:00:00.000Z`)
            .lte("created_at", `${endDate}T23:59:59.999Z`)
            .order("created_at", { ascending: false }),
        ]);

      if (breaksRes.error) return jsonError(`Could not load break purchases for CPA packet: ${breaksRes.error.message}`);
      if (salesRes.error) return jsonError(`Could not load sales for CPA packet: ${salesRes.error.message}`);
      if (inventoryRes.error) return jsonError(`Could not load inventory for CPA packet: ${inventoryRes.error.message}`);
      if (expensesRes.error) return jsonError(`Could not load expenses for CPA packet: ${expensesRes.error.message}`);
      if (taxSettingsRes.error) return jsonError(`Could not load tax settings for CPA packet: ${taxSettingsRes.error.message}`);
      if (disposalTransactionsRes.error) return jsonError(`Could not load disposal review records for CPA packet: ${disposalTransactionsRes.error.message}`);

      const disposalTransactions = (disposalTransactionsRes.data ?? []) as DisposalTransactionRow[];
      const disposalItemIds = Array.from(
        new Set(
          disposalTransactions
            .map((row) => row.inventory_item_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const disposalItemsRes =
        disposalItemIds.length > 0
          ? await supabase
              .from("inventory_items")
              .select("id, title, item_name, player_name, year, set_name, card_number, notes, cost_basis_total, cost_basis_unit")
              .eq("user_id", user.id)
              .in("id", disposalItemIds)
          : { data: [], error: null };

      if (disposalItemsRes.error) {
        return jsonError(`Could not load disposal item details for CPA packet: ${disposalItemsRes.error.message}`);
      }

      const disposalItems = (disposalItemsRes.data ?? []) as DisposalInventoryRow[];
      const disposalItemsById = new Map(
        disposalItems.map((item) => [item.id, item]),
      );

      const pdfBuffer = buildPdf(
        buildCpaPacketLines({
          selectedYear,
          startDate,
          endDate,
          sales: (salesRes.data ?? []) as SaleRow[],
          expenses: (expensesRes.data ?? []) as ExpenseRow[],
          breaks: (breaksRes.data ?? []) as BreakRow[],
          endingInventory: (inventoryRes.data ?? []) as FinancialInventoryRow[],
          taxSettings: (taxSettingsRes.data ?? null) as TaxYearSettingsRow | null,
          disposalTransactions,
          disposalItemsById,
        }),
      );

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName: "cpa-export-packet",
          startDate,
          endDate,
          extension: "pdf",
        }),
      });
    }


    if (reportType === "shipping") {
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
          ? `Shipping Report: ${formatReportDate(startDate)} to ${formatReportDate(endDate)}`
          : calculatedRange.label.replace("Sales Report", "Shipping Report");

      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return unauthorizedError();
      }

      let salesQuery = supabase
        .from("sales")
        .select("*")
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
        return jsonError(`Could not export shipping PDF: ${salesError.message}`);
      }

      const sales = ((salesData ?? []) as ShippingSaleRow[]).filter((sale) => {
        const hasShippingActivity =
          getShippingCharged(sale) > 0 ||
          getPostageCost(sale) > 0 ||
          getShippingSuppliesCost(sale) > 0;

        if (!hasShippingActivity) return false;
        if (!search) return true;

        const haystack = [
          sale.sale_date,
          sale.platform,
          sale.gross_sale,
          sale.shipping_cost,
          sale.other_costs,
          sale.net_proceeds,
          sale.notes,
        ]
          .map(asString)
          .join(" ")
          .toLowerCase();

        return haystack.includes(search.toLowerCase());
      });

      const pdfBuffer = buildPdf(
        buildShippingLines({
          sales,
          reportLabel: label,
          platformFilter: selectedPlatform,
        }),
      );

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName: "shipping-report",
          startDate,
          endDate,
          extension: "pdf",
        }),
      });
    }

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
      const selectedResponsibility = String(
        searchParams.get("responsibility") || "",
      ).trim();
      const selectedChannel = String(searchParams.get("channel") || "").trim();
      const selectedTaxState = String(searchParams.get("taxState") || "")
        .trim()
        .toUpperCase();
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
          inventory_item_id,
          sales_tax_collected,
          sales_tax_responsibility,
          sales_channel_type,
          tax_state,
          tax_notes
        `,
        )
        .eq("user_id", user.id)
        .is("reversed_at", null)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate)
        .order("sale_date", { ascending: false });

      if (selectedPlatform) {
        salesQuery = salesQuery.ilike("platform", `%${selectedPlatform}%`);
      }

      if (selectedResponsibility) {
        salesQuery = salesQuery.eq(
          "sales_tax_responsibility",
          selectedResponsibility,
        );
      }

      if (selectedChannel) {
        salesQuery = salesQuery.eq("sales_channel_type", selectedChannel);
      }

      if (selectedTaxState) {
        salesQuery = salesQuery.eq("tax_state", selectedTaxState);
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
          sale.sales_tax_collected,
          sale.sales_tax_responsibility,
          sale.sales_channel_type,
          sale.tax_state,
          sale.tax_notes,
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
          responsibilityFilter: selectedResponsibility,
          channelFilter: selectedChannel,
          taxStateFilter: selectedTaxState,
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

    if (reportType === "profit-loss") {
      const selectedYear = clampYear(searchParams.get("year"));
      const selectedPeriod = normalizePeriod(searchParams.get("period"));
      const selectedMonth = clampMonth(searchParams.get("month"));
      const selectedQuarter = clampQuarter(searchParams.get("quarter"));
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
          ? `Profit & Loss Statement: ${formatReportDate(startDate)} to ${formatReportDate(endDate)}`
          : calculatedRange.label.replace("Financial Report", "Profit & Loss Statement");

      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return unauthorizedError();
      }

      const [salesRes, expensesRes] = await Promise.all([
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
      ]);

      if (salesRes.error) {
        return jsonError(`Could not load sales for profit & loss PDF: ${salesRes.error.message}`);
      }

      if (expensesRes.error) {
        return jsonError(`Could not load expenses for profit & loss PDF: ${expensesRes.error.message}`);
      }

      const sales = ((salesRes.data ?? []) as SaleRow[]).filter((row) =>
        financialMatchesSearch(
          [
            row.sale_date,
            row.gross_sale,
            row.platform_fees,
            row.shipping_cost,
            row.other_costs,
            row.net_proceeds,
            row.cost_of_goods_sold,
            row.profit,
            row.platform,
            row.notes,
          ],
          search,
        ),
      );

      const expenses = ((expensesRes.data ?? []) as ExpenseRow[]).filter((row) =>
        financialMatchesSearch(
          [row.expense_date, row.category, row.vendor, row.amount, row.notes],
          search,
        ),
      );

      const pdfBuffer = buildPdf(
        buildProfitLossLines({
          reportLabel: label,
          startDate,
          endDate,
          sales,
          expenses,
        }),
      );

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName: "profit-loss-statement",
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
              estimated_value_total
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
      searchParams.get("startDate") ||
        searchParams.get("dateFrom") ||
        searchParams.get("start") ||
        "",
    ).trim();
    const endDate = String(
      searchParams.get("endDate") ||
        searchParams.get("dateTo") ||
        searchParams.get("end") ||
        "",
    ).trim();


    if (reportType === "open-lots") {
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
        return jsonError(`Could not export open lots PDF: ${error.message}`);
      }

      const allInventoryItems = (data ?? []) as InventoryItemRow[];

      const inventoryItems = allInventoryItems.filter((item) => {
        const status = normalizeStatus(item.status).toLowerCase();

        const openStatuses = new Set([
          "available",
          "listed",
          "personal",
        ]);

        if (!openStatuses.has(status)) return false;

        if (
          selectedStatus !== "all" &&
          selectedStatus !== "open" &&
          status !== selectedStatus
        ) {
          return false;
        }
        if (!matchesSearch(item, search)) return false;
        if (!matchesDateRange(item, startDate, endDate)) return false;
        if (!matchesValueFilter(item, selectedValue)) return false;
        if (!matchesAgingFilter(item, selectedAging)) return false;
        if (!matchesActionNeededFilter(item, selectedAction)) return false;

        return true;
      });

      const pdfBuffer = buildPdf(
        buildOpenLotsLines(inventoryItems, reportLabel),
      );

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName: "open-lots-report",
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          extension: "pdf",
        }),
      });
    }



    if (reportType === "break-profitability") {
      const selectedYear = clampYear(searchParams.get("year"));
      const selectedPeriod = normalizePeriod(searchParams.get("period"));
      const selectedMonth = clampMonth(searchParams.get("month"));
      const selectedQuarter = clampQuarter(searchParams.get("quarter"));
      const selectedSource = String(searchParams.get("source") || "all").trim();
      const selectedStatus = String(searchParams.get("status") || "all").trim();
      const selectedProfitability = String(searchParams.get("profitability") || "all").trim();
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
          ? `${formatReportDate(startDate)} to ${formatReportDate(endDate)}`
          : calculatedRange.label.replace("Financial Report", "Break Profitability");

      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return unauthorizedError();
      }

      const [breaksRes, inventoryRes, salesRes] = await Promise.all([
        supabase
          .from("breaks")
          .select("*")
          .eq("user_id", user.id)
          .gte("break_date", startDate)
          .lte("break_date", endDate)
          .order("break_date", { ascending: false }),

        supabase
          .from("inventory_items")
          .select("*")
          .eq("user_id", user.id),

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
          .is("reversed_at", null),
      ]);

      if (breaksRes.error) return jsonError(`Could not load breaks for break profitability PDF: ${breaksRes.error.message}`);
      if (inventoryRes.error) return jsonError(`Could not load inventory for break profitability PDF: ${inventoryRes.error.message}`);
      if (salesRes.error) return jsonError(`Could not load sales for break profitability PDF: ${salesRes.error.message}`);

      const pdfBuffer = buildPdf(
        buildBreakProfitabilityLines({
          breaks: (breaksRes.data ?? []) as (BreakRow & Record<string, unknown>)[],
          inventoryItems: (inventoryRes.data ?? []) as (InventoryItemRow & Record<string, unknown>)[],
          sales: (salesRes.data ?? []) as SaleRow[],
          reportLabel: label,
          sourceFilter: selectedSource,
          statusFilter: selectedStatus,
          profitabilityFilter: selectedProfitability,
          search,
        }),
      );

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName: "break-profitability-report",
          startDate,
          endDate,
          extension: "pdf",
        }),
      });
    }



    if (reportType === "marketplace-fees") {
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
          ? `${formatReportDate(startDate)} to ${formatReportDate(endDate)}`
          : calculatedRange.label.replace("Sales Report", "Marketplace Fee Report");

      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return unauthorizedError();
      }

      let salesQuery = supabase
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
        .order("sale_date", { ascending: false });

      if (selectedPlatform) {
        salesQuery = salesQuery.ilike("platform", `%${selectedPlatform}%`);
      }

      const { data, error } = await salesQuery;

      if (error) {
        return jsonError(`Could not export marketplace fee PDF: ${error.message}`);
      }

      const pdfBuffer = buildPdf(
        buildMarketplaceFeesLines({
          sales: (data ?? []) as SaleRow[],
          reportLabel: label,
          platformFilter: selectedPlatform,
          search,
        }),
      );

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName: "marketplace-fees-report",
          startDate,
          endDate,
          extension: "pdf",
        }),
      });
    }

    if (reportType === "platform-profitability") {
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
          ? `${formatReportDate(startDate)} to ${formatReportDate(endDate)}`
          : calculatedRange.label.replace("Sales Report", "Platform Profitability");

      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return unauthorizedError();
      }

      let salesQuery = supabase
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
        .order("sale_date", { ascending: false });

      if (selectedPlatform) {
        salesQuery = salesQuery.eq("platform", selectedPlatform);
      }

      const { data, error } = await salesQuery;

      if (error) {
        return jsonError(`Could not export platform profitability PDF: ${error.message}`);
      }

      const pdfBuffer = buildPdf(
        buildPlatformProfitabilityLines({
          sales: (data ?? []) as SaleRow[],
          reportLabel: label,
          platformFilter: selectedPlatform,
          search,
        }),
      );

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName: "platform-profitability-report",
          startDate,
          endDate,
          extension: "pdf",
        }),
      });
    }

    if (reportType === "operations") {
      const selectedYear = clampYear(searchParams.get("year"));
      const selectedPeriod = normalizePeriod(searchParams.get("period"));
      const selectedMonth = clampMonth(searchParams.get("month"));
      const selectedQuarter = clampQuarter(searchParams.get("quarter"));
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
          ? `${formatReportDate(startDate)} to ${formatReportDate(endDate)}`
          : calculatedRange.label.replace("Financial Report", "Operations Report");

      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return unauthorizedError();
      }

      const [salesRes, expensesRes, breaksRes, inventoryRes] = await Promise.all([
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
          .from("breaks")
          .select("id, break_date, source_name, product_name, order_number, total_cost")
          .eq("user_id", user.id)
          .gte("break_date", startDate)
          .lte("break_date", endDate)
          .order("break_date", { ascending: false }),

        supabase
          .from("inventory_items")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      if (salesRes.error) return jsonError(`Could not load sales for operations PDF: ${salesRes.error.message}`);
      if (expensesRes.error) return jsonError(`Could not load expenses for operations PDF: ${expensesRes.error.message}`);
      if (breaksRes.error) return jsonError(`Could not load breaks for operations PDF: ${breaksRes.error.message}`);
      if (inventoryRes.error) return jsonError(`Could not load inventory for operations PDF: ${inventoryRes.error.message}`);

      const pdfBuffer = buildPdf(
        buildOperationsLines({
          reportLabel: label,
          sales: (salesRes.data ?? []) as SaleRow[],
          expenses: (expensesRes.data ?? []) as ExpenseRow[],
          breaks: (breaksRes.data ?? []) as BreakRow[],
          inventoryItems: (inventoryRes.data ?? []) as InventoryItemRow[],
          search,
        }),
      );

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName: "operations-report",
          startDate,
          endDate,
          extension: "pdf",
        }),
      });
    }


    if (reportType === "write-offs") {
      const selectedYear = clampYear(searchParams.get("year"));
      const selectedPeriod = normalizePeriod(searchParams.get("period"));
      const selectedMonth = clampMonth(searchParams.get("month"));
      const selectedQuarter = clampQuarter(searchParams.get("quarter"));
      const selectedStatus = String(searchParams.get("status") || "all").trim();
      const search = String(searchParams.get("q") || "").trim();
      const selectedStart =
        searchParams.get("start") ||
        searchParams.get("startDate") ||
        searchParams.get("dateFrom") ||
        searchParams.get("from") ||
        searchParams.get("date");
      const selectedEnd =
        searchParams.get("end") ||
        searchParams.get("endDate") ||
        searchParams.get("dateTo") ||
        searchParams.get("to");

      const { startDate, endDate, label } = getSalesReportDateRange({
        selectedYear,
        period: selectedPeriod,
        start: selectedStart,
        end: selectedEnd,
        month: selectedMonth,
        quarter: selectedQuarter,
      });

      const reportLabel = label.replace("Sales Report", "Write-Offs Report");
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
        .in("status", ["disposed", "junk"])
        .order("updated_at", { ascending: false });

      if (error) {
        return jsonError(`Could not export write-offs PDF: ${error.message}`);
      }

      const allItems = (data ?? []) as InventoryItemRow[];

      const items = allItems.filter((item) => {
        const status = normalizeStatus(item.status).toLowerCase();

        if (selectedStatus !== "all" && status !== selectedStatus.toLowerCase()) return false;
        if (!matchesWriteOffPdfDateRange(item, startDate, endDate)) return false;

        if (search) {
          const haystack = [
            getBaseItemName(item),
            item.status,
            item.year,
            item.set_name,
            item.card_number,
            item.item_number,
            getWriteOffPdfReason(item),
            item.notes,
          ]
            .map(asString)
            .join(" ")
            .toLowerCase();

          if (!haystack.includes(search.toLowerCase())) return false;
        }

        return true;
      });

      const pdfBuffer = buildPdf(
        buildWriteOffsLines({
          items,
          reportLabel,
          statusFilter: selectedStatus,
        }),
      );

      return pdfDownloadResponse({
        pdf: pdfBuffer,
        filename: buildReportFilename({
          reportName: "write-offs-report",
          startDate,
          endDate,
          extension: "pdf",
        }),
      });
    }

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
