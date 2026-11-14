import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originOkay } from '../functions/_shared/adminApi.js';
test('CSRF accepts only the exact deployed admin origin or backend origin',()=>{
 const url='https://lola-admin-api.pages.dev/api/login';
 for(const origin of ['https://lola-inox-admin.netlify.app','https://lola-admin-api.pages.dev'])
  assert.equal(originOkay(new Request(url,{headers:{origin}})),true);
 for(const origin of ['https://evil.example','https://lola-inox-admin.netlify.app.evil.example','http://lola-inox-admin.netlify.app','null',''])
  assert.equal(originOkay(new Request(url,{headers:{origin}})),false);
 assert.equal(originOkay(new Request(url)),false);
});
