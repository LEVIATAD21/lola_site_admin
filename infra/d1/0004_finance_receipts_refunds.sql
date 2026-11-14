-- Recibos, reembolsos e eventos confirmados pelo provedor, em DB (NÃO PHOTOS_DB).
-- Sem dados bancários, documentos de identidade, cartão ou imagem de recibo.
CREATE TABLE IF NOT EXISTS finance_webhook_events (
  event_id TEXT PRIMARY KEY CHECK (length(event_id) BETWEEN 6 AND 128),
  payment_id TEXT NOT NULL CHECK (length(payment_id) BETWEEN 2 AND 128),
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 5 AND 70),
  arrived_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_finance_events_payment ON finance_webhook_events(payment_id, arrived_at);
CREATE TABLE IF NOT EXISTS finance_payments (
  payment_id TEXT PRIMARY KEY CHECK (length(payment_id) BETWEEN 2 AND 128),
  external_reference TEXT CHECK (external_reference IS NULL OR length(external_reference) <= 128),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  status TEXT NOT NULL CHECK (length(status) BETWEEN 1 AND 48),
  billing_type TEXT NOT NULL CHECK (length(billing_type) BETWEEN 1 AND 35),
  receipt_url TEXT,
  last_event_id TEXT NOT NULL REFERENCES finance_webhook_events(event_id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_finance_payments_updated ON finance_payments(updated_at DESC);
CREATE TABLE IF NOT EXISTS finance_refunds (
  refund_key TEXT PRIMARY KEY CHECK(length(refund_key) = 64),
  payment_id TEXT NOT NULL REFERENCES finance_payments(payment_id),
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  status TEXT NOT NULL CHECK(status IN ('PENDING','DONE','CANCELLED','UNKNOWN')),
  receipt_url TEXT,
  refunded_at TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_finance_refunds_payment ON finance_refunds(payment_id, updated_at DESC);
