import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { PhoneLoginScreen } from '../screens/auth/PhoneLoginScreen';
import { OtpVerificationScreen } from '../screens/auth/OtpVerificationScreen';
import { EmailLinkScreen } from '../screens/auth/EmailLinkScreen';
import { RoleAndNameScreen } from '../screens/auth/RoleAndNameScreen';
import ExploreScreen from '../screens/customer/ExploreScreen';
import ArtistDetailScreen from '../screens/customer/ArtistDetailScreen';
import MyBookingsScreen from '../screens/customer/MyBookingsScreen';
import OnboardingWizardScreen from '../screens/artist/OnboardingWizardScreen';
import ArtistDashboardScreen from '../screens/artist/ArtistDashboardScreen';
import ScheduleManagerScreen from '../screens/artist/ScheduleManagerScreen';
import ChatScreen from '../screens/common/ChatScreen';
import AdminVerificationScreen from '../screens/admin/AdminVerificationScreen';
import { Music, Calendar, User as UserIcon, Compass } from 'lucide-react-native';

export const RootNavigator: React.FC = () => {
  const { user, isNewUser, isLoading, logout } = useAuth();

  // Auth flow sub-step state
  const [authStep, setAuthStep] = useState<'PHONE' | 'OTP' | 'EMAIL'>('PHONE');
  const [confirmationResult, setConfirmationResult] = useState<any | null>(null);
  const [pendingPhone, setPendingPhone] = useState<string>('');

  // Customer Navigation State
  const [customerTab, setCustomerTab] = useState<'EXPLORE' | 'BOOKINGS' | 'PROFILE'>('EXPLORE');
  const [selectedArtistForDetail, setSelectedArtistForDetail] = useState<any | null>(null);

  // Artist Navigation State
  const [artistTab, setArtistTab] = useState<'DASHBOARD' | 'SCHEDULE' | 'PROFILE'>('DASHBOARD');

  // Shared Chat Modal State
  const [activeChatBooking, setActiveChatBooking] = useState<any | null>(null);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F5A623" />
        <Text style={styles.loadingText}>Loading Stagely...</Text>
      </View>
    );
  }

  // 1. First-time User Profile Creation (Role & Name picker)
  if (isNewUser) {
    return <RoleAndNameScreen />;
  }

  // 2. Unauthenticated Flows (Phone OTP or Email Link)
  if (!user) {
    if (authStep === 'OTP' && confirmationResult) {
      return (
        <OtpVerificationScreen
          confirmation={confirmationResult}
          phoneNumber={pendingPhone}
          onBack={() => setAuthStep('PHONE')}
          onSuccess={() => setAuthStep('PHONE')}
        />
      );
    }

    if (authStep === 'EMAIL') {
      return (
        <EmailLinkScreen
          onBack={() => setAuthStep('PHONE')}
          onSuccess={() => setAuthStep('PHONE')}
        />
      );
    }

    return (
      <PhoneLoginScreen
        onOtpSent={(confirmation, phone) => {
          setConfirmationResult(confirmation);
          setPendingPhone(phone);
          setAuthStep('OTP');
        }}
        onUseEmail={() => setAuthStep('EMAIL')}
      />
    );
  }

  // 3. Active Chat Modal
  if (activeChatBooking) {
    return (
      <ChatScreen
        booking={activeChatBooking}
        onBack={() => setActiveChatBooking(null)}
      />
    );
  }

  // 4. ADMIN Flow
  if (user.role === 'ADMIN') {
    return <AdminVerificationScreen />;
  }

  // 5. ARTIST Flow
  if (user.role === 'ARTIST') {
    if (!user.artistProfile) {
      return <OnboardingWizardScreen onComplete={() => setArtistTab('DASHBOARD')} />;
    }

    return (
      <View style={styles.container}>
        <View style={styles.content}>
          {artistTab === 'DASHBOARD' && (
            <ArtistDashboardScreen
              onOpenChat={(b) => setActiveChatBooking(b)}
              onManageSchedule={() => setArtistTab('SCHEDULE')}
            />
          )}
          {artistTab === 'SCHEDULE' && (
            <ScheduleManagerScreen onBack={() => setArtistTab('DASHBOARD')} />
          )}
          {artistTab === 'PROFILE' && (
            <View style={styles.profileContainer}>
              <View style={styles.profileCard}>
                <Text style={styles.profileName}>{user.artistProfile.artistName}</Text>
                <Text style={styles.profileEmail}>{user.email || user.phone || 'Artist Account'}</Text>
                <View style={styles.profileStatusPill}>
                  <Text style={styles.profileStatusText}>
                    Status: {user.artistProfile.verificationStatus}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                <Text style={styles.logoutButtonText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Bottom Tab Bar for Artist */}
        <View style={styles.bottomTabBar}>
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setArtistTab('DASHBOARD')}
          >
            <Music size={20} color={artistTab === 'DASHBOARD' ? '#F5A623' : '#64748B'} />
            <Text style={[styles.tabLabel, artistTab === 'DASHBOARD' && styles.tabLabelActive]}>
              Requests
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setArtistTab('SCHEDULE')}
          >
            <Calendar size={20} color={artistTab === 'SCHEDULE' ? '#F5A623' : '#64748B'} />
            <Text style={[styles.tabLabel, artistTab === 'SCHEDULE' && styles.tabLabelActive]}>
              Schedule
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setArtistTab('PROFILE')}
          >
            <UserIcon size={20} color={artistTab === 'PROFILE' ? '#F5A623' : '#64748B'} />
            <Text style={[styles.tabLabel, artistTab === 'PROFILE' && styles.tabLabelActive]}>
              Profile
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 6. CUSTOMER Flow
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {selectedArtistForDetail ? (
          <ArtistDetailScreen
            artist={selectedArtistForDetail}
            onBack={() => setSelectedArtistForDetail(null)}
            onBookingSuccess={() => {
              setSelectedArtistForDetail(null);
              setCustomerTab('BOOKINGS');
            }}
          />
        ) : (
          <>
            {customerTab === 'EXPLORE' && (
              <ExploreScreen onSelectArtist={(artist) => setSelectedArtistForDetail(artist)} />
            )}
            {customerTab === 'BOOKINGS' && (
              <MyBookingsScreen
                onOpenChat={(b) => setActiveChatBooking(b)}
                onExplore={() => setCustomerTab('EXPLORE')}
              />
            )}
            {customerTab === 'PROFILE' && (
              <View style={styles.profileContainer}>
                <View style={styles.profileCard}>
                  <Text style={styles.profileName}>{user.name || 'Booker Account'}</Text>
                  <Text style={styles.profileEmail}>{user.email || user.phone || 'Stagely User'}</Text>
                  <Text style={styles.profileRole}>Role: Customer / Event Host</Text>
                </View>
                <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                  <Text style={styles.logoutButtonText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>

      {/* Bottom Tab Bar for Customer */}
      {!selectedArtistForDetail && (
        <View style={styles.bottomTabBar}>
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setCustomerTab('EXPLORE')}
          >
            <Compass size={20} color={customerTab === 'EXPLORE' ? '#F5A623' : '#64748B'} />
            <Text style={[styles.tabLabel, customerTab === 'EXPLORE' && styles.tabLabelActive]}>
              Explore
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setCustomerTab('BOOKINGS')}
          >
            <Calendar size={20} color={customerTab === 'BOOKINGS' ? '#F5A623' : '#64748B'} />
            <Text style={[styles.tabLabel, customerTab === 'BOOKINGS' && styles.tabLabelActive]}>
              My Bookings
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setCustomerTab('PROFILE')}
          >
            <UserIcon size={20} color={customerTab === 'PROFILE' ? '#F5A623' : '#64748B'} />
            <Text style={[styles.tabLabel, customerTab === 'PROFILE' && styles.tabLabelActive]}>
              Profile
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0D13'
  },
  content: {
    flex: 1
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0B0D13',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 14
  },
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#131722',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 20,
    justifyContent: 'space-around'
  },
  tabItem: {
    alignItems: 'center',
    gap: 4
  },
  tabLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600'
  },
  tabLabelActive: {
    color: '#F5A623',
    fontWeight: '700'
  },
  profileContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between'
  },
  profileCard: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 8,
    marginTop: 40
  },
  profileName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  profileEmail: {
    fontSize: 14,
    color: '#94A3B8'
  },
  profileRole: {
    fontSize: 13,
    color: '#F5A623',
    fontWeight: '600',
    marginTop: 4
  },
  profileStatusPill: {
    backgroundColor: '#3B270C',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 6
  },
  profileStatusText: {
    color: '#F5A623',
    fontSize: 12,
    fontWeight: '700'
  },
  logoutButton: {
    backgroundColor: '#2A1212',
    borderColor: '#7F1D1D',
    borderWidth: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20
  },
  logoutButtonText: {
    color: '#F87171',
    fontSize: 15,
    fontWeight: '700'
  }
});

export default RootNavigator;
