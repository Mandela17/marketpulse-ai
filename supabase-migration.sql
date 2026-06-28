-- MarketPulse AI — Supabase Schema Migration
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- Drop existing tables/views if they exist to ensure a clean slate with the new schema
DROP VIEW IF EXISTS prediction_accuracy;
DROP TABLE IF EXISTS predictions CASCADE;
DROP TABLE IF EXISTS daily_features CASCADE;
DROP TABLE IF EXISTS fii_dii_flows CASCADE;

-- ─── 1. Predictions Table ────────────────────────────────────────────
-- Tracks every prediction the model makes, and its resolution after market close.
CREATE TABLE IF NOT EXISTS predictions (
  id          BIGSERIAL PRIMARY KEY,
  symbol      TEXT NOT NULL,
  predicted_direction TEXT NOT NULL CHECK (predicted_direction IN ('up', 'down')),
  probability INTEGER NOT NULL CHECK (probability BETWEEN 0 AND 100),
  confidence_level TEXT NOT NULL DEFAULT 'low' CHECK (confidence_level IN ('low', 'moderate', 'high', 'very_high')),
  features_json JSONB,                      -- snapshot of all features used
  supporting_signals TEXT[] DEFAULT '{}',    -- human-readable bullish/bearish reasons
  contradicting_signals TEXT[] DEFAULT '{}',
  model_version TEXT NOT NULL DEFAULT 'v1',
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Resolution fields (filled after market close)
  actual_direction TEXT CHECK (actual_direction IN ('up', 'down')),
  actual_return NUMERIC(8,4),               -- actual % return next day
  resolved_at TIMESTAMPTZ,
  is_correct BOOLEAN,

  -- Indexing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_symbol ON predictions(symbol);
CREATE INDEX IF NOT EXISTS idx_predictions_predicted_at ON predictions(predicted_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_unresolved ON predictions(symbol, resolved_at);

-- ─── 2. Daily Features Table ─────────────────────────────────────────
-- One row per stock per day — the feature vector for ML training.
CREATE TABLE IF NOT EXISTS daily_features (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL,
  date            DATE NOT NULL,
  -- Price data
  open            NUMERIC(12,2),
  high            NUMERIC(12,2),
  low             NUMERIC(12,2),
  close           NUMERIC(12,2) NOT NULL,
  volume          BIGINT,
  -- Technical indicators
  rsi             NUMERIC(6,2),
  macd_hist       NUMERIC(10,4),
  ema20           NUMERIC(12,2),
  ema50           NUMERIC(12,2),
  bollinger_upper NUMERIC(12,2),
  bollinger_lower NUMERIC(12,2),
  volume_ratio    NUMERIC(6,2),
  -- Sentiment
  sentiment_score INTEGER CHECK (sentiment_score BETWEEN 0 AND 100),
  article_count   INTEGER DEFAULT 0,
  -- Derivatives (real or mock)
  pcr             NUMERIC(6,2),
  delivery_pct    NUMERIC(6,2),
  -- Market context
  nifty_close     NUMERIC(12,2),
  india_vix       NUMERIC(6,2),
  fii_net         NUMERIC(12,2),         -- in ₹ Crores
  dii_net         NUMERIC(12,2),
  -- Metadata
  data_source     TEXT DEFAULT 'yahoo',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_features_symbol_date ON daily_features(symbol, date DESC);

-- ─── 3. FII/DII Flow Table ───────────────────────────────────────────
-- Daily institutional flow data from NSE.
CREATE TABLE IF NOT EXISTS fii_dii_flows (
  id        BIGSERIAL PRIMARY KEY,
  date      DATE NOT NULL UNIQUE,
  fii_buy   NUMERIC(12,2),
  fii_sell  NUMERIC(12,2),
  fii_net   NUMERIC(12,2),
  dii_buy   NUMERIC(12,2),
  dii_sell  NUMERIC(12,2),
  dii_net   NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fii_dii_date ON fii_dii_flows(date DESC);

-- ─── 4. Accuracy Metrics View ────────────────────────────────────────
-- Materialized view for quick accuracy lookups.
CREATE OR REPLACE VIEW prediction_accuracy AS
SELECT
  symbol,
  COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS total_resolved,
  COUNT(*) FILTER (WHERE is_correct = true) AS correct_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE is_correct = true) /
    NULLIF(COUNT(*) FILTER (WHERE resolved_at IS NOT NULL), 0),
    1
  ) AS accuracy_pct,
  COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND predicted_at > NOW() - INTERVAL '30 days') AS resolved_30d,
  COUNT(*) FILTER (WHERE is_correct = true AND predicted_at > NOW() - INTERVAL '30 days') AS correct_30d,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE is_correct = true AND predicted_at > NOW() - INTERVAL '30 days') /
    NULLIF(COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND predicted_at > NOW() - INTERVAL '30 days'), 0),
    1
  ) AS accuracy_30d_pct
FROM predictions
GROUP BY symbol;

-- ─── 5. Enable RLS (Row Level Security) ──────────────────────────────
-- Predictions and features are publicly readable, writable only by service role.
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE fii_dii_flows ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read predictions" ON predictions FOR SELECT USING (true);
CREATE POLICY "Public read daily_features" ON daily_features FOR SELECT USING (true);
CREATE POLICY "Public read fii_dii_flows" ON fii_dii_flows FOR SELECT USING (true);

-- Service role write access
CREATE POLICY "Service write predictions" ON predictions FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update predictions" ON predictions FOR UPDATE USING (true);
CREATE POLICY "Service write daily_features" ON daily_features FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update daily_features" ON daily_features FOR UPDATE USING (true);
CREATE POLICY "Service write fii_dii_flows" ON fii_dii_flows FOR INSERT WITH CHECK (true);

-- ─── 4. Broker Tokens Table ─────────────────────────────────────────
-- Stores OAuth access tokens for broker APIs (Upstox/Zerodha) for server-side cron access.
CREATE TABLE IF NOT EXISTS broker_tokens (
  id          BIGSERIAL PRIMARY KEY,
  provider    TEXT NOT NULL DEFAULT 'upstox',
  user_id     TEXT NOT NULL DEFAULT 'default',
  access_token TEXT NOT NULL,
  expires_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  is_valid    BOOLEAN DEFAULT TRUE,
  UNIQUE(provider, user_id)
);

CREATE INDEX IF NOT EXISTS idx_broker_tokens_provider ON broker_tokens (provider, is_valid);

ALTER TABLE broker_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read broker_tokens" ON broker_tokens FOR SELECT USING (true);
CREATE POLICY "Service write broker_tokens" ON broker_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update broker_tokens" ON broker_tokens FOR UPDATE USING (true);
