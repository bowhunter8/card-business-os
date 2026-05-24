import { createClient } from "@/lib/supabase/server";
import { getExpenseScheduleCArea } from "@/lib/reports/expense-categories";
import {
  buildCsv,
  buildReportFilename,
  csvDownloadResponse,
  jsonError,
  moneyString,
  unauthorizedError,
} from "@/lib/reports/report-export-utils";

type RouteContext = {
  params: Promise<{ reportType: string }> | { reportType: string };
};

type ReportPeriod = "day" | "week" | "month" | "quarter" | "year" | "custom";

type SalesRow = {
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
  shipping_charged?: number | string | null;
  shipping_income?: number | string | null;
  buyer_shipping_charged?: number | string | null;
  shipping_paid_by_buyer?: number | string | null;
  postage_cost?: number | string | null;
  actual_postage?: number | string | null;
  actual_postage_cost?: number | string | null;
  label_cost?: number | string | null;
  supplies_cost?: number | string | null;
  shipping_supplies_cost?: number | string | null;
  packaging_cost?: number | string | null;
  shipping_profile_name?: string | null;
};

type SalesInventoryRow = {
  id: string;
  title?: string | null;
  item_name?: string | null;
  player_name?: string | null;
  year?: number | string | null;
  set_name?: string | null;
  card_number?: string | null;
  item_number?: string | null;
  notes?: string | null;
  status?: string | null;
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

type BreakPurchaseRow = {
  id: string;
  break_date: string | null;
  source_name: string | null;
  product_name: string | null;
  order_number: string | null;
  total_cost: number | null;
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

type CpaPacketCsvRow = {
  packet: string;
  section: string;
  subsection: string;
  report: string;
  range_start: string;
  range_end: string;
  generated_at: string;
  metric: string;
  value: string;
  date: string;
  item: string;
  category: string;
  schedule_c_area: string;
  platform: string;
  vendor: string;
  status: string;
  quantity: string;
  gross_sale: string;
  platform_fees: string;
  shipping_cost: string;
  other_costs: string;
  net_proceeds: string;
  cost_of_goods_sold: string;
  profit: string;
  cost_basis: string;
  estimated_value: string;
  estimated_gain_loss: string;
  source: string;
  order_number: string;
  notes: string;
  warning: string;
  record_id: string;
  inventory_item_id: string;
};

type ShippingCsvRow = {
  report: string;
  section: string;
  range_start: string;
  range_end: string;
  platform_filter: string;
  margin_filter: string;
  metric: string;
  value: string;
  sale_date: string;
  platform: string;
  shipping_profile: string;
  shipping_charged: string;
  postage_cost: string;
  supplies_cost: string;
  total_shipping_cost: string;
  shipping_profit_loss: string;
  gross_sale: string;
  net_proceeds: string;
  warning: string;
  notes: string;
  sale_id: string;
};

function excelSafeCsv(csv: string) {
  return csv.startsWith("\uFEFF") ? csv : `\uFEFF${csv}`;
}

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

function getReportDateRange({
  selectedYear,
  period,
  start,
  end,
  month,
  quarter,
  reportLabel,
}: {
  selectedYear: number;
  period: ReportPeriod;
  start?: string | null;
  end?: string | null;
  month: number;
  quarter: number;
  reportLabel: string;
}) {
  const today = new Date();
  const defaultAnchor =
    selectedYear === today.getFullYear() ? today : new Date(selectedYear, 0, 1);

  if (period === "day") {
    const selectedDay = parseInputDate(start, defaultAnchor);

    return {
      startDate: dateToInputValue(selectedDay),
      endDate: dateToInputValue(selectedDay),
      label: `Daily ${reportLabel} Report ${dateToInputValue(selectedDay)}`,
    };
  }

  if (period === "week") {
    const selectedDay = parseInputDate(start, defaultAnchor);
    const weekStart = getStartOfWeek(selectedDay);
    const weekEnd = getEndOfWeek(selectedDay);

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
      label: `Weekly ${reportLabel} Report ${dateToInputValue(weekStart)} to ${dateToInputValue(weekEnd)}`,
    };
  }

  if (period === "month") {
    const monthStart = new Date(selectedYear, month - 1, 1);
    const monthEnd = new Date(selectedYear, month, 0);

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
      label: `Monthly ${reportLabel} Report ${monthStart.toLocaleString(
        "default",
        {
          month: "long",
        },
      )} ${selectedYear}`,
    };
  }

  if (period === "quarter") {
    const quarterStartMonth = (quarter - 1) * 3;
    const quarterStart = new Date(selectedYear, quarterStartMonth, 1);
    const quarterEnd = new Date(selectedYear, quarterStartMonth + 3, 0);

    return {
      startDate: dateToInputValue(quarterStart),
      endDate: dateToInputValue(quarterEnd),
      label: `Quarterly ${reportLabel} Report Q${quarter} ${selectedYear}`,
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
      label: `Custom ${reportLabel} Report ${dateToInputValue(normalizedStart)} to ${dateToInputValue(normalizedEnd)}`,
    };
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
    label: `Yearly ${reportLabel} Report ${selectedYear}`,
  };
}

function platformKey(value: string | null | undefined) {
  return String(value || "Unknown").trim() || "Unknown";
}

function getFirstNumber(row: SalesRow, keys: (keyof SalesRow)[]) {
  for (const key of keys) {
    const value = asNumber(row[key]);

    if (value !== 0) {
      return value;
    }
  }

  return 0;
}

function getShippingCharged(row: SalesRow) {
  return getFirstNumber(row, [
    "shipping_charged",
    "shipping_income",
    "buyer_shipping_charged",
    "shipping_paid_by_buyer",
  ]);
}

function getPostageCost(row: SalesRow) {
  return getFirstNumber(row, [
    "actual_postage",
    "actual_postage_cost",
    "postage_cost",
    "label_cost",
    "shipping_cost",
  ]);
}

function getSuppliesCost(row: SalesRow) {
  return getFirstNumber(row, [
    "supplies_cost",
    "shipping_supplies_cost",
    "packaging_cost",
  ]);
}

function getShippingProfile(row: SalesRow) {
  return String(row.shipping_profile_name || "").trim() || "Not assigned";
}

function getShippingWarning({
  shippingCharged,
  postageCost,
  suppliesCost,
}: {
  shippingCharged: number;
  postageCost: number;
  suppliesCost: number;
}) {
  const totalShippingCost = postageCost + suppliesCost;
  const shippingProfitLoss = shippingCharged - totalShippingCost;

  if (shippingCharged <= 0 && totalShippingCost > 0)
    return "No shipping charged";
  if (shippingProfitLoss < 0) return "Undercharged";
  if (postageCost <= 0 && shippingCharged > 0) return "Missing actual postage";
  if (suppliesCost <= 0) return "No supplies cost";

  return "OK";
}

function normalizeStatus(status: string | null | undefined) {
  const clean = asString(status).trim();
  return clean || "unknown";
}

function getInventoryItemDate(item: InventoryItemRow) {
  return (
    item.acquired_at ||
    item.purchase_date ||
    item.date_added ||
    item.created_at ||
    null
  );
}

