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
