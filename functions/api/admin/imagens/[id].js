import { auth, ID_PATTERN, json, unavailable } from '../../../_shared/adminApi.js';

const MAX_BYTES = 307200;
const TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);
function matchesType(buffer, type) {
  const b = new Uint8Array(buffer);
  if (type === 'image/jpeg') return b[0]===255 && b[1]===216 && b[2]===255;
  if (type === 'image/png') return [137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);
  if (type === 'image/webp') return [82,73,70,70].every((v,i)=>b[i]===v) &&
    [87,69,66,80].every((v,i)=>b[8+i]===v);
  return false;
}
function idOf(context) {
  const id = context.params?.id;
  return typeof id === 'string' && ID_PATTERN.test(id) ? id : null;
}
export async function onRequestGet(context) {
  const current = await auth(context);
  if (current.error) return current.error;
  const id = idOf(context);
  if (!id) return json({ error: 'ID inválido.' }, 400);
  try {
    const photo = await context.env.DB.prepare('SELECT mime_type,bytes FROM product_photos WHERE product_id=?').bind(id).first();
    if (!photo) return json({ error: 'Imagem não encontrada.' }, 404);
    const bytes = new Uint8Array(photo.bytes);
    if (!TYPES.has(photo.mime_type) || bytes.byteLength < 20 || bytes.byteLength > MAX_BYTES) return unavailable();
    return new Response(bytes, { headers: {
      'content-type': photo.mime_type,
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow',
    }});
  } catch { return unavailable(); }
}
export async function onRequestPost(context) {
  const current = await auth(context, true);
  if (current.error) return current.error;
  const id = idOf(context);
  if (!id) return json({ error: 'ID inválido.' }, 400);
  const mime = (context.request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!TYPES.has(mime)) return json({ error: 'Envie WebP, JPEG ou PNG. SVG não é permitido.' }, 415);
  const length = Number(context.request.headers.get('content-length') ?? 0);
  if (length > MAX_BYTES) return json({ error: 'Foto excede 300 KiB após compactação.' }, 413);
  try {
    const bytes = await context.request.arrayBuffer();
    if (bytes.byteLength < 20 || bytes.byteLength > MAX_BYTES || !matchesType(bytes,mime))
      return json({ error: 'Formato inválido ou imagem acima de 300 KiB.' }, 413);
    const product = await context.env.DB.prepare('SELECT id FROM products WHERE id=? AND archived_at IS NULL').bind(id).first();
    if (!product) return json({ error: 'Cadastre o produto antes de enviar foto.' }, 404);
    await context.env.DB.prepare(`INSERT INTO product_photos(product_id,mime_type,bytes,updated_at)
      VALUES (?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET
      mime_type=excluded.mime_type,bytes=excluded.bytes,updated_at=excluded.updated_at`
    ).bind(id,mime,bytes,Math.floor(Date.now()/1000)).run();
    return json({ success:true, image: '/api/admin/imagens/'+id });
  } catch { return unavailable(); }
}
export async function onRequestDelete(context) {
  const current = await auth(context, true);
  if (current.error) return current.error;
  const id = idOf(context);
  if (!id) return json({ error: 'ID inválido.' }, 400);
  try {
    await context.env.DB.prepare('DELETE FROM product_photos WHERE product_id=?').bind(id).run();
    return json({ success:true });
  } catch { return unavailable(); }
}
