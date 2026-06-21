// API Route: Fetch and analyze news with real-time sentiment
import { NextResponse } from 'next/server';
import { fetchAllNews } from '@/lib/newsAggregator';
import { analyzeArticlesBatch, computeSectorSentiments } from '@/lib/sentimentEngine';
import { SECTORS } from '@/lib/sectorData';

// Cache results for 10 minutes to avoid excessive API calls
let cachedData: { articles: any[]; sectorSentiments: any; timestamp: number } | null = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export async function GET() {
  try {
    // Return cached data if still fresh
    if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        articles: cachedData.articles,
        sectorSentiments: cachedData.sectorSentiments,
        cached: true,
        lastUpdated: new Date(cachedData.timestamp).toISOString(),
      });
    }

    // 1. Fetch raw news from RSS feeds
    console.log('[News API] Fetching news from RSS feeds...');
    const rawArticles = await fetchAllNews();
    console.log(`[News API] Fetched ${rawArticles.length} articles`);

    // 2. Analyze sentiment using Gemini
    console.log('[News API] Analyzing sentiment with Gemini...');
    const analyzedArticles = await analyzeArticlesBatch(rawArticles);
    console.log(`[News API] Analyzed ${analyzedArticles.length} articles`);

    // 3. Compute sector-level sentiments
    const sectorSentiments = computeSectorSentiments(analyzedArticles);

    // Build full sector data with defaults for sectors with no news
    const fullSectorSentiments: Record<string, any> = {};
    for (const [id, sector] of Object.entries(SECTORS)) {
      const computed = sectorSentiments[id];
      fullSectorSentiments[id] = {
        id,
        name: sector.name,
        icon: sector.icon || '📊',
        sentiment: computed?.score ?? 50,
        trend: computed ? (computed.score > 55 ? 'up' : computed.score < 45 ? 'down' : 'flat') : 'flat',
        trendStrength: computed ? (Math.abs(computed.score - 50) > 25 ? 3 : Math.abs(computed.score - 50) > 15 ? 2 : 1) : 1,
        keyDriver: computed?.keyDriver || sector.globalExposure,
        change24h: computed ? parseFloat(((computed.score - 50) * 0.3).toFixed(1)) : 0,
        stocks: sector.stocks.slice(0, 5),
        globalExposure: sector.globalExposure,
        articleCount: computed?.articleCount || 0,
      };
    }

    // Cache the results
    cachedData = {
      articles: analyzedArticles,
      sectorSentiments: fullSectorSentiments,
      timestamp: Date.now(),
    };

    return NextResponse.json({
      articles: analyzedArticles,
      sectorSentiments: fullSectorSentiments,
      cached: false,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[News API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch and analyze news', details: error.message },
      { status: 500 }
    );
  }
}
