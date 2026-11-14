import { auth, json, readJson, validProduct, ID_PATTERN, asProduct, unavailable } from '../../../_shared/adminApi.js';

const SELECT = `SELECT p.id,p.name,p.category,p.description,p.price_cents,p.published,
  COALESCE(i.quantity_on_hand-i.quantity_reserved,0) AS disponivel,i.quantity_on_hand,i.quantity_reserved,
  EXISTS(SELECT 1 FROM catalog_photo_index f WHERE f.product_id=p.id) AS has_image
  FROM products p LEFT JOIN inventory i ON i.product_id=p.id
  WHERE p.id=? AND p.archived_at IS NULL`;

export async function onRequestPut(context) {
  const result = await auth(context, true);
  if (result.error) return result.error;
  const id = context.params?.id;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return json({ error: 'ID inválido.' }, 400);
  const item = validProduct(await readJson(context.request));
  if (!item) return json({ error: 'Dados de produto inválidos.' }, 400);
  try {
    const updated = await context.env.DB.prepare(`UPDATE products SET
      name=?,category=?,description=?,price_cents=?,published=?,updated_at=?
      WHERE id=? AND archived_at IS NULL`
    ).bind(item.name,item.category,item.description,item.priceCents,item.published,new Date().toISOString(),id).run();
    if (updated.meta?.changes === 0) return json({ error: 'Produto não encontrado.' }, 404);
    const row = await context.env.DB.prepare(SELECT).bind(id).first();
    if (!row) return unavailable();
    return json({ product: asProduct(row) });
  } catch { return unavailable(); }
}

export async function onRequestDelete(context) {
  const result = await auth(context, true);
  if (result.error) return result.error;
  const id = context.params?.id;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return json({ error: 'ID inválido.' }, 400);
  try {
    const stock = await context.env.DB.prepare(
      `SELECT i.quantity_on_hand,i.quantity_reserved
       FROM products p LEFT JOIN inventory i ON i.product_id=p.id WHERE p.id=?`
    ).bind(id).first();
    if (!stock) return json({ error: 'Produto não encontrado.' }, 404);
    if (Number(stock.quantity_on_hand || 0) !== 0 || Number(stock.quantity_reserved || 0) !== 0) {
      return json({ error: 'Zere o estoque e as reservas antes de excluir.' }, 409);
    }
    const orderTable=await context.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mp_orders'").first();
    if(orderTable) {
      const history=await context.env.DB.prepare('SELECT id FROM mp_orders WHERE product_id=? LIMIT 1').bind(id).first();
      if(history)return json({error:'Esta peça possui histórico de pedidos. Desative Exibir na loja para retirá-la da vitrine.'},409);
    }
    // Cross-database deletes are not atomic. Delete the photo bytes first,
    // then the reference and product records. Never claim success if PHOTOS_DB fails.
    if (!context.env.PHOTOS_DB) return unavailable();
    await context.env.PHOTOS_DB.prepare('DELETE FROM product_photos WHERE product_id=?').bind(id).run();
    await context.env.DB.batch([
      context.env.DB.prepare('DELETE FROM catalog_photo_index WHERE product_id=?').bind(id),
      context.env.DB.prepare('DELETE FROM inventory WHERE product_id=?').bind(id),
      context.env.DB.prepare('DELETE FROM products WHERE id=?').bind(id),
    ]);
    return json({ success: true });
  } catch { return unavailable(); }
}
