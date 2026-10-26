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
  ScrollView,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, UserRole } from '../context/AuthContext';
import { ArrowLeft, Lock, Mail, UserCheck } from 'lucide-react-native';

interface AuthScreenProps {
  initialRole?: UserRole;
  onBack: () => void;
  onSuccess: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  initialRole = 'CUSTOMER',
  onBack,
  onSuccess
}) => {
  const { login, register } = useAuth();
  const [isLoginMode, setIsLoginMode] = useState<boolean>(true);
  const [role, setRole] = useState<UserRole>(initialRole);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrorMessage(null);
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please fill in both email and password.');
      return;
    }

    setLoading(true);
    try {
      if (isLoginMode) {
        await login(email.trim().toLowerCase(), password);
      } else {
        await register(email.trim().toLowerCase(), password, role);
      }
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please check credentials.');
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
          {/* Top Navigation */}
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <ArrowLeft size={22} color="#94A3B8" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {isLoginMode ? 'Welcome back' : `Join Stagely as ${role === 'ARTIST' ? 'an Artist' : role === 'ADMIN' ? 'an Admin' : 'a Booker'}`}
            </Text>
            <Text style={styles.subtitle}>
              {isLoginMode
                ? 'Enter your credentials to access your bookings and profile.'
                : 'Create an account to discover, schedule, and book live music.'}
            </Text>
          </View>

          {/* Role Pill Selector (only in sign up mode) */}
          {!isLoginMode && (
            <View style={styles.roleContainer}>
              <TouchableOpacity
                style={[styles.rolePill, role === 'CUSTOMER' && styles.rolePillActive]}
                onPress={() => setRole('CUSTOMER')}
              >
                <Text style={[styles.rolePillText, role === 'CUSTOMER' && styles.rolePillTextActive]}>
                  Booker / Venue
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rolePill, role === 'ARTIST' && styles.rolePillActive]}
                onPress={() => setRole('ARTIST')}
              >
                <Text style={[styles.rolePillText, role === 'ARTIST' && styles.rolePillTextActive]}>
                  Performing Artist
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Form Fields */}
          <View style={styles.form}>
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
                  onChangeText={setEmail}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.inputContainer}>
                <Lock size={18} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#475569"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#0B0D13" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isLoginMode ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.toggleRow}>
              <Text style={styles.togglePrompt}>
                {isLoginMode ? "Don't have an account?" : 'Already have an account?'}
              </Text>
              <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)}>
                <Text style={styles.toggleLink}>
                  {isLoginMode ? 'Sign Up' : 'Sign In'}
                </Text>
              </TouchableOpacity>
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
    marginBottom: 24,
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
  roleContainer: {
    flexDirection: 'row',
    backgroundColor: '#131722',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    gap: 4
  },
  rolePill: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8
  },
  rolePillActive: {
    backgroundColor: '#1E293B'
  },
  rolePillText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600'
  },
  rolePillTextActive: {
    color: '#F5A623'
  },
  errorBanner: {
    backgroundColor: '#450A0A',
    borderColor: '#7F1D1D',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16
  },
  errorText: {
    color: '#F87171',
    fontSize: 13
  },
  form: {
    gap: 20
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
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50
  },
  inputIcon: {
    marginRight: 10
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15
  },
  submitButton: {
    backgroundColor: '#F5A623',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12
  },
  submitButtonDisabled: {
    opacity: 0.6
  },
  submitButtonText: {
    color: '#0B0D13',
    fontSize: 16,
    fontWeight: '700'
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 8
  },
  togglePrompt: {
    color: '#94A3B8',
    fontSize: 14
  },
  toggleLink: {
    color: '#F5A623',
    fontSize: 14,
    fontWeight: '700'
  }
});

export default AuthScreen;
