// API route for Mutual Funds — fetches NAV data from mfapi.in and calculates returns
import { NextRequest, NextResponse } from 'next/server';
import { CURATED_FUNDS, MutualFundMeta } from '@/lib/mutualFundsData';

const MF_API_BASE = 'https://api.mfapi.in/mf';

interface NAVEntry {
  date: string; // DD-MM-YYYY
  nav: string;
}

interface MFAPIResponse {
  meta: {
    fund_house: string;
    scheme_type: string;
    scheme_category: string;
    scheme_code: number;
    scheme_name: string;
  };
  data: NAVEntry[];
}

// Parse DD-MM-YYYY to Date
function parseDate(dateStr: string): Date {
  const [dd, mm, yyyy] = dateStr.split('-');
  return new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
}

// Find NAV closest to N days ago
function findNAVAtDaysAgo(navData: NAVEntry[], daysAgo: number): number | null {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - daysAgo);

  // Find the closest NAV entry on or before the target date
  for (const entry of navData) {
    const entryDate = parseDate(entry.date);
    if (entryDate <= targetDate) {
      return parseFloat(entry.nav);
    }
  }
  return null;
}

// Calculate returns from NAV history
function calculateReturns(navData: NAVEntry[]) {
  if (!navData || navData.length === 0) return null;

  const currentNAV = parseFloat(navData[0].nav);
  const periods = [
    { key: '1W', days: 7 },
    { key: '1M', days: 30 },
    { key: '3M', days: 90 },
    { key: '6M', days: 180 },
    { key: '1Y', days: 365 },
    { key: '3Y', days: 1095 },
    { key: '5Y', days: 1825 },
  ];

  const returns: Record<string, number | null> = {};

  for (const { key, days } of periods) {
    const pastNAV = findNAVAtDaysAgo(navData, days);
    if (pastNAV && pastNAV > 0) {
      const yearsMultiplier = days >= 365 ? days / 365 : 1;
      if (days >= 365) {
        // CAGR for periods >= 1 year
        returns[key] = (Math.pow(currentNAV / pastNAV, 1 / yearsMultiplier) - 1) * 100;
      } else {
        // Absolute return for shorter periods
        returns[key] = ((currentNAV - pastNAV) / pastNAV) * 100;
      }
    } else {
      returns[key] = null;
    }
  }

  return {
    currentNAV,
    navDate: navData[0].date,
    returns,
    // Mini sparkline data (last 30 trading days)
    sparkline: navData.slice(0, 30).reverse().map(d => parseFloat(d.nav)),
  };
}

