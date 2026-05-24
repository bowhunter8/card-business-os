import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  buildReportCsvHref,
  buildReportPdfHref,
  buildReportPrintHref,
} from "@/lib/reports/report-url-utils";

import ReportDateFilters from "@/app/app/components/reports/ReportDateFilters";
import ReportExportButtons from "@/app/app/components/reports/ReportExportButtons";
import ReportSummaryCards from "@/app/app/components/reports/ReportSummaryCards";
import ReportTable from "@/app/app/components/reports/ReportTable";

type SaleRow = {
  id: string;
  sale_date?: string | null;
  gross_sale?: number | string | null;
  platform_fees?: number | string | null;
  shipping_cost?: number | string | null;
  other_costs?: number | string | null;
  net_proceeds?: number | string | null;
  cost_of_goods_sold?: number | string | null;
  profit?: number | string | null;
  platform?: string | null;
  notes?: string | null;
  inventory_item_id?: string | null;
  created_at?: string | null;
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
  allocated_cost?: number | string | null;
  sold_price?: number | string | null;
  sale_price?: number | string | null;
  sold_at?: string | null;
  sale_date?: string | null;
  notes?: string | null;
};

type CogsReportRow = {
  id: string;
  sale: SaleRow;
  inventoryItem?: InventoryItemRow;
  saleDate: string | null;
  itemName: string;
  platform: string;
  grossSale: number;
  sellingCosts: number;
  netProceeds: number;
  realizedCogs: number;
  profit: number;
  marginPercent: number | null;
  notes: string;
};

