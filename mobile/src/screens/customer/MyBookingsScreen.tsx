import React, { useState, useEffect } from 'react';
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
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../services/api';
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
  CheckCircle2
} from 'lucide-react-native';

interface MyBookingsScreenProps {
  onOpenChat: (booking: any) => void;
  onExplore: () => void;
}

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return { bg: '#1E1B4B', text: '#A78BFA', border: '#4338CA' };
      case 'ACCEPTED':
        return { bg: '#064E3B', text: '#34D399', border: '#059669' };
      case 'REQUESTED':
        return { bg: '#451A03', text: '#F5A623', border: '#78350F' };
      case 'DECLINED':
        return { bg: '#450A0A', text: '#F87171', border: '#7F1D1D' };
      default:
        return { bg: '#1E293B', text: '#94A3B8', border: '#334155' };
    }
  };

  const openReviewModal = (booking: any) => {
    setSelectedBookingForReview(booking);
    setRating(5);
    setComment('');
    setSelectedTags([]);
    setReviewError(null);
    setReviewSuccess(false);
    setReviewModalVisible(true);
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
    const statusTheme = getStatusColor(item.status);
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
            <Text style={[styles.statusText, { color: statusTheme.text }]}>{item.status}</Text>
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
          <Text style={styles.feeText}>₹{artist.baseFee?.toLocaleString('en-IN')}</Text>
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
