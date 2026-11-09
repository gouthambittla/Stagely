import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  TextInput,
  ActivityIndicator,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../services/api';
import {
  ArrowLeft,
  CheckCircle,
  MapPin,
  Calendar,
  Clock,
  Sparkles,
  Star,
  Youtube,
  Instagram,
  Mic2,
  FileText,
  ShieldCheck,
  Check
} from 'lucide-react-native';

interface ArtistDetailScreenProps {
  artist: any;
  onBack: () => void;
  onBookingSuccess: () => void;
}

export const ArtistDetailScreen: React.FC<ArtistDetailScreenProps> = ({
  artist: initialArtist,
  onBack,
  onBookingSuccess
}) => {
  // The list item passed in is a snapshot from the Explore search; load the live profile so
  // the artist's latest edits (fee, bio, rider, availability) are what the booker sees.
  const [artist, setArtist] = useState<any>(initialArtist);
  useEffect(() => {
    let cancelled = false;
    api.getArtistById(initialArtist.id)
      .then(res => {
        if (!cancelled && res?.artist) {
          setArtist({ ...initialArtist, ...res.artist });
        }
      })
      .catch(err => console.warn('Could not refresh artist profile:', err?.message || err));
    return () => {
      cancelled = true;
    };
  }, [initialArtist.id]);

  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [showBookingForm, setShowBookingForm] = useState<boolean>(false);
  const [eventType, setEventType] = useState<string>('Pub Live Band');
  const [eventLocation, setEventLocation] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [reviews, setReviews] = useState<any[]>([]);
  const [averageRating, setAverageRating] = useState<number | null>(artist.averageRating ?? null);
  const [reviewCount, setReviewCount] = useState<number>(artist.reviewCount ?? 0);
  const [loadingReviews, setLoadingReviews] = useState<boolean>(true);

  useEffect(() => {
    api.getArtistReviews(artist.id)
      .then(res => {
        setReviews(res.reviews || []);
        if (res.averageRating !== null && res.averageRating !== undefined) {
          setAverageRating(res.averageRating);
        }
        if (res.reviewCount !== undefined) {
          setReviewCount(res.reviewCount);
        }
      })
      .catch(err => {
        console.warn('Failed to load artist reviews:', err);
      })
      .finally(() => {
        setLoadingReviews(false);
      });
  }, [artist.id]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    // Pre-populate customer's venue and city from profile
    api.getProfile()
      .then(res => {
        if (res?.user?.venueName || res?.user?.city) {
          const parts = [res.user.venueName, res.user.city].filter(Boolean);
          if (parts.length > 0) {
            setEventLocation(parts.join(', '));
          }
        }
      })
      .catch(err => {
        console.warn('Could not prefill venue location from customer profile:', err);
      });
  }, []);

  const genres: string[] =
    typeof artist.genres === 'string' ? JSON.parse(artist.genres) : artist.genres || [];
  const slots: any[] = artist.availabilitySlots || [];

  const handleBookingSubmit = async () => {
    if (!selectedSlot) {
      Alert.alert('Select a Date', 'Please select an available performance slot from the calendar.');
      return;
    }
    if (!eventLocation.trim()) {
      Alert.alert('Venue Location Required', 'Please enter the event location or venue name.');
      return;
    }

    setSubmitting(true);
    try {
      await api.createBooking({
        artistId: artist.id,
        slotId: selectedSlot.id,
        eventType,
        eventLocation: eventLocation.trim(),
        notes: notes.trim() || undefined
      });

      Alert.alert(
        'Request Sent!',
        `Your booking request for ${selectedSlot.date} has been sent to ${artist.artistName}. The artist will review and accept your request.`,
        [{ text: 'OK', onPress: onBookingSuccess }]
      );
    } catch (err: any) {
      Alert.alert('Booking Error', err.message || 'Failed to submit booking request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {artist.artistName}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.categoryPill}>
              <Text style={styles.categoryPillText}>{artist.category}</Text>
            </View>
            {artist.verificationStatus === 'VERIFIED' && (
              <View style={styles.verifiedBadge}>
                <CheckCircle size={14} color="#10B981" />
                <Text style={styles.verifiedBadgeText}>Verified Artist</Text>
              </View>
            )}
          </View>

          <Text style={styles.heroArtistName}>{artist.artistName}</Text>

          <View style={styles.locationRow}>
            <MapPin size={15} color="#94A3B8" />
            <Text style={styles.locationText}>{artist.location}</Text>
          </View>

          <View style={styles.feeCard}>
            <View style={styles.feeHeaderRow}>
              <Text style={styles.feeCardLabel}>Standard Performance Fee</Text>
              <View style={styles.guaranteeTag}>
                <Check size={11} color="#10B981" />
                <Text style={styles.guaranteeTagText}>Zero Agency Markup</Text>
              </View>
            </View>
            <Text style={styles.feeCardAmount}>₹{artist.baseFee.toLocaleString('en-IN')}</Text>
            <Text style={styles.feeCardSubtext}>
              Includes full standard 2-hour live performance. Direct settlement with artist.
            </Text>
          </View>
        </View>

        {/* Genres */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Musical Genres</Text>
          <View style={styles.genresRow}>
            {genres.map((genre, idx) => (
              <View key={idx} style={styles.genreBadge}>
                <Text style={styles.genreBadgeText}>{genre}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Bio */}
        {artist.bio ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About the Artist</Text>
            <Text style={styles.bioText}>{artist.bio}</Text>
          </View>
        ) : null}

        {/* Technical Requirements / Sound Rider */}
        {artist.requirements ? (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Mic2 size={16} color="#F5A623" />
              <Text style={styles.sectionTitle}>Sound & Stage Requirements</Text>
            </View>
            <View style={styles.requirementsBox}>
              <Text style={styles.requirementsText}>{artist.requirements}</Text>
            </View>
          </View>
        ) : null}

        {/* Social & Performance Links */}
        {(artist.youtubeUrl || artist.instagramUrl) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Performance Links</Text>
            <View style={styles.linksRow}>
              {artist.youtubeUrl && (
                <TouchableOpacity
                  style={styles.socialLink}
                  onPress={() => Linking.openURL(artist.youtubeUrl)}
                >
                  <Youtube size={18} color="#EF4444" />
                  <Text style={styles.socialLinkText}>Watch on YouTube</Text>
                </TouchableOpacity>
              )}
              {artist.instagramUrl && (
                <TouchableOpacity
                  style={styles.socialLink}
                  onPress={() => Linking.openURL(artist.instagramUrl)}
                >
                  <Instagram size={18} color="#EC4899" />
                  <Text style={styles.socialLinkText}>Instagram</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Verified Stage Reviews */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Star size={16} color="#F5A623" fill="#F5A623" />
            <Text style={styles.sectionTitle}>
              Verified Stage Reviews {reviewCount > 0 ? `(${reviewCount})` : ''}
            </Text>
          </View>

          {loadingReviews ? (
            <ActivityIndicator size="small" color="#F5A623" style={{ marginVertical: 12 }} />
          ) : reviews.length === 0 ? (
            <View style={styles.emptyReviewsCard}>
              <Text style={styles.emptyReviewsTitle}>No Stage Reviews Yet</Text>
              <Text style={styles.emptyReviewsText}>
                Be the first venue or event host to book and review this artist!
              </Text>
            </View>
          ) : (
            <View style={styles.reviewsList}>
              {reviews.map(r => {
                const tags: string[] = typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags || [];
                return (
                  <View key={r.id} style={styles.reviewCard}>
                    <View style={styles.reviewCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reviewerName}>
                          {r.customer?.name || 'Event Host'}
                          {r.customer?.venueName ? ` • ${r.customer.venueName}` : ''}
                        </Text>
                        {r.customer?.city ? (
                          <Text style={styles.reviewerCity}>{r.customer.city}</Text>
                        ) : null}
                      </View>
                      <View style={styles.reviewStarsRow}>
                        {[1, 2, 3, 4, 5].map(starNum => (
                          <Star
                            key={starNum}
                            size={12}
                            color={starNum <= r.rating ? '#F5A623' : '#334155'}
                            fill={starNum <= r.rating ? '#F5A623' : 'transparent'}
                          />
                        ))}
                      </View>
                    </View>

                    {r.comment ? <Text style={styles.reviewComment}>"{r.comment}"</Text> : null}

                    {tags.length > 0 && (
                      <View style={styles.reviewTagsRow}>
                        {tags.map((t, tidx) => (
                          <View key={tidx} style={styles.reviewTagBadge}>
                            <Text style={styles.reviewTagBadgeText}>{t}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* 15-Day Rolling Availability Calendar */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Calendar size={16} color="#F5A623" />
            <Text style={styles.sectionTitle}>15-Day Availability Calendar</Text>
          </View>
          <Text style={styles.subtext}>
            Pick an open performance date to initiate a booking request.
          </Text>

          {slots.length === 0 ? (
            <Text style={styles.noSlotsText}>No availability slots configured right now.</Text>
          ) : (
            <View style={styles.slotsGrid}>
              {slots.map(slot => {
                const isSelected = selectedSlot?.id === slot.id;
                const isBooked = slot.isBooked;

                return (
                  <TouchableOpacity
                    key={slot.id}
                    disabled={isBooked}
                    style={[
                      styles.slotPill,
                      isBooked && styles.slotPillBooked,
                      isSelected && styles.slotPillSelected
                    ]}
                    onPress={() => {
                      setSelectedSlot(slot);
                      setShowBookingForm(true);
                    }}
                  >
                    <Text
                      style={[
                        styles.slotPillDate,
                        isBooked && styles.slotPillDateBooked,
                        isSelected && styles.slotPillTextSelected
                      ]}
                    >
                      {slot.date}
                    </Text>
                    <Text
                      style={[
                        styles.slotPillTime,
                        isBooked && styles.slotPillDateBooked,
                        isSelected && styles.slotPillTextSelected
                      ]}
                    >
                      {slot.startTime} - {slot.endTime}
                    </Text>
                    <Text
                      style={[
                        styles.slotPillStatus,
                        isBooked ? styles.statusBooked : styles.statusOpen,
                        isSelected && styles.slotPillTextSelected
                      ]}
                    >
                      {isBooked ? 'Booked' : 'Available'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Booking Form (Expands when slot selected) */}
        {showBookingForm && selectedSlot && (
          <View style={styles.bookingFormCard}>
            <View style={styles.formHeader}>
              <Sparkles size={18} color="#F5A623" />
              <Text style={styles.formTitle}>Request for {selectedSlot.date}</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Event Type</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Pub Weekend Gig, Wedding Cocktail, Private Party"
                placeholderTextColor="#475569"
                value={eventType}
                onChangeText={setEventType}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Venue Location / Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Heart Cup Coffee, Jubilee Hills"
                placeholderTextColor="#475569"
                value={eventLocation}
                onChangeText={setEventLocation}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Special Requirements or Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Any sound engineer questions, set timings, or theme details..."
                placeholderTextColor="#475569"
                multiline
                numberOfLines={3}
                value={notes}
                onChangeText={setNotes}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleBookingSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#0B0D13" />
              ) : (
                <Text style={styles.submitButtonText}>
                  Send Booking Request (₹{artist.baseFee.toLocaleString('en-IN')})
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  backButton: {
    padding: 6
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  scrollContent: {
    padding: 16,
    gap: 20
  },
  heroCard: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 12
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  categoryPill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8
  },
  categoryPillText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600'
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064E3B',
    borderColor: '#059669',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5
  },
  verifiedBadgeText: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700'
  },
  heroArtistName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  locationText: {
    color: '#94A3B8',
    fontSize: 14
  },
  feeCard: {
    backgroundColor: '#1A1813',
    borderColor: '#451A03',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    gap: 4
  },
  feeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  guaranteeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064E3B',
    borderColor: '#059669',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4
  },
  guaranteeTagText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '700'
  },
  feeCardLabel: {
    color: '#F5A623',
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600'
  },
  feeCardAmount: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 2
  },
  feeCardSubtext: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2
  },
  section: {
    gap: 10
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  subtext: {
    color: '#64748B',
    fontSize: 13
  },
  genresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  genreBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  genreBadgeText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '500'
  },
  bioText: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 22
  },
  requirementsBox: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14
  },
  requirementsText: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 20
  },
  linksRow: {
    flexDirection: 'row',
    gap: 12
  },
  socialLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8
  },
  socialLinkText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600'
  },
  noSlotsText: {
    color: '#64748B',
    fontSize: 14
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  slotPill: {
    width: '48%',
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4
  },
  slotPillBooked: {
    opacity: 0.4,
    backgroundColor: '#0F131C'
  },
  slotPillSelected: {
    borderColor: '#F5A623',
    backgroundColor: '#261C10'
  },
  slotPillDate: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700'
  },
  slotPillTime: {
    color: '#94A3B8',
    fontSize: 11
  },
  slotPillDateBooked: {
    color: '#64748B'
  },
  slotPillTextSelected: {
    color: '#F5A623'
  },
  slotPillStatus: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4
  },
  statusOpen: {
    color: '#10B981'
  },
  statusBooked: {
    color: '#EF4444'
  },
  bookingFormCard: {
    backgroundColor: '#17120E',
    borderColor: '#451A03',
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 14,
    marginTop: 8
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F5A623'
  },
  inputGroup: {
    gap: 6
  },
  label: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600'
  },
  input: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14
  },
  textArea: {
    height: 70,
    textAlignVertical: 'top'
  },
  submitButton: {
    backgroundColor: '#F5A623',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8
  },
  submitButtonDisabled: {
    opacity: 0.6
  },
  submitButtonText: {
    color: '#0B0D13',
    fontSize: 15,
    fontWeight: '700'
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3B270C',
    borderColor: '#F5A623',
    borderWidth: 1,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8
  },
  ratingBadgeText: {
    color: '#F5A623',
    fontSize: 12,
    fontWeight: '700'
  },
  reviewsList: {
    gap: 12,
    marginTop: 8
  },
  reviewCard: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10
  },
  reviewCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10
  },
  reviewerName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700'
  },
  reviewerCity: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2
  },
  reviewStarsRow: {
    flexDirection: 'row',
    gap: 2
  },
  reviewComment: {
    color: '#E2E8F0',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18
  },
  reviewTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  reviewTagBadge: {
    backgroundColor: '#0B0D13',
    borderColor: '#334155',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  reviewTagBadgeText: {
    color: '#F5A623',
    fontSize: 11,
    fontWeight: '600'
  },
  emptyReviewsCard: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 6,
    marginTop: 8
  },
  emptyReviewsTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700'
  },
  emptyReviewsText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center'
  }
});

export default ArtistDetailScreen;
