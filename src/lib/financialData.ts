// Financial statement fetcher and analyzer
// Primary source: Upstox Company Fundamentals API v2 (/v2/fundamentals/{isin}/...)
// Fallback source: Yahoo Finance fundamentals-timeseries API (when Upstox token/ISIN unavailable)

import { toYahooTicker } from './symbolMap';
import { getInstrumentKey } from './upstoxInstruments';
import { resolveReadUpstoxToken, invalidateUpstoxTokens } from './upstoxTokenStore';
import { cachedFetch, techCache } from './cache';

export type StatementType = 'consolidated' | 'standalone';

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

export interface KeyRatioItem {
  name: string;
  companyValue: string;
  sectorValue: string;
}

export interface FullStatementTable {
  periods: string[];
  rows: {
    particular: string;
    values: Record<string, number>; // INR or EPS per period label
    isEps?: boolean;
  }[];
}

export interface BalanceSheetSnapshot {
  asOfDate: string;
  operatingCashFlow: number | null;
  investingCashFlow?: number | null;
  freeCashFlow: number | null;
  totalAssets?: number | null;
  totalLiabilities?: number | null;
  totalDebt: number | null;
  stockholdersEquity: number | null;
  debtToEquity: number | null;
}

export interface FinancialSummary {
  symbol: string;
  source: 'upstox' | 'yahoo';
  sourceTicker: string;   // ISIN for Upstox, Yahoo ticker for Yahoo
  statementType: StatementType;
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
  keyRatios: KeyRatioItem[];
  annualFullStatement: FullStatementTable | null;
  latestAnnualHealth: BalanceSheetSnapshot | null;
  lastUpdated: string;
}

const FINANCIAL_TTL = 6 * 60 * 60 * 1000; // 6 hours (fundamentals update quarterly)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseDateParts(dateStr: string): { year: number; month: number; day: number; ms: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return {
    year: y || 1970,
    month: m || 1,
    day: d || 1,
    ms: Date.UTC(y || 1970, (m || 1) - 1, d || 1),
  };
}

