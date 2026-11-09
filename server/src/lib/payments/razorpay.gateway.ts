import crypto from 'crypto';
import Razorpay from 'razorpay';
import {
  BankDetailsInput,
  CreateHeldOrderInput,
  GatewayOrder,
  GatewayPayment,
  GatewayPaymentStatus,
  GatewayTransfer,
  LinkedAccount,
  LinkedAccountInput,
  LinkedAccountStatus,
  PaymentGateway
} from './gateway';
import { safeEqualHex } from './fake.gateway';

/** Route product activation_status → our simplified status. */
export function mapActivationStatus(activationStatus: string | undefined): LinkedAccountStatus {
  switch (activationStatus) {
    case 'activated':
      return 'ACTIVE';
    case 'rejected':
    case 'suspended':
      return 'REJECTED';
    default:
      // requested, needs_clarification, under_review, ...
      return 'PENDING';
  }
}

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

  /**
   * Route linked-account onboarding (Razorpay "Linked Accounts v2"): account → stakeholder (PAN)
   * → request the Route product → set settlement bank details. Activation is then asynchronous.
   * Field names follow the SDK types; verify against Razorpay Test Mode (docs/wiki/payments-test-mode.md).
   */
  async createLinkedAccount(input: LinkedAccountInput): Promise<LinkedAccount> {
    const account = await this.client.accounts.create({
      email: input.email,
      phone: input.phone,
      type: 'route',
      reference_id: input.referenceId,
      legal_business_name: input.legalName,
      business_type: 'individual',
      contact_name: input.legalName,
      profile: {
        category: process.env.RAZORPAY_ROUTE_CATEGORY || 'others',
        subcategory: process.env.RAZORPAY_ROUTE_SUBCATEGORY || 'others',
        addresses: {
          registered: {
            street1: input.address.street1,
            street2: input.address.street2 || input.address.city,
            city: input.address.city,
            state: input.address.state,
            postal_code: input.address.postalCode,
            country: 'IN'
          }
        }
      }
    } as Parameters<Razorpay['accounts']['create']>[0]);

    await this.client.stakeholders.create(account.id, {
      name: input.legalName,
      email: input.email,
      kyc: { pan: input.pan }
    } as Parameters<Razorpay['stakeholders']['create']>[1]);

    const product = await this.client.products.requestProductConfiguration(account.id, {
      product_name: 'route',
      tnc_accepted: true
    });

    const status = await this.updateLinkedAccountBank(account.id, product.id, {
      legalName: input.legalName,
      accountNumber: input.accountNumber,
      ifsc: input.ifsc
    });
    return { accountId: account.id, productId: product.id, status };
  }

  async updateLinkedAccountBank(accountId: string, productId: string, bank: BankDetailsInput): Promise<LinkedAccountStatus> {
    const product = await this.client.products.edit(accountId, productId, {
      settlements: {
        account_number: bank.accountNumber,
        ifsc_code: bank.ifsc,
        beneficiary_name: bank.legalName
      },
      tnc_accepted: true
    } as Parameters<Razorpay['products']['edit']>[2]);
    return mapActivationStatus(product.activation_status);
  }

  async fetchLinkedAccountStatus(accountId: string, productId: string): Promise<LinkedAccountStatus> {
    const product = await this.client.products.fetch(accountId, productId);
    return mapActivationStatus(product.activation_status);
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
