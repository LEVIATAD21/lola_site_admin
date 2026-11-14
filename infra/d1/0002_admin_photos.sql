-- Compatibilidade: nome histórico 0002_admin_photos.sql, mas aqui
-- constam SOMENTE tabelas de sessão e proteção do login no DB principal.
-- As fotos estão EXCLUSIVAMENTE no segundo D1, PHOTOS_DB, migration
-- infra/d1/0001_photos_only.sql. Sem dados de exemplo.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS admin_login_limits (
  key_hash TEXT PRIMARY KEY CHECK (length(key_hash) = 64),
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  reset_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_login_reset ON admin_login_limits(reset_at);
