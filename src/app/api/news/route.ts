// API Route: Fetch, analyze news, and persist to Supabase
import { NextResponse } from 'next/server';
import { fetchAllNews } from '@/lib/newsAggregator';
import { analyzeArticlesBatch, computeSectorSentiments } from '@/lib/sentimentEngine';
import { SECTORS } from '@/lib/sectorData';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Cache results for 10 minutes to avoid excessive API calls
let cachedData: { articles: any[]; sectorSentiments: any; timestamp: number } | null = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Save analyzed articles to Supabase
async function saveArticlesToDB(articles: any[]) {
  const db = getServiceClient();
  
  for (const article of articles) {
    try {
      // Check if article already exists by URL
      const { data: existing } = await db
        .from('articles')
        .select('id')
        .eq('url', article.url)
        .limit(1);

      if (existing && existing.length > 0) continue; // Skip duplicates

      await db.from('articles').insert({
        title: article.title,
        source: article.source,
        url: article.url,
        published_at: article.publishedAt,
        summary: article.summary,
        sentiment: article.sentiment,
        label: article.sentimentLabel,
        category: article.category,
        impact_level: article.impactLevel,
        weight: article.weight || 1.0,
        decayed_weight: article.decayedWeight || 1.0,
        related_sectors: article.relatedSectors || [],
        related_stocks: article.relatedStocks || [],
        aspects: article.aspects || [],
      });
    } catch (err) {
      // Silently skip errors — don't block the API response
      console.warn('[DB] Article save skipped:', (err as Error).message);
    }
  }
}

// Save daily sector sentiment snapshots
async function saveSectorSnapshots(sectorSentiments: Record<string, any>) {
  const db = getServiceClient();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  for (const [sectorId, data] of Object.entries(sectorSentiments)) {
    try {
      await db.from('sector_sentiment_history').upsert({
        sector_id: sectorId,
        date: today,
        score: data.sentiment ?? 50,
        article_count: data.articleCount ?? 0,
        key_driver: data.keyDriver || '',
      }, {
        onConflict: 'sector_id,date',
      });
    } catch (err) {
      console.warn('[DB] Sector snapshot skipped:', (err as Error).message);
    }
  }
}

// Save per-stock sentiment snapshots
async function saveStockSnapshots(articles: any[]) {
  const db = getServiceClient();
  const today = new Date().toISOString().split('T')[0];

  // Aggregate sentiment per stock
  const stockScores: Record<string, { total: number; weight: number; count: number }> = {};

  for (const article of articles) {
    for (const stock of (article.relatedStocks || [])) {
      if (!stockScores[stock]) {
        stockScores[stock] = { total: 0, weight: 0, count: 0 };
      }
      const w = article.decayedWeight ?? article.weight ?? 1.0;
      stockScores[stock].total += article.sentiment * w;
      stockScores[stock].weight += w;
      stockScores[stock].count += 1;
    }
  }

  for (const [symbol, data] of Object.entries(stockScores)) {
    const avgSentiment = data.weight > 0 ? data.total / data.weight : 0;
    const score = Math.round(Math.max(0, Math.min(100, (avgSentiment + 1) * 50)));

    try {
      await db.from('stock_sentiment_history').upsert({
        symbol,
        date: today,
        sentiment: score,
        article_count: data.count,
      }, {
        onConflict: 'symbol,date',
      });
    } catch (err) {
      console.warn('[DB] Stock snapshot skipped:', (err as Error).message);
    }
  }
}

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

    // 4. Persist to Supabase (fire-and-forget — don't block response)
    Promise.all([
      saveArticlesToDB(analyzedArticles),
      saveSectorSnapshots(fullSectorSentiments),
      saveStockSnapshots(analyzedArticles),
    ]).then(() => {
      console.log('[News API] ✅ Data persisted to Supabase');
    }).catch((err) => {
      console.error('[News API] ⚠️ Supabase persistence error:', err);
    });

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
