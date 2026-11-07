import express from 'express';
import {
  createHmac, randomBytes, timingSafeEqual,
} from 'node:crypto';
import { isIP } from 'node:net';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb', strict: true }));

const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 4101);
const host = process.env.HOST || '127.0.0.1';
const username = process.env.LOLA_ADMIN_USERNAME || '';
const password = process.env.LOLA_ADMIN_PASSWORD || '';
const sessionSecret = process.env.LOLA_ADMIN_SESSION_SECRET || '';
const dataServiceUrl = process.env.LOLA_DATA_SERVICE_URL || '';
const adminApiKey = process.env.LOLA_ADMIN_API_KEY || '';

function fail(message) {
  console.error('[lola-admin] configuração inválida:', message);
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) fail('PORT inválida.');
if (username.length < 3 || password.length < 16) fail('Defina LOLA_ADMIN_USERNAME e LOLA_ADMIN_PASSWORD (mínimo 16 caracteres na senha).');
if (sessionSecret.length < 32) fail('LOLA_ADMIN_SESSION_SECRET precisa ter pelo menos 32 caracteres.');
if (adminApiKey.length < 32) fail('LOLA_ADMIN_API_KEY precisa ter pelo menos 32 caracteres.');
if (!dataServiceUrl) fail('LOLA_DATA_SERVICE_URL é obrigatória.');
let upstream;
try { upstream = new URL(dataServiceUrl); } catch { fail('LOLA_DATA_SERVICE_URL inválida.'); }
if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.search || upstream.hash) {
  fail('LOLA_DATA_SERVICE_URL deve ser uma URL HTTP(S) sem credenciais, query ou fragmento.');
}
const loopback = ['localhost', '127.0.0.1', '::1'].includes(upstream.hostname.replace(/^\[|\]$/g, ''));
if (production && upstream.protocol !== 'https:' && !loopback) fail('Em produção, o servidor de dados remoto exige HTTPS.');
if (production && process.env.LOLA_ADMIN_COOKIE_SECURE !== 'true') fail('Em produção, defina LOLA_ADMIN_COOKIE_SECURE=true.');
if (production && (host === '0.0.0.0' || host === '::') && process.env.LOLA_ADMIN_BEHIND_HTTPS_PROXY !== 'true') {
  fail('Bind público exige proxy HTTPS explicitamente declarado.');
}

const sessions = new Map();
const loginBuckets = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const COOKIE = 'lola_admin_session';
const COOKIE_SECURE = production || process.env.LOLA_ADMIN_COOKIE_SECURE === 'true';

