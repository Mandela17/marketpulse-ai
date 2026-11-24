// Market Event Calendar — Tracks earnings, RBI policy, F&O expiry, FOMC, and other market-moving events
// Provides event-aware context to the ML engine for better predictions around key dates.
// Phase 5: Added FOMC meetings, global macro events, and earnings proximity detection.

export interface MarketEvent {
  id: string;
  title: string;
  date: string;           // YYYY-MM-DD
  type: 'earnings' | 'rbi_policy' | 'fno_expiry' | 'budget' | 'ipo' | 'dividend' | 'macro' | 'global' | 'fomc';
  impact: 'high' | 'medium' | 'low';
  relatedStocks: string[];
  relatedSectors: string[];
  description: string;
  expectedVolatility: 'high' | 'medium' | 'low';
}

// ─── Static Known Events ────────────────────────────────────────────
// These are recurring / pre-announced events. In production, these would come from an API.

function getRecurringEvents(year: number, month: number): MarketEvent[] {
  const events: MarketEvent[] = [];
  const pad = (n: number) => String(n).padStart(2, '0');

  // F&O Expiry — Last Thursday of each month
  const lastThursday = getLastThursday(year, month);
  events.push({
    id: `fno-${year}-${pad(month)}`,
    title: `Monthly F&O Expiry`,
    date: `${year}-${pad(month)}-${pad(lastThursday)}`,
    type: 'fno_expiry',
    impact: 'high',
    relatedStocks: [],
    relatedSectors: [],
    description: 'Monthly futures & options expiry. Expect elevated volatility and rollover activity.',
    expectedVolatility: 'high',
  });

  // Weekly expiry — every Thursday
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  for (let d = firstDay.getDate(); d <= lastDay.getDate(); d++) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() === 4 && d !== lastThursday) { // Thursday, not monthly expiry
      events.push({
        id: `weekly-fno-${year}-${pad(month)}-${pad(d)}`,
        title: 'Weekly F&O Expiry',
        date: `${year}-${pad(month)}-${pad(d)}`,
        type: 'fno_expiry',
        impact: 'medium',
        relatedStocks: [],
        relatedSectors: [],
        description: 'Weekly options expiry — moderate volatility expected.',
        expectedVolatility: 'medium',
      });
    }
  }

  return events;
}

function getLastThursday(year: number, month: number): number {
  const lastDay = new Date(year, month, 0);
  let d = lastDay.getDate();
  while (new Date(year, month - 1, d).getDay() !== 4) d--;
  return d;
}

// ─── RBI Policy Dates (2026 Calendar — approximate) ──────────────────

const RBI_POLICY_DATES_2026 = [
  '2026-02-06', '2026-04-09', '2026-06-05',
  '2026-08-07', '2026-10-09', '2026-12-04',
];

