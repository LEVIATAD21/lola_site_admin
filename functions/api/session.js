import { auth, json } from '../_shared/adminApi.js';
export async function onRequestGet(context) {
  const result = await auth(context);
  if (result.error) return result.error;
  return json({ authenticated: true, csrfToken: result.csrf });
}
