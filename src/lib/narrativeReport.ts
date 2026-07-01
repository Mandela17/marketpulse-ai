// Gemini Narrative Report Generator — Produces AI-written research-style stock analysis
// Calls Gemini to generate a human-readable report from structured prediction data.

import type { MLPrediction } from './mlEngine';
import type { RegimeAnalysis } from './marketRegime';
import type { MarketEvent } from './eventCalendar';

export interface NarrativeReport {
  summary: string;        // 1-2 sentence executive summary
  analysis: string;       // Full 3-5 paragraph analysis
  keyTakeaways: string[]; // Bullet points
  riskWarnings: string[]; // Risk bullet points
  generatedAt: string;
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_KEY || '';

/**
 * Generate a research-style narrative report for a stock prediction.
 */
export async function generateNarrativeReport(
  symbol: string,
  prediction: MLPrediction,
  riskReward: any,
  regime: RegimeAnalysis | null,
  upcomingEvents: MarketEvent[],
  marketContext: { indiaVix?: number; fiiNet?: number; diiNet?: number }
): Promise<NarrativeReport> {
  // If no Gemini key, use structured fallback
  if (!GEMINI_API_KEY) {
    return generateFallbackReport(symbol, prediction, riskReward, regime, upcomingEvents, marketContext);
  }

  try {
    const prompt = buildPrompt(symbol, prediction, riskReward, regime, upcomingEvents, marketContext);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 800,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      console.warn(`[Narrative] Gemini API error: ${response.status}`);
      return generateFallbackReport(symbol, prediction, riskReward, regime, upcomingEvents, marketContext);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      return generateFallbackReport(symbol, prediction, riskReward, regime, upcomingEvents, marketContext);
    }

    const parsed = JSON.parse(text);

    return {
      summary: parsed.summary || '',
      analysis: parsed.analysis || '',
      keyTakeaways: parsed.keyTakeaways || [],
      riskWarnings: parsed.riskWarnings || [],
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.warn('[Narrative] Gemini report generation failed:', error);
    return generateFallbackReport(symbol, prediction, riskReward, regime, upcomingEvents, marketContext);
  }
}

function buildPrompt(
  symbol: string,
  prediction: MLPrediction,
  riskReward: any,
  regime: RegimeAnalysis | null,
  events: MarketEvent[],
  context: any
): string {
  return `You are a professional Indian equity research analyst writing a brief but insightful technical analysis report. Generate a JSON response.

STOCK: ${symbol}
ML MODEL PREDICTION: ${prediction.direction.toUpperCase()} with ${prediction.confidence}% confidence (${prediction.confidenceLevel})
MODEL VERSION: ${prediction.metrics.modelVersion}
VALIDATION ACCURACY: ${prediction.metrics.validationAccuracy}%
TRAINING SAMPLES: ${prediction.metrics.totalSamples}

SUB-MODEL VOTES:
- GBDT (Gradient Boosted Trees): ${prediction.subModelVotes.gbdt.direction} (${prediction.subModelVotes.gbdt.probability}%)
- Rule-Based Heuristic: ${prediction.subModelVotes.heuristic.direction} (${prediction.subModelVotes.heuristic.probability}%)

SUPPORTING SIGNALS: ${prediction.supportingSignals.join('; ')}
CONTRADICTING SIGNALS: ${prediction.contradictingSignals.join('; ')}

${riskReward ? `RISK/REWARD: Entry ₹${riskReward.entry}, Target1 ₹${riskReward.target1}, Target2 ₹${riskReward.target2}, Stop-Loss ₹${riskReward.stopLoss}, R:R ${riskReward.riskRewardRatio}x, Kelly ${riskReward.positionSizePct}%` : ''}
${regime ? `MARKET REGIME: ${regime.label} (${regime.confidence}% confidence)` : ''}
${context.indiaVix ? `INDIA VIX: ${context.indiaVix}` : ''}
${context.fiiNet ? `FII NET: ₹${context.fiiNet}Cr` : ''}
${events.length > 0 ? `UPCOMING EVENTS: ${events.map(e => `${e.title} on ${e.date}`).join(', ')}` : ''}

Generate a JSON response with exactly these fields:
{
  "summary": "1-2 sentence executive summary for a busy trader",
  "analysis": "3-5 paragraph analysis covering technicals, sentiment, institutional flows, and risk factors. Write in professional but accessible tone. Reference specific numbers.",
  "keyTakeaways": ["3-4 actionable bullet points"],
  "riskWarnings": ["2-3 specific risk factors to watch"]
}

Important: Be specific with numbers, avoid generic advice. This is for Indian stock market (NSE/BSE). Always include a disclaimer that this is AI-generated analysis, not financial advice.`;
}

// ─── Fallback: Structured Report Without Gemini ─────────────────────

function generateFallbackReport(
  symbol: string,
  prediction: MLPrediction,
  riskReward: any,
  regime: RegimeAnalysis | null,
  events: MarketEvent[],
  context: any
): NarrativeReport {
  const dir = prediction.direction === 'up' ? 'bullish' : 'bearish';
  const dirUp = prediction.direction === 'up';

  // Summary
  const summary = `${symbol} shows a ${dir} setup with ${prediction.confidence}% model confidence. ${
    prediction.metrics.modelVersion.includes('gbdt')
      ? `The GBDT+Heuristic ensemble (${prediction.metrics.totalSamples} training samples) favors ${dirUp ? 'upside' : 'downside'} with ${
          prediction.subModelVotes.gbdt.direction === prediction.subModelVotes.heuristic.direction
            ? 'consensus across sub-models'
            : 'some model disagreement'
        }.`
      : 'Heuristic-only mode — limited historical data available.'
  }`;

  // Analysis paragraphs
  const paras: string[] = [];

  // P1: Technical overview
  const techSignals = prediction.supportingSignals.slice(0, 3).join(', ');
  paras.push(
    `Technical indicators for ${symbol} paint a ${dir} picture. ${techSignals}. ` +
    `The model's confidence of ${prediction.confidence}% reflects ${
      prediction.confidence >= 70 ? 'strong conviction' :
      prediction.confidence >= 60 ? 'moderate conviction' : 'low conviction — exercise caution'
    }.`
  );

  // P2: Model consensus
  const gbdt = prediction.subModelVotes.gbdt;
  const heur = prediction.subModelVotes.heuristic;
  const allAgree = gbdt.direction === heur.direction;
  paras.push(
    `The ensemble model combines two independent sub-models: ` +
    `GBDT (Gradient Boosted Decision Trees) votes ${gbdt.direction} (${gbdt.probability}%) ` +
    `and the Rule-Based Heuristic votes ${heur.direction} (${heur.probability}%). ` +
    (allAgree
      ? 'Both models agree, which historically improves prediction reliability.'
      : 'Models show disagreement, which typically reduces confidence in the prediction.')
  );

  // P3: Risk/reward
  if (riskReward) {
    paras.push(
      `From a risk-reward perspective, conservative target is ₹${riskReward.target1?.toLocaleString('en-IN')} ` +
      `(${riskReward.target1Pct}) and aggressive target is ₹${riskReward.target2?.toLocaleString('en-IN')} ` +
      `(${riskReward.target2Pct}) with a stop-loss at ₹${riskReward.stopLoss?.toLocaleString('en-IN')} ` +
      `(${riskReward.stopLossPct}), yielding a ${riskReward.riskRewardRatio}x risk-reward ratio. ` +
      `Kelly Criterion suggests ${riskReward.positionSizePct}% position size. ` +
      `${riskReward.riskLevel === 'low' ? 'The risk profile is favorable.' :
        riskReward.riskLevel === 'moderate' ? 'The risk profile is moderate.' :
        'The risk profile is elevated — size positions accordingly.'}` +
      `${riskReward.vixAdjusted ? ' (Stop-loss widened due to elevated VIX.)' : ''}`
    );
  }

  // P4: Market context
  if (regime || context.indiaVix) {
    let contextPara = 'Market context: ';
    if (regime) contextPara += `The broader market is in a ${regime.label} phase. `;
    if (context.indiaVix) contextPara += `India VIX at ${context.indiaVix} suggests ${context.indiaVix > 20 ? 'elevated fear' : context.indiaVix < 14 ? 'complacency' : 'normal volatility'}. `;
    if (context.fiiNet) contextPara += `FII net flow: ₹${context.fiiNet}Cr. `;
    paras.push(contextPara);
  }

  // P5: Events
  if (events.length > 0) {
    const evtStr = events.map(e => `${e.title} (${e.date})`).join(', ');
    paras.push(`Upcoming catalysts to watch: ${evtStr}. These events may cause short-term volatility independent of the model's prediction.`);
  }

  // Key takeaways
  const keyTakeaways: string[] = [];
  keyTakeaways.push(`Model predicts ${dir} direction for ${symbol} with ${prediction.confidence}% confidence`);
  if (riskReward) {
    keyTakeaways.push(`Target 1: ₹${riskReward.target1?.toLocaleString('en-IN')} | Target 2: ₹${riskReward.target2?.toLocaleString('en-IN')} | Stop-loss: ₹${riskReward.stopLoss?.toLocaleString('en-IN')} (${riskReward.riskRewardRatio}x R:R)`);
  }
  if (allAgree) {
    keyTakeaways.push('Both sub-models (GBDT + Heuristic) agree — stronger conviction signal');
  }
  if (prediction.contradictingSignals.length > 0) {
    keyTakeaways.push(`Watch for: ${prediction.contradictingSignals[0]}`);
  }

  // Risk warnings
  const riskWarnings: string[] = [];
  if (prediction.contradictingSignals.length > 0) {
    riskWarnings.push(...prediction.contradictingSignals.slice(0, 2));
  }
  if (prediction.confidence < 60) {
    riskWarnings.push('Low model confidence — prediction may not be reliable');
  }
  if (events.some(e => e.impact === 'high')) {
    riskWarnings.push(`High-impact event approaching: ${events.find(e => e.impact === 'high')!.title}`);
  }
  riskWarnings.push('AI-generated analysis for informational purposes only. Not financial advice.');

  return {
    summary,
    analysis: paras.join('\n\n'),
    keyTakeaways,
    riskWarnings,
    generatedAt: new Date().toISOString(),
  };
}