function getInventoryItemCost(item: InventoryItemRow) {
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

function getInventoryItemValue(item: InventoryItemRow) {
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

function getInventoryDaysHeld(item: InventoryItemRow) {
  const rawDate = getInventoryItemDate(item);
  if (!rawDate) return null;

  const itemDate = new Date(rawDate);
  if (Number.isNaN(itemDate.getTime())) return null;

  const now = new Date();
  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  return Math.max(
    0,
    Math.floor((now.getTime() - itemDate.getTime()) / millisecondsPerDay),
  );
}

function getInventoryItemName(item: InventoryItemRow) {
  const directTitle =
    item.title || item.item_name || item.player_name || "Untitled item";

  const details = [
    item.year ? String(item.year) : "",
    item.set_name || "",
    item.item_number || item.card_number || "",
  ].filter(Boolean);

  if (!details.length) return directTitle;

  return `${directTitle} — ${details.join(" ")}`;
}

function buildSoldItemName(item: SalesInventoryRow | undefined) {
  if (!item) return "Unlinked sale";

  const directTitle =
    item.title || item.item_name || item.player_name || "Untitled item";

  const details = [
    item.year ? String(item.year) : "",
    item.set_name || "",
    item.item_number || item.card_number
      ? `#${item.item_number || item.card_number}`
      : "",
  ].filter(Boolean);

  if (!details.length) return directTitle;

  return `${directTitle} — ${details.join(" ")}`;
}

function matchesInventorySearch(item: InventoryItemRow, search: string) {
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

function matchesInventoryDateRange(
  item: InventoryItemRow,
  startDate: string,
  endDate: string,
) {
  const rawDate = getInventoryItemDate(item);
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

function matchesInventoryValueFilter(
  item: InventoryItemRow,
  valueFilter: string,
) {
  if (!valueFilter || valueFilter === "all") return true;

  const value = getInventoryItemValue(item);

  if (valueFilter === "no-value") return value <= 0;
  if (valueFilter === "under-10") return value > 0 && value < 10;
  if (valueFilter === "10-50") return value >= 10 && value <= 50;
  if (valueFilter === "50-100") return value > 50 && value <= 100;
  if (valueFilter === "over-100") return value > 100;

  return true;
}

function matchesInventoryAgingFilter(
  item: InventoryItemRow,
  agingFilter: string,
) {
  if (!agingFilter || agingFilter === "all") return true;

  const daysHeld = getInventoryDaysHeld(item);
  if (daysHeld === null) return false;

  const minimumDays = Number(agingFilter);
  if (!Number.isFinite(minimumDays) || minimumDays <= 0) return true;

  return daysHeld >= minimumDays;
}

function getInventoryWorkflowAction(item: InventoryItemRow) {
  const status = normalizeStatus(item.status).toLowerCase();
  const value = getInventoryItemValue(item);
  const cost = getInventoryItemCost(item);
  const daysHeld = getInventoryDaysHeld(item);
  const notes = asString(item.notes).toLowerCase();

  if ((status === "available" || status === "listed") && cost <= 0)
    return "Missing Cost Basis";

  if (status === "available") {
    if (notes.includes("photo") || notes.includes("scan"))
      return "Needs Photos / Scan";
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

function matchesInventoryActionNeededFilter(
  item: InventoryItemRow,
  actionFilter: string,
) {
  if (!actionFilter || actionFilter === "all") return true;

  const status = normalizeStatus(item.status).toLowerCase();
  const value = getInventoryItemValue(item);
  const cost = getInventoryItemCost(item);
  const daysHeld = getInventoryDaysHeld(item);
  const notes = asString(item.notes).toLowerCase();
  const action = getInventoryWorkflowAction(item);

  if (actionFilter === "ready-to-list") return action === "Ready To List";
  if (actionFilter === "missing-cost")
    return (status === "available" || status === "listed") && cost <= 0;
  if (actionFilter === "missing-value") return value <= 0;
  if (actionFilter === "needs-photos")
    return notes.includes("photo") || notes.includes("scan");
  if (actionFilter === "available-30")
    return status === "available" && daysHeld !== null && daysHeld >= 30;
  if (actionFilter === "available-90")
    return status === "available" && daysHeld !== null && daysHeld >= 90;
  if (actionFilter === "listed-30")
    return status === "listed" && daysHeld !== null && daysHeld >= 30;
  if (actionFilter === "listed-90")
    return status === "listed" && daysHeld !== null && daysHeld >= 90;
  if (actionFilter === "pc-review") return status === "personal";
  if (actionFilter === "notes-review")
    return Boolean(asString(item.notes).trim());
  if (actionFilter === "disposal-candidate")
    return status === "junk" || action === "Disposal Candidate";

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

async function exportSalesReport(request: Request) {
  const { searchParams } = new URL(request.url);

  const selectedYear = clampYear(searchParams.get("year"));
  const selectedPeriod = normalizePeriod(searchParams.get("period"));
  const selectedMonth = clampMonth(searchParams.get("month"));
  const selectedQuarter = clampQuarter(searchParams.get("quarter"));
  const selectedPlatform = String(searchParams.get("platform") || "").trim();
  const selectedStart =
    searchParams.get("start") ||
    searchParams.get("startDate") ||
    searchParams.get("date");
  const selectedEnd = searchParams.get("end") || searchParams.get("endDate");

  const { startDate, endDate, label } = getReportDateRange({
    selectedYear,
    period: selectedPeriod,
    start: selectedStart,
    end: selectedEnd,
    month: selectedMonth,
    quarter: selectedQuarter,
    reportLabel: "Sales",
  });

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

  const { data, error } = await salesQuery;

  if (error) {
    return jsonError(`Could not export sales: ${error.message}`);
  }

  const sales = (data ?? []) as SalesRow[];

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
            "id, title, item_name, player_name, year, set_name, card_number, item_number, notes, status",
          )
          .eq("user_id", user.id)
          .in("id", inventoryIds)
      : { data: [] };

  const inventoryItems = (inventoryRes.data ?? []) as SalesInventoryRow[];
  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));

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
  const grossIncomeAfterCOGS = roundMoney(totalGrossSales - totalCOGS);

  const baseRow = {
    section: "",
    report: label,
    range_start: startDate,
    range_end: endDate,
    platform_filter: selectedPlatform || "All platforms",
    metric: "",
    value: "",
    sale_date: "",
    item: "",
    platform: "",
    gross_sale: "",
    platform_fees: "",
    shipping_cost: "",
    other_costs: "",
    net_proceeds: "",
    cost_of_goods_sold: "",
    profit: "",
    notes: "",
    sale_id: "",
    inventory_item_id: "",
  };

  const summaryRows = [
    { metric: "sales_count", value: String(sales.length) },
    { metric: "gross_sales", value: moneyString(totalGrossSales) },
    { metric: "selling_costs", value: moneyString(totalSellingCosts) },
    { metric: "net_proceeds", value: moneyString(totalNetProceeds) },
    { metric: "realized_cogs", value: moneyString(totalCOGS) },
    { metric: "income_after_cogs", value: moneyString(grossIncomeAfterCOGS) },
    { metric: "profit", value: moneyString(totalProfit) },
  ].map((row) => ({
    ...baseRow,
    section: "summary",
    metric: row.metric,
    value: row.value,
  }));

  const detailRows = sales.map((sale) => {
    const inventoryItem = sale.inventory_item_id
      ? inventoryById.get(sale.inventory_item_id)
      : undefined;

    return {
      ...baseRow,
      section: "detail",
      sale_date: sale.sale_date || "",
      item: buildSoldItemName(inventoryItem),
      platform: platformKey(sale.platform),
      gross_sale: moneyString(sale.gross_sale),
      platform_fees: moneyString(sale.platform_fees),
      shipping_cost: moneyString(sale.shipping_cost),
      other_costs: moneyString(sale.other_costs),
      net_proceeds: moneyString(sale.net_proceeds),
      cost_of_goods_sold: moneyString(sale.cost_of_goods_sold),
      profit: moneyString(sale.profit),
      notes: sale.notes || "",
      sale_id: sale.id,
      inventory_item_id: sale.inventory_item_id || "",
    };
  });

  const csv = excelSafeCsv(
    buildCsv(
      [...summaryRows, ...detailRows],
      "No sales found for this report range.",
    ),
  );

  const filename = buildReportFilename({
    reportName: "sales-report",
    startDate,
    endDate,
    extension: "csv",
  });

  return csvDownloadResponse({
    csv,
    filename,
  });
}

async function exportExpensesReport(request: Request) {
  const { searchParams } = new URL(request.url);

  const selectedYear = clampYear(searchParams.get("year"));
  const selectedPeriod = normalizePeriod(searchParams.get("period"));
  const selectedMonth = clampMonth(searchParams.get("month"));
  const selectedQuarter = clampQuarter(searchParams.get("quarter"));
  const selectedCategory = String(searchParams.get("category") || "").trim();
  const selectedStart =
    searchParams.get("start") ||
    searchParams.get("startDate") ||
    searchParams.get("date");
  const selectedEnd = searchParams.get("end") || searchParams.get("endDate");

  const { startDate, endDate, label } = getReportDateRange({
    selectedYear,
    period: selectedPeriod,
    start: selectedStart,
    end: selectedEnd,
    month: selectedMonth,
    quarter: selectedQuarter,
    reportLabel: "Expenses",
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
    return jsonError(`Could not export expenses: ${error.message}`);
  }

  const expenses = (data ?? []) as ExpenseRow[];

  const csvRows = expenses.map((expense) => {
    const category =
      String(expense.category || "Uncategorized").trim() || "Uncategorized";

    return {
      report: label,
      range_start: startDate,
      range_end: endDate,
      category_filter: selectedCategory || "All categories",
      expense_date: expense.expense_date || "",
      category,
      schedule_c_area: getExpenseScheduleCArea(category),
      vendor: expense.vendor || "",
      amount: moneyString(expense.amount),
      notes: expense.notes || "",
      created_at: expense.created_at || "",
      expense_id: expense.id,
    };
  });

  const csv = excelSafeCsv(
    buildCsv(csvRows, "No manual expenses found for this report range."),
  );

  const filename = buildReportFilename({
    reportName: "expenses-report",
    startDate,
    endDate,
    extension: "csv",
  });

  return csvDownloadResponse({
    csv,
    filename,
  });
}

async function exportInventoryReport(request: Request) {
  const { searchParams } = new URL(request.url);

  const search = String(searchParams.get("q") || "").trim();
  const selectedStatus = String(searchParams.get("status") || "all").trim();
  const selectedValue = String(searchParams.get("value") || "all").trim();
  const selectedAging = String(searchParams.get("aging") || "all").trim();
  const selectedAction = String(searchParams.get("action") || "all").trim();
  const startDate = String(
    searchParams.get("startDate") || searchParams.get("dateFrom") || "",
  ).trim();
  const endDate = String(
    searchParams.get("endDate") || searchParams.get("dateTo") || "",
  ).trim();

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
    return jsonError(`Could not export inventory: ${error.message}`);
  }

  const allInventoryItems = (data ?? []) as InventoryItemRow[];

  const inventoryItems = allInventoryItems.filter((item) => {
    const status = normalizeStatus(item.status);

    if (selectedStatus !== "all" && status !== selectedStatus) return false;
    if (!matchesInventorySearch(item, search)) return false;
    if (!matchesInventoryDateRange(item, startDate, endDate)) return false;
    if (!matchesInventoryValueFilter(item, selectedValue)) return false;
    if (!matchesInventoryAgingFilter(item, selectedAging)) return false;
    if (!matchesInventoryActionNeededFilter(item, selectedAction)) return false;

    return true;
  });

  const csvRows = inventoryItems.map((item) => {
    const costBasis = getInventoryItemCost(item);
    const estimatedValue = getInventoryItemValue(item);
    const gainLoss = estimatedValue - costBasis;
    const daysHeld = getInventoryDaysHeld(item);

    return {
      item_id: item.id,
      item_name: getInventoryItemName(item),
      status: normalizeStatus(item.status),
      item_date: getInventoryItemDate(item) || "",
      days_held: daysHeld === null ? "" : String(daysHeld),
      suggested_action: getInventoryWorkflowAction(item),
      aging_filter: selectedAging,
      action_filter: selectedAction,
      year: item.year || "",
      set_name: item.set_name || "",
      item_number: item.item_number || item.card_number || "",
      cost_basis: moneyString(costBasis),
      estimated_value: moneyString(estimatedValue),
      estimated_gain_loss: moneyString(gainLoss),
      notes: item.notes || "",
    };
  });

  const csv = excelSafeCsv(
    buildCsv(csvRows, "No inventory items found for this report filter."),
  );

  const filename = buildReportFilename({
    reportName: "inventory-report",
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    extension: "csv",
  });

  return csvDownloadResponse({
    csv,
    filename,
  });
}

async function exportShippingReport(request: Request) {
  const { searchParams } = new URL(request.url);

  const selectedYear = clampYear(searchParams.get("year"));
  const selectedPeriod = normalizePeriod(searchParams.get("period"));
  const selectedMonth = clampMonth(searchParams.get("month"));
  const selectedQuarter = clampQuarter(searchParams.get("quarter"));
  const selectedPlatformRaw = String(searchParams.get("platform") || "").trim();
  const selectedPlatform =
    selectedPlatformRaw && selectedPlatformRaw !== "all"
      ? selectedPlatformRaw
      : "";
  const selectedMargin = String(searchParams.get("margin") || "all").trim();
  const search = String(searchParams.get("q") || "").trim();
  const selectedStart =
    searchParams.get("start") ||
    searchParams.get("startDate") ||
    searchParams.get("dateFrom") ||
    searchParams.get("date");
  const selectedEnd =
    searchParams.get("end") ||
    searchParams.get("endDate") ||
    searchParams.get("dateTo");

  const { startDate, endDate, label } = getReportDateRange({
    selectedYear,
    period: selectedPeriod,
    start: selectedStart,
    end: selectedEnd,
    month: selectedMonth,
    quarter: selectedQuarter,
    reportLabel: "Shipping",
  });

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

  const { data, error } = await salesQuery;

  if (error) {
    return jsonError(`Could not export shipping report: ${error.message}`);
  }

  const sales = (data ?? []) as SalesRow[];

  const shippingRows = sales
    .map((sale) => {
      const shippingCharged = roundMoney(getShippingCharged(sale));
      const postageCost = roundMoney(getPostageCost(sale));
      const suppliesCost = roundMoney(getSuppliesCost(sale));
      const totalShippingCost = roundMoney(postageCost + suppliesCost);
      const shippingProfitLoss = roundMoney(
        shippingCharged - totalShippingCost,
      );
      const warning = getShippingWarning({
        shippingCharged,
        postageCost,
        suppliesCost,
      });

      return {
        sale,
        shippingCharged,
        postageCost,
        suppliesCost,
        totalShippingCost,
        shippingProfitLoss,
        warning,
        platform: platformKey(sale.platform),
        shippingProfile: getShippingProfile(sale),
      };
    })
    .filter((row) => {
      if (selectedMargin === "undercharged" && row.shippingProfitLoss >= 0)
        return false;
      if (selectedMargin === "profitable" && row.shippingProfitLoss <= 0)
        return false;
      if (selectedMargin === "break-even" && row.shippingProfitLoss !== 0)
        return false;
      if (
        selectedMargin === "missing-charged" &&
        !(row.shippingCharged <= 0 && row.totalShippingCost > 0)
      )
        return false;
      if (
        selectedMargin === "missing-postage" &&
        !(row.postageCost <= 0 && row.shippingCharged > 0)
      )
        return false;
      if (selectedMargin === "missing-supplies" && row.suppliesCost > 0)
        return false;

      if (!search) return true;

      const haystack = [
        row.sale.sale_date,
        row.platform,
        row.shippingProfile,
        row.shippingCharged,
        row.postageCost,
        row.suppliesCost,
        row.totalShippingCost,
        row.shippingProfitLoss,
        row.warning,
        row.sale.notes,
        row.sale.id,
      ]
        .map(asString)
        .join(" ")
        .toLowerCase();

      return haystack.includes(search.toLowerCase());
    });

  const shipmentCount = shippingRows.length;
  const totalShippingCharged = roundMoney(
    shippingRows.reduce((sum, row) => sum + row.shippingCharged, 0),
  );
  const totalPostageCost = roundMoney(
    shippingRows.reduce((sum, row) => sum + row.postageCost, 0),
  );
  const totalSuppliesCost = roundMoney(
    shippingRows.reduce((sum, row) => sum + row.suppliesCost, 0),
  );
  const totalShippingCost = roundMoney(
    shippingRows.reduce((sum, row) => sum + row.totalShippingCost, 0),
  );
  const totalShippingProfitLoss = roundMoney(
    shippingRows.reduce((sum, row) => sum + row.shippingProfitLoss, 0),
  );
  const underchargedCount = shippingRows.filter(
    (row) => row.shippingProfitLoss < 0,
  ).length;
  const missingChargedCount = shippingRows.filter(
    (row) => row.shippingCharged <= 0 && row.totalShippingCost > 0,
  ).length;
  const missingPostageCount = shippingRows.filter(
    (row) => row.postageCost <= 0 && row.shippingCharged > 0,
  ).length;
  const missingSuppliesCount = shippingRows.filter(
    (row) => row.suppliesCost <= 0,
  ).length;
  const averageShippingMargin =
    shipmentCount > 0 ? roundMoney(totalShippingProfitLoss / shipmentCount) : 0;
  const shippingCostRatio =
    totalShippingCharged > 0
      ? roundMoney((totalShippingCost / totalShippingCharged) * 100)
      : 0;

  const baseRow: ShippingCsvRow = {
    report: label,
    section: "",
    range_start: startDate,
    range_end: endDate,
    platform_filter: selectedPlatform || "All platforms",
    margin_filter: selectedMargin || "all",
    metric: "",
    value: "",
    sale_date: "",
    platform: "",
    shipping_profile: "",
    shipping_charged: "",
    postage_cost: "",
    supplies_cost: "",
    total_shipping_cost: "",
    shipping_profit_loss: "",
    gross_sale: "",
    net_proceeds: "",
    warning: "",
    notes: "",
    sale_id: "",
  };

  const summaryRows: ShippingCsvRow[] = [
    ["shipment_count", String(shipmentCount)],
    ["shipping_charged", moneyString(totalShippingCharged)],
    ["postage_cost", moneyString(totalPostageCost)],
    ["supplies_cost", moneyString(totalSuppliesCost)],
    ["total_shipping_cost", moneyString(totalShippingCost)],
    ["shipping_profit_loss", moneyString(totalShippingProfitLoss)],
    ["average_shipping_margin", moneyString(averageShippingMargin)],
    ["shipping_cost_ratio_percent", `${shippingCostRatio}%`],
    ["undercharged_shipments", String(underchargedCount)],
    ["missing_shipping_charged", String(missingChargedCount)],
    ["missing_actual_postage", String(missingPostageCount)],
    ["missing_supplies_cost", String(missingSuppliesCount)],
  ].map(([metric, value]) => ({
    ...baseRow,
    section: "summary",
    metric,
    value,
  }));

  const platformRows: ShippingCsvRow[] = Array.from(
    shippingRows.reduce((map, row) => {
      const current = map.get(row.platform) ?? {
        count: 0,
        charged: 0,
        postage: 0,
        supplies: 0,
        totalCost: 0,
        profitLoss: 0,
      };

      map.set(row.platform, {
        count: current.count + 1,
        charged: current.charged + row.shippingCharged,
        postage: current.postage + row.postageCost,
        supplies: current.supplies + row.suppliesCost,
        totalCost: current.totalCost + row.totalShippingCost,
        profitLoss: current.profitLoss + row.shippingProfitLoss,
      });

      return map;
    }, new Map<string, { count: number; charged: number; postage: number; supplies: number; totalCost: number; profitLoss: number }>()),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([platform, values]) => ({
      ...baseRow,
      section: "platform_summary",
      platform,
      metric: "platform_shipping_totals",
      value: String(values.count),
      shipping_charged: moneyString(roundMoney(values.charged)),
      postage_cost: moneyString(roundMoney(values.postage)),
      supplies_cost: moneyString(roundMoney(values.supplies)),
      total_shipping_cost: moneyString(roundMoney(values.totalCost)),
      shipping_profit_loss: moneyString(roundMoney(values.profitLoss)),
    }));

  const detailRows: ShippingCsvRow[] = shippingRows.map((row) => ({
    ...baseRow,
    section: "detail",
    sale_date: row.sale.sale_date || "",
    platform: row.platform,
    shipping_profile: row.shippingProfile,
    shipping_charged: moneyString(row.shippingCharged),
    postage_cost: moneyString(row.postageCost),
    supplies_cost: moneyString(row.suppliesCost),
    total_shipping_cost: moneyString(row.totalShippingCost),
    shipping_profit_loss: moneyString(row.shippingProfitLoss),
    gross_sale: moneyString(row.sale.gross_sale),
    net_proceeds: moneyString(row.sale.net_proceeds),
    warning: row.warning,
    notes: row.sale.notes || "",
    sale_id: row.sale.id,
  }));

  const csv = excelSafeCsv(
    buildCsv(
      [...summaryRows, ...platformRows, ...detailRows],
      "No shipping records found for this report range.",
    ),
  );

  const filename = buildReportFilename({
    reportName: "shipping-report",
    startDate,
    endDate,
    extension: "csv",
  });

  return csvDownloadResponse({
    csv,
    filename,
  });
}


type OpenLotsInventoryRow = Record<string, unknown>;
type OpenLotsSaleRow = Record<string, unknown>;

type OpenLotExportRow = {
  id: string;
  itemName: string;
  player: string;
  brand: string;
  setName: string;
  year: string;
  status: string;
  storageLocation: string;
  acquiredDate: string;
  ageDays: number | null;
  originalQuantity: number;
  soldQuantity: number;
  remainingQuantity: number;
  originalCost: number;
  realizedCost: number;
  remainingCost: number;
  estimatedValue: number;
  unrealizedGainLoss: number;
  suggestedAction: string;
  notes: string;
};

function getOpenLotText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function getOpenLotFirstText(
  row: OpenLotsInventoryRow | OpenLotsSaleRow,
  keys: string[],
  fallback = "",
) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value);
    }
  }

  return fallback;
}

