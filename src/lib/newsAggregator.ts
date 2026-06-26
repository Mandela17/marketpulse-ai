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
  // ─── Core Market Coverage ───
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
  // ─── Sector-Specific Feeds ───
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
  // ─── Financial Data Source Feeds ───
  {
    url: 'https://news.google.com/rss/search?q=FII+DII+activity+India+market&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Google News',
  },
  {
    url: 'https://news.google.com/rss/search?q=India+banking+HDFC+ICICI+SBI+NPA+credit+growth&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Google News',
  },
  {
    url: 'https://news.google.com/rss/search?q=India+pharma+FDA+drug+approval+generic&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Google News',
  },
  {
    url: 'https://news.google.com/rss/search?q=India+steel+metal+mining+copper+aluminium&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Google News',
  },
  {
    url: 'https://news.google.com/rss/search?q=India+real+estate+housing+DLF+Godrej+property&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Google News',
  },
  {
    url: 'https://news.google.com/rss/search?q=SEBI+regulation+circular+order+India&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Google News',
  },
  {
    url: 'https://news.google.com/rss/search?q=India+IT+TCS+Infosys+Wipro+outsourcing+AI&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Google News',
  },
  // ─── Publication-Specific Feeds ───
  {
    url: 'https://news.google.com/rss/search?q=site:moneycontrol.com+market+news&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Moneycontrol',
  },
  {
    url: 'https://news.google.com/rss/search?q=site:economictimes.indiatimes.com+stock+market&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Economic Times',
  },
  {
    url: 'https://news.google.com/rss/search?q=site:livemint.com+market&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Livemint',
  },
  {
    url: 'https://news.google.com/rss/search?q=site:ndtvprofit.com+stock+market&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'NDTV Profit',
  },
  {
    url: 'https://news.google.com/rss/search?q=site:business-standard.com+stock+market+India&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Business Standard',
  },
  // ─── Miscellaneous ───
  {
    url: 'https://news.google.com/rss/search?q=corporate+announcements+disclosures+NSE+BSE&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Corporate Announcements',
  },
  {
    url: 'https://news.google.com/rss/search?q=bulk+deal+block+deal+NSE+BSE+India&hl=en-IN&gl=IN&ceid=IN:en',
    source: 'Bulk/Block Deals',
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
  
  // Deduplicate using Jaccard similarity on word sets (much better than 50-char prefix)
  const unique = deduplicateArticles(allArticles);
  
  // Sort by date (newest first)
  unique.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  
  return unique.slice(0, 80); // Return top 80 articles (was 40)
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

// ─── Jaccard Similarity Deduplication ────────────────────────────────

function getWordSet(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2) // skip short words
  );
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function deduplicateArticles(articles: RawArticle[]): RawArticle[] {
  const unique: RawArticle[] = [];
  const wordSets: Set<string>[] = [];
  const SIMILARITY_THRESHOLD = 0.6; // Articles with >60% word overlap are duplicates

  for (const article of articles) {
    const titleWords = getWordSet(article.title);
    let isDuplicate = false;

    for (const existingSet of wordSets) {
      if (jaccardSimilarity(titleWords, existingSet) > SIMILARITY_THRESHOLD) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      unique.push(article);
      wordSets.push(titleWords);
    }
  }

  return unique;
}

// ─── Article Hash (for preventing re-analysis) ──────────────────────

export function computeArticleHash(article: RawArticle): string {
  const str = `${article.title}|${article.link}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
