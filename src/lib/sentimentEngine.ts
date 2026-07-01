// Gemini-powered Sentiment Analysis Engine
// Uses Google Gemini API to analyze news articles and compute sentiment scores

import { GoogleGenAI } from '@google/genai';
import { RawArticle, detectSectors, detectStocks } from './newsAggregator';
import { NewsArticle, AspectSentiment } from './types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export function getSourceWeight(source: string): number {
  const src = source.toLowerCase();
  if (src.includes('moneycontrol')) return 1.5;
  if (src.includes('economic times')) return 1.5;
  if (src.includes('mint') || src.includes('livemint')) return 1.4;
  if (src.includes('bloomberg')) return 1.5;
  if (src.includes('reuters')) return 1.5;
  if (src.includes('reddit') || src.includes('r/indiainvestments')) return 0.7;
  if (src.includes('twitter') || src.includes('x.com')) return 0.6;
  if (src.includes('rumors') || src.includes('rumor')) return 0.6;
  if (src.includes('blog') || src.includes('blogspot')) return 0.5;
  return 1.0;
}

export function computeDecayedWeight(baseWeight: number, publishedAtStr: string): number {
  const publishedAt = new Date(publishedAtStr);
  const diffMs = Date.now() - publishedAt.getTime();
  const diffHours = Math.max(0, diffMs / (1000 * 60 * 60));
  
  // Exponential Time Decay: Weight = baseWeight * e^(-lambda * t)
  const lambda = 0.03;
  const decayed = baseWeight * Math.exp(-lambda * diffHours);
  
  return parseFloat(Math.max(0.1, decayed).toFixed(2));
}

interface SentimentResult {
  sentiment: number; // -1 to 1
  label: 'positive' | 'negative' | 'neutral';
  category: 'financial' | 'geopolitical' | 'policy' | 'earnings' | 'global';
  impactLevel: 'high' | 'medium' | 'low';
  summary: string;
  aspects?: AspectSentiment[];
}

