import { Request, Response, NextFunction } from 'express';
import { verifyFirebaseIdToken } from '../lib/firebase';
import { prisma } from '../lib/prisma';
import { AuthUser, UserRole } from '../types';

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = await verifyFirebaseIdToken(token);
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid }
    });

    if (!user) {
      res.status(401).json({
        error: 'User not registered. Please complete onboarding.',
        code: 'USER_NOT_REGISTERED',
        firebaseUid: decoded.uid
      });
      return;
    }

    req.user = {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      phone: user.phone,
      name: user.name,
      role: user.role as UserRole
    };

    next();
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Invalid or expired Firebase token' });
  }
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
      return;
    }
    next();
  };
}
