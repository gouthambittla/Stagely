import React, { useState, useEffect, useRef } from 'react';
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
import { ArrowLeft, ShieldCheck, RefreshCw } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';

interface OtpVerificationScreenProps {
  confirmation: any;
  phoneNumber: string;
  onBack: () => void;
  onSuccess: () => void;
}

export const OtpVerificationScreen: React.FC<OtpVerificationScreenProps> = ({
  confirmation: initialConfirmation,
  phoneNumber,
  onBack,
  onSuccess
}) => {
  const { verifyPhoneOtp, sendPhoneOtp } = useAuth();
  const [confirmation, setConfirmation] = useState(initialConfirmation);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(30);

  const inputRef = useRef<any>(null);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (timerSeconds <= 0) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerSeconds]);

  const handleVerify = async (codeToVerify?: string) => {
    const code = (codeToVerify || otp).trim();
    setErrorMessage(null);

    if (code.length < 6) {
      setErrorMessage('Please enter all 6 digits of the verification code.');
      return;
    }

    setLoading(true);
    try {
      await verifyPhoneOtp(confirmation, code);
      onSuccess();
    } catch (err: any) {
      console.error('OTP Verification error:', err);
      setErrorMessage(err?.message || 'Invalid verification code. Please try again.');
      setOtp('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (timerSeconds > 0 || resending) return;

    setResending(true);
    setErrorMessage(null);
    try {
      const newConfirmation = await sendPhoneOtp(phoneNumber);
      setConfirmation(newConfirmation);
      setTimerSeconds(30);
      setOtp('');
      inputRef.current?.focus();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to resend code. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleOtpChange = (val: string) => {
    const numeric = val.replace(/\D/g, '').slice(0, 6);
    setOtp(numeric);
    setErrorMessage(null);

    // Auto-verify when 6th digit is reached
    if (numeric.length === 6) {
      handleVerify(numeric);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Back button */}
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <ArrowLeft size={20} color="#94A3B8" />
            <Text style={styles.backText}>Change number</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <ShieldCheck size={28} color="#F5A623" />
            </View>
            <Text style={styles.title}>Verify Phone Number</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{' '}
              <Text style={styles.phoneHighlight}>{phoneNumber}</Text>
            </Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            {errorMessage && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            {/* Visual 6-box display */}
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => inputRef.current?.focus()}
              style={styles.otpBoxesRow}
            >
              {[0, 1, 2, 3, 4, 5].map((index) => {
                const digit = otp[index] || '';
                const isFocused = otp.length === index;
                return (
                  <View
                    key={index}
                    style={[
                      styles.otpBox,
                      isFocused && styles.otpBoxFocused,
                      digit && styles.otpBoxFilled
                    ]}
                  >
                    <Text style={styles.otpBoxText}>{digit}</Text>
                  </View>
                );
              })}
            </TouchableOpacity>

            {/* Hidden Input for Keyboard handling */}
            <TextInput
              ref={inputRef}
              style={styles.hiddenInput}
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={handleOtpChange}
              autoFocus
            />

            {/* Verify CTA */}
            <TouchableOpacity
              style={[styles.verifyButton, (loading || otp.length < 6) && styles.buttonDisabled]}
              onPress={() => handleVerify()}
              disabled={loading || otp.length < 6}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#0B0D13" />
              ) : (
                <Text style={styles.verifyButtonText}>Verify & Continue</Text>
              )}
            </TouchableOpacity>

            {/* Resend Action */}
            <View style={styles.resendContainer}>
              {timerSeconds > 0 ? (
                <Text style={styles.timerText}>
                  Resend code in <Text style={styles.timerHighlight}>{timerSeconds}s</Text>
                </Text>
              ) : (
                <TouchableOpacity
                  onPress={handleResend}
                  disabled={resending}
                  style={styles.resendButton}
                >
                  <RefreshCw size={14} color="#F5A623" />
                  <Text style={styles.resendButtonText}>
                    {resending ? 'Sending...' : 'Resend Code'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
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
  phoneHighlight: {
    color: '#F5A623',
    fontWeight: '700'
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
  otpBoxesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginVertical: 12
  },
  otpBox: {
    flex: 1,
    height: 56,
    backgroundColor: '#0B0D13',
    borderColor: '#1E293B',
    borderWidth: 1.5,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  otpBoxFocused: {
    borderColor: '#F5A623',
    backgroundColor: '#16130B'
  },
  otpBoxFilled: {
    borderColor: '#64748B'
  },
  otpBoxText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1
  },
  verifyButton: {
    backgroundColor: '#F5A623',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8
  },
  buttonDisabled: {
    opacity: 0.5
  },
  verifyButtonText: {
    color: '#0B0D13',
    fontSize: 16,
    fontWeight: '700'
  },
  resendContainer: {
    alignItems: 'center',
    marginTop: 4
  },
  timerText: {
    color: '#64748B',
    fontSize: 13
  },
  timerHighlight: {
    color: '#94A3B8',
    fontWeight: '600'
  },
  resendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 6
  },
  resendButtonText: {
    color: '#F5A623',
    fontSize: 14,
    fontWeight: '600'
  }
});