// Analyze a batch of articles using Gemini
export async function analyzeArticlesBatch(articles: RawArticle[]): Promise<NewsArticle[]> {
  if (articles.length === 0) return [];

  // Process in batches — use larger batches to reduce API call count
  const batchSize = 15;
  const results: NewsArticle[] = [];

  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    let success = false;

    // Retry up to 2 times with exponential backoff
    for (let attempt = 0; attempt < 2 && !success; attempt++) {
      try {
        if (attempt > 0) {
          // Wait longer on retry (10s, 20s)
          await new Promise(resolve => setTimeout(resolve, 10000 * attempt));
        }
        const batchResults = await analyzeBatchWithGemini(batch);
        results.push(...batchResults);
        success = true;
      } catch (error: any) {
        const errMsg = (error?.message || '').toLowerCase();
        const isDepleted = errMsg.includes('credits are depleted') || errMsg.includes('billing') || errMsg.includes('prepay');
        const isRateLimit = error?.status === 429 || error?.message?.includes('429');

        if (isDepleted) {
          console.error('Gemini API credits depleted. Skipping retries, using keyword fallback.');
          const fallbackResults = batch.map((article, idx) => keywordFallback(article, `batch-${i}-${idx}`));
          results.push(...fallbackResults);
          success = true; // Skip retries
        } else if (isRateLimit && attempt < 1) {
          console.warn(`Gemini rate limited, waiting before retry (attempt ${attempt + 1})...`);
        } else {
          console.error('Gemini analysis failed, using keyword fallback:', error?.message || error);
          const fallbackResults = batch.map((article, idx) => keywordFallback(article, `batch-${i}-${idx}`));
          results.push(...fallbackResults);
          success = true; // Don't retry, use fallback
        }
      }
    }
    
    // Delay between batches to respect rate limits (2 seconds)
    if (i + batchSize < articles.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return results;
}

async function analyzeBatchWithGemini(articles: RawArticle[]): Promise<NewsArticle[]> {
  const articleList = articles.map((a, i) => 
    `[${i}] "${a.title}" - ${a.description?.substring(0, 200) || 'No description'}`
  ).join('\n');

  const prompt = `You are an expert financial market sentiment analyst specializing in the Indian stock market (NSE/BSE).

Analyze each news article below with particular attention to factors that heavily drive Indian equity markets:
1. **FII & DII Flows**: Net buying/selling by Foreign Institutional Investors and Domestic Institutional Investors, bulk/block deals, and foreign inflows.
2. **RBI Policies**: Interest rate/repo rate decisions, CRR/SLR changes, monetary policy stance (hawkish/dovish/neutral), and RBI governor commentary.
3. **SEBI Audits & Regulatory Actions**: Warnings, investigations, forensic audits, penalties, or compliance directives issued by SEBI (which are typically high-impact bearish signals for affected entities or broader mid/small-caps).
4. **Government & Policy**: Union Budget allocations, GST rate changes, export duties, PLI schemes, and key macroeconomic indicators (CPI inflation, WPI, GDP growth).
5. **Corporate Actions & Health**: Quarterly earnings results (focusing on margins and management commentary), promoter share buybacks, promoter stake dilution or share pledging/unpledging, and official exchanges (NSE/BSE) corporate announcements.
6. **Market Rumors vs Disclosures**: Treat unconfirmed speculative rumors with lower weight/higher risk and flag them unless backed by official corporate filings on NSE/BSE.

Analyze the text and return a JSON array with one object per article. Each object must have:
- "sentiment": number from -1.0 (very bearish) to 1.0 (very bullish)
- "label": "positive" | "negative" | "neutral"
- "category": one of "financial", "geopolitical", "policy", "earnings", "global"
- "impactLevel": "high" | "medium" | "low" (based on its potential to shift stock price or sector trends in India)
- "summary": a 1-2 sentence summary focused on specific market impact for Indian investors and key drivers identified above.
- "aspects": an array of aspect objects, where each object contains:
  - "entity": string name of the company or asset (e.g. "Reliance Industries", "Nifty", "HDFC Bank")
  - "aspect": must be one of "Demand/Sales", "Margins/Profit", "Regulatory/Legal", "Macro/Global", "Technical/Chart", "General"
  - "sentiment": number from -1.0 to 1.0 representing the aspect-specific sentiment

Articles:
${articleList}

Return ONLY a valid JSON array, no markdown and no explanation. Example:
[{"sentiment": 0.7, "label": "positive", "category": "financial", "impactLevel": "high", "summary": "Strong FII inflows of ₹2,500 crore coupled with positive US inflation data drives Nifty sentiment higher.", "aspects": [{"entity": "Nifty", "aspect": "Macro/Global", "sentiment": 0.8}]}]`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  const text = response.text || '';
  
  // Extract JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('No JSON array found in Gemini response');
  }

  const parsed: SentimentResult[] = JSON.parse(jsonMatch[0]);

  return articles.map((article, i) => {
    const analysis = parsed[i] || {
      sentiment: 0,
      label: 'neutral' as const,
      category: 'global' as const,
      impactLevel: 'low' as const,
      summary: article.description?.substring(0, 150) || article.title,
      aspects: [],
    };

    const baseWeight = getSourceWeight(article.source);
    const decayedWeight = computeDecayedWeight(baseWeight, article.pubDate || new Date().toISOString());

    return {
      id: `news-${Date.now()}-${i}`,
      title: article.title,
      source: article.source,
      url: article.link,
      publishedAt: article.pubDate || new Date().toISOString(),
      summary: analysis.summary || article.description?.substring(0, 200) || '',
      sentiment: analysis.sentiment,
      sentimentLabel: analysis.label,
      relatedSectors: detectSectors(article),
      relatedStocks: detectStocks(article),
      category: analysis.category,
      impactLevel: analysis.impactLevel,
      weight: baseWeight,
      decayedWeight: decayedWeight,
      aspects: analysis.aspects || [],
    };
  });
}

