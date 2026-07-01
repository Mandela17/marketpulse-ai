// Prediction History & Tracking System
// Records every prediction and its outcome for accountability and model improvement.

import { getServiceClient } from './supabase';

export interface PredictionRecord {
  id?: number;
  symbol: string;
  predictedDirection: 'up' | 'down';
  probability: number;
  confidenceLevel: 'low' | 'moderate' | 'high' | 'very_high';
  featuresJson: Record<string, any>;
  supportingSignals: string[];
  contradictingSignals: string[];
  modelVersion: string;
  predictedAt: string;
  // Resolution
  actualDirection?: 'up' | 'down';
  actualReturn?: number;
  resolvedAt?: string;
  isCorrect?: boolean;
}

export interface AccuracyMetrics {
  symbol: string;
  totalResolved: number;
  correctCount: number;
  accuracyPct: number;
  resolved30d: number;
  correct30d: number;
  accuracy30dPct: number;
}

// ─── Save a new prediction ──────────────────────────────────────────

export async function savePrediction(prediction: Omit<PredictionRecord, 'id'>): Promise<number | null> {
  try {
    const db = getServiceClient();
    const today = new Date().toISOString().split('T')[0];

    // Dedup: Check if we already have a prediction for this symbol today
    const { data: existing } = await db
      .from('predictions')
      .select('id')
      .eq('symbol', prediction.symbol)
      .gte('predicted_at', `${today}T00:00:00Z`)
      .lte('predicted_at', `${today}T23:59:59Z`)
      .is('resolved_at', null)
      .limit(1);

    const row = {
      symbol: prediction.symbol,
      predicted_direction: prediction.predictedDirection,
      probability: prediction.probability,
      confidence_level: prediction.confidenceLevel,
      features_json: prediction.featuresJson,
      supporting_signals: prediction.supportingSignals,
      contradicting_signals: prediction.contradictingSignals,
      model_version: prediction.modelVersion,
      predicted_at: prediction.predictedAt,
    };

    if (existing && existing.length > 0) {
      // Fetch the existing features_json to merge and preserve cached items (like narrativeCache)
      const { data: currentRecord } = await db
        .from('predictions')
        .select('features_json')
        .eq('id', existing[0].id)
        .maybeSingle();

      const mergedFeatures = {
        ...(currentRecord?.features_json || {}),
        ...prediction.featuresJson,
      };

      const updatedRow = {
        ...row,
        features_json: mergedFeatures,
      };

      // Update existing prediction for today
      const { error } = await db.from('predictions')
        .update(updatedRow)
        .eq('id', existing[0].id);

      if (error) {
        console.error('[Predictions] Update FAILED for', prediction.symbol, '—', error.code, error.message);
        return null;
      }
      console.log('[Predictions] Updated prediction for', prediction.symbol, '— id:', existing[0].id);
      return existing[0].id;
    }

    // Insert new prediction
    const { data, error } = await db.from('predictions').insert(row).select('id').single();

    if (error) {
      console.error('[Predictions] Save FAILED for', prediction.symbol, '— Supabase error:', error.code, error.message, error.details);
      return null;
    }

    console.log('[Predictions] Saved prediction for', prediction.symbol, '— id:', data?.id);
    return data?.id ?? null;
  } catch (err) {
    console.error('[Predictions] Save THREW for', prediction.symbol, ':', err);
    return null;
  }
}

// ─── Resolve predictions after market close ─────────────────────────

export async function resolveUnresolvedPredictions(
  closingPrices: Record<string, { todayClose: number; prevClose: number }>
): Promise<{ resolved: number; correct: number }> {
  const db = getServiceClient();
  let resolved = 0;
  let correct = 0;

  try {
    // Get all unresolved predictions
    const { data: unresolved, error } = await db
      .from('predictions')
      .select('*')
      .is('resolved_at', null)
      .lt('predicted_at', new Date().toISOString()); // Only older predictions

    if (error || !unresolved) return { resolved: 0, correct: 0 };

    for (const pred of unresolved) {
      const prices = closingPrices[pred.symbol];
      if (!prices) continue;

      const actualReturn = prices.prevClose > 0
        ? ((prices.todayClose - prices.prevClose) / prices.prevClose) * 100
        : 0;
      const actualDirection = actualReturn >= 0 ? 'up' : 'down';
      const isCorrect = pred.predicted_direction === actualDirection;

      await db.from('predictions').update({
        actual_direction: actualDirection,
        actual_return: parseFloat(actualReturn.toFixed(4)),
        resolved_at: new Date().toISOString(),
        is_correct: isCorrect,
      }).eq('id', pred.id);

      resolved++;
      if (isCorrect) correct++;
    }
  } catch (err) {
    console.warn('[Predictions] Resolution error:', err);
  }

  return { resolved, correct };
}

