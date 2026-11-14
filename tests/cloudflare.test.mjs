import test from 'node:test';
import assert from 'node:assert/strict';
import { configured, validProduct, json, auth, sha256, same, originOkay } from '../functions/_shared/adminApi.js';
import { onRequestPost as login } from '../functions/api/login.js';
import { onRequestGet as list } from '../functions/api/admin/catalog.js';
import { onRequestPost as upload } from '../functions/api/admin/imagens/[id].js';

const env = { DB: { prepare(){ throw new Error('No DB access expected'); } },
  LOLA_ADMIN_USERNAME:'owner', LOLA_ADMIN_PASSWORD:'a-strong-password-with-at-least-twenty-chars',
  LOLA_ADMIN_SESSION_SECRET:'unit-test-secret-32-characters-minimum' };

test('missing secrets must fail closed',async()=>{
  assert.equal(configured({DB:{}}),false);
  const result=await auth({env:{DB:{}},request:new Request('https://admin.example.com/api/session')});
  assert.equal(result.error.status,503);
});
test('sensitive API requires valid server session',async()=>{
  const context={env,request:new Request('https://admin.example.com/api/admin/catalog',{method:'GET'}),params:{}};
  assert.equal((await list(context)).status,401);
  assert.equal((await upload({...context,request:new Request('https://admin.example.com/api/admin/imagens/x1',{method:'POST'}),params:{id:'x1'}})).status,401);
});
test('login rejects forged cross-origin POST before reading credentials',async()=>{
  const request=new Request('https://admin.example.com/api/login',{
    method:'POST',headers:{origin:'https://attacker.invalid','content-type':'application/json'},
    body:JSON.stringify({username:'owner',password:'irrelevant'}),
  });
  assert.equal(originOkay(request),false);
  assert.equal((await login({env,request})).status,403);
});
test('valid inputs are server-side checked, no negative prices or missing fields',()=>{
  const input={name:'Brinco real',category:'Brincos',desc:'Aço inox',material:'',color:'',price:50.25,published:false};
  assert.deepEqual(validProduct(input),{name:'Brinco real',category:'Brincos',description:'Aço inox',priceCents:5025,published:0});
  assert.equal(validProduct({...input,price:-1}),null);
  assert.equal(validProduct({...input,published:'true'}),null);
  assert.equal(validProduct({...input,name:''}),null);
  assert.equal(validProduct({...input,category:''}),null);
});
test('safe JSON never allows wildcard CORS or caching',()=>{
  const response=json({ok:true});
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'),null);
  assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);
});
test('SHA256 comparison does not accept substitutions',async()=>{
  assert.equal(same(await sha256('abc'),await sha256('abc')),true);
  assert.equal(same(await sha256('abc'),await sha256('abcd')),false);
});
