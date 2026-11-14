import { auth, json } from '../_shared/adminApi.js';
export async function onRequestGet(context) {
  const result = await auth(context);
  if (result.error) return result.error;
  const value = context.env.LOLA_PUBLIC_SITE_URL || '';
  let publicSiteUrl = '';
  try {
    const u = new URL(value);
    if (u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash) {
      publicSiteUrl = u.origin;
    }
  } catch {}
  return json({ publicSiteUrl });
}
