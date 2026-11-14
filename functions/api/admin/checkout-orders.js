import {auth,json,unavailable} from '../../_shared/adminApi.js';
import {mpConfigured,refreshOrder} from '../../_shared/mercadoPago.js';
export async function onRequestGet(context) {
 const session=await auth(context);if(session.error)return session.error;
 try{
  const exists=await context.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mp_orders'").first();
  if(!exists)return json({orders:[],configured:false});
  const result=await context.env.DB.prepare('SELECT id,product_name,quantity,amount_cents,state,payment_id,method,created_at,updated_at FROM mp_orders ORDER BY created_at DESC LIMIT 100').all();
  return json({orders:result.results||[],configured:mpConfigured(context.env)});
 }catch{return unavailable();}
}
export async function onRequestPost(context) {
 const session=await auth(context,true);if(session.error)return session.error;
 if(!mpConfigured(context.env))return json({error:'Mercado Pago ainda não configurado.'},503);
 try{
  const result=await context.env.DB.prepare("SELECT * FROM mp_orders WHERE state IN ('processing','pending') ORDER BY updated_at LIMIT 10").all();
  let checked=0,failed=0;
  for(const row of result.results||[]) {
   try{await refreshOrder(context.env,row);checked++;}catch{failed++;}
  }
  return json({checked,failed});
 }catch{return unavailable();}
}
