import {mpConfigured} from '../_shared/mercadoPago.js';
import { auth, json, unavailable } from '../_shared/adminApi.js';

// Finance ledger is intentionally stored in DB, NEVER in PHOTOS_DB.
// Read-only UI: refunds must originate at the payment provider.
const allowedUrl = (value) => {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password ||
        !['asaas.com', 'www.asaas.com', 'sandbox.asaas.com'].includes(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
};

export async function onRequestGet(context) {
  const session = await auth(context);
  if (session.error) return session.error;
  try {
    if(context.env.LOLA_PAYMENT_PROVIDER==='mercadopago') {
      const result=await context.env.DB.prepare("SELECT id,payment_id,amount_cents,state,method,updated_at FROM mp_orders WHERE payment_id IS NOT NULL ORDER BY updated_at DESC LIMIT 100").all();
      const rows=result.results||[];
      return json({provider:'mercadopago',integrationConfigured:mpConfigured(context.env),
       payments:rows.map(p=>({id:p.payment_id,reference:p.id,amount:p.amount_cents/100,status:p.state,method:p.method,receiptUrl:null,updatedAt:p.updated_at})),
       refunds:rows.filter(p=>p.state==='refunded').map(p=>({id:p.id,paymentId:p.payment_id,amount:p.amount_cents/100,status:'DONE',receiptUrl:null,date:new Date(p.updated_at*1000).toISOString(),updatedAt:p.updated_at}))});
    }
    const [payments, refunds] = await Promise.all([
      context.env.DB.prepare(`SELECT payment_id, external_reference, amount_cents,
        status, billing_type, receipt_url, updated_at
        FROM finance_payments ORDER BY updated_at DESC, payment_id DESC LIMIT 100`).all(),
      context.env.DB.prepare(`SELECT refund_key, payment_id, amount_cents,
        status, receipt_url, refunded_at, updated_at
        FROM finance_refunds ORDER BY updated_at DESC, refund_key DESC LIMIT 100`).all(),
    ]);
    if (!payments?.success || !refunds?.success ||
        !Array.isArray(payments.results) || !Array.isArray(refunds.results)) return unavailable();
    return json({
      provider: 'asaas',
      integrationConfigured: typeof context.env.LOLA_ASAAS_WEBHOOK_TOKEN === 'string' &&
        context.env.LOLA_ASAAS_WEBHOOK_TOKEN.length >= 32,
      // These records are provider notifications; reconciliation is still needed.
      payments: payments.results.map((p) => ({
        id: String(p.payment_id), reference: p.external_reference ?? null,
        amount: Number(p.amount_cents)/100,
        status: String(p.status), method: String(p.billing_type),
        receiptUrl: allowedUrl(p.receipt_url), updatedAt: Number(p.updated_at),
      })),
      refunds: refunds.results.map((r) => ({
        id: String(r.refund_key), paymentId: String(r.payment_id),
        amount: Number(r.amount_cents)/100, status: String(r.status),
        receiptUrl: allowedUrl(r.receipt_url), date: r.refunded_at ?? null,
        updatedAt: Number(r.updated_at),
      })),
    });
  } catch { return unavailable(); }
}

