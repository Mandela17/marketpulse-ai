// Gemini-powered Sentiment Analysis Engine
// Uses Google Gemini API to analyze news articles and compute sentiment scores

import { GoogleGenAI } from '@google/genai';
import { RawArticle, detectSectors, detectStocks } from './newsAggregator';
import { NewsArticle } from './types';

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

interface SentimentResult {
  sentiment: number; // -1 to 1
  label: 'positive' | 'negative' | 'neutral';
  category: 'financial' | 'geopolitical' | 'policy' | 'earnings' | 'global';
  impactLevel: 'high' | 'medium' | 'low';
  summary: string;
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
        const isRateLimit = error?.status === 429 || error?.message?.includes('429');
        if (isRateLimit && attempt < 1) {
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

  const prompt = `You are a financial market sentiment analyst specializing in the Indian stock market (NSE/BSE).

Analyze each news article below and return a JSON array with one object per article. Each object must have:
- "sentiment": number from -1.0 (very bearish) to 1.0 (very bullish)
- "label": "positive" or "negative" or "neutral"
- "category": one of "financial", "geopolitical", "policy", "earnings", "global"
- "impactLevel": "high", "medium", or "low" (based on how much it could move Indian markets)
- "summary": a 1-2 sentence summary focused on market impact for Indian investors

Articles:
${articleList}

Return ONLY a valid JSON array, no markdown or explanation. Example:
[{"sentiment": 0.7, "label": "positive", "category": "financial", "impactLevel": "high", "summary": "..."}]`;

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
    };

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
      weight: getSourceWeight(article.source),
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
    weight: getSourceWeight(article.source),
  };
}

// Compute sector sentiment from analyzed articles using weighted averages
export function computeSectorSentiments(articles: NewsArticle[]): Record<string, { score: number; articleCount: number; keyDriver: string }> {
  const sectorScores: Record<string, { weightedTotal: number; totalWeight: number; count: number; topArticle: string; topScore: number }> = {};

  for (const article of articles) {
    const weight = article.weight || 1.0;
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
