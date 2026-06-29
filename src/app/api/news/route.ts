// API Route: Fetch, analyze news, and persist to Supabase
import { NextResponse } from 'next/server';
import { fetchAllNews } from '@/lib/newsAggregator';
import { analyzeArticlesBatch, computeSectorSentiments } from '@/lib/sentimentEngine';
import { SECTORS } from '@/lib/sectorData';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Stale-While-Revalidate Cache Strategy
// Serve cached data instantly (even if stale), refresh in background if older than FRESH_DURATION.
// Data older than MAX_STALE_DURATION is discarded entirely.
let cachedData: { articles: any[]; sectorSentiments: any; timestamp: number } | null = null;
let isRevalidating = false; // Prevent concurrent background refreshes
const FRESH_DURATION = 10 * 60 * 1000;     // 10 minutes — data considered "fresh"
const MAX_STALE_DURATION = 30 * 60 * 1000; // 30 minutes — serve stale up to this limit

// Save analyzed articles to Supabase in a single batch
async function saveArticlesToDB(articles: any[]) {
  if (!articles || articles.length === 0) return;
  const db = getServiceClient();
  
  try {
    const urls = articles.map(a => a.url);
    // Fetch existing articles by URL in one batch query
    const { data: existing } = await db
      .from('articles')
      .select('url')
      .in('url', urls);

    const existingUrls = new Set((existing || []).map(e => e.url));
    const toInsert = articles
      .filter(a => !existingUrls.has(a.url))
      .map(article => ({
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
      }));

    if (toInsert.length > 0) {
      const { error } = await db.from('articles').insert(toInsert);
      if (error) console.warn('[DB] Batch articles insert error:', error.message);
    }
  } catch (err) {
    console.warn('[DB] Article batch save skipped:', (err as Error).message);
  }
}

// Save daily sector sentiment snapshots in a single upsert
async function saveSectorSnapshots(sectorSentiments: Record<string, any>) {
  const db = getServiceClient();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const toUpsert = Object.entries(sectorSentiments).map(([sectorId, data]) => ({
    sector_id: sectorId,
    date: today,
    score: data.sentiment ?? 50,
    article_count: data.articleCount ?? 0,
    key_driver: data.keyDriver || '',
  }));

  if (toUpsert.length === 0) return;

  try {
    const { error } = await db.from('sector_sentiment_history').upsert(toUpsert, {
      onConflict: 'sector_id,date',
    });
    if (error) console.warn('[DB] Sector snapshot upsert error:', error.message);
  } catch (err) {
    console.warn('[DB] Sector snapshot skipped:', (err as Error).message);
  }
}

// Save per-stock sentiment snapshots in a single upsert
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

  const toUpsert = Object.entries(stockScores).map(([symbol, data]) => {
    const avgSentiment = data.weight > 0 ? data.total / data.weight : 0;
    const score = Math.round(Math.max(0, Math.min(100, (avgSentiment + 1) * 50)));
    return {
      symbol,
      date: today,
      sentiment: score,
      article_count: data.count,
    };
  });

  if (toUpsert.length === 0) return;

  try {
    const { error } = await db.from('stock_sentiment_history').upsert(toUpsert, {
      onConflict: 'symbol,date',
    });
    if (error) console.warn('[DB] Stock snapshot upsert error:', error.message);
  } catch (err) {
    console.warn('[DB] Stock snapshot skipped:', (err as Error).message);
  }
}

// Core data refresh logic — extracted so it can run in the foreground or background
async function refreshNewsCache(): Promise<{ articles: any[]; sectorSentiments: Record<string, any> }> {
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

  // Update cache
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

  return { articles: analyzedArticles, sectorSentiments: fullSectorSentiments };
}

export async function GET() {
  try {
    const now = Date.now();
    const cacheAge = cachedData ? now - cachedData.timestamp : Infinity;

    // CASE 1: Fresh cache — return immediately
    if (cachedData && cacheAge < FRESH_DURATION) {
      return NextResponse.json({
        articles: cachedData.articles,
        sectorSentiments: cachedData.sectorSentiments,
        cached: true,
        lastUpdated: new Date(cachedData.timestamp).toISOString(),
      });
    }

    // CASE 2: Stale cache (10-30 min old) — return stale data instantly, refresh in background
    if (cachedData && cacheAge < MAX_STALE_DURATION) {
      // Kick off background refresh (only if not already running)
      if (!isRevalidating) {
        isRevalidating = true;
        refreshNewsCache()
          .catch(err => console.error('[News API] Background revalidation failed:', err))
          .finally(() => { isRevalidating = false; });
      }

      return NextResponse.json({
        articles: cachedData.articles,
        sectorSentiments: cachedData.sectorSentiments,
        cached: true,
        stale: true,
        lastUpdated: new Date(cachedData.timestamp).toISOString(),
      });
    }

    // CASE 3: No cache or expired (>30 min) — must wait for fresh data
    const { articles, sectorSentiments } = await refreshNewsCache();

    return NextResponse.json({
      articles,
      sectorSentiments,
      cached: false,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[News API] Error:', error);

    // If we have any cached data at all, return it as fallback
    if (cachedData) {
      return NextResponse.json({
        articles: cachedData.articles,
        sectorSentiments: cachedData.sectorSentiments,
        cached: true,
        stale: true,
        fallback: true,
        lastUpdated: new Date(cachedData.timestamp).toISOString(),
      });
    }

    return NextResponse.json(
      { error: 'Failed to fetch and analyze news', details: error.message },
      { status: 500 }
    );
  }
}

