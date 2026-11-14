import { auth, json, readJson, validProduct, asProduct, unavailable } from '../../_shared/adminApi.js';

const SELECT = `SELECT p.id,p.name,p.category,p.description,p.price_cents,p.published,
  COALESCE(i.quantity_on_hand-i.quantity_reserved,0) AS disponivel,
  EXISTS(SELECT 1 FROM catalog_photo_index f WHERE f.product_id=p.id) AS has_image
  FROM products p LEFT JOIN inventory i ON i.product_id=p.id
  WHERE p.archived_at IS NULL`;

export async function onRequestGet(context) {
  const result = await auth(context);
  if (result.error) return result.error;
  try {
    const value = await context.env.DB.prepare(SELECT + ' ORDER BY p.created_at DESC, p.id LIMIT 200').all();
    if (!value.success || !Array.isArray(value.results)) return unavailable();
    return json({ products: value.results.map(asProduct) });
  } catch { return unavailable(); }
}

export async function onRequestPost(context) {
  const result = await auth(context, true);
  if (result.error) return result.error;
  const body = await readJson(context.request);
  const item = validProduct(body);
  if (!item) return json({ error: 'Produto inválido: informe nome, categoria, preço, descrição e status.' }, 400);
  try {
    const count = await context.env.DB.prepare('SELECT COUNT(*) AS n FROM products WHERE archived_at IS NULL').first();
    if (Number(count?.n) >= 200) return json({ error: 'Limite inicial de 200 produtos atingido.' }, 409);
    const id = 'lola-' + crypto.randomUUID().replaceAll('-', '');
    await context.env.DB.batch([
      context.env.DB.prepare(`INSERT INTO products
        (id,name,category,description,price_cents,published)
        VALUES (?,?,?,?,?,?)`).bind(id,item.name,item.category,item.description,item.priceCents,item.published),
      context.env.DB.prepare('INSERT INTO inventory(product_id,quantity_on_hand,quantity_reserved) VALUES (?,0,0)').bind(id),
    ]);
    const row = await context.env.DB.prepare(SELECT + ' AND p.id=?').bind(id).first();
    if (!row) return unavailable();
    return json({ product: asProduct(row) }, 201);
  } catch { return unavailable(); }
}
