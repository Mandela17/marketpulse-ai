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

// Core data refresh logic — optimized to query Supabase first and only analyze new articles
async function refreshNewsCache(): Promise<{ articles: any[]; sectorSentiments: Record<string, any> }> {
  try {
    // 1. Fetch raw news from RSS feeds
    console.log('[News API] Fetching news from RSS feeds...');
    const rawArticles = await fetchAllNews();
    console.log(`[News API] Fetched ${rawArticles.length} raw articles`);

    if (rawArticles.length === 0) {
      return { articles: [], sectorSentiments: {} };
    }

    const db = getServiceClient();
    const urls = rawArticles.map(a => a.link);

    // 2. Query Supabase for articles already analyzed
    const { data: existing, error: fetchErr } = await db
      .from('articles')
      .select('*')
      .in('url', urls);

    if (fetchErr) {
      console.warn('[News API] DB query for existing articles failed:', fetchErr.message);
    }

    // Map existing DB rows to NewsArticle format
    const existingMap = new Map<string, any>();
    if (existing) {
      for (const row of existing) {
        existingMap.set(row.url, {
          id: `db-${row.id}`,
          title: row.title,
          source: row.source,
          url: row.url,
          publishedAt: row.published_at,
          summary: row.summary,
          sentiment: row.sentiment,
          sentimentLabel: row.label,
          relatedSectors: row.related_sectors || [],
          relatedStocks: row.related_stocks || [],
          category: row.category,
          impactLevel: row.impact_level,
          weight: row.weight || 1.0,
          decayedWeight: row.decayed_weight || 1.0,
          aspects: row.aspects || [],
        });
      }
    }

    // Filter raw articles into new vs already analyzed
    const toAnalyze = rawArticles.filter(a => !existingMap.has(a.link));
    console.log(`[News API] Delta analysis: ${existingMap.size} cached in DB, ${toAnalyze.length} new to analyze`);

    // 3. Analyze only the NEW articles using Gemini
    let newlyAnalyzed: any[] = [];
    if (toAnalyze.length > 0) {
      console.log(`[News API] Calling Gemini for ${toAnalyze.length} new articles...`);
      newlyAnalyzed = await analyzeArticlesBatch(toAnalyze);
      console.log(`[News API] Gemini analyzed ${newlyAnalyzed.length} articles`);
    }

    // Merge existing and new
    const mergedArticles: any[] = [];
    for (const raw of rawArticles) {
      const cached = existingMap.get(raw.link);
      if (cached) {
        mergedArticles.push(cached);
      } else {
        const newly = newlyAnalyzed.find(n => n.url === raw.link);
        if (newly) {
          mergedArticles.push(newly);
        } else {
          // Fallback if missing
          mergedArticles.push({
            id: `fb-${Date.now()}-${Math.random()}`,
            title: raw.title,
            source: raw.source,
            url: raw.link,
            publishedAt: raw.pubDate || new Date().toISOString(),
            summary: raw.description?.substring(0, 200) || '',
            sentiment: 0,
            sentimentLabel: 'neutral',
            relatedSectors: [],
            relatedStocks: [],
            category: 'global',
            impactLevel: 'low',
            weight: 1.0,
            decayedWeight: 1.0,
            aspects: [],
          });
        }
      }
    }

    // 4. Compute sector-level sentiments
    const sectorSentiments = computeSectorSentiments(mergedArticles);

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

    // Update cache in-memory
    cachedData = {
      articles: mergedArticles,
      sectorSentiments: fullSectorSentiments,
      timestamp: Date.now(),
    };

    // 5. Persist NEW articles to Supabase (fire-and-forget — don't block response)
    if (newlyAnalyzed.length > 0) {
      Promise.all([
        saveArticlesToDB(newlyAnalyzed),
        saveSectorSnapshots(fullSectorSentiments),
        saveStockSnapshots(mergedArticles), // Re-aggregate stock snapshots with new data
      ]).then(() => {
        console.log('[News API] ✅ New data persisted to Supabase');
      }).catch((err) => {
        console.error('[News API] ⚠️ Supabase persistence error:', err);
      });
    } else {
      // Just update sector/stock snapshots
      Promise.all([
        saveSectorSnapshots(fullSectorSentiments),
        saveStockSnapshots(mergedArticles),
      ]).catch((err) => {
        console.error('[News API] ⚠️ Supabase snapshot update error:', err);
      });
    }

    return { articles: mergedArticles, sectorSentiments: fullSectorSentiments };
  } catch (err: any) {
    console.error('[News API] refreshNewsCache error:', err);
    throw err;
  }
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