function getOpenLotFirstNumber(
  row: OpenLotsInventoryRow | OpenLotsSaleRow,
  keys: string[],
  fallback = 0,
) {
  for (const key of keys) {
    const value = row[key];
    const parsed = asNumber(value);
    if (Number.isFinite(parsed) && parsed !== 0) return parsed;
  }

  return fallback;
}

function getOpenLotFirstDate(row: OpenLotsInventoryRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (!value) continue;

    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function getOpenLotInventoryId(row: OpenLotsInventoryRow) {
  return getOpenLotFirstText(row, ["id", "inventory_item_id", "item_id"]);
}

function getOpenLotSaleInventoryId(row: OpenLotsSaleRow) {
  return getOpenLotFirstText(row, [
    "inventory_item_id",
    "item_id",
    "inventory_id",
    "card_id",
  ]);
}

function getOpenLotSuggestedAction({
  status,
  remainingQuantity,
  soldQuantity,
  ageDays,
  remainingCost,
  estimatedValue,
}: {
  status: string;
  remainingQuantity: number;
  soldQuantity: number;
  ageDays: number | null;
  remainingCost: number;
  estimatedValue: number;
}) {
  const cleanStatus = status.toLowerCase();
  const spread = estimatedValue - remainingCost;

  if (cleanStatus === "personal") return "PC review";
  if (cleanStatus === "junk") return "Disposal / write-off review";
  if (remainingQuantity <= 0) return "Close lot";
  if (soldQuantity > 0 && remainingQuantity > 0) return "Partial lot review";
  if (ageDays !== null && ageDays >= 180) return "Reprice / bundle candidate";
  if (ageDays !== null && ageDays >= 90) return "Stale lot review";
  if (estimatedValue > 0 && spread < 0) return "Value below cost";
  if (cleanStatus === "listed") return "Monitor listing";

  return "Ready to list / sell";
}

function buildOpenLotDateRange(period: string, start: string, end: string) {
  const now = new Date();
  const rangeEnd = new Date(now);
  rangeEnd.setHours(23, 59, 59, 999);

  const rangeStart = new Date(now);
  rangeStart.setHours(0, 0, 0, 0);

  if (period === "daily") {
    return { startDate: rangeStart, endDate: rangeEnd };
  }

  if (period === "weekly") {
    const day = rangeStart.getDay();
    const diff = day === 0 ? 6 : day - 1;
    rangeStart.setDate(rangeStart.getDate() - diff);
    return { startDate: rangeStart, endDate: rangeEnd };
  }

  if (period === "monthly") {
    rangeStart.setDate(1);
    return { startDate: rangeStart, endDate: rangeEnd };
  }

  if (period === "quarterly") {
    const month = rangeStart.getMonth();
    const quarterStartMonth = Math.floor(month / 3) * 3;
    rangeStart.setMonth(quarterStartMonth, 1);
    return { startDate: rangeStart, endDate: rangeEnd };
  }

  if (period === "yearly") {
    rangeStart.setMonth(0, 1);
    return { startDate: rangeStart, endDate: rangeEnd };
  }

  if (period === "custom") {
    const customStart = start ? new Date(`${start}T00:00:00`) : null;
    const customEnd = end ? new Date(`${end}T23:59:59`) : null;

    return {
      startDate:
        customStart && !Number.isNaN(customStart.getTime()) ? customStart : null,
      endDate:
        customEnd && !Number.isNaN(customEnd.getTime()) ? customEnd : null,
    };
  }

  return { startDate: null, endDate: null };
}

function buildOpenLotRowsForExport(
  inventoryRows: OpenLotsInventoryRow[],
  saleRows: OpenLotsSaleRow[],
) {
  const soldByInventoryId = new Map<string, number>();
  const realizedCostByInventoryId = new Map<string, number>();

  for (const sale of saleRows) {
    const inventoryId = getOpenLotSaleInventoryId(sale);
    if (!inventoryId) continue;

    const soldQuantity = Math.max(
      getOpenLotFirstNumber(sale, ["quantity", "quantity_sold", "qty"], 1),
      1,
    );

    const realizedCost = getOpenLotFirstNumber(
      sale,
      [
        "cost_basis",
        "realized_cost",
        "cogs",
        "allocated_cost",
        "item_cost",
        "purchase_cost",
        "cost_of_goods_sold",
      ],
      0,
    );

    soldByInventoryId.set(
      inventoryId,
      (soldByInventoryId.get(inventoryId) ?? 0) + soldQuantity,
    );

    realizedCostByInventoryId.set(
      inventoryId,
      (realizedCostByInventoryId.get(inventoryId) ?? 0) + realizedCost,
    );
  }

  const today = new Date();

  return inventoryRows
    .map((item): OpenLotExportRow | null => {
      const id = getOpenLotInventoryId(item);
      if (!id) return null;

      const status = getOpenLotFirstText(item, ["status"], "available").toLowerCase();
      const originalQuantity = Math.max(
        getOpenLotFirstNumber(item, ["quantity", "qty", "total_quantity"], 1),
        1,
      );

      const rowSoldQuantity = getOpenLotFirstNumber(
        item,
        ["quantity_sold", "sold_quantity", "sold_qty"],
        0,
      );

      const soldQuantity = Math.max(
        soldByInventoryId.get(id) ?? rowSoldQuantity,
        rowSoldQuantity,
        0,
      );

      const explicitRemainingQuantity = getOpenLotFirstNumber(
        item,
        ["remaining_quantity", "quantity_remaining", "remaining_qty"],
        Number.NaN,
      );

      const remainingQuantity = Number.isFinite(explicitRemainingQuantity)
        ? Math.max(explicitRemainingQuantity, 0)
        : Math.max(originalQuantity - soldQuantity, 0);

      const originalCost = getOpenLotFirstNumber(
        item,
        [
          "total_cost",
          "cost_basis_total",
          "cost_basis",
          "purchase_price",
          "purchase_cost",
          "amount_paid",
          "price_paid",
        ],
        0,
      );

      const realizedCostFromSales = realizedCostByInventoryId.get(id) ?? 0;
      const averageUnitCost = originalQuantity > 0 ? originalCost / originalQuantity : 0;

      const realizedCost =
        realizedCostFromSales > 0
          ? realizedCostFromSales
          : Math.min(originalCost, soldQuantity * averageUnitCost);

      const explicitRemainingCost = getOpenLotFirstNumber(
        item,
        ["remaining_cost", "remaining_cost_basis"],
        Number.NaN,
      );

      const remainingCost = Number.isFinite(explicitRemainingCost)
        ? Math.max(explicitRemainingCost, 0)
        : Math.max(originalCost - realizedCost, 0);

      const acquiredAt = getOpenLotFirstDate(item, [
        "acquired_at",
        "purchase_date",
        "date_acquired",
        "created_at",
      ]);

      const ageDays = acquiredAt
        ? Math.max(
            Math.floor((today.getTime() - acquiredAt.getTime()) / (1000 * 60 * 60 * 24)),
            0,
          )
        : null;

      const estimatedValue = getOpenLotFirstNumber(
        item,
        [
          "estimated_value",
          "estimated_value_total",
          "market_value",
          "current_value",
          "opg_value",
        ],
        0,
      );
      const unrealizedGainLoss = estimatedValue - remainingCost;

      return {
        id,
        itemName: getOpenLotFirstText(
          item,
          ["item_name", "name", "title", "card_name", "description"],
          "Unnamed lot",
        ),
        player: getOpenLotFirstText(item, ["player", "player_name", "athlete"], "—"),
        brand: getOpenLotFirstText(item, ["brand", "manufacturer"], "—"),
        setName: getOpenLotFirstText(item, ["set_name", "set", "product_set"], "—"),
        year: getOpenLotText(item.year, "—"),
        status,
        storageLocation: getOpenLotFirstText(item, ["storage_location", "location", "box", "bin"], "—"),
        acquiredDate: acquiredAt ? acquiredAt.toISOString() : "",
        ageDays,
        originalQuantity,
        soldQuantity,
        remainingQuantity,
        originalCost,
        realizedCost,
        remainingCost,
        estimatedValue,
        unrealizedGainLoss,
        suggestedAction: getOpenLotSuggestedAction({
          status,
          remainingQuantity,
          soldQuantity,
          ageDays,
          remainingCost,
          estimatedValue,
        }),
        notes: getOpenLotFirstText(item, ["notes", "note"], ""),
      };
    })
    .filter((row): row is OpenLotExportRow => Boolean(row));
}

async function exportOpenLotsReport(request: Request) {
  const { searchParams } = new URL(request.url);

  const period = String(searchParams.get("period") || "all").trim();
  const start = String(searchParams.get("start") || searchParams.get("startDate") || "").trim();
  const end = String(searchParams.get("end") || searchParams.get("endDate") || "").trim();
  const query = String(searchParams.get("q") || "").trim();
  const status = String(searchParams.get("status") || "open").trim();
  const staleDays = Math.max(Number(searchParams.get("staleDays") || "90") || 90, 1);

  const { startDate, endDate } = buildOpenLotDateRange(period, start, end);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return unauthorizedError();
  }

  const [inventoryResult, salesResult] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("sales").select("*").eq("user_id", user.id),
  ]);

  if (inventoryResult.error) {
    return jsonError(`Could not export open lots inventory: ${inventoryResult.error.message}`);
  }

  if (salesResult.error) {
    return jsonError(`Could not export open lots sales: ${salesResult.error.message}`);
  }

  let rows = buildOpenLotRowsForExport(
    (inventoryResult.data ?? []) as OpenLotsInventoryRow[],
    (salesResult.data ?? []) as OpenLotsSaleRow[],
  );

  rows = rows.filter((row) => {
    const isLot = row.originalQuantity > 1;
    const hasRemainingInventory = row.remainingQuantity > 0;
    const isFinalClosedStatus = ["sold", "disposed", "archived"].includes(row.status);

    if (!isLot || !hasRemainingInventory || isFinalClosedStatus) return false;

    if (status !== "all") {
      if (status === "open") {
        if (["sold", "disposed", "archived"].includes(row.status) || row.remainingQuantity <= 0) {
          return false;
        }
      } else if (row.status !== status) {
        return false;
      }
    }

    if (startDate || endDate) {
      const acquired = row.acquiredDate ? new Date(row.acquiredDate) : null;

      if (!acquired || Number.isNaN(acquired.getTime())) return false;
      if (startDate && acquired < startDate) return false;
      if (endDate && acquired > endDate) return false;
    }

    if (query) {
      const haystack = [
        row.itemName,
        row.player,
        row.brand,
        row.setName,
        row.year,
        row.status,
        row.storageLocation,
        row.notes,
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(query.toLowerCase())) return false;
    }

    return true;
  });

  const staleRows = rows.filter((row) => (row.ageDays ?? 0) >= staleDays);
  const partialRows = rows.filter((row) => row.soldQuantity > 0);
  const totalRemainingQuantity = rows.reduce((total, row) => total + row.remainingQuantity, 0);
  const totalRemainingCost = roundMoney(rows.reduce((total, row) => total + row.remainingCost, 0));
  const totalEstimatedValue = roundMoney(rows.reduce((total, row) => total + row.estimatedValue, 0));
  const totalUnrealizedGainLoss = roundMoney(
    rows.reduce((total, row) => total + row.unrealizedGainLoss, 0),
  );
  const belowCostRows = rows.filter((row) => row.estimatedValue > 0 && row.unrealizedGainLoss < 0);

  const startDateValue = startDate ? dateToInputValue(startDate) : undefined;
  const endDateValue = endDate ? dateToInputValue(endDate) : undefined;
  const reportLabel = `Open Lots Report${startDateValue || endDateValue ? ` ${startDateValue || ""} to ${endDateValue || ""}` : " All Time"}`;

  const baseRow = {
    report: reportLabel,
    section: "",
    period,
    range_start: startDateValue || "",
    range_end: endDateValue || "",
    status_filter: status,
    stale_days: String(staleDays),
    metric: "",
    value: "",
    item_id: "",
    item_name: "",
    player: "",
    brand: "",
    set_name: "",
    year: "",
    status: "",
    storage_location: "",
    acquired_date: "",
    age_days: "",
    original_quantity: "",
    sold_quantity: "",
    remaining_quantity: "",
    original_cost: "",
    realized_cost: "",
    remaining_cost: "",
    estimated_value: "",
    unrealized_gain_loss: "",
    suggested_action: "",
    notes: "",
  };

  const summaryRows = [
    ["open_lots", String(rows.length)],
    ["partial_lots", String(partialRows.length)],
    ["remaining_quantity", String(totalRemainingQuantity)],
    ["remaining_cost", moneyString(totalRemainingCost)],
    ["stale_lots", String(staleRows.length)],
    ["estimated_value", moneyString(totalEstimatedValue)],
    ["unrealized_gain_loss", moneyString(totalUnrealizedGainLoss)],
    ["below_cost_lots", String(belowCostRows.length)],
  ].map(([metric, value]) => ({
    ...baseRow,
    section: "summary",
    metric,
    value,
  }));

  const detailRows = rows.map((row) => ({
    ...baseRow,
    section: "detail",
    item_id: row.id,
    item_name: row.itemName,
    player: row.player,
    brand: row.brand,
    set_name: row.setName,
    year: row.year,
    status: row.status,
    storage_location: row.storageLocation,
    acquired_date: row.acquiredDate ? row.acquiredDate.slice(0, 10) : "",
    age_days: row.ageDays === null ? "" : String(row.ageDays),
    original_quantity: String(row.originalQuantity),
    sold_quantity: String(row.soldQuantity),
    remaining_quantity: String(row.remainingQuantity),
    original_cost: moneyString(row.originalCost),
    realized_cost: moneyString(row.realizedCost),
    remaining_cost: moneyString(row.remainingCost),
    estimated_value: moneyString(row.estimatedValue),
    unrealized_gain_loss: moneyString(row.unrealizedGainLoss),
    suggested_action: row.suggestedAction,
    notes: row.notes,
  }));

  const csv = excelSafeCsv(
    buildCsv([...summaryRows, ...detailRows], "No open lots found for the selected filters."),
  );

  const filename = buildReportFilename({
    reportName: "open-lots-report",
    startDate: startDateValue,
    endDate: endDateValue,
    extension: "csv",
  });

  return csvDownloadResponse({
    csv,
    filename,
  });
}



