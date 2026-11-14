-- BANCO EXCLUSIVO DE FOTOS (Cloudflare D1 separado: lola-admin-fotos).
-- NÃO instalar esta migration no banco DB de catálogo.
-- Nenhum usuário, pedido, pagamento, recibo ou estoque neste banco.
CREATE TABLE IF NOT EXISTS product_photos (
  product_id TEXT PRIMARY KEY CHECK(length(product_id) BETWEEN 2 AND 64),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/webp','image/jpeg','image/png')),
  bytes BLOB NOT NULL CHECK (length(bytes) BETWEEN 20 AND 307200),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
