import { json, readJson, same, sha256, unavailable } from '../../_shared/adminApi.js';
import { normalizeAsaasEvent, RELEVANT_EVENTS } from '../../_shared/finance.js';

// This endpoint only ingests provider-authenticated notifications.
// It NEVER initiates a refund or makes a charge.
export async function onRequestPost(context) {
  const token = context.env?.LOLA_ASAAS_WEBHOOK_TOKEN;
  if (!context.env?.DB || typeof token !== 'string' || token.length < 32) return unavailable();
  const provided = context.request.headers.get('asaas-access-token') ?? '';
  if (provided.length < 32 || provided.length > 255 ||
    !same(await sha256(provided), await sha256(token))) {
    return json({ error: 'Webhook não autenticado.' }, 401);
  }
  const payload = await readJson(context.request, 65536);
  if (!payload) return json({ error: 'JSON de evento inválido.' }, 400);
  if (!RELEVANT_EVENTS.has(payload.event)) return json({ received: true, ignored: true });
  const event = await normalizeAsaasEvent(payload);
  if (!event) return json({ error: 'Evento financeiro inválido.' }, 400);

  try {
    const existing = await context.env.DB.prepare(
      'SELECT event_id FROM finance_webhook_events WHERE event_id=?'
    ).bind(event.eventId).first();
    if (existing) return json({ received: true, duplicate: true });

    const now = Math.floor(Date.now()/1000);
    const statements = [
      context.env.DB.prepare(`INSERT INTO finance_webhook_events
        (event_id,payment_id,event_type,arrived_at) VALUES (?,?,?,?)
        ON CONFLICT(event_id) DO NOTHING`
      ).bind(event.eventId,event.paymentId,event.type,now),
      context.env.DB.prepare(`INSERT INTO finance_payments
        (payment_id,external_reference,amount_cents,status,billing_type,receipt_url,last_event_id,updated_at)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(payment_id) DO UPDATE SET
          external_reference=COALESCE(excluded.external_reference,finance_payments.external_reference),
          amount_cents=excluded.amount_cents,
          status=excluded.status,
          billing_type=excluded.billing_type,
          receipt_url=COALESCE(excluded.receipt_url,finance_payments.receipt_url),
          last_event_id=excluded.last_event_id,updated_at=excluded.updated_at`
      ).bind(event.paymentId,event.reference,event.amountCents,event.status,event.billingType,
        event.receiptUrl,event.eventId,now),
    ];
    for (const refund of event.refunds) {
      statements.push(context.env.DB.prepare(`INSERT INTO finance_refunds
        (refund_key,payment_id,amount_cents,status,receipt_url,refunded_at,updated_at)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(refund_key) DO UPDATE SET
          amount_cents=excluded.amount_cents,status=excluded.status,
          receipt_url=COALESCE(excluded.receipt_url,finance_refunds.receipt_url),
          refunded_at=COALESCE(excluded.refunded_at,finance_refunds.refunded_at),
          updated_at=excluded.updated_at`
      ).bind(refund.key,event.paymentId,refund.amountCents,refund.status,refund.receiptUrl,refund.date,now));
    }
    const completed = await context.env.DB.batch(statements);
    if (!Array.isArray(completed) || completed.some((r) => r?.success !== true)) return unavailable();
    return json({ received: true });
  } catch { return unavailable(); }
}
