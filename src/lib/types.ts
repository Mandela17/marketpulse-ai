// TypeScript types for MarketPulse AI

export interface SectorData {
  id: string;
  name: string;
  icon: string;
  sentiment: number; // 0-100
  trend: 'up' | 'down' | 'flat';
  trendStrength: number; // 1-3
  keyDriver: string;
  change24h: number; // sentiment change in last 24h
  stocks: string[];
  globalExposure: string; // what global events affect this sector
}

export interface StockData {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  sentiment: number;
  trend: 'up' | 'down' | 'flat';
  sentimentBreakdown: {
    news: number;
    social: number;
    geopolitical: number;
    technical: number;
  };
  nearTermOutlook: {
    day1: 'bullish' | 'bearish' | 'neutral';
    week1: 'bullish' | 'bearish' | 'neutral';
    month1: 'bullish' | 'bearish' | 'neutral';
  };
  riskFactors: string[];
}

export interface AspectSentiment {
  entity: string;
  aspect: 'Demand/Sales' | 'Margins/Profit' | 'Regulatory/Legal' | 'Macro/Global' | 'Technical/Chart' | 'General';
  sentiment: number; // -1 to 1
}

export interface NewsArticle {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string;
  sentiment: number; // -1 to 1
  sentimentLabel: 'positive' | 'negative' | 'neutral';
  relatedSectors: string[];
  relatedStocks: string[];
  category: 'financial' | 'geopolitical' | 'policy' | 'earnings' | 'global';
  impactLevel: 'high' | 'medium' | 'low';
  weight?: number;
  decayedWeight?: number;
  aspects?: AspectSentiment[];
}

export interface GeopoliticalEvent {
  id: string;
  region: string;
  title: string;
  severity: 'calm' | 'watch' | 'hot';
  impactedSectors: string[];
  lat: number;
  lng: number;
  description: string;
  date: string;
}

export interface MarketOverview {
  overallSentiment: number;
  marketStatus: 'open' | 'closed' | 'pre-market';
  nifty50: { value: number; change: number; changePercent: number };
  sensex: { value: number; change: number; changePercent: number };
  topGainers: StockData[];
  topLosers: StockData[];
  biggestSentimentMovers: { stock: StockData; sentimentChange: number }[];
}

export type SentimentLevel = 'very-bearish' | 'bearish' | 'neutral' | 'bullish' | 'very-bullish';

export function getSentimentLevel(score: number): SentimentLevel {
  if (score <= 20) return 'very-bearish';
  if (score <= 40) return 'bearish';
  if (score <= 60) return 'neutral';
  if (score <= 80) return 'bullish';
  return 'very-bullish';
}

export function getSentimentLabel(score: number): string {
  if (score <= 20) return 'Very Bearish';
  if (score <= 40) return 'Bearish';
  if (score <= 60) return 'Neutral';
  if (score <= 80) return 'Bullish';
  return 'Very Bullish';
}

export function getSentimentColor(score: number): string {
  if (score <= 20) return '#ff4d6a';
  if (score <= 40) return '#ff8c42';
  if (score <= 60) return '#ffc554';
  if (score <= 80) return '#00d68f';
  return '#00e6a0';
}
