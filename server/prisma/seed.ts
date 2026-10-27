import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Stagely database...');

  // Clean existing data
  await prisma.message.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.availabilitySlot.deleteMany();
  await prisma.artistProfile.deleteMany();
  await prisma.user.deleteMany();

  // 1. Admin User
  await prisma.user.create({
    data: {
      firebaseUid: 'firebase_admin_uid_001',
      email: 'admin@stagely.in',
      phone: '+919800000001',
      name: 'Stagely Admin',
      role: 'ADMIN'
    }
  });

  // 2. Verified Hyderabad Band: Jammers
  await prisma.user.create({
    data: {
      firebaseUid: 'firebase_artist_uid_001',
      email: 'jammers@stagely.in',
      phone: '+919800000002',
      name: 'Jammers Hyderabad Lead',
      role: 'ARTIST',
      artistProfile: {
        create: {
          artistName: 'Jammers Hyderabad',
          category: 'Band',
          genres: JSON.stringify(['Fusion Rock', 'Tollywood Retro', 'Indie']),
          location: 'Hyderabad',
          baseFee: 35000,
          bio: 'Top-rated 5-piece Hyderabad live band specializing in high-energy Telugu & Bollywood fusion sets.',
          requirements: 'Full PA sound system, 3 vocal microphones, 1 wireless drum mic set, 2 stage monitors.',
          youtubeUrl: 'https://youtube.com/@jammersband',
          instagramUrl: 'https://instagram.com/jammers_hyd',
          verificationStatus: 'VERIFIED',
          availabilitySlots: {
            create: [
              { date: '2026-11-01', startTime: '20:00', endTime: '23:00', isBooked: false },
              { date: '2026-11-02', startTime: '20:00', endTime: '23:00', isBooked: false },
              { date: '2026-11-06', startTime: '19:30', endTime: '22:30', isBooked: false },
              { date: '2026-11-07', startTime: '20:00', endTime: '23:00', isBooked: false }
            ]
          }
        }
      }
    }
  });

  // 3. Verified Solo Acoustic Artist: Ramya Sharma
  await prisma.user.create({
    data: {
      firebaseUid: 'firebase_artist_uid_002',
      email: 'ramya@stagely.in',
      phone: '+919800000003',
      name: 'Ramya Sharma',
      role: 'ARTIST',
      artistProfile: {
        create: {
          artistName: 'Ramya Sharma (Acoustic Solo)',
          category: 'Solo Musician',
          genres: JSON.stringify(['Acoustic Melodies', 'Sufi', 'Pop']),
          location: 'Hyderabad',
          baseFee: 15000,
          bio: 'Versatile singer-songwriter and acoustic guitarist performing across Jubilee Hills & Hitec City cafes.',
          requirements: '1 Vocal mic on boom stand, 1 acoustic DI box line, basic monitor.',
          youtubeUrl: 'https://youtube.com/@ramyasharmamusic',
          instagramUrl: 'https://instagram.com/ramyamusic',
          verificationStatus: 'VERIFIED',
          availabilitySlots: {
            create: [
              { date: '2026-11-03', startTime: '18:00', endTime: '20:00', isBooked: false },
              { date: '2026-11-04', startTime: '19:00', endTime: '21:00', isBooked: false },
              { date: '2026-11-05', startTime: '19:00', endTime: '21:00', isBooked: false }
            ]
          }
        }
      }
    }
  });

  // 4. Pending Artist (Waiting for Admin Verification): Deccan Groove
  await prisma.user.create({
    data: {
      firebaseUid: 'firebase_artist_uid_003',
      email: 'deccan@stagely.in',
      phone: '+919800000004',
      name: 'Deccan Groove Lead',
      role: 'ARTIST',
      artistProfile: {
        create: {
          artistName: 'Deccan Groove Collective',
          category: 'Band',
          genres: JSON.stringify(['Blues Rock', 'Carnatic Progressive']),
          location: 'Hyderabad',
          baseFee: 28000,
          bio: 'Upcoming progressive fusion band from Begumpet.',
          requirements: 'PA System, 2 guitar amps, drum kit.',
          youtubeUrl: 'https://youtube.com/@deccangroove',
          instagramUrl: 'https://instagram.com/deccangroove',
          verificationStatus: 'PENDING_VERIFICATION',
          availabilitySlots: {
            create: [
              { date: '2026-11-05', startTime: '20:00', endTime: '22:30', isBooked: false }
            ]
          }
        }
      }
    }
  });

  // 5. Customer (Pub / Event Organizer)
  await prisma.user.create({
    data: {
      firebaseUid: 'firebase_customer_uid_001',
      email: 'organizer@breweryhyd.in',
      phone: '+919800000005',
      name: 'Brewery Hyd Events',
      role: 'CUSTOMER'
    }
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
