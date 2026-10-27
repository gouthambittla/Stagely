import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Music, Sparkles, User as UserIcon, Check } from 'lucide-react-native';
import { useAuth, UserRole } from '../../context/AuthContext';

export const RoleAndNameScreen: React.FC = () => {
  const { completeSignup, firebaseUser } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole>('CUSTOMER');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleComplete = async () => {
    setErrorMessage(null);
    const cleanedName = name.trim();

    if (!cleanedName) {
      setErrorMessage('Please enter your name or stage name.');
      return;
    }

    setLoading(true);
    try {
      await completeSignup(selectedRole, cleanedName);
    } catch (err: any) {
      console.error('Failed to complete onboarding:', err);
      setErrorMessage(err?.message || 'Failed to complete profile setup. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Welcome to Stagely!</Text>
            <Text style={styles.subtitle}>
              Your phone is verified. Tell us a bit about how you'll be using Stagely.
            </Text>
          </View>

          {errorMessage && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Name input */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {selectedRole === 'ARTIST' ? 'Artist / Band Name' : 'Your Full Name'}
            </Text>
            <View style={styles.inputContainer}>
              <UserIcon size={18} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={selectedRole === 'ARTIST' ? 'e.g. Charminar Chords' : 'e.g. Rohan Sharma'}
                placeholderTextColor="#475569"
                value={name}
                onChangeText={(t) => {
                  setErrorMessage(null);
                  setName(t);
                }}
                autoFocus
              />
            </View>
          </View>

          {/* Role selection cards */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Select Your Account Type</Text>
            <View style={styles.cardsRow}>
              {/* Option 1: Customer */}
              <TouchableOpacity
                style={[styles.roleCard, selectedRole === 'CUSTOMER' && styles.roleCardActive]}
                onPress={() => setSelectedRole('CUSTOMER')}
                activeOpacity={0.85}
              >
                <View style={styles.roleCardTop}>
                  <View style={[styles.iconCircle, { backgroundColor: '#1E293B' }]}>
                    <Music size={22} color="#38BDF8" />
                  </View>
                  {selectedRole === 'CUSTOMER' && (
                    <View style={styles.selectedBadge}>
                      <Check size={14} color="#0B0D13" />
                    </View>
                  )}
                </View>
                <Text style={styles.cardTitle}>Booker / Host</Text>
                <Text style={styles.cardDescription}>
                  I want to discover and book live musicians for pubs, weddings, or private events.
                </Text>
              </TouchableOpacity>

              {/* Option 2: Artist */}
              <TouchableOpacity
                style={[
                  styles.roleCard,
                  selectedRole === 'ARTIST' && styles.roleCardActive,
                  selectedRole === 'ARTIST' && styles.artistCardActive
                ]}
                onPress={() => setSelectedRole('ARTIST')}
                activeOpacity={0.85}
              >
                <View style={styles.roleCardTop}>
                  <View style={[styles.iconCircle, { backgroundColor: '#3B270C' }]}>
                    <Sparkles size={22} color="#F5A623" />
                  </View>
                  {selectedRole === 'ARTIST' && (
                    <View style={styles.selectedBadge}>
                      <Check size={14} color="#0B0D13" />
                    </View>
                  )}
                </View>
                <Text style={styles.cardTitle}>Performing Artist</Text>
                <Text style={styles.cardDescription}>
                  I am a solo artist or band looking to showcase music and get booked.
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit button */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.buttonDisabled]}
            onPress={handleComplete}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#0B0D13" />
            ) : (
              <Text style={styles.submitButtonText}>Get Started on Stagely</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0D13'
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 24
  },
  header: {
    marginTop: 12
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 8
  },
  subtitle: {
    fontSize: 15,
    color: '#94A3B8',
    lineHeight: 22
  },
  errorBanner: {
    backgroundColor: '#450A0A',
    borderColor: '#7F1D1D',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12
  },
  errorText: {
    color: '#F87171',
    fontSize: 13
  },
  section: {
    gap: 12
  },
  sectionLabel: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600'
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52
  },
  inputIcon: {
    marginRight: 10
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16
  },
  cardsRow: {
    gap: 14
  },
  roleCard: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 18,
    gap: 10
  },
  roleCardActive: {
    borderColor: '#38BDF8',
    backgroundColor: '#0E1726'
  },
  artistCardActive: {
    borderColor: '#F5A623',
    backgroundColor: '#17120E'
  },
  roleCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center'
  },
  selectedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F5A623',
    justifyContent: 'center',
    alignItems: 'center'
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  cardDescription: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18
  },
  submitButton: {
    backgroundColor: '#F5A623',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12
  },
  buttonDisabled: {
    opacity: 0.6
  },
  submitButtonText: {
    color: '#0B0D13',
    fontSize: 16,
    fontWeight: '700'
  }
});
