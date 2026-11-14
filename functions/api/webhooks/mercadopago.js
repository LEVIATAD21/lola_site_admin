import {json,readJson} from '../../_shared/adminApi.js';
import {mpConfigured,validWebhook,provider,reconcile} from '../../_shared/mercadoPago.js';
export async function onRequestPost(context) {
 if(!mpConfigured(context.env))return json({error:'Indisponível.'},503);
 if(!await validWebhook(context.request,context.env.LOLA_MP_WEBHOOK_SECRET))return json({error:'Notificação não autorizada.'},401);
 const body=await readJson(context.request,16384);
 const id=new URL(context.request.url).searchParams.get('data.id');
 if(!body||body.type!=='payment'||String(body.data?.id)!==id)return json({error:'Notificação inválida.'},400);
 try {
  const payment=await provider(context.env,'/v1/payments/'+id);
  if(typeof payment.external_reference!=='string')return json({received:true});
  const row=await context.env.DB.prepare('SELECT * FROM mp_orders WHERE id=?').bind(payment.external_reference).first();
  if(row)await reconcile(context.env,row,payment);
  return json({received:true});
 }catch{return json({error:'Reprocessar notificação.'},503);}
}