// Fallback keyword-based sentiment when Gemini is unavailable
function keywordFallback(article: RawArticle, id: string): NewsArticle {
  const text = `${article.title} ${article.description}`.toLowerCase();

  const bullishWords = ['surge', 'rally', 'gain', 'rise', 'jump', 'soar', 'boost', 'record', 'high', 'strong', 'growth', 'profit', 'buy', 'upgrade', 'positive', 'bullish', 'up'];
  const bearishWords = ['fall', 'drop', 'crash', 'decline', 'loss', 'low', 'weak', 'cut', 'warning', 'risk', 'sell', 'downgrade', 'negative', 'bearish', 'down', 'slump', 'concern'];

  let score = 0;
  bullishWords.forEach(w => { if (text.includes(w)) score += 0.15; });
  bearishWords.forEach(w => { if (text.includes(w)) score -= 0.15; });
  score = Math.max(-1, Math.min(1, score));

  const label: 'positive' | 'negative' | 'neutral' = score > 0.1 ? 'positive' : score < -0.1 ? 'negative' : 'neutral';

  // Detect category
  let category: NewsArticle['category'] = 'global';
  if (text.includes('rbi') || text.includes('policy') || text.includes('regulation') || text.includes('government')) category = 'policy';
  else if (text.includes('geopolitical') || text.includes('war') || text.includes('tension') || text.includes('conflict')) category = 'geopolitical';
  else if (text.includes('earnings') || text.includes('quarterly') || text.includes('result') || text.includes('profit')) category = 'earnings';
  else if (text.includes('stock') || text.includes('market') || text.includes('nse') || text.includes('bse')) category = 'financial';

  const baseWeight = getSourceWeight(article.source);
  const decayedWeight = computeDecayedWeight(baseWeight, article.pubDate || new Date().toISOString());

  // Simple aspect parser for fallback
  const aspects: AspectSentiment[] = [];
  const stockMentions = detectStocks(article);
  const targetEntity = stockMentions.length > 0 ? stockMentions[0] : 'Market';
  
  if (text.includes('sale') || text.includes('demand') || text.includes('order') || text.includes('grow')) {
    aspects.push({
      entity: targetEntity,
      aspect: 'Demand/Sales',
      sentiment: score > 0 ? 0.7 : score < 0 ? -0.7 : 0,
    });
  }
  if (text.includes('margin') || text.includes('profit') || text.includes('cost') || text.includes('loss')) {
    aspects.push({
      entity: targetEntity,
      aspect: 'Margins/Profit',
      sentiment: score > 0 ? 0.6 : score < 0 ? -0.6 : 0,
    });
  }
  if (aspects.length === 0) {
    aspects.push({
      entity: targetEntity,
      aspect: 'General',
      sentiment: score,
    });
  }

  return {
    id,
    title: article.title,
    source: article.source,
    url: article.link,
    publishedAt: article.pubDate || new Date().toISOString(),
    summary: article.description?.substring(0, 200) || article.title,
    sentiment: score,
    sentimentLabel: label,
    relatedSectors: detectSectors(article),
    relatedStocks: detectStocks(article),
    category,
    impactLevel: Math.abs(score) > 0.5 ? 'high' : Math.abs(score) > 0.2 ? 'medium' : 'low',
    weight: baseWeight,
    decayedWeight: decayedWeight,
    aspects,
  };
}

// Compute sector sentiment from analyzed articles using weighted averages with time decay
export function computeSectorSentiments(articles: NewsArticle[]): Record<string, { score: number; articleCount: number; keyDriver: string }> {
  const sectorScores: Record<string, { weightedTotal: number; totalWeight: number; count: number; topArticle: string; topScore: number }> = {};

  for (const article of articles) {
    const weight = article.decayedWeight ?? article.weight ?? 1.0;
    for (const sector of article.relatedSectors) {
      if (!sectorScores[sector]) {
        sectorScores[sector] = { weightedTotal: 0, totalWeight: 0, count: 0, topArticle: '', topScore: 0 };
      }
      sectorScores[sector].weightedTotal += article.sentiment * weight;
      sectorScores[sector].totalWeight += weight;
      sectorScores[sector].count += 1;

      if (Math.abs(article.sentiment) > Math.abs(sectorScores[sector].topScore)) {
        sectorScores[sector].topScore = article.sentiment;
        sectorScores[sector].topArticle = article.title;
      }
    }
  }

  const result: Record<string, { score: number; articleCount: number; keyDriver: string }> = {};

  for (const [sector, data] of Object.entries(sectorScores)) {
    const avgSentiment = data.totalWeight > 0 ? data.weightedTotal / data.totalWeight : 0;
    // Convert -1..1 range to 0..100
    const score = Math.round(Math.max(0, Math.min(100, (avgSentiment + 1) * 50)));
    result[sector] = {
      score,
      articleCount: data.count,
      keyDriver: data.topArticle,
    };
  }

  return result;
}
