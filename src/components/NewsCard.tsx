'use client';

import { NewsArticle } from '@/lib/types';

// Strip any remaining HTML tags and URLs from text
function cleanText(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/https?:\/\/\S+/g, '') // Remove URLs
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

interface NewsCardProps {
  article: NewsArticle;
  compact?: boolean;
}

export default function NewsCard({ article, compact = false }: NewsCardProps) {
  const sentimentColor = article.sentimentLabel === 'positive' ? 'var(--accent-green)' :
    article.sentimentLabel === 'negative' ? 'var(--accent-red)' : 'var(--accent-yellow)';
  const sentimentBg = article.sentimentLabel === 'positive' ? 'var(--accent-green-dim)' :
    article.sentimentLabel === 'negative' ? 'var(--accent-red-dim)' : 'var(--accent-yellow-dim)';

  const impactColor = article.impactLevel === 'high' ? 'var(--accent-red)' :
    article.impactLevel === 'medium' ? 'var(--accent-yellow)' : 'var(--text-muted)';

  const categoryIcons: Record<string, string> = {
    financial: '💰',
    geopolitical: '🌍',
    policy: '📋',
    earnings: '📊',
    global: '🌐',
  };

  const timeAgo = getTimeAgo(new Date(article.publishedAt));

  if (compact) {
    return (
      <div className="flex items-start gap-3 py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug mb-1 hover:underline cursor-pointer"
            style={{ color: 'var(--text-primary)' }}>
            {cleanText(article.title)}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{article.source}</span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>·</span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{timeAgo}</span>
            <span className="sentiment-badge"
              style={{ background: sentimentBg, color: sentimentColor, fontSize: '10px', padding: '1px 6px' }}>
              {article.sentimentLabel === 'positive' ? '▲' : article.sentimentLabel === 'negative' ? '▼' : '—'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card-hover rounded-xl p-4 mb-3"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      {/* Header badges */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="sentiment-badge"
          style={{ background: sentimentBg, color: sentimentColor }}>
          {article.sentimentLabel === 'positive' ? '▲ Bullish' : article.sentimentLabel === 'negative' ? '▼ Bearish' : '— Neutral'}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{
            background: 'var(--bg-primary)',
            color: impactColor,
            border: `1px solid ${impactColor}30`,
          }}>
          {article.impactLevel.toUpperCase()} IMPACT
        </span>
        <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
          {categoryIcons[article.category]} {article.category}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold mb-2 leading-snug cursor-pointer hover:underline"
        style={{ color: 'var(--text-primary)' }}>
        {cleanText(article.title)}
      </h3>

      {/* Summary */}
      <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
        {cleanText(article.summary).substring(0, 200)}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: 'var(--accent-blue)' }}>
            {article.source}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {timeAgo}
          </span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {article.relatedStocks.slice(0, 3).map((stock) => (
            <span key={stock} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)' }}>
              {stock}
            </span>
          ))}
          {article.relatedSectors.map((sector) => (
            <span key={sector} className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--accent-purple-dim)', color: 'var(--accent-purple)' }}>
              {sector}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
