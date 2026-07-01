// Cron Job API Route: Automated data collection & prediction pipeline
// Triggered by Vercel Cron or any external scheduler.
// Full pipeline: fetch news → analyze sentiment → collect features → generate predictions → resolve old predictions → save to Supabase
//
// Schedule: Daily at 3:00 AM UTC (8:30 AM IST — pre-market)
// For more frequent collection, call this endpoint manually or add additional cron entries.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { fetchAllNews } from '@/lib/newsAggregator';
import { analyzeArticlesBatch, computeSectorSentiments } from '@/lib/sentimentEngine';
import { SECTORS } from '@/lib/sectorData';
import { getServiceClient } from '@/lib/supabase';
import type { NewsArticle } from '@/lib/types';
import { fetchFIIDIIFlows, saveFIIDIIFlows } from '@/lib/fiiDiiData';
import { fetchIndiaVIX, saveDailyFeatures, getHistoricalFeatures } from '@/lib/nseData';
import { fetchHistoricalOHLCV, computeRealTechnicals } from '@/lib/technicalAnalysis';
import { fetchNifty50 } from '@/lib/stockData';
import { resolveUnresolvedPredictions } from '@/lib/predictionHistory';
import { trainAndSaveModel } from '@/lib/mlEngine';

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

// Save articles to DB
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

// ─── NEW: Collect daily features for key stocks ──────────────────────

const KEY_STOCKS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK',
  'AXISBANK', 'HINDUNILVR', 'ITC', 'BAJFINANCE', 'BHARTIARTL', 'LT',
  'MARUTI', 'TATAMOTORS', 'SUNPHARMA', 'WIPRO', 'HCLTECH', 'NTPC', 'ONGC',
  'POWERGRID', 'TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'TITAN', 'ADANIENT',
  'DRREDDY', 'CIPLA', 'DIVISLAB', 'BPCL', 'M&M', 'BAJAJ-AUTO', 'HAL',
  'BEL', 'TATAPOWER', 'COALINDIA', 'DLF', 'TECHM', 'NESTLEIND',
];

