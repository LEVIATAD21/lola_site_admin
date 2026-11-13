import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const HOST = '127.0.0.1';
const USERNAME = 'operator-test';
const PASSWORD = 'a-strong-test-password-2026';
const SESSION_SECRET = 'test-session-secret-with-more-than-32-bytes';
const ADMIN_KEY = 'test-admin-key-with-more-than-32-bytes';
let bff;
let bffPort;
let upstream;
let upstreamPort;
let upstreamRequests = [];

async function freePort() {
  const server = createServer();
  server.listen(0, HOST);
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForBff() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${HOST}:${bffPort}/api/health`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('BFF não iniciou dentro do prazo.');
}

async function login() {
  const response = await fetch(`http://${HOST}:${bffPort}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, 'cookie de sessão deve ser emitido');
  assert.match(response.headers.get('set-cookie') || '', /HttpOnly/i);
  assert.match(response.headers.get('set-cookie') || '', /SameSite=Strict/i);
  return { cookie, csrf: data.csrfToken };
}

before(async () => {
  bffPort = await freePort();
  upstreamPort = await freePort();
  upstream = createServer((req, res) => {
    upstreamRequests.push({ url: req.url, key: req.headers['x-admin-key'], method: req.method });
    if (req.url?.includes('large=1')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('x'.repeat(300 * 1024));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  upstream.listen(upstreamPort, HOST);
  await once(upstream, 'listening');
  bff = spawn(process.execPath, ['server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST,
      PORT: String(bffPort),
      LOLA_ADMIN_USERNAME: USERNAME,
      LOLA_ADMIN_PASSWORD: PASSWORD,
      LOLA_ADMIN_SESSION_SECRET: SESSION_SECRET,
      LOLA_DATA_SERVICE_URL: `http://${HOST}:${upstreamPort}`,
      LOLA_ADMIN_API_KEY: ADMIN_KEY,
    },
    stdio: 'ignore',
  });
  await waitForBff();
});

after(async () => {
  if (bff && bff.exitCode === null) {
    bff.kill('SIGTERM');
    await Promise.race([once(bff, 'exit'), delay(2000)]);
    if (bff.exitCode === null) bff.kill('SIGKILL');
  }
  if (upstream?.listening) await new Promise((resolve) => upstream.close(resolve));
});

test('health não expõe segredos e envia cabeçalhos de proteção', async () => {
  const response = await fetch(`http://${HOST}:${bffPort}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
});

test('nega acesso administrativo sem sessão', async () => {
  const response = await fetch(`http://${HOST}:${bffPort}/api/admin/pre-pedidos`);
  assert.equal(response.status, 401);
});

test('nega tentativa de login com origem externa', async () => {
  const response = await fetch(`http://${HOST}:${bffPort}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  assert.equal(response.status, 403);
});

test('autentica, emite cookie protegido e exige CSRF em mutações', async () => {
  const session = await login();
  const response = await fetch(`http://${HOST}:${bffPort}/api/admin/pre-pedidos/LOLA-20261107-ABCDEF123456/redact`, {
    method: 'POST',
    headers: { cookie: session.cookie, 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 403);
});

test('logout invalida a sessão no servidor e remove o cookie', async () => {
  const session = await login();
  const response = await fetch(`http://${HOST}:${bffPort}/api/logout`, {
    method: 'POST',
    headers: { cookie: session.cookie, 'x-csrf-token': session.csrf },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie') || '', /Max-Age=0/i);

  const after = await fetch(`http://${HOST}:${bffPort}/api/session`, {
    headers: { cookie: session.cookie },
  });
  assert.equal(after.status, 401);
});

test('encaminha somente rota permitida e injeta a chave no servidor', async () => {
  const session = await login();
  const response = await fetch(`http://${HOST}:${bffPort}/api/admin/pre-pedidos?limit=2`, {
    headers: { cookie: session.cookie },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  const last = upstreamRequests.at(-1);
  assert.equal(last.key, ADMIN_KEY);
  assert.equal(last.url, '/api/admin/pre-pedidos?limit=2');
});

test('encaminha busca LGPD por titular com sessão e preserva a query', async () => {
  const session = await login();
  const response = await fetch(`http://${HOST}:${bffPort}/api/admin/titular?telefone=21987654321`, {
    headers: { cookie: session.cookie },
  });
  assert.equal(response.status, 200);
  assert.equal(upstreamRequests.at(-1).url, '/api/admin/titular?telefone=21987654321');
  assert.equal(upstreamRequests.at(-1).key, ADMIN_KEY);
});

test('encaminha exclusão LGPD somente com sessão e CSRF', async () => {
  const session = await login();
  const response = await fetch(`http://${HOST}:${bffPort}/api/admin/pre-pedidos/LOLA-20261107-ABCDEF123456`, {
    method: 'DELETE',
    headers: { cookie: session.cookie, 'x-csrf-token': session.csrf },
  });
  assert.equal(response.status, 200);
  assert.equal(upstreamRequests.at(-1).method, 'DELETE');
  assert.equal(upstreamRequests.at(-1).key, ADMIN_KEY);
});

test('nega caminhos administrativos fora da allowlist', async () => {
  const session = await login();
  const response = await fetch(`http://${HOST}:${bffPort}/api/admin/usuarios`, {
    headers: { cookie: session.cookie },
  });
  assert.equal(response.status, 404);
  assert.equal(upstreamRequests.some((entry) => entry.url === '/api/admin/usuarios'), false);
});

test('aceita mutação apenas com CSRF válido', async () => {
  const session = await login();
  const response = await fetch(`http://${HOST}:${bffPort}/api/admin/pre-pedidos/LOLA-20261107-ABCDEF123456/redact`, {
    method: 'POST',
    headers: { cookie: session.cookie, 'x-csrf-token': session.csrf, 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 200);
  assert.equal(upstreamRequests.at(-1).method, 'POST');
  assert.equal(upstreamRequests.at(-1).key, ADMIN_KEY);
});

test('interrompe resposta upstream maior que 256 KiB', async () => {
  const session = await login();
  const response = await fetch(`http://${HOST}:${bffPort}/api/admin/pre-pedidos?large=1`, {
    headers: { cookie: session.cookie },
  });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /limite/i);
});

test('encaminha ajuste absoluto de estoque somente com sessão e CSRF', async () => {
  const session = await login();
  const denied = await fetch(`http://${HOST}:${bffPort}/api/estoque/definir`, {
    method: 'POST',
    headers: { cookie: session.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ productId: 'prod-test-01', quantidade: 12 }),
  });
  assert.equal(denied.status, 403);
  const accepted = await fetch(`http://${HOST}:${bffPort}/api/estoque/definir`, {
    method: 'POST',
    headers: { cookie: session.cookie, 'x-csrf-token': session.csrf, 'content-type': 'application/json' },
    body: JSON.stringify({ productId: 'prod-test-01', quantidade: 12 }),
  });
  assert.equal(accepted.status, 200);
  assert.equal(upstreamRequests.at(-1).url, '/api/estoque/definir');
  assert.equal(upstreamRequests.at(-1).key, ADMIN_KEY);
});

test('aplica limite de dez tentativas de login por janela', async () => {
  for (let index = 0; index < 10; index += 1) {
    const response = await fetch(`http://${HOST}:${bffPort}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: USERNAME, password: 'senha-incorreta-para-teste' }),
    });
    assert.equal(response.status, 401);
  }
  const blocked = await fetch(`http://${HOST}:${bffPort}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  assert.equal(blocked.status, 429);
});


test('bloqueia credenciais de exemplo antes de abrir a porta', async () => {
  const rejected = spawn(process.execPath, ['server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: HOST,
      PORT: String(await freePort()),
      LOLA_ADMIN_USERNAME: 'operador',
      LOLA_ADMIN_PASSWORD: 'SUBSTITUA_POR_SENHA_FORTE_COM_16_OU_MAIS_CARACTERES',
      LOLA_ADMIN_SESSION_SECRET: SESSION_SECRET,
      LOLA_DATA_SERVICE_URL: 'http://127.0.0.1:4100',
      LOLA_ADMIN_API_KEY: ADMIN_KEY,
      LOLA_ADMIN_COOKIE_SECURE: 'true',
    },
    stdio: 'ignore',
  });
  try {
    const [code] = await Promise.race([
      once(rejected, 'exit'),
      delay(3000).then(() => { throw new Error('Processo não recusou as credenciais de exemplo.'); }),
    ]);
    assert.equal(code, 1);
  } finally {
    if (rejected.exitCode === null) rejected.kill('SIGKILL');
  }
});

test('limita logins por cliente somente quando o proxy de origem é confiável', async () => {
  const proxyPort = await freePort();
  const proxyBff = spawn(process.execPath, ['server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST,
      PORT: String(proxyPort),
      LOLA_ADMIN_USERNAME: USERNAME,
      LOLA_ADMIN_PASSWORD: PASSWORD,
      LOLA_ADMIN_SESSION_SECRET: SESSION_SECRET,
      LOLA_DATA_SERVICE_URL: `http://${HOST}:${upstreamPort}`,
      LOLA_ADMIN_API_KEY: ADMIN_KEY,
      LOLA_ADMIN_BEHIND_HTTPS_PROXY: 'true',
      LOLA_ADMIN_TRUSTED_PROXY_IPS: HOST,
    },
    stdio: 'ignore',
  });
  const endpoint = `http://${HOST}:${proxyPort}`;
  try {
    let ready = false;
    for (let retry = 0; retry < 80; retry += 1) {
      try { ready = (await fetch(endpoint + '/api/health')).ok; } catch {}
      if (ready) break;
      await delay(100);
    }
    assert.ok(ready, 'BFF de proxy deve iniciar');
    async function attempt(ip, valid = false) {
      return fetch(endpoint + '/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-real-ip': ip },
        body: JSON.stringify({ username: USERNAME, password: valid ? PASSWORD : 'senha-invalida-para-teste' }),
      });
    }
    for (let index = 0; index < 10; index += 1) {
      assert.equal((await attempt('198.51.100.10')).status, 401);
    }
    assert.equal((await attempt('198.51.100.10', true)).status, 429);
    assert.equal((await attempt('198.51.100.11', true)).status, 200);
  } finally {
    if (proxyBff.exitCode === null) {
      proxyBff.kill('SIGTERM');
      await Promise.race([once(proxyBff, 'exit'), delay(2000)]);
      if (proxyBff.exitCode === null) proxyBff.kill('SIGKILL');
    }
  }
});