function mac(value) {
  return createHmac('sha256', sessionSecret).update(value).digest('hex');
}
function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
function cookieValue(req) {
  const raw = req.headers.cookie || '';
  const entry = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(COOKIE + '='));
  return entry ? decodeURIComponent(entry.slice(COOKIE.length + 1)) : '';
}
function getSession(req) {
  const value = cookieValue(req);
  const [id, signature, extra] = value.split('.');
  if (!id || !signature || extra || !safeEqual(signature, mac(id))) return null;
  const session = sessions.get(id);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { id, ...session };
}
function setCookie(res, value, maxAge) {
  const parts = [`${COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
  if (COOKIE_SECURE) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function noStore(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  next();
}
app.use(noStore);

function requireSession(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Sessão administrativa ausente ou expirada.' });
  req.adminSession = session;
  return next();
}
function requireCsrf(req, res, next) {
  const session = req.adminSession;
  const supplied = req.get('x-csrf-token') || '';
  if (!session || !safeEqual(supplied, session.csrf)) return res.status(403).json({ error: 'Token CSRF inválido.' });
  return next();
}
function loginRateLimit(req, res, next) {
  const key = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = loginBuckets.get(key) || { count: 0, resetAt: now + 15 * 60_000 };
  if (bucket.resetAt <= now) { bucket.count = 0; bucket.resetAt = now + 15 * 60_000; }
  bucket.count += 1;
  loginBuckets.set(key, bucket);
  if (bucket.count > 10) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
  return next();
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/session', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ authenticated: false });
  return res.json({ authenticated: true, csrfToken: session.csrf, expiresAt: session.expiresAt });
});
app.post('/api/login', loginRateLimit, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const suppliedUser = typeof body.username === 'string' ? body.username : '';
  const suppliedPassword = typeof body.password === 'string' ? body.password : '';
  const userOk = safeEqual(suppliedUser, username);
  const passOk = safeEqual(suppliedPassword, password);
  if (!userOk || !passOk) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  const id = randomBytes(32).toString('hex');
  const csrf = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(id, { csrf, expiresAt });
  setCookie(res, id + '.' + mac(id), Math.floor(SESSION_TTL_MS / 1000));
  loginBuckets.delete(req.socket.remoteAddress || 'unknown');
  return res.json({ authenticated: true, csrfToken: csrf, expiresAt });
});
app.post('/api/logout', requireSession, requireCsrf, (req, res) => {
  sessions.delete(req.adminSession.id);
  setCookie(res, '', 0);
  return res.json({ success: true });
});

const routes = new Map([
  ['GET /api/admin/pre-pedidos', '/api/admin/pre-pedidos'],
  ['GET /api/admin/titular', '/api/admin/titular'],
  ['POST /api/admin/rastreios', null],
  ['POST /api/estoque/atualizar', '/api/estoque/atualizar'],
]);
function allowedUpstream(method, pathname) {
  if (method === 'GET' && /^\/api\/admin\/pre-pedidos(?:\/[A-Z0-9-]+)?$/.test(pathname)) return pathname;
  if (method === 'GET' && pathname === '/api/admin/titular') return pathname;
  if (method === 'POST' && /^\/api\/admin\/pre-pedidos\/[A-Z0-9-]+\/redact$/.test(pathname)) return pathname;
  if (method === 'DELETE' && /^\/api\/admin\/pre-pedidos\/[A-Z0-9-]+$/.test(pathname)) return pathname;
  if (method === 'POST' && /^\/api\/admin\/rastreios\/LOLA-\d{8}-[A-F0-9]{12}$/.test(pathname)) return pathname;
  if (method === 'POST' && pathname === '/api/estoque/atualizar') return pathname;
  return null;
}
app.all('/api/admin/*', requireSession, (req, res, next) => proxy(req, res, next));
app.all('/api/estoque/atualizar', requireSession, requireCsrf, (req, res, next) => proxy(req, res, next));

async function proxy(req, res, next) {
  try {
    if (req.method !== 'GET' && !req.adminSession) return res.status(401).json({ error: 'Sessão ausente.' });
    if (req.method !== 'GET' && !req.get('x-csrf-token')) return res.status(403).json({ error: 'Token CSRF obrigatório.' });
    const pathname = req.path;
    const safePath = allowedUpstream(req.method, pathname);
    if (!safePath) return res.status(404).json({ error: 'Operação administrativa não permitida.' });
    const target = new URL(safePath + (req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''), upstream);
    const headers = { 'x-admin-key': adminApiKey, accept: 'application/json' };
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = JSON.stringify(req.body ?? {});
      headers['content-type'] = 'application/json';
    }
    const response = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    if (response.status >= 300 && response.status < 400) return res.status(502).json({ error: 'Redirecionamento inesperado no serviço privado.' });
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > 256 * 1024) return res.status(502).json({ error: 'Resposta excede o limite permitido.' });
    let payload;
    try { payload = text ? JSON.parse(text) : {}; } catch { return res.status(502).json({ error: 'Resposta inválida do serviço privado.' }); }
    return res.status(response.status).json(payload);
  } catch (error) {
    console.error('[lola-admin] falha no serviço privado:', error instanceof Error ? error.message : 'erro desconhecido');
    return res.status(503).json({ error: 'Serviço administrativo temporariamente indisponível.' });
  }
}

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint não encontrado.' }));
app.listen(port, host, () => {
  console.log(`[lola-admin] BFF ativo em http://${host}:${port}; ambiente=${production ? 'production' : 'development'}`);
});