async function collectDailyFeatures(
  stockSentiments: Record<string, number>,
  niftyClose: number,
  vixValue: number | null,
  fiiNet: number,
  diiNet: number,
): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  let saved = 0;

  // Process in small batches to avoid overwhelming Yahoo Finance
  for (let i = 0; i < KEY_STOCKS.length; i += 5) {
    const batch = KEY_STOCKS.slice(i, i + 5);

    const promises = batch.map(async (symbol) => {
      try {
        const technicals = await computeRealTechnicals(symbol);
        if (!technicals || technicals.currentPrice === 0) return;

        await saveDailyFeatures({
          symbol,
          date: today,
          close: technicals.currentPrice,
          open: technicals.dayLow, // Simplified — use day low as proxy
          high: technicals.dayHigh,
          low: technicals.dayLow,
          volume: technicals.volumeToday,
          rsi: technicals.rsi,
          macdHist: technicals.histogram,
          ema20: technicals.ema20,
          ema50: technicals.ema50,
          bollingerUpper: technicals.bollingerUpper,
          bollingerLower: technicals.bollingerLower,
          volumeRatio: technicals.volumeRatio,
          sentimentScore: stockSentiments[symbol] ?? 50,
          articleCount: 0,
          niftyClose,
          indiaVix: vixValue ?? undefined,
          fiiNet,
          diiNet,
        });

        saved++;
      } catch (err) {
        console.warn(`[Cron] Daily features error for ${symbol}:`, (err as Error).message);
      }
    });

    await Promise.all(promises);

    // Small delay between batches
    if (i + 5 < KEY_STOCKS.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return saved;
}

// ─── NEW: Resolve yesterday's predictions ────────────────────────────

async function resolvePredictions(): Promise<{ resolved: number; correct: number }> {
  try {
    // Fetch closing prices for key stocks
    const closingPrices: Record<string, { todayClose: number; prevClose: number }> = {};

    for (let i = 0; i < KEY_STOCKS.length; i += 5) {
      const batch = KEY_STOCKS.slice(i, i + 5);
      const promises = batch.map(async (symbol) => {
        try {
          const ohlcv = await fetchHistoricalOHLCV(symbol, 5);
          if (ohlcv.length >= 2) {
            closingPrices[symbol] = {
              todayClose: ohlcv[ohlcv.length - 1].close,
              prevClose: ohlcv[ohlcv.length - 2].close,
            };
          }
        } catch {}
      });
      await Promise.all(promises);
      if (i + 5 < KEY_STOCKS.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    return await resolveUnresolvedPredictions(closingPrices);
  } catch (err) {
    console.warn('[Cron] Prediction resolution error:', err);
    return { resolved: 0, correct: 0 };
  }
}

// ─── Main Cron Handler ──────────────────────────────────────────────

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

    // Step 4: Collect FII/DII flows, VIX, and Nifty in parallel
    console.log('[Cron] 📊 Collecting market context data...');
    const [fiiDiiData, vixData, niftyData] = await Promise.all([
      fetchFIIDIIFlows().catch(() => null),
      fetchIndiaVIX().catch(() => null),
      fetchNifty50().catch(() => ({ value: 0, change: 0, changePercent: 0 })),
    ]);

    // Save FII/DII to DB
    if (fiiDiiData) {
      await saveFIIDIIFlows(fiiDiiData);
      console.log(`[Cron] 💰 FII/DII: FII net ₹${fiiDiiData.fiiNet}Cr, DII net ₹${fiiDiiData.diiNet}Cr`);
    }

    // Step 5: Compute per-stock sentiment scores for feature collection
    const stockSentiments: Record<string, number> = {};
    for (const article of analyzedArticles) {
      for (const stock of (article.relatedStocks || [])) {
        if (!stockSentiments[stock]) stockSentiments[stock] = 50;
        const w = article.decayedWeight ?? article.weight ?? 1.0;
        // Weighted moving average
        stockSentiments[stock] = stockSentiments[stock] * 0.7 + 
          Math.round(Math.max(0, Math.min(100, (article.sentiment + 1) * 50))) * 0.3;
      }
    }

    // Step 6: Collect daily features for key stocks
    console.log('[Cron] 📈 Collecting daily features for key stocks...');
    const featuresSaved = await collectDailyFeatures(
      stockSentiments,
      niftyData.value,
      vixData?.value ?? null,
      fiiDiiData?.fiiNet ?? 0,
      fiiDiiData?.diiNet ?? 0,
    );
    console.log(`[Cron] 📈 Saved features for ${featuresSaved} stocks`);

    // Step 7: Resolve yesterday's predictions
    console.log('[Cron] 🎯 Resolving pending predictions...');
    const resolution = await resolvePredictions();
    console.log(`[Cron] 🎯 Resolved ${resolution.resolved} predictions (${resolution.correct} correct)`);
    
    // Step 8: Persist news and sentiment data to Supabase
    const [articlesSaved, sectorsSaved, stocksSaved] = await Promise.all([
      persistArticles(analyzedArticles),
      persistSectorSentiments(fullSectorSentiments),
      persistStockSentiments(analyzedArticles),
    ]);

    // Step 9: Backfill historical data for stocks with insufficient history
    console.log('[Cron] 📚 Checking for historical data backfill needs...');
    let backfilled = 0;
    for (const symbol of KEY_STOCKS) {
      try {
        const existing = await getHistoricalFeatures(symbol, 500);
        if (existing.length < 200) {
          // Fetch 2 years of OHLCV and save daily features
          const ohlcv = await fetchHistoricalOHLCV(symbol, 500);
          if (ohlcv.length > existing.length + 10) {
            for (const candle of ohlcv) {
              await saveDailyFeatures({
                symbol,
                date: candle.date,
                close: candle.close,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                volume: candle.volume,
              });
            }
            backfilled++;
            console.log(`[Cron] 📚 Backfilled ${ohlcv.length} days for ${symbol} (had ${existing.length})`);
          }
        }
      } catch {}
    }
    if (backfilled > 0) {
      console.log(`[Cron] 📚 Backfilled historical data for ${backfilled} stocks`);
    }

    // Step 10: Train and freeze GBDT models for all key stocks
    console.log('[Cron] 🤖 Training frozen GBDT models...');
    let modelsTrained = 0;
    let modelsSkipped = 0;
    for (const symbol of KEY_STOCKS) {
      try {
        const result = await trainAndSaveModel(symbol);
        if (result.success) {
          modelsTrained++;
          console.log(`[Cron] 🤖 Trained model for ${symbol}: ${result.samples} samples, ${result.valAccuracy?.toFixed(1)}% val acc`);
        } else {
          modelsSkipped++;
        }
      } catch (err) {
        modelsSkipped++;
        console.warn(`[Cron] 🤖 Model training failed for ${symbol}:`, (err as Error).message);
      }
    }
    console.log(`[Cron] 🤖 Models trained: ${modelsTrained}, skipped: ${modelsSkipped}`);

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
        featuresSaved,
        backfilled,
        modelsTrained,
        modelsSkipped,
        fiiDii: fiiDiiData ? { fiiNet: fiiDiiData.fiiNet, diiNet: fiiDiiData.diiNet } : null,
        indiaVix: vixData?.value ?? null,
        predictionsResolved: resolution.resolved,
        predictionsCorrect: resolution.correct,
      },
    };
    
    console.log(`[Cron] ✅ Complete in ${duration}s — ${articlesSaved} articles, ${featuresSaved} features, ${modelsTrained} models trained, ${resolution.resolved} predictions resolved`);
    
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