function matchesCsvSearch(values: unknown[], search: string) {
  if (!search) return true

  const haystack = values.map(asString).join(' ').toLowerCase()

  return haystack.includes(search.toLowerCase())
}

function getBreakCsvDate(row: BreakPurchaseRow & Record<string, unknown>) {
  return asString(row.break_date || row.created_at)
}

function getBreakCsvSource(row: BreakPurchaseRow & Record<string, unknown>) {
  return (
    asString(row.source_name) ||
    asString(row.seller_name) ||
    asString(row.breaker_name) ||
    'Unknown source'
  )
}

function getBreakCsvProduct(row: BreakPurchaseRow & Record<string, unknown>) {
  return asString(row.product_name || row.order_number || 'Untitled break')
}

function getInventoryBreakCsvId(row: InventoryItemRow & Record<string, unknown>) {
  return (
    asString(row.break_id) ||
    asString(row.source_break_id) ||
    asString(row.order_id)
  )
}

function getRemainingInventoryCsvQuantity(row: InventoryItemRow) {
  const availableQuantity = asNumber(row.available_quantity)
  const quantity = asNumber(row.quantity)
  const status = normalizeStatus(row.status).toLowerCase()

  if (availableQuantity > 0) return availableQuantity
  if (quantity > 0 && status !== 'sold' && status !== 'disposed') return quantity

  return 0
}

function getBreakCsvSuggestedAction({
  itemCount,
  soldItemCount,
  remainingItemCount,
  projectedProfitLoss,
  realizedProfit,
}: {
  itemCount: number
  soldItemCount: number
  remainingItemCount: number
  projectedProfitLoss: number
  realizedProfit: number
}) {
  if (itemCount === 0) return 'No inventory linked'
  if (soldItemCount === 0 && remainingItemCount > 0) return 'No sales yet'
  if (projectedProfitLoss < 0 && remainingItemCount > 0) return 'Reprice / sell remaining'
  if (projectedProfitLoss < 0) return 'Loss review'
  if (remainingItemCount > 0 && realizedProfit > 0) return 'Profit locked / review remaining'
  if (remainingItemCount > 0) return 'Monitor remaining inventory'

  return 'Completed break review'
}

