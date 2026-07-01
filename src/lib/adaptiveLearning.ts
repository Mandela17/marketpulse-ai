// Adaptive Learning Engine — Online Weight Tuning
// Runs daily (post-market) to adjust ensemble model weights based on recent prediction accuracy.
// Implements a feedback loop: resolved predictions → per-model accuracy → updated weights → better predictions.

import { getServiceClient } from './supabase';

export interface EnsembleWeights {
  gbdt: number;
  heuristic: number;
  lastUpdated: string;
}

export interface AdaptiveLearningResult {
  gbdtAccuracy7d: number;
  heuristicAccuracy7d: number;
  newWeights: EnsembleWeights;
  totalResolved: number;
  adjustedSamples: number;
}

const DEFAULT_WEIGHTS: EnsembleWeights = {
  gbdt: 0.60,
  heuristic: 0.40,
  lastUpdated: new Date().toISOString(),
};

// ─── Get Current Ensemble Weights ───────────────────────────────────

export async function getEnsembleWeights(): Promise<EnsembleWeights> {
  try {
    const db = getServiceClient();
    const { data } = await db
      .from('model_weights')
      .select('*')
      .order('date', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      return {
        gbdt: data[0].gbdt_weight || DEFAULT_WEIGHTS.gbdt,
        heuristic: data[0].heuristic_weight || DEFAULT_WEIGHTS.heuristic,
        lastUpdated: data[0].updated_at || new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn('[AdaptiveLearning] Failed to read weights, using defaults:', err);
  }

  return DEFAULT_WEIGHTS;
}

// ─── Run Adaptive Learning Cycle ────────────────────────────────────

export async function runAdaptiveLearningCycle(): Promise<AdaptiveLearningResult> {
  const db = getServiceClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch resolved predictions from the last 7 days
  const { data: resolved } = await db
    .from('predictions')
    .select('symbol, predicted_direction, is_correct, probability, features_json, model_version, resolved_at')
    .not('resolved_at', 'is', null)
    .gte('resolved_at', sevenDaysAgo)
    .order('resolved_at', { ascending: false });

  if (!resolved || resolved.length === 0) {
    console.log('[AdaptiveLearning] No resolved predictions in last 7 days — keeping default weights');
    return {
      gbdtAccuracy7d: 0,
      heuristicAccuracy7d: 0,
      newWeights: DEFAULT_WEIGHTS,
      totalResolved: 0,
      adjustedSamples: 0,
    };
  }

  // Compute per-model accuracy from the features_json subModels data
  let gbdtCorrect = 0;
  let gbdtTotal = 0;
  let heuristicCorrect = 0;
  let heuristicTotal = 0;

  for (const pred of resolved) {
    const features = pred.features_json || {};
    const subModels = features.subModels || {};
    const actualDirection = pred.is_correct
      ? pred.predicted_direction
      : (pred.predicted_direction === 'up' ? 'down' : 'up');

    // Check GBDT sub-model vote
    if (subModels.gbdt?.direction) {
      gbdtTotal++;
      if (subModels.gbdt.direction === actualDirection) gbdtCorrect++;
    } else if (subModels.logisticRegression?.direction) {
      // Backward compat: old predictions used logisticRegression
      gbdtTotal++;
      if (subModels.logisticRegression.direction === actualDirection) gbdtCorrect++;
    }

    // Check Heuristic sub-model vote
    if (subModels.heuristic?.direction) {
      heuristicTotal++;
      if (subModels.heuristic.direction === actualDirection) heuristicCorrect++;
    }
  }

  const gbdtAccuracy7d = gbdtTotal > 0 ? (gbdtCorrect / gbdtTotal) * 100 : 50;
  const heuristicAccuracy7d = heuristicTotal > 0 ? (heuristicCorrect / heuristicTotal) * 100 : 50;

  // Compute new weights proportional to accuracy (with floor/ceiling)
  // Use softmax-like weighting: weight ∝ accuracy^2 (reward accuracy non-linearly)
  const gbdtScore = Math.pow(Math.max(45, gbdtAccuracy7d), 2);
  const heuristicScore = Math.pow(Math.max(45, heuristicAccuracy7d), 2);
  const totalScore = gbdtScore + heuristicScore;

  let gbdtWeight = totalScore > 0 ? gbdtScore / totalScore : 0.5;
  let heuristicWeight = totalScore > 0 ? heuristicScore / totalScore : 0.5;

  // Clamp weights: neither model should get less than 20% or more than 80%
  gbdtWeight = Math.max(0.20, Math.min(0.80, gbdtWeight));
  heuristicWeight = 1 - gbdtWeight;

  const newWeights: EnsembleWeights = {
    gbdt: parseFloat(gbdtWeight.toFixed(3)),
    heuristic: parseFloat(heuristicWeight.toFixed(3)),
    lastUpdated: new Date().toISOString(),
  };

  // Save new weights to Supabase
  try {
    const today = new Date().toISOString().split('T')[0];
    await db.from('model_weights').upsert({
      date: today,
      gbdt_weight: newWeights.gbdt,
      heuristic_weight: newWeights.heuristic,
      gbdt_accuracy_7d: parseFloat(gbdtAccuracy7d.toFixed(1)),
      heuristic_accuracy_7d: parseFloat(heuristicAccuracy7d.toFixed(1)),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'date' });

    console.log(`[AdaptiveLearning] Updated weights: GBDT=${newWeights.gbdt}, Heuristic=${newWeights.heuristic} ` +
      `(GBDT 7d acc: ${gbdtAccuracy7d.toFixed(1)}%, Heuristic 7d acc: ${heuristicAccuracy7d.toFixed(1)}%)`);
  } catch (err) {
    console.warn('[AdaptiveLearning] Failed to save weights:', err);
  }

  return {
    gbdtAccuracy7d: parseFloat(gbdtAccuracy7d.toFixed(1)),
    heuristicAccuracy7d: parseFloat(heuristicAccuracy7d.toFixed(1)),
    newWeights,
    totalResolved: resolved.length,
    adjustedSamples: gbdtTotal + heuristicTotal,
  };
}
