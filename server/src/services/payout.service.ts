import { prisma } from '../lib/prisma';
import { HttpError, conflict, notFound } from '../lib/http';
import { getPaymentGateway, LinkedAccountStatus } from '../lib/payments';
import { BankDetailsInput } from '../lib/payments';
import { PayoutDetails, maskAccount } from '../lib/payoutValidation';

/** The payout columns we store on ArtistProfile: identifiers and what the masked view needs. */
export interface StoredPayout {
  payoutAccountId: string;
  payoutProductId: string;
  payoutStatus: LinkedAccountStatus;
  payoutLegalName: string;
  payoutIfsc: string;
  payoutAccountLast4: string;
}

export interface PayoutAccountView {
  status: string;
  legalName: string | null;
  ifsc: string | null;
  accountNumberMasked: string | null;
}

const toView = (p: {
  payoutStatus: string;
  payoutLegalName: string | null;
  payoutIfsc: string | null;
  payoutAccountLast4: string | null;
}): PayoutAccountView => ({
  status: p.payoutStatus,
  legalName: p.payoutLegalName,
  ifsc: p.payoutIfsc,
  accountNumberMasked: maskAccount(p.payoutAccountLast4)
});

/** Gateway errors carry Razorpay's own wording, which is useful to the artist; keep it short. */
function gatewayRejected(err: unknown): HttpError {
  const detail =
    (err as { error?: { description?: string } })?.error?.description ?? (err instanceof Error ? err.message : '');
  console.error('Payout account rejected by the gateway:', err);
  return new HttpError(
    422,
    `Razorpay couldn't accept these payout details${detail ? `: ${String(detail).slice(0, 200)}` : ''}. Please check them and try again.`
  );
}

/**
 * Artist payouts: the Razorpay Route linked account that receives each gig's artist share.
 * PAN and the full account number go straight to Razorpay and are never stored here.
 */
export class PayoutService {
  /** Creates the linked account. Returns the columns to store on the artist's profile. */
  static async createLinkedAccount(userId: number, details: PayoutDetails): Promise<StoredPayout> {
    try {
      const account = await getPaymentGateway().createLinkedAccount({
        referenceId: `artist_user_${userId}`,
        legalName: details.legalName,
        email: details.email,
        phone: details.phone,
        pan: details.pan,
        accountNumber: details.accountNumber,
        ifsc: details.ifsc,
        address: details.address
      });
      return {
        payoutAccountId: account.accountId,
        payoutProductId: account.productId,
        payoutStatus: account.status,
        payoutLegalName: details.legalName,
        payoutIfsc: details.ifsc,
        payoutAccountLast4: details.accountNumber.slice(-4)
      };
    } catch (err) {
      throw gatewayRejected(err);
    }
  }

  /** The artist's own payout details, masked. Refreshes the status from Razorpay while pending. */
  static async getPayoutAccount(userId: number): Promise<PayoutAccountView> {
    const profile = await prisma.artistProfile.findUnique({ where: { userId } });
    if (!profile) throw notFound('Artist profile not found');
    if (profile.payoutStatus === 'PENDING') {
      const refreshed = await PayoutService.refreshStatus(profile.id);
      if (refreshed) return toView(refreshed);
    }
    return toView(profile);
  }

  /**
   * First-time setup for an artist without a payout account (onboarded before payments), or a
   * fresh attempt after Razorpay rejected the previous one.
   */
  static async setUpPayoutAccount(userId: number, details: PayoutDetails): Promise<PayoutAccountView> {
    const profile = await prisma.artistProfile.findUnique({ where: { userId } });
    if (!profile) throw notFound('Artist profile not found. Complete onboarding first.');
    if (profile.payoutAccountId && profile.payoutStatus !== 'REJECTED') {
      throw conflict('Payout details are already set up. Edit them instead.');
    }
    const stored = await PayoutService.createLinkedAccount(userId, details);
    const updated = await prisma.artistProfile.update({ where: { id: profile.id }, data: stored });
    return toView(updated);
  }

  /**
   * Changes the bank account on the existing linked account, so any money already held for
   * confirmed gigs still lands with the same account. Razorpay may re-review it.
   */
  static async updateBankDetails(userId: number, bank: BankDetailsInput): Promise<PayoutAccountView> {
    const profile = await prisma.artistProfile.findUnique({ where: { userId } });
    if (!profile) throw notFound('Artist profile not found');
    if (!profile.payoutAccountId || !profile.payoutProductId) {
      throw conflict('Set up your payout details first');
    }
    let status: LinkedAccountStatus;
    try {
      status = await getPaymentGateway().updateLinkedAccountBank(profile.payoutAccountId, profile.payoutProductId, bank);
    } catch (err) {
      throw gatewayRejected(err);
    }
    const updated = await prisma.artistProfile.update({
      where: { id: profile.id },
      data: {
        payoutStatus: status,
        payoutLegalName: bank.legalName,
        payoutIfsc: bank.ifsc,
        payoutAccountLast4: bank.accountNumber.slice(-4)
      }
    });
    return toView(updated);
  }

  /** Asks Razorpay for an account's activation status and stores it. Returns the updated profile. */
  static async refreshStatus(artistProfileId: number) {
    const profile = await prisma.artistProfile.findUnique({ where: { id: artistProfileId } });
    if (!profile?.payoutAccountId || !profile.payoutProductId) return null;
    try {
      const status = await getPaymentGateway().fetchLinkedAccountStatus(profile.payoutAccountId, profile.payoutProductId);
      if (status === profile.payoutStatus) return profile;
      return prisma.artistProfile.update({ where: { id: profile.id }, data: { payoutStatus: status } });
    } catch (err) {
      console.error(`Could not refresh payout status for artist ${artistProfileId}:`, err);
      return null;
    }
  }

  /** Webhook (product.route.* / account.*): refresh whichever artist owns this linked account. */
  static async refreshByAccountId(accountId: string): Promise<void> {
    const profile = await prisma.artistProfile.findFirst({ where: { payoutAccountId: accountId } });
    if (profile) await PayoutService.refreshStatus(profile.id);
  }

  /** Sweep: refresh accounts still under review. Returns how many changed status. */
  static async refreshPendingAccounts(): Promise<number> {
    const pending = await prisma.artistProfile.findMany({
      where: { payoutStatus: 'PENDING', payoutAccountId: { not: null } },
      select: { id: true }
    });
    let changed = 0;
    for (const { id } of pending) {
      const updated = await PayoutService.refreshStatus(id);
      if (updated && updated.payoutStatus !== 'PENDING') changed += 1;
    }
    return changed;
  }
}
