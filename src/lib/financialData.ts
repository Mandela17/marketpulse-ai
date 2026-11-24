// Financial statement fetcher and analyzer using Yahoo Finance fundamentals-timeseries API
// Works without cookies/crumb across NSE and BSE tickers (including demerged & bank stocks)

import { toYahooTicker } from './symbolMap';
import { cachedFetch, techCache } from './cache';

export interface FinancialPeriod {
  label: string;          // e.g. "Sep '26" or "2026"
  endDate: string;        // YYYY-MM-DD
  revenue: number;        // in INR (raw)
  profit: number;         // Net income in INR (raw)
  operatingIncome: number | null;
  ebitda: number | null;
  eps: number | null;
  revenueYoY: number | null;
  profitYoY: number | null;
  revenueQoQ: number | null;
  profitQoQ: number | null;
  netMarginPct: number | null;
  operatingMarginPct: number | null;
}

export interface BalanceSheetSnapshot {
  asOfDate: string;
  operatingCashFlow: number | null;
  freeCashFlow: number | null;
  totalDebt: number | null;
  stockholdersEquity: number | null;
  debtToEquity: number | null;
}

export interface FinancialSummary {
  symbol: string;
  yahooTicker: string;
  currency: string;
  quarterly: FinancialPeriod[];
  annual: FinancialPeriod[];
  revenueGrowth: {
    ttm1Y: number | null;
    ttm1YLabel: string;
    cagr3Y: number | null;
    cagrYears: number;
  };
  profitGrowth: {
    ttm1Y: number | null;
    ttm1YLabel: string;
    cagr3Y: number | null;
    cagrYears: number;
  };
  latestAnnualHealth: BalanceSheetSnapshot | null;
  lastUpdated: string;
}

const FINANCIAL_TTL = 6 * 60 * 60 * 1000; // 6 hours (fundamentals update quarterly)

const TIMESERIES_TYPES = [
  'quarterlyTotalRevenue',
  'quarterlyOperatingRevenue',
  'quarterlyNetIncome',
  'quarterlyNetIncomeCommonStockholders',
  'quarterlyOperatingIncome',
  'quarterlyEBITDA',
  'quarterlyDilutedEPS',
  'quarterlyBasicEPS',
  'annualTotalRevenue',
  'annualOperatingRevenue',
  'annualNetIncome',
  'annualNetIncomeCommonStockholders',
  'annualOperatingIncome',
  'annualEBITDA',
  'annualDilutedEPS',
  'annualBasicEPS',
  'annualOperatingCashFlow',
  'annualFreeCashFlow',
  'annualTotalDebt',
  'annualStockholdersEquity',
  'trailingTotalRevenue',
  'trailingNetIncome',
].join(',');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDateParts(dateStr: string): { year: number; month: number; day: number; ms: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return {
    year: y || 1970,
    month: m || 1,
    day: d || 1,
    ms: Date.UTC(y || 1970, (m || 1) - 1, d || 1),
  };
}

function formatQuarterLabel(dateStr: string): string {
  const { year, month } = parseDateParts(dateStr);
  const monthName = MONTHS[Math.max(0, Math.min(11, month - 1))];
  return `${monthName} '${String(year).slice(-2)}`;
}

function formatYearLabel(dateStr: string): string {
  const { year } = parseDateParts(dateStr);
  return String(year);
}

function computePctChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return parseFloat((((current - previous) / Math.abs(previous)) * 100).toFixed(2));
}

function computeCAGR(latest: number, oldest: number, years: number): number | null {
  if (years <= 0 || oldest <= 0 || latest <= 0) return null;
  return parseFloat(((Math.pow(latest / oldest, 1 / years) - 1) * 100).toFixed(1));
}

interface RawPoint {
  asOfDate: string;
  val: number;
}

function extractSeries(resultList: any[], primaryType: string, fallbackType?: string): Map<string, number> {
  const map = new Map<string, number>();

  const readType = (typeName: string, overwrite: boolean) => {
    const entry = resultList.find((r) => r?.meta?.type?.[0] === typeName);
    const items = entry?.[typeName];
    if (!Array.isArray(items)) return;

    for (const item of items) {
      const dateStr = item?.asOfDate;
      const raw = item?.reportedValue?.raw;
      if (typeof dateStr === 'string' && typeof raw === 'number' && Number.isFinite(raw)) {
        if (overwrite || !map.has(dateStr)) {
          map.set(dateStr, raw);
        }
      }
    }
  };

  if (fallbackType) readType(fallbackType, true);
  readType(primaryType, true);
  return map;
}

