import { configured, json, unavailable } from '../_shared/adminApi.js';
export async function onRequestGet(context) {
  if (!configured(context.env)) return unavailable();
  try {
    const db = await context.env.DB.prepare('SELECT COUNT(*) AS count FROM admin_sessions').first();
    if (!db || !Number.isSafeInteger(Number(db.count))) return unavailable();
    return json({ status: 'ok', mode: 'admin-secure-d1' });
  } catch { return unavailable(); }
}