function matchesBreakCsvStatus(row: Record<string, unknown>, status: string) {
  if (!status || status === 'all') return true

  const remainingItemCount = asNumber(row.remaining_item_count)
  const soldItemCount = asNumber(row.sold_item_count)
  const itemCount = asNumber(row.item_count)
  const projectedProfitLoss = asNumber(row.projected_profit_loss)

  if (status === 'open') return remainingItemCount > 0
  if (status === 'profitable') return projectedProfitLoss > 0
  if (status === 'loss') return projectedProfitLoss < 0
  if (status === 'unsold') return soldItemCount === 0
  if (status === 'partial') return soldItemCount > 0 && remainingItemCount > 0
  if (status === 'complete') return remainingItemCount <= 0 && itemCount > 0

  return asString(row.status).toLowerCase() === status.toLowerCase()
}

function matchesBreakCsvProfitability(row: Record<string, unknown>, profitability: string) {
  if (!profitability || profitability === 'all') return true

  const projectedProfitLoss = asNumber(row.projected_profit_loss)
  const remainingItemCount = asNumber(row.remaining_item_count)
  const soldItemCount = asNumber(row.sold_item_count)
  const itemCount = asNumber(row.item_count)

  if (profitability === 'green') return projectedProfitLoss > 0
  if (profitability === 'red') return projectedProfitLoss < 0
  if (profitability === 'unrealized') return remainingItemCount > soldItemCount
  if (profitability === 'needs-review') {
    return itemCount === 0 || projectedProfitLoss < 0 || soldItemCount === 0
  }

  return true
}

async function exportBreakProfitabilityReport(request: Request) {
  const { searchParams } = new URL(request.url)

  const selectedYear = clampYear(searchParams.get('year'))
  const selectedPeriod = normalizePeriod(searchParams.get('period'))
  const selectedMonth = clampMonth(searchParams.get('month'))
  const selectedQuarter = clampQuarter(searchParams.get('quarter'))
  const selectedSource = String(searchParams.get('source') || 'all').trim()
  const selectedStatus = String(searchParams.get('status') || 'all').trim()
  const selectedProfitability = String(searchParams.get('profitability') || 'all').trim()
  const search = String(searchParams.get('q') || '').trim()
  const selectedStart =
    searchParams.get('start') ||
    searchParams.get('startDate') ||
    searchParams.get('dateFrom') ||
    searchParams.get('date')
  const selectedEnd =
    searchParams.get('end') ||
    searchParams.get('endDate') ||
    searchParams.get('dateTo')

  const { startDate, endDate, label } = getReportDateRange({
    selectedYear,
    period: selectedPeriod,
    start: selectedStart,
    end: selectedEnd,
    month: selectedMonth,
    quarter: selectedQuarter,
    reportLabel: 'Break Profitability',
  })

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return unauthorizedError()
  }

  const [breaksRes, inventoryRes, salesRes] = await Promise.all([
    supabase
      .from('breaks')
      .select('*')
      .eq('user_id', user.id)
      .gte('break_date', startDate)
      .lte('break_date', endDate)
      .order('break_date', { ascending: false }),

    supabase
      .from('inventory_items')
      .select('*')
      .eq('user_id', user.id),

    supabase
      .from('sales')
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
      .eq('user_id', user.id)
      .is('reversed_at', null),
  ])

  if (breaksRes.error) {
    return jsonError(`Could not export break profitability breaks: ${breaksRes.error.message}`)
  }

  if (inventoryRes.error) {
    return jsonError(`Could not export break profitability inventory: ${inventoryRes.error.message}`)
  }

  if (salesRes.error) {
    return jsonError(`Could not export break profitability sales: ${salesRes.error.message}`)
  }

  const breaks = (breaksRes.data ?? []) as (BreakPurchaseRow & Record<string, unknown>)[]
  const inventoryItems = (inventoryRes.data ?? []) as (InventoryItemRow & Record<string, unknown>)[]
  const sales = (salesRes.data ?? []) as SalesRow[]

  const inventoryByBreakId = new Map<string, (InventoryItemRow & Record<string, unknown>)[]>()

  inventoryItems.forEach((item) => {
    const breakId = getInventoryBreakCsvId(item)
    if (!breakId) return

    const existing = inventoryByBreakId.get(breakId) ?? []
    existing.push(item)
    inventoryByBreakId.set(breakId, existing)
  })

  const salesByInventoryId = new Map<string, SalesRow[]>()

  sales.forEach((sale) => {
    const inventoryId = sale.inventory_item_id
    if (!inventoryId) return

    const existing = salesByInventoryId.get(inventoryId) ?? []
    existing.push(sale)
    salesByInventoryId.set(inventoryId, existing)
  })

  let rows = breaks.map((breakRow) => {
    const linkedItems = inventoryByBreakId.get(breakRow.id) ?? []
    const linkedSales = linkedItems.flatMap((item) => salesByInventoryId.get(item.id) ?? [])

    const breakCost = roundMoney(asNumber(breakRow.total_cost))
    const grossSales = roundMoney(linkedSales.reduce((sum, sale) => sum + asNumber(sale.gross_sale), 0))
    const netProceeds = roundMoney(linkedSales.reduce((sum, sale) => sum + asNumber(sale.net_proceeds), 0))
    const realizedCogs = roundMoney(linkedSales.reduce((sum, sale) => sum + asNumber(sale.cost_of_goods_sold), 0))
    const realizedProfit = roundMoney(linkedSales.reduce((sum, sale) => sum + asNumber(sale.profit), 0))

    const soldItemIds = new Set(
      linkedSales
        .map((sale) => sale.inventory_item_id)
        .filter((id): id is string => Boolean(id)),
    )

    const remainingItems = linkedItems.filter((item) => {
      const status = normalizeStatus(item.status).toLowerCase()
      return status !== 'sold' && status !== 'disposed' && getRemainingInventoryCsvQuantity(item) > 0
    })

    const remainingCostBasis = roundMoney(
      remainingItems.reduce((sum, item) => sum + getInventoryItemCost(item), 0),
    )
    const remainingEstimatedValue = roundMoney(
      remainingItems.reduce((sum, item) => sum + getInventoryItemValue(item), 0),
    )
    const projectedTotalValue = roundMoney(netProceeds + remainingEstimatedValue)
    const projectedProfitLoss = roundMoney(projectedTotalValue - breakCost)
    const roiPercent = breakCost > 0 ? roundMoney((projectedProfitLoss / breakCost) * 100) : null

    const base = {
      report: label,
      range_start: startDate,
      range_end: endDate,
      source_filter: selectedSource,
      status_filter: selectedStatus,
      profitability_filter: selectedProfitability,
      break_id: breakRow.id,
      break_date: getBreakCsvDate(breakRow),
      source: getBreakCsvSource(breakRow),
      product: getBreakCsvProduct(breakRow),
      order_number: asString(breakRow.order_number),
      status: asString((breakRow as Record<string, unknown>).status) || 'open',
      notes: asString((breakRow as Record<string, unknown>).notes),
      break_cost: moneyString(breakCost),
      item_count: String(linkedItems.length),
      sold_item_count: String(soldItemIds.size),
      remaining_item_count: String(remainingItems.length),
      gross_sales: moneyString(grossSales),
      net_proceeds: moneyString(netProceeds),
      realized_cogs: moneyString(realizedCogs),
      realized_profit: moneyString(realizedProfit),
      remaining_cost_basis: moneyString(remainingCostBasis),
      remaining_estimated_value: moneyString(remainingEstimatedValue),
      projected_total_value: moneyString(projectedTotalValue),
      projected_profit_loss: moneyString(projectedProfitLoss),
      roi_percent: roiPercent === null ? '' : String(roiPercent),
      suggested_action: '',
    }

    return {
      ...base,
      suggested_action: getBreakCsvSuggestedAction({
        itemCount: linkedItems.length,
        soldItemCount: soldItemIds.size,
        remainingItemCount: remainingItems.length,
        projectedProfitLoss,
        realizedProfit,
      }),
    }
  })

  rows = rows.filter((row) => {
    if (selectedSource !== 'all' && row.source !== selectedSource) return false
    if (!matchesBreakCsvStatus(row, selectedStatus)) return false
    if (!matchesBreakCsvProfitability(row, selectedProfitability)) return false

    if (!matchesCsvSearch([
      row.break_date,
      row.source,
      row.product,
      row.order_number,
      row.status,
      row.notes,
      row.suggested_action,
    ], search)) {
      return false
    }

    return true
  })

  const csv = excelSafeCsv(
    buildCsv(rows, 'No break profitability records found for this report range.'),
  )

  const filename = buildReportFilename({
    reportName: 'break-profitability-report',
    startDate,
    endDate,
    extension: 'csv',
  })

  return csvDownloadResponse({
    csv,
    filename,
  })
}

