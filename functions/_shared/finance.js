import { sha256 } from './adminApi.js';

export const RELEVANT_EVENTS = new Set([
  'PAYMENT_CREATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED',
  'PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED',
  'PAYMENT_REFUND_IN_PROGRESS', 'PAYMENT_REFUND_DENIED',
  'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE',
]);

export function trustedReceiptUrl(value) {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password &&
      ['asaas.com','www.asaas.com','sandbox.asaas.com'].includes(u.hostname)
        ? u.toString() : null;
  } catch { return null; }
}

function cents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) ||
      value < 0 || value > 99999999) return null;
  const result = Math.round(value * 100);
  return Number.isSafeInteger(result) ? result : null;
}

export async function normalizeAsaasEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (typeof body.id !== 'string' || !/^[A-Za-z0-9_.&-]{6,128}$/.test(body.id)) return null;
  if (!RELEVANT_EVENTS.has(body.event)) return null;
  const p = body.payment;
  if (!p || typeof p !== 'object' || Array.isArray(p) ||
      typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{2,128}$/.test(p.id)) return null;
  const amount = cents(p.value);
  if (amount === null) return null;
  const status = typeof p.status === 'string' && /^[A-Z_]{2,48}$/.test(p.status)
    ? p.status : body.event.replace(/^PAYMENT_/, '');
  const method = typeof p.billingType === 'string' && /^[A-Z_]{2,35}$/.test(p.billingType)
    ? p.billingType : 'UNKNOWN';
  const reference = typeof p.externalReference === 'string' &&
    /^[A-Za-z0-9_-]{1,128}$/.test(p.externalReference) ? p.externalReference : null;
  const refunds = [];
  if (Array.isArray(p.refunds)) {
    if (p.refunds.length > 30) return null;
    for (const [index, refund] of p.refunds.entries()) {
      if (!refund || typeof refund !== 'object' || Array.isArray(refund)) return null;
      const value = cents(refund.value);
      if (value === null) return null;
      const date = typeof refund.dateCreated === 'string' &&
        /^[0-9 :T./Z+-]{10,32}$/.test(refund.dateCreated) ? refund.dateCreated : '';
      const stableRef = typeof refund.endToEndIdentifier === 'string' &&
        /^[A-Za-z0-9_-]{5,100}$/.test(refund.endToEndIdentifier)
        ? refund.endToEndIdentifier : date + ':' + value + ':' + index;
      refunds.push({
        key: await sha256(p.id + ':' + stableRef),
        amountCents: value,
        status: ['PENDING','DONE','CANCELLED'].includes(refund.status) ? refund.status : 'UNKNOWN',
        receiptUrl: trustedReceiptUrl(refund.transactionReceiptUrl),
        date: date || null,
      });
    }
  }
  return {
    eventId: body.id, type: body.event, paymentId: p.id,
    amountCents: amount, status, billingType: method, reference,
    receiptUrl: trustedReceiptUrl(p.transactionReceiptUrl),
    refunds,
  };
}
