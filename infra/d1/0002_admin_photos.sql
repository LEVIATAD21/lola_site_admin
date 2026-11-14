-- LOLA D1 — suporte administrativo e fotos pequenas no próprio D1.
-- SEM INSERT de produtos; banco permanece vazio até cadastro real.
-- Executar uma vez, após 0001_catalog.sql, com backup e banco correto.
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

-- Limite deliberado: fotos convertidas em WebP/JPEG pelo navegador,
-- no máximo 300KiB por produto. Catálogos grandes devem migrar para R2.
CREATE TABLE IF NOT EXISTS product_photos (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/webp','image/jpeg','image/png')),
  bytes BLOB NOT NULL CHECK (length(bytes) BETWEEN 20 AND 307200),
  updated_at INTEGER NOT NULL
);