async function exportPlatformProfitabilityReport(request: Request) {
  const { searchParams } = new URL(request.url)

  const selectedYear = clampYear(searchParams.get('year'))
  const selectedPeriod = normalizePeriod(searchParams.get('period'))
  const selectedMonth = clampMonth(searchParams.get('month'))
  const selectedQuarter = clampQuarter(searchParams.get('quarter'))
  const selectedPlatformRaw = String(searchParams.get('platform') || '').trim()
  const selectedPlatform =
    selectedPlatformRaw && selectedPlatformRaw !== 'all'
      ? selectedPlatformRaw
      : ''
  const search = String(searchParams.get('q') || '').trim()
  const selectedStart =
    searchParams.get('start') ||
    searchParams.get('startDate') ||
    searchParams.get('dateFrom') ||
    searchParams.get('date')
  const selectedEnd =
    searchParams.get('end') ||
    searchParams.get('endDate') ||
    searchParams.get('dateTo')

  const { startDate, endDate, label } = getReportDateRange({
    selectedYear,
    period: selectedPeriod,
    start: selectedStart,
    end: selectedEnd,
    month: selectedMonth,
    quarter: selectedQuarter,
    reportLabel: 'Platform Profitability',
  })

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return unauthorizedError()
  }

  let salesQuery = supabase
    .from('sales')
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
    .eq('user_id', user.id)
    .is('reversed_at', null)
    .gte('sale_date', startDate)
    .lte('sale_date', endDate)
    .order('sale_date', { ascending: false })

  if (selectedPlatform) {
    salesQuery = salesQuery.eq('platform', selectedPlatform)
  }

  const { data, error } = await salesQuery

  if (error) {
    return jsonError(`Could not export platform profitability: ${error.message}`)
  }

  const sales = ((data ?? []) as SalesRow[]).filter((sale) =>
    matchesCsvSearch(
      [
        sale.sale_date,
        sale.platform,
        sale.gross_sale,
        sale.platform_fees,
        sale.shipping_cost,
        sale.other_costs,
        sale.net_proceeds,
        sale.cost_of_goods_sold,
        sale.profit,
        sale.notes,
      ],
      search,
    ),
  )

  const summaryRows = Array.from(
    sales.reduce((map, sale) => {
      const platform = platformKey(sale.platform)
      const current = map.get(platform) ?? {
        count: 0,
        gross: 0,
        fees: 0,
        shipping: 0,
        other: 0,
        net: 0,
        cogs: 0,
        profit: 0,
      }

      map.set(platform, {
        count: current.count + 1,
        gross: current.gross + asNumber(sale.gross_sale),
        fees: current.fees + asNumber(sale.platform_fees),
        shipping: current.shipping + asNumber(sale.shipping_cost),
        other: current.other + asNumber(sale.other_costs),
        net: current.net + asNumber(sale.net_proceeds),
        cogs: current.cogs + asNumber(sale.cost_of_goods_sold),
        profit: current.profit + asNumber(sale.profit),
      })

      return map
    }, new Map<string, { count: number; gross: number; fees: number; shipping: number; other: number; net: number; cogs: number; profit: number }>()),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([platform, values]) => {
      const sellingCosts = roundMoney(values.fees + values.shipping + values.other)
      const marginPercent = values.gross > 0 ? roundMoney((values.profit / values.gross) * 100) : 0
      const averageProfit = values.count > 0 ? roundMoney(values.profit / values.count) : 0

      return {
        report: label,
        section: 'platform_summary',
        range_start: startDate,
        range_end: endDate,
        platform_filter: selectedPlatform || 'All platforms',
        platform,
        sales_count: String(values.count),
        gross_sales: moneyString(roundMoney(values.gross)),
        platform_fees: moneyString(roundMoney(values.fees)),
        shipping_cost: moneyString(roundMoney(values.shipping)),
        other_costs: moneyString(roundMoney(values.other)),
        selling_costs: moneyString(sellingCosts),
        net_proceeds: moneyString(roundMoney(values.net)),
        cost_of_goods_sold: moneyString(roundMoney(values.cogs)),
        profit: moneyString(roundMoney(values.profit)),
        average_profit: moneyString(averageProfit),
        margin_percent: String(marginPercent),
        sale_date: '',
        sale_id: '',
        notes: '',
      }
    })

  const detailRows = sales.map((sale) => ({
    report: label,
    section: 'detail',
    range_start: startDate,
    range_end: endDate,
    platform_filter: selectedPlatform || 'All platforms',
    platform: platformKey(sale.platform),
    sales_count: '',
    gross_sales: moneyString(sale.gross_sale),
    platform_fees: moneyString(sale.platform_fees),
    shipping_cost: moneyString(sale.shipping_cost),
    other_costs: moneyString(sale.other_costs),
    selling_costs: moneyString(roundMoney(asNumber(sale.platform_fees) + asNumber(sale.shipping_cost) + asNumber(sale.other_costs))),
    net_proceeds: moneyString(sale.net_proceeds),
    cost_of_goods_sold: moneyString(sale.cost_of_goods_sold),
    profit: moneyString(sale.profit),
    average_profit: '',
    margin_percent:
      asNumber(sale.gross_sale) > 0
        ? String(roundMoney((asNumber(sale.profit) / asNumber(sale.gross_sale)) * 100))
        : '',
    sale_date: sale.sale_date || '',
    sale_id: sale.id,
    notes: sale.notes || '',
  }))

  const csv = excelSafeCsv(
    buildCsv(
      [...summaryRows, ...detailRows],
      'No platform profitability records found for this report range.',
    ),
  )

  const filename = buildReportFilename({
    reportName: 'platform-profitability-report',
    startDate,
    endDate,
    extension: 'csv',
  })

  return csvDownloadResponse({
    csv,
    filename,
  })
}

async function exportOperationsReport(request: Request) {
  const { searchParams } = new URL(request.url)

  const selectedYear = clampYear(searchParams.get('year'))
  const selectedPeriod = normalizePeriod(searchParams.get('period'))
  const selectedMonth = clampMonth(searchParams.get('month'))
  const selectedQuarter = clampQuarter(searchParams.get('quarter'))
  const search = String(searchParams.get('q') || '').trim()
  const selectedStart =
    searchParams.get('start') ||
    searchParams.get('startDate') ||
    searchParams.get('dateFrom') ||
    searchParams.get('date')
  const selectedEnd =
    searchParams.get('end') ||
    searchParams.get('endDate') ||
    searchParams.get('dateTo')

  const { startDate, endDate, label } = getReportDateRange({
    selectedYear,
    period: selectedPeriod,
    start: selectedStart,
    end: selectedEnd,
    month: selectedMonth,
    quarter: selectedQuarter,
    reportLabel: 'Operations',
  })

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return unauthorizedError()
  }

  const [salesRes, expensesRes, breaksRes, inventoryRes] = await Promise.all([
    supabase
      .from('sales')
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
      .eq('user_id', user.id)
      .is('reversed_at', null)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate)
      .order('sale_date', { ascending: false }),

    supabase
      .from('expenses')
      .select(`
        id,
        expense_date,
        category,
        vendor,
        amount,
        notes,
        created_at
      `)
      .eq('user_id', user.id)
      .gte('expense_date', startDate)
      .lte('expense_date', endDate)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false }),

    supabase
      .from('breaks')
      .select('id, break_date, source_name, product_name, order_number, total_cost')
      .eq('user_id', user.id)
      .gte('break_date', startDate)
      .lte('break_date', endDate)
      .order('break_date', { ascending: false }),

    supabase
      .from('inventory_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  if (salesRes.error) return jsonError(`Could not export operations sales: ${salesRes.error.message}`)
  if (expensesRes.error) return jsonError(`Could not export operations expenses: ${expensesRes.error.message}`)
  if (breaksRes.error) return jsonError(`Could not export operations breaks: ${breaksRes.error.message}`)
  if (inventoryRes.error) return jsonError(`Could not export operations inventory: ${inventoryRes.error.message}`)

  const sales = ((salesRes.data ?? []) as SalesRow[]).filter((sale) =>
    matchesCsvSearch([sale.sale_date, sale.platform, sale.gross_sale, sale.net_proceeds, sale.profit, sale.notes], search),
  )
  const expenses = ((expensesRes.data ?? []) as ExpenseRow[]).filter((expense) =>
    matchesCsvSearch([expense.expense_date, expense.category, expense.vendor, expense.amount, expense.notes], search),
  )
  const breaks = ((breaksRes.data ?? []) as BreakPurchaseRow[]).filter((row) =>
    matchesCsvSearch([row.break_date, row.source_name, row.product_name, row.order_number, row.total_cost], search),
  )
  const inventoryItems = ((inventoryRes.data ?? []) as InventoryItemRow[]).filter((item) =>
    matchesCsvSearch([item.title, item.item_name, item.player_name, item.year, item.set_name, item.card_number, item.item_number, item.status, item.notes], search),
  )

  const openInventory = inventoryItems.filter((item) => {
    const status = normalizeStatus(item.status).toLowerCase()
    return status !== 'sold' && status !== 'disposed' && status !== 'archived'
  })
  const actionNeeded = openInventory.filter((item) => matchesInventoryActionNeededFilter(item, 'needed'))
  const aged90 = openInventory.filter((item) => {
    const daysHeld = getInventoryDaysHeld(item)
    return daysHeld !== null && daysHeld >= 90
  })
  const missingCost = openInventory.filter((item) => getInventoryItemCost(item) <= 0)
  const missingValue = openInventory.filter((item) => getInventoryItemValue(item) <= 0)

  const totalGrossSales = roundMoney(sales.reduce((sum, sale) => sum + asNumber(sale.gross_sale), 0))
  const totalNetProceeds = roundMoney(sales.reduce((sum, sale) => sum + asNumber(sale.net_proceeds), 0))
  const totalProfit = roundMoney(sales.reduce((sum, sale) => sum + asNumber(sale.profit), 0))
  const totalExpenses = roundMoney(expenses.reduce((sum, expense) => sum + asNumber(expense.amount), 0))
  const totalBreakCost = roundMoney(breaks.reduce((sum, row) => sum + asNumber(row.total_cost), 0))
  const openInventoryCost = roundMoney(openInventory.reduce((sum, item) => sum + getInventoryItemCost(item), 0))
  const openInventoryValue = roundMoney(openInventory.reduce((sum, item) => sum + getInventoryItemValue(item), 0))

  const rows = [
    {
      report: label,
      range_start: startDate,
      range_end: endDate,
      section: 'sales',
      metric: 'completed_sales',
      count: String(sales.length),
      amount: moneyString(totalGrossSales),
      notes: 'Gross sales in selected range.',
    },
    {
      report: label,
      range_start: startDate,
      range_end: endDate,
      section: 'sales',
      metric: 'net_proceeds',
      count: String(sales.length),
      amount: moneyString(totalNetProceeds),
      notes: 'Net proceeds in selected range.',
    },
    {
      report: label,
      range_start: startDate,
      range_end: endDate,
      section: 'sales',
      metric: 'profit',
      count: String(sales.length),
      amount: moneyString(totalProfit),
      notes: 'Profit from completed, non-reversed sales.',
    },
    {
      report: label,
      range_start: startDate,
      range_end: endDate,
      section: 'expenses',
      metric: 'manual_expenses',
      count: String(expenses.length),
      amount: moneyString(totalExpenses),
      notes: 'Expenses in selected range.',
    },
    {
      report: label,
      range_start: startDate,
      range_end: endDate,
      section: 'purchases',
      metric: 'break_purchases',
      count: String(breaks.length),
      amount: moneyString(totalBreakCost),
      notes: 'Break/acquisition records in selected range.',
    },
    {
      report: label,
      range_start: startDate,
      range_end: endDate,
      section: 'inventory',
      metric: 'open_inventory',
      count: String(openInventory.length),
      amount: moneyString(openInventoryCost),
      notes: 'Current non-sold inventory cost basis.',
    },
    {
      report: label,
      range_start: startDate,
      range_end: endDate,
      section: 'inventory',
      metric: 'estimated_value',
      count: String(openInventory.length),
      amount: moneyString(openInventoryValue),
      notes: 'Current estimated value for open inventory.',
    },
    {
      report: label,
      range_start: startDate,
      range_end: endDate,
      section: 'workflow',
      metric: 'action_needed',
      count: String(actionNeeded.length),
      amount: '',
      notes: 'Open inventory requiring workflow review.',
    },
    {
      report: label,
      range_start: startDate,
      range_end: endDate,
      section: 'workflow',
      metric: 'ninety_day_inventory',
      count: String(aged90.length),
      amount: '',
      notes: 'Open inventory held 90+ days.',
    },
    {
      report: label,
      range_start: startDate,
      range_end: endDate,
      section: 'workflow',
      metric: 'missing_cost_basis',
      count: String(missingCost.length),
      amount: '',
      notes: 'Open inventory with missing/zero cost basis.',
    },
    {
      report: label,
      range_start: startDate,
      range_end: endDate,
      section: 'workflow',
      metric: 'missing_estimated_value',
      count: String(missingValue.length),
      amount: '',
      notes: 'Open inventory with missing estimated value.',
    },
  ]

  const csv = excelSafeCsv(
    buildCsv(rows, 'No operations records found for this report range.'),
  )

  const filename = buildReportFilename({
    reportName: 'operations-report',
    startDate,
    endDate,
    extension: 'csv',
  })

  return csvDownloadResponse({
    csv,
    filename,
  })
}

