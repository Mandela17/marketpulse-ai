// Real News Aggregator - Fetches live news from RSS feeds
// Sources: Google News India, MoneyControl, Economic Times, LiveMint

import { SECTORS } from './sectorData';

export interface RawArticle {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
}

// Google News RSS search for Indian market topics
const NEWS_FEEDS = [
  {
    url: 'https://news.google.com/rss/search?q=indian+stock+market+NSE+BSE&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Google News',
  },
  {
    url: 'https://news.google.com/rss/search?q=NIFTY+SENSEX+today&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Google News',
  },
  {
    url: 'https://news.google.com/rss/search?q=india+economy+RBI+policy&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Google News',
  },
  {
    url: 'https://news.google.com/rss/search?q=crude+oil+OPEC+energy+India&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Google News',
  },
  {
    url: 'https://news.google.com/rss/search?q=electric+vehicle+EV+India&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Google News',
  },
  {
    url: 'https://news.google.com/rss/search?q=gold+price+India+geopolitical&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Google News',
  },
  {
    url: 'https://news.google.com/rss/search?q=India+defense+HAL+BEL&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Google News',
  },
  {
    url: 'https://news.google.com/rss/search?q=India+power+solar+renewable+energy&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Google News',
  },
  {
    url: 'https://news.google.com/rss/search?q=India+auto+Maruti+Tata+Motors&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Google News',
  },
];

function parseXML(xml: string): RawArticle[] {
  const articles: RawArticle[] = [];
  
  // Simple regex-based XML parser for RSS items
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemContent = match[1];
    
    const title = extractTag(itemContent, 'title');
    const link = extractTag(itemContent, 'link');
    const pubDate = extractTag(itemContent, 'pubDate');
    const description = extractTag(itemContent, 'description');
    const source = extractTag(itemContent, 'source') || 'Google News';
    
    if (title) {
      articles.push({
        title: cleanHTML(title),
        link: link || '',
        source: cleanHTML(source),
        pubDate: pubDate || new Date().toISOString(),
        description: cleanHTML(description || ''),
      });
    }
  }
  
  return articles;
}

function extractTag(xml: string, tag: string): string {
  // Try CDATA first
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1];
  
  // Then regular content
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = regex.exec(xml);
  return match ? match[1] : '';
}

function cleanHTML(str: string): string {
  return str
    // First decode HTML entities so encoded tags become real tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Then strip all HTML tags (including decoded ones)
    .replace(/<[^>]*>/g, '')
    // Remove any remaining URLs
    .replace(/https?:\/\/\S+/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchAllNews(): Promise<RawArticle[]> {
  const allArticles: RawArticle[] = [];
  
  // Fetch from all feeds in parallel
  const feedPromises = NEWS_FEEDS.map(async (feed) => {
    try {
      const response = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        next: { revalidate: 900 }, // Cache for 15 minutes
      });
      
      if (!response.ok) {
        console.warn(`Failed to fetch ${feed.url}: ${response.status}`);
        return [];
      }
      
      const xml = await response.text();
      return parseXML(xml);
    } catch (error) {
      console.warn(`Error fetching ${feed.url}:`, error);
      return [];
    }
  });
  
  const results = await Promise.all(feedPromises);
  results.forEach(articles => allArticles.push(...articles));
  
  // Deduplicate by title similarity
  const seen = new Set<string>();
  const unique = allArticles.filter(article => {
    const key = article.title.toLowerCase().substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  // Sort by date (newest first)
  unique.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  
  return unique.slice(0, 40); // Return top 40 articles
}

// Detect which sectors an article relates to based on keywords
export function detectSectors(article: RawArticle): string[] {
  const text = `${article.title} ${article.description}`.toLowerCase();
  const matchedSectors: string[] = [];
  
  for (const [sectorId, sector] of Object.entries(SECTORS)) {
    const hasKeyword = sector.keywords.some(kw => text.includes(kw.toLowerCase()));
    const hasStock = sector.stocks.some(stock => text.includes(stock.toLowerCase()));
    
    if (hasKeyword || hasStock) {
      matchedSectors.push(sectorId);
    }
  }
  
  return matchedSectors;
}

// Detect which stocks are mentioned in an article
export function detectStocks(article: RawArticle): string[] {
  const text = `${article.title} ${article.description}`.toUpperCase();
  const matchedStocks = new Set<string>();
  
  for (const sector of Object.values(SECTORS)) {
    for (const stock of sector.stocks) {
      if (text.includes(stock)) {
        matchedStocks.add(stock);
      }
    }
  }
  
  return Array.from(matchedStocks);
}
