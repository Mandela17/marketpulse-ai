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
import { fetchIndiaVIX, saveDailyFeatures, saveDailyFeaturesBatch, getHistoricalFeatures } from '@/lib/nseData';
import { fetchHistoricalOHLCV, computeRealTechnicals } from '@/lib/technicalAnalysis';
import { fetchNifty50 } from '@/lib/stockData';
import { resolveUnresolvedPredictions } from '@/lib/predictionHistory';
import { trainAndSaveModel } from '@/lib/mlEngine';
import { waitForRateLimit, reportSuccess, reportError, getRateLimitStats } from '@/lib/rateLimiter';
import { fitPlattScaling } from '@/lib/plattScaling';
import { runAdaptiveLearningCycle } from '@/lib/adaptiveLearning';

// ─── Retry helper with exponential backoff ───────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3,
  baseDelayMs = 1000,
): Promise<T | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const is429 = err?.message?.includes('429') || err?.status === 429;
      const delay = is429
        ? baseDelayMs * Math.pow(2, attempt) + Math.random() * 500 // exponential + jitter
        : baseDelayMs * attempt;
      console.warn(`[Cron] ⚠️ ${label} attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${Math.round(delay)}ms...`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  console.warn(`[Cron] ❌ ${label} failed after ${maxRetries} attempts`);
  return null;
}

