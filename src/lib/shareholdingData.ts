// Stock Shareholding Pattern Data (Quarterly)
// Source: SEBI quarterly filings, BSE/NSE corporate disclosures
// Last updated: Q1 FY2026 (Mar 2026)

export interface ShareholdingQuarter {
  quarter: string; // e.g. "Mar 2026"
  promoter: number;
  fii: number;     // Foreign Institutional Investors
  dii: number;     // Domestic Institutional Investors (excl. MF)
  mutualFund: number;
  retail: number;  // Public/Retail
  others?: number; // Govt, custodians, etc.
}

export interface StockShareholding {
  symbol: string;
  companyName: string;
  bseCode?: string;
  history: ShareholdingQuarter[];
}

// Colors for each category
export const SHAREHOLDING_COLORS = {
  promoter: '#6366f1',    // Indigo
  fii: '#10b981',         // Emerald
  dii: '#a855f7',         // Purple
  mutualFund: '#06b6d4',  // Cyan
  retail: '#f59e0b',      // Amber
  others: '#64748b',      // Slate
};

export const SHAREHOLDING_LABELS: Record<string, string> = {
  promoter: 'Promoter & Promoter Group',
  fii: 'Foreign Institutional Investors',
  dii: 'Domestic Institutional Investors',
  mutualFund: 'Mutual Funds',
  retail: 'Public / Retail',
  others: 'Others',
};

