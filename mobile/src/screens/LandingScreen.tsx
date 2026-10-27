import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Music, Sparkles, ChevronRight, UserCheck } from 'lucide-react-native';

interface LandingScreenProps {
  onSelectRole: (role: 'CUSTOMER' | 'ARTIST') => void;
  onAdminLogin?: () => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({ onSelectRole, onAdminLogin }) => {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header & Hero Branding */}
      <View style={styles.heroSection}>
        <View style={styles.badge}>
          <Sparkles size={14} color="#F5A623" />
          <Text style={styles.badgeText}>Live Entertainment Marketplace</Text>
        </View>
        <Text style={styles.brandTitle}>Stagely</Text>
        <Text style={styles.heroSubtitle}>
          Discover, book, and perform. Connecting India's best live musicians, bands, and performers with top venues & events.
        </Text>
      </View>

      {/* Role Selection Options */}
      <View style={styles.cardsSection}>
        {/* Option 1: Customer / Bookers */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => onSelectRole('CUSTOMER')}
          accessibilityRole="button"
          accessibilityLabel="Find Live Artists"
        >
          <View style={[styles.iconCircle, { backgroundColor: '#1E293B' }]}>
            <Music size={26} color="#38BDF8" />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Find Live Artists</Text>
            <Text style={styles.cardSubtitle}>
              Browse vetted bands, solo artists & dancers for your pub, wedding, or private event.
            </Text>
          </View>
          <ChevronRight size={20} color="#64748B" />
        </TouchableOpacity>

        {/* Option 2: Performing Artists */}
        <TouchableOpacity
          style={[styles.card, styles.artistCard]}
          activeOpacity={0.85}
          onPress={() => onSelectRole('ARTIST')}
          accessibilityRole="button"
          accessibilityLabel="I am an Artist"
        >
          <View style={[styles.iconCircle, { backgroundColor: '#3B270C' }]}>
            <Sparkles size={26} color="#F5A623" />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>I am an Artist / Band</Text>
            <Text style={styles.cardSubtitle}>
              Showcase your music, set your performance fee in ₹, open your 15-day schedule, and get booked.
            </Text>
          </View>
          <ChevronRight size={20} color="#F5A623" />
        </TouchableOpacity>
      </View>

      {/* Footer / Admin Gateway */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Hyderabad • Bengaluru • Mumbai</Text>
        {onAdminLogin && (
          <TouchableOpacity onPress={onAdminLogin} style={styles.adminLink}>
            <UserCheck size={14} color="#64748B" />
            <Text style={styles.adminText}>Admin Review Portal</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0D13',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16
  },
  heroSection: {
    marginTop: 40,
    alignItems: 'flex-start'
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1B15',
    borderColor: '#422006',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
    gap: 6
  },
  badgeText: {
    color: '#F5A623',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5
  },
  brandTitle: {
    fontSize: 44,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
    marginBottom: 12
  },
  heroSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#94A3B8',
    maxWidth: '90%'
  },
  cardsSection: {
    gap: 16,
    marginVertical: 32
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 16
  },
  artistCard: {
    borderColor: '#451A03',
    backgroundColor: '#17120E'
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center'
  },
  cardContent: {
    flex: 1
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 8,
    gap: 8
  },
  footerText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '500'
  },
  adminLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 6
  },
  adminText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600'
  }
});

export default LandingScreen;
