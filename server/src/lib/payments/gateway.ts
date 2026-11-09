/**
 * Everything Stagely needs from a payment provider. Razorpay Route is the real adapter;
 * a fake backs tests and keyless local development. A second provider (e.g. Cashfree Easy
 * Split) would be another implementation of this interface.
 */

export interface CreateHeldOrderInput {
  /** Total the booker pays, in paise. */
  amountPaise: number;
  /** Linked account that receives the artist's share once the hold is released. */
  artistAccountId: string;
  /** Artist's share, in paise. Transferred with the hold on. */
  artistSharePaise: number;
  /** Our reference, e.g. booking_123. */
  receipt: string;
  notes?: Record<string, string>;
}

export interface GatewayOrder {
  id: string;
  amountPaise: number;
}

export type GatewayPaymentStatus = 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';

export interface GatewayPayment {
  id: string;
  orderId: string;
  amountPaise: number;
  status: GatewayPaymentStatus;
}

export interface PaymentGateway {
  readonly name: 'razorpay' | 'fake';
  /** Public key the checkout page needs. Safe to send to clients. */
  readonly keyId: string;

  createOrderWithHeldTransfer(input: CreateHeldOrderInput): Promise<GatewayOrder>;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  /** The held transfer created from this payment's order, if it exists yet. */
  fetchHeldTransferId(paymentId: string): Promise<string | null>;
  /** Lifts the hold so the artist's share settles. */
  releaseTransfer(transferId: string): Promise<void>;
  /** Pulls the artist's share (or part of it) back to Stagely's account before a refund. */
  reverseTransfer(transferId: string, amountPaise?: number): Promise<void>;
  refund(paymentId: string, amountPaise: number): Promise<{ id: string }>;
  /** Checks a webhook's HMAC over the exact raw request body. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}
