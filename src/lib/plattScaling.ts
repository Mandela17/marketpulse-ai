// Platt Scaling — Post-hoc confidence calibration
// Phase 6: Maps raw model probabilities → calibrated probabilities
// that reflect the TRUE observed frequency of correctness.
//
// After N resolved predictions, we fit a logistic curve: P(correct) = 1 / (1 + exp(-(A*raw + B)))
// where A and B are learned from (raw_confidence, was_correct) pairs.
//
// This ensures that "70% confident" means "correct 70% of the time" — not just an arbitrary number.

import { getServiceClient } from './supabase';

export interface PlattParams {
  A: number;
  B: number;
  sampleCount: number;
  fittedAt: string;
  // Diagnostic: bin accuracy before calibration
  binAccuracies?: Record<string, { count: number; accuracy: number }>;
}

// ─── Fit Platt Scaling Parameters ───────────────────────────────────
// Requires 200+ resolved predictions for meaningful calibration.

export async function fitPlattScaling(): Promise<PlattParams | null> {
  const db = getServiceClient();

  // Fetch resolved predictions with confidence
  const { data: resolved } = await db
    .from('predictions')
    .select('probability, is_correct')
    .not('resolved_at', 'is', null)
    .not('is_correct', 'is', null)
    .order('resolved_at', { ascending: false })
    .limit(2000); // Use up to 2000 most recent

  if (!resolved || resolved.length < 200) {
    console.log(`[PlattScaling] Only ${resolved?.length || 0} resolved predictions — need 200+ for calibration`);
    return null;
  }

  // Prepare data: raw confidence → probability, label → 1 (correct) / 0 (incorrect)
  const data = resolved.map(p => ({
    rawProb: (p.probability || 50) / 100, // normalize to [0,1]
    label: p.is_correct ? 1 : 0,
  }));

  // Compute bin accuracies (diagnostic)
  const bins: Record<string, { count: number; correct: number }> = {
    '50-55': { count: 0, correct: 0 },
    '55-60': { count: 0, correct: 0 },
    '60-65': { count: 0, correct: 0 },
    '65-70': { count: 0, correct: 0 },
    '70-75': { count: 0, correct: 0 },
    '75+': { count: 0, correct: 0 },
  };
  for (const d of data) {
    const pct = d.rawProb * 100;
    const bin = pct < 55 ? '50-55' : pct < 60 ? '55-60' : pct < 65 ? '60-65'
      : pct < 70 ? '65-70' : pct < 75 ? '70-75' : '75+';
    bins[bin].count++;
    if (d.label === 1) bins[bin].correct++;
  }
  const binAccuracies: Record<string, { count: number; accuracy: number }> = {};
  for (const [bin, { count, correct }] of Object.entries(bins)) {
    binAccuracies[bin] = {
      count,
      accuracy: count > 0 ? Math.round((correct / count) * 100) : 0,
    };
  }

  // Fit logistic regression via gradient descent: P(correct) = sigmoid(A * rawProb + B)
  let A = 1.0;
  let B = 0.0;
  const lr = 0.01;
  const iterations = 2000;

  for (let iter = 0; iter < iterations; iter++) {
    let gradA = 0;
    let gradB = 0;

    for (const { rawProb, label } of data) {
      const z = A * rawProb + B;
      const pred = 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
      const error = pred - label;
      gradA += error * rawProb;
      gradB += error;
    }

    // L2 regularization to prevent overfitting
    A -= lr * (gradA / data.length + 0.001 * A);
    B -= lr * (gradB / data.length);
  }

  const params: PlattParams = {
    A: parseFloat(A.toFixed(6)),
    B: parseFloat(B.toFixed(6)),
    sampleCount: data.length,
    fittedAt: new Date().toISOString(),
    binAccuracies,
  };

  // Save to Supabase
  try {
    await db.from('model_weights').upsert({
      date: 'platt-calibration',
      gbdt_weight: params.A,
      heuristic_weight: params.B,
      gbdt_accuracy_7d: params.sampleCount,
      heuristic_accuracy_7d: 0,
      updated_at: params.fittedAt,
    }, { onConflict: 'date' });
    console.log(`[PlattScaling] Fitted: A=${params.A}, B=${params.B} from ${params.sampleCount} predictions`);
    console.log(`[PlattScaling] Bin accuracies:`, JSON.stringify(binAccuracies));
  } catch (err) {
    console.warn('[PlattScaling] Failed to save calibration params:', err);
  }

  return params;
}

// ─── Load Saved Platt Parameters ────────────────────────────────────

export async function loadPlattParams(): Promise<PlattParams | null> {
  try {
    const db = getServiceClient();
    const { data } = await db
      .from('model_weights')
      .select('*')
      .eq('date', 'platt-calibration')
      .maybeSingle();

    if (!data) return null;
    return {
      A: data.gbdt_weight,
      B: data.heuristic_weight,
      sampleCount: data.gbdt_accuracy_7d,
      fittedAt: data.updated_at,
    };
  } catch {
    return null;
  }
}

// ─── Calibrate a Raw Confidence Score ───────────────────────────────

export function calibrateConfidence(rawConfidence: number, params: PlattParams): number {
  const rawProb = rawConfidence / 100;
  const z = params.A * rawProb + params.B;
  const calibrated = 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
  // Map back to 50-95 range
  return Math.max(50, Math.min(95, Math.round(calibrated * 100)));
}

