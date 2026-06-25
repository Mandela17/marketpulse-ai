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
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '12px 0',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: '14px',
            fontWeight: 500,
            lineHeight: 1.4,
            marginBottom: '4px',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}>
            {cleanText(article.title)}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{article.source}</span>
            {article.decayedWeight !== undefined ? (
              <span style={{
                fontSize: '9px',
                padding: '0 4px',
                borderRadius: '4px',
                fontWeight: 500,
                background: 'rgba(255,255,255,0.05)',
                color: article.decayedWeight < (article.weight || 1.0) ? 'var(--accent-yellow)' : 'var(--text-muted)',
              }}
                title={`Decayed weight due to age: ${article.decayedWeight}x (base ${article.weight}x)`}
              >
                {article.decayedWeight}x
              </span>
            ) : article.weight && (
              <span style={{ fontSize: '9px', padding: '0 4px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                {article.weight}x
              </span>
            )}
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>·</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{timeAgo}</span>
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
    <div className="card-hover"
      style={{
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '12px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
      }}>
      {/* Header badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <span className="sentiment-badge"
          style={{ background: sentimentBg, color: sentimentColor }}>
          {article.sentimentLabel === 'positive' ? '▲ Bullish' : article.sentimentLabel === 'negative' ? '▼ Bearish' : '— Neutral'}
        </span>
        <span style={{
          fontSize: '10px',
          padding: '2px 8px',
          borderRadius: '9999px',
          fontWeight: 500,
          background: 'var(--bg-primary)',
          color: impactColor,
          border: `1px solid ${impactColor}30`,
        }}>
          {article.impactLevel.toUpperCase()} IMPACT
        </span>
        <span style={{ fontSize: '12px', marginLeft: 'auto', color: 'var(--text-muted)' }}>
          {categoryIcons[article.category]} {article.category}
        </span>
      </div>

      {/* Title */}
      <h3 style={{
        fontSize: '16px',
        fontWeight: 600,
        marginBottom: '8px',
        lineHeight: 1.4,
        cursor: 'pointer',
        color: 'var(--text-primary)',
      }}>
        {cleanText(article.title)}
      </h3>

      {/* Summary */}
      <p style={{
        fontSize: '12px',
        lineHeight: 1.6,
        marginBottom: '12px',
        color: 'var(--text-secondary)',
      }}>
        {cleanText(article.summary).substring(0, 200)}
      </p>

      {/* Aspect Breakdowns */}
      {article.aspects && article.aspects.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexWrap: 'wrap',
          marginBottom: '12px',
          borderTop: '1px solid rgba(255,255,255,0.03)',
          borderBottom: '1px solid rgba(255,255,255,0.03)',
          padding: '8px 0',
        }}>
          <span style={{
            fontSize: '9px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontWeight: 600,
            marginRight: '4px',
            color: 'var(--text-muted)',
          }}>
            Aspects:
          </span>
          {article.aspects.map((asp, idx) => {
            const aspectColor = asp.sentiment > 0.1 ? 'var(--accent-green)' :
              asp.sentiment < -0.1 ? 'var(--accent-red)' : 'var(--accent-yellow)';
            const aspectBg = asp.sentiment > 0.1 ? 'var(--accent-green-dim)' :
              asp.sentiment < -0.1 ? 'var(--accent-red-dim)' : 'var(--accent-yellow-dim)';
            return (
              <span key={idx} style={{
                fontSize: '10px',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 500,
                background: aspectBg,
                color: aspectColor,
              }}>
                {asp.entity} ({asp.aspect}): {asp.sentiment > 0 ? '+' : ''}{asp.sentiment.toFixed(1)}
              </span>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--accent-blue)' }}>
            {article.source}
          </span>
          {article.decayedWeight !== undefined ? (
            <span style={{
              fontSize: '9px',
              padding: '1px 6px',
              borderRadius: '4px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: article.decayedWeight >= 1.4 ? 'var(--accent-purple-dim)' : 'rgba(255,255,255,0.05)',
              color: article.decayedWeight >= 1.4 ? 'var(--accent-purple)' : 'var(--text-secondary)',
              border: article.decayedWeight >= 1.4 ? '1px solid var(--accent-purple-dim)' : '1px solid rgba(255,255,255,0.03)',
            }}
              title={`Base weight: ${article.weight}x. Reduced to ${article.decayedWeight}x due to age decay.`}
            >
              <span>{article.decayedWeight}x Authority</span>
              {article.decayedWeight < (article.weight || 1.0) && (
                <span style={{ fontSize: '8px', opacity: 0.75 }}>⏳ decayed</span>
              )}
            </span>
          ) : article.weight && (
            <span style={{
              fontSize: '9px',
              padding: '1px 6px',
              borderRadius: '4px',
              fontWeight: 700,
              background: article.weight >= 1.4 ? 'var(--accent-purple-dim)' : 'rgba(255,255,255,0.05)',
              color: article.weight >= 1.4 ? 'var(--accent-purple)' : 'var(--text-secondary)',
              border: article.weight >= 1.4 ? '1px solid var(--accent-purple-dim)' : '1px solid rgba(255,255,255,0.03)',
            }}>
              {article.weight}x Weight
            </span>
          )}
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {timeAgo}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {article.relatedStocks.slice(0, 3).map((stock) => (
            <span key={stock} style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              fontWeight: 500,
              background: 'var(--accent-blue-dim)',
              color: 'var(--accent-blue)',
            }}>
              {stock}
            </span>
          ))}
          {article.relatedSectors.map((sector) => (
            <span key={sector} style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'var(--accent-purple-dim)',
              color: 'var(--accent-purple)',
            }}>
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
