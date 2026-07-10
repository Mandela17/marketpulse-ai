-- Paper Trading State table
-- Stores the full paper trading state as JSONB for persistence across sessions

CREATE TABLE IF NOT EXISTS paper_trading_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  state JSONB NOT NULL DEFAULT '{}',
  auto_config JSONB,
  auto_log JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow full access (paper trading is single-user, no RLS needed)
ALTER TABLE paper_trading_state ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated and anon users
CREATE POLICY "Allow all access to paper_trading_state"
  ON paper_trading_state
  FOR ALL
  USING (true)
  WITH CHECK (true);
