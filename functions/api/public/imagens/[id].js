import { reply, requireReadOnly, unavailable } from '../../../_shared/publicApi.js';

const idPattern = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const headers = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  // A deleted photo must not remain visible through a browser/CDN cache.
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

export async function onRequest(context) {
  const rejected = requireReadOnly(context);
  if (rejected) return rejected;
  const id = context.params?.id;
  if (typeof id !== 'string' || !idPattern.test(id)) {
    return reply({ error: 'Imagem não encontrada.' }, 404);
  }
  if (!context.env.PHOTOS_DB) return unavailable();
  try {
    // Cross-DB joins are unsupported: verify publication in DB before PHOTOS_DB.
    const allowed = await context.env.DB.prepare(
      `SELECT p.id FROM products p
       INNER JOIN catalog_photo_index m ON m.product_id=p.id
       WHERE p.id=? AND p.published=1 AND p.archived_at IS NULL
       LIMIT 1`
    ).bind(id).first();
    if (!allowed) return reply({ error: 'Imagem não encontrada.' }, 404);
    const photo = await context.env.PHOTOS_DB.prepare(
      'SELECT mime_type,bytes FROM product_photos WHERE product_id=? LIMIT 1'
    ).bind(id).first();
    if (!photo) return reply({ error: 'Imagem não encontrada.' }, 404);
    const raw = photo.bytes;
    if ((!Array.isArray(raw) && !(raw instanceof ArrayBuffer) && !ArrayBuffer.isView(raw)) ||
      !['image/webp','image/jpeg','image/png'].includes(photo.mime_type)) return unavailable();
    const bytes = new Uint8Array(raw);
    if (bytes.byteLength < 20 || bytes.byteLength > 307200) return unavailable();
    return new Response(bytes, { status: 200,
      headers: { ...headers, 'Content-Type': photo.mime_type } });
  } catch { return unavailable(); }
}
