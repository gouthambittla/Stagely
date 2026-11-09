import crypto from 'crypto';
import { CreateHeldOrderInput, GatewayOrder, GatewayPayment, PaymentGateway } from './gateway';

export const FAKE_WEBHOOK_SECRET = 'fake_webhook_secret';

interface FakeOrder extends GatewayOrder {
  artistAccountId: string;
  artistSharePaise: number;
  receipt: string;
}

export interface FakeTransfer {
  id: string;
  paymentId: string;
  accountId: string;
  amountPaise: number;
  onHold: boolean;
  reversedPaise: number;
}

/**
 * In-memory stand-in for Razorpay Route. Behaves like the real thing for the calls we make,
 * and lets tests simulate the booker paying. Never used in production.
 */
export class FakePaymentGateway implements PaymentGateway {
  readonly name = 'fake' as const;
  readonly keyId = 'rzp_test_fake';

  readonly orders = new Map<string, FakeOrder>();
  readonly payments = new Map<string, GatewayPayment>();
  readonly transfers = new Map<string, FakeTransfer>();
  readonly refunds: Array<{ id: string; paymentId: string; amountPaise: number }> = [];
  private seq = 0;

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_fake${Date.now().toString(36)}${this.seq}`;
  }

  async createOrderWithHeldTransfer(input: CreateHeldOrderInput): Promise<GatewayOrder> {
    const order: FakeOrder = {
      id: this.nextId('order'),
      amountPaise: input.amountPaise,
      artistAccountId: input.artistAccountId,
      artistSharePaise: input.artistSharePaise,
      receipt: input.receipt
    };
    this.orders.set(order.id, order);
    return { id: order.id, amountPaise: order.amountPaise };
  }

  /** Test helper: the booker pays an order. Creates the held transfer like Route does. */
  simulateCapture(orderId: string, amountPaise?: number): GatewayPayment {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Unknown fake order ${orderId}`);
    const payment: GatewayPayment = {
      id: this.nextId('pay'),
      orderId,
      amountPaise: amountPaise ?? order.amountPaise,
      status: 'captured'
    };
    this.payments.set(payment.id, payment);
    const transfer: FakeTransfer = {
      id: this.nextId('trf'),
      paymentId: payment.id,
      accountId: order.artistAccountId,
      amountPaise: order.artistSharePaise,
      onHold: true,
      reversedPaise: 0
    };
    this.transfers.set(transfer.id, transfer);
    return payment;
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error(`Unknown fake payment ${paymentId}`);
    return { ...payment };
  }

  async fetchOrderPayments(orderId: string): Promise<GatewayPayment[]> {
    return [...this.payments.values()].filter((p) => p.orderId === orderId).map((p) => ({ ...p }));
  }

  async fetchHeldTransferId(paymentId: string): Promise<string | null> {
    for (const t of this.transfers.values()) {
      if (t.paymentId === paymentId) return t.id;
    }
    return null;
  }

  async releaseTransfer(transferId: string): Promise<void> {
    const t = this.transfers.get(transferId);
    if (!t) throw new Error(`Unknown fake transfer ${transferId}`);
    t.onHold = false;
  }

  async reverseTransfer(transferId: string, amountPaise?: number): Promise<void> {
    const t = this.transfers.get(transferId);
    if (!t) throw new Error(`Unknown fake transfer ${transferId}`);
    const remaining = t.amountPaise - t.reversedPaise;
    const amount = amountPaise ?? remaining;
    if (amount > remaining) throw new Error('Reversal exceeds transfer');
    t.reversedPaise += amount;
  }

  async refund(paymentId: string, amountPaise: number, opts: { reverseAllTransfers?: boolean } = {}): Promise<{ id: string }> {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error(`Unknown fake payment ${paymentId}`);
    const refunded = this.refunds
      .filter((r) => r.paymentId === paymentId)
      .reduce((sum, r) => sum + r.amountPaise, 0);
    if (refunded + amountPaise > payment.amountPaise) throw new Error('Refund exceeds payment');
    if (opts.reverseAllTransfers) {
      for (const t of this.transfers.values()) {
        if (t.paymentId === paymentId) t.reversedPaise = t.amountPaise;
      }
    }
    const refund = { id: this.nextId('rfnd'), paymentId, amountPaise };
    this.refunds.push(refund);
    if (refunded + amountPaise === payment.amountPaise) payment.status = 'refunded';
    return { id: refund.id };
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return safeEqualHex(signFakeWebhook(rawBody), signature);
  }
}

/** Test helper: signs a body the way Razorpay signs webhooks (HMAC-SHA256, hex). */
export function signFakeWebhook(rawBody: string): string {
  return crypto.createHmac('sha256', FAKE_WEBHOOK_SECRET).update(rawBody).digest('hex');
}

/** Constant-time comparison of two hex signatures. */
export function safeEqualHex(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual ?? '', 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
