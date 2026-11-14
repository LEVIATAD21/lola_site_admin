import { auth, json, sessionCookie, unavailable } from '../_shared/adminApi.js';
export async function onRequestPost(context) {
  const result = await auth(context, true);
  if (result.error) return result.error;
  try {
    await context.env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(result.tokenHash).run();
    return json({ success: true }, 200, { 'set-cookie': sessionCookie('',0) });
  } catch { return unavailable(); }
}