function getRBIPolicyEvents(year: number): MarketEvent[] {
  const dates = year === 2026 ? RBI_POLICY_DATES_2026 : estimateRBIDates(year);
  return dates.map(date => ({
    id: `rbi-${date}`,
    title: 'RBI Monetary Policy Decision',
    date,
    type: 'rbi_policy' as const,
    impact: 'high' as const,
    relatedStocks: ['HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'BAJFINANCE'],
    relatedSectors: ['banking', 'nbfc', 'realty'],
    description: 'RBI MPC rate decision. Impacts banking, lending, and housing sectors.',
    expectedVolatility: 'high' as const,
  }));
}

function estimateRBIDates(year: number): string[] {
  // RBI typically meets every ~2 months starting Feb
  const pad = (n: number) => String(n).padStart(2, '0');
  return [2, 4, 6, 8, 10, 12].map(m => {
    // First week, typically Thursday/Friday
    return `${year}-${pad(m)}-${pad(Math.min(9, 6 + (m % 3)))}`;
  });
}

// ─── Earnings Calendar (Major Nifty50 Stocks — Approximate Quarters) ─

const EARNINGS_SCHEDULE: Record<string, number[]> = {
  // Quarter result months (approximate): [Jan, Apr, Jul, Oct]
  'RELIANCE': [1, 4, 7, 10],
  'TCS': [1, 4, 7, 10],
  'INFY': [1, 4, 7, 10],
  'HDFCBANK': [1, 4, 7, 10],
  'ICICIBANK': [1, 4, 7, 10],
  'SBIN': [2, 5, 8, 11],
  'WIPRO': [1, 4, 7, 10],
  'HCLTECH': [1, 4, 7, 10],
  'ITC': [2, 5, 8, 11],
  'HINDUNILVR': [2, 5, 8, 11],
  'BAJFINANCE': [1, 4, 7, 10],
  'BHARTIARTL': [2, 5, 8, 11],
  'LT': [2, 5, 8, 11],
  'MARUTI': [1, 4, 7, 10],
  'TATAMOTORS': [2, 5, 8, 11],
  'TMCV': [2, 5, 8, 11],
  'INDIGO': [1, 4, 7, 10],
  'SUNPHARMA': [2, 5, 8, 11],
  'TITAN': [2, 5, 8, 11],
  'NTPC': [2, 5, 8, 11],
  'ONGC': [2, 5, 8, 11],
  'TATASTEEL': [2, 5, 8, 11],
  'ADANIENT': [2, 5, 8, 11],
  'KOTAKBANK': [1, 4, 7, 10],
  'AXISBANK': [1, 4, 7, 10],
};

function getEarningsEvents(year: number, month: number): MarketEvent[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const events: MarketEvent[] = [];

  for (const [symbol, months] of Object.entries(EARNINGS_SCHEDULE)) {
    if (months.includes(month)) {
      // Earnings typically in second-third week
      const day = 15 + Math.floor(symbol.charCodeAt(0) % 10); // Deterministic spread
      const clampedDay = Math.min(day, 28);
      events.push({
        id: `earnings-${symbol}-${year}-Q${Math.ceil(month / 3)}`,
        title: `${symbol} Q${Math.ceil(month / 3)} Results`,
        date: `${year}-${pad(month)}-${pad(clampedDay)}`,
        type: 'earnings',
        impact: 'high',
        relatedStocks: [symbol],
        relatedSectors: getSectorForStock(symbol),
        description: `${symbol} quarterly earnings announcement. Expect significant price movement.`,
        expectedVolatility: 'high',
      });
    }
  }

  return events;
}

function getSectorForStock(symbol: string): string[] {
  const map: Record<string, string[]> = {
    'RELIANCE': ['energy', 'telecom'],
    'TCS': ['it'], 'INFY': ['it'], 'WIPRO': ['it'], 'HCLTECH': ['it'], 'TECHM': ['it'],
    'HDFCBANK': ['banking'], 'ICICIBANK': ['banking'], 'SBIN': ['banking'],
    'KOTAKBANK': ['banking'], 'AXISBANK': ['banking'],
    'BAJFINANCE': ['nbfc'],
    'HINDUNILVR': ['fmcg'], 'ITC': ['fmcg'],
    'BHARTIARTL': ['telecom'],
    'LT': ['infrastructure'],
    'MARUTI': ['auto'], 'TATAMOTORS': ['auto'], 'TMCV': ['auto'], 'INDIGO': ['aviation'],
    'SUNPHARMA': ['pharma'],
    'TITAN': ['gold'],
    'NTPC': ['power'], 'ONGC': ['energy'],
    'TATASTEEL': ['metals'],
    'ADANIENT': ['infrastructure'],
  };
  return map[symbol] || [];
}

// ─── Union Budget (February 1) ──────────────────────────────────────

function getBudgetEvent(year: number): MarketEvent | null {
  return {
    id: `budget-${year}`,
    title: `Union Budget ${year}`,
    date: `${year}-02-01`,
    type: 'budget',
    impact: 'high',
    relatedStocks: [],
    relatedSectors: ['banking', 'infrastructure', 'auto', 'fmcg', 'pharma', 'defense', 'power'],
    description: 'Annual Union Budget presentation. Market-wide impact across all sectors.',
    expectedVolatility: 'high',
  };
}

// ─── FOMC Meeting Dates (Phase 5: Global macro events) ──────────────

const FOMC_DATES_2026 = [
  '2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-11-04', '2026-12-16',
];

const FOMC_DATES_2027 = [
  '2027-01-27', '2027-03-17', '2027-05-05', '2027-06-16',
  '2027-07-28', '2027-09-15', '2027-11-03', '2027-12-15',
];

function getFOMCEvents(year: number): MarketEvent[] {
  const dates = year === 2026 ? FOMC_DATES_2026
    : year === 2027 ? FOMC_DATES_2027
    : estimateFOMCDates(year);
  return dates.map(date => ({
    id: `fomc-${date}`,
    title: 'US Fed FOMC Rate Decision',
    date,
    type: 'fomc' as const,
    impact: 'high' as const,
    relatedStocks: [],
    relatedSectors: ['banking', 'it', 'pharma'], // Export-sensitive
    description: 'US Federal Reserve interest rate decision. Impacts global risk appetite, FII flows, and INR.',
    expectedVolatility: 'high' as const,
  }));
}

function estimateFOMCDates(year: number): string[] {
  // FOMC meets ~8 times per year, roughly every 6-7 weeks
  const pad = (n: number) => String(n).padStart(2, '0');
  return [1, 3, 5, 6, 7, 9, 11, 12].map(m => `${year}-${pad(m)}-${pad(16 + (m % 3))}`);
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Get all market events for a given month.
 */
export function getEventsForMonth(year: number, month: number): MarketEvent[] {
  const events: MarketEvent[] = [
    ...getRecurringEvents(year, month),
    ...getRBIPolicyEvents(year).filter(e => {
      const d = new Date(e.date);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    }),
    ...getFOMCEvents(year).filter(e => {
      const d = new Date(e.date);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    }),
    ...getEarningsEvents(year, month),
  ];

  // Budget in February
  if (month === 2) {
    const budget = getBudgetEvent(year);
    if (budget) events.push(budget);
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get events within N days from today.
 */
export function getUpcomingEvents(days: number = 14): MarketEvent[] {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + days);

  const events: MarketEvent[] = [];
  const startMonth = today.getMonth() + 1;
  const startYear = today.getFullYear();
  const endMonth = end.getMonth() + 1;
  const endYear = end.getFullYear();

  // Collect events for the relevant months
  for (let y = startYear; y <= endYear; y++) {
    const mStart = y === startYear ? startMonth : 1;
    const mEnd = y === endYear ? endMonth : 12;
    for (let m = mStart; m <= mEnd; m++) {
      events.push(...getEventsForMonth(y, m));
    }
  }

  const todayStr = today.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];

  return events.filter(e => e.date >= todayStr && e.date <= endStr);
}

/**
 * Check if a stock has an upcoming event within N days.
 * Returns the event details if found, or null.
 */
export function getStockEvent(symbol: string, days: number = 7): MarketEvent | null {
  const upcoming = getUpcomingEvents(days);
  return upcoming.find(e =>
    e.relatedStocks.includes(symbol) ||
    e.relatedStocks.length === 0 // Market-wide events
  ) || null;
}

/**
 * Get a volatility adjustment factor based on upcoming events.
 * Returns a multiplier: 1.0 = normal, >1.0 = elevated volatility expected.
 */
export function getEventVolatilityAdjustment(symbol: string): {
  factor: number;
  reason: string | null;
} {
  const events = getUpcomingEvents(3); // Check 3-day window

  for (const event of events) {
    const isDirectlyRelated = event.relatedStocks.includes(symbol);
    const isMarketWide = event.relatedStocks.length === 0;
    const isSectorRelated = event.relatedSectors.some(s =>
      getSectorForStock(symbol).includes(s)
    );

    if (isDirectlyRelated) {
      const factor = event.impact === 'high' ? 1.8 : event.impact === 'medium' ? 1.4 : 1.2;
      return { factor, reason: event.title };
    }
    if (isMarketWide) {
      const factor = event.impact === 'high' ? 1.5 : 1.2;
      return { factor, reason: event.title };
    }
    if (isSectorRelated) {
      return { factor: 1.3, reason: event.title };
    }
  }

  return { factor: 1.0, reason: null };
}


// ─── Phase 5: Earnings Proximity Detection ──────────────────────────
// Returns days until next earnings for a stock (0 = earnings today, -1 = no known earnings)

export function getEarningsProximity(symbol: string): {
  daysToEarnings: number;
  isPreEarnings: boolean;   // within 3 days before
  isPostEarnings: boolean;  // within 2 days after
  confidenceDiscount: number; // 0-15 points to subtract
} {
  const earningsMonths = EARNINGS_SCHEDULE[symbol];
  if (!earningsMonths) {
    return { daysToEarnings: -1, isPreEarnings: false, isPostEarnings: false, confidenceDiscount: 0 };
  }

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const year = today.getFullYear();
  const pad = (n: number) => String(n).padStart(2, '0');

  // Find the nearest earnings date
  let minDays = Infinity;
  for (const month of earningsMonths) {
    const day = 15 + Math.floor(symbol.charCodeAt(0) % 10);
    const clampedDay = Math.min(day, 28);
    const earningsDate = `${year}-${pad(month)}-${pad(clampedDay)}`;
    const diff = (new Date(earningsDate).getTime() - today.getTime()) / 86400000;
    if (Math.abs(diff) < Math.abs(minDays)) minDays = diff;
  }

  const daysToEarnings = Math.round(minDays);
  const isPreEarnings = daysToEarnings >= 0 && daysToEarnings <= 3;
  const isPostEarnings = daysToEarnings < 0 && daysToEarnings >= -2;

  // Confidence discount: highest near earnings day, decreasing as distance grows
  let confidenceDiscount = 0;
  if (isPreEarnings) {
    confidenceDiscount = daysToEarnings === 0 ? 15 : daysToEarnings === 1 ? 12 : daysToEarnings === 2 ? 8 : 5;
  } else if (isPostEarnings) {
    confidenceDiscount = daysToEarnings === -1 ? 10 : 5;
  }

  return { daysToEarnings, isPreEarnings, isPostEarnings, confidenceDiscount };
}

// ─── Earnings Season Check ──────────────────────────────────────────

export function isEarningsSeason(): boolean {
  const month = new Date().getMonth() + 1;
  // Earnings season: Jan-Feb, Apr-May, Jul-Aug, Oct-Nov
  return [1, 2, 4, 5, 7, 8, 10, 11].includes(month);
}
