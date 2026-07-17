-- Add status column to profiles for activation workflow
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Login history table
CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'email',
  ip_address TEXT,
  user_agent TEXT,
  browser TEXT,
  os TEXT,
  device TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_created_at ON login_history(created_at DESC);

-- Active sessions table
CREATE TABLE IF NOT EXISTS active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'email',
  ip_address TEXT,
  user_agent TEXT,
  browser TEXT,
  os TEXT,
  device TEXT,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_session_id ON active_sessions(session_id);

-- Row level security
ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view their own login history
CREATE POLICY "Users view own login history" ON login_history
  FOR SELECT USING (auth.uid() = user_id);

-- Admin can view all login history
CREATE POLICY "Admin view all login history" ON login_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Users can view and manage their own sessions
CREATE POLICY "Users manage own sessions" ON active_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Admin can view all sessions
CREATE POLICY "Admin view all sessions" ON active_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
