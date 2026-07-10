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

// In-memory cache (5 min TTL)
const cache: Map<string, { data: any; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const schemeCode = searchParams.get('code');
  const action = searchParams.get('action') || 'all';

  try {
    // Single fund detail
    if (action === 'detail' && schemeCode) {
      const code = parseInt(schemeCode);
      const fundMeta = CURATED_FUNDS.find(f => f.schemeCode === code);
      const navResult = await fetchFundNAV(code);

      return NextResponse.json({
        meta: fundMeta || null,
        nav: navResult,
      });
    }

    // Search funds from mfapi.in
    if (action === 'search') {
      const query = searchParams.get('q');
      if (!query) return NextResponse.json({ results: [] });

      const cacheKey = `search_${query}`;
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return NextResponse.json(cached.data);
      }

      const res = await fetch(`${MF_API_BASE}/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const results = (data || [])
        .filter((d: any) => d.schemeName?.toLowerCase().includes('direct') && d.schemeName?.toLowerCase().includes('growth'))
        .slice(0, 20);

      const response = { results };
      cache.set(cacheKey, { data: response, timestamp: Date.now() });
      return NextResponse.json(response);
    }

    // Default: all curated funds with returns
    const cacheKey = 'all_funds';
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    // Fetch NAV for all curated funds in parallel (with concurrency limit)
    const results = await Promise.all(
      CURATED_FUNDS.map(async (fund) => {
        const navResult = await fetchFundNAV(fund.schemeCode);
        return {
          ...fund,
          nav: navResult,
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

async function fetchFundNAV(schemeCode: number) {
  const cacheKey = `nav_${schemeCode}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const res = await fetch(`${MF_API_BASE}/${schemeCode}`, {
      next: { revalidate: 300 },
    });
    const data: MFAPIResponse = await res.json();
    const result = calculateReturns(data.data);
    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.error(`[MF] Failed to fetch NAV for ${schemeCode}:`, err);
    return null;
  }
}