// ─── Get predictions for a stock ────────────────────────────────────

export async function getPredictions(
  symbol: string,
  limit: number = 30
): Promise<PredictionRecord[]> {
  try {
    const db = getServiceClient();
    const { data, error } = await db
      .from('predictions')
      .select('*')
      .eq('symbol', symbol)
      .order('predicted_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row: any) => ({
      id: row.id,
      symbol: row.symbol,
      predictedDirection: row.predicted_direction,
      probability: row.probability,
      confidenceLevel: row.confidence_level,
      featuresJson: row.features_json || {},
      supportingSignals: row.supporting_signals || [],
      contradictingSignals: row.contradicting_signals || [],
      modelVersion: row.model_version,
      predictedAt: row.predicted_at,
      actualDirection: row.actual_direction,
      actualReturn: row.actual_return,
      resolvedAt: row.resolved_at,
      isCorrect: row.is_correct,
    }));
  } catch {
    return [];
  }
}

// ─── Get today's active (unresolved) predictions ────────────────────
// Returns only the LATEST prediction per symbol (deduplicates stale entries)
// Excludes predictions older than 7 days

export async function getActivePredictions(): Promise<PredictionRecord[]> {
  try {
    const db = getServiceClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await db
      .from('predictions')
      .select('*')
      .is('resolved_at', null)
      .gte('predicted_at', sevenDaysAgo)
      .order('predicted_at', { ascending: false });

    if (error) {
      console.error('[Predictions] getActivePredictions error:', error.code, error.message);
      return [];
    }

    if (!data) return [];

    // Deduplicate: keep only the LATEST prediction per symbol
    const latestBySymbol = new Map<string, any>();
    for (const row of data) {
      if (!latestBySymbol.has(row.symbol)) {
        latestBySymbol.set(row.symbol, row);
      }
    }

    const deduped = Array.from(latestBySymbol.values());
    console.log(`[Predictions] getActivePredictions: ${data.length} raw → ${deduped.length} deduped`);

    // Sort by confidence descending
    deduped.sort((a, b) => (b.probability || 0) - (a.probability || 0));

    return deduped.map((row: any) => ({
      id: row.id,
      symbol: row.symbol,
      predictedDirection: row.predicted_direction,
      probability: row.probability,
      confidenceLevel: row.confidence_level,
      featuresJson: row.features_json || {},
      supportingSignals: row.supporting_signals || [],
      contradictingSignals: row.contradicting_signals || [],
      modelVersion: row.model_version,
      predictedAt: row.predicted_at,
    }));
  } catch (err) {
    console.error('[Predictions] getActivePredictions threw:', err);
    return [];
  }
}

// ─── Get accuracy metrics ───────────────────────────────────────────

export async function getAccuracyMetrics(symbol?: string): Promise<AccuracyMetrics[]> {
  try {
    const db = getServiceClient();

    let query = db.from('predictions')
      .select('symbol, predicted_direction, is_correct, predicted_at, resolved_at');

    if (symbol) {
      query = query.eq('symbol', symbol);
    }

    const { data, error } = await query.not('resolved_at', 'is', null);

    if (error || !data) return [];

    // Group by symbol and compute metrics
    const grouped: Record<string, { total: number; correct: number; total30d: number; correct30d: number }> = {};
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    for (const row of data) {
      const sym = row.symbol;
      if (!grouped[sym]) {
        grouped[sym] = { total: 0, correct: 0, total30d: 0, correct30d: 0 };
      }

      grouped[sym].total++;
      if (row.is_correct) grouped[sym].correct++;

      if (row.predicted_at >= thirtyDaysAgo) {
        grouped[sym].total30d++;
        if (row.is_correct) grouped[sym].correct30d++;
      }
    }

    return Object.entries(grouped).map(([sym, m]) => ({
      symbol: sym,
      totalResolved: m.total,
      correctCount: m.correct,
      accuracyPct: m.total > 0 ? parseFloat(((m.correct / m.total) * 100).toFixed(1)) : 0,
      resolved30d: m.total30d,
      correct30d: m.correct30d,
      accuracy30dPct: m.total30d > 0 ? parseFloat(((m.correct30d / m.total30d) * 100).toFixed(1)) : 0,
    }));
  } catch {
    return [];
  }
}

