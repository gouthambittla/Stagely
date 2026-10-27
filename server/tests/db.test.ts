import { prisma } from '../src/lib/prisma';
import { UserRole, VerificationStatus } from '../src/types';

describe('Database Models', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates an artist user with an unverified profile and 15-day slots', async () => {
    // Clean up test user if exists
    await prisma.user.deleteMany({ where: { email: 'band@stagely.in' } });

    const user = await prisma.user.create({
      data: {
        firebaseUid: 'band_firebase_uid_001',
        email: 'band@stagely.in',
        name: 'Hyderabad Fusion Collective Lead',
        role: UserRole.ARTIST,
        artistProfile: {
          create: {
            artistName: 'Hyderabad Fusion Collective',
            category: 'Band',
            genres: JSON.stringify(['Fusion Rock', 'Telugu Indie']),
            location: 'Hyderabad',
            baseFee: 25000,
            requirements: '2 Vocal Mics, 1 Drum Kit, Stereo PA System',
            verificationStatus: VerificationStatus.PENDING_VERIFICATION,
            availabilitySlots: {
              create: [
                {
                  date: '2026-11-01',
                  startTime: '19:00',
                  endTime: '22:00',
                  isBooked: false
                }
              ]
            }
          }
        }
      },
      include: {
        artistProfile: {
          include: {
            availabilitySlots: true
          }
        }
      }
    });

    expect(user.id).toBeDefined();
    expect(user.artistProfile?.verificationStatus).toBe(VerificationStatus.PENDING_VERIFICATION);
    expect(user.artistProfile?.baseFee).toBe(25000);
    expect(user.artistProfile?.availabilitySlots.length).toBe(1);
    expect(user.artistProfile?.availabilitySlots[0].date).toBe('2026-11-01');
  });

  it('creates user with firebaseUid and no passwordHash', async () => {
    await prisma.user.deleteMany({ where: { firebaseUid: 'test_firebase_uid_123' } as any });

    const user = await prisma.user.create({
      data: {
        firebaseUid: 'test_firebase_uid_123',
        phone: '+919876543210',
        name: 'Rohan Sharma',
        role: UserRole.CUSTOMER
      } as any
    });

    expect(user.id).toBeDefined();
    expect((user as any).firebaseUid).toBe('test_firebase_uid_123');
    expect((user as any).passwordHash).toBeUndefined();
    await prisma.user.delete({ where: { id: user.id } });
  });
});