// In-memory cache (5 min TTL for NAV, 1 hour for holdings)
const cache: Map<string, { data: any; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const HOLDINGS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Fetch holdings from Groww's public API
async function fetchHoldingsFromGroww(schemeName: string): Promise<{ name: string; weight: number }[] | null> {
  const cacheKey = `holdings_${schemeName.substring(0, 30)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < HOLDINGS_CACHE_TTL) {
    return cached.data;
  }

  try {
    // Step 1: Search Groww for the fund to get its slug/search_id
    const cleanName = schemeName
      .replace(/\s*-\s*direct\s*plan\s*/i, ' ')
      .replace(/\s*-\s*growth\s*/i, '')
      .replace(/\s*direct\s*growth\s*/i, '')
      .trim()
      .substring(0, 50);

    const controller1 = new AbortController();
    const t1 = setTimeout(() => controller1.abort(), 5000);
    const searchRes = await fetch(
      `https://groww.in/v1/api/search/v1/entity?app=false&entity_type=scheme&page=0&q=${encodeURIComponent(cleanName)}&size=3`,
      { signal: controller1.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
    );
    clearTimeout(t1);

    if (!searchRes.ok) { cache.set(cacheKey, { data: null, timestamp: Date.now() }); return null; }
    const searchData = await searchRes.json();
    const searchId = searchData?.content?.[0]?.id;
    if (!searchId) { cache.set(cacheKey, { data: null, timestamp: Date.now() }); return null; }

    // Step 2: Fetch portfolio/holdings
    const controller2 = new AbortController();
    const t2 = setTimeout(() => controller2.abort(), 5000);
    const portfolioRes = await fetch(
      `https://groww.in/v1/api/data/mf/web/v1/scheme/portfolio/${searchId}?intervalInMonths=3`,
      { signal: controller2.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
    );
    clearTimeout(t2);

    if (!portfolioRes.ok) { cache.set(cacheKey, { data: null, timestamp: Date.now() }); return null; }
    const portfolioData = await portfolioRes.json();

    // Extract equity holdings
    const equityHoldings = portfolioData?.equity_holdings || portfolioData?.equityHoldings || [];
    const holdings = equityHoldings
      .map((h: any) => ({
        name: h.company_name || h.companyName || h.name || '',
        weight: parseFloat(h.corpus_per || h.corpusPer || h.percentage || h.weight || 0),
      }))
      .filter((h: { name: string; weight: number }) => h.name && h.weight > 0)
      .sort((a: { weight: number }, b: { weight: number }) => b.weight - a.weight)
      .slice(0, 10);

    const result = holdings.length > 0 ? holdings : null;
    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.error('[MF] Holdings fetch failed:', err);
    cache.set(cacheKey, { data: null, timestamp: Date.now() });
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const schemeCode = searchParams.get('code');
  const action = searchParams.get('action') || 'all';

  try {
    // Single fund detail — returns meta + nav + holdings for ANY fund
    if (action === 'detail' && schemeCode) {
      const code = parseInt(schemeCode);
      const fundMeta = CURATED_FUNDS.find(f => f.schemeCode === code);

      // Fetch NAV data from mfapi.in
      const fullData = await fetchFundFull(code);
      const schemeName = fullData?.apiMeta?.scheme_name || fundMeta?.name || '';

      // Fetch holdings: use curated data if available, otherwise try Groww
      let holdings = fundMeta?.topHoldings || null;
      if (!holdings && schemeName) {
        holdings = await fetchHoldingsFromGroww(schemeName);
      }

      return NextResponse.json({
        meta: fundMeta || null,
        apiMeta: fullData?.apiMeta || null,
        nav: fullData?.nav || null,
        holdings: holdings,
      });
    }

    // Search funds from mfapi.in
    if (action === 'search') {
      const query = searchParams.get('q');
      if (!query) return NextResponse.json({ results: [] });

      const cacheKey = `search_${query.toLowerCase().trim()}`;
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return NextResponse.json(cached.data);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

      try {
        const res = await fetch(`${MF_API_BASE}/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await res.json();
        const results = (data || [])
          .filter((d: any) => d.schemeName?.toLowerCase().includes('direct') && d.schemeName?.toLowerCase().includes('growth'))
          .slice(0, 15);

        const response = { results };
        cache.set(cacheKey, { data: response, timestamp: Date.now() });
        return NextResponse.json(response);
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          return NextResponse.json({ results: [], timeout: true });
        }
        throw err;
      }
    }

    // Default: all curated funds with returns
    const cacheKey = 'all_funds';
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    const results = await Promise.all(
      CURATED_FUNDS.map(async (fund) => {
        const fullData = await fetchFundFull(fund.schemeCode);
        return {
          ...fund,
          nav: fullData?.nav || null,
        };
      })
    );

    const response = { funds: results, updatedAt: new Date().toISOString() };
    cache.set(cacheKey, { data: response, timestamp: Date.now() });
    return NextResponse.json(response);
  } catch (err: any) {
    console.error('[MutualFunds API] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Fetch full fund data (meta + nav) with caching
async function fetchFundFull(schemeCode: number): Promise<{ apiMeta: any; nav: any } | null> {
  const cacheKey = `full_${schemeCode}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const res = await fetch(`${MF_API_BASE}/${schemeCode}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data: MFAPIResponse = await res.json();
    const nav = calculateReturns(data.data);
    const result = {
      apiMeta: data.meta || null,
      nav,
    };
    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.error(`[MF] Failed to fetch for ${schemeCode}:`, err);
    return null;
  }
}
