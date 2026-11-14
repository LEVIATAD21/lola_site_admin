// Shared response helpers for Cloudflare Pages Functions.
// Same-origin only: no wildcard CORS and no auth/session access.
export function reply(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      // Pages _headers applies to static assets only, NOT Functions responses.
      'Content-Security-Policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Permitted-Cross-Domain-Policies': 'none',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'Strict-Transport-Security': 'max-age=31536000',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      ...extra,
    },
  });
}

export function requireReadOnly(context) {
  if (!context || context.request?.method !== 'GET') {
    return reply({ error: 'Método não permitido.' }, 405, { Allow: 'GET' });
  }
  const db = context.env?.DB;
  if (!db || typeof db.prepare !== 'function') {
    return reply({ error: 'Serviço temporariamente indisponível.' }, 503);
  }
  return null;
}

export function unavailable() {
  return reply({ error: 'Serviço temporariamente indisponível.' }, 503);
}
