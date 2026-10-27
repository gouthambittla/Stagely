import { prisma } from '../lib/prisma';
import { verifyFirebaseIdToken } from '../lib/firebase';
import { UserRole } from '../types';

export interface CompleteSignupInput {
  idToken: string;
  role: UserRole;
  name: string;
  email?: string;
  phone?: string;
}

export class AuthService {
  static async syncFirebaseUser(idToken: string) {
    const decoded = await verifyFirebaseIdToken(idToken);

    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      include: {
        artistProfile: {
          include: {
            availabilitySlots: true
          }
        }
      }
    });

    if (!user) {
      return {
        isNewUser: true,
        firebaseUid: decoded.uid,
        email: decoded.email || null,
        phone: decoded.phone_number || null,
        name: decoded.name || null
      };
    }

    return {
      isNewUser: false,
      user: {
        id: user.id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
        artistProfile: user.artistProfile
      }
    };
  }

  static async completeSignup(input: CompleteSignupInput) {
    const { idToken, role, name, email, phone } = input;
    const decoded = await verifyFirebaseIdToken(idToken);

    const existing = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid }
    });

    if (existing) {
      throw new Error('User already registered');
    }

    const resolvedEmail = email || decoded.email || null;
    const resolvedPhone = phone || decoded.phone_number || null;
    const resolvedName = name || decoded.name || 'User';

    const user = await prisma.user.create({
      data: {
        firebaseUid: decoded.uid,
        email: resolvedEmail,
        phone: resolvedPhone,
        name: resolvedName,
        role
      }
    });

    return {
      user: {
        id: user.id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role
      }
    };
  }

  static async getMe(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        artistProfile: {
          include: {
            availabilitySlots: true
          }
        }
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      phone: user.phone,
      name: user.name,
      role: user.role,
      artistProfile: user.artistProfile
    };
  }
}
