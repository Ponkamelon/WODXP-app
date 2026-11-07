import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifies the `Stripe-Signature` header of a webhook request without the Stripe SDK.
 * Stripe signs `${timestamp}.${rawBody}` with HMAC-SHA256 using the endpoint's signing secret
 * (the header looks like `t=1700000000,v1=<hex>,v1=<hex>`). Events older than the tolerance
 * are rejected so that a captured request cannot be replayed later.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  if (!header || !secret) return false;
  let timestamp = '';
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }
  if (!/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest();
  return signatures.some((sig) => {
    if (!/^[0-9a-f]+$/i.test(sig) || sig.length !== expected.length * 2) return false;
    return timingSafeEqual(Buffer.from(sig, 'hex'), expected);
  });
}