async function exportCpaPacket(request: Request) {
  const { searchParams } = new URL(request.url);

  const selectedYear = clampYear(searchParams.get("year"));
  const startDate = `${selectedYear}-01-01`;
  const endDate = `${selectedYear}-12-31`;
  const generatedAt = new Date().toISOString();
  const reportLabel = `HITS™ CPA Export Packet ${selectedYear}`;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return unauthorizedError();
  }

  const [
    salesRes,
    expensesRes,
    inventoryRes,
    breaksRes,
    taxSettingsRes,
    disposalTransactionsRes,
  ] = await Promise.all([
    supabase
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
      .order("sale_date", { ascending: false }),

    supabase
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
      .order("created_at", { ascending: false }),

    supabase
      .from("inventory_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("breaks")
      .select(
        "id, break_date, source_name, product_name, order_number, total_cost",
      )
      .eq("user_id", user.id)
      .gte("break_date", startDate)
      .lte("break_date", endDate)
      .order("break_date", { ascending: false }),

    supabase
      .from("tax_year_settings")
      .select(
        `
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
      `,
      )
      .eq("user_id", user.id)
      .eq("tax_year", selectedYear)
      .maybeSingle(),

    supabase
      .from("inventory_transactions")
      .select(
        `
        id,
        inventory_item_id,
        transaction_type,
        quantity_change,
        notes,
        disposal_reason,
        disposal_notes,
        finalized_for_tax,
        created_at
      `,
      )
      .eq("user_id", user.id)
      .eq("transaction_type", "disposal_writeoff_review")
      .eq("finalized_for_tax", true)
      .gte("created_at", `${startDate}T00:00:00.000Z`)
      .lte("created_at", `${endDate}T23:59:59.999Z`)
      .order("created_at", { ascending: false }),
  ]);

  if (salesRes.error)
    return jsonError(
      `Could not export CPA packet sales: ${salesRes.error.message}`,
    );
  if (expensesRes.error)
    return jsonError(
      `Could not export CPA packet expenses: ${expensesRes.error.message}`,
    );
  if (inventoryRes.error)
    return jsonError(
      `Could not export CPA packet inventory: ${inventoryRes.error.message}`,
    );
  if (breaksRes.error)
    return jsonError(
      `Could not export CPA packet purchases: ${breaksRes.error.message}`,
    );
  if (taxSettingsRes.error)
    return jsonError(
      `Could not export CPA packet tax settings: ${taxSettingsRes.error.message}`,
    );
  if (disposalTransactionsRes.error)
    return jsonError(
      `Could not export CPA packet disposal review: ${disposalTransactionsRes.error.message}`,
    );

  const sales = (salesRes.data ?? []) as SalesRow[];
  const expenses = (expensesRes.data ?? []) as ExpenseRow[];
  const inventoryItems = (inventoryRes.data ?? []) as InventoryItemRow[];
  const breaks = (breaksRes.data ?? []) as BreakPurchaseRow[];
  const taxSettings = (taxSettingsRes.data ??
    null) as TaxYearSettingsRow | null;
  const disposalTransactions = (disposalTransactionsRes.data ??
    []) as DisposalTransactionRow[];

  const soldInventoryIds = Array.from(
    new Set(
      sales
        .map((sale) => sale.inventory_item_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const disposalInventoryIds = Array.from(
    new Set(
      disposalTransactions
        .map((row) => row.inventory_item_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const linkedInventoryIds = Array.from(
    new Set([...soldInventoryIds, ...disposalInventoryIds]),
  );

  const linkedInventoryRes =
    linkedInventoryIds.length > 0
      ? await supabase
          .from("inventory_items")
          .select("*")
          .eq("user_id", user.id)
          .in("id", linkedInventoryIds)
      : { data: [], error: null };

  if (linkedInventoryRes.error) {
    return jsonError(
      `Could not export CPA packet linked inventory: ${linkedInventoryRes.error.message}`,
    );
  }

  const linkedInventoryItems = (linkedInventoryRes.data ??
    []) as InventoryItemRow[];
  const inventoryById = new Map(
    [...inventoryItems, ...linkedInventoryItems].map((item) => [item.id, item]),
  );

  const totalGrossSales = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.gross_sale), 0),
  );
  const totalPlatformFees = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.platform_fees), 0),
  );
  const totalShippingCosts = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.shipping_cost), 0),
  );
  const totalOtherSellingCosts = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.other_costs), 0),
  );
  const totalSellingCosts = roundMoney(
    totalPlatformFees + totalShippingCosts + totalOtherSellingCosts,
  );
  const totalNetProceeds = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.net_proceeds), 0),
  );
  const totalCOGS = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.cost_of_goods_sold), 0),
  );
  const totalProfit = roundMoney(
    sales.reduce((sum, row) => sum + asNumber(row.profit), 0),
  );
  const totalBreakPurchases = roundMoney(
    breaks.reduce((sum, row) => sum + asNumber(row.total_cost), 0),
  );

  const beginningInventory = roundMoney(
    asNumber(taxSettings?.beginning_inventory),
  );
  const businessUseOfHome = roundMoney(
    asNumber(taxSettings?.business_use_of_home),
  );
  const vehicleExpense = roundMoney(asNumber(taxSettings?.vehicle_expense));
  const depreciationExpense = roundMoney(
    asNumber(taxSettings?.depreciation_expense),
  );
  const legalProfessional = roundMoney(
    asNumber(taxSettings?.legal_professional),
  );
  const insurance = roundMoney(asNumber(taxSettings?.insurance));
  const utilities = roundMoney(asNumber(taxSettings?.utilities));
  const taxesLicenses = roundMoney(asNumber(taxSettings?.taxes_licenses));
  const repairsMaintenance = roundMoney(
    asNumber(taxSettings?.repairs_maintenance),
  );
  const endingInventoryIsLocked =
    taxSettings?.ending_inventory_snapshot != null;

  const openInventoryItems = inventoryItems.filter((item) => {
    const status = normalizeStatus(item.status).toLowerCase();
    const availableQuantity = asNumber(
      item.available_quantity ?? item.quantity ?? 0,
    );

    return status !== "sold" && status !== "disposed" && availableQuantity > 0;
  });

  const endingInventoryCost = roundMoney(
    openInventoryItems.reduce(
      (sum, item) => sum + getInventoryItemCost(item),
      0,
    ),
  );
  const endingInventoryEstimatedValue = roundMoney(
    openInventoryItems.reduce(
      (sum, item) => sum + getInventoryItemValue(item),
      0,
    ),
  );

  const expenseTotals = new Map<string, number>();

  expenses.forEach((expense) => {
    const category =
      String(expense.category || "Uncategorized").trim() || "Uncategorized";
    expenseTotals.set(
      category,
      roundMoney((expenseTotals.get(category) ?? 0) + asNumber(expense.amount)),
    );
  });

  const manualExpenseTotal = roundMoney(
    expenses.reduce((sum, row) => sum + asNumber(row.amount), 0),
  );
  const extraScheduleCExpenseTotal = roundMoney(
    businessUseOfHome +
      vehicleExpense +
      depreciationExpense +
      legalProfessional +
      insurance +
      utilities +
      taxesLicenses +
      repairsMaintenance,
  );

  const totalDisposalReviewQuantity = disposalTransactions.reduce(
    (sum, row) => sum + Math.abs(asNumber(row.quantity_change)),
    0,
  );
  const totalDisposalReviewCost = roundMoney(
    disposalTransactions.reduce((sum, row) => {
      const item = row.inventory_item_id
        ? inventoryById.get(row.inventory_item_id)
        : undefined;
      return sum + (item ? getInventoryItemCost(item) : 0);
    }, 0),
  );

  const uncategorizedExpenseCount = expenses.filter((expense) => {
    const category = String(expense.category ?? "")
      .trim()
      .toLowerCase();
    return (
      !category ||
      category === "uncategorized" ||
      category.includes("uncategorized") ||
      category === "other" ||
      category.includes("other")
    );
  }).length;

  const disposalRowsMissingReason = disposalTransactions.filter(
    (row) => !String(row.disposal_reason ?? "").trim(),
  ).length;
  const disposalRowsMissingNotes = disposalTransactions.filter(
    (row) => !String(row.disposal_notes ?? "").trim(),
  ).length;

  const taxReadinessWarnings: string[] = [];

  if (!taxSettings) {
    taxReadinessWarnings.push(
      "No yearly tax settings record exists yet. Beginning inventory and extra Schedule C lines are using zero defaults.",
    );
  }

  if (beginningInventory === 0 && (totalCOGS > 0 || endingInventoryCost > 0)) {
    taxReadinessWarnings.push(
      "Beginning inventory is zero. Confirm this is correct before filing.",
    );
  }

  if (!endingInventoryIsLocked) {
    taxReadinessWarnings.push(
      "Ending inventory is not locked. Report values may change if inventory changes. Lock the tax-year snapshot before filing or sending final numbers to a CPA.",
    );
  }

  if (uncategorizedExpenseCount > 0) {
    taxReadinessWarnings.push(
      `${uncategorizedExpenseCount} other / uncategorized expense record${uncategorizedExpenseCount === 1 ? "" : "s"} should be reviewed before filing.`,
    );
  }

  if (expenses.length === 0 && sales.length > 0) {
    taxReadinessWarnings.push(
      "No manual expenses were recorded for the year. Confirm supplies, software, subscriptions, equipment, and other costs were not missed.",
    );
  }

  if (disposalTransactions.length > 0) {
    taxReadinessWarnings.push(
      "Finalized disposal / write-off review items exist. Review them so they are not double counted as expenses, giveaways, donations, or separate inventory losses.",
    );
  }

  if (disposalRowsMissingReason > 0) {
    taxReadinessWarnings.push(
      `${disposalRowsMissingReason} finalized disposal item${disposalRowsMissingReason === 1 ? "" : "s"} missing a disposal reason.`,
    );
  }

  if (disposalRowsMissingNotes > 0) {
    taxReadinessWarnings.push(
      `${disposalRowsMissingNotes} finalized disposal item${disposalRowsMissingNotes === 1 ? "" : "s"} missing detailed notes.`,
    );
  }

  const baseRow: CpaPacketCsvRow = {
    packet: "CPA Export Packet",
    section: "",
    subsection: "",
    report: reportLabel,
    range_start: startDate,
    range_end: endDate,
    generated_at: generatedAt,
    metric: "",
    value: "",
    date: "",
    item: "",
    category: "",
    schedule_c_area: "",
    platform: "",
    vendor: "",
    status: "",
    quantity: "",
    gross_sale: "",
    platform_fees: "",
    shipping_cost: "",
    other_costs: "",
    net_proceeds: "",
    cost_of_goods_sold: "",
    profit: "",
    cost_basis: "",
    estimated_value: "",
    estimated_gain_loss: "",
    source: "",
    order_number: "",
    notes: "",
    warning: "",
    record_id: "",
    inventory_item_id: "",
  };

  const rows: CpaPacketCsvRow[] = [];

  const pushRow = (row: Partial<CpaPacketCsvRow>) => {
    rows.push({
      ...baseRow,
      ...row,
    });
  };

  const summaryMetrics = [
    ["sales_count", String(sales.length)],
    ["gross_sales", moneyString(totalGrossSales)],
    ["platform_fees", moneyString(totalPlatformFees)],
    ["shipping_costs", moneyString(totalShippingCosts)],
    ["other_selling_costs", moneyString(totalOtherSellingCosts)],
    ["total_selling_costs", moneyString(totalSellingCosts)],
    ["net_proceeds", moneyString(totalNetProceeds)],
    ["realized_cogs", moneyString(totalCOGS)],
    ["gross_income_after_cogs", moneyString(totalGrossSales - totalCOGS)],
    ["realized_profit", moneyString(totalProfit)],
    ["break_purchases", moneyString(totalBreakPurchases)],
    ["beginning_inventory", moneyString(beginningInventory)],
    ["ending_inventory_cost", moneyString(endingInventoryCost)],
    [
      "ending_inventory_estimated_value",
      moneyString(endingInventoryEstimatedValue),
    ],
    ["manual_expenses", moneyString(manualExpenseTotal)],
    [
      "extra_schedule_c_settings_expenses",
      moneyString(extraScheduleCExpenseTotal),
    ],
    ["disposal_review_items", String(disposalTransactions.length)],
    ["disposal_review_quantity", String(totalDisposalReviewQuantity)],
    ["disposal_review_cost_basis", moneyString(totalDisposalReviewCost)],
  ];

  summaryMetrics.forEach(([metric, value]) => {
    pushRow({
      section: "summary",
      subsection: "year_end_totals",
      metric,
      value,
    });
  });

  const scheduleCSettings = [
    ["business_use_of_home", "Schedule C Line 30", businessUseOfHome],
    ["vehicle_expense", "Schedule C Line 9", vehicleExpense],
    ["depreciation_section_179", "Schedule C Line 13", depreciationExpense],
    ["legal_professional", "Schedule C Line 17", legalProfessional],
    ["insurance", "Schedule C Line 15", insurance],
    ["utilities", "Schedule C Line 25", utilities],
    ["taxes_licenses", "Schedule C Line 23", taxesLicenses],
    ["repairs_maintenance", "Schedule C Line 21", repairsMaintenance],
  ] as const;

  scheduleCSettings.forEach(([metric, scheduleCArea, amount]) => {
    pushRow({
      section: "schedule_c_support",
      subsection: "manual_tax_year_settings",
      metric,
      schedule_c_area: scheduleCArea,
      value: moneyString(amount),
      notes:
        metric === "business_use_of_home"
          ? "Confirm eligibility and calculation method with tax preparer."
          : "",
    });
  });

  Array.from(expenseTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([category, amount]) => {
      pushRow({
        section: "schedule_c_support",
        subsection: "expense_category_totals",
        category,
        schedule_c_area: getExpenseScheduleCArea(category),
        value: moneyString(amount),
      });
    });

  taxReadinessWarnings.forEach((warning, index) => {
    pushRow({
      section: "tax_readiness",
      subsection: "warnings",
      metric: `warning_${index + 1}`,
      warning,
    });
  });

  breaks.forEach((row) => {
    pushRow({
      section: "inventory_basis",
      subsection: "break_purchase_detail",
      date: row.break_date || "",
      item: row.product_name || "",
      source: row.source_name || "",
      order_number: row.order_number || "",
      cost_basis: moneyString(row.total_cost),
      record_id: row.id,
    });
  });

  openInventoryItems.forEach((item) => {
    const costBasis = getInventoryItemCost(item);
    const estimatedValue = getInventoryItemValue(item);

    pushRow({
      section: "inventory_basis",
      subsection: "ending_inventory_detail",
      date: getInventoryItemDate(item) || "",
      item: getInventoryItemName(item),
      status: normalizeStatus(item.status),
      quantity: String(asNumber(item.available_quantity ?? item.quantity ?? 0)),
      cost_basis: moneyString(costBasis),
      estimated_value: moneyString(estimatedValue),
      estimated_gain_loss: moneyString(roundMoney(estimatedValue - costBasis)),
      notes: item.notes || "",
      inventory_item_id: item.id,
      record_id: item.id,
    });
  });

  sales.forEach((sale) => {
    const inventoryItem = sale.inventory_item_id
      ? inventoryById.get(sale.inventory_item_id)
      : undefined;

    pushRow({
      section: "sales",
      subsection: "sales_detail",
      date: sale.sale_date || "",
      item: buildSoldItemName(inventoryItem),
      platform: platformKey(sale.platform),
      gross_sale: moneyString(sale.gross_sale),
      platform_fees: moneyString(sale.platform_fees),
      shipping_cost: moneyString(sale.shipping_cost),
      other_costs: moneyString(sale.other_costs),
      net_proceeds: moneyString(sale.net_proceeds),
      cost_of_goods_sold: moneyString(sale.cost_of_goods_sold),
      profit: moneyString(sale.profit),
      notes: sale.notes || "",
      inventory_item_id: sale.inventory_item_id || "",
      record_id: sale.id,
    });
  });

  expenses.forEach((expense) => {
    const category =
      String(expense.category || "Uncategorized").trim() || "Uncategorized";

    pushRow({
      section: "expenses",
      subsection: "expense_detail",
      date: expense.expense_date || "",
      category,
      schedule_c_area: getExpenseScheduleCArea(category),
      vendor: expense.vendor || "",
      value: moneyString(expense.amount),
      notes: expense.notes || "",
      record_id: expense.id,
    });
  });

  disposalTransactions.forEach((row) => {
    const item = row.inventory_item_id
      ? inventoryById.get(row.inventory_item_id)
      : undefined;

    pushRow({
      section: "disposal_writeoff_review",
      subsection: "finalized_disposal_detail",
      date: row.created_at || "",
      item: item ? getInventoryItemName(item) : "Inventory item not found",
      quantity: String(Math.abs(asNumber(row.quantity_change))),
      cost_basis: item
        ? moneyString(getInventoryItemCost(item))
        : moneyString(0),
      notes: [
        row.disposal_reason || "No disposal reason entered",
        row.disposal_notes || "",
        row.notes || "",
      ]
        .filter(Boolean)
        .join(" | "),
      inventory_item_id: row.inventory_item_id || "",
      record_id: row.id,
    });
  });

  if (rows.length === 0) {
    pushRow({
      section: "empty",
      subsection: "no_records",
      notes: `No CPA packet records found for ${selectedYear}.`,
    });
  }

  const csv = excelSafeCsv(
    buildCsv(rows, `No CPA packet records found for ${selectedYear}.`),
  );

  const filename = buildReportFilename({
    reportName: "cpa-export-packet",
    startDate,
    endDate,
    extension: "csv",
  });

  return csvDownloadResponse({
    csv,
    filename,
  });
}

