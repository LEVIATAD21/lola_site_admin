// Cloudflare Pages admin API shared controls — WebCrypto and D1 only.
// No static bundle may contain credentials or access the D1 binding.
const encoder = new TextEncoder();
const COOKIE = 'lola_admin_session';
export const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;

export function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'x-robots-tag': 'noindex, nofollow, noarchive',
      'referrer-policy': 'no-referrer',
      'cross-origin-resource-policy': 'same-origin',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      ...extra,
    },
  });
}
export const denied = () => json({ error: 'Acesso administrativo não autorizado.' }, 401);
export const unavailable = () => json({ error: 'Serviço administrativo indisponível. Verifique o banco e a configuração.' }, 503);

export function configured(env) {
  return Boolean(env?.DB && typeof env.LOLA_ADMIN_USERNAME === 'string' &&
    env.LOLA_ADMIN_USERNAME.trim().length >= 3 &&
    typeof env.LOLA_ADMIN_PASSWORD === 'string' &&
    env.LOLA_ADMIN_PASSWORD.length >= 10 &&
    typeof env.LOLA_ADMIN_SESSION_SECRET === 'string' &&
    env.LOLA_ADMIN_SESSION_SECRET.length >= 32);
}

export async function sha256(value) {
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(buffer)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
export function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let mismatch = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return mismatch === 0;
}
export async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(sig)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
export function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((v) => v.toString(16).padStart(2, '0')).join('');
}
export function sessionCookie(value, age = 28800) {
  return `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
}
export function cookieToken(request) {
  const cookie = request.headers.get('cookie') ?? '';
  const part = cookie.split(';').map((p) => p.trim()).find((p) => p.startsWith(COOKIE + '='));
  const token = part ? part.slice(COOKIE.length + 1) : '';
  return /^[a-f0-9]{64}$/.test(token) ? token : '';
}
export function originOkay(request) {
  const origin = request.headers.get('origin');
  // Netlify proxies /api to this backend; only the deployed storefront origin is trusted.
  return Boolean(origin && (origin === new URL(request.url).origin ||
    origin === 'https://lola-inox-admin.netlify.app'));
}
export async function auth(context, requireCsrf = false) {
  if (!configured(context.env)) return { error: unavailable() };
  const token = cookieToken(context.request);
  if (!token) return { error: denied() };
  const now = Math.floor(Date.now() / 1000);
  const tokenHash = await sha256(token);
  try {
    const row = await context.env.DB.prepare(
      'SELECT expires_at FROM admin_sessions WHERE token_hash = ? AND expires_at > ?'
    ).bind(tokenHash, now).first();
    if (!row) return { error: denied() };
  } catch {
    return { error: unavailable() };
  }
  const csrf = await hmac(context.env.LOLA_ADMIN_SESSION_SECRET, 'csrf:' + token);
  if (requireCsrf && (!originOkay(context.request) || !same(context.request.headers.get('x-csrf-token'), csrf))) {
    return { error: json({ error: 'Origem ou token CSRF inválido.' }, 403) };
  }
  return { token, tokenHash, csrf };
}
export async function readJson(request, limit = 8192) {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return null;
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > limit || declared < 0) return null;
  try {
    const body = await request.text();
    if (body.length > limit) return null;
    const value = JSON.parse(body);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
export function validText(value, max = 180, required = true) {
  return typeof value === 'string' && value.trim().length <= max && (!required || value.trim().length > 0);
}
export function validProduct(input) {
  if (!input || typeof input !== 'object') return null;
  const { name, category, desc, material, color, price, published } = input;
  if (!validText(name) || !validText(category, 100) ||
      !validText(desc, 2000, false) ||
      !validText(material, 100, false) ||
      !validText(color, 100, false) ||
      typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 999999 ||
      typeof published !== 'boolean') return null;
  const priceCents = Math.round(price * 100);
  if (!Number.isSafeInteger(priceCents)) return null;
  return {
    name: name.trim(), category: category.trim(),
    description: desc.trim(), priceCents, published: published ? 1 : 0,
  };
}
export function asProduct(p) {
  const id = String(p.id);
  return {
    id, name: String(p.name), category: String(p.category),
    price: Number(p.price_cents) / 100,
    desc: String(p.description ?? ''),
    disponivel: Number(p.disponivel ?? 0),
    published: Boolean(p.published),
    image: p.has_image ? '/api/admin/imagens/' + encodeURIComponent(id) : '',
  };
}
