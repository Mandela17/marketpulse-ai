// NSE & BSE (Nifty / Sensex) Indian Stock Market Holidays Calendar
// Official trading holidays for NSE Capital Market (Equities) & BSE.
// Handles weekends, official exchange holidays, and trading session timings.

export interface MarketHoliday {
  date: string; // YYYY-MM-DD
  description: string;
}

// Official NSE / BSE Capital Market (Equities) Trading Holidays for 2025-2027
export const NSE_BSE_HOLIDAYS: Record<string, string> = {
  // ─── 2025 Holidays ───
  '2025-01-26': 'Republic Day',
  '2025-02-26': 'Mahashivratri',
  '2025-03-14': 'Holi',
  '2025-03-31': 'Id-Ul-Fitr (Ramadan Eid)',
  '2025-04-10': 'Shri Mahavir Jayanti',
  '2025-04-14': 'Dr. Baba Saheb Ambedkar Jayanti',
  '2025-04-18': 'Good Friday',
  '2025-05-01': 'Maharashtra Day',
  '2025-06-07': 'Bakri Id / Eid-ul-Adha',
  '2025-08-15': 'Independence Day',
  '2025-08-27': 'Ganesh Chaturthi',
  '2025-10-02': 'Mahatma Gandhi Jayanti',
  '2025-10-21': 'Dussehra',
  '2025-10-22': 'Diwali-Balipratipada',
  '2025-11-05': 'Guru Nanak Jayanti',
  '2025-12-25': 'Christmas',

  // ─── 2026 Official NSE Calendar (source: nseindia.com/api/holiday-master?type=trading) ───
  '2026-01-15': 'Municipal Corporation Election - Maharashtra',
  '2026-01-26': 'Republic Day',
  '2026-02-15': 'Mahashivratri',
  '2026-03-03': 'Holi',
  '2026-03-21': 'Id-Ul-Fitr (Ramadan Eid)',
  '2026-03-26': 'Shri Ram Navami',
  '2026-03-31': 'Shri Mahavir Jayanti',
  '2026-04-03': 'Good Friday',
  '2026-04-14': 'Dr. Baba Saheb Ambedkar Jayanti',
  '2026-05-01': 'Maharashtra Day',
  '2026-05-28': 'Bakri Id',
  '2026-06-26': 'Muharram',
  '2026-08-15': 'Independence Day',
  '2026-09-14': 'Ganesh Chaturthi',
  '2026-10-02': 'Mahatma Gandhi Jayanti',
  '2026-10-20': 'Dussehra',
  '2026-11-08': 'Diwali Laxmi Pujan (Muhurat Trading only)',
  '2026-11-10': 'Diwali-Balipratipada',
  '2026-11-24': 'Prakash Gurpurb Sri Guru Nanak Dev',
  '2026-12-25': 'Christmas',

  // ─── 2027 Projected Standard Calendar ───
  '2027-01-26': 'Republic Day',
  '2027-03-06': 'Mahashivratri',
  '2027-03-23': 'Holi',
  '2027-03-26': 'Good Friday',
  '2027-04-14': 'Dr. Baba Saheb Ambedkar Jayanti',
  '2027-05-01': 'Maharashtra Day',
  '2027-08-15': 'Independence Day',
  '2027-10-02': 'Mahatma Gandhi Jayanti',
  '2027-10-20': 'Dussehra',
  '2027-11-13': 'Diwali',
  '2027-12-25': 'Christmas',
};

/**
 * Returns current Date in Indian Standard Time (IST / UTC+5:30)
 */
export function getISTDate(date?: Date | string): Date {
  const base = date ? new Date(date) : new Date();
  const utc = base.getTime() + base.getTimezoneOffset() * 60000;
  return new Date(utc + 5.5 * 3600000);
}

/**
 * Returns YYYY-MM-DD string in IST
 */
export function getISTDateString(date?: Date | string): string {
  const ist = getISTDate(date);
  const year = ist.getFullYear();
  const month = String(ist.getMonth() + 1).padStart(2, '0');
  const day = String(ist.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks if the given date is an official NSE / BSE market holiday
 */
export function isMarketHoliday(date?: Date | string): boolean {
  const dateStr = getISTDateString(date);
  return Boolean(NSE_BSE_HOLIDAYS[dateStr]);
}

/**
 * Returns holiday description if today is a holiday, otherwise null
 */
export function getHolidayDescription(date?: Date | string): string | null {
  const dateStr = getISTDateString(date);
  return NSE_BSE_HOLIDAYS[dateStr] || null;
}

/**
 * Checks if the given date is an active trading day (not a weekend and not a holiday)
 */
export function isTradingDay(date?: Date | string): boolean {
  const ist = getISTDate(date);
  const day = ist.getDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return false;
  return !isMarketHoliday(date);
}

export interface MarketStatusInfo {
  isOpen: boolean;
  status: 'open' | 'closed' | 'holiday' | 'weekend';
  reason: string;
  holidayName?: string;
  nextTradingDay?: string;
}

/**
 * Comprehensive check for whether Indian stock markets (NSE / BSE) are currently OPEN.
 * Regular trading hours: Mon-Fri, 9:15 AM - 3:30 PM IST (excluding holidays).
 */
export function getMarketStatus(date?: Date | string): MarketStatusInfo {
  const ist = getISTDate(date);
  const day = ist.getDay();
  const dateStr = getISTDateString(date);

  // 1. Weekend check
  if (day === 0 || day === 6) {
    return {
      isOpen: false,
      status: 'weekend',
      reason: day === 0 ? 'Market Closed (Sunday)' : 'Market Closed (Saturday)',
    };
  }

  // 2. Official Holiday check
  const holidayName = NSE_BSE_HOLIDAYS[dateStr];
  if (holidayName) {
    return {
      isOpen: false,
      status: 'holiday',
      reason: `Market Closed (${holidayName})`,
      holidayName,
    };
  }

  // 3. Time check (9:15 AM - 3:30 PM IST)
  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // 9:15 AM = 555 min, 3:30 PM = 930 min
  if (totalMinutes >= 555 && totalMinutes <= 930) {
    return {
      isOpen: true,
      status: 'open',
      reason: 'Market Open (NSE/BSE Live)',
    };
  }

  if (totalMinutes < 555) {
    return {
      isOpen: false,
      status: 'closed',
      reason: 'Pre-Market (Opens 9:15 AM IST)',
    };
  }

  return {
    isOpen: false,
    status: 'closed',
    reason: 'Market Closed (Closed at 3:30 PM IST)',
  };
}

/**
 * Convenience helper returning boolean if market is open right now
 */
export function isMarketOpenNow(): boolean {
  return getMarketStatus().isOpen;
}
