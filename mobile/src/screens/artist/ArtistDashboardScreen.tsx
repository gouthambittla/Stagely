import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useAppConfig } from '../../hooks/useAppConfig';
import { getStatusTheme, isBeforeEventStart, formatDateTimeIST } from '../../utils/bookingStatus';
import { bookingAmountPaise, formatPaise } from '../../utils/money';
import {
  Check,
  X,
  MessageSquare,
  Calendar,
  Clock,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Wallet,
  ChevronRight,
  Ban
} from 'lucide-react-native';

interface ArtistDashboardScreenProps {
  onOpenChat: (booking: any) => void;
  onManageSchedule: () => void;
  onOpenPayouts?: () => void;
  requests?: any[];
  onAccept?: (bookingId: number) => void;
}

export const ArtistDashboardScreen: React.FC<ArtistDashboardScreenProps> = ({
  onOpenChat,
  onManageSchedule,
  onOpenPayouts,
  requests: propRequests,
  onAccept: propOnAccept
}) => {
  const { user, refreshUser } = useAuth();
  const [requests, setRequests] = useState<any[]>(propRequests || []);
  const [loading, setLoading] = useState<boolean>(!propRequests);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const { config } = useAppConfig();
  const paymentsEnabled = config.paymentsEnabled;

  const profile = user?.artistProfile;
  const isVerified = profile?.verificationStatus === 'VERIFIED';
  const isPending = profile?.verificationStatus === 'PENDING_VERIFICATION';
  const payoutStatus: string = profile?.payoutStatus ?? 'NOT_STARTED';
  const showPayoutBanner = paymentsEnabled && payoutStatus !== 'ACTIVE';

  const fetchArtistBookings = async () => {
    try {
      const res = await api.getBookings();
      setRequests(res.bookings || []);
    } catch (err: any) {
      console.warn('Failed to fetch artist bookings', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!propRequests) {
      fetchArtistBookings();
      // Pull the latest profile so verification status and edits made elsewhere show up
      refreshUser().catch(() => {});
    }
  }, []);

  const handleDecision = async (bookingId: number, action: 'ACCEPT' | 'DECLINED') => {
    if (propOnAccept && action === 'ACCEPT') {
      propOnAccept(bookingId);
      return;
    }

    setProcessingId(bookingId);
    try {
      await api.respondToBooking(bookingId, action);
      Alert.alert('Booking Updated', `Booking request has been ${action === 'ACCEPT' ? 'accepted' : 'declined'}.`);
      fetchArtistBookings();
    } catch (err: any) {
      const message = err.message || 'Unable to update booking';
      if (action === 'ACCEPT' && err?.status === 409 && onOpenPayouts && /payout/i.test(message)) {
        Alert.alert('Payouts needed', message, [
          { text: 'Not now', style: 'cancel' },
          { text: 'Payout details', onPress: onOpenPayouts }
        ]);
      } else {
        Alert.alert('Action Failed', message);
      }
      // A 409 can also mean the booking changed meanwhile
      if (err?.status === 409) fetchArtistBookings();
    } finally {
      setProcessingId(null);
    }
  };

  const confirmCancel = (booking: any) => {
    const paid = booking.status === 'CONFIRMED';
    Alert.alert(
      'Cancel this booking?',
      paid
        ? 'The booker gets a full refund and the date is released. This cannot be undone.'
        : "The booker hasn't paid yet, so nothing is charged. This cannot be undone.",
      [
        { text: 'Keep booking', style: 'cancel' },
        { text: 'Cancel booking', style: 'destructive', onPress: () => cancelBooking(booking) }
      ]
    );
  };

  const cancelBooking = async (booking: any) => {
    setCancellingId(booking.id);
    try {
      const res = await api.cancelBooking(booking.id);
      Alert.alert('Booking cancelled', res.message || 'The booker has been notified.');
    } catch (err: any) {
      Alert.alert('Could not cancel', err.message || 'Unable to cancel this booking');
    } finally {
      setCancellingId(null);
      fetchArtistBookings();
    }
  };

  const renderRequestCard = ({ item }: { item: any }) => {
    const isProcessing = processingId === item.id;
    const isRequested = item.status === 'REQUESTED';
    const statusTheme = getStatusTheme(item.status);
    const isCancelling = cancellingId === item.id;
    const canCancel =
      (item.status === 'AWAITING_PAYMENT' || item.status === 'CONFIRMED') && isBeforeEventStart(item);
    const amountPaise = bookingAmountPaise(item);
    const customer = item.customer || {};
    const slot = item.slot || {};

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.customerName}>{customer.email || 'Venue Host'}</Text>
            <Text style={styles.eventType}>{item.eventType}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusTheme.bg, borderColor: statusTheme.border }
            ]}
          >
            <Text style={[styles.statusText, { color: statusTheme.text }]}>{statusTheme.label}</Text>
          </View>
        </View>

        <View style={styles.infoBox}>
          <View style={styles.infoRow}>
            <Calendar size={14} color="#F5A623" />
            <Text style={styles.infoText}>{slot.date || item.date || 'TBD'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Clock size={14} color="#94A3B8" />
            <Text style={styles.infoText}>
              {slot.startTime || '20:00'} - {slot.endTime || '23:00'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MapPin size={14} color="#94A3B8" />
            <Text style={styles.infoText} numberOfLines={1}>
              {item.eventLocation || 'Hyderabad'}
            </Text>
          </View>
        </View>

        {paymentsEnabled && item.amountPaise != null && amountPaise !== null ? (
          <Text style={styles.amountText}>Booking amount: {formatPaise(amountPaise)}</Text>
        ) : null}

        {item.notes ? (
          <Text style={styles.notesText}>Note: "{item.notes}"</Text>
        ) : null}

        {item.status === 'AWAITING_PAYMENT' ? (
          <Text style={styles.statusNote}>
            Waiting for the booker to pay
            {item.paymentDueAt ? ` by ${formatDateTimeIST(item.paymentDueAt)}` : ''}. The date is held until then.
          </Text>
        ) : item.status === 'CONFIRMED' ? (
          <Text style={styles.statusNote}>Paid and confirmed. Your fee is released after the gig.</Text>
        ) : item.status === 'DISPUTED' ? (
          <Text style={styles.statusNote}>The booker reported a problem. Stagely is reviewing it.</Text>
        ) : null}

        {isRequested ? (
          <View style={styles.exclusiveBanner}>
            <Sparkles size={13} color="#F5A623" />
            <Text style={styles.exclusiveText}>
              Exclusive Offer: This date is held solely for this venue. Declining reopens it to the public.
            </Text>
          </View>
        ) : null}

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          {isRequested && (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.declineBtn]}
                onPress={() => handleDecision(item.id, 'DECLINED')}
                disabled={isProcessing}
              >
                <X size={16} color="#F87171" />
                <Text style={styles.declineText}>Decline</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.acceptBtn]}
                onPress={() => handleDecision(item.id, 'ACCEPT')}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#0B0D13" />
                ) : (
                  <>
                    <Check size={16} color="#0B0D13" />
                    <Text style={styles.acceptText}>Accept</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {canCancel && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.declineBtn, isCancelling && { opacity: 0.6 }]}
              onPress={() => confirmCancel(item)}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <ActivityIndicator size="small" color="#F87171" />
              ) : (
                <>
                  <Ban size={16} color="#F87171" />
                  <Text style={styles.declineText}>Cancel</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.actionBtn, styles.chatBtn, !isRequested && { flex: 1 }]}
            onPress={() => onOpenChat(item)}
          >
            <MessageSquare size={16} color="#FFFFFF" />
            <Text style={styles.chatText}>Chat</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>Artist Dashboard</Text>
          <Text style={styles.subheading}>{profile?.artistName || 'Stage Performance Hub'}</Text>
        </View>
        <TouchableOpacity style={styles.scheduleBtn} onPress={onManageSchedule}>
          <Calendar size={16} color="#0B0D13" />
          <Text style={styles.scheduleBtnText}>15-Day Calendar</Text>
        </TouchableOpacity>
      </View>

      {/* Verification Status Banner */}
      {isPending && (
        <View style={styles.pendingBanner}>
          <ShieldAlert size={18} color="#F5A623" />
          <View style={{ flex: 1 }}>
            <Text style={styles.pendingTitle}>Verification Pending</Text>
            <Text style={styles.pendingDesc}>
              Our team is vetting your profile. You will be listed in public search once approved.
            </Text>
          </View>
        </View>
      )}

      {isVerified && (
        <View style={styles.verifiedBanner}>
          <ShieldCheck size={18} color="#10B981" />
          <View style={{ flex: 1 }}>
            <Text style={styles.verifiedTitle}>Verified Artist</Text>
            <Text style={styles.verifiedDesc}>
              Your profile is live in Hyderabad's public catalog. Open dates are bookable.
            </Text>
          </View>
        </View>
      )}

      {/* Payout Setup Banner (payments only) */}
      {showPayoutBanner && (
        <TouchableOpacity
          style={styles.payoutBanner}
          onPress={onOpenPayouts}
          disabled={!onOpenPayouts}
          activeOpacity={0.85}
        >
          <Wallet size={18} color="#60A5FA" />
          <View style={{ flex: 1 }}>
            <Text style={styles.payoutTitle}>
              {payoutStatus === 'PENDING'
                ? 'Payout account under review'
                : payoutStatus === 'REJECTED'
                ? 'Payout details need attention'
                : 'Set up payouts to accept bookings'}
            </Text>
            <Text style={styles.payoutDesc}>
              {payoutStatus === 'PENDING'
                ? "Razorpay is verifying your bank account. You can accept bookings once it's active."
                : payoutStatus === 'REJECTED'
                ? 'Razorpay could not verify your bank details. Tap to update them.'
                : 'Add your bank details so bookers can pay you through Stagely.'}
            </Text>
          </View>
          {onOpenPayouts ? <ChevronRight size={18} color="#60A5FA" /> : null}
        </TouchableOpacity>
      )}

      {/* Booking Requests List */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Incoming Booking Requests</Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Sparkles size={36} color="#475569" />
          <Text style={styles.emptyHeading}>No booking requests yet</Text>
          <Text style={styles.emptyDesc}>
            Make sure your 15-day availability calendar is up to date so venues can send requests.
          </Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={item => item.id.toString()}
          renderItem={renderRequestCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchArtistBookings();
                refreshUser().catch(() => {});
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
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  subheading: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2
  },
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5A623',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6
  },
  scheduleBtnText: {
    color: '#0B0D13',
    fontSize: 12,
    fontWeight: '700'
  },
  pendingBanner: {
    flexDirection: 'row',
    backgroundColor: '#1C150A',
    borderColor: '#78350F',
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    gap: 10,
    alignItems: 'center'
  },
  pendingTitle: {
    color: '#F5A623',
    fontSize: 13,
    fontWeight: '700'
  },
  pendingDesc: {
    color: '#D97706',
    fontSize: 11,
    lineHeight: 15
  },
  verifiedBanner: {
    flexDirection: 'row',
    backgroundColor: '#06281E',
    borderColor: '#059669',
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    gap: 10,
    alignItems: 'center'
  },
  verifiedTitle: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '700'
  },
  verifiedDesc: {
    color: '#10B981',
    fontSize: 11,
    lineHeight: 15
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  listContent: {
    padding: 16,
    gap: 14
  },
  card: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  customerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  eventType: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700'
  },
  infoBox: {
    backgroundColor: '#0B0D13',
    padding: 10,
    borderRadius: 10,
    gap: 6
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  infoText: {
    color: '#CBD5E1',
    fontSize: 12
  },
  amountText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700'
  },
  statusNote: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 17
  },
  payoutBanner: {
    flexDirection: 'row',
    backgroundColor: '#0C1A2E',
    borderColor: '#1D4ED8',
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    gap: 10,
    alignItems: 'center'
  },
  payoutTitle: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '700'
  },
  payoutDesc: {
    color: '#93C5FD',
    fontSize: 11,
    lineHeight: 15
  },
  notesText: {
    color: '#94A3B8',
    fontSize: 12,
    fontStyle: 'italic'
  },
  exclusiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 166, 35, 0.08)',
    borderColor: 'rgba(245, 166, 35, 0.25)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8
  },
  exclusiveText: {
    color: '#F5A623',
    fontSize: 11,
    fontWeight: '500',
    flex: 1
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6
  },
  acceptBtn: {
    backgroundColor: '#F5A623'
  },
  acceptText: {
    color: '#0B0D13',
    fontSize: 13,
    fontWeight: '700'
  },
  declineBtn: {
    backgroundColor: '#2A1212',
    borderColor: '#7F1D1D',
    borderWidth: 1
  },
  declineText: {
    color: '#F87171',
    fontSize: 13,
    fontWeight: '600'
  },
  chatBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14
  },
  chatText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12
  },
  emptyHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  emptyDesc: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18
  }
});

export default ArtistDashboardScreen;
