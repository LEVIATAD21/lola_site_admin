import test from 'node:test';
import assert from 'node:assert/strict';
import { configured, validProduct, json, auth, sha256, same, originOkay } from '../functions/_shared/adminApi.js';
import { onRequestPost as login } from '../functions/api/login.js';
import { onRequestGet as list } from '../functions/api/admin/catalog.js';
import { onRequestPost as upload } from '../functions/api/admin/imagens/[id].js';
import { onRequestDelete as deletePhoto } from '../functions/api/admin/imagens/[id].js';
import { onRequestGet as finance } from '../functions/api/finance.js';
import { onRequestPost as webhook } from '../functions/api/webhooks/asaas.js';
import { normalizeAsaasEvent, trustedReceiptUrl } from '../functions/_shared/finance.js';
import { hmac } from '../functions/_shared/adminApi.js';

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

test('a foto é removida fisicamente do PHOTOS_DB com sessão e CSRF',async()=>{
  const token='a'.repeat(64);
  const csrf=await hmac(env.LOLA_ADMIN_SESSION_SECRET,'csrf:'+token);
  const order=[];
  const mainDB={prepare(sql){return {
    bind(){return this;},
    async first(){return sql.includes('admin_sessions')?{expires_at:9999999999}:null;},
    async run(){order.push('main:'+sql);return {success:true};},
  }}};
  const photoDB={prepare(sql){return {
    bind(){return this;},
    async run(){order.push('photos:'+sql);return {success:true};},
  }}};
  const request=new Request('https://admin.example.com/api/admin/imagens/lola-1',{
    method:'DELETE',headers:{cookie:'lola_admin_session='+token,
      origin:'https://admin.example.com','x-csrf-token':csrf},
  });
  const response=await deletePhoto({env:{...env,DB:mainDB,PHOTOS_DB:photoDB},
    request,params:{id:'lola-1'}});
  assert.equal(response.status,200);
  assert.equal(order.length,2);
  assert.match(order[0],/^photos:DELETE FROM product_photos/);
  assert.match(order[1],/^main:DELETE FROM catalog_photo_index/);
});

test('ausência de PHOTOS_DB não pode reportar foto apagada',async()=>{
  const token='a'.repeat(64);
  const csrf=await hmac(env.LOLA_ADMIN_SESSION_SECRET,'csrf:'+token);
  const db={prepare(){return{bind(){return this},async first(){return{expires_at:9999999999}}}}};
  const request=new Request('https://admin.example.com/api/admin/imagens/lola-1',{
    method:'DELETE',headers:{cookie:'lola_admin_session='+token,
    origin:'https://admin.example.com','x-csrf-token':csrf},
  });
  const response=await deletePhoto({env:{...env,DB:db},request,params:{id:'lola-1'}});
  assert.equal(response.status,503);
});
test('recibos e reembolsos privados exigem autenticação administrativa',async()=>{
  const result=await finance({env,request:new Request('https://admin.example.com/api/finance')});
  assert.equal(result.status,401);
});
test('webhook sem token do provedor não pode registrar comprovante',async()=>{
  const request=new Request('https://admin.example.com/api/webhooks/asaas',{
    method:'POST',headers:{'content-type':'application/json'},body:'{}',
  });
  const result=await webhook({env:{...env,LOLA_ASAAS_WEBHOOK_TOKEN:'b'.repeat(44)},request});
  assert.equal(result.status,401);
});
test('recibos são exclusivamente URLs HTTPS confiáveis do Asaas',()=>{
  assert.equal(trustedReceiptUrl('https://www.asaas.com/comprovantes/123'),'https://www.asaas.com/comprovantes/123');
  assert.equal(trustedReceiptUrl('https://asaas.com.evil.example/comprovantes/123'),null);
  assert.equal(trustedReceiptUrl('javascript:alert(1)'),null);
  assert.equal(trustedReceiptUrl('http://www.asaas.com/comprovantes/123'),null);
});
test('Asaas: valor real e recibo de reembolso DONE são usados; sem dados fictícios',async()=>{
  const normalized=await normalizeAsaasEvent({
    id:'evt_test_valid_123',event:'PAYMENT_REFUNDED',
    payment:{id:'pay_test_123',status:'REFUNDED',value:120.5,billingType:'PIX',
      refunds:[{dateCreated:'2026-11-14 09:22:15',status:'DONE',value:40.5,
        transactionReceiptUrl:'https://www.asaas.com/comprovantes/123'}]},
  });
  assert.equal(normalized.paymentId,'pay_test_123');
  assert.equal(normalized.amountCents,12050);
  assert.equal(normalized.refunds[0].amountCents,4050);
  assert.equal(normalized.refunds[0].status,'DONE');
  assert.match(normalized.refunds[0].receiptUrl,/asaas.com\/comprovantes/);
  assert.equal((await normalizeAsaasEvent({
    id:'evt_invalid',event:'PAYMENT_RECEIVED',payment:{id:'p1',value:-100},
  })),null);
});
