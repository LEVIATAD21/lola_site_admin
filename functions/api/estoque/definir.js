import { auth, json, readJson, ID_PATTERN, unavailable } from '../../_shared/adminApi.js';

export async function onRequestPost(context) {
  const result = await auth(context, true);
  if (result.error) return result.error;
  const body = await readJson(context.request);
  const id = body?.productId;
  const qty = body?.quantidade;
  if (typeof id !== 'string' || !ID_PATTERN.test(id) ||
      !Number.isSafeInteger(qty) || qty < 0 || qty > 1000000) {
    return json({ error: 'Estoque inválido. Informe um número inteiro entre 0 e 1.000.000.' }, 400);
  }
  try {
    const product = await context.env.DB.prepare('SELECT id FROM products WHERE id=? AND archived_at IS NULL').bind(id).first();
    if (!product) return json({ error: 'Produto não encontrado.' }, 404);
    const reserved = await context.env.DB.prepare('SELECT quantity_reserved FROM inventory WHERE product_id=?').bind(id).first('quantity_reserved');
    if (Number(reserved || 0) > qty) return json({ error: 'Quantidade menor que a reserva existente.' }, 409);
    await context.env.DB.prepare(`INSERT INTO inventory(product_id,quantity_on_hand,quantity_reserved,updated_at)
      VALUES (?,?,0,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(product_id) DO UPDATE SET
      quantity_on_hand=excluded.quantity_on_hand,updated_at=excluded.updated_at`).bind(id,qty).run();
    return json({ success: true, productId: id, disponivel: qty - Number(reserved || 0) });
  } catch { return unavailable(); }
}
