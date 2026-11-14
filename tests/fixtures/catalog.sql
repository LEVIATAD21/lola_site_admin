-- Migração do Worker temporário D1; SQLite, NÃO PostgreSQL.
-- Sem dados de exemplo, usuários, pedidos ou transações financeiras.
-- Crie somente a estrutura mínima necessária para comprovar acesso ao catálogo.
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 2 AND 64),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 180),
  category TEXT NOT NULL CHECK (length(category) BETWEEN 1 AND 100),
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_d1_products_published
  ON products(category, name)
  WHERE published = 1 AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS inventory (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE RESTRICT,
  quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (quantity_reserved <= quantity_on_hand)
);

