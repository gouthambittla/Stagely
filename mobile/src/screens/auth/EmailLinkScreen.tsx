import React, { useState, useEffect } from 'react';
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
import { ArrowLeft, Mail, CheckCircle2, ArrowRight } from 'lucide-react-native';
import * as Linking from 'expo-linking';
import { useAuth } from '../../context/AuthContext';

interface EmailLinkScreenProps {
  onBack: () => void;
  onSuccess: () => void;
}

export const EmailLinkScreen: React.FC<EmailLinkScreenProps> = ({ onBack, onSuccess }) => {
  const { sendEmailLink, verifyEmailLink } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Deep link listener for incoming magic link callback
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      if (!event.url || !email) return;

      try {
        setLoading(true);
        await verifyEmailLink(email.trim().toLowerCase(), event.url);
        onSuccess();
      } catch (err: any) {
        console.error('Deep link auth error:', err);
        setErrorMessage(err?.message || 'Failed to authenticate from link.');
      } finally {
        setLoading(false);
      }
    };

    // Check cold launch URL
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    // Check foreground/background URL event
    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, [email, verifyEmailLink, onSuccess]);

  const handleSendLink = async () => {
    setErrorMessage(null);
    const cleaned = email.trim().toLowerCase();

    if (!cleaned || !cleaned.includes('@') || !cleaned.includes('.')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      await sendEmailLink(cleaned);
      setLinkSent(true);
    } catch (err: any) {
      console.error('Send email link error:', err);
      setErrorMessage(err?.message || 'Failed to send login link. Please try again.');
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
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <ArrowLeft size={20} color="#94A3B8" />
            <Text style={styles.backText}>Back to Phone Login</Text>
          </TouchableOpacity>

          {!linkSent ? (
            <>
              <View style={styles.header}>
                <View style={styles.iconCircle}>
                  <Mail size={28} color="#F5A623" />
                </View>
                <Text style={styles.title}>Passwordless Email Link</Text>
                <Text style={styles.subtitle}>
                  We'll email you a secure sign-in link. One tap will open the app and sign you right in.
                </Text>
              </View>

              <View style={styles.card}>
                {errorMessage && (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  </View>
                )}

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email address</Text>
                  <View style={styles.inputContainer}>
                    <Mail size={18} color="#64748B" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="name@example.com"
                      placeholderTextColor="#475569"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      value={email}
                      onChangeText={(t) => {
                        setErrorMessage(null);
                        setEmail(t);
                      }}
                      autoFocus
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.buttonDisabled]}
                  onPress={handleSendLink}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#0B0D13" />
                  ) : (
                    <View style={styles.buttonContent}>
                      <Text style={styles.primaryButtonText}>Send Sign-In Link</Text>
                      <ArrowRight size={18} color="#0B0D13" />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.sentContainer}>
              <View style={[styles.iconCircle, styles.successCircle]}>
                <CheckCircle2 size={36} color="#10B981" />
              </View>
              <Text style={styles.title}>Check your inbox</Text>
              <Text style={styles.sentSubtitle}>
                We emailed a magic sign-in link to{' '}
                <Text style={styles.emailHighlight}>{email}</Text>
              </Text>
              <Text style={styles.instructionText}>
                Tap the link in your email on this device to instantly sign in to Stagely.
              </Text>

              {loading && (
                <View style={styles.verifyingIndicator}>
                  <ActivityIndicator size="small" color="#F5A623" />
                  <Text style={styles.verifyingText}>Verifying sign-in link...</Text>
                </View>
              )}

              {errorMessage && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setLinkSent(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryButtonText}>Use a different email</Text>
              </TouchableOpacity>
            </View>
          )}
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
    paddingVertical: 16
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 28,
    alignSelf: 'flex-start'
  },
  backText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600'
  },
  header: {
    marginBottom: 28
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1E1B15',
    borderColor: '#422006',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16
  },
  successCircle: {
    backgroundColor: '#06281B',
    borderColor: '#064E3B'
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
  card: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    gap: 20
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
  inputContainer: {
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
    fontSize: 15
  },
  primaryButton: {
    backgroundColor: '#F5A623',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8
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
  sentContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 16
  },
  sentSubtitle: {
    fontSize: 16,
    color: '#CBD5E1',
    textAlign: 'center',
    lineHeight: 24
  },
  emailHighlight: {
    color: '#F5A623',
    fontWeight: '700'
  },
  instructionText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: '90%'
  },
  verifyingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12
  },
  verifyingText: {
    color: '#F5A623',
    fontSize: 14,
    fontWeight: '600'
  },
  secondaryButton: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 20,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16
  },
  secondaryButtonText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600'
  }
});
