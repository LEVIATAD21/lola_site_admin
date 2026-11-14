import { auth, json, unavailable } from '../../_shared/adminApi.js';
import { trustedReceiptUrl } from '../../_shared/finance.js';

// Explicit one-off admin lookup for historical records (never creates refunds).
// Credentials are never returned to the browser and URLs are fixed allowlisted.
export async function onRequestGet(context) {
  const current = await auth(context);
  if (current.error) return current.error;
  const env = context.env;
  const credential = env?.LOLA_ASAAS_API_KEY;
  const selected = env?.LOLA_ASAAS_ENV;
  if (typeof credential !== 'string' || credential.length < 32 ||
      !['sandbox','production'].includes(selected)) return unavailable();

  const origin = selected === 'production'
    ? 'https://api.asaas.com' : 'https://api-sandbox.asaas.com';
  try {
    const response = await fetch(origin + '/v3/payments?limit=50&offset=0', {
      method:'GET', redirect:'error', signal:AbortSignal.timeout(12000),
      headers:{
        'access_token':credential,
        'accept':'application/json',
        'user-agent':'LOLA-Admin-ReadOnly/1.0',
      },
    });
    if (!response.ok) return json({ error:'Falha ao consultar o Asaas. Verifique a integração, credenciais e permissões.' }, 502);
    const data = await response.json();
    if (!Array.isArray(data?.data) || data.data.length > 50) return unavailable();
    const payments = [], refunds = [];
    for (const p of data.data) {
      if (!p || typeof p !== 'object' || typeof p.id !== 'string' ||
          !/^[A-Za-z0-9_-]{2,128}$/.test(p.id)) continue;
      const amount = Number(p.value);
      if (!Number.isFinite(amount) || amount < 0 || amount > 99999999) continue;
      const status = typeof p.status === 'string' && /^[A-Z_]{2,48}$/.test(p.status)
        ? p.status : 'UNKNOWN';
      const method = typeof p.billingType === 'string' && /^[A-Z_]{2,35}$/.test(p.billingType)
        ? p.billingType : 'UNKNOWN';
      payments.push({
        id:p.id, reference:typeof p.externalReference==='string' &&
          /^[A-Za-z0-9_-]{1,128}$/.test(p.externalReference) ? p.externalReference : null,
        amount,status,method,receiptUrl:trustedReceiptUrl(p.transactionReceiptUrl),
        updatedAt:Date.now()/1000,
      });
      if (Array.isArray(p.refunds)) {
        for (const r of p.refunds.slice(0,30)) {
          const value = Number(r?.value);
          if (!Number.isFinite(value) || value<0 || value>99999999) continue;
          const state = ['PENDING','DONE','CANCELLED'].includes(r?.status) ? r.status : 'UNKNOWN';
          refunds.push({
            id:p.id + ':' + refunds.length,
            paymentId:p.id,amount:value,status:state,
            receiptUrl:trustedReceiptUrl(r?.transactionReceiptUrl),
            date:typeof r?.dateCreated === 'string' && r.dateCreated.length <= 32 ? r.dateCreated : null,
            updatedAt:Date.now()/1000,
          });
        }
      }
    }
    return json({
      provider:'asaas', source:'api-readonly', environment:selected,
      hasMore:Boolean(data.hasMore), payments, refunds,
    });
  } catch { return json({error:'Consulta ao Asaas indisponível no momento.'},502); }
}