// ─── Get overall platform accuracy ──────────────────────────────────

export async function getOverallAccuracy(): Promise<{
  totalPredictions: number;
  totalResolved: number;
  totalCorrect: number;
  overallAccuracy: number;
  accuracy30d: number;
  bestStock: { symbol: string; accuracy: number } | null;
  worstStock: { symbol: string; accuracy: number } | null;
}> {
  const metrics = await getAccuracyMetrics();

  if (metrics.length === 0) {
    return {
      totalPredictions: 0, totalResolved: 0, totalCorrect: 0,
      overallAccuracy: 0, accuracy30d: 0,
      bestStock: null, worstStock: null,
    };
  }

  const totalResolved = metrics.reduce((s, m) => s + m.totalResolved, 0);
  const totalCorrect = metrics.reduce((s, m) => s + m.correctCount, 0);
  const total30d = metrics.reduce((s, m) => s + m.resolved30d, 0);
  const correct30d = metrics.reduce((s, m) => s + m.correct30d, 0);

  // Find best/worst stocks (minimum 5 resolved predictions)
  const qualified = metrics.filter(m => m.totalResolved >= 5);
  const sorted = [...qualified].sort((a, b) => b.accuracyPct - a.accuracyPct);

  return {
    totalPredictions: totalResolved,
    totalResolved,
    totalCorrect,
    overallAccuracy: totalResolved > 0 ? parseFloat(((totalCorrect / totalResolved) * 100).toFixed(1)) : 0,
    accuracy30d: total30d > 0 ? parseFloat(((correct30d / total30d) * 100).toFixed(1)) : 0,
    bestStock: sorted.length > 0 ? { symbol: sorted[0].symbol, accuracy: sorted[0].accuracyPct } : null,
    worstStock: sorted.length > 0 ? { symbol: sorted[sorted.length - 1].symbol, accuracy: sorted[sorted.length - 1].accuracyPct } : null,
  };
}

// ─── Confidence level from probability ──────────────────────────────

export function getConfidenceLevel(probability: number): 'low' | 'moderate' | 'high' | 'very_high' {
  if (probability >= 80) return 'very_high';
  if (probability >= 70) return 'high';
  if (probability >= 60) return 'moderate';
  return 'low';
}

// ─── Accuracy trend over time (weekly buckets) ─────────────────────

export interface AccuracyTrendPoint {
  weekStart: string;
  total: number;
  correct: number;
  accuracy: number;
  cumulativeTotal: number;
  cumulativeCorrect: number;
  cumulativeAccuracy: number;
}

export async function getAccuracyTrend(weeks: number = 12): Promise<AccuracyTrendPoint[]> {
  try {
    const db = getServiceClient();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - weeks * 7);

    const { data } = await db
      .from('predictions')
      .select('resolved_at, is_correct')
      .not('resolved_at', 'is', null)
      .gte('resolved_at', cutoff.toISOString())
      .order('resolved_at', { ascending: true });

    if (!data || data.length === 0) return [];

    // Bucket by week
    const buckets = new Map<string, { total: number; correct: number }>();

    for (const row of data) {
      const d = new Date(row.resolved_at);
      // Get Monday of that week
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      const weekKey = monday.toISOString().split('T')[0];

      if (!buckets.has(weekKey)) {
        buckets.set(weekKey, { total: 0, correct: 0 });
      }
      const bucket = buckets.get(weekKey)!;
      bucket.total++;
      if (row.is_correct) bucket.correct++;
    }

    // Build cumulative trend
    const sorted = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    let cumTotal = 0;
    let cumCorrect = 0;

    return sorted.map(([weekStart, { total, correct }]) => {
      cumTotal += total;
      cumCorrect += correct;
      return {
        weekStart,
        total,
        correct,
        accuracy: total > 0 ? parseFloat(((correct / total) * 100).toFixed(1)) : 0,
        cumulativeTotal: cumTotal,
        cumulativeCorrect: cumCorrect,
        cumulativeAccuracy: cumTotal > 0 ? parseFloat(((cumCorrect / cumTotal) * 100).toFixed(1)) : 0,
      };
    });
  } catch {
    return [];
  }
}
