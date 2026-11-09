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

export interface GatewayTransfer {
  id: string;
  amountPaise: number;
  reversedPaise: number;
  onHold: boolean;
}

/** An artist's payout details. Sent straight to the gateway; Stagely never stores PAN or the full account number. */
export interface LinkedAccountInput {
  /** Our reference for the account, e.g. artist_user_12. */
  referenceId: string;
  legalName: string;
  email: string;
  /** 10-digit Indian mobile number. */
  phone: string;
  pan: string;
  accountNumber: string;
  ifsc: string;
  address: { street1: string; street2?: string; city: string; state: string; postalCode: string };
}

export interface BankDetailsInput {
  legalName: string;
  accountNumber: string;
  ifsc: string;
}

/** Route activation, simplified: ACTIVE means transfers to this account can be created. */
export type LinkedAccountStatus = 'PENDING' | 'ACTIVE' | 'REJECTED';

export interface LinkedAccount {
  accountId: string;
  productId: string;
  status: LinkedAccountStatus;
}

export interface PaymentGateway {
  readonly name: 'razorpay' | 'fake';
  /** Public key the checkout page needs. Safe to send to clients. */
  readonly keyId: string;

  /** Creates the artist's Route linked account with bank settlement details. */
  createLinkedAccount(input: LinkedAccountInput): Promise<LinkedAccount>;
  /** Changes the bank account an artist is paid into. Activation may go back to review. */
  updateLinkedAccountBank(accountId: string, productId: string, bank: BankDetailsInput): Promise<LinkedAccountStatus>;
  fetchLinkedAccountStatus(accountId: string, productId: string): Promise<LinkedAccountStatus>;

  createOrderWithHeldTransfer(input: CreateHeldOrderInput): Promise<GatewayOrder>;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  /** Every payment attempt made against an order (used when a webhook is late). */
  fetchOrderPayments(orderId: string): Promise<GatewayPayment[]>;
  /** The held transfer created from this payment's order, if it exists yet. */
  fetchHeldTransferId(paymentId: string): Promise<string | null>;
  /** Current state of a transfer: settlement reconciles against this, not our own records. */
  fetchTransfer(transferId: string): Promise<GatewayTransfer>;
  /** Total refunded on a payment so far, according to the gateway. */
  fetchRefundedPaise(paymentId: string): Promise<number>;
  /** Lifts the hold so the artist's share settles. */
  releaseTransfer(transferId: string): Promise<void>;
  /** Pulls the artist's share (or part of it) back to Stagely's account before a refund. */
  reverseTransfer(transferId: string, amountPaise?: number): Promise<void>;
  /**
   * Refunds the booker. With `reverseAllTransfers`, the artist's held share is pulled back in
   * the same call (used for full refunds before any release).
   */
  refund(paymentId: string, amountPaise: number, opts?: { reverseAllTransfers?: boolean }): Promise<{ id: string }>;
  /** Checks a webhook's HMAC over the exact raw request body. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}
