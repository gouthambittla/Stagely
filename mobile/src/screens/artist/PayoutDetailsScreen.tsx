import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  Landmark,
  ShieldCheck,
  Clock,
  ShieldX,
  Wallet,
  LogOut
} from 'lucide-react-native';
import { api, PayoutAccount, PayoutStatus } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PayoutFormFields, PayoutReassurance } from '../../components/PayoutFormFields';
import {
  emptyPayoutForm,
  normalizeIndianPhone,
  PayoutFormField,
  PayoutFormValues,
  validateBankDetails,
  validatePayoutDetails
} from '../../utils/payoutValidation';

interface PayoutDetailsScreenProps {
  onBack?: () => void;
  /**
   * Legacy artists (onboarded before payments) must finish setup before reaching the dashboard.
   * In this mode there is no back button and the artist can only submit or sign out.
   */
  blocking?: boolean;
}

const STATUS_META: Record<PayoutStatus, { label: string; color: string; bg: string; border: string; desc: string }> = {
  NOT_STARTED: {
    label: 'Not set up',
    color: '#F5A623',
    bg: '#451A03',
    border: '#78350F',
    desc: 'Add your bank details so you can accept bookings and get paid.'
  },
  PENDING: {
    label: 'Under review',
    color: '#60A5FA',
    bg: '#0C2340',
    border: '#1D4ED8',
    desc: 'Razorpay is verifying your bank account. This usually takes a day or two.'
  },
  ACTIVE: {
    label: 'Active',
    color: '#34D399',
    bg: '#064E3B',
    border: '#059669',
    desc: 'You are all set. Payments for completed gigs go to this account.'
  },
  REJECTED: {
    label: 'Rejected',
    color: '#F87171',
    bg: '#450A0A',
    border: '#7F1D1D',
    desc: 'Razorpay could not verify these details. Please check them and submit again.'
  }
};

