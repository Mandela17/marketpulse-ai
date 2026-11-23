import { NextResponse } from 'next/server';
import { getAccuracyMetrics, getOverallAccuracy, getAccuracyTrend } from '@/lib/predictionHistory';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export interface ConfidenceBucket {
  range: string;
  total: number;
  correct: number;
  accuracy: number;
  avgReturn: number;
}

export interface GradeMetric {
  grade: string;
  total: number;
  correct: number;
  accuracy: number;
  avgReturn: number;
}

const CONFIDENCE_RANGES = ['50-55', '55-60', '60-65', '65-70', '70-75', '75+'] as const;
const TRADE_GRADES = ['A', 'B', 'C', 'D', 'F'] as const;

function getConfidenceBucketRange(probability: number | null | undefined): string | null {
  if (probability == null) return null;
  let prob = Number(probability);
  if (isNaN(prob)) return null;

  // Normalize probability if stored as decimal (0.0 to 1.0)
  if (prob > 0 && prob <= 1) {
    prob *= 100;
  }

  if (prob >= 75) return '75+';
  if (prob >= 70) return '70-75';
  if (prob >= 65) return '65-70';
  if (prob >= 60) return '60-65';
  if (prob >= 55) return '55-60';
  if (prob >= 50) return '50-55';

  // Fallback for edge cases where probability < 50
  return '50-55';
}

async function fetchByConfidence(): Promise<ConfidenceBucket[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from('predictions')
    .select('probability, is_correct, actual_return')
    .not('resolved_at', 'is', null);

  if (error) {
    console.error('[Accuracy API] Error fetching predictions by confidence:', error);
    throw error;
  }

  const rows = data || [];
  const stats: Record<string, { total: number; correct: number; sumReturn: number; returnCount: number }> = {};
  for (const range of CONFIDENCE_RANGES) {
    stats[range] = { total: 0, correct: 0, sumReturn: 0, returnCount: 0 };
  }

  for (const row of rows) {
    const range = getConfidenceBucketRange(row.probability);
    if (!range || !stats[range]) continue;

    stats[range].total++;
    if (row.is_correct === true) {
      stats[range].correct++;
    }
    if (row.actual_return != null && !isNaN(Number(row.actual_return))) {
      stats[range].sumReturn += Number(row.actual_return);
      stats[range].returnCount++;
    }
  }

  return CONFIDENCE_RANGES.map((range) => {
    const s = stats[range];
    return {
      range,
      total: s.total,
      correct: s.correct,
      accuracy: s.total > 0 ? parseFloat(((s.correct / s.total) * 100).toFixed(1)) : 0,
      avgReturn: s.returnCount > 0 ? parseFloat((s.sumReturn / s.returnCount).toFixed(2)) : 0,
    };
  });
}

