'use client';

import { useState, useEffect } from 'react';
import { NewsArticle } from '@/lib/types';
import { DEMO_NEWS } from '@/lib/mockData';
import NewsCard from '@/components/NewsCard';

const categories = [
  { id: 'all', label: 'All News', icon: '📰' },
  { id: 'financial', label: 'Financial', icon: '💰' },
  { id: 'geopolitical', label: 'Geopolitical', icon: '🌍' },
  { id: 'policy', label: 'Policy', icon: '📋' },
  { id: 'earnings', label: 'Earnings', icon: '📊' },
  { id: 'global', label: 'Global', icon: '🌐' },
];

const sentimentFilters = [
  { id: 'all', label: 'All', color: 'var(--text-secondary)' },
  { id: 'positive', label: 'Bullish', color: 'var(--accent-green)' },
  { id: 'neutral', label: 'Neutral', color: 'var(--accent-yellow)' },
  { id: 'negative', label: 'Bearish', color: 'var(--accent-red)' },
];

export default function NewsPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSentiment, setSelectedSentiment] = useState('all');
  const [news, setNews] = useState<NewsArticle[]>(DEMO_NEWS);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    async function fetchNews() {
      try {
        const res = await fetch('/api/news');
        const data = await res.json();
        if (data.articles && data.articles.length > 0) {
          setNews(data.articles);
          setIsLive(true);
        }
      } catch (e) {
        console.error('Failed to fetch live news:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchNews();
  }, []);

  const filteredNews = news.filter((article) => {
    const categoryMatch = selectedCategory === 'all' || article.category === selectedCategory;
    const sentimentMatch = selectedSentiment === 'all' || article.sentimentLabel === selectedSentiment;
    return categoryMatch && sentimentMatch;
  });

  return (
    <div style={{ width: '100%', maxWidth: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{
          fontSize: 'clamp(20px, 4vw, 28px)',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          color: 'var(--text-primary)',
          flexWrap: 'wrap',
        }}>
          📰 News Feed
          {isLive && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 9999,
              fontWeight: 700,
              background: 'var(--accent-green-dim)',
              color: 'var(--accent-green)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-green)', animation: 'pulse 2s infinite' }} />
              LIVE
            </span>
          )}
          {loading && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 9999,
              fontWeight: 700,
              background: 'var(--accent-yellow-dim)',
              color: 'var(--accent-yellow)',
            }}>
              ⏳ Loading...
            </span>
          )}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0, marginTop: 4 }}>
          {isLive ? 'Real-time news with Gemini AI sentiment analysis' : 'AI-powered sentiment analysis'}
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {/* Category filters */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {categories.map((cat) => (
            <button key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              style={{
                fontSize: 12,
                padding: '6px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.15s ease',
                background: selectedCategory === cat.id ? 'var(--accent-blue-dim)' : 'var(--bg-card)',
                color: selectedCategory === cat.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
                border: `1px solid ${selectedCategory === cat.id ? 'var(--accent-blue)' : 'var(--border-color)'}`,
              }}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        {/* Sentiment filters */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {sentimentFilters.map((f) => (
            <button key={f.id}
              onClick={() => setSelectedSentiment(f.id)}
              style={{
                fontSize: 12,
                padding: '6px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.15s ease',
                background: selectedSentiment === f.id ? `${f.color}20` : 'var(--bg-card)',
                color: selectedSentiment === f.id ? f.color : 'var(--text-secondary)',
                border: `1px solid ${selectedSentiment === f.id ? f.color : 'var(--border-color)'}`,
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Showing {filteredNews.length} of {news.length} articles
        </span>
      </div>

      {/* News Grid — responsive via CSS */}
      <div className="news-grid">
        {filteredNews.map((article) => (
          <NewsCard key={article.id} article={article} />
        ))}
      </div>

      {filteredNews.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ fontSize: 28, marginBottom: 8 }}>🔍</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No articles match your current filters
          </p>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{
            width: 40,
            height: 40,
            border: '3px solid var(--border-color)',
            borderTopColor: 'var(--accent-blue)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 12px',
          }} />
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Fetching live news & running Gemini sentiment analysis...
          </p>
        </div>
      )}
    </div>
  );
}
