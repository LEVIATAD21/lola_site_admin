import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {mpConfigured,validWebhook,safeOrder,validateProviderPayment,checkoutOrder} from '../functions/_shared/mercadoPago.js';
import {hmac} from '../functions/_shared/adminApi.js';
const env={DB:{},LOLA_MP_ENABLED:'true',LOLA_MP_ACCESS_TOKEN:'test-secret-token-0123456789',LOLA_MP_PUBLIC_KEY:'test-public-key-0123456789',LOLA_MP_WEBHOOK_SECRET:'webhook-secret-0123456789',LOLA_MP_ACCOUNT_ID:'123',LOLA_MP_PICKUP_DESCRIPTION:'Retirada na loja',LOLA_MP_MODE:'test',LOLA_ADMIN_SESSION_SECRET:'s'.repeat(32)};
test('fails closed until every checkout dependency is configured',async()=>{
 assert.equal(mpConfigured(env),true);
 for(const key of Object.keys(env))assert.equal(mpConfigured({...env,[key]:''}),false,key);
 assert.equal((await checkoutOrder({request:new Request('https://api.example'),env:{}})).status,503);
});
test('rejects forged and replayed webhook signatures',async()=>{
 const ts=String(Math.floor(Date.now()/1000)),requestId='request-123',id='7654',secret='test-webhook-secret';
 const sign=t=>hmac(secret,'id:'+id+';request-id:'+requestId+';ts:'+t+';');
 const make=(t,sig)=>new Request('https://api.example/webhook?data.id='+id,{headers:{'x-request-id':requestId,'x-signature':'ts='+t+',v1='+sig}});
 assert.equal(await validWebhook(make(ts,await sign(ts)),secret),true);
 assert.equal(await validWebhook(make(ts,'0'.repeat(64)),secret),false);
 const old=String(Number(ts)-3600);assert.equal(await validWebhook(make(old,await sign(old)),secret),false);
});
test('reconciliation binds amount, currency, merchant, reference and mode',()=>{
 const row={id:'order-1',amount_cents:9000,payment_id:null};
 const p={id:1,external_reference:'order-1',collector_id:123,currency_id:'BRL',transaction_amount:90,live_mode:false};
 assert.equal(validateProviderPayment(p,row,env),true);
 for(const c of [{transaction_amount:1},{currency_id:'USD'},{collector_id:999},{external_reference:'other'},{live_mode:true}])assert.equal(validateProviderPayment({...p,...c},row,env),false);
 const visible=safeOrder({...row,state:'draft',product_name:'Brinco',quantity:1,token_hash:'private'});
 assert.equal('token_hash' in visible,false);
});
function database(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 db.exec(readFileSync(new URL('./fixtures/catalog.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../infra/d1/0005_mercado_pago_checkout.sql',import.meta.url),'utf8'));
 db.exec("INSERT INTO products(id,name,category,price_cents,published) VALUES('piece-1','Brinco','Brincos',9000,1);INSERT INTO inventory(product_id,quantity_on_hand) VALUES('piece-1',3)");return db;
}
const insert=(db,id,q=1,a=9000)=>db.prepare('INSERT INTO mp_orders(id,token_hash,product_id,product_name,quantity,amount_cents,expires_at) VALUES(?,?,?,?,?,?,?)').run(id,'token-'+id,'piece-1','Brinco',q,a,9999999999);
const stock=db=>({...db.prepare('SELECT quantity_on_hand,quantity_reserved FROM inventory').get()});
test('reservations prevent overselling and reject client price manipulation',()=>{
 const db=database();insert(db,'a',2,18000);assert.throws(()=>insert(db,'b',2,18000));assert.throws(()=>insert(db,'c',1,1));
 assert.deepEqual(stock(db),{quantity_on_hand:3,quantity_reserved:2});
 assert.throws(()=>db.prepare("UPDATE mp_orders SET quantity=3 WHERE id='a'").run());db.close();
});
test('approval debits once, and refunds never invent physical returns',()=>{
 const db=database();insert(db,'a');db.exec("UPDATE mp_orders SET state='processing' WHERE id='a';UPDATE mp_orders SET state='approved' WHERE id='a';UPDATE mp_orders SET state='approved' WHERE id='a'");
 assert.deepEqual(stock(db),{quantity_on_hand:2,quantity_reserved:0});assert.throws(()=>db.exec("UPDATE mp_orders SET state='pending' WHERE id='a'"));
 db.exec("UPDATE mp_orders SET state='refunded' WHERE id='a'");assert.equal(stock(db).quantity_on_hand,2);db.close();
});
test('draft expiry and rejected payments release only their reservations',()=>{
 const db=database();insert(db,'a');insert(db,'b');db.exec("UPDATE mp_orders SET state='expired' WHERE id='a';UPDATE mp_orders SET state='processing' WHERE id='b';UPDATE mp_orders SET state='rejected' WHERE id='b'");
 assert.deepEqual(stock(db),{quantity_on_hand:3,quantity_reserved:0});assert.throws(()=>db.exec("UPDATE mp_orders SET state='approved' WHERE id='b'"));db.close();
});
function d1(db){
 return {prepare(sql){
  const statement=db.prepare(sql);
  const wrap=(args=[])=>({bind:(...values)=>wrap(values),first:async column=>{const row=statement.get(...args);return column?row?.[column]:row||null;},all:async()=>({success:true,results:statement.all(...args)}),run:async()=>({success:true,meta:statement.run(...args)})});return wrap();
 }};
}
test('full checkout ignores browser prices, protects order access and creates only one charge',async()=>{
 const db=database(),DB=d1(db),testEnv={...env,DB};
 const token='a'.repeat(64),oldFetch=globalThis.fetch;let charges=0,payload;
 const payment={id:777,external_reference:'',collector_id:123,currency_id:'BRL',transaction_amount:90,live_mode:false,status:'approved',payment_method_id:'visa'};
 globalThis.fetch=async(url,options)=>{
  if(String(url).endsWith('/users/me'))return Response.json({id:123});
  if(options.method==='POST'){charges++;payload=JSON.parse(options.body);payment.external_reference=payload.external_reference;}
  return Response.json(payment);
 };
 const call=(body,t=token)=>checkoutOrder({env:testEnv,request:new Request('https://api.example/api/checkout/order',{method:'POST',headers:{Origin:'https://lola-site-9ng.pages.dev','Content-Type':'application/json','x-checkout-token':t},body:JSON.stringify(body)})});
 try {
  const first=await call({action:'create',productId:'piece-1',quantity:1,token,amount:0.01});const firstData=await first.json();
  assert.equal(first.status,201);assert.equal(firstData.order.amount,90);
  const id=firstData.order.id;
  assert.equal((await (await call({action:'create',productId:'piece-1',quantity:1,token})).json()).order.id,id);
  assert.equal((await call({action:'status',id},'b'.repeat(64))).status,401);
  const formData={payment_method_id:'visa',token:'tokenized-card-123',installments:1,payer:{email:'buyer@example.com'},transaction_amount:0.01,card_number:'must-never-forward',security_code:'must-never-forward'};
  assert.equal((await (await call({action:'pay',id,formData})).json()).order.state,'approved');
  assert.equal(payload.transaction_amount,90);assert.equal('card_number' in payload,false);assert.equal('security_code' in payload,false);
  await call({action:'pay',id,formData});assert.equal(charges,1);
  assert.deepEqual(stock(db),{quantity_on_hand:2,quantity_reserved:0});
 }finally{globalThis.fetch=oldFetch;db.close();}
});
test('an ambiguous provider response never releases stock or submits a second charge',async()=>{
 const db=database(),testEnv={...env,DB:d1(db)},old=globalThis.fetch;let charges=0;
 globalThis.fetch=async(url,init)=>{
  if(String(url).endsWith('/users/me'))return Response.json({id:123});
  if(init.method==='POST'){charges++;throw Error('connection lost');}
  return Response.json({results:[]});
 };
 const token='c'.repeat(64);
 const call=body=>checkoutOrder({env:testEnv,request:new Request('https://api.example',{method:'POST',headers:{Origin:'https://lola-site-9ng.pages.dev','Content-Type':'application/json','x-checkout-token':token},body:JSON.stringify(body)})});
 try{
  const id=(await(await call({action:'create',productId:'piece-1',quantity:1,token})).json()).order.id;
  const body={action:'pay',id,formData:{payment_method_id:'pix',payer:{email:'buyer@example.com'}}};
  const first=await call(body);assert.equal(first.status,202);assert.equal((await first.json()).order.state,'processing');
  await call(body);assert.equal(charges,1);assert.deepEqual(stock(db),{quantity_on_hand:3,quantity_reserved:1});
 }finally{globalThis.fetch=old;db.close();}
});
