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
        return NextResponse.json(trend);
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
