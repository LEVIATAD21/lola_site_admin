import { configured, json, unavailable, readJson, originOkay, sha256, same, randomToken, sessionCookie } from '../_shared/adminApi.js';

export async function onRequestPost(context) {
  if (!configured(context.env)) return unavailable();
  if (!originOkay(context.request)) return json({ error: 'Origem não permitida.' }, 403);
  const body = await readJson(context.request, 2048);
  const username = typeof body?.username === 'string' ? body.username : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (username.length > 128 || password.length > 512) return json({ error: 'Credenciais inválidas.' }, 401);
  try {
    const now = Math.floor(Date.now() / 1000);
    const ip = context.request.headers.get('cf-connecting-ip') || 'unknown';
    const key = await sha256(context.env.LOLA_ADMIN_SESSION_SECRET + ':' + ip);
    const reset = now + 900;
    await context.env.DB.prepare(`INSERT INTO admin_login_limits(key_hash,attempts,reset_at)
      VALUES (?,1,?) ON CONFLICT(key_hash) DO UPDATE SET
      attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,
      reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END`
    ).bind(key,reset,now,now,reset).run();
    const attempts = await context.env.DB.prepare('SELECT attempts FROM admin_login_limits WHERE key_hash=?').bind(key).first('attempts');
    if (Number(attempts) > 10) return json({ error: 'Muitas tentativas de acesso. Tente novamente mais tarde.' }, 429, { 'retry-after': '900' });

    const userOk = same(await sha256(username), await sha256(context.env.LOLA_ADMIN_USERNAME));
    const passOk = same(await sha256(password), await sha256(context.env.LOLA_ADMIN_PASSWORD));
    if (!userOk || !passOk) return json({ error: 'Credenciais inválidas.' }, 401);

    const token = randomToken();
    const tokenHash = await sha256(token);
    await context.env.DB.batch([
      context.env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(now),
      context.env.DB.prepare('INSERT INTO admin_sessions(token_hash,expires_at,created_at) VALUES (?,?,?)').bind(tokenHash,now+28800,now),
      context.env.DB.prepare('DELETE FROM admin_login_limits WHERE key_hash=?').bind(key),
    ]);
    const csrf = await (await import('../_shared/adminApi.js')).hmac(context.env.LOLA_ADMIN_SESSION_SECRET, 'csrf:' + token);
    return json({ authenticated: true, csrfToken: csrf, expiresAt: (now+28800)*1000 }, 200,
      { 'set-cookie': sessionCookie(token) });
  } catch {
    return unavailable();
  }
}