function getWriteOffDate(row: InventoryItemRow & Record<string, unknown>) {
  return (
    asString(row.disposed_at) ||
    asString(row.disposal_date) ||
    asString(row.updated_at) ||
    asString(row.created_at) ||
    asString(row.date_added) ||
    asString(row.purchase_date) ||
    asString(row.acquired_at)
  );
}

function getWriteOffReason(row: InventoryItemRow & Record<string, unknown>) {
  return (
    asString(row.disposal_reason) ||
    asString(row.disposed_reason) ||
    asString(row.write_off_reason) ||
    asString(row.reason) ||
    asString(row.notes) ||
    ""
  );
}

function matchesWriteOffDateRange(
  row: InventoryItemRow & Record<string, unknown>,
  startDate: string,
  endDate: string,
) {
  const rawDate = getWriteOffDate(row);
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

async function exportWriteOffsReport(request: Request) {
  const { searchParams } = new URL(request.url);

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

  const { startDate, endDate, label } = getReportDateRange({
    selectedYear,
    period: selectedPeriod,
    start: selectedStart,
    end: selectedEnd,
    month: selectedMonth,
    quarter: selectedQuarter,
    reportLabel: "Write-Offs",
  });

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
    return jsonError(`Could not export write-offs: ${error.message}`);
  }

  const allItems = (data ?? []) as (InventoryItemRow & Record<string, unknown>)[];

  const rows = allItems.filter((item) => {
    const status = normalizeStatus(item.status).toLowerCase();

    if (selectedStatus !== "all" && status !== selectedStatus.toLowerCase()) return false;
    if (!matchesWriteOffDateRange(item, startDate, endDate)) return false;

    if (search) {
      const haystack = [
        getInventoryItemName(item),
        item.status,
        item.year,
        item.set_name,
        item.card_number,
        item.item_number,
        getWriteOffReason(item),
        item.notes,
      ]
        .map(asString)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(search.toLowerCase())) return false;
    }

    return true;
  });

  const disposedCount = rows.filter((item) => normalizeStatus(item.status).toLowerCase() === "disposed").length;
  const junkCount = rows.filter((item) => normalizeStatus(item.status).toLowerCase() === "junk").length;
  const totalQuantity = rows.reduce((sum, item) => sum + Math.max(asNumber(item.quantity) || asNumber(item.available_quantity) || 1, 1), 0);
  const totalCostBasis = roundMoney(rows.reduce((sum, item) => sum + getInventoryItemCost(item), 0));
  const totalEstimatedValue = roundMoney(rows.reduce((sum, item) => sum + getInventoryItemValue(item), 0));
  const totalGainLoss = roundMoney(totalEstimatedValue - totalCostBasis);

  const baseRow = {
    report: label,
    section: "",
    range_start: startDate,
    range_end: endDate,
    status_filter: selectedStatus || "all",
    metric: "",
    value: "",
    item_date: "",
    item_name: "",
    status: "",
    quantity: "",
    cost_basis: "",
    estimated_value: "",
    estimated_gain_loss: "",
    reason: "",
    notes: "",
    item_id: "",
  };

  const summaryRows = [
    ["records_in_view", String(rows.length)],
    ["quantity", String(totalQuantity)],
    ["disposed", String(disposedCount)],
    ["junk", String(junkCount)],
    ["cost_basis", moneyString(totalCostBasis)],
    ["estimated_value", moneyString(totalEstimatedValue)],
    ["estimated_gain_loss", moneyString(totalGainLoss)],
  ].map(([metric, value]) => ({
    ...baseRow,
    section: "summary",
    metric,
    value,
  }));

  const detailRows = rows.map((item) => {
    const quantity = Math.max(asNumber(item.quantity) || asNumber(item.available_quantity) || 1, 1);
    const costBasis = getInventoryItemCost(item);
    const estimatedValue = getInventoryItemValue(item);

    return {
      ...baseRow,
      section: "detail",
      item_date: getWriteOffDate(item),
      item_name: getInventoryItemName(item),
      status: normalizeStatus(item.status),
      quantity: String(quantity),
      cost_basis: moneyString(costBasis),
      estimated_value: moneyString(estimatedValue),
      estimated_gain_loss: moneyString(roundMoney(estimatedValue - costBasis)),
      reason: getWriteOffReason(item),
      notes: asString(item.notes),
      item_id: item.id,
    };
  });

  const csv = excelSafeCsv(
    buildCsv(
      [...summaryRows, ...detailRows],
      "No write-off or disposal records found for this report range.",
    ),
  );

  const filename = buildReportFilename({
    reportName: "write-offs-report",
    startDate,
    endDate,
    extension: "csv",
  });

  return csvDownloadResponse({
    csv,
    filename,
  });
}

export async function GET(request: Request, context: RouteContext) {
  const { reportType } = await context.params;

  if (reportType === "sales") {
    return exportSalesReport(request);
  }

  if (reportType === "cogs") {
    return exportSalesReport(request);
  }

  if (reportType === "sales-tax") {
    return exportSalesReport(request);
  }

  if (reportType === "expenses") {
    return exportExpensesReport(request);
  }

  if (reportType === "inventory") {
    return exportInventoryReport(request);
  }

  if (reportType === "open-lots") {
    return exportOpenLotsReport(request);
  }

  if (reportType === "write-offs") {
    return exportWriteOffsReport(request);
  }

  if (reportType === "shipping") {
    return exportShippingReport(request);
  }

  if (reportType === "cpa-packet") {
    return exportCpaPacket(request);
  }

  if (reportType === "break-profitability") {
    return exportBreakProfitabilityReport(request);
  }

  if (reportType === "platform-profitability") {
    return exportPlatformProfitabilityReport(request);
  }

  if (reportType === "operations") {
    return exportOperationsReport(request);
  }

  return jsonError(`Unsupported report export type: ${reportType}`, 404);
}
