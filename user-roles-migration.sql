-- MarketPulse AI — User Roles & Access Control Migration
-- Run this in Supabase SQL Editor to add RBAC support
-- This ONLY adds the user_roles table (safe to run on existing DB)

-- Create user_roles table
CREATE TABLE IF NOT EXISTS user_roles (
  id          SERIAL PRIMARY KEY,
  user_id     UUID NOT NULL UNIQUE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('super_admin', 'admin', 'user')),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_status ON user_roles (status);
CREATE INDEX IF NOT EXISTS idx_user_roles_email ON user_roles (email);

-- RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe re-run)
DROP POLICY IF EXISTS "Service read user_roles" ON user_roles;
DROP POLICY IF EXISTS "Service insert user_roles" ON user_roles;
DROP POLICY IF EXISTS "Service update user_roles" ON user_roles;

CREATE POLICY "Service read user_roles" ON user_roles FOR SELECT USING (true);
CREATE POLICY "Service insert user_roles" ON user_roles FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update user_roles" ON user_roles FOR UPDATE USING (true);
