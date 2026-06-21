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
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
          News Feed
          {isLive && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: 'var(--accent-green-dim)', color: 'var(--accent-green)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-green)' }} />
              LIVE
            </span>
          )}
          {loading && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: 'var(--accent-yellow-dim)', color: 'var(--accent-yellow)' }}>
              ⏳ Loading...
            </span>
          )}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          {isLive ? 'Real-time news with Gemini AI sentiment analysis' : 'AI-powered sentiment analysis'}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex gap-1 flex-wrap">
          {categories.map((cat) => (
            <button key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className="text-xs px-3 py-1.5 rounded-lg transition-all font-medium cursor-pointer"
              style={{
                background: selectedCategory === cat.id ? 'var(--accent-blue-dim)' : 'var(--bg-card)',
                color: selectedCategory === cat.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
                border: `1px solid ${selectedCategory === cat.id ? 'var(--accent-blue)' : 'var(--border-color)'}`,
              }}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {sentimentFilters.map((f) => (
            <button key={f.id}
              onClick={() => setSelectedSentiment(f.id)}
              className="text-xs px-3 py-1.5 rounded-lg transition-all font-medium cursor-pointer"
              style={{
                background: selectedSentiment === f.id ? `${f.color}20` : 'var(--bg-card)',
                color: selectedSentiment === f.id ? f.color : 'var(--text-secondary)',
                border: `1px solid ${selectedSentiment === f.id ? f.color : 'var(--border-color)'}`,
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Showing {filteredNews.length} of {news.length} articles
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredNews.map((article) => (
          <NewsCard key={article.id} article={article} />
        ))}
      </div>

      {filteredNews.length === 0 && !loading && (
        <div className="text-center py-12">
          <p className="text-3xl mb-3">🔍</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No articles match your current filters
          </p>
        </div>
      )}

      {loading && (
        <div className="text-center py-12">
          <div className="w-10 h-10 border-3 rounded-full animate-spin mx-auto mb-3"
            style={{ borderColor: 'var(--border-color)', borderTopColor: 'var(--accent-blue)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Fetching live news & running Gemini sentiment analysis...
          </p>
        </div>
      )}
    </div>
  );
}
