CREATE TABLE IF NOT EXISTS mp_orders (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 product_name TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 100),
 amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 100 AND 100000000),
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','processing','pending','approved','rejected','cancelled','expired','refunded','charged_back')),
 payment_id TEXT UNIQUE, method TEXT, qr_code TEXT, qr_image TEXT,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()), expires_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX IF NOT EXISTS mp_orders_pending ON mp_orders(state,expires_at);
CREATE TABLE IF NOT EXISTS mp_checkout_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, reset_at INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS mp_reserve BEFORE INSERT ON mp_orders BEGIN
 SELECT CASE WHEN NEW.state!='draft' THEN RAISE(ABORT,'invalid initial state') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND published=1 AND archived_at IS NULL AND price_cents*NEW.quantity=NEW.amount_cents) THEN RAISE(ABORT,'invalid product quote') END;
 UPDATE inventory SET quantity_reserved=quantity_reserved+NEW.quantity WHERE product_id=NEW.product_id AND quantity_on_hand-quantity_reserved>=NEW.quantity;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'stock unavailable') END;
END;
CREATE TRIGGER IF NOT EXISTS mp_immutable BEFORE UPDATE ON mp_orders WHEN NEW.id!=OLD.id OR NEW.token_hash!=OLD.token_hash OR NEW.product_id!=OLD.product_id OR NEW.quantity!=OLD.quantity OR NEW.amount_cents!=OLD.amount_cents BEGIN
 SELECT RAISE(ABORT,'immutable order');
END;
CREATE TRIGGER IF NOT EXISTS mp_state_guard BEFORE UPDATE OF state ON mp_orders WHEN NEW.state!=OLD.state BEGIN
 SELECT CASE WHEN NOT (
 (OLD.state='draft' AND NEW.state IN ('processing','expired','cancelled')) OR
 (OLD.state IN ('processing','pending') AND NEW.state IN ('pending','approved','rejected','cancelled')) OR
 (OLD.state='approved' AND NEW.state IN ('refunded','charged_back'))
 ) THEN RAISE(ABORT,'invalid state transition') END;
END;
CREATE TRIGGER IF NOT EXISTS mp_release AFTER UPDATE OF state ON mp_orders WHEN OLD.state!=NEW.state AND NEW.state IN ('expired','rejected','cancelled') BEGIN
 UPDATE inventory SET quantity_reserved=quantity_reserved-OLD.quantity WHERE product_id=OLD.product_id;
END;
CREATE TRIGGER IF NOT EXISTS mp_fulfill AFTER UPDATE OF state ON mp_orders WHEN OLD.state!=NEW.state AND NEW.state='approved' BEGIN
 UPDATE inventory SET quantity_on_hand=quantity_on_hand-OLD.quantity,quantity_reserved=quantity_reserved-OLD.quantity WHERE product_id=OLD.product_id;
END;
