import { reply, requireReadOnly, unavailable } from '../../../_shared/publicApi.js';

const PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

/** Original storefront contract: GET /api/estoque/:productId */
export async function onRequest(context) {
  const rejected = requireReadOnly(context);
  if (rejected) return rejected;
  const id = context.params?.productId;
  if (typeof id !== 'string' || !PRODUCT_ID_PATTERN.test(id)) {
    return reply({ error: 'Identificador de produto inválido.' }, 400);
  }
  try {
    const info = await context.env.DB.prepare(
      `SELECT p.id, COALESCE(i.quantity_on_hand - i.quantity_reserved, 0) AS disponivel
       FROM products p LEFT JOIN inventory i ON i.product_id=p.id
       WHERE p.id = ? AND p.published = 1 AND p.archived_at IS NULL LIMIT 1`,
    ).bind(id).first();
    if (!info) return reply({ error: 'Produto indisponível.' }, 404);
    const available = Number(info.disponivel);
    if (!Number.isSafeInteger(available) || available < 0) return unavailable();
    return reply({ productId: String(info.id), disponivel: available });
  } catch {
    return unavailable();
  }
}
