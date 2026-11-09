import { PaymentGateway } from './gateway';
import { FakePaymentGateway } from './fake.gateway';
import { RazorpayPaymentGateway } from './razorpay.gateway';

let gateway: PaymentGateway | null = null;

/**
 * The fake is used in tests, and in local development when no Razorpay keys are set.
 * Production always uses Razorpay (env.ts refuses to start without keys when payments are on).
 */
export function getPaymentGateway(): PaymentGateway {
  if (gateway) return gateway;
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, NODE_ENV } = process.env;
  const hasKeys = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET && RAZORPAY_WEBHOOK_SECRET);

  if (NODE_ENV !== 'test' && hasKeys) {
    gateway = new RazorpayPaymentGateway({
      keyId: RAZORPAY_KEY_ID!,
      keySecret: RAZORPAY_KEY_SECRET!,
      webhookSecret: RAZORPAY_WEBHOOK_SECRET!
    });
  } else if (NODE_ENV === 'production') {
    throw new Error('Razorpay credentials are required in production');
  } else {
    gateway = new FakePaymentGateway();
  }
  return gateway;
}

/** Tests only: swap in a specific gateway (or reset with null). */
export function setPaymentGateway(next: PaymentGateway | null): void {
  gateway = next;
}

export * from './gateway';
