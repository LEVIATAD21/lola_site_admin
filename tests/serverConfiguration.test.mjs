import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configured } from '../functions/_shared/adminApi.js';
test('server configuration accepts owner password length and fails closed on missing credentials', () => {
 const env = { DB: {}, LOLA_ADMIN_USERNAME: 'owner.user', LOLA_ADMIN_PASSWORD: 'Abc12345!..', LOLA_ADMIN_SESSION_SECRET: 's'.repeat(32) };
 assert.equal(configured(env), true);
 for (const change of [{DB:null},{LOLA_ADMIN_USERNAME:''},{LOLA_ADMIN_PASSWORD:''},{LOLA_ADMIN_PASSWORD:'a'.repeat(9)},{LOLA_ADMIN_SESSION_SECRET:''},{LOLA_ADMIN_SESSION_SECRET:'s'.repeat(31)}]) assert.equal(configured({...env,...change}),false);
});