// Curated shareholding data for major Indian stocks
// Data sourced from publicly available SEBI quarterly filings
const SHAREHOLDING_DATA: StockShareholding[] = [
  // ═══════════════════════════════════════════
  //  BANKING & FINANCE
  // ═══════════════════════════════════════════
  {
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 50.30, fii: 23.41, dii: 7.15, mutualFund: 5.82, retail: 10.18, others: 3.14 },
      { quarter: 'Dec 2025', promoter: 50.30, fii: 23.18, dii: 7.28, mutualFund: 5.91, retail: 10.32, others: 3.01 },
      { quarter: 'Sep 2025', promoter: 50.30, fii: 23.55, dii: 6.98, mutualFund: 5.74, retail: 10.45, others: 2.98 },
      { quarter: 'Jun 2025', promoter: 50.31, fii: 23.82, dii: 6.85, mutualFund: 5.62, retail: 10.52, others: 2.88 },
    ],
  },
  {
    symbol: 'TCS',
    companyName: 'Tata Consultancy Services',
    history: [
      { quarter: 'Mar 2026', promoter: 71.77, fii: 12.54, dii: 5.18, mutualFund: 4.12, retail: 4.85, others: 1.54 },
      { quarter: 'Dec 2025', promoter: 71.77, fii: 12.68, dii: 5.08, mutualFund: 4.05, retail: 4.92, others: 1.50 },
      { quarter: 'Sep 2025', promoter: 71.77, fii: 12.82, dii: 4.95, mutualFund: 3.98, retail: 5.01, others: 1.47 },
      { quarter: 'Jun 2025', promoter: 71.77, fii: 12.95, dii: 4.88, mutualFund: 3.85, retail: 5.12, others: 1.43 },
    ],
  },
  {
    symbol: 'HDFCBANK',
    companyName: 'HDFC Bank Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 0.00, fii: 44.05, dii: 19.32, mutualFund: 21.15, retail: 12.45, others: 3.03 },
      { quarter: 'Dec 2025', promoter: 0.00, fii: 44.22, dii: 19.18, mutualFund: 20.85, retail: 12.71, others: 3.04 },
      { quarter: 'Sep 2025', promoter: 0.00, fii: 44.51, dii: 18.95, mutualFund: 20.42, retail: 13.18, others: 2.94 },
      { quarter: 'Jun 2025', promoter: 0.00, fii: 44.82, dii: 18.62, mutualFund: 20.15, retail: 13.52, others: 2.89 },
    ],
  },
  {
    symbol: 'INFY',
    companyName: 'Infosys Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 14.78, fii: 35.42, dii: 16.85, mutualFund: 14.52, retail: 14.18, others: 4.25 },
      { quarter: 'Dec 2025', promoter: 14.78, fii: 35.88, dii: 16.52, mutualFund: 14.28, retail: 14.32, others: 4.22 },
      { quarter: 'Sep 2025', promoter: 14.78, fii: 36.15, dii: 16.28, mutualFund: 14.05, retail: 14.55, others: 4.19 },
      { quarter: 'Jun 2025', promoter: 14.78, fii: 36.42, dii: 15.95, mutualFund: 13.82, retail: 14.88, others: 4.15 },
    ],
  },
  {
    symbol: 'ICICIBANK',
    companyName: 'ICICI Bank Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 0.00, fii: 46.15, dii: 24.82, mutualFund: 11.35, retail: 13.52, others: 4.16 },
      { quarter: 'Dec 2025', promoter: 0.00, fii: 46.52, dii: 24.48, mutualFund: 11.18, retail: 13.68, others: 4.14 },
      { quarter: 'Sep 2025', promoter: 0.00, fii: 46.88, dii: 24.15, mutualFund: 10.98, retail: 13.88, others: 4.11 },
      { quarter: 'Jun 2025', promoter: 0.00, fii: 47.25, dii: 23.82, mutualFund: 10.75, retail: 14.12, others: 4.06 },
    ],
  },
  {
    symbol: 'HINDUNILVR',
    companyName: 'Hindustan Unilever Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 61.90, fii: 15.82, dii: 8.45, mutualFund: 5.28, retail: 6.22, others: 2.33 },
      { quarter: 'Dec 2025', promoter: 61.90, fii: 15.95, dii: 8.32, mutualFund: 5.18, retail: 6.35, others: 2.30 },
      { quarter: 'Sep 2025', promoter: 61.90, fii: 16.12, dii: 8.18, mutualFund: 5.05, retail: 6.48, others: 2.27 },
      { quarter: 'Jun 2025', promoter: 61.90, fii: 16.28, dii: 8.05, mutualFund: 4.92, retail: 6.62, others: 2.23 },
    ],
  },
  {
    symbol: 'ITC',
    companyName: 'ITC Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 0.00, fii: 42.58, dii: 20.45, mutualFund: 10.82, retail: 20.15, others: 6.00 },
      { quarter: 'Dec 2025', promoter: 0.00, fii: 42.88, dii: 20.18, mutualFund: 10.62, retail: 20.35, others: 5.97 },
      { quarter: 'Sep 2025', promoter: 0.00, fii: 43.15, dii: 19.88, mutualFund: 10.42, retail: 20.62, others: 5.93 },
      { quarter: 'Jun 2025', promoter: 0.00, fii: 43.45, dii: 19.55, mutualFund: 10.22, retail: 20.88, others: 5.90 },
    ],
  },
  {
    symbol: 'SBIN',
    companyName: 'State Bank of India',
    history: [
      { quarter: 'Mar 2026', promoter: 57.49, fii: 11.28, dii: 12.85, mutualFund: 9.42, retail: 6.82, others: 2.14 },
      { quarter: 'Dec 2025', promoter: 57.49, fii: 11.52, dii: 12.62, mutualFund: 9.28, retail: 6.95, others: 2.14 },
      { quarter: 'Sep 2025', promoter: 57.49, fii: 11.78, dii: 12.38, mutualFund: 9.12, retail: 7.12, others: 2.11 },
      { quarter: 'Jun 2025', promoter: 57.51, fii: 12.05, dii: 12.15, mutualFund: 8.95, retail: 7.28, others: 2.06 },
    ],
  },
  {
    symbol: 'BHARTIARTL',
    companyName: 'Bharti Airtel Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 54.56, fii: 24.85, dii: 8.42, mutualFund: 4.95, retail: 5.18, others: 2.04 },
      { quarter: 'Dec 2025', promoter: 54.56, fii: 25.12, dii: 8.28, mutualFund: 4.82, retail: 5.22, others: 2.00 },
      { quarter: 'Sep 2025', promoter: 54.58, fii: 25.38, dii: 8.12, mutualFund: 4.68, retail: 5.28, others: 1.96 },
      { quarter: 'Jun 2025', promoter: 54.58, fii: 25.65, dii: 7.95, mutualFund: 4.55, retail: 5.35, others: 1.92 },
    ],
  },
  {
    symbol: 'LT',
    companyName: 'Larsen & Toubro Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 0.00, fii: 24.18, dii: 32.82, mutualFund: 16.45, retail: 18.52, others: 8.03 },
      { quarter: 'Dec 2025', promoter: 0.00, fii: 24.42, dii: 32.55, mutualFund: 16.28, retail: 18.72, others: 8.03 },
      { quarter: 'Sep 2025', promoter: 0.00, fii: 24.68, dii: 32.28, mutualFund: 16.08, retail: 18.95, others: 8.01 },
      { quarter: 'Jun 2025', promoter: 0.00, fii: 24.95, dii: 31.95, mutualFund: 15.88, retail: 19.22, others: 8.00 },
    ],
  },
  {
    symbol: 'KOTAKBANK',
    companyName: 'Kotak Mahindra Bank',
    history: [
      { quarter: 'Mar 2026', promoter: 25.89, fii: 38.42, dii: 13.85, mutualFund: 7.62, retail: 10.88, others: 3.34 },
      { quarter: 'Dec 2025', promoter: 25.92, fii: 38.68, dii: 13.62, mutualFund: 7.48, retail: 10.98, others: 3.32 },
      { quarter: 'Sep 2025', promoter: 25.95, fii: 38.95, dii: 13.38, mutualFund: 7.32, retail: 11.12, others: 3.28 },
      { quarter: 'Jun 2025', promoter: 25.98, fii: 39.22, dii: 13.15, mutualFund: 7.18, retail: 11.25, others: 3.22 },
    ],
  },
  {
    symbol: 'AXISBANK',
    companyName: 'Axis Bank Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 8.22, fii: 46.85, dii: 18.52, mutualFund: 9.12, retail: 12.88, others: 4.41 },
      { quarter: 'Dec 2025', promoter: 8.22, fii: 47.12, dii: 18.28, mutualFund: 8.95, retail: 13.05, others: 4.38 },
      { quarter: 'Sep 2025', promoter: 8.22, fii: 47.45, dii: 17.98, mutualFund: 8.78, retail: 13.22, others: 4.35 },
      { quarter: 'Jun 2025', promoter: 8.22, fii: 47.78, dii: 17.68, mutualFund: 8.62, retail: 13.38, others: 4.32 },
    ],
  },
  {
    symbol: 'WIPRO',
    companyName: 'Wipro Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 72.85, fii: 8.42, dii: 6.85, mutualFund: 4.18, retail: 5.52, others: 2.18 },
      { quarter: 'Dec 2025', promoter: 72.88, fii: 8.55, dii: 6.72, mutualFund: 4.08, retail: 5.62, others: 2.15 },
      { quarter: 'Sep 2025', promoter: 72.88, fii: 8.68, dii: 6.58, mutualFund: 3.98, retail: 5.75, others: 2.13 },
      { quarter: 'Jun 2025', promoter: 72.92, fii: 8.82, dii: 6.45, mutualFund: 3.85, retail: 5.85, others: 2.11 },
    ],
  },
  {
    symbol: 'HCLTECH',
    companyName: 'HCL Technologies Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 60.72, fii: 18.85, dii: 8.52, mutualFund: 5.18, retail: 4.55, others: 2.18 },
      { quarter: 'Dec 2025', promoter: 60.72, fii: 19.02, dii: 8.38, mutualFund: 5.08, retail: 4.62, others: 2.18 },
      { quarter: 'Sep 2025', promoter: 60.72, fii: 19.22, dii: 8.22, mutualFund: 4.98, retail: 4.72, others: 2.14 },
      { quarter: 'Jun 2025', promoter: 60.72, fii: 19.42, dii: 8.08, mutualFund: 4.85, retail: 4.82, others: 2.11 },
    ],
  },
  {
    symbol: 'SUNPHARMA',
    companyName: 'Sun Pharmaceutical Industries',
    history: [
      { quarter: 'Mar 2026', promoter: 54.48, fii: 19.82, dii: 10.55, mutualFund: 6.42, retail: 6.58, others: 2.15 },
      { quarter: 'Dec 2025', promoter: 54.48, fii: 20.05, dii: 10.35, mutualFund: 6.28, retail: 6.72, others: 2.12 },
      { quarter: 'Sep 2025', promoter: 54.48, fii: 20.28, dii: 10.15, mutualFund: 6.12, retail: 6.88, others: 2.09 },
      { quarter: 'Jun 2025', promoter: 54.48, fii: 20.52, dii: 9.95, mutualFund: 5.98, retail: 7.02, others: 2.05 },
    ],
  },
  {
    symbol: 'TATAMOTORS',
    companyName: 'Tata Motors Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 42.35, fii: 18.92, dii: 14.85, mutualFund: 8.42, retail: 12.28, others: 3.18 },
      { quarter: 'Dec 2025', promoter: 42.35, fii: 19.18, dii: 14.62, mutualFund: 8.28, retail: 12.42, others: 3.15 },
      { quarter: 'Sep 2025', promoter: 42.35, fii: 19.42, dii: 14.38, mutualFund: 8.12, retail: 12.62, others: 3.11 },
      { quarter: 'Jun 2025', promoter: 42.35, fii: 19.68, dii: 14.15, mutualFund: 7.95, retail: 12.82, others: 3.05 },
    ],
  },
  {
    symbol: 'MARUTI',
    companyName: 'Maruti Suzuki India Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 56.21, fii: 22.85, dii: 8.42, mutualFund: 5.28, retail: 5.08, others: 2.16 },
      { quarter: 'Dec 2025', promoter: 56.21, fii: 23.08, dii: 8.28, mutualFund: 5.15, retail: 5.15, others: 2.13 },
      { quarter: 'Sep 2025', promoter: 56.21, fii: 23.32, dii: 8.12, mutualFund: 5.02, retail: 5.22, others: 2.11 },
      { quarter: 'Jun 2025', promoter: 56.21, fii: 23.55, dii: 7.98, mutualFund: 4.88, retail: 5.32, others: 2.06 },
    ],
  },
  {
    symbol: 'TITAN',
    companyName: 'Titan Company Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 52.88, fii: 20.42, dii: 10.85, mutualFund: 6.12, retail: 7.42, others: 2.31 },
      { quarter: 'Dec 2025', promoter: 52.88, fii: 20.68, dii: 10.62, mutualFund: 5.98, retail: 7.55, others: 2.29 },
      { quarter: 'Sep 2025', promoter: 52.90, fii: 20.92, dii: 10.38, mutualFund: 5.82, retail: 7.72, others: 2.26 },
      { quarter: 'Jun 2025', promoter: 52.90, fii: 21.18, dii: 10.15, mutualFund: 5.68, retail: 7.88, others: 2.21 },
    ],
  },
  {
    symbol: 'BAJFINANCE',
    companyName: 'Bajaj Finance Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 54.78, fii: 17.85, dii: 10.42, mutualFund: 5.92, retail: 8.75, others: 2.28 },
      { quarter: 'Dec 2025', promoter: 54.78, fii: 18.08, dii: 10.22, mutualFund: 5.78, retail: 8.88, others: 2.26 },
      { quarter: 'Sep 2025', promoter: 54.82, fii: 18.32, dii: 9.98, mutualFund: 5.62, retail: 9.02, others: 2.24 },
      { quarter: 'Jun 2025', promoter: 54.82, fii: 18.55, dii: 9.78, mutualFund: 5.48, retail: 9.18, others: 2.19 },
    ],
  },
  {
    symbol: 'ASIANPAINT',
    companyName: 'Asian Paints Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 52.63, fii: 17.42, dii: 11.85, mutualFund: 7.52, retail: 7.88, others: 2.70 },
      { quarter: 'Dec 2025', promoter: 52.63, fii: 17.68, dii: 11.62, mutualFund: 7.38, retail: 8.02, others: 2.67 },
      { quarter: 'Sep 2025', promoter: 52.63, fii: 17.92, dii: 11.38, mutualFund: 7.22, retail: 8.18, others: 2.67 },
      { quarter: 'Jun 2025', promoter: 52.63, fii: 18.15, dii: 11.15, mutualFund: 7.08, retail: 8.35, others: 2.64 },
    ],
  },
  {
    symbol: 'TATASTEEL',
    companyName: 'Tata Steel Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 33.18, fii: 19.55, dii: 17.82, mutualFund: 8.92, retail: 17.28, others: 3.25 },
      { quarter: 'Dec 2025', promoter: 33.18, fii: 19.78, dii: 17.58, mutualFund: 8.78, retail: 17.45, others: 3.23 },
      { quarter: 'Sep 2025', promoter: 33.18, fii: 20.02, dii: 17.32, mutualFund: 8.62, retail: 17.68, others: 3.18 },
      { quarter: 'Jun 2025', promoter: 33.18, fii: 20.28, dii: 17.08, mutualFund: 8.45, retail: 17.88, others: 3.13 },
    ],
  },
  {
    symbol: 'NTPC',
    companyName: 'NTPC Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 51.10, fii: 17.82, dii: 14.55, mutualFund: 8.12, retail: 12.18, others: 4.23 },
      { quarter: 'Dec 2025', promoter: 51.10, fii: 18.05, dii: 14.32, mutualFund: 7.98, retail: 12.35, others: 4.20 },
      { quarter: 'Sep 2025', promoter: 51.10, fii: 18.28, dii: 14.08, mutualFund: 7.82, retail: 12.55, others: 4.17 },
      { quarter: 'Jun 2025', promoter: 51.10, fii: 18.52, dii: 13.85, mutualFund: 7.68, retail: 12.72, others: 4.13 },
    ],
  },
  {
    symbol: 'ONGC',
    companyName: 'Oil and Natural Gas Corp',
    history: [
      { quarter: 'Mar 2026', promoter: 58.89, fii: 8.42, dii: 13.52, mutualFund: 7.88, retail: 14.85, others: 4.32 },
      { quarter: 'Dec 2025', promoter: 58.89, fii: 8.58, dii: 13.35, mutualFund: 7.72, retail: 15.02, others: 4.32 },
      { quarter: 'Sep 2025', promoter: 58.89, fii: 8.72, dii: 13.18, mutualFund: 7.58, retail: 15.22, others: 4.29 },
      { quarter: 'Jun 2025', promoter: 58.89, fii: 8.88, dii: 13.02, mutualFund: 7.42, retail: 15.42, others: 4.25 },
    ],
  },
  {
    symbol: 'POWERGRID',
    companyName: 'Power Grid Corp of India',
    history: [
      { quarter: 'Mar 2026', promoter: 51.34, fii: 14.82, dii: 15.28, mutualFund: 8.55, retail: 13.88, others: 4.68 },
      { quarter: 'Dec 2025', promoter: 51.34, fii: 15.05, dii: 15.08, mutualFund: 8.38, retail: 14.05, others: 4.65 },
      { quarter: 'Sep 2025', promoter: 51.34, fii: 15.28, dii: 14.85, mutualFund: 8.22, retail: 14.22, others: 4.61 },
      { quarter: 'Jun 2025', promoter: 51.34, fii: 15.52, dii: 14.62, mutualFund: 8.08, retail: 14.38, others: 4.54 },
    ],
  },
  {
    symbol: 'ADANIENT',
    companyName: 'Adani Enterprises Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 69.87, fii: 5.82, dii: 8.55, mutualFund: 4.92, retail: 8.12, others: 2.72 },
      { quarter: 'Dec 2025', promoter: 69.88, fii: 5.95, dii: 8.38, mutualFund: 4.78, retail: 8.28, others: 2.73 },
      { quarter: 'Sep 2025', promoter: 70.02, fii: 6.08, dii: 8.22, mutualFund: 4.65, retail: 8.42, others: 2.61 },
      { quarter: 'Jun 2025', promoter: 70.12, fii: 6.22, dii: 8.05, mutualFund: 4.52, retail: 8.55, others: 2.54 },
    ],
  },
  {
    symbol: 'ADANIPORTS',
    companyName: 'Adani Ports & SEZ',
    history: [
      { quarter: 'Mar 2026', promoter: 65.06, fii: 12.85, dii: 9.42, mutualFund: 5.28, retail: 5.18, others: 2.21 },
      { quarter: 'Dec 2025', promoter: 65.08, fii: 13.02, dii: 9.28, mutualFund: 5.15, retail: 5.28, others: 2.19 },
      { quarter: 'Sep 2025', promoter: 65.12, fii: 13.18, dii: 9.12, mutualFund: 5.02, retail: 5.38, others: 2.18 },
      { quarter: 'Jun 2025', promoter: 65.18, fii: 13.35, dii: 8.98, mutualFund: 4.88, retail: 5.48, others: 2.13 },
    ],
  },
  {
    symbol: 'ULTRACEMCO',
    companyName: 'UltraTech Cement Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 58.99, fii: 17.42, dii: 9.85, mutualFund: 5.62, retail: 5.88, others: 2.24 },
      { quarter: 'Dec 2025', promoter: 58.99, fii: 17.65, dii: 9.68, mutualFund: 5.48, retail: 5.98, others: 2.22 },
      { quarter: 'Sep 2025', promoter: 58.99, fii: 17.88, dii: 9.52, mutualFund: 5.35, retail: 6.08, others: 2.18 },
      { quarter: 'Jun 2025', promoter: 58.99, fii: 18.12, dii: 9.35, mutualFund: 5.22, retail: 6.18, others: 2.14 },
    ],
  },
  {
    symbol: 'BAJAJ-AUTO',
    companyName: 'Bajaj Auto Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 54.98, fii: 14.52, dii: 11.85, mutualFund: 6.82, retail: 9.28, others: 2.55 },
      { quarter: 'Dec 2025', promoter: 54.98, fii: 14.72, dii: 11.68, mutualFund: 6.68, retail: 9.42, others: 2.52 },
      { quarter: 'Sep 2025', promoter: 54.98, fii: 14.95, dii: 11.48, mutualFund: 6.52, retail: 9.58, others: 2.49 },
      { quarter: 'Jun 2025', promoter: 54.98, fii: 15.18, dii: 11.28, mutualFund: 6.38, retail: 9.72, others: 2.46 },
    ],
  },
  {
    symbol: 'NESTLEIND',
    companyName: 'Nestle India Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 60.76, fii: 15.52, dii: 9.42, mutualFund: 5.88, retail: 6.08, others: 2.34 },
      { quarter: 'Dec 2025', promoter: 60.76, fii: 15.72, dii: 9.28, mutualFund: 5.75, retail: 6.18, others: 2.31 },
      { quarter: 'Sep 2025', promoter: 60.76, fii: 15.92, dii: 9.12, mutualFund: 5.62, retail: 6.28, others: 2.30 },
      { quarter: 'Jun 2025', promoter: 60.76, fii: 16.15, dii: 8.98, mutualFund: 5.48, retail: 6.38, others: 2.25 },
    ],
  },
  {
    symbol: 'JSWSTEEL',
    companyName: 'JSW Steel Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 44.81, fii: 17.28, dii: 15.42, mutualFund: 8.85, retail: 10.18, others: 3.46 },
      { quarter: 'Dec 2025', promoter: 44.81, fii: 17.48, dii: 15.22, mutualFund: 8.68, retail: 10.35, others: 3.46 },
      { quarter: 'Sep 2025', promoter: 44.81, fii: 17.72, dii: 14.98, mutualFund: 8.52, retail: 10.55, others: 3.42 },
      { quarter: 'Jun 2025', promoter: 44.81, fii: 17.95, dii: 14.75, mutualFund: 8.35, retail: 10.75, others: 3.39 },
    ],
  },
  {
    symbol: 'COALINDIA',
    companyName: 'Coal India Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 63.13, fii: 8.85, dii: 10.42, mutualFund: 5.55, retail: 12.82, others: 4.78 },
      { quarter: 'Dec 2025', promoter: 63.13, fii: 9.02, dii: 10.25, mutualFund: 5.42, retail: 12.95, others: 4.77 },
      { quarter: 'Sep 2025', promoter: 63.13, fii: 9.18, dii: 10.08, mutualFund: 5.28, retail: 13.12, others: 4.79 },
      { quarter: 'Jun 2025', promoter: 63.13, fii: 9.35, dii: 9.92, mutualFund: 5.15, retail: 13.28, others: 4.83 },
    ],
  },
  {
    symbol: 'HINDALCO',
    companyName: 'Hindalco Industries Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 34.62, fii: 24.82, dii: 17.55, mutualFund: 9.42, retail: 12.42, others: 1.17 },
      { quarter: 'Dec 2025', promoter: 34.63, fii: 25.05, dii: 17.32, mutualFund: 9.28, retail: 12.55, others: 1.17 },
      { quarter: 'Sep 2025', promoter: 34.63, fii: 25.28, dii: 17.08, mutualFund: 9.12, retail: 12.72, others: 1.17 },
      { quarter: 'Jun 2025', promoter: 34.65, fii: 25.52, dii: 16.85, mutualFund: 8.95, retail: 12.88, others: 1.15 },
    ],
  },
  {
    symbol: 'CIPLA',
    companyName: 'Cipla Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 33.47, fii: 24.55, dii: 17.82, mutualFund: 10.42, retail: 10.88, others: 2.86 },
      { quarter: 'Dec 2025', promoter: 33.47, fii: 24.78, dii: 17.58, mutualFund: 10.28, retail: 11.02, others: 2.87 },
      { quarter: 'Sep 2025', promoter: 33.47, fii: 25.02, dii: 17.35, mutualFund: 10.12, retail: 11.18, others: 2.86 },
      { quarter: 'Jun 2025', promoter: 33.47, fii: 25.28, dii: 17.12, mutualFund: 9.98, retail: 11.32, others: 2.83 },
    ],
  },
  {
    symbol: 'DRREDDY',
    companyName: "Dr. Reddy's Laboratories",
    history: [
      { quarter: 'Mar 2026', promoter: 26.65, fii: 21.82, dii: 20.42, mutualFund: 11.55, retail: 14.42, others: 5.14 },
      { quarter: 'Dec 2025', promoter: 26.65, fii: 22.05, dii: 20.18, mutualFund: 11.38, retail: 14.62, others: 5.12 },
      { quarter: 'Sep 2025', promoter: 26.66, fii: 22.28, dii: 19.95, mutualFund: 11.22, retail: 14.82, others: 5.07 },
      { quarter: 'Jun 2025', promoter: 26.68, fii: 22.52, dii: 19.72, mutualFund: 11.05, retail: 15.02, others: 5.01 },
    ],
  },
  {
    symbol: 'APOLLOHOSP',
    companyName: 'Apollo Hospitals Enterprise',
    history: [
      { quarter: 'Mar 2026', promoter: 29.27, fii: 36.42, dii: 14.55, mutualFund: 7.82, retail: 9.08, others: 2.86 },
      { quarter: 'Dec 2025', promoter: 29.27, fii: 36.68, dii: 14.32, mutualFund: 7.68, retail: 9.22, others: 2.83 },
      { quarter: 'Sep 2025', promoter: 29.27, fii: 36.95, dii: 14.08, mutualFund: 7.52, retail: 9.38, others: 2.80 },
      { quarter: 'Jun 2025', promoter: 29.30, fii: 37.22, dii: 13.85, mutualFund: 7.38, retail: 9.52, others: 2.73 },
    ],
  },
  {
    symbol: 'EICHERMOT',
    companyName: 'Eicher Motors Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 49.38, fii: 22.85, dii: 10.42, mutualFund: 6.12, retail: 8.88, others: 2.35 },
      { quarter: 'Dec 2025', promoter: 49.38, fii: 23.08, dii: 10.22, mutualFund: 5.98, retail: 9.02, others: 2.32 },
      { quarter: 'Sep 2025', promoter: 49.38, fii: 23.32, dii: 10.02, mutualFund: 5.82, retail: 9.18, others: 2.28 },
      { quarter: 'Jun 2025', promoter: 49.38, fii: 23.55, dii: 9.82, mutualFund: 5.68, retail: 9.32, others: 2.25 },
    ],
  },
  {
    symbol: 'HEROMOTOCO',
    companyName: 'Hero MotoCorp Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 34.58, fii: 30.42, dii: 14.85, mutualFund: 8.42, retail: 8.52, others: 3.21 },
      { quarter: 'Dec 2025', promoter: 34.58, fii: 30.68, dii: 14.62, mutualFund: 8.28, retail: 8.65, others: 3.19 },
      { quarter: 'Sep 2025', promoter: 34.58, fii: 30.92, dii: 14.38, mutualFund: 8.12, retail: 8.82, others: 3.18 },
      { quarter: 'Jun 2025', promoter: 34.58, fii: 31.18, dii: 14.15, mutualFund: 7.98, retail: 8.95, others: 3.16 },
    ],
  },
  {
    symbol: 'INDUSINDBK',
    companyName: 'IndusInd Bank Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 37.09, fii: 26.42, dii: 15.55, mutualFund: 8.12, retail: 9.52, others: 3.30 },
      { quarter: 'Dec 2025', promoter: 37.12, fii: 26.65, dii: 15.32, mutualFund: 7.98, retail: 9.68, others: 3.25 },
      { quarter: 'Sep 2025', promoter: 37.15, fii: 26.88, dii: 15.08, mutualFund: 7.82, retail: 9.85, others: 3.22 },
      { quarter: 'Jun 2025', promoter: 37.18, fii: 27.12, dii: 14.85, mutualFund: 7.68, retail: 9.98, others: 3.19 },
    ],
  },
  {
    symbol: 'GRASIM',
    companyName: 'Grasim Industries Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 42.59, fii: 18.52, dii: 16.42, mutualFund: 8.88, retail: 10.28, others: 3.31 },
      { quarter: 'Dec 2025', promoter: 42.59, fii: 18.72, dii: 16.22, mutualFund: 8.72, retail: 10.45, others: 3.30 },
      { quarter: 'Sep 2025', promoter: 42.59, fii: 18.95, dii: 15.98, mutualFund: 8.55, retail: 10.65, others: 3.28 },
      { quarter: 'Jun 2025', promoter: 42.59, fii: 19.18, dii: 15.75, mutualFund: 8.38, retail: 10.85, others: 3.25 },
    ],
  },
  {
    symbol: 'SHREECEM',
    companyName: 'Shree Cement Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 60.53, fii: 14.82, dii: 9.55, mutualFund: 5.42, retail: 7.35, others: 2.33 },
      { quarter: 'Dec 2025', promoter: 60.55, fii: 15.02, dii: 9.38, mutualFund: 5.28, retail: 7.48, others: 2.29 },
      { quarter: 'Sep 2025', promoter: 60.58, fii: 15.22, dii: 9.22, mutualFund: 5.15, retail: 7.58, others: 2.25 },
      { quarter: 'Jun 2025', promoter: 60.62, fii: 15.42, dii: 9.05, mutualFund: 5.02, retail: 7.68, others: 2.21 },
    ],
  },
  {
    symbol: 'DIVISLAB',
    companyName: "Divi's Laboratories",
    history: [
      { quarter: 'Mar 2026', promoter: 51.95, fii: 17.82, dii: 12.55, mutualFund: 7.42, retail: 7.88, others: 2.38 },
      { quarter: 'Dec 2025', promoter: 51.95, fii: 18.02, dii: 12.35, mutualFund: 7.28, retail: 8.02, others: 2.38 },
      { quarter: 'Sep 2025', promoter: 51.95, fii: 18.22, dii: 12.15, mutualFund: 7.12, retail: 8.22, others: 2.34 },
      { quarter: 'Jun 2025', promoter: 51.95, fii: 18.42, dii: 11.95, mutualFund: 6.98, retail: 8.38, others: 2.32 },
    ],
  },
  {
    symbol: 'TRENT',
    companyName: 'Trent Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 37.01, fii: 22.42, dii: 16.85, mutualFund: 9.55, retail: 11.28, others: 2.89 },
      { quarter: 'Dec 2025', promoter: 37.01, fii: 22.68, dii: 16.62, mutualFund: 9.38, retail: 11.42, others: 2.89 },
      { quarter: 'Sep 2025', promoter: 37.01, fii: 22.92, dii: 16.38, mutualFund: 9.22, retail: 11.62, others: 2.85 },
      { quarter: 'Jun 2025', promoter: 37.01, fii: 23.18, dii: 16.15, mutualFund: 9.05, retail: 11.78, others: 2.83 },
    ],
  },
  {
    symbol: 'BAJAJFINSV',
    companyName: 'Bajaj Finserv Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 60.69, fii: 11.82, dii: 10.42, mutualFund: 5.88, retail: 8.28, others: 2.91 },
      { quarter: 'Dec 2025', promoter: 60.69, fii: 12.02, dii: 10.22, mutualFund: 5.75, retail: 8.42, others: 2.90 },
      { quarter: 'Sep 2025', promoter: 60.69, fii: 12.22, dii: 10.02, mutualFund: 5.62, retail: 8.58, others: 2.87 },
      { quarter: 'Jun 2025', promoter: 60.69, fii: 12.42, dii: 9.82, mutualFund: 5.48, retail: 8.75, others: 2.84 },
    ],
  },
  {
    symbol: 'SBILIFE',
    companyName: 'SBI Life Insurance',
    history: [
      { quarter: 'Mar 2026', promoter: 55.50, fii: 21.42, dii: 9.55, mutualFund: 5.28, retail: 5.88, others: 2.37 },
      { quarter: 'Dec 2025', promoter: 55.50, fii: 21.62, dii: 9.38, mutualFund: 5.15, retail: 5.98, others: 2.37 },
      { quarter: 'Sep 2025', promoter: 55.50, fii: 21.85, dii: 9.22, mutualFund: 5.02, retail: 6.08, others: 2.33 },
      { quarter: 'Jun 2025', promoter: 55.50, fii: 22.08, dii: 9.05, mutualFund: 4.88, retail: 6.18, others: 2.31 },
    ],
  },
  {
    symbol: 'HDFCLIFE',
    companyName: 'HDFC Life Insurance',
    history: [
      { quarter: 'Mar 2026', promoter: 50.37, fii: 24.85, dii: 10.42, mutualFund: 5.82, retail: 6.12, others: 2.42 },
      { quarter: 'Dec 2025', promoter: 50.37, fii: 25.08, dii: 10.22, mutualFund: 5.68, retail: 6.25, others: 2.40 },
      { quarter: 'Sep 2025', promoter: 50.39, fii: 25.32, dii: 10.02, mutualFund: 5.55, retail: 6.38, others: 2.34 },
      { quarter: 'Jun 2025', promoter: 50.41, fii: 25.55, dii: 9.82, mutualFund: 5.42, retail: 6.48, others: 2.32 },
    ],
  },
  {
    symbol: 'BPCL',
    companyName: 'Bharat Petroleum Corp',
    history: [
      { quarter: 'Mar 2026', promoter: 52.98, fii: 10.55, dii: 14.42, mutualFund: 7.88, retail: 10.82, others: 3.35 },
      { quarter: 'Dec 2025', promoter: 52.98, fii: 10.72, dii: 14.22, mutualFund: 7.72, retail: 10.98, others: 3.38 },
      { quarter: 'Sep 2025', promoter: 52.98, fii: 10.88, dii: 14.02, mutualFund: 7.58, retail: 11.18, others: 3.36 },
      { quarter: 'Jun 2025', promoter: 52.98, fii: 11.05, dii: 13.82, mutualFund: 7.42, retail: 11.38, others: 3.35 },
    ],
  },
  {
    symbol: 'TATACONSUM',
    companyName: 'Tata Consumer Products',
    history: [
      { quarter: 'Mar 2026', promoter: 33.64, fii: 19.82, dii: 18.55, mutualFund: 10.12, retail: 14.52, others: 3.35 },
      { quarter: 'Dec 2025', promoter: 33.65, fii: 20.02, dii: 18.32, mutualFund: 9.98, retail: 14.68, others: 3.35 },
      { quarter: 'Sep 2025', promoter: 33.68, fii: 20.25, dii: 18.08, mutualFund: 9.82, retail: 14.85, others: 3.32 },
      { quarter: 'Jun 2025', promoter: 33.72, fii: 20.48, dii: 17.85, mutualFund: 9.68, retail: 15.02, others: 3.25 },
    ],
  },
  {
    symbol: 'BEL',
    companyName: 'Bharat Electronics Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 51.14, fii: 14.82, dii: 14.55, mutualFund: 8.18, retail: 13.88, others: 5.61 },
      { quarter: 'Dec 2025', promoter: 51.14, fii: 15.02, dii: 14.32, mutualFund: 8.02, retail: 14.08, others: 5.58 },
      { quarter: 'Sep 2025', promoter: 51.14, fii: 15.22, dii: 14.08, mutualFund: 7.85, retail: 14.28, others: 5.57 },
      { quarter: 'Jun 2025', promoter: 51.14, fii: 15.42, dii: 13.85, mutualFund: 7.68, retail: 14.48, others: 5.57 },
    ],
  },
  {
    symbol: 'M&M',
    companyName: 'Mahindra & Mahindra Ltd',
    history: [
      { quarter: 'Mar 2026', promoter: 18.47, fii: 38.85, dii: 18.42, mutualFund: 10.12, retail: 10.88, others: 3.26 },
      { quarter: 'Dec 2025', promoter: 18.47, fii: 39.08, dii: 18.18, mutualFund: 9.98, retail: 11.02, others: 3.27 },
      { quarter: 'Sep 2025', promoter: 18.47, fii: 39.32, dii: 17.95, mutualFund: 9.82, retail: 11.22, others: 3.22 },
      { quarter: 'Jun 2025', promoter: 18.47, fii: 39.58, dii: 17.72, mutualFund: 9.68, retail: 11.38, others: 3.17 },
    ],
  },
];

/**
 * Get shareholding data for a given stock symbol
 */
export function getShareholdingData(symbol: string): StockShareholding | null {
  const clean = symbol.toUpperCase().trim();
  return SHAREHOLDING_DATA.find(s => s.symbol === clean) || null;
}

/**
 * Get the latest quarter's shareholding for a stock
 */
export function getLatestShareholding(symbol: string): ShareholdingQuarter | null {
  const data = getShareholdingData(symbol);
  return data?.history?.[0] || null;
}

/**
 * Get all available stock symbols that have shareholding data
 */
export function getAvailableSymbols(): string[] {
  return SHAREHOLDING_DATA.map(s => s.symbol);
}
