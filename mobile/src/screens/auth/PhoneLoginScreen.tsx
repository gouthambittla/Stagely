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
import { Sparkles, Phone, Mail, ArrowRight } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { isValidPhoneNumber } from '../../services/firebase';

interface PhoneLoginScreenProps {
  onOtpSent: (confirmation: any, phone: string) => void;
  onUseEmail: () => void;
}

export const PhoneLoginScreen: React.FC<PhoneLoginScreenProps> = ({ onOtpSent, onUseEmail }) => {
  const { sendPhoneOtp } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSendOtp = async () => {
    setErrorMessage(null);
    const cleaned = phoneNumber.trim();

    if (!cleaned) {
      setErrorMessage('Please enter your mobile number.');
      return;
    }

    if (!isValidPhoneNumber(cleaned)) {
      setErrorMessage('Please enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);
    try {
      const confirmation = await sendPhoneOtp(cleaned);
      onOtpSent(confirmation, cleaned);
    } catch (err: any) {
      console.error('Phone OTP request failed:', err);
      setErrorMessage(err?.message || 'Failed to send OTP. Please check the number and try again.');
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header & Hero */}
          <View style={styles.heroSection}>
            <View style={styles.badge}>
              <Sparkles size={14} color="#F5A623" />
              <Text style={styles.badgeText}>Live Music Booking Marketplace</Text>
            </View>
            <Text style={styles.brandTitle}>Stagely</Text>
            <Text style={styles.heroSubtitle}>
              Direct bookings for live bands, solo artists, and event hosts across India.
            </Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in or Create Account</Text>
            <Text style={styles.cardSubtitle}>
              We'll text you a 6-digit verification code. No passwords required.
            </Text>

            {errorMessage && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Mobile Number</Text>
              <View style={styles.phoneInputRow}>
                <View style={styles.countryCodeBadge}>
                  <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                </View>
                <View style={styles.inputContainer}>
                  <Phone size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="98765 43210"
                    placeholderTextColor="#475569"
                    keyboardType="phone-pad"
                    maxLength={14}
                    value={phoneNumber}
                    onChangeText={(text) => {
                      setErrorMessage(null);
                      setPhoneNumber(text);
                    }}
                    autoFocus
                  />
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleSendOtp}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#0B0D13" />
              ) : (
                <View style={styles.buttonContent}>
                  <Text style={styles.primaryButtonText}>Send OTP</Text>
                  <ArrowRight size={18} color="#0B0D13" />
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onUseEmail}
              activeOpacity={0.85}
            >
              <Mail size={18} color="#CBD5E1" />
              <Text style={styles.secondaryButtonText}>Use Email Magic Link</Text>
            </TouchableOpacity>
          </View>

          {/* Footer note */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              By proceeding, you agree to Stagely's Terms of Service and Privacy Policy.
            </Text>
          </View>
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
    paddingVertical: 20,
    justifyContent: 'space-between',
    minHeight: '100%'
  },
  heroSection: {
    marginTop: 20,
    marginBottom: 32
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
    alignSelf: 'flex-start',
    gap: 6
  },
  badgeText: {
    color: '#F5A623',
    fontSize: 12,
    fontWeight: '600'
  },
  brandTitle: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
    marginBottom: 8
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#94A3B8'
  },
  card: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    gap: 18
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
    marginTop: -8
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
  inputGroup: {
    gap: 8
  },
  inputLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600'
  },
  phoneInputRow: {
    flexDirection: 'row',
    gap: 8
  },
  countryCodeBadge: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    height: 52
  },
  countryCodeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700'
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0D13',
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
  primaryButton: {
    backgroundColor: '#F5A623',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  primaryButtonText: {
    color: '#0B0D13',
    fontSize: 16,
    fontWeight: '700'
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#1E293B'
  },
  dividerText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1E293B',
    height: 48,
    borderRadius: 12
  },
  secondaryButtonText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600'
  },
  footer: {
    marginTop: 24,
    alignItems: 'center'
  },
  footerText: {
    color: '#475569',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16
  }
});
