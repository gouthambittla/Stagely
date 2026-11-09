import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { api, BookingStatus } from '../../services/api';
import { useAppConfig } from '../../hooks/useAppConfig';
import {
  customerRefundPercent,
  formatDateTimeIST,
  getEventEnd,
  getEventStart,
  getStatusTheme,
  isBeforeEventStart
} from '../../utils/bookingStatus';
import { bookingAmountPaise, formatPaise } from '../../utils/money';
import {
  Calendar,
  Clock,
  MessageSquare,
  MapPin,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Star,
  X,
  CheckCircle2,
  CreditCard,
  Ban,
  Flag,
  ShieldCheck,
  Info
} from 'lucide-react-native';

interface MyBookingsScreenProps {
  onOpenChat: (booking: any) => void;
  onExplore: () => void;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;
/** After the booker backed out of checkout, check briefly in case the payment went through anyway. */
const POLL_TIMEOUT_AFTER_CANCEL_MS = 6000;
const DISPUTE_REASON_MAX = 1000;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

type PaymentNotice = { id: number; kind: 'success' | 'info' | 'error'; message: string };

const PRESET_TAGS = [
  'Punctual Soundcheck',
  'Crystal-Clear Audio',
  'High Crowd Energy',
  'Great Song Selection',
  'Professional Stage Presence',
  'Seamless PA Setup'
];

export const MyBookingsScreen: React.FC<MyBookingsScreenProps> = ({ onOpenChat, onExplore }) => {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Review Modal State
  const [reviewModalVisible, setReviewModalVisible] = useState<boolean>(false);
  const [selectedBookingForReview, setSelectedBookingForReview] = useState<any | null>(null);
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<boolean>(false);

  // Mark-as-completed state
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [completeError, setCompleteError] = useState<{ id: number; message: string } | null>(null);

  // Payments
  const { config } = useAppConfig();
  const paymentsEnabled = config.paymentsEnabled;
  const [payingId, setPayingId] = useState<number | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<PaymentNotice | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const mountedRef = useRef(true);

  // Report-a-problem modal
  const [disputeBooking, setDisputeBooking] = useState<any | null>(null);
  const [disputeReason, setDisputeReason] = useState<string>('');
  const [disputeSubmitting, setDisputeSubmitting] = useState<boolean>(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchBookings = async () => {
    setError(null);
    try {
      const res = await api.getBookings();
      setBookings(res.bookings || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch bookings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const openReviewModal = (booking: any) => {
    setSelectedBookingForReview(booking);
    setRating(5);
    setComment('');
    setSelectedTags([]);
    setReviewError(null);
    setReviewSuccess(false);
    setReviewModalVisible(true);
  };

  /** The gig has ended (server stamps eventEndsAt), so the booker can confirm it happened. */
  const canMarkCompleted = (booking: any) =>
    (booking.status === 'ACCEPTED' || booking.status === 'CONFIRMED') &&
    Boolean(booking.eventEndsAt) &&
    new Date(booking.eventEndsAt).getTime() <= Date.now();

  const canPay = (booking: any) =>
    booking.status === 'AWAITING_PAYMENT' &&
    (!booking.paymentDueAt || new Date(booking.paymentDueAt).getTime() > Date.now());

  /** Cancellation is allowed before the event starts. ACCEPTED only exists as a payable state when payments are on. */
  const canCancel = (booking: any) =>
    paymentsEnabled &&
    ['ACCEPTED', 'AWAITING_PAYMENT', 'CONFIRMED'].includes(booking.status) &&
    isBeforeEventStart(booking);

  /** "Report a problem": a confirmed booking, from event start until the dispute window closes. */
  const canDispute = (booking: any) => {
    if (booking.status !== 'CONFIRMED') return false;
    const start = getEventStart(booking);
    const end = getEventEnd(booking);
    if (!start || !end) return false;
    const now = Date.now();
    return now >= start.getTime() && now <= end.getTime() + config.disputeWindowHours * 3_600_000;
  };

  /** Polls the server until the booking leaves AWAITING_PAYMENT (or we give up). */
  const pollPaymentStatus = async (bookingId: number, timeoutMs: number): Promise<BookingStatus | null> => {
    const deadline = Date.now() + timeoutMs;
    let last: BookingStatus | null = null;
    while (mountedRef.current) {
      try {
        const res = await api.getPaymentStatus(bookingId);
        last = res.bookingStatus;
        if (last !== 'AWAITING_PAYMENT') return last;
      } catch (err: any) {
        if (__DEV__) console.warn('Payment status check failed', err?.message);
      }
      if (Date.now() + POLL_INTERVAL_MS > deadline) break;
      await sleep(POLL_INTERVAL_MS);
    }
    return last;
  };

  const payForBooking = async (booking: any) => {
    setPayingId(booking.id);
    setPaymentNotice(null);
    try {
      const order = await api.payBooking(booking.id);
      const returnUrl = Linking.createURL('payment-result');
      const sep = order.checkoutUrl.includes('?') ? '&' : '?';
      const checkoutUrl = `${order.checkoutUrl}${sep}return=${encodeURIComponent(returnUrl)}`;

      const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, returnUrl);

      // The redirect is only a hint; the server is the source of truth.
      let hint: string | null = null;
      if (result.type === 'success' && result.url) {
        const status = Linking.parse(result.url).queryParams?.status;
        hint = typeof status === 'string' ? status : null;
      }
      const backedOut =
        hint === 'cancelled' || hint === 'closed' || result.type === 'cancel' || result.type === 'dismiss';

      const finalStatus = await pollPaymentStatus(
        booking.id,
        backedOut ? POLL_TIMEOUT_AFTER_CANCEL_MS : POLL_TIMEOUT_MS
      );
      if (!mountedRef.current) return;

      if (finalStatus === 'CONFIRMED') {
        setPaymentNotice({
          id: booking.id,
          kind: 'success',
          message: 'Payment received. Your booking is confirmed!'
        });
      } else if (finalStatus && finalStatus !== 'AWAITING_PAYMENT') {
        setPaymentNotice({
          id: booking.id,
          kind: 'info',
          message: `This booking is now: ${getStatusTheme(finalStatus).label}.`
        });
      } else if (backedOut) {
        setPaymentNotice({
          id: booking.id,
          kind: 'info',
          message:
            'Payment not completed. You can try again before the deadline. If you did pay, it can take a minute to show up. Pull to refresh.'
        });
      } else if (hint === 'error') {
        setPaymentNotice({
          id: booking.id,
          kind: 'error',
          message:
            'Something went wrong with the payment page. If you were charged, it will show up here shortly; otherwise please try again.'
        });
      } else {
        setPaymentNotice({
          id: booking.id,
          kind: 'info',
          message: 'Your payment is still processing. Pull down to refresh in a moment.'
        });
      }
    } catch (err: any) {
      Alert.alert('Payment unavailable', err.message || 'Could not start the payment. Please try again.');
    } finally {
      if (mountedRef.current) {
        setPayingId(null);
        fetchBookings();
      }
    }
  };

  const confirmCancel = (booking: any) => {
    let body: string;
    if (booking.status === 'CONFIRMED') {
      const pct = customerRefundPercent(booking, config.customerCancellationPolicy);
      const amount = bookingAmountPaise(booking);
      const refund = amount !== null ? Math.round((amount * pct) / 100) : null;
      body =
        pct >= 100
          ? `You'll get a full refund${refund !== null ? ` of ${formatPaise(refund)}` : ''}.`
          : pct > 0
          ? `Under the cancellation policy you'll get a ${pct}% refund${refund !== null ? ` (${formatPaise(refund)})` : ''}.`
          : "It's too close to the event for a refund under the cancellation policy. You won't get any money back.";
    } else {
      body = "You haven't paid for this booking, so nothing will be charged.";
    }
    Alert.alert('Cancel this booking?', `${body} This cannot be undone.`, [
      { text: 'Keep booking', style: 'cancel' },
      { text: 'Cancel booking', style: 'destructive', onPress: () => cancelBooking(booking) }
    ]);
  };

  const cancelBooking = async (booking: any) => {
    setCancellingId(booking.id);
    try {
      const res = await api.cancelBooking(booking.id);
      const refundLine =
        res.refundPaise > 0
          ? ` A refund of ${formatPaise(res.refundPaise)} is on its way to your original payment method.`
          : '';
      Alert.alert('Booking cancelled', `${res.message || 'Your booking has been cancelled.'}${refundLine}`);
    } catch (err: any) {
      Alert.alert('Could not cancel', err.message || 'Unable to cancel this booking');
    } finally {
      setCancellingId(null);
      fetchBookings();
    }
  };

  const openDisputeModal = (booking: any) => {
    setDisputeBooking(booking);
    setDisputeReason('');
    setDisputeError(null);
  };

  const submitDispute = async () => {
    if (!disputeBooking) return;
    const reason = disputeReason.trim();
    if (!reason) {
      setDisputeError('Please tell us what went wrong.');
      return;
    }
    setDisputeSubmitting(true);
    setDisputeError(null);
    try {
      await api.disputeBooking(disputeBooking.id, reason);
      setDisputeBooking(null);
      Alert.alert(
        'Problem reported',
        "We've paused the payment to the artist. The Stagely team will review it and get back to you."
      );
      fetchBookings();
    } catch (err: any) {
      setDisputeError(err.message || 'Could not report the problem');
    } finally {
      setDisputeSubmitting(false);
    }
  };

  const markCompleted = async (booking: any) => {
    setCompletingId(booking.id);
    setCompleteError(null);
    try {
      const res = await api.completeBooking(booking.id);
      const updated = { ...booking, ...res.booking };
      setBookings(prev => prev.map(b => (b.id === booking.id ? updated : b)));
      // Go straight to the (optional) review
      openReviewModal(updated);
    } catch (err: any) {
      setCompleteError({ id: booking.id, message: err.message || 'Could not mark as completed' });
      // The booking may have auto-completed meanwhile; refresh to show its real state
      fetchBookings();
    } finally {
      setCompletingId(null);
    }
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const submitReview = async () => {
    if (!selectedBookingForReview) return;
    setIsSubmittingReview(true);
    setReviewError(null);
    try {
      const res = await api.submitBookingReview(selectedBookingForReview.id, {
        rating,
        comment: comment.trim() || undefined,
        tags: selectedTags
      });

      // Update local state so booking card shows reviewed badge immediately
      setBookings(prev =>
        prev.map(b => (b.id === selectedBookingForReview.id ? { ...b, review: res.review } : b))
      );
      setReviewSuccess(true);
      setTimeout(() => {
        setReviewModalVisible(false);
        setSelectedBookingForReview(null);
      }, 1200);
    } catch (err: any) {
      setReviewError(err.message || 'Failed to submit review');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const getRatingLabel = (stars: number) => {
    switch (stars) {
      case 1:
        return 'Disappointing Performance';
      case 2:
        return 'Below Expectations';
      case 3:
        return 'Good Show';
      case 4:
        return 'Great Live Energy!';
      case 5:
        return 'Outstanding Live Performance! ⭐';
      default:
        return '';
    }
  };

  const renderBookingCard = ({ item }: { item: any }) => {
    const statusTheme = getStatusTheme(item.status);
    const amountPaise = bookingAmountPaise(item);
    const isPaying = payingId === item.id;
    const isCancelling = cancellingId === item.id;
    const notice = paymentNotice && paymentNotice.id === item.id ? paymentNotice : null;
    const artist = item.artist || {};
    const slot = item.slot || {};
    const isCompleted = item.status === 'COMPLETED';
    const hasReview = Boolean(item.review);

    return (
      <View style={styles.bookingCard}>
        <View style={styles.cardTop}>
          <View>
            <Text style={styles.artistName}>{artist.artistName || 'Artist'}</Text>
            <Text style={styles.eventType}>{item.eventType}</Text>
          </View>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: statusTheme.bg, borderColor: statusTheme.border }
            ]}
          >
            <Text style={[styles.statusText, { color: statusTheme.text }]}>{statusTheme.label}</Text>
          </View>
        </View>

        <View style={styles.detailsBox}>
          <View style={styles.detailItem}>
            <Calendar size={14} color="#F5A623" />
            <Text style={styles.detailText}>{slot.date || 'TBD'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Clock size={14} color="#94A3B8" />
            <Text style={styles.detailText}>
              {slot.startTime} - {slot.endTime}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <MapPin size={14} color="#94A3B8" />
            <Text style={styles.detailText} numberOfLines={1}>
              {item.eventLocation}
            </Text>
          </View>
        </View>

        {canPay(item) && (
          <View style={styles.reviewSection}>
            <TouchableOpacity
              style={[styles.payButton, (isPaying || payingId !== null) && styles.btnDisabled]}
              onPress={() => payForBooking(item)}
              disabled={payingId !== null}
              activeOpacity={0.85}
            >
              {isPaying ? (
                <>
                  <ActivityIndicator size="small" color="#0B0D13" />
                  <Text style={styles.payButtonText}>Confirming payment...</Text>
                </>
              ) : (
                <>
                  <CreditCard size={18} color="#0B0D13" />
                  <Text style={styles.payButtonText}>Pay {formatPaise(amountPaise)}</Text>
                </>
              )}
            </TouchableOpacity>
            {item.paymentDueAt ? (
              <Text style={styles.payHint}>
                Pay by {formatDateTimeIST(item.paymentDueAt)} to confirm. The artist has accepted and is holding
                the date for you.
              </Text>
            ) : null}
          </View>
        )}

        {notice && (
          <View
            style={[
              styles.noticeBox,
              notice.kind === 'success'
                ? styles.noticeSuccess
                : notice.kind === 'error'
                ? styles.noticeError
                : styles.noticeInfo
            ]}
          >
            {notice.kind === 'success' ? (
              <CheckCircle2 size={16} color="#34D399" />
            ) : notice.kind === 'error' ? (
              <AlertCircle size={16} color="#F87171" />
            ) : (
              <Info size={16} color="#60A5FA" />
            )}
            <Text style={styles.noticeText}>{notice.message}</Text>
          </View>
        )}

        {item.status === 'CONFIRMED' && !canMarkCompleted(item) && (
          <View style={styles.confirmedNote}>
            <ShieldCheck size={14} color="#34D399" />
            <Text style={styles.confirmedNoteText}>
              Paid. Stagely holds the money and releases it to the artist after the show.
            </Text>
          </View>
        )}

        {item.status === 'DISPUTED' && (
          <View style={styles.disputedNote}>
            <ShieldCheck size={14} color="#60A5FA" />
            <Text style={styles.disputedNoteText}>
              Under review by Stagely. We'll get back to you about the problem you reported.
            </Text>
          </View>
        )}

        {canMarkCompleted(item) && (
          <View style={styles.reviewSection}>
            <TouchableOpacity
              style={[styles.completeButton, completingId === item.id && styles.btnDisabled]}
              onPress={() => markCompleted(item)}
              disabled={completingId === item.id}
              activeOpacity={0.85}
            >
              {completingId === item.id ? (
                <ActivityIndicator size="small" color="#0B0D13" />
              ) : (
                <>
                  <CheckCircle2 size={16} color="#0B0D13" />
                  <Text style={styles.completeButtonText}>Mark as Completed</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={styles.completeHint}>
              Did the show happen? Confirm it here. It completes automatically 48 hours after the event.
            </Text>
            {completeError && completeError.id === item.id ? (
              <Text style={styles.completeErrorText}>{completeError.message}</Text>
            ) : null}
          </View>
        )}

        {(canDispute(item) || canCancel(item)) && (
          <View style={styles.secondaryActionsRow}>
            {canDispute(item) && (
              <TouchableOpacity
                style={styles.secondaryActionBtn}
                onPress={() => openDisputeModal(item)}
                activeOpacity={0.85}
              >
                <Flag size={14} color="#F87171" />
                <Text style={styles.secondaryActionText}>Report a problem</Text>
              </TouchableOpacity>
            )}
            {canCancel(item) && (
              <TouchableOpacity
                style={[styles.secondaryActionBtn, isCancelling && styles.btnDisabled]}
                onPress={() => confirmCancel(item)}
                disabled={isCancelling || isPaying}
                activeOpacity={0.85}
              >
                {isCancelling ? (
                  <ActivityIndicator size="small" color="#F87171" />
                ) : (
                  <>
                    <Ban size={14} color="#F87171" />
                    <Text style={styles.secondaryActionText}>Cancel booking</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Verified Review Section for Completed Gigs */}
        {isCompleted && (
          <View style={styles.reviewSection}>
            {hasReview ? (
              <View style={styles.reviewedCard}>
                <View style={styles.reviewedHeader}>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map(starNum => (
                      <Star
                        key={starNum}
                        size={14}
                        color={starNum <= (item.review.rating || 5) ? '#F5A623' : '#334155'}
                        fill={starNum <= (item.review.rating || 5) ? '#F5A623' : 'transparent'}
                      />
                    ))}
                  </View>
                  <Text style={styles.reviewedBadgeText}>Verified Review</Text>
                </View>
                {item.review.comment ? (
                  <Text style={styles.reviewedComment} numberOfLines={2}>
                    "{item.review.comment}"
                  </Text>
                ) : null}
              </View>
            ) : (
              <TouchableOpacity
                style={styles.leaveReviewButton}
                onPress={() => openReviewModal(item)}
                activeOpacity={0.85}
              >
                <Star size={16} color="#0B0D13" fill="#0B0D13" />
                <Text style={styles.leaveReviewButtonText}>Rate & Review Show</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.feeText}>
            {paymentsEnabled && amountPaise !== null
              ? formatPaise(amountPaise)
              : `₹${artist.baseFee?.toLocaleString('en-IN')}`}
          </Text>
          <TouchableOpacity
            style={styles.chatButton}
            onPress={() => onOpenChat(item)}
            activeOpacity={0.85}
          >
            <MessageSquare size={16} color="#0B0D13" />
            <Text style={styles.chatButtonText}>Chat with Artist</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.screenTitle}>My Bookings</Text>
        <Text style={styles.screenSubtitle}>Manage your live entertainment requests</Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
          <Text style={styles.loadingText}>Loading your booking requests...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <AlertCircle size={40} color="#EF4444" />
          <Text style={styles.errorTitle}>Could not load bookings</Text>
          <Text style={styles.loadingText}>{error}</Text>
          <TouchableOpacity style={styles.actionButton} onPress={fetchBookings}>
            <RefreshCw size={16} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : bookings.length === 0 ? (
        <View style={styles.centerContainer}>
          <Sparkles size={40} color="#475569" />
          <Text style={styles.emptyTitle}>No bookings yet</Text>
          <Text style={styles.loadingText}>
            You haven't requested any artists yet. Explore top live bands in Hyderabad now!
          </Text>
          <TouchableOpacity style={styles.actionButton} onPress={onExplore}>
            <Text style={styles.actionButtonText}>Browse Live Artists</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={item => item.id.toString()}
          renderItem={renderBookingCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchBookings();
              }}
              tintColor="#F5A623"
            />
          }
        />
      )}

      {/* Report-a-problem Modal */}
      <Modal
        visible={Boolean(disputeBooking)}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (!disputeSubmitting) setDisputeBooking(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Report a problem</Text>
                <Text style={styles.modalSubtitle}>
                  {disputeBooking?.artist?.artistName || 'Artist'} • {disputeBooking?.slot?.date || ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setDisputeBooking(null)}
                style={styles.closeButton}
                disabled={disputeSubmitting}
              >
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.disputeIntro}>
                Tell us what went wrong (for example, the artist didn't show up or the set was cut short). We'll hold
                the payment to the artist while the Stagely team reviews it.
              </Text>

              {disputeError && (
                <View style={styles.errorBanner}>
                  <AlertCircle size={16} color="#F87171" />
                  <Text style={styles.errorBannerText}>{disputeError}</Text>
                </View>
              )}

              <View style={styles.inputSection}>
                <Text style={styles.inputLabel}>What happened? *</Text>
                <TextInput
                  style={[styles.feedbackInput, { minHeight: 120 }]}
                  placeholder="Describe the problem..."
                  placeholderTextColor="#64748B"
                  multiline={true}
                  numberOfLines={5}
                  maxLength={DISPUTE_REASON_MAX}
                  value={disputeReason}
                  onChangeText={text => {
                    setDisputeReason(text);
                    if (disputeError) setDisputeError(null);
                  }}
                  textAlignVertical="top"
                  editable={!disputeSubmitting}
                />
                <Text style={styles.charCount}>
                  {disputeReason.length}/{DISPUTE_REASON_MAX}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.disputeSubmitBtn, disputeSubmitting && styles.btnDisabled]}
                onPress={submitDispute}
                disabled={disputeSubmitting}
                activeOpacity={0.85}
              >
                {disputeSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.disputeSubmitBtnText}>Submit report</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Verified Review Submission Modal */}
      <Modal
        visible={reviewModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setReviewModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Rate & Review Show</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedBookingForReview?.artist?.artistName || 'Artist'} •{' '}
                  {selectedBookingForReview?.eventType}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReviewModalVisible(false)}
                style={styles.closeButton}
              >
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {reviewSuccess ? (
              <View style={styles.successContainer}>
                <CheckCircle2 size={48} color="#34D399" />
                <Text style={styles.successTitle}>Review Submitted!</Text>
                <Text style={styles.successSub}>Thank you for supporting verified live artists.</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
                {reviewError && (
                  <View style={styles.errorBanner}>
                    <AlertCircle size={16} color="#F87171" />
                    <Text style={styles.errorBannerText}>{reviewError}</Text>
                  </View>
                )}

                {/* Interactive Star Picker */}
                <View style={styles.starPickerBox}>
                  <Text style={styles.inputLabel}>Overall Rating</Text>
                  <View style={styles.starPickerRow}>
                    {[1, 2, 3, 4, 5].map(starNum => (
                      <TouchableOpacity
                        key={starNum}
                        onPress={() => setRating(starNum)}
                        style={styles.starTouch}
                        activeOpacity={0.7}
                      >
                        <Star
                          size={36}
                          color={starNum <= rating ? '#F5A623' : '#334155'}
                          fill={starNum <= rating ? '#F5A623' : 'transparent'}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.ratingDescriptor}>{getRatingLabel(rating)}</Text>
                </View>

                {/* Preset Compliance & Sound Tags */}
                <View style={styles.inputSection}>
                  <Text style={styles.inputLabel}>Stage & Sound Highlights</Text>
                  <View style={styles.tagChipsWrap}>
                    {PRESET_TAGS.map(tag => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <TouchableOpacity
                          key={tag}
                          style={[styles.tagChip, isSelected && styles.tagChipSelected]}
                          onPress={() => toggleTag(tag)}
                          activeOpacity={0.75}
                        >
                          <Text
                            style={[
                              styles.tagChipText,
                              isSelected && styles.tagChipTextSelected
                            ]}
                          >
                            {tag}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Qualitative Feedback */}
                <View style={styles.inputSection}>
                  <Text style={styles.inputLabel}>Your Feedback (Optional)</Text>
                  <TextInput
                    style={styles.feedbackInput}
                    placeholder="Share how the performance, crowd response, or soundcheck went..."
                    placeholderTextColor="#64748B"
                    multiline={true}
                    numberOfLines={4}
                    value={comment}
                    onChangeText={setComment}
                    textAlignVertical="top"
                  />
                </View>

                {/* Submit Action */}
                <TouchableOpacity
                  style={[styles.submitReviewBtn, isSubmittingReview && styles.btnDisabled]}
                  onPress={submitReview}
                  disabled={isSubmittingReview}
                  activeOpacity={0.85}
                >
                  {isSubmittingReview ? (
                    <ActivityIndicator size="small" color="#0B0D13" />
                  ) : (
                    <Text style={styles.submitReviewBtnText}>Submit Verified Review</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0D13'
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 4
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5
  },
  screenSubtitle: {
    fontSize: 14,
    color: '#94A3B8'
  },
  listContent: {
    padding: 16,
    gap: 16
  },
  bookingCard: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 14
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  artistName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  eventType: {
    fontSize: 13,
    color: '#F5A623',
    fontWeight: '600',
    marginTop: 2
  },
  statusPill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700'
  },
  detailsBox: {
    backgroundColor: '#0B0D13',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#1E293B'
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  detailText: {
    color: '#E2E8F0',
    fontSize: 13
  },
  reviewSection: {
    marginTop: 2
  },
  leaveReviewButton: {
    backgroundColor: '#F5A623',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10
  },
  completeButton: {
    backgroundColor: '#34D399',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10
  },
  payButton: {
    backgroundColor: '#F5A623',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12
  },
  payButtonText: {
    color: '#0B0D13',
    fontWeight: '800',
    fontSize: 16
  },
  payHint: {
    color: '#F5A623',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center'
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10
  },
  noticeSuccess: {
    backgroundColor: '#06281E',
    borderColor: '#059669'
  },
  noticeInfo: {
    backgroundColor: '#0C1A2E',
    borderColor: '#1D4ED8'
  },
  noticeError: {
    backgroundColor: '#450A0A',
    borderColor: '#7F1D1D'
  },
  noticeText: {
    color: '#E2E8F0',
    fontSize: 13,
    flex: 1
  },
  confirmedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  confirmedNoteText: {
    color: '#94A3B8',
    fontSize: 12,
    flex: 1
  },
  disputedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0C1A2E',
    borderColor: '#1D4ED8',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10
  },
  disputedNoteText: {
    color: '#93C5FD',
    fontSize: 13,
    flex: 1
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    gap: 8
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#2A1212',
    borderColor: '#7F1D1D',
    borderWidth: 1
  },
  secondaryActionText: {
    color: '#F87171',
    fontWeight: '600',
    fontSize: 13
  },
  disputeIntro: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 20
  },
  charCount: {
    color: '#64748B',
    fontSize: 11,
    textAlign: 'right'
  },
  disputeSubmitBtn: {
    backgroundColor: '#DC2626',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8
  },
  disputeSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800'
  },
  completeButtonText: {
    color: '#0B0D13',
    fontWeight: '700',
    fontSize: 14
  },
  completeHint: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center'
  },
  completeErrorText: {
    color: '#F87171',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center'
  },
  leaveReviewButtonText: {
    color: '#0B0D13',
    fontWeight: '700',
    fontSize: 14
  },
  reviewedCard: {
    backgroundColor: '#1A1829',
    borderColor: '#4338CA',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 6
  },
  reviewedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  starsRow: {
    flexDirection: 'row',
    gap: 3
  },
  reviewedBadgeText: {
    fontSize: 11,
    color: '#A78BFA',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  reviewedComment: {
    color: '#E2E8F0',
    fontSize: 13,
    fontStyle: 'italic'
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 12
  },
  feeText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  chatButton: {
    backgroundColor: '#F5A623',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6
  },
  chatButtonText: {
    color: '#0B0D13',
    fontWeight: '700',
    fontSize: 13
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center'
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700'
  },
  errorTitle: {
    color: '#F87171',
    fontSize: 18,
    fontWeight: '700'
  },
  actionButton: {
    marginTop: 12,
    backgroundColor: '#F5A623',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  actionButtonText: {
    color: '#0B0D13',
    fontWeight: '700',
    fontSize: 14
  },
  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#131722',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#1E293B',
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 36 : 24
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2
  },
  closeButton: {
    padding: 4
  },
  modalScroll: {
    padding: 20,
    gap: 20
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
  starPickerBox: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10
  },
  starPickerRow: {
    flexDirection: 'row',
    gap: 12
  },
  starTouch: {
    padding: 4
  },
  ratingDescriptor: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F5A623',
    marginTop: 4
  },
  inputSection: {
    gap: 8
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  tagChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  tagChip: {
    backgroundColor: '#0B0D13',
    borderColor: '#1E293B',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8
  },
  tagChipSelected: {
    backgroundColor: '#3B270C',
    borderColor: '#F5A623'
  },
  tagChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600'
  },
  tagChipTextSelected: {
    color: '#F5A623',
    fontWeight: '700'
  },
  feedbackInput: {
    backgroundColor: '#0B0D13',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 12,
    color: '#FFFFFF',
    padding: 14,
    fontSize: 14,
    minHeight: 90
  },
  submitReviewBtn: {
    backgroundColor: '#F5A623',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8
  },
  submitReviewBtnText: {
    color: '#0B0D13',
    fontSize: 15,
    fontWeight: '800'
  },
  btnDisabled: {
    opacity: 0.6
  },
  successContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12
  },
  successTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800'
  },
  successSub: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center'
  }
});

export default MyBookingsScreen;
