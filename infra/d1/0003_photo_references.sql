-- REFERÊNCIA (SEM BLOB) no banco principal DB.
-- Fotos residem APENAS no binding separado PHOTOS_DB.
CREATE TABLE IF NOT EXISTS catalog_photo_index (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
