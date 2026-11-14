import { reply, requireReadOnly, unavailable } from '../../_shared/publicApi.js';

// Read-only public catalog. Only published items. Does not expose identities,
// users, orders, admin settings, stock internals or payment records.
export async function onRequest(context) {
  const rejected = requireReadOnly(context);
  if (rejected) return rejected;
  try {
    const query = `SELECT p.id, p.name, p.category, p.description, p.price_cents,
      COALESCE(i.quantity_on_hand - i.quantity_reserved, 0) AS disponivel,
      EXISTS(SELECT 1 FROM catalog_photo_index AS ph WHERE ph.product_id=p.id) AS has_image
      FROM products AS p
      LEFT JOIN inventory AS i ON i.product_id = p.id
      WHERE p.published = 1 AND p.archived_at IS NULL
      ORDER BY p.category COLLATE NOCASE, p.name COLLATE NOCASE, p.id
      LIMIT 50`;
    // Deployment-compatible fallback: the public catalog keeps working even
    // before the optional photo migration is applied to an existing D1.
    let result;
    try {
      result = await context.env.DB.prepare(query).all();
    } catch (error) {
      if (!String(error).includes('no such table: catalog_photo_index')) throw error;
      const withoutPhotos = query.replace(
        /,\s*EXISTS\(SELECT 1 FROM catalog_photo_index AS ph WHERE ph.product_id=p.id\) AS has_image/,
        ''
      );
      result = await context.env.DB.prepare(withoutPhotos).all();
    }
    if (!result?.success || !Array.isArray(result.results)) return unavailable();
    const products = result.results.map((p) => {
      const cents = Number(p.price_cents);
      const availability = Number(p.disponivel);
      if (!Number.isSafeInteger(cents) || cents < 0 ||
          !Number.isSafeInteger(availability) || availability < 0) {
        throw new Error('Invalid catalog row');
      }
      return {
        id: String(p.id), name: String(p.name), category: String(p.category),
        description: String(p.description ?? ''),
        price: cents / 100, disponivel: availability,
        image: p.has_image ? '/api/imagens/' + encodeURIComponent(String(p.id)) : null,
      };
    });
    return reply({ products, pagination: { returned: products.length, limit: 50 } });
  } catch {
    return unavailable();
  }
}
