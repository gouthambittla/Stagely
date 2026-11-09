import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, AdminDispute, DisputeOutcome } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatPaise, rupeesToPaise } from '../../utils/money';
import { formatDateTimeIST } from '../../utils/bookingStatus';
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  LogOut,
  MessageSquare,
  RefreshCw,
  Scale,
  Sparkles,
  User as UserIcon,
  Music
} from 'lucide-react-native';

export const AdminDisputesScreen: React.FC = () => {
  const { logout } = useAuth();
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [expandedChatId, setExpandedChatId] = useState<number | null>(null);
  const [splitOpenId, setSplitOpenId] = useState<number | null>(null);
  const [splitInput, setSplitInput] = useState<string>('');
  const [splitError, setSplitError] = useState<string | null>(null);

  const fetchDisputes = useCallback(async () => {
    setError(null);
    try {
      const res = await api.getDisputes();
      setDisputes(res.disputes || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load disputes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  const amountOf = (d: AdminDispute): number | null => d.payment?.amountPaise ?? d.amountPaise ?? null;

  const resolve = async (d: AdminDispute, outcome: DisputeOutcome, refundPaise?: number) => {
    setProcessingId(d.id);
    try {
      const res = await api.resolveDispute(d.id, outcome, refundPaise);
      Alert.alert('Dispute resolved', res.message || 'The dispute has been resolved.');
      setSplitOpenId(null);
      setSplitInput('');
    } catch (err: any) {
      Alert.alert(
        err?.status === 409 ? 'Already resolved' : 'Could not resolve',
        err.message || 'Unable to resolve this dispute'
      );
    } finally {
      setProcessingId(null);
      fetchDisputes();
    }
  };

  const confirmResolve = (d: AdminDispute, outcome: DisputeOutcome) => {
    const amount = amountOf(d);
    const artistName = d.artist?.artistName || 'the artist';
    const booker = d.customer?.venueName || d.customer?.name || 'the booker';

    if (outcome === 'SPLIT') {
      if (amount === null) {
        Alert.alert('Cannot split', 'This booking has no payment amount on record.');
        return;
      }
      const refund = rupeesToPaise(splitInput);
      if (refund === null || refund < 1 || refund >= amount) {
        setSplitError(`Enter a refund between ₹0.01 and ${formatPaise(amount - 1)}.`);
        return;
      }
      setSplitError(null);
      Alert.alert(
        'Split the payment?',
        `${booker} gets ${formatPaise(refund)} back. The rest of the booking (${formatPaise(
          amount - refund
        )}, before platform fee) is settled with ${artistName}.`,
        [
          { text: 'Back', style: 'cancel' },
          { text: 'Split', onPress: () => resolve(d, 'SPLIT', refund) }
        ]
      );
      return;
    }

    const title = outcome === 'PAY_ARTIST' ? 'Pay the artist?' : 'Refund in full?';
    const body =
      outcome === 'PAY_ARTIST'
        ? `${artistName} is paid as normal and ${booker} gets no refund.`
        : `${booker} gets a full refund${amount !== null ? ` of ${formatPaise(amount)}` : ''} and ${artistName} is not paid.`;
    Alert.alert(title, `${body} This cannot be undone.`, [
      { text: 'Back', style: 'cancel' },
      {
        text: outcome === 'PAY_ARTIST' ? 'Pay artist' : 'Refund',
        style: outcome === 'REFUND' ? 'destructive' : 'default',
        onPress: () => resolve(d, outcome)
      }
    ]);
  };

  const renderDispute = ({ item }: { item: AdminDispute }) => {
    const amount = amountOf(item);
    const isProcessing = processingId === item.id;
    const chatOpen = expandedChatId === item.id;
    const splitOpen = splitOpenId === item.id;
    const customer = item.customer || ({} as AdminDispute['customer']);
    const messages = item.messages || [];

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Booking #{item.id}</Text>
            {item.eventType ? <Text style={styles.subtitle}>{item.eventType}</Text> : null}
          </View>
          <View style={styles.tag}>
            <Text style={styles.tagText}>DISPUTED</Text>
          </View>
        </View>

        <View style={styles.infoBox}>
          <View style={styles.infoRow}>
            <Music size={14} color="#F5A623" />
            <Text style={styles.infoLabel}>Artist</Text>
            <Text style={styles.infoValue}>{item.artist?.artistName || '—'}</Text>
          </View>
          <View style={styles.infoRow}>
            <UserIcon size={14} color="#94A3B8" />
            <Text style={styles.infoLabel}>Booker</Text>
            <Text style={styles.infoValue}>
              {[customer.venueName, customer.name].filter(Boolean).join(' • ') || '—'}
            </Text>
          </View>
          {customer.email || customer.phone ? (
            <Text style={styles.contactText}>
              {[customer.email, customer.phone].filter(Boolean).join('  ·  ')}
            </Text>
          ) : null}
          <View style={styles.infoRow}>
            <Calendar size={14} color="#94A3B8" />
            <Text style={styles.infoLabel}>Event</Text>
            <Text style={styles.infoValue}>
              {item.slot ? `${item.slot.date} ${item.slot.startTime}–${item.slot.endTime}` : '—'}
            </Text>
          </View>
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Paid by booker</Text>
          <Text style={styles.amountValue}>{formatPaise(amount)}</Text>
        </View>
        {item.payment ? (
          <Text style={styles.splitText}>
            Artist share {formatPaise(item.payment.artistSharePaise)} · Platform fee{' '}
            {formatPaise(item.payment.platformFeePaise)} · Payment {item.payment.status}
          </Text>
        ) : null}

        <View style={styles.reasonBox}>
          <Text style={styles.reasonTitle}>
            Reported problem{item.disputedAt ? ` · ${formatDateTimeIST(item.disputedAt)}` : ''}
          </Text>
          <Text style={styles.reasonText}>{item.disputeReason || '(no reason given)'}</Text>
        </View>

        <TouchableOpacity
          style={styles.chatToggle}
          onPress={() => setExpandedChatId(chatOpen ? null : item.id)}
        >
          <MessageSquare size={14} color="#94A3B8" />
          <Text style={styles.chatToggleText}>
            {chatOpen ? 'Hide' : 'Show'} chat transcript ({messages.length})
          </Text>
          {chatOpen ? <ChevronUp size={14} color="#94A3B8" /> : <ChevronDown size={14} color="#94A3B8" />}
        </TouchableOpacity>

        {chatOpen && (
          <View style={styles.transcript}>
            {messages.length === 0 ? (
              <Text style={styles.muted}>No messages were exchanged.</Text>
            ) : (
              messages.map((m, idx) => (
                <View key={idx} style={styles.messageRow}>
                  <Text style={styles.messageMeta}>
                    {m.sender?.name || 'User'} ({(m.sender?.role || '').toLowerCase()}) ·{' '}
                    {formatDateTimeIST(m.createdAt)}
                  </Text>
                  <Text style={styles.messageText}>{m.content}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {splitOpen && (
          <View style={styles.splitBox}>
            <Text style={styles.splitLabel}>Refund to booker (₹)</Text>
            <TextInput
              style={[styles.input, splitError ? styles.inputError : null]}
              placeholder={amount !== null ? `Less than ${formatPaise(amount)}` : 'Amount'}
              placeholderTextColor="#475569"
              keyboardType="decimal-pad"
              value={splitInput}
              onChangeText={t => {
                setSplitInput(t);
                setSplitError(null);
              }}
              editable={!isProcessing}
            />
            {splitError ? <Text style={styles.errorText}>{splitError}</Text> : null}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.neutralBtn]}
                onPress={() => {
                  setSplitOpenId(null);
                  setSplitError(null);
                }}
                disabled={isProcessing}
              >
                <Text style={styles.neutralText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.primaryBtn]}
                onPress={() => confirmResolve(item, 'SPLIT')}
                disabled={isProcessing}
              >
                <Text style={styles.primaryText}>Review split</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!splitOpen && (
          <View style={styles.actionsRow}>
            {isProcessing ? (
              <View style={[styles.actionBtn, styles.neutralBtn]}>
                <ActivityIndicator size="small" color="#F5A623" />
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.primaryBtn]}
                  onPress={() => confirmResolve(item, 'PAY_ARTIST')}
                >
                  <Text style={styles.primaryText}>Pay artist</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.dangerBtn]}
                  onPress={() => confirmResolve(item, 'REFUND')}
                >
                  <Text style={styles.dangerText}>Full refund</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.neutralBtn]}
                  onPress={() => {
                    setSplitOpenId(item.id);
                    setSplitInput('');
                    setSplitError(null);
                  }}
                >
                  <Scale size={14} color="#E2E8F0" />
                  <Text style={styles.neutralText}>Split</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>Disputes</Text>
          <Text style={styles.screenSubtitle}>Review reported problems and settle payments</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <LogOut size={16} color="#EF4444" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <AlertCircle size={40} color="#EF4444" />
          <Text style={styles.errorTitle}>Could not load disputes</Text>
          <Text style={styles.muted}>{error}</Text>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => {
              setLoading(true);
              fetchDisputes();
            }}
          >
            <RefreshCw size={16} color="#0B0D13" />
            <Text style={styles.refreshBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : disputes.length === 0 ? (
        <View style={styles.centerContainer}>
          <Sparkles size={40} color="#10B981" />
          <Text style={styles.emptyHeading}>No open disputes</Text>
          <Text style={styles.muted}>Nothing needs your attention right now.</Text>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => {
              setLoading(true);
              fetchDisputes();
            }}
          >
            <RefreshCw size={16} color="#0B0D13" />
            <Text style={styles.refreshBtnText}>Check Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={disputes}
          keyExtractor={item => item.id.toString()}
          renderItem={renderDispute}
          extraData={[processingId, expandedChatId, splitOpenId, splitInput, splitError]}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchDisputes();
              }}
              tintColor="#F5A623"
            />
          }
        />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  screenSubtitle: {
    fontSize: 13,
    color: '#94A3B8'
  },
  logoutBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B'
  },
  listContent: {
    padding: 16,
    gap: 16
  },
  card: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 12
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2
  },
  tag: {
    backgroundColor: '#0C2340',
    borderColor: '#1D4ED8',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  tagText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '700'
  },
  infoBox: {
    backgroundColor: '#0B0D13',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  infoLabel: {
    color: '#94A3B8',
    fontSize: 13,
    width: 52
  },
  infoValue: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
    flex: 1
  },
  contactText: {
    color: '#64748B',
    fontSize: 12,
    marginLeft: 82
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  amountLabel: {
    color: '#94A3B8',
    fontSize: 13
  },
  amountValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800'
  },
  splitText: {
    color: '#64748B',
    fontSize: 12,
    marginTop: -6
  },
  reasonBox: {
    backgroundColor: '#1C1212',
    borderColor: '#7F1D1D',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6
  },
  reasonTitle: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  reasonText: {
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 20
  },
  chatToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  chatToggleText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600'
  },
  transcript: {
    backgroundColor: '#0B0D13',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 10
  },
  messageRow: {
    gap: 2
  },
  messageMeta: {
    color: '#64748B',
    fontSize: 11
  },
  messageText: {
    color: '#E2E8F0',
    fontSize: 13
  },
  splitBox: {
    gap: 8
  },
  splitLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600'
  },
  input: {
    backgroundColor: '#0B0D13',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15
  },
  inputError: {
    borderColor: '#EF4444'
  },
  errorText: {
    color: '#F87171',
    fontSize: 12
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    gap: 6
  },
  primaryBtn: {
    backgroundColor: '#F5A623'
  },
  primaryText: {
    color: '#0B0D13',
    fontSize: 13,
    fontWeight: '700'
  },
  dangerBtn: {
    backgroundColor: '#2A1212',
    borderColor: '#7F1D1D',
    borderWidth: 1
  },
  dangerText: {
    color: '#F87171',
    fontSize: 13,
    fontWeight: '700'
  },
  neutralBtn: {
    backgroundColor: '#1E293B'
  },
  neutralText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12
  },
  muted: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center'
  },
  errorTitle: {
    color: '#F87171',
    fontSize: 18,
    fontWeight: '700'
  },
  emptyHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5A623',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    marginTop: 8
  },
  refreshBtnText: {
    color: '#0B0D13',
    fontWeight: '700',
    fontSize: 14
  }
});

export default AdminDisputesScreen;