export const PayoutDetailsScreen: React.FC<PayoutDetailsScreenProps> = ({ onBack, blocking = false }) => {
  const { user, firebaseUser, refreshUser, logout } = useAuth();

  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingBank, setEditingBank] = useState(false);
  const [form, setForm] = useState<PayoutFormValues>(() =>
    emptyPayoutForm({
      email: user?.email || firebaseUser?.email || '',
      phone: normalizeIndianPhone(user?.phone || firebaseUser?.phoneNumber || '')
    })
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<PayoutFormField | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchAccount = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api.getPayoutAccount();
      setAccount(res.payoutAccount);
    } catch (err: any) {
      setLoadError(err.message || 'Could not load your payout details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  const status: PayoutStatus = account?.status ?? 'NOT_STARTED';
  const needsFullSetup = status === 'NOT_STARTED' || status === 'REJECTED';
  const showForm = needsFullSetup || editingBank;

  const updateForm = (patch: Partial<PayoutFormValues>) => {
    setForm(prev => ({ ...prev, ...patch }));
    if (errorField && errorField in patch) {
      setErrorField(null);
      setFormError(null);
    }
  };

  const startBankEdit = () => {
    setForm(prev => ({
      ...prev,
      legalName: account?.legalName || prev.legalName,
      ifsc: account?.ifsc || '',
      accountNumber: '',
      confirmAccountNumber: ''
    }));
    setFormError(null);
    setErrorField(null);
    setEditingBank(true);
  };

  const submit = async () => {
    setFormError(null);
    setErrorField(null);

    if (needsFullSetup) {
      const result = validatePayoutDetails(form);
      if (!result.ok) {
        setFormError(result.error);
        setErrorField(result.field);
        return;
      }
      setSubmitting(true);
      try {
        const res = await api.setUpPayoutAccount(result.value);
        setAccount(res.payoutAccount);
        setForm(prev => ({ ...prev, accountNumber: '', confirmAccountNumber: '', pan: '' }));
        // Reload the session so the navigator sees the new payout status
        await refreshUser().catch(() => {});
        if (!blocking) {
          Alert.alert('Payout details submitted', 'Razorpay will verify your account shortly.');
        }
      } catch (err: any) {
        if (err?.status === 409) {
          // Already set up (e.g. from another device): just show the current state
          fetchAccount();
          refreshUser().catch(() => {});
        }
        setFormError(err.message || 'Could not save your payout details');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const result = validateBankDetails(form);
    if (!result.ok) {
      setFormError(result.error);
      setErrorField(result.field);
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.updatePayoutBank(result.value);
      setAccount(res.payoutAccount);
      setEditingBank(false);
      setForm(prev => ({ ...prev, accountNumber: '', confirmAccountNumber: '' }));
      refreshUser().catch(() => {});
      Alert.alert(
        'Bank account updated',
        res.payoutAccount.status === 'PENDING'
          ? 'Razorpay will verify the new account shortly.'
          : 'Future payouts will go to this account.'
      );
    } catch (err: any) {
      setFormError(err.message || 'Could not update your bank account');
    } finally {
      setSubmitting(false);
    }
  };

  const meta = STATUS_META[status];

  const renderStatusIcon = () => {
    switch (status) {
      case 'ACTIVE':
        return <ShieldCheck size={20} color={meta.color} />;
      case 'PENDING':
        return <Clock size={20} color={meta.color} />;
      case 'REJECTED':
        return <ShieldX size={20} color={meta.color} />;
      default:
        return <Wallet size={20} color={meta.color} />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {onBack && !blocking ? (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityLabel="Back">
            <ArrowLeft size={20} color="#E2E8F0" />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{blocking ? 'Set up payouts' : 'Payout details'}</Text>
          <Text style={styles.subtitle}>
            {blocking
              ? 'Stagely now handles payments. Add your bank details to keep accepting bookings.'
              : 'Where your earnings from gigs are paid'}
          </Text>
        </View>
        {blocking ? (
          <TouchableOpacity onPress={logout} style={styles.backBtn} accessibilityLabel="Sign out">
            <LogOut size={18} color="#EF4444" />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F5A623" />
          <Text style={styles.muted}>Loading payout details...</Text>
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <AlertCircle size={40} color="#EF4444" />
          <Text style={styles.errorTitle}>Could not load payout details</Text>
          <Text style={styles.muted}>{loadError}</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              setLoading(true);
              fetchAccount();
            }}
          >
            <RefreshCw size={16} color="#0B0D13" />
            <Text style={styles.primaryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchAccount();
                }}
                tintColor="#F5A623"
              />
            }
          >
            {/* Status card */}
            <View style={styles.card}>
              <View style={styles.statusRow}>
                {renderStatusIcon()}
                <View style={[styles.badge, { backgroundColor: meta.bg, borderColor: meta.border }]}>
                  <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
              <Text style={styles.statusDesc}>{meta.desc}</Text>

              {account && status !== 'NOT_STARTED' && (account.accountNumberMasked || account.ifsc) ? (
                <View style={styles.detailsBox}>
                  <View style={styles.detailRow}>
                    <Landmark size={14} color="#94A3B8" />
                    <Text style={styles.detailLabel}>Account holder</Text>
                    <Text style={styles.detailValue}>{account.legalName || '—'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { marginLeft: 22 }]}>Account</Text>
                    <Text style={styles.detailValue}>{account.accountNumberMasked || '—'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { marginLeft: 22 }]}>IFSC</Text>
                    <Text style={styles.detailValue}>{account.ifsc || '—'}</Text>
                  </View>
                </View>
              ) : null}

              {!needsFullSetup && !editingBank ? (
                <TouchableOpacity style={styles.secondaryBtn} onPress={startBankEdit}>
                  <Text style={styles.secondaryBtnText}>Change bank account</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {showForm && (
              <View style={styles.formWrap}>
                <Text style={styles.formTitle}>
                  {needsFullSetup
                    ? status === 'REJECTED'
                      ? 'Resubmit payout details'
                      : 'Payout details'
                    : 'New bank account'}
                </Text>
                <PayoutReassurance />

                <PayoutFormFields
                  values={form}
                  onChange={updateForm}
                  mode={needsFullSetup ? 'full' : 'bank'}
                  errorField={errorField}
                  editable={!submitting}
                />

                {formError ? (
                  <View style={styles.errorBanner}>
                    <AlertCircle size={16} color="#F87171" />
                    <Text style={styles.errorBannerText}>{formError}</Text>
                  </View>
                ) : null}

                <View style={styles.buttonRow}>
                  {editingBank && !needsFullSetup ? (
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => {
                        setEditingBank(false);
                        setFormError(null);
                        setErrorField(null);
                      }}
                      disabled={submitting}
                    >
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.primaryBtn, styles.submitBtn, submitting && styles.disabled]}
                    onPress={submit}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#0B0D13" />
                    ) : (
                      <Text style={styles.primaryBtnText}>
                        {needsFullSetup ? 'Submit payout details' : 'Save bank account'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0D13'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  backBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#131722',
    borderWidth: 1,
    borderColor: '#1E293B'
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12
  },
  muted: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center'
  },
  errorTitle: {
    color: '#F87171',
    fontSize: 18,
    fontWeight: '700'
  },
  scroll: {
    padding: 16,
    gap: 16,
    paddingBottom: 40
  },
  card: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  badge: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700'
  },
  statusDesc: {
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 19
  },
  detailsBox: {
    backgroundColor: '#0B0D13',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  detailLabel: {
    color: '#94A3B8',
    fontSize: 13,
    flex: 1
  },
  detailValue: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700'
  },
  secondaryBtn: {
    borderColor: '#F5A623',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  secondaryBtnText: {
    color: '#F5A623',
    fontWeight: '700',
    fontSize: 14
  },
  formWrap: {
    gap: 14
  },
  formTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800'
  },
  errorBanner: {
    backgroundColor: '#450A0A',
    borderColor: '#7F1D1D',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  errorBannerText: {
    color: '#F87171',
    fontSize: 13,
    flex: 1
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4
  },
  primaryBtn: {
    backgroundColor: '#F5A623',
    paddingHorizontal: 20,
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  submitBtn: {
    flex: 1
  },
  primaryBtnText: {
    color: '#0B0D13',
    fontSize: 15,
    fontWeight: '700'
  },
  cancelBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 20,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600'
  },
  disabled: {
    opacity: 0.6
  }
});

export default PayoutDetailsScreen;