function extractCurrency(resultList: any[]): string {
  for (const r of resultList) {
    const typeName = r?.meta?.type?.[0];
    const items = typeName ? r?.[typeName] : null;
    if (Array.isArray(items) && items.length > 0 && items[0]?.currencyCode) {
      return items[0].currencyCode;
    }
  }
  return 'INR';
}

function findYearAgoDate(targetDate: string, candidateDates: string[]): string | null {
  const targetMs = parseDateParts(targetDate).ms;
  let bestDate: string | null = null;
  let bestDiff = Infinity;

  for (const d of candidateDates) {
    if (d >= targetDate) continue;
    const diffDays = (targetMs - parseDateParts(d).ms) / 86400000;
    // Same quarter 1 year ago is ~365 days prior (allow 320-410 days window for leap years / 52-week dates)
    if (diffDays >= 320 && diffDays <= 410) {
      const distFrom365 = Math.abs(diffDays - 365);
      if (distFrom365 < bestDiff) {
        bestDiff = distFrom365;
        bestDate = d;
      }
    }
  }
  return bestDate;
}

async function fetchTimeseriesRaw(yahooTicker: string): Promise<any[] | null> {
  // Don't double-encode %26 in M%26M.NS
  const safeTicker = yahooTicker.includes('%') ? yahooTicker : encodeURIComponent(yahooTicker);
  const period1 = Math.floor(Date.now() / 1000) - 6 * 365 * 86400; // 6 years back
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${safeTicker}?type=${TIMESERIES_TYPES}&period1=${period1}&period2=${period2}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const list = json?.timeseries?.result;
    return Array.isArray(list) && list.length > 0 ? list : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchFinancialPerformance(
  symbol: string,
  forceRefresh = false
): Promise<FinancialSummary | null> {
  const upperSymbol = symbol.toUpperCase().trim();
  const cacheKey = `financials:${upperSymbol}`;

  if (forceRefresh) {
    techCache.delete(cacheKey);
  }

  return cachedFetch<FinancialSummary | null>(techCache, cacheKey, FINANCIAL_TTL, async () => {
    let yahooTicker = toYahooTicker(upperSymbol);
    let resultList = await fetchTimeseriesRaw(yahooTicker);

    // Fallback to .BO if .NS has no financial timeseries
    const hasCoreData = (list: any[] | null) => {
      if (!list) return false;
      const rev = extractSeries(list, 'annualTotalRevenue', 'annualOperatingRevenue');
      const qRev = extractSeries(list, 'quarterlyTotalRevenue', 'quarterlyOperatingRevenue');
      return rev.size > 0 || qRev.size > 0;
    };

    if (!hasCoreData(resultList) && yahooTicker.endsWith('.NS')) {
      const bseTicker = yahooTicker.replace(/\.NS$/i, '.BO');
      const bseList = await fetchTimeseriesRaw(bseTicker);
      if (hasCoreData(bseList)) {
        yahooTicker = bseTicker;
        resultList = bseList;
      }
    }

    if (!resultList || !hasCoreData(resultList)) {
      return null;
    }

    const currency = extractCurrency(resultList);

    // ─── 1. Quarterly Series ───
    const qRevMap = extractSeries(resultList, 'quarterlyTotalRevenue', 'quarterlyOperatingRevenue');
    const qProfitMap = extractSeries(resultList, 'quarterlyNetIncome', 'quarterlyNetIncomeCommonStockholders');
    const qOpIncMap = extractSeries(resultList, 'quarterlyOperatingIncome');
    const qEbitdaMap = extractSeries(resultList, 'quarterlyEBITDA');
    const qEpsMap = extractSeries(resultList, 'quarterlyDilutedEPS', 'quarterlyBasicEPS');

    const qAllDates = Array.from(new Set([...qRevMap.keys(), ...qProfitMap.keys()])).sort();
    const quarterlyAll: FinancialPeriod[] = qAllDates.map((dateStr, idx) => {
      const revenue = qRevMap.get(dateStr) ?? 0;
      const profit = qProfitMap.get(dateStr) ?? 0;
      const operatingIncome = qOpIncMap.get(dateStr) ?? null;
      const ebitda = qEbitdaMap.get(dateStr) ?? null;
      const eps = qEpsMap.get(dateStr) ?? null;

      // Exact year-ago quarter (~365d back)
      const yearAgoDate = findYearAgoDate(dateStr, qAllDates);
      const prevQuarterDate = idx > 0 ? qAllDates[idx - 1] : null;

      return {
        label: formatQuarterLabel(dateStr),
        endDate: dateStr,
        revenue,
        profit,
        operatingIncome,
        ebitda,
        eps,
        revenueYoY: yearAgoDate && qRevMap.has(yearAgoDate) ? computePctChange(revenue, qRevMap.get(yearAgoDate)) : null,
        profitYoY: yearAgoDate && qProfitMap.has(yearAgoDate) ? computePctChange(profit, qProfitMap.get(yearAgoDate)) : null,
        revenueQoQ: prevQuarterDate && qRevMap.has(prevQuarterDate) ? computePctChange(revenue, qRevMap.get(prevQuarterDate)) : null,
        profitQoQ: prevQuarterDate && qProfitMap.has(prevQuarterDate) ? computePctChange(profit, qProfitMap.get(prevQuarterDate)) : null,
        netMarginPct: revenue > 0 ? parseFloat(((profit / revenue) * 100).toFixed(2)) : null,
        operatingMarginPct: revenue > 0 && operatingIncome !== null
          ? parseFloat(((operatingIncome / revenue) * 100).toFixed(2))
          : null,
      };
    });

    // ─── 2. Annual Series ───
    const aRevMap = extractSeries(resultList, 'annualTotalRevenue', 'annualOperatingRevenue');
    const aProfitMap = extractSeries(resultList, 'annualNetIncome', 'annualNetIncomeCommonStockholders');
    const aOpIncMap = extractSeries(resultList, 'annualOperatingIncome');
    const aEbitdaMap = extractSeries(resultList, 'annualEBITDA');
    const aEpsMap = extractSeries(resultList, 'annualDilutedEPS', 'annualBasicEPS');

    const aAllDates = Array.from(new Set([...aRevMap.keys(), ...aProfitMap.keys()])).sort();
    const annualAll: FinancialPeriod[] = aAllDates.map((dateStr, idx) => {
      const revenue = aRevMap.get(dateStr) ?? 0;
      const profit = aProfitMap.get(dateStr) ?? 0;
      const operatingIncome = aOpIncMap.get(dateStr) ?? null;
      const ebitda = aEbitdaMap.get(dateStr) ?? null;
      const eps = aEpsMap.get(dateStr) ?? null;

      const yearAgoDate = findYearAgoDate(dateStr, aAllDates);
      const prevYearDate = yearAgoDate ?? (idx > 0 ? aAllDates[idx - 1] : null);

      return {
        label: formatYearLabel(dateStr),
        endDate: dateStr,
        revenue,
        profit,
        operatingIncome,
        ebitda,
        eps,
        revenueYoY: prevYearDate && aRevMap.has(prevYearDate) ? computePctChange(revenue, aRevMap.get(prevYearDate)) : null,
        profitYoY: prevYearDate && aProfitMap.has(prevYearDate) ? computePctChange(profit, aProfitMap.get(prevYearDate)) : null,
        revenueQoQ: null,
        profitQoQ: null,
        netMarginPct: revenue > 0 ? parseFloat(((profit / revenue) * 100).toFixed(2)) : null,
        operatingMarginPct: revenue > 0 && operatingIncome !== null
          ? parseFloat(((operatingIncome / revenue) * 100).toFixed(2))
          : null,
      };
    });

    // ─── 3. Growth Metrics (1Y & Multi-Year CAGR) ───
    const tRevMap = extractSeries(resultList, 'trailingTotalRevenue');
    const tProfitMap = extractSeries(resultList, 'trailingNetIncome');
    const tDates = Array.from(tRevMap.keys()).sort();

    // Helper: compute 1Y growth with honest label
    const compute1YGrowth = (
      qField: 'revenue' | 'profit',
      aField: 'revenue' | 'profit',
      trailingMap: Map<string, number>
    ): { val: number | null; label: string } => {
      // Option A: 8 quarters of data -> exact TTM vs prior TTM
      if (quarterlyAll.length >= 8) {
        const curTTM = quarterlyAll.slice(-4).reduce((s, p) => s + p[qField], 0);
        const prevTTM = quarterlyAll.slice(-8, -4).reduce((s, p) => s + p[qField], 0);
        const pct = computePctChange(curTTM, prevTTM);
        if (pct !== null) return { val: parseFloat(pct.toFixed(1)), label: '1Y (TTM)' };
      }

      // Option B: Two trailing points ~1 year apart
      if (tDates.length >= 2) {
        const latestTrailingDate = tDates[tDates.length - 1];
        const yearAgoTrailing = findYearAgoDate(latestTrailingDate, tDates);
        if (yearAgoTrailing && trailingMap.has(yearAgoTrailing) && trailingMap.has(latestTrailingDate)) {
          const pct = computePctChange(trailingMap.get(latestTrailingDate)!, trailingMap.get(yearAgoTrailing));
          if (pct !== null) return { val: parseFloat(pct.toFixed(1)), label: '1Y (TTM)' };
        }
      }

      // Option C: Latest TTM vs prior FY annual if they end in adjacent fiscal periods,
      // OR exact latest full Fiscal Year YoY (annual[-1] vs annual[-2])
      if (annualAll.length >= 2) {
        const latestA = annualAll[annualAll.length - 1];
        const prevA = annualAll[annualAll.length - 2];
        const pct = computePctChange(latestA[aField], prevA[aField]);
        if (pct !== null) return { val: parseFloat(pct.toFixed(1)), label: '1Y (FY YoY)' };
      }

      return { val: null, label: '1Y (TTM)' };
    };

    const rev1Y = compute1YGrowth('revenue', 'revenue', tRevMap);
    const prof1Y = compute1YGrowth('profit', 'profit', tProfitMap);

    // 3Y CAGR (uses up to 3 years span from annual statements)
    let revCagr: number | null = null;
    let profCagr: number | null = null;
    let cagrYears = 3;

    if (annualAll.length >= 2) {
      const latestA = annualAll[annualAll.length - 1];
      const latestYear = parseDateParts(latestA.endDate).year;
      // Prefer exactly 3 years prior; fallback to oldest available
      const baseCandidate =
        annualAll.find((a) => parseDateParts(a.endDate).year === latestYear - 3) ?? annualAll[0];
      const yearsDiff = latestYear - parseDateParts(baseCandidate.endDate).year;

      if (yearsDiff >= 1) {
        cagrYears = yearsDiff;
        revCagr = computeCAGR(latestA.revenue, baseCandidate.revenue, yearsDiff);
        profCagr = computeCAGR(latestA.profit, baseCandidate.profit, yearsDiff);
      }
    }

    // ─── 4. Balance Sheet & Cash Flow Snapshot (Latest Annual) ───
    const aOcfMap = extractSeries(resultList, 'annualOperatingCashFlow');
    const aFcfMap = extractSeries(resultList, 'annualFreeCashFlow');
    const aDebtMap = extractSeries(resultList, 'annualTotalDebt');
    const aEquityMap = extractSeries(resultList, 'annualStockholdersEquity');

    let latestAnnualHealth: BalanceSheetSnapshot | null = null;
    if (aAllDates.length > 0) {
      const latestDate = aAllDates[aAllDates.length - 1];
      const ocf = aOcfMap.get(latestDate) ?? null;
      const fcf = aFcfMap.get(latestDate) ?? null;
      const debt = aDebtMap.get(latestDate) ?? null;
      const equity = aEquityMap.get(latestDate) ?? null;
      const dte = debt !== null && equity !== null && equity > 0
        ? parseFloat((debt / equity).toFixed(2))
        : null;

      if (ocf !== null || fcf !== null || debt !== null || equity !== null) {
        latestAnnualHealth = {
          asOfDate: latestDate,
          operatingCashFlow: ocf,
          freeCashFlow: fcf,
          totalDebt: debt,
          stockholdersEquity: equity,
          debtToEquity: dte,
        };
      }
    }

    return {
      symbol: upperSymbol,
      yahooTicker,
      currency,
      quarterly: quarterlyAll.slice(-5),
      annual: annualAll.slice(-5),
      revenueGrowth: {
        ttm1Y: rev1Y.val,
        ttm1YLabel: rev1Y.label,
        cagr3Y: revCagr,
        cagrYears,
      },
      profitGrowth: {
        ttm1Y: prof1Y.val,
        ttm1YLabel: prof1Y.label,
        cagr3Y: profCagr,
        cagrYears,
      },
      latestAnnualHealth,
      lastUpdated: new Date().toISOString(),
    };
  });
}

