import { UserRole, VerificationStatus, BookingStatus } from '../src/types';

describe('Shared Domain Types', () => {
  it('should define core domain roles and status enumerations', () => {
    expect(UserRole.CUSTOMER).toBe('CUSTOMER');
    expect(UserRole.ARTIST).toBe('ARTIST');
    expect(UserRole.ADMIN).toBe('ADMIN');

    expect(VerificationStatus.PENDING_VERIFICATION).toBe('PENDING_VERIFICATION');
    expect(VerificationStatus.VERIFIED).toBe('VERIFIED');
    expect(VerificationStatus.REJECTED).toBe('REJECTED');

    expect(BookingStatus.REQUESTED).toBe('REQUESTED');
    expect(BookingStatus.ACCEPTED).toBe('ACCEPTED');
    expect(BookingStatus.DECLINED).toBe('DECLINED');
    expect(BookingStatus.COMPLETED).toBe('COMPLETED');
  });
});