/** Convert Upstox period string like "Sep 2026" or "Mar 2025" to ISO date YYYY-MM-DD. */
function upstoxPeriodToIso(period: string): string {
  const parts = period.trim().split(/\s+/);
  if (parts.length >= 2) {
    const mNum = MONTH_INDEX[parts[0].slice(0, 3).toLowerCase()] || 3;
    const yr = parseInt(parts[1], 10);
    if (!Number.isNaN(yr)) {
      const lastDay = new Date(Date.UTC(yr, mNum, 0)).getUTCDate();
      return `${yr}-${String(mNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
  }
  return period;
}

function formatQuarterLabel(dateStr: string): string {
  const { year, month } = parseDateParts(dateStr);
  const monthName = MONTHS[Math.max(0, Math.min(11, month - 1))];
  return `${monthName} '${String(year).slice(-2)}`;
}

function formatYearLabel(dateStr: string): string {
  return String(parseDateParts(dateStr).year);
}

function parseChangeString(change?: string | null): number | null {
  if (!change) return null;
  const cleaned = change.replace(/[%+,\s]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? parseFloat(num.toFixed(2)) : null;
}

function computePctChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return parseFloat((((current - previous) / Math.abs(previous)) * 100).toFixed(2));
}

function computeCAGR(latest: number, oldest: number, years: number): number | null {
  if (years <= 0 || oldest <= 0 || latest <= 0) return null;
  return parseFloat(((Math.pow(latest / oldest, 1 / years) - 1) * 100).toFixed(1));
}

function findYearAgoDate(targetDate: string, candidateDates: string[]): string | null {
  const targetMs = parseDateParts(targetDate).ms;
  let bestDate: string | null = null;
  let bestDiff = Infinity;

  for (const d of candidateDates) {
    if (d >= targetDate) continue;
    const diffDays = (targetMs - parseDateParts(d).ms) / 86400000;
    if (diffDays >= 320 && diffDays <= 410) {
      const dist = Math.abs(diffDays - 365);
      if (dist < bestDiff) {
        bestDiff = dist;
        bestDate = d;
      }
    }
  }
  return bestDate;
}

function computeGrowthSummary(
  quarterlyAll: FinancialPeriod[],
  annualAll: FinancialPeriod[],
  trailingDates: string[] = [],
  trailingRevMap?: Map<string, number>,
  trailingProfMap?: Map<string, number>
): {
  revenueGrowth: FinancialSummary['revenueGrowth'];
  profitGrowth: FinancialSummary['profitGrowth'];
} {
  const compute1Y = (
    field: 'revenue' | 'profit',
    tMap?: Map<string, number>
  ): { val: number | null; label: string } => {
    if (quarterlyAll.length >= 8) {
      const curTTM = quarterlyAll.slice(-4).reduce((s, p) => s + p[field], 0);
      const prevTTM = quarterlyAll.slice(-8, -4).reduce((s, p) => s + p[field], 0);
      const pct = computePctChange(curTTM, prevTTM);
      if (pct !== null) return { val: parseFloat(pct.toFixed(1)), label: '1Y (TTM)' };
    }

    if (tMap && trailingDates.length >= 2) {
      const latestT = trailingDates[trailingDates.length - 1];
      const prevT = findYearAgoDate(latestT, trailingDates);
      if (prevT && tMap.has(latestT) && tMap.has(prevT)) {
        const pct = computePctChange(tMap.get(latestT)!, tMap.get(prevT));
        if (pct !== null) return { val: parseFloat(pct.toFixed(1)), label: '1Y (TTM)' };
      }
    }

    if (annualAll.length >= 2) {
      const latestA = annualAll[annualAll.length - 1];
      const prevA = annualAll[annualAll.length - 2];
      const pct = computePctChange(latestA[field], prevA[field]);
      if (pct !== null) return { val: parseFloat(pct.toFixed(1)), label: '1Y (FY YoY)' };
    }

    return { val: null, label: '1Y (TTM)' };
  };

  const rev1Y = compute1Y('revenue', trailingRevMap);
  const prof1Y = compute1Y('profit', trailingProfMap);

  let revCagr: number | null = null;
  let profCagr: number | null = null;
  let cagrYears = 3;

  if (annualAll.length >= 2) {
    const latestA = annualAll[annualAll.length - 1];
    const latestYear = parseDateParts(latestA.endDate).year;
    const baseCandidate =
      annualAll.find((a) => parseDateParts(a.endDate).year === latestYear - 3) ?? annualAll[0];
    const yearsDiff = latestYear - parseDateParts(baseCandidate.endDate).year;

    if (yearsDiff >= 1) {
      cagrYears = yearsDiff;
      revCagr = computeCAGR(latestA.revenue, baseCandidate.revenue, yearsDiff);
      profCagr = computeCAGR(latestA.profit, baseCandidate.profit, yearsDiff);
    }
  }

  return {
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
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIMARY SOURCE: Upstox Company Fundamentals API v2
// ─────────────────────────────────────────────────────────────────────────────

function getUnitMultiplier(unitsIn?: string): number {
  const u = (unitsIn || 'crore').toLowerCase();
  if (u === 'crore' || u === 'crores') return 1e7;
  if (u === 'lakh' || u === 'lakhs') return 1e5;
  return 1;
}

async function upstoxFundamentalsGet(path: string, token: string): Promise<{ status: number; json: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://api.upstox.com/v2/fundamentals/${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    const json = res.ok ? await res.json().catch(() => null) : null;
    return { status: res.status, json };
  } catch {
    return { status: 0, json: null };
  } finally {
    clearTimeout(timeout);
  }
}

function parseUpstoxIncomePeriods(
  payload: any,
  isQuarterly: boolean
): { periods: FinancialPeriod[]; fullStatement: FullStatementTable | null } {
  const categories = payload?.data?.income_statement;
  if (!Array.isArray(categories) || categories.length === 0) {
    return { periods: [], fullStatement: null };
  }

  const mult = getUnitMultiplier(payload?.data?.units_in);
  const revCat = categories.find((c: any) => c.category === 'revenue');
  const opCat = categories.find((c: any) => c.category === 'operating_profit');
  const netCat = categories.find((c: any) => c.category === 'net_profit');

  type HistEntry = { value: number; period: string; change?: string };
  const mapByIso = new Map<
    string,
    {
      periodRaw: string;
      revenue: number;
      operatingProfit: number | null;
      netProfit: number;
      revChange: number | null;
      profChange: number | null;
    }
  >();

  const ensureEntry = (iso: string, periodRaw: string) => {
    if (!mapByIso.has(iso)) {
      mapByIso.set(iso, {
        periodRaw,
        revenue: 0,
        operatingProfit: null,
        netProfit: 0,
        revChange: null,
        profChange: null,
      });
    }
    return mapByIso.get(iso)!;
  };

  for (const item of (revCat?.history || []) as HistEntry[]) {
    const iso = upstoxPeriodToIso(item.period);
    const rec = ensureEntry(iso, item.period);
    rec.revenue = Number(item.value || 0) * mult;
    rec.revChange = parseChangeString(item.change);
  }

  for (const item of (opCat?.history || []) as HistEntry[]) {
    const iso = upstoxPeriodToIso(item.period);
    const rec = ensureEntry(iso, item.period);
    rec.operatingProfit = Number(item.value || 0) * mult;
  }

  for (const item of (netCat?.history || []) as HistEntry[]) {
    const iso = upstoxPeriodToIso(item.period);
    const rec = ensureEntry(iso, item.period);
    rec.netProfit = Number(item.value || 0) * mult;
    rec.profChange = parseChangeString(item.change);
  }

  // Extract EPS from annual full_statement if available
  const fullRaw = payload?.data?.full_statement;
  const epsByIso = new Map<string, number>();
  let fullStatement: FullStatementTable | null = null;

  if (Array.isArray(fullRaw) && fullRaw.length > 0) {
    const periodSet = new Set<string>();
    const rows: FullStatementTable['rows'] = [];

    for (const fsRow of fullRaw) {
      const particular: string = fsRow?.particular || '';
      if (!particular || !Array.isArray(fsRow.history)) continue;
      const isEps = /\beps\b/i.test(particular);
      const values: Record<string, number> = {};

      for (const h of fsRow.history) {
        const iso = upstoxPeriodToIso(h.period);
        const label = isQuarterly ? formatQuarterLabel(iso) : formatYearLabel(iso);
        periodSet.add(`${iso}|${label}`);
        const rawVal = Number(h.value || 0);
        values[label] = isEps ? rawVal : rawVal * mult;
        if (isEps && /basic/i.test(particular)) {
          epsByIso.set(iso, rawVal);
        }
      }

      rows.push({ particular, values, isEps });
    }

    const sortedPeriodLabels = Array.from(periodSet)
      .sort((a, b) => a.localeCompare(b))
      .map((pair) => pair.split('|')[1]);

    if (rows.length > 0 && sortedPeriodLabels.length > 0) {
      fullStatement = { periods: sortedPeriodLabels, rows };
    }
  }

  // Sort chronologically (oldest -> newest)
  const sortedIsos = Array.from(mapByIso.keys()).sort();

  const periods: FinancialPeriod[] = sortedIsos.map((iso, idx) => {
    const rec = mapByIso.get(iso)!;
    const prevIso = idx > 0 ? sortedIsos[idx - 1] : null;
    const prevRec = prevIso ? mapByIso.get(prevIso) : null;
    const eps = epsByIso.get(iso) ?? null;

    // Note: Upstox returns QoQ % for quarterly series and YoY % for yearly series
    const revenueYoY = !isQuarterly
      ? rec.revChange ?? (prevRec ? computePctChange(rec.revenue, prevRec.revenue) : null)
      : null;
    const profitYoY = !isQuarterly
      ? rec.profChange ?? (prevRec ? computePctChange(rec.netProfit, prevRec.netProfit) : null)
      : null;
    const revenueQoQ = isQuarterly
      ? rec.revChange ?? (prevRec ? computePctChange(rec.revenue, prevRec.revenue) : null)
      : null;
    const profitQoQ = isQuarterly
      ? rec.profChange ?? (prevRec ? computePctChange(rec.netProfit, prevRec.netProfit) : null)
      : null;

    return {
      label: isQuarterly ? formatQuarterLabel(iso) : formatYearLabel(iso),
      endDate: iso,
      revenue: rec.revenue,
      profit: rec.netProfit,
      operatingIncome: rec.operatingProfit,
      ebitda: null,
      eps,
      revenueYoY,
      profitYoY,
      revenueQoQ,
      profitQoQ,
      netMarginPct: rec.revenue > 0 ? parseFloat(((rec.netProfit / rec.revenue) * 100).toFixed(2)) : null,
      operatingMarginPct:
        rec.revenue > 0 && rec.operatingProfit !== null
          ? parseFloat(((rec.operatingProfit / rec.revenue) * 100).toFixed(2))
          : null,
    };
  });

  return { periods, fullStatement };
}

async function fetchUpstoxFinancials(
  upperSymbol: string,
  requestedType: StatementType,
  token: string
): Promise<FinancialSummary | null> {
  const instrumentKey = getInstrumentKey(upperSymbol);
  const isin = instrumentKey?.split('|')[1];
  if (!isin) return null;

  let effectiveType: StatementType = requestedType;

  // Fetch quarterly + yearly income statements for requested type
  let [qRes, aRes, ratiosRes, cfRes, bsRes] = await Promise.all([
    upstoxFundamentalsGet(`${isin}/income-statement?type=${effectiveType}&time_period=quarterly&fs=true`, token),
    upstoxFundamentalsGet(`${isin}/income-statement?type=${effectiveType}&time_period=yearly&fs=true`, token),
    upstoxFundamentalsGet(`${isin}/key-ratios`, token),
    upstoxFundamentalsGet(`${isin}/cash-flow?type=${effectiveType}&fs=true`, token),
    upstoxFundamentalsGet(`${isin}/balance-sheet?type=${effectiveType}&fs=true`, token),
  ]);

  // Invalidate only this rejected token if Upstox rejects it
  if (qRes.status === 401 || aRes.status === 401) {
    await invalidateUpstoxTokens({ token });
    return null;
  }

  let parsedQ = parseUpstoxIncomePeriods(qRes.json, true);
  let parsedA = parseUpstoxIncomePeriods(aRes.json, false);

  // Auto-fallback to standalone if consolidated has empty data
  if (parsedQ.periods.length === 0 && parsedA.periods.length === 0 && effectiveType === 'consolidated') {
    effectiveType = 'standalone';
    [qRes, aRes, cfRes, bsRes] = await Promise.all([
      upstoxFundamentalsGet(`${isin}/income-statement?type=standalone&time_period=quarterly&fs=true`, token),
      upstoxFundamentalsGet(`${isin}/income-statement?type=standalone&time_period=yearly&fs=true`, token),
      upstoxFundamentalsGet(`${isin}/cash-flow?type=standalone&fs=true`, token),
      upstoxFundamentalsGet(`${isin}/balance-sheet?type=standalone&fs=true`, token),
    ]);
    parsedQ = parseUpstoxIncomePeriods(qRes.json, true);
    parsedA = parseUpstoxIncomePeriods(aRes.json, false);
  }

  if (parsedQ.periods.length === 0 && parsedA.periods.length === 0) {
    return null;
  }

  // Parse Key Ratios
  const keyRatios: KeyRatioItem[] = Array.isArray(ratiosRes.json?.data)
    ? ratiosRes.json.data
        .filter((r: any) => r?.name && r?.company_value !== undefined)
        .map((r: any) => ({
          name: String(r.name),
          companyValue: String(r.company_value),
          sectorValue: String(r.sector_value ?? '—'),
        }))
    : [];

  // Parse Latest Annual Cash Flow & Balance Sheet Health
  let latestAnnualHealth: BalanceSheetSnapshot | null = null;
  const cfData = cfRes.json?.data;
  const bsData = bsRes.json?.data;

  const cfMult = getUnitMultiplier(cfData?.units_in);
  const bsMult = getUnitMultiplier(bsData?.units_in);

  const operatingCfLatest = cfData?.cash_flow?.find((c: any) => c.category === 'operating')?.history?.[0];
  const investingCfLatest = cfData?.cash_flow?.find((c: any) => c.category === 'investing')?.history?.[0];
  const bsHistoryLatest = bsData?.history?.[0];
  const equityFsRow =
    bsData?.full_statement?.find((r: any) => /^equity\s*capital$/i.test(r.particular || '')) ||
    bsData?.full_statement?.find((r: any) => /equity/i.test(r.particular || '') && !/liabilit/i.test(r.particular || ''));
  const nonCurLiabFsRow = bsData?.full_statement?.find((r: any) => /^non-current\s*liabilities$/i.test(r.particular || ''));

  const latestPeriodRaw =
    bsHistoryLatest?.period || operatingCfLatest?.period || parsedA.periods[parsedA.periods.length - 1]?.endDate;

  if (latestPeriodRaw) {
    const asOfDate = latestPeriodRaw.includes('-') ? latestPeriodRaw : upstoxPeriodToIso(latestPeriodRaw);
    const ocf = operatingCfLatest ? Number(operatingCfLatest.value) * cfMult : null;
    const icf = investingCfLatest ? Number(investingCfLatest.value) * cfMult : null;
    const totalAssets = bsHistoryLatest?.total_asset !== undefined ? Number(bsHistoryLatest.total_asset) * bsMult : null;
    const totalLiabilities =
      bsHistoryLatest?.total_liability !== undefined ? Number(bsHistoryLatest.total_liability) * bsMult : null;

    const equityMatch = equityFsRow?.history?.find((h: any) => h.period === latestPeriodRaw) || equityFsRow?.history?.[0];
    const equity = equityMatch
      ? Number(equityMatch.value) * bsMult
      : totalAssets !== null && totalLiabilities !== null
        ? totalAssets - totalLiabilities
        : null;

    const debtMatch =
      nonCurLiabFsRow?.history?.find((h: any) => h.period === latestPeriodRaw) || nonCurLiabFsRow?.history?.[0];
    const debt = debtMatch ? Number(debtMatch.value) * bsMult : totalLiabilities;

    const debtToEquity =
      debt !== null && equity !== null && equity > 0 ? parseFloat((debt / equity).toFixed(2)) : null;

    if (ocf !== null || icf !== null || totalAssets !== null || equity !== null) {
      latestAnnualHealth = {
        asOfDate,
        operatingCashFlow: ocf,
        investingCashFlow: icf,
        freeCashFlow: null,
        totalAssets,
        totalLiabilities,
        totalDebt: debt,
        stockholdersEquity: equity,
        debtToEquity,
      };
    }
  }

  const { revenueGrowth, profitGrowth } = computeGrowthSummary(parsedQ.periods, parsedA.periods);

  return {
    symbol: upperSymbol,
    source: 'upstox',
    sourceTicker: isin,
    statementType: effectiveType,
    currency: 'INR',
    quarterly: parsedQ.periods.slice(-5),
    annual: parsedA.periods.slice(-5),
    revenueGrowth,
    profitGrowth,
    keyRatios,
    annualFullStatement: parsedA.fullStatement,
    latestAnnualHealth,
    lastUpdated: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK SOURCE: Yahoo Finance fundamentals-timeseries API
// ─────────────────────────────────────────────────────────────────────────────

const YAHOO_TIMESERIES_TYPES = [
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

function extractYahooSeries(resultList: any[], primaryType: string, fallbackType?: string): Map<string, number> {
  const map = new Map<string, number>();
  const readType = (typeName: string) => {
    const entry = resultList.find((r) => r?.meta?.type?.[0] === typeName);
    const items = entry?.[typeName];
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const dateStr = item?.asOfDate;
      const raw = item?.reportedValue?.raw;
      if (typeof dateStr === 'string' && typeof raw === 'number' && Number.isFinite(raw)) {
        map.set(dateStr, raw);
      }
    }
  };
  if (fallbackType) readType(fallbackType);
  readType(primaryType);
  return map;
}

async function fetchYahooTimeseriesRaw(yahooTicker: string): Promise<any[] | null> {
  const safeTicker = yahooTicker.includes('%') ? yahooTicker : encodeURIComponent(yahooTicker);
  const period1 = Math.floor(Date.now() / 1000) - 6 * 365 * 86400;
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${safeTicker}?type=${YAHOO_TIMESERIES_TYPES}&period1=${period1}&period2=${period2}`;

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

async function fetchYahooFinancials(upperSymbol: string): Promise<FinancialSummary | null> {
  let yahooTicker = toYahooTicker(upperSymbol);
  let resultList = await fetchYahooTimeseriesRaw(yahooTicker);

  const hasCoreData = (list: any[] | null) => {
    if (!list) return false;
    return (
      extractYahooSeries(list, 'annualTotalRevenue', 'annualOperatingRevenue').size > 0 ||
      extractYahooSeries(list, 'quarterlyTotalRevenue', 'quarterlyOperatingRevenue').size > 0
    );
  };

  if (!hasCoreData(resultList) && yahooTicker.endsWith('.NS')) {
    const bseTicker = yahooTicker.replace(/\.NS$/i, '.BO');
    const bseList = await fetchYahooTimeseriesRaw(bseTicker);
    if (hasCoreData(bseList)) {
      yahooTicker = bseTicker;
      resultList = bseList;
    }
  }

  if (!resultList || !hasCoreData(resultList)) return null;

  let currency = 'INR';
  for (const r of resultList) {
    const t = r?.meta?.type?.[0];
    if (t && Array.isArray(r?.[t]) && r[t][0]?.currencyCode) {
      currency = r[t][0].currencyCode;
      break;
    }
  }

  const qRevMap = extractYahooSeries(resultList, 'quarterlyTotalRevenue', 'quarterlyOperatingRevenue');
  const qProfMap = extractYahooSeries(resultList, 'quarterlyNetIncome', 'quarterlyNetIncomeCommonStockholders');
  const qOpMap = extractYahooSeries(resultList, 'quarterlyOperatingIncome');
  const qEbitdaMap = extractYahooSeries(resultList, 'quarterlyEBITDA');
  const qEpsMap = extractYahooSeries(resultList, 'quarterlyDilutedEPS', 'quarterlyBasicEPS');

  const qAllDates = Array.from(new Set([...qRevMap.keys(), ...qProfMap.keys()])).sort();
  const quarterlyAll: FinancialPeriod[] = qAllDates.map((dateStr, idx) => {
    const revenue = qRevMap.get(dateStr) ?? 0;
    const profit = qProfMap.get(dateStr) ?? 0;
    const operatingIncome = qOpMap.get(dateStr) ?? null;
    const yearAgoDate = findYearAgoDate(dateStr, qAllDates);
    const prevQ = idx > 0 ? qAllDates[idx - 1] : null;

    return {
      label: formatQuarterLabel(dateStr),
      endDate: dateStr,
      revenue,
      profit,
      operatingIncome,
      ebitda: qEbitdaMap.get(dateStr) ?? null,
      eps: qEpsMap.get(dateStr) ?? null,
      revenueYoY: yearAgoDate && qRevMap.has(yearAgoDate) ? computePctChange(revenue, qRevMap.get(yearAgoDate)) : null,
      profitYoY: yearAgoDate && qProfMap.has(yearAgoDate) ? computePctChange(profit, qProfMap.get(yearAgoDate)) : null,
      revenueQoQ: prevQ && qRevMap.has(prevQ) ? computePctChange(revenue, qRevMap.get(prevQ)) : null,
      profitQoQ: prevQ && qProfMap.has(prevQ) ? computePctChange(profit, qProfMap.get(prevQ)) : null,
      netMarginPct: revenue > 0 ? parseFloat(((profit / revenue) * 100).toFixed(2)) : null,
      operatingMarginPct:
        revenue > 0 && operatingIncome !== null ? parseFloat(((operatingIncome / revenue) * 100).toFixed(2)) : null,
    };
  });

  const aRevMap = extractYahooSeries(resultList, 'annualTotalRevenue', 'annualOperatingRevenue');
  const aProfMap = extractYahooSeries(resultList, 'annualNetIncome', 'annualNetIncomeCommonStockholders');
  const aOpMap = extractYahooSeries(resultList, 'annualOperatingIncome');
  const aEbitdaMap = extractYahooSeries(resultList, 'annualEBITDA');
  const aEpsMap = extractYahooSeries(resultList, 'annualDilutedEPS', 'annualBasicEPS');

  const aAllDates = Array.from(new Set([...aRevMap.keys(), ...aProfMap.keys()])).sort();
  const annualAll: FinancialPeriod[] = aAllDates.map((dateStr, idx) => {
    const revenue = aRevMap.get(dateStr) ?? 0;
    const profit = aProfMap.get(dateStr) ?? 0;
    const operatingIncome = aOpMap.get(dateStr) ?? null;
    const prevYear = findYearAgoDate(dateStr, aAllDates) ?? (idx > 0 ? aAllDates[idx - 1] : null);

    return {
      label: formatYearLabel(dateStr),
      endDate: dateStr,
      revenue,
      profit,
      operatingIncome,
      ebitda: aEbitdaMap.get(dateStr) ?? null,
      eps: aEpsMap.get(dateStr) ?? null,
      revenueYoY: prevYear && aRevMap.has(prevYear) ? computePctChange(revenue, aRevMap.get(prevYear)) : null,
      profitYoY: prevYear && aProfMap.has(prevYear) ? computePctChange(profit, aProfMap.get(prevYear)) : null,
      revenueQoQ: null,
      profitQoQ: null,
      netMarginPct: revenue > 0 ? parseFloat(((profit / revenue) * 100).toFixed(2)) : null,
      operatingMarginPct:
        revenue > 0 && operatingIncome !== null ? parseFloat(((operatingIncome / revenue) * 100).toFixed(2)) : null,
    };
  });

  const tRevMap = extractYahooSeries(resultList, 'trailingTotalRevenue');
  const tProfMap = extractYahooSeries(resultList, 'trailingNetIncome');
  const tDates = Array.from(tRevMap.keys()).sort();

  const { revenueGrowth, profitGrowth } = computeGrowthSummary(quarterlyAll, annualAll, tDates, tRevMap, tProfMap);

  const aOcfMap = extractYahooSeries(resultList, 'annualOperatingCashFlow');
  const aFcfMap = extractYahooSeries(resultList, 'annualFreeCashFlow');
  const aDebtMap = extractYahooSeries(resultList, 'annualTotalDebt');
  const aEqMap = extractYahooSeries(resultList, 'annualStockholdersEquity');

  let latestAnnualHealth: BalanceSheetSnapshot | null = null;
  if (aAllDates.length > 0) {
    const d = aAllDates[aAllDates.length - 1];
    const ocf = aOcfMap.get(d) ?? null;
    const fcf = aFcfMap.get(d) ?? null;
    const debt = aDebtMap.get(d) ?? null;
    const equity = aEqMap.get(d) ?? null;
    if (ocf !== null || fcf !== null || debt !== null || equity !== null) {
      latestAnnualHealth = {
        asOfDate: d,
        operatingCashFlow: ocf,
        freeCashFlow: fcf,
        totalDebt: debt,
        stockholdersEquity: equity,
        debtToEquity: debt !== null && equity !== null && equity > 0 ? parseFloat((debt / equity).toFixed(2)) : null,
      };
    }
  }

  return {
    symbol: upperSymbol,
    source: 'yahoo',
    sourceTicker: yahooTicker,
    statementType: 'consolidated',
    currency,
    quarterly: quarterlyAll.slice(-5),
    annual: annualAll.slice(-5),
    revenueGrowth,
    profitGrowth,
    keyRatios: [],
    annualFullStatement: null,
    latestAnnualHealth,
    lastUpdated: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENTRYPOINT: Upstox Primary -> Yahoo Fallback
// ─────────────────────────────────────────────────────────────────────────────

export interface FetchFinancialOptions {
  statementType?: StatementType;
  forceRefresh?: boolean;
  clientToken?: string;
}

export async function fetchFinancialPerformance(
  symbol: string,
  options: FetchFinancialOptions = {}
): Promise<FinancialSummary | null> {
  const upperSymbol = symbol.toUpperCase().trim();
  const statementType: StatementType = options.statementType === 'standalone' ? 'standalone' : 'consolidated';
  const forceRefresh = Boolean(options.forceRefresh);

  // Resolve Upstox access token: non-expired client header -> server Supabase store (trading or analytics)
  const upstoxToken = await resolveReadUpstoxToken(options.clientToken);

  // 1. Try Upstox Company Fundamentals API first when token is available
  if (upstoxToken) {
    const upstoxCacheKey = `financials:upstox:${upperSymbol}:${statementType}`;
    if (forceRefresh) techCache.delete(upstoxCacheKey);

    const upstoxData = await cachedFetch<FinancialSummary | null>(techCache, upstoxCacheKey, FINANCIAL_TTL, () =>
      fetchUpstoxFinancials(upperSymbol, statementType, upstoxToken)
    );

    if (upstoxData) {
      return upstoxData;
    }
  }

  // 2. Fallback to Yahoo Finance fundamentals-timeseries
  const yahooCacheKey = `financials:yahoo:${upperSymbol}`;
  if (forceRefresh) techCache.delete(yahooCacheKey);

  return cachedFetch<FinancialSummary | null>(techCache, yahooCacheKey, FINANCIAL_TTL, () =>
    fetchYahooFinancials(upperSymbol)
  );
}
