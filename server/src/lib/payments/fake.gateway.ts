import crypto from 'crypto';
import {
  BankDetailsInput,
  CreateHeldOrderInput,
  GatewayOrder,
  GatewayPayment,
  GatewayTransfer,
  LinkedAccount,
  LinkedAccountInput,
  LinkedAccountStatus,
  PaymentGateway
} from './gateway';

export const FAKE_WEBHOOK_SECRET = 'fake_webhook_secret';

interface FakeLinkedAccount extends LinkedAccount {
  referenceId: string;
  legalName: string;
  accountNumber: string;
  ifsc: string;
}

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
  readonly linkedAccounts = new Map<string, FakeLinkedAccount>();
  private seq = 0;
  /** Local dev without keys: activate payout accounts at once so artists can accept bookings. */
  autoActivateAccounts: boolean;
  /** Tests: make the next createLinkedAccount fail as if Razorpay rejected the details. */
  rejectNextAccount = false;

  constructor(opts: { autoActivateAccounts?: boolean } = {}) {
    this.autoActivateAccounts = opts.autoActivateAccounts ?? false;
  }
  /** Tests: simulate network round-trips so concurrent callers really interleave. */
  latencyMs = 0;

  private async network(): Promise<void> {
    if (this.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_fake${Date.now().toString(36)}${this.seq}`;
  }

  async createLinkedAccount(input: LinkedAccountInput): Promise<LinkedAccount> {
    await this.network();
    if (this.rejectNextAccount) {
      this.rejectNextAccount = false;
      throw new Error('Fake gateway rejected the linked account details');
    }
    const account: FakeLinkedAccount = {
      accountId: this.nextId('acc'),
      productId: this.nextId('acc_prd'),
      status: this.autoActivateAccounts ? 'ACTIVE' : 'PENDING',
      referenceId: input.referenceId,
      legalName: input.legalName,
      accountNumber: input.accountNumber,
      ifsc: input.ifsc
    };
    this.linkedAccounts.set(account.accountId, account);
    return { accountId: account.accountId, productId: account.productId, status: account.status };
  }

  async updateLinkedAccountBank(accountId: string, productId: string, bank: BankDetailsInput): Promise<LinkedAccountStatus> {
    await this.network();
    const account = this.linkedAccounts.get(accountId);
    if (!account || account.productId !== productId) throw new Error(`Unknown fake linked account ${accountId}`);
    Object.assign(account, bank, { status: this.autoActivateAccounts ? 'ACTIVE' : 'PENDING' });
    return account.status;
  }

  async fetchLinkedAccountStatus(accountId: string, productId: string): Promise<LinkedAccountStatus> {
    await this.network();
    const account = this.linkedAccounts.get(accountId);
    if (!account || account.productId !== productId) throw new Error(`Unknown fake linked account ${accountId}`);
    return account.status;
  }

  /** Test helper: Razorpay finishes reviewing an account. */
  setLinkedAccountStatus(accountId: string, status: LinkedAccountStatus): void {
    const account = this.linkedAccounts.get(accountId);
    if (!account) throw new Error(`Unknown fake linked account ${accountId}`);
    account.status = status;
  }

  async createOrderWithHeldTransfer(input: CreateHeldOrderInput): Promise<GatewayOrder> {
    await this.network();
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
    await this.network();
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error(`Unknown fake payment ${paymentId}`);
    return { ...payment };
  }

  async fetchOrderPayments(orderId: string): Promise<GatewayPayment[]> {
    await this.network();
    return [...this.payments.values()].filter((p) => p.orderId === orderId).map((p) => ({ ...p }));
  }

  async fetchHeldTransferId(paymentId: string): Promise<string | null> {
    await this.network();
    for (const t of this.transfers.values()) {
      if (t.paymentId === paymentId) return t.id;
    }
    return null;
  }

  async fetchTransfer(transferId: string): Promise<GatewayTransfer> {
    await this.network();
    const t = this.transfers.get(transferId);
    if (!t) throw new Error(`Unknown fake transfer ${transferId}`);
    return { id: t.id, amountPaise: t.amountPaise, reversedPaise: t.reversedPaise, onHold: t.onHold };
  }

  async fetchRefundedPaise(paymentId: string): Promise<number> {
    await this.network();
    return this.refunds.filter((r) => r.paymentId === paymentId).reduce((sum, r) => sum + r.amountPaise, 0);
  }

  async releaseTransfer(transferId: string): Promise<void> {
    await this.network();
    const t = this.transfers.get(transferId);
    if (!t) throw new Error(`Unknown fake transfer ${transferId}`);
    t.onHold = false;
  }

  async reverseTransfer(transferId: string, amountPaise?: number): Promise<void> {
    await this.network();
    const t = this.transfers.get(transferId);
    if (!t) throw new Error(`Unknown fake transfer ${transferId}`);
    const remaining = t.amountPaise - t.reversedPaise;
    const amount = amountPaise ?? remaining;
    if (amount > remaining) throw new Error('Reversal exceeds transfer');
    t.reversedPaise += amount;
  }

  async refund(paymentId: string, amountPaise: number, opts: { reverseAllTransfers?: boolean } = {}): Promise<{ id: string }> {
    await this.network();
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
