import { json, sha256, hmac, same, readJson } from './adminApi.js';

export const STORE_ORIGIN='https://lola-site-9ng.pages.dev';
export const notReady=()=>json({error:'Pagamento em ativação. Tente novamente em breve.'},503);
export function mpConfigured(env) {
 return Boolean(env?.DB && env.LOLA_MP_ENABLED==='true' &&
 typeof env.LOLA_MP_ACCESS_TOKEN==='string' && env.LOLA_MP_ACCESS_TOKEN.length>20 &&
 typeof env.LOLA_MP_PUBLIC_KEY==='string' && env.LOLA_MP_PUBLIC_KEY.length>15 &&
 typeof env.LOLA_MP_WEBHOOK_SECRET==='string' && env.LOLA_MP_WEBHOOK_SECRET.length>=20 &&
 /^\d+$/.test(env.LOLA_MP_ACCOUNT_ID||'') &&
 typeof env.LOLA_MP_PICKUP_DESCRIPTION==='string' && env.LOLA_MP_PICKUP_DESCRIPTION.trim().length>=5 &&
 typeof env.LOLA_ADMIN_SESSION_SECRET==='string' && env.LOLA_ADMIN_SESSION_SECRET.length>=32 &&
 ['test','production'].includes(env.LOLA_MP_MODE));
}
export async function provider(env,path,body,idempotency) {
 if (!/^\/(?:v1\/payments(?:\/\d+|\/search\?external_reference=[a-f0-9-]+)?|users\/me)$/.test(path)) throw Error('Invalid provider resource');
 const headers={'Authorization':'Bearer '+env.LOLA_MP_ACCESS_TOKEN,'Accept':'application/json'};
 if(body) {headers['Content-Type']='application/json';headers['X-Idempotency-Key']=idempotency;}
 const response=await fetch('https://api.mercadopago.com'+path,{
 method:body?'POST':'GET',headers,redirect:'manual',signal:AbortSignal.timeout(15000),
 ...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>null);
 if (!response.ok || !data) {
  const error=Error('Payment provider unavailable');
  error.definitive=Boolean(body && response.status>=400 && response.status<500 && ![408,409,429].includes(response.status));
  throw error;
 }
 return data;
}
export function safeOrder(row) {
 return {id:row.id,state:row.state,productName:row.product_name,quantity:row.quantity,
 amount:Number(row.amount_cents)/100,method:row.method||null,
 qrCode:row.state==='pending'?row.qr_code||null:null,
 qrImage:row.state==='pending'?row.qr_image||null:null};
}
export function paymentState(payment) {
 return ({approved:'approved',rejected:'rejected',cancelled:'cancelled',refunded:'refunded',charged_back:'charged_back'})[payment.status]||'pending';
}
export function validateProviderPayment(payment,row,env) {
 return /^\d+$/.test(String(payment.id)) && payment.external_reference===row.id &&
 String(payment.collector_id)===env.LOLA_MP_ACCOUNT_ID && payment.currency_id==='BRL' &&
 Math.round(Number(payment.transaction_amount)*100)===row.amount_cents &&
 payment.live_mode===(env.LOLA_MP_MODE==='production') &&
 (!row.payment_id || String(payment.id)===row.payment_id);
}
export async function reconcile(env,row,payment) {
 if (!validateProviderPayment(payment,row,env)) throw Error('Payment reconciliation mismatch');
 const state=paymentState(payment);
 if (['rejected','cancelled','expired','refunded','charged_back'].includes(row.state)) return row;
 if (row.state==='approved' && !['refunded','charged_back'].includes(state)) return row;
 const tx=payment.point_of_interaction?.transaction_data;
 const code=typeof tx?.qr_code==='string'&&tx.qr_code.length<=4096?tx.qr_code:null;
 const image=typeof tx?.qr_code_base64==='string'&&tx.qr_code_base64.length<=100000&&/^[A-Za-z0-9+/=]+$/.test(tx.qr_code_base64)?tx.qr_code_base64:null;
 await env.DB.prepare(`UPDATE mp_orders SET state=?,payment_id=?,method=?,qr_code=?,qr_image=?,updated_at=unixepoch() WHERE id=? AND state=?`)
 .bind(state,String(payment.id),String(payment.payment_method_id||'').slice(0,50),code,image,row.id,row.state).run();
 return env.DB.prepare('SELECT * FROM mp_orders WHERE id=?').bind(row.id).first();
}
export async function refreshOrder(env,row) {
 if (!['processing','pending','approved'].includes(row.state)) return row;
 if (row.payment_id) return reconcile(env,row,await provider(env,'/v1/payments/'+row.payment_id));
 const found=await provider(env,'/v1/payments/search?external_reference='+row.id);
 const items=Array.isArray(found.results)?found.results.filter(p=>validateProviderPayment(p,row,env)):[];
 if(items.length===1) return reconcile(env,row,items[0]);
 if(items.length>1) throw Error('Multiple payments require manual reconciliation');
 return row;
}
export async function rateLimit(context) {
 const ip=context.request.headers.get('cf-connecting-ip')||'unknown';
 const key=await hmac(context.env.LOLA_ADMIN_SESSION_SECRET,'checkout:'+ip);
 const now=Math.floor(Date.now()/1000);
 const row=await context.env.DB.prepare(`INSERT INTO mp_checkout_limits(key,attempts,reset_at) VALUES(?,1,?)
 ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,
 reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING attempts`)
 .bind(key,now+900,now,now).first();
 return Number(row?.attempts)<=20;
}
export async function checkoutOrder(context) {
 if (!mpConfigured(context.env)) return notReady();
 if(context.request.method!=='POST')return json({error:'Método não permitido.'},405,{Allow:'POST'});
 if(context.request.headers.get('origin')!==STORE_ORIGIN)return json({error:'Origem inválida.'},403);
 const body=await readJson(context.request,16384);
 if(!body||!['create','pay','status'].includes(body.action))return json({error:'Solicitação inválida.'},400);
 try {
  if(body.action==='create') {
   if(!await rateLimit(context))return json({error:'Muitas tentativas. Aguarde alguns minutos.'},429);
   if(typeof body.productId!=='string'||!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(body.productId)||
    !Number.isSafeInteger(body.quantity)||body.quantity<1||body.quantity>100||
    typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return json({error:'Produto ou quantidade inválidos.'},400);
   const hash=await sha256(body.token);
   const existing=await context.env.DB.prepare('SELECT * FROM mp_orders WHERE token_hash=?').bind(hash).first();
   if(existing) return json({order:safeOrder(existing)});
   await context.env.DB.prepare("UPDATE mp_orders SET state='expired' WHERE state='draft' AND expires_at<=unixepoch()").run();
   const product=await context.env.DB.prepare('SELECT id,name,price_cents FROM products WHERE id=? AND published=1 AND archived_at IS NULL').bind(body.productId).first();
   if(!product)return json({error:'Produto indisponível.'},409);
   const amount=Number(product.price_cents)*body.quantity;
   if(!Number.isSafeInteger(amount)||amount<100||amount>100000000)return json({error:'Valor fora dos limites do pagamento.'},400);
   const id=crypto.randomUUID();
   try {await context.env.DB.prepare(`INSERT INTO mp_orders(id,token_hash,product_id,product_name,quantity,amount_cents,expires_at) VALUES(?,?,?,?,?,?,unixepoch()+900)`)
    .bind(id,hash,product.id,product.name,body.quantity,amount).run();}
   catch {return json({error:'Estoque ou preço alterado. Atualize o catálogo e tente novamente.'},409);}
   const row=await context.env.DB.prepare('SELECT * FROM mp_orders WHERE id=?').bind(id).first();
   return json({order:safeOrder(row)},201);
  }
  const token=context.request.headers.get('x-checkout-token')||'';
  if(!/^[a-f0-9]{64}$/.test(token)||typeof body.id!=='string'||!/^[a-f0-9-]{36}$/.test(body.id))return json({error:'Pedido não autorizado.'},401);
  let row=await context.env.DB.prepare('SELECT * FROM mp_orders WHERE id=?').bind(body.id).first();
  if(!row||!same(row.token_hash,await sha256(token)))return json({error:'Pedido não autorizado.'},401);
  if(body.action==='status') {
   // Limit provider polling independently of the browser's refresh interval.
   const poll=await context.env.DB.prepare('UPDATE mp_orders SET updated_at=unixepoch() WHERE id=? AND updated_at<unixepoch()-5 RETURNING id').bind(row.id).first();
   if(poll) row=await refreshOrder(context.env,row);
   return json({order:safeOrder(row)});
  }
  if(row.state!=='draft')return json({order:safeOrder(await refreshOrder(context.env,row))});
  if(row.expires_at<=Math.floor(Date.now()/1000)) {
   await context.env.DB.prepare("UPDATE mp_orders SET state='expired' WHERE id=? AND state='draft'").bind(row.id).run();
   return json({error:'Pedido expirado. Inicie uma nova compra.'},409);
  }
  if(!await rateLimit(context))return json({error:'Muitas tentativas. Aguarde.'},429);
  const form=body.formData;
  if(!form||typeof form!=='object'||typeof form.payment_method_id!=='string'||
   !/^[a-zA-Z0-9_-]{1,40}$/.test(form.payment_method_id)||
   typeof form.payer?.email!=='string'||form.payer.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.payer.email))
   return json({error:'Confira os dados do pagamento.'},400);
  if(form.payment_method_id!=='pix'&& (typeof form.token!=='string'||!/^[a-zA-Z0-9_-]{10,200}$/.test(form.token)||!Number.isSafeInteger(form.installments)||form.installments<1||form.installments>12))return json({error:'Dados do cartão inválidos.'},400);
  const payer={email:form.payer.email};
  if(form.payer.identification&&['CPF','CNPJ'].includes(form.payer.identification.type)&&/^\d{11,14}$/.test(form.payer.identification.number||''))payer.identification={type:form.payer.identification.type,number:form.payer.identification.number};
  const payload={transaction_amount:row.amount_cents/100,description:'LOLA - '+row.product_name,
   external_reference:row.id,payment_method_id:form.payment_method_id,payer,
   notification_url:'https://lola-admin-api.pages.dev/api/webhooks/mercadopago',
   ...(form.payment_method_id==='pix'?{date_of_expiration:new Date(Date.now()+30*60000).toISOString()}:{token:form.token,installments:form.installments,...(form.issuer_id?{issuer_id:String(form.issuer_id).slice(0,30)}:{})})};
  const account=await provider(context.env,'/users/me');
  if(String(account.id)!==context.env.LOLA_MP_ACCOUNT_ID)return notReady();
  const claimed=await context.env.DB.prepare("UPDATE mp_orders SET state='processing',updated_at=unixepoch() WHERE id=? AND state='draft' RETURNING id").bind(row.id).first();
  if(!claimed)return json({error:'Pagamento já está sendo processado. Consulte o status.'},409);
  row={...row,state:'processing'};
  // Once the provider call starts, an ambiguous result MUST retain the reservation.
  // The order ID is also the provider idempotency key; no second charge is issued.
  try {const payment=await provider(context.env,'/v1/payments',payload,row.id);row=await reconcile(context.env,row,payment);}
  catch(error) {
   if(error.definitive) {
    await context.env.DB.prepare("UPDATE mp_orders SET state='rejected',updated_at=unixepoch() WHERE id=? AND state='processing'").bind(row.id).run();
    return json({order:safeOrder({...row,state:'rejected'})});
   }
   return json({order:safeOrder(row),message:'Pagamento em verificação. Não tente pagar novamente; consulte o status.'},202);
  }
  return json({order:safeOrder(row)});
 } catch {return json({error:'Não foi possível concluir a consulta. Nenhuma nova cobrança foi iniciada por esta resposta.'},503);}
}

export async function validWebhook(request,secret) {
 const id=new URL(request.url).searchParams.get('data.id')||'';
 const requestId=request.headers.get('x-request-id')||'';
 const signature=request.headers.get('x-signature')||'';
 const ts=signature.match(/(?:^|,)\s*ts=(\d+)/)?.[1];
 const v1=signature.match(/(?:^|,)\s*v1=([a-f0-9]{64})(?:,|$)/)?.[1];
 if(!/^\d{1,30}$/.test(id)||!requestId||requestId.length>200||!ts||!v1||typeof secret!=='string')return false;
 const stamp=Number(ts)/(ts.length>10?1000:1);
 if(Math.abs(Date.now()/1000-stamp)>300)return false;
 return same(v1,await hmac(secret,'id:'+id+';request-id:'+requestId+';ts:'+ts+';'));
}
