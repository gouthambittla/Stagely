import crypto from 'crypto';
import Razorpay from 'razorpay';
import {
  CreateHeldOrderInput,
  GatewayOrder,
  GatewayPayment,
  GatewayPaymentStatus,
  GatewayTransfer,
  PaymentGateway
} from './gateway';
import { safeEqualHex } from './fake.gateway';

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

/**
 * Razorpay Route adapter. The booker's payment lands in Stagely's Razorpay account; the
 * artist's share is transferred to their linked account with the settlement on hold, so
 * Razorpay (a licensed payment aggregator) holds it until we release or reverse it.
 * Exercised against Razorpay Test Mode in Phase 7.
 */
export class RazorpayPaymentGateway implements PaymentGateway {
  readonly name = 'razorpay' as const;
  readonly keyId: string;
  private readonly client: Razorpay;
  private readonly webhookSecret: string;

  constructor(creds: RazorpayCredentials) {
    this.keyId = creds.keyId;
    this.webhookSecret = creds.webhookSecret;
    this.client = new Razorpay({ key_id: creds.keyId, key_secret: creds.keySecret });
  }

  async createOrderWithHeldTransfer(input: CreateHeldOrderInput): Promise<GatewayOrder> {
    // The SDK's transfer-order type omits receipt/notes, which the Orders API accepts.
    const body = {
      amount: input.amountPaise,
      currency: 'INR',
      receipt: input.receipt,
      notes: input.notes,
      transfers: [
        {
          account: input.artistAccountId,
          amount: input.artistSharePaise,
          currency: 'INR',
          on_hold: 1 as const,
          notes: { receipt: input.receipt }
        }
      ]
    };
    const order = await this.client.orders.create(body as Parameters<Razorpay['orders']['create']>[0]);
    return { id: order.id, amountPaise: Number(order.amount) };
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    const p = await this.client.payments.fetch(paymentId);
    return {
      id: p.id,
      orderId: String(p.order_id),
      amountPaise: Number(p.amount),
      status: p.status as GatewayPaymentStatus
    };
  }

  async fetchOrderPayments(orderId: string): Promise<GatewayPayment[]> {
    const res = await this.client.orders.fetchPayments(orderId);
    return (res.items ?? []).map((p) => ({
      id: p.id,
      orderId: String(p.order_id),
      amountPaise: Number(p.amount),
      status: p.status as GatewayPaymentStatus
    }));
  }

  async fetchHeldTransferId(paymentId: string): Promise<string | null> {
    const res = await this.client.payments.fetchTransfer(paymentId);
    const items = (res as { items?: Array<{ id: string }> }).items ?? [];
    return items[0]?.id ?? null;
  }

  async fetchTransfer(transferId: string): Promise<GatewayTransfer> {
    const t = await this.client.transfers.fetch(transferId);
    return {
      id: t.id,
      amountPaise: Number(t.amount),
      reversedPaise: Number(t.amount_reversed ?? 0),
      onHold: Boolean(t.on_hold)
    };
  }

  async fetchRefundedPaise(paymentId: string): Promise<number> {
    const p = await this.client.payments.fetch(paymentId);
    return Number(p.amount_refunded ?? 0);
  }

  async releaseTransfer(transferId: string): Promise<void> {
    await this.client.transfers.edit(transferId, { on_hold: 0 });
  }

  async reverseTransfer(transferId: string, amountPaise?: number): Promise<void> {
    if (amountPaise === undefined) {
      await this.client.transfers.reverse(transferId);
    } else {
      await this.client.transfers.reverse(transferId, { amount: amountPaise });
    }
  }

  async refund(paymentId: string, amountPaise: number, opts: { reverseAllTransfers?: boolean } = {}): Promise<{ id: string }> {
    const refund = await this.client.payments.refund(
      paymentId,
      opts.reverseAllTransfers ? { amount: amountPaise, reverse_all: 1 } : { amount: amountPaise }
    );
    return { id: refund.id };
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const expected = crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return safeEqualHex(expected, signature);
  }
}
