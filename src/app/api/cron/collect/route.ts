// Cron Job API Route: Automated data collection
// This route is triggered by Vercel Cron or any external scheduler.
// It runs the full pipeline: fetch news → analyze sentiment → save to Supabase
//
// Schedule: Every 30 minutes during Indian market hours (9 AM - 4 PM IST)
// plus once at 8 AM and 6 PM for pre/post-market analysis

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { fetchAllNews } from '@/lib/newsAggregator';
import { analyzeArticlesBatch, computeSectorSentiments } from '@/lib/sentimentEngine';
import { SECTORS } from '@/lib/sectorData';
import { getServiceClient } from '@/lib/supabase';
import type { NewsArticle } from '@/lib/types';

// Authenticate cron requests (Vercel sends this header automatically)
function isAuthorized(request: Request): boolean {
  // In development, allow all requests
  if (process.env.NODE_ENV === 'development') return true;
  
  // Vercel Cron sends this header with the CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) {
    console.warn('[Cron] No CRON_SECRET set, allowing request');
    return true;
  }
  
  return authHeader === `Bearer ${cronSecret}`;
}

// Save articles to DB (same as in /api/news but extracted for reuse)
async function persistArticles(articles: NewsArticle[]) {
  const db = getServiceClient();
  let saved = 0;
  
  for (const article of articles) {
    try {
      const { data: existing } = await db
        .from('articles')
        .select('id')
        .eq('url', article.url)
        .limit(1);
      
      if (existing && existing.length > 0) continue;
      
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
      saved++;
    } catch (err) {
      console.warn('[Cron] Article save error:', (err as Error).message);
    }
  }
  
  return saved;
}

// Save sector sentiment snapshots
async function persistSectorSentiments(sectorSentiments: Record<string, any>) {
  const db = getServiceClient();
  const today = new Date().toISOString().split('T')[0];
  let saved = 0;
  
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
      saved++;
    } catch (err) {
      console.warn('[Cron] Sector save error:', (err as Error).message);
    }
  }
  
  return saved;
}

// Save per-stock sentiment snapshots
async function persistStockSentiments(articles: NewsArticle[]) {
  const db = getServiceClient();
  const today = new Date().toISOString().split('T')[0];
  
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
  
  let saved = 0;
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
      saved++;
    } catch (err) {
      console.warn('[Cron] Stock save error:', (err as Error).message);
    }
  }
  
  return saved;
}

export async function GET(request: Request) {
  const startTime = Date.now();
  
  // Auth check
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    console.log('[Cron] ⏰ Starting scheduled data collection...');
    
    // Step 1: Fetch raw news
    const rawArticles = await fetchAllNews();
    console.log(`[Cron] 📰 Fetched ${rawArticles.length} raw articles`);
    
    // Step 2: Analyze sentiment with Gemini
    const analyzedArticles = await analyzeArticlesBatch(rawArticles);
    console.log(`[Cron] 🧠 Analyzed ${analyzedArticles.length} articles`);
    
    // Step 3: Compute sector sentiments
    const sectorSentiments = computeSectorSentiments(analyzedArticles);
    
    const fullSectorSentiments: Record<string, any> = {};
    for (const [id, sector] of Object.entries(SECTORS)) {
      const computed = sectorSentiments[id];
      fullSectorSentiments[id] = {
        id,
        name: sector.name,
        sentiment: computed?.score ?? 50,
        articleCount: computed?.articleCount || 0,
        keyDriver: computed?.keyDriver || '',
      };
    }
    
    // Step 4: Persist everything to Supabase
    const [articlesSaved, sectorsSaved, stocksSaved] = await Promise.all([
      persistArticles(analyzedArticles),
      persistSectorSentiments(fullSectorSentiments),
      persistStockSentiments(analyzedArticles),
    ]);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}s`,
      stats: {
        articlesFetched: rawArticles.length,
        articlesAnalyzed: analyzedArticles.length,
        articlesSaved,
        sectorsSaved,
        stocksSaved,
      },
    };
    
    console.log(`[Cron] ✅ Complete in ${duration}s — ${articlesSaved} articles, ${sectorsSaved} sectors, ${stocksSaved} stocks saved`);
    
    return NextResponse.json(result);
  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[Cron] ❌ Failed after ${duration}s:`, error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        duration: `${duration}s`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