type SearchParams = {
  q?: string;
  platform?: string;
  profitability?: string;
  dateFrom?: string;
  dateTo?: string;
  period?: string;
  date?: string;
  year?: string;
  month?: string;
  quarter?: string;
  startDate?: string;
  endDate?: string;
  start?: string;
  end?: string;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

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

function formatCurrency(value: unknown) {
  return currencyFormatter.format(asNumber(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return dateFormatter.format(date);
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return percentFormatter.format(value);
}

function getSaleDate(sale: SaleRow) {
  return sale.sale_date || sale.created_at || null;
}

function getInventoryItemName(item: InventoryItemRow | undefined) {
  if (!item) return "Unlinked sale";

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

function platformName(value: string | null | undefined) {
  const clean = asString(value).trim();
  return clean || "Unknown";
}

function getSaleCogs(sale: SaleRow, item: InventoryItemRow | undefined) {
  const saleCogs = asNumber(sale.cost_of_goods_sold);

  if (saleCogs > 0) return saleCogs;

  return 0;
}

function getSaleGross(sale: SaleRow, item: InventoryItemRow | undefined) {
  const grossSale = asNumber(sale.gross_sale);

  if (grossSale > 0) return grossSale;

  return asNumber(item?.sold_price ?? item?.sale_price ?? 0);
}

function getSaleNetProceeds(
  sale: SaleRow,
  grossSale: number,
  sellingCosts: number,
) {
  const netProceeds = asNumber(sale.net_proceeds);

  if (netProceeds !== 0) return netProceeds;

  return grossSale - sellingCosts;
}

function getSaleProfit(
  sale: SaleRow,
  netProceeds: number,
  realizedCogs: number,
) {
  const profit = asNumber(sale.profit);

  if (profit !== 0) return profit;

  return netProceeds - realizedCogs;
}

function matchesDateRange(
  row: CogsReportRow,
  startDate: string,
  endDate: string,
) {
  if (!row.saleDate) return true;

  const itemDate = new Date(row.saleDate);
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

function matchesSearch(row: CogsReportRow, search: string) {
  if (!search) return true;

  const item = row.inventoryItem;
  const haystack = [
    row.itemName,
    row.platform,
    row.notes,
    row.sale.notes,
    item?.title,
    item?.item_name,
    item?.player_name,
    item?.year,
    item?.set_name,
    item?.card_number,
    item?.item_number,
    item?.notes,
  ]
    .map(asString)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

function matchesProfitability(row: CogsReportRow, profitability: string) {
  if (!profitability || profitability === "all") return true;

  if (profitability === "profit") return row.profit > 0;
  if (profitability === "loss") return row.profit < 0;
  if (profitability === "break-even") return row.profit === 0;
  if (profitability === "missing-cogs") return row.realizedCogs <= 0;

  return true;
}

function buildCogsCsvHref(params: SearchParams) {
  return buildReportCsvHref("cogs", {
    q: params.q,
    platform: params.platform,
    profitability: params.profitability,
    period: params.period,
    date: params.date,
    year: params.year,
    month: params.month,
    quarter: params.quarter,
    startDate: params.startDate || params.dateFrom || params.start,
    endDate: params.endDate || params.dateTo || params.end,
    dateFrom: params.dateFrom || params.startDate || params.start,
    dateTo: params.dateTo || params.endDate || params.end,
  });
}

function buildCogsExportParams({
  search,
  selectedPlatform,
  selectedProfitability,
  selectedPeriod,
  selectedYear,
  selectedMonth,
  selectedQuarter,
  selectedDate,
  startDate,
  endDate,
}: {
  search: string;
  selectedPlatform: string;
  selectedProfitability: string;
  selectedPeriod: ReportPeriod;
  selectedYear: number;
  selectedMonth: number;
  selectedQuarter: number;
  selectedDate: string;
  startDate: string;
  endDate: string;
}) {
  return {
    ...(search ? { q: search } : {}),
    ...(selectedPlatform !== "all" ? { platform: selectedPlatform } : {}),
    ...(selectedProfitability !== "all"
      ? { profitability: selectedProfitability }
      : {}),
    period: periodToSharedFilterValue(selectedPeriod),
    year: String(selectedYear),
    ...(selectedPeriod === "day" || selectedPeriod === "week"
      ? { date: selectedDate }
      : {}),
    ...(selectedPeriod === "month" ? { month: String(selectedMonth) } : {}),
    ...(selectedPeriod === "quarter"
      ? { quarter: String(selectedQuarter) }
      : {}),
    ...(selectedPeriod === "custom"
      ? { startDate, endDate, dateFrom: startDate, dateTo: endDate }
      : {}),
  };
}

function buildSalesHref(search: string, selectedPlatform: string) {
  const query = new URLSearchParams();

  if (search) query.set("q", search);
  if (selectedPlatform && selectedPlatform !== "all") {
    query.set("platform", selectedPlatform);
  }

  const queryString = query.toString();
  return `/app/reports/sales${queryString ? `?${queryString}` : ""}`;
}

function buildCogsRows(
  sales: SaleRow[],
  inventoryById: Map<string, InventoryItemRow>,
) {
  return sales.map((sale) => {
    const inventoryItem = sale.inventory_item_id
      ? inventoryById.get(sale.inventory_item_id)
      : undefined;

    const sellingCosts = roundMoney(
      asNumber(sale.platform_fees) +
        asNumber(sale.shipping_cost) +
        asNumber(sale.other_costs),
    );
    const grossSale = roundMoney(getSaleGross(sale, inventoryItem));
    const netProceeds = roundMoney(
      getSaleNetProceeds(sale, grossSale, sellingCosts),
    );
    const realizedCogs = roundMoney(getSaleCogs(sale, inventoryItem));
    const profit = roundMoney(getSaleProfit(sale, netProceeds, realizedCogs));
    const marginPercent = grossSale > 0 ? profit / grossSale : null;

    return {
      id: sale.id,
      sale,
      inventoryItem,
      saleDate: getSaleDate(sale),
      itemName: getInventoryItemName(inventoryItem),
      platform: platformName(sale.platform),
      grossSale,
      sellingCosts,
      netProceeds,
      realizedCogs,
      profit,
      marginPercent,
      notes: sale.notes || inventoryItem?.notes || "",
    };
  });
}

type ReportPeriod = "day" | "week" | "month" | "quarter" | "year" | "custom";

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

  return "month";
}

function periodToSharedFilterValue(period: ReportPeriod) {
  if (period === "day") return "daily";
  if (period === "week") return "weekly";
  if (period === "month") return "monthly";
  if (period === "quarter") return "quarterly";
  if (period === "year") return "yearly";

  return "custom";
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
  result.setDate(result.getDate() - result.getDay());

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
    };
  }

  if (period === "week") {
    const selectedDay = parseInputDate(start, defaultAnchor);
    const weekStart = getStartOfWeek(selectedDay);
    const weekEnd = getEndOfWeek(selectedDay);

    return {
      startDate: dateToInputValue(weekStart),
      endDate: dateToInputValue(weekEnd),
    };
  }

  if (period === "month") {
    const monthStart = new Date(selectedYear, month - 1, 1);
    const monthEnd = new Date(selectedYear, month, 0);

    return {
      startDate: dateToInputValue(monthStart),
      endDate: dateToInputValue(monthEnd),
    };
  }

  if (period === "quarter") {
    const quarterStartMonth = (quarter - 1) * 3;
    const quarterStart = new Date(selectedYear, quarterStartMonth, 1);
    const quarterEnd = new Date(selectedYear, quarterStartMonth + 3, 0);

    return {
      startDate: dateToInputValue(quarterStart),
      endDate: dateToInputValue(quarterEnd),
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
    };
  }

  return {
    startDate: `${selectedYear}-01-01`,
    endDate: `${selectedYear}-12-31`,
  };
}

function profitBadgeClass(value: number) {
  if (value > 0) {
    return "inline-flex items-center rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-200";
  }

  if (value < 0) {
    return "inline-flex items-center rounded-full border border-red-800 bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-200";
  }

  return "inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs font-medium text-zinc-200";
}

export default async function CogsReportPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = (await searchParams) || {};

  const search = resolvedSearchParams.q?.trim() || "";
  const selectedPlatform = resolvedSearchParams.platform || "all";
  const selectedProfitability = resolvedSearchParams.profitability || "all";
  const selectedYear = clampYear(resolvedSearchParams.year);
  const selectedPeriod = normalizePeriod(resolvedSearchParams.period);
  const selectedMonth = clampMonth(resolvedSearchParams.month);
  const selectedQuarter = clampQuarter(resolvedSearchParams.quarter);

  const selectedDate =
    selectedPeriod === "day" || selectedPeriod === "week"
      ? resolvedSearchParams.date || ""
      : "";

  const selectedStart =
    selectedPeriod === "custom"
      ? resolvedSearchParams.start ||
        resolvedSearchParams.startDate ||
        resolvedSearchParams.dateFrom ||
        ""
      : selectedDate;

  const selectedEnd =
    selectedPeriod === "custom"
      ? resolvedSearchParams.end ||
        resolvedSearchParams.endDate ||
        resolvedSearchParams.dateTo ||
        ""
      : "";

  const { startDate, endDate } = getReportDateRange({
    selectedYear,
    period: selectedPeriod,
    start: selectedStart,
    end: selectedEnd,
    month: selectedMonth,
    quarter: selectedQuarter,
  });

  const exportParams = buildCogsExportParams({
    search,
    selectedPlatform,
    selectedProfitability,
    selectedPeriod,
    selectedYear,
    selectedMonth,
    selectedQuarter,
    selectedDate: selectedDate || startDate,
    startDate,
    endDate,
  });

  const csvHref = buildCogsCsvHref({
    ...exportParams,
    q: search,
    platform: selectedPlatform,
    profitability: selectedProfitability,
  });

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="app-page space-y-3">
        <section className="app-section border-red-900 bg-red-950/30">
          <h1 className="text-lg font-semibold text-red-100">
            COGS report could not load
          </h1>
          <p className="mt-1 text-sm text-red-200">
            You must be signed in to view realized cost of goods sold reporting.
          </p>
        </section>
      </main>
    );
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
      created_at
    `,
    )
    .eq("user_id", user.id)
    .is("reversed_at", null)
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (startDate) {
    salesQuery = salesQuery.gte("sale_date", startDate);
  }

  if (endDate) {
    salesQuery = salesQuery.lte("sale_date", endDate);
  }

  if (selectedPlatform !== "all") {
    salesQuery = salesQuery.eq("platform", selectedPlatform);
  }

  const [salesResponse, platformResponse] = await Promise.all([
    salesQuery,
    supabase
      .from("sales")
      .select("platform")
      .eq("user_id", user.id)
      .is("reversed_at", null),
  ]);

  const { data: salesRaw, error: salesError } = salesResponse;
  const sales = (salesRaw || []) as SaleRow[];

  const inventoryIds = Array.from(
    new Set(
      sales
        .map((sale) => sale.inventory_item_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const inventoryResponse =
    inventoryIds.length > 0
      ? await supabase
          .from("inventory_items")
          .select(
            `
            id,
            title,
            player_name,
            year,
            set_name,
            card_number,
            status,
            notes
          `,
          )
          .eq("user_id", user.id)
          .in("id", inventoryIds)
      : { data: [], error: null };

  const inventoryItems = (inventoryResponse.data || []) as InventoryItemRow[];
  const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));

  const allRows = buildCogsRows(sales, inventoryById);

  const cogsRows = allRows.filter((row) => {
    if (!matchesSearch(row, search)) return false;
    if (!matchesDateRange(row, startDate, endDate)) return false;
    if (!matchesProfitability(row, selectedProfitability)) return false;

    return true;
  });

  const totalSales = cogsRows.length;
  const totalGrossSales = roundMoney(
    cogsRows.reduce((sum, row) => sum + row.grossSale, 0),
  );
  const totalSellingCosts = roundMoney(
    cogsRows.reduce((sum, row) => sum + row.sellingCosts, 0),
  );
  const totalNetProceeds = roundMoney(
    cogsRows.reduce((sum, row) => sum + row.netProceeds, 0),
  );
  const totalRealizedCogs = roundMoney(
    cogsRows.reduce((sum, row) => sum + row.realizedCogs, 0),
  );
  const totalProfit = roundMoney(
    cogsRows.reduce((sum, row) => sum + row.profit, 0),
  );
  const averageCogsPerSale =
    totalSales > 0 ? totalRealizedCogs / totalSales : 0;
  const profitableSales = cogsRows.filter((row) => row.profit > 0).length;
  const lossSales = cogsRows.filter((row) => row.profit < 0).length;
  const missingCogs = cogsRows.filter((row) => row.realizedCogs <= 0).length;

  const allPlatforms = Array.from(
    new Set(
      (platformResponse.data || [])
        .map((row) =>
          platformName((row as { platform?: string | null }).platform),
        )
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <main className="app-page space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Reports
          </p>
          <h1 className="app-title">Realized COGS Report</h1>
          <p className="app-subtitle">
            Realized cost of goods sold from completed, non-reversed sales.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/reports" className="app-button">
            Back to Reports
          </Link>

          <ReportExportButtons
            csvHref={csvHref}
            pdfHref={buildReportPdfHref("cogs", exportParams)}
            printHref={buildReportPrintHref("cogs", exportParams)}
          />
        </div>
      </div>

      {salesError ? (
        <section className="app-section border-red-900 bg-red-950/30">
          <h2 className="text-lg font-semibold text-red-100">
            COGS report could not load
          </h2>
          <p className="mt-1 text-sm text-red-200">
            Supabase returned an error while loading sales: {salesError.message}
          </p>
        </section>
      ) : null}

      {inventoryResponse.error ? (
        <section className="app-section border-amber-900 bg-amber-950/30">
          <h2 className="text-lg font-semibold text-amber-100">
            Inventory item details could not load
          </h2>
          <p className="mt-1 text-sm text-amber-200">
            Sales still loaded, but linked item details were unavailable:{" "}
            {inventoryResponse.error.message}
          </p>
        </section>
      ) : null}

      <form action="/app/reports/cogs" method="get" className="space-y-2">
        <ReportDateFilters
          period={periodToSharedFilterValue(selectedPeriod)}
          date={
            selectedPeriod === "day" || selectedPeriod === "week"
              ? selectedDate || startDate
              : ""
          }
          year={String(selectedYear)}
          month={String(selectedMonth)}
          quarter={String(selectedQuarter)}
          startDate={selectedPeriod === "custom" ? startDate : ""}
          endDate={selectedPeriod === "custom" ? endDate : ""}
          resetHref="/app/reports/cogs"
        >
          <>
            <label className="block xl:col-span-2">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Search
              </span>

              <input
                name="q"
                type="search"
                defaultValue={search}
                placeholder="Item, player, set, platform, notes..."
                className="app-input h-9 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Platform
              </span>

              <select
                name="platform"
                defaultValue={selectedPlatform}
                className="app-select h-9 text-sm"
              >
                <option value="all">All platforms</option>

                {allPlatforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Profitability
              </span>

              <select
                name="profitability"
                defaultValue={selectedProfitability}
                className="app-select h-9 text-sm"
              >
                <option value="all">All sales</option>
                <option value="profit">Profitable only</option>
                <option value="loss">Losses only</option>
                <option value="break-even">Break-even only</option>
                <option value="missing-cogs">Missing COGS only</option>
              </select>
            </label>
          </>
        </ReportDateFilters>
      </form>

      <ReportSummaryCards
        cards={[
          {
            label: "Sales In View",
            value: totalSales.toLocaleString(),
            note: "Completed sales included",
          },
          {
            label: "Gross Sales",
            value: formatCurrency(totalGrossSales),
            note: "Before fees and costs",
          },
          {
            label: "Realized COGS",
            value: formatCurrency(totalRealizedCogs),
            note: "Cost basis recognized on sold items",
          },
          {
            label: "Net Proceeds",
            value: formatCurrency(totalNetProceeds),
            note: "Gross less selling costs",
          },
          {
            label: "Selling Costs",
            value: formatCurrency(totalSellingCosts),
            note: "Platform, shipping, and other sale costs",
          },
          {
            label: "Profit / Loss",
            value: formatCurrency(totalProfit),
            note: "Net proceeds less realized COGS",
          },
          {
            label: "Avg COGS / Sale",
            value: formatCurrency(averageCogsPerSale),
            note: "Filtered average cost basis",
          },
          {
            label: "Profits / Losses",
            value: `${profitableSales.toLocaleString()} / ${lossSales.toLocaleString()}`,
            note: `${missingCogs.toLocaleString()} missing COGS`,
          },
        ]}
      />

      <section className="app-section space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              COGS Detail
            </h2>
            <p className="text-sm text-zinc-400">
              Report-only table showing sold items, realized cost basis, net
              proceeds, and profit or loss.
            </p>
          </div>

          <Link
            href={buildSalesHref(search, selectedPlatform)}
            className="app-button"
          >
            Open Sales Report
          </Link>
        </div>

        <ReportTable
          rows={cogsRows}
          emptyMessage="No completed sales matched those COGS report filters."
          columns={[
            {
              key: "item",
              label: "Sold Item",
              render: (row) => (
                <div className="min-w-[240px]">
                  <div className="font-medium text-zinc-100">
                    {row.itemName}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {row.inventoryItem
                      ? [
                          row.inventoryItem.year,
                          row.inventoryItem.set_name,
                          row.inventoryItem.item_number ||
                            row.inventoryItem.card_number,
                        ]
                          .filter(Boolean)
                          .join(" • ") || "Linked inventory item"
                      : "No inventory item linked"}
                  </div>
                </div>
              ),
            },
            {
              key: "date",
              label: "Sale Date",
              render: (row) => formatDate(row.saleDate),
            },
            {
              key: "platform",
              label: "Platform",
              render: (row) => row.platform,
            },
            {
              key: "gross",
              label: "Gross Sale",
              align: "right",
              render: (row) => formatCurrency(row.grossSale),
            },
            {
              key: "sellingCosts",
              label: "Selling Costs",
              align: "right",
              render: (row) => formatCurrency(row.sellingCosts),
            },
            {
              key: "net",
              label: "Net Proceeds",
              align: "right",
              render: (row) => formatCurrency(row.netProceeds),
            },
            {
              key: "cogs",
              label: "Realized COGS",
              align: "right",
              render: (row) => formatCurrency(row.realizedCogs),
            },
            {
              key: "profit",
              label: "Profit / Loss",
              align: "right",
              render: (row) => (
                <span className={profitBadgeClass(row.profit)}>
                  {formatCurrency(row.profit)}
                </span>
              ),
            },
            {
              key: "margin",
              label: "Margin",
              align: "right",
              render: (row) => formatPercent(row.marginPercent),
            },
            {
              key: "notes",
              label: "Notes",
              className: "max-w-[260px]",
              render: (row) => (
                <div className="line-clamp-2 text-zinc-300">
                  {row.notes || "—"}
                </div>
              ),
            },
          ]}
        />
      </section>
    </main>
  );
}