// Authenticate cron requests (Vercel sends this header automatically, external crons can also pass ?secret=)
function isAuthorized(request: Request): boolean {
  // In development, allow all requests
  if (process.env.NODE_ENV === 'development') return true;
  
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[Cron] No CRON_SECRET set, allowing request');
    return true;
  }

  const authHeader = request.headers.get('authorization');
  const headerMatch = authHeader === `Bearer ${cronSecret}`;

  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret');
  const queryMatch = querySecret === cronSecret;

  return headerMatch || queryMatch;
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
  const allFeatures: any[] = [];

  // Process in parallel batches of 8 for fast completion
  for (let i = 0; i < KEY_STOCKS.length; i += 8) {
    const batch = KEY_STOCKS.slice(i, i + 8);

    const promises = batch.map(async (symbol) => {
      try {
        const technicals = await withRetry(
          () => computeRealTechnicals(symbol),
          `technicals(${symbol})`,
          2,
          500,
        );
        if (!technicals || technicals.currentPrice === 0) return;

        allFeatures.push({
          symbol,
          date: today,
          close: technicals.currentPrice,
          open: technicals.dayLow,
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
      } catch (err) {
        console.warn(`[Cron] Daily features error for ${symbol}:`, (err as Error).message);
      }
    });

    await Promise.all(promises);
    if (i + 8 < KEY_STOCKS.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // 1 single bulk DB upsert for all 39 stocks!
  if (allFeatures.length > 0) {
    await saveDailyFeaturesBatch(allFeatures);
  }

  return allFeatures.length;
}

// ─── NEW: Resolve yesterday's predictions ────────────────────────────

async function resolvePredictions(): Promise<{ resolved: number; correct: number }> {
  try {
    const db = getServiceClient();
    // Fast check: skip if there are no pending unresolved predictions
    const { count: pendingCount } = await db
      .from('predictions')
      .select('*', { count: 'exact', head: true })
      .is('resolved_at', null);

    if (!pendingCount || pendingCount === 0) {
      console.log('[Cron] No pending predictions to resolve — skipping price fetches');
      return { resolved: 0, correct: 0 };
    }

    // Fetch closing prices for key stocks
    const closingPrices: Record<string, { todayClose: number; prevClose: number }> = {};

    for (let i = 0; i < KEY_STOCKS.length; i += 10) {
      const batch = KEY_STOCKS.slice(i, i + 10);
      const promises = batch.map(async (symbol) => {
        try {
          const ohlcv = await withRetry(
            () => fetchHistoricalOHLCV(symbol, 5),
            `ohlcv(${symbol})`,
            1,
            300,
          );
          if (ohlcv && ohlcv.length >= 2) {
            closingPrices[symbol] = {
              todayClose: ohlcv[ohlcv.length - 1].close,
              prevClose: ohlcv[ohlcv.length - 2].close,
            };
          }
        } catch {}
      });
      await Promise.all(promises);
      if (i + 10 < KEY_STOCKS.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
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

    // Step 9: Backfill historical data WITH COMPUTED TECHNICALS (batch bulk insert)
    // Limit to at most 1 stock per run to ensure total route time stays under 15s
    console.log('[Cron] 📚 Checking for historical data backfill needs...');
    let backfilled = 0;
    for (const symbol of KEY_STOCKS) {
      if (backfilled >= 1) break; // Max 1 stock per run ensures zero timeout risk
      try {
        const existing = await getHistoricalFeatures(symbol, 500);
        if (existing.length < 200) {
          const ohlcv = await withRetry(
            () => fetchHistoricalOHLCV(symbol, 500),
            `backfill-ohlcv(${symbol})`,
            2,
            1000,
          );
          if (ohlcv && ohlcv.length > existing.length + 10) {
            // Compute technicals from OHLCV in-memory
            const { calculateRSI, calculateEMA, calculateMACD, calculateBollingerBands, calculateVolumeProfile } = await import('@/lib/technicalAnalysis');
            const closes = ohlcv.map(c => c.close);
            const volumes = ohlcv.map(c => c.volume);
            const ema20Arr = calculateEMA(closes, 20);
            const ema50Arr = calculateEMA(closes, 50);

            const batchRows = [];
            for (let j = 0; j < ohlcv.length; j++) {
              const candle = ohlcv[j];
              const rsi = j >= 15 ? calculateRSI(closes.slice(0, j + 1), 14) : undefined;
              const macd = j >= 35 ? calculateMACD(closes.slice(0, j + 1)) : null;
              const bb = j >= 20 ? calculateBollingerBands(closes.slice(0, j + 1), 20, 2) : null;
              const volSlice = volumes.slice(0, j + 1);
              const volProfile = volSlice.length > 1 ? calculateVolumeProfile(volSlice) : null;

              batchRows.push({
                symbol,
                date: candle.date,
                close: candle.close,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                volume: candle.volume,
                rsi,
                macdHist: macd?.histogram,
                ema20: ema20Arr[j] || undefined,
                ema50: ema50Arr[j] || undefined,
                bollingerUpper: bb?.upper,
                bollingerLower: bb?.lower,
                volumeRatio: volProfile?.ratio,
              });
            }

            // Bulk save all rows in 1 single network request!
            await saveDailyFeaturesBatch(batchRows);
            backfilled++;
            console.log(`[Cron] 📚 Bulk-backfilled ${batchRows.length} days for ${symbol} in 1 request (had ${existing.length})`);
          }
        }
      } catch (err) {
        console.warn(`[Cron] 📚 Backfill error for ${symbol}:`, (err as Error).message);
      }
    }
    if (backfilled > 0) {
      console.log(`[Cron] 📚 Backfilled historical data for ${backfilled} stocks`);
    }

    // Step 10: Train and freeze GBDT models (rotate up to 5 stocks per run to guarantee <15s completion)
    console.log('[Cron] 🤖 Training frozen GBDT models (rotating top 5 per run)...');
    let modelsTrained = 0;
    let modelsSkipped = 0;

    const db = getServiceClient();
    const { data: existingModels } = await db
      .from('frozen_models')
      .select('symbol, trained_at');

    const modelAgeMap = new Map((existingModels || []).map(m => [m.symbol, new Date(m.trained_at).getTime()]));

    // Pick 5 stocks that either have no model or the oldest model
    const stocksToTrain = [...KEY_STOCKS]
      .sort((a, b) => (modelAgeMap.get(a) ?? 0) - (modelAgeMap.get(b) ?? 0))
      .slice(0, 5);

    const trainResults = await Promise.all(
      stocksToTrain.map(async (symbol) => {
        try {
          return await trainAndSaveModel(symbol);
        } catch (err: any) {
          console.warn(`[Cron] 🤖 Model training failed for ${symbol}:`, err.message);
          return { success: false };
        }
      })
    );
    for (const res of trainResults) {
      if (res.success) modelsTrained++;
      else modelsSkipped++;
    }
    console.log(`[Cron] 🤖 Models trained: ${modelsTrained}, skipped: ${modelsSkipped}`);

    // Step 11: Run adaptive learning cycle (update ensemble weights from recent accuracy)
    console.log('[Cron] 🎚️ Running adaptive learning cycle...');
    let adaptiveResult = null;
    try {
      adaptiveResult = await runAdaptiveLearningCycle();
      console.log(`[Cron] 🎚️ Weights updated: GBDT=${adaptiveResult.newWeights.gbdt}, Heuristic=${adaptiveResult.newWeights.heuristic}`);
    } catch (err) {
      console.warn('[Cron] 🎚️ Adaptive learning failed:', (err as Error).message);
    }

    // Step 12: Fit Platt scaling calibration (Phase 6 — requires 200+ resolved predictions)
    console.log('[Cron] 📐 Fitting Platt scaling calibration...');
    let plattResult = null;
    try {
      plattResult = await fitPlattScaling();
      if (plattResult) {
        console.log(`[Cron] 📐 Platt calibration fitted: A=${plattResult.A}, B=${plattResult.B} from ${plattResult.sampleCount} predictions`);
      } else {
        console.log('[Cron] 📐 Not enough resolved predictions for Platt scaling (need 200+)');
      }
    } catch (err) {
      console.warn('[Cron] 📐 Platt scaling failed:', (err as Error).message);
    }

    // Step 13: Log rate limit stats
    const rateLimitStats = getRateLimitStats('yahoo');
    console.log(`[Cron] 📊 Yahoo rate limit: ${rateLimitStats.totalRequests} reqs, ${rateLimitStats.totalErrors} errors (${(rateLimitStats.errorRate * 100).toFixed(1)}%)`);

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
    
    // Step 11: Save cron health status to Supabase for monitoring
    try {
      const db = getServiceClient();
      await db.from('cron_runs').upsert({
        job_name: 'daily-collect',
        ran_at: new Date().toISOString(),
        status: 'success',
        duration_ms: Date.now() - startTime,
        stocks_processed: featuresSaved,
        models_trained: modelsTrained,
        predictions_resolved: resolution.resolved,
        articles_saved: articlesSaved,
      }, { onConflict: 'job_name' });
    } catch {
      console.warn('[Cron] Failed to save cron health status (table may not exist yet)');
    }

    return NextResponse.json(result);
  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[Cron] ❌ Failed after ${duration}s:`, error);
    
    // Log failure to cron_runs
    try {
      const db = getServiceClient();
      await db.from('cron_runs').upsert({
        job_name: 'daily-collect',
        ran_at: new Date().toISOString(),
        status: 'failed',
        duration_ms: Date.now() - startTime,
        error_message: error.message?.substring(0, 500),
      }, { onConflict: 'job_name' });
    } catch {}

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
