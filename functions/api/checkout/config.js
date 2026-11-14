import {json} from '../../_shared/adminApi.js';
import {mpConfigured,provider} from '../../_shared/mercadoPago.js';
export async function onRequestGet({env}) {
 if(!mpConfigured(env))return json({enabled:false});
 try {
  await env.DB.prepare('SELECT id FROM mp_orders LIMIT 1').first();
  const account=await provider(env,'/users/me');
  if(String(account.id)!==env.LOLA_MP_ACCOUNT_ID)return json({enabled:false});
 }
 catch{return json({enabled:false});}
 return json({enabled:true,publicKey:env.LOLA_MP_PUBLIC_KEY,mode:env.LOLA_MP_MODE,pickup:env.LOLA_MP_PICKUP_DESCRIPTION});
}