async function fetchByGrade(): Promise<GradeMetric[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from('predictions')
    .select('features_json, is_correct, actual_return')
    .not('resolved_at', 'is', null);

  if (error) {
    console.error('[Accuracy API] Error fetching predictions by grade:', error);
    throw error;
  }

  const rows = data || [];
  const gradeStats: Record<string, { total: number; correct: number; sumReturn: number; returnCount: number }> = {};
  for (const grade of TRADE_GRADES) {
    gradeStats[grade] = { total: 0, correct: 0, sumReturn: 0, returnCount: 0 };
  }

  for (const row of rows) {
    let features = row.features_json;
    if (typeof features === 'string') {
      try {
        features = JSON.parse(features);
      } catch {
        features = null;
      }
    }

    const tradeGrade = features?.tradeGrade;
    if (!tradeGrade || typeof tradeGrade !== 'string') continue;

    const normalizedGrade = tradeGrade.trim().toUpperCase();
    if (!gradeStats[normalizedGrade]) continue;

    gradeStats[normalizedGrade].total++;
    if (row.is_correct === true) {
      gradeStats[normalizedGrade].correct++;
    }
    if (row.actual_return != null && !isNaN(Number(row.actual_return))) {
      gradeStats[normalizedGrade].sumReturn += Number(row.actual_return);
      gradeStats[normalizedGrade].returnCount++;
    }
  }

  return TRADE_GRADES.map((grade) => {
    const s = gradeStats[grade];
    return {
      grade,
      total: s.total,
      correct: s.correct,
      accuracy: s.total > 0 ? parseFloat(((s.correct / s.total) * 100).toFixed(1)) : 0,
      avgReturn: s.returnCount > 0 ? parseFloat((s.sumReturn / s.returnCount).toFixed(2)) : 0,
    };
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'overview';

    switch (type) {
      case 'overview': {
        const overview = await getOverallAccuracy();
        return NextResponse.json(overview);
      }

      case 'by-stock': {
        const metrics = await getAccuracyMetrics();
        metrics.sort((a, b) => b.accuracyPct - a.accuracyPct);
        return NextResponse.json(metrics);
      }

      case 'trend': {
        const weeksParam = searchParams.get('weeks');
        const weeks = weeksParam ? parseInt(weeksParam, 10) : 12;
        const sanitizedWeeks = isNaN(weeks) || weeks <= 0 ? 12 : weeks;
        const trend = await getAccuracyTrend(sanitizedWeeks);

        // Phase 6: Compute drift info for AccuracyDriftWidget
        const db = getServiceClient();
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();

        const [recent7d, previous7d] = await Promise.all([
          db.from('predictions')
            .select('probability, is_correct')
            .not('resolved_at', 'is', null)
            .not('is_correct', 'is', null)
            .gte('resolved_at', sevenDaysAgo),
          db.from('predictions')
            .select('probability, is_correct')
            .not('resolved_at', 'is', null)
            .not('is_correct', 'is', null)
            .gte('resolved_at', fourteenDaysAgo)
            .lt('resolved_at', sevenDaysAgo),
        ]);

        const r7 = recent7d.data || [];
        const p7 = previous7d.data || [];
        const r7Correct = r7.filter(p => p.is_correct).length;
        const p7Correct = p7.filter(p => p.is_correct).length;
        const current7dAcc = r7.length > 0 ? parseFloat(((r7Correct / r7.length) * 100).toFixed(1)) : null;
        const previous7dAcc = p7.length > 0 ? parseFloat(((p7Correct / p7.length) * 100).toFixed(1)) : null;

        // Compute by-confidence buckets for drift widget
        const byConfidence: Record<string, { count: number; accuracy: number }> = {};
        const buckets = ['50-55', '55-60', '60-65', '65-70', '70+'];
        for (const b of buckets) byConfidence[b] = { count: 0, accuracy: 0 };
        for (const p of r7) {
          const prob = Number(p.probability) || 50;
          const normProb = prob > 0 && prob <= 1 ? prob * 100 : prob;
          const bucket = normProb >= 70 ? '70+' : normProb >= 65 ? '65-70' : normProb >= 60 ? '60-65' : normProb >= 55 ? '55-60' : '50-55';
          byConfidence[bucket].count++;
          if (p.is_correct) byConfidence[bucket].accuracy++;
        }
        for (const b of buckets) {
          if (byConfidence[b].count > 0) {
            byConfidence[b].accuracy = parseFloat(((byConfidence[b].accuracy / byConfidence[b].count) * 100).toFixed(0));
          }
        }

        let driftTrend: 'improving' | 'declining' | 'stable' | 'insufficient' = 'insufficient';
        if (r7.length >= 5 && current7dAcc !== null) {
          if (previous7dAcc === null || p7.length < 5) {
            driftTrend = 'stable';
          } else {
            const delta = current7dAcc - previous7dAcc;
            driftTrend = delta > 3 ? 'improving' : delta < -3 ? 'declining' : 'stable';
          }
        }

        // Get latest model version
        let modelVersion: string | null = null;
        try {
          const { data: latestPred } = await db.from('predictions')
            .select('model_version')
            .not('model_version', 'is', null)
            .order('predicted_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          modelVersion = latestPred?.model_version || null;
        } catch {}

        return NextResponse.json({
          ...trend,
          current7d: current7dAcc,
          previous7d: previous7dAcc,
          trend: driftTrend,
          resolved7d: r7.length,
          resolved14d: p7.length,
          byConfidence,
          modelVersion,
        });
      }

      case 'by-confidence': {
        const byConfidence = await fetchByConfidence();
        return NextResponse.json(byConfidence);
      }

      case 'by-grade': {
        const byGrade = await fetchByGrade();
        return NextResponse.json(byGrade);
      }

      case 'full': {
        const weeksParam = searchParams.get('weeks');
        const weeks = weeksParam ? parseInt(weeksParam, 10) : 12;
        const sanitizedWeeks = isNaN(weeks) || weeks <= 0 ? 12 : weeks;

        const [overview, rawMetrics, trend, byConfidence, byGrade] = await Promise.all([
          getOverallAccuracy(),
          getAccuracyMetrics(),
          getAccuracyTrend(sanitizedWeeks),
          fetchByConfidence(),
          fetchByGrade(),
        ]);

        const byStock = [...rawMetrics].sort((a, b) => b.accuracyPct - a.accuracyPct);

        return NextResponse.json({
          overview,
          byStock,
          trend,
          byConfidence,
          byGrade,
        });
      }

      default:
        return NextResponse.json(
          { error: `Invalid type parameter: "${type}". Allowed values: overview, by-stock, trend, by-confidence, by-grade, full.` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('[Accuracy API] Error handling request:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
