import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  getAuth,
  signInWithPhoneNumber,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
  onAuthStateChanged,
  getIdToken,
  User as FirebaseUser,
  ConfirmationResult,
  formatPhoneNumber,
  emailLinkActionSettings
} from '../services/firebase';
import { api } from '../services/api';

export type UserRole = 'CUSTOMER' | 'ARTIST' | 'ADMIN';

export interface User {
  id: number;
  firebaseUid: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  role: UserRole;
  artistProfile?: any;
}

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  isLoading: boolean;
  isNewUser: boolean;
  sendPhoneOtp: (phoneNumber: string) => Promise<ConfirmationResult>;
  verifyPhoneOtp: (confirmation: ConfirmationResult, code: string) => Promise<void>;
  sendEmailLink: (email: string) => Promise<void>;
  verifyEmailLink: (email: string, link: string) => Promise<void>;
  completeSignup: (role: UserRole, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isNewUser, setIsNewUser] = useState<boolean>(false);

  const authInstance = getAuth();

  const syncBackendUser = async (fbUser: FirebaseUser) => {
    try {
      const idToken = await getIdToken(fbUser);
      const res = await api.syncFirebaseUser(idToken);
      if (res.isNewUser) {
        setUser(null);
        setIsNewUser(true);
      } else {
        setUser(res.user);
        setIsNewUser(false);
      }
    } catch (err) {
      console.error('Failed to sync Firebase user with backend:', err);
      setUser(null);
      setIsNewUser(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(authInstance, async (fbUser: FirebaseUser | null) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        await syncBackendUser(fbUser);
      } else {
        setUser(null);
        setIsNewUser(false);
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const sendPhoneOtp = async (rawPhone: string): Promise<ConfirmationResult> => {
    const formatted = formatPhoneNumber(rawPhone);
    const confirmation = await signInWithPhoneNumber(authInstance, formatted);
    return confirmation;
  };

  const verifyPhoneOtp = async (confirmation: ConfirmationResult, code: string) => {
    const credential = await confirmation.confirm(code);
    if (credential?.user) {
      await syncBackendUser(credential.user);
    }
  };

  const sendEmailLink = async (email: string) => {
    await sendSignInLinkToEmail(authInstance, email, emailLinkActionSettings);
  };

  const verifyEmailLink = async (email: string, link: string) => {
    if (isSignInWithEmailLink(authInstance, link)) {
      const credential = await signInWithEmailLink(authInstance, email, link);
      if (credential?.user) {
        await syncBackendUser(credential.user);
      }
    } else {
      throw new Error('Invalid or expired sign-in link');
    }
  };

  const completeSignup = async (role: UserRole, name: string) => {
    if (!firebaseUser) {
      throw new Error('No authenticated Firebase session found');
    }
    const idToken = await getIdToken(firebaseUser);
    const res = await api.completeSignup({
      idToken,
      role,
      name,
      email: firebaseUser.email || undefined,
      phone: firebaseUser.phoneNumber || undefined
    });

    setUser(res.user);
    setIsNewUser(false);
  };

  const logout = async () => {
    await signOut(authInstance);
    setUser(null);
    setFirebaseUser(null);
    setIsNewUser(false);
  };

  const refreshUser = async () => {
    const current = authInstance.currentUser;
    if (current) {
      await syncBackendUser(current);
    } else {
      setUser(null);
      setIsNewUser(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        isLoading,
        isNewUser,
        sendPhoneOtp,
        verifyPhoneOtp,
        sendEmailLink,
        verifyEmailLink,
        completeSignup,
        logout,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
