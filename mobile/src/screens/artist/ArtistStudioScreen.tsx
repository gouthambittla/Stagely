import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  SafeAreaView,
  RefreshControl,
  Linking
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { api, ArtistStudioProfileResponse } from '../../services/api';
import {
  Music,
  CheckCircle,
  Clock,
  Calendar,
  Mic2,
  FileText,
  Youtube,
  Instagram,
  Edit3,
  AlertCircle,
  LogOut,
  MapPin,
  ExternalLink,
  ShieldCheck,
  ChevronRight
} from 'lucide-react-native';

const CATEGORY_OPTIONS = ['Band', 'Solo Musician', 'Singer', 'DJ', 'Acoustic Duo'];
const GENRE_OPTIONS = ['Telugu Rock', 'Bollywood', 'Acoustic', 'Sufi', 'Pop', 'Fusion', 'Indie', 'Carnatic Progressive', 'Jazz'];

interface ArtistStudioScreenProps {
  onManageSchedule?: () => void;
}

export const ArtistStudioScreen: React.FC<ArtistStudioScreenProps> = ({ onManageSchedule }) => {
  const { logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studioData, setStudioData] = useState<ArtistStudioProfileResponse | null>(null);

  // Edit Mode State
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formArtistName, setFormArtistName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formBaseFee, setFormBaseFee] = useState('');
  const [formBio, setFormBio] = useState('');
  const [formRequirements, setFormRequirements] = useState('');
  const [formYoutubeUrl, setFormYoutubeUrl] = useState('');
  const [formInstagramUrl, setFormInstagramUrl] = useState('');
  const [formGenres, setFormGenres] = useState<string[]>([]);

  const fetchStudio = useCallback(async () => {
    try {
      setError(null);
      const res = await api.getMyProfile();
      setStudioData(res);

      const p = res.profile;
      setFormArtistName(p.artistName || '');
      setFormCategory(p.category || 'Band');
      setFormBaseFee(p.baseFee ? String(p.baseFee) : '');
      setFormBio(p.bio || '');
      setFormRequirements(p.requirements || '');
      setFormYoutubeUrl(p.youtubeUrl || '');
      setFormInstagramUrl(p.instagramUrl || '');

      const parsedGenres = typeof p.genres === 'string' ? JSON.parse(p.genres) : p.genres || [];
      setFormGenres(Array.isArray(parsedGenres) ? parsedGenres : []);
    } catch (err: any) {
      console.error('Failed to load artist studio profile:', err);
      setError(err?.message || 'Could not load your artist studio. Please check connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStudio();
  }, [fetchStudio]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStudio();
  };

  const handleSave = async () => {
    const feeNum = parseInt(formBaseFee, 10);
    if (isNaN(feeNum) || feeNum < 1000) {
      Alert.alert('Invalid Fee', 'Standard performance fee must be at least ₹1,000.');
      return;
    }

    try {
      setSaving(true);
      const res = await api.updateArtistProfile({
        artistName: formArtistName.trim() || undefined,
        category: formCategory || undefined,
        baseFee: feeNum,
        genres: formGenres,
        bio: formBio.trim() || undefined,
        requirements: formRequirements.trim() || undefined,
        youtubeUrl: formYoutubeUrl.trim() || undefined,
        instagramUrl: formInstagramUrl.trim() || undefined
      });

      setStudioData(res);
      setIsEditing(false);
      Alert.alert('Studio Updated', 'Your stage portfolio and live rider changes are now live.');
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Unable to save studio changes.');
    } finally {
      setSaving(false);
    }
  };

  const toggleGenre = (genre: string) => {
    if (formGenres.includes(genre)) {
      setFormGenres(formGenres.filter(g => g !== genre));
    } else {
      setFormGenres([...formGenres, genre]);
    }
  };

  const handleLogoutPress = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to log out of your Stagely artist account?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout }
      ],
      { cancelable: true }
    );
  };

  // State 1: Loading
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
          <Text style={styles.helperText}>Loading your Artist Studio...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // State 2: Error
  if (error && !studioData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <AlertCircle size={44} color="#EF4444" />
          <Text style={styles.errorTitle}>Failed to load Studio</Text>
          <Text style={styles.helperText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchStudio}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const p = studioData?.profile;
  const stats = studioData?.stats || {
    completedGigsCount: 0,
    upcomingGigsCount: 0,
    pendingRequestsCount: 0
  };

  const genres: string[] = p?.genres
    ? typeof p.genres === 'string'
      ? JSON.parse(p.genres)
      : p.genres
    : [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F5A623" />}
      >
        {/* Header Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.categoryPill}>
              <Text style={styles.categoryPillText}>{p?.category || 'Live Act'}</Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                p?.verificationStatus === 'VERIFIED'
                  ? styles.statusVerified
                  : p?.verificationStatus === 'REJECTED'
                  ? styles.statusRejected
                  : styles.statusPending
              ]}
            >
              {p?.verificationStatus === 'VERIFIED' ? (
                <>
                  <CheckCircle size={13} color="#10B981" />
                  <Text style={styles.statusVerifiedText}>Stagely Verified</Text>
                </>
              ) : p?.verificationStatus === 'REJECTED' ? (
                <>
                  <AlertCircle size={13} color="#EF4444" />
                  <Text style={styles.statusRejectedText}>Audition Incomplete</Text>
                </>
              ) : (
                <>
                  <Clock size={13} color="#F5A623" />
                  <Text style={styles.statusPendingText}>Audition Pending</Text>
                </>
              )}
            </View>
          </View>

          <View style={styles.artistNameRow}>
            <Text style={styles.artistName}>{p?.artistName}</Text>
            {!isEditing && (
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setIsEditing(true)}
                activeOpacity={0.8}
              >
                <Edit3 size={16} color="#F5A623" />
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.locationRow}>
            <MapPin size={14} color="#64748B" />
            <Text style={styles.locationText}>{p?.location || 'Hyderabad'}</Text>
          </View>
        </View>

        {/* Gig Statistics Cards (NO totalEarnings) */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <CheckCircle size={20} color="#10B981" />
            <Text style={styles.statValue}>{stats.completedGigsCount}</Text>
            <Text style={styles.statLabel}>Completed Shows</Text>
          </View>

          <View style={styles.statCard}>
            <Calendar size={20} color="#38BDF8" />
            <Text style={styles.statValue}>{stats.upcomingGigsCount}</Text>
            <Text style={styles.statLabel}>Upcoming Gigs</Text>
          </View>

          <View style={styles.statCard}>
            <Clock size={20} color="#F5A623" />
            <Text style={styles.statValue}>{stats.pendingRequestsCount}</Text>
            <Text style={styles.statLabel}>Pending Requests</Text>
          </View>
        </View>

        {/* Schedule Manager Shortcut */}
        {onManageSchedule && !isEditing && (
          <TouchableOpacity
            style={styles.scheduleShortcutCard}
            onPress={onManageSchedule}
            activeOpacity={0.85}
          >
            <View style={styles.scheduleShortcutLeft}>
              <View style={styles.scheduleIconWrap}>
                <Calendar size={20} color="#F5A623" />
              </View>
              <View>
                <Text style={styles.scheduleShortcutTitle}>15-Day Availability Schedule</Text>
                <Text style={styles.scheduleShortcutSubtitle}>Manage open live performance dates</Text>
              </View>
            </View>
            <ChevronRight size={18} color="#64748B" />
          </TouchableOpacity>
        )}

        {/* Studio Content or Edit Form */}
        {isEditing ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Edit Artist Studio Portfolio</Text>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Artist / Band Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Band or Artist Name"
                placeholderTextColor="#64748B"
                value={formArtistName}
                onChangeText={setFormArtistName}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.chipsWrap}>
                {CATEGORY_OPTIONS.map(cat => {
                  const active = formCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setFormCategory(cat)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Standard 2-Hour Performance Fee (INR ₹)</Text>
              <View style={styles.feeInputWrap}>
                <Text style={styles.currencyPrefix}>₹</Text>
                <TextInput
                  style={[styles.textInput, styles.feeInput]}
                  placeholder="30000"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  value={formBaseFee}
                  onChangeText={setFormBaseFee}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Musical Genres (Select multiple)</Text>
              <View style={styles.chipsWrap}>
                {GENRE_OPTIONS.map(genre => {
                  const active = formGenres.includes(genre);
                  return (
                    <TouchableOpacity
                      key={genre}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => toggleGenre(genre)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{genre}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Sound & Stage Technical Rider</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="e.g. 3 Vocal Mics on stands, 1 Drum Kit mic set, 2 Stage Monitors, Stereo DI box"
                placeholderTextColor="#64748B"
                multiline
                numberOfLines={3}
                value={formRequirements}
                onChangeText={setFormRequirements}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Bio & Stage Experience</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Describe your act, musical influences, and past pub/festival experience..."
                placeholderTextColor="#64748B"
                multiline
                numberOfLines={3}
                value={formBio}
                onChangeText={setFormBio}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>YouTube Live Video Link</Text>
              <TextInput
                style={styles.textInput}
                placeholder="https://youtube.com/@band"
                placeholderTextColor="#64748B"
                value={formYoutubeUrl}
                onChangeText={setFormYoutubeUrl}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Instagram Profile Link</Text>
              <TextInput
                style={styles.textInput}
                placeholder="https://instagram.com/band_official"
                placeholderTextColor="#64748B"
                value={formInstagramUrl}
                onChangeText={setFormInstagramUrl}
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  if (p) {
                    setFormArtistName(p.artistName || '');
                    setFormCategory(p.category || 'Band');
                    setFormBaseFee(p.baseFee ? String(p.baseFee) : '');
                    setFormBio(p.bio || '');
                    setFormRequirements(p.requirements || '');
                    setFormYoutubeUrl(p.youtubeUrl || '');
                    setFormInstagramUrl(p.instagramUrl || '');
                    const parsed = typeof p.genres === 'string' ? JSON.parse(p.genres) : p.genres || [];
                    setFormGenres(Array.isArray(parsed) ? parsed : []);
                  }
                  setIsEditing(false);
                }}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#0F172A" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Studio</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* Live Fee Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Performance Pricing</Text>
              <View style={styles.feeHighlight}>
                <Text style={styles.feeHighlightAmount}>
                  ₹{(p?.baseFee || 0).toLocaleString('en-IN')}
                </Text>
                <Text style={styles.feeHighlightSubtext}>
                  Standard 2-Hour Live Set • Direct settlement with venue
                </Text>
              </View>
            </View>

            {/* Sound & Stage Technical Rider */}
            <View style={styles.card}>
              <View style={styles.cardHeaderWithIcon}>
                <Mic2 size={18} color="#F5A623" />
                <Text style={styles.cardTitle}>Sound & Stage Technical Rider</Text>
              </View>
              <Text style={styles.bodyText}>
                {p?.requirements || 'No stage equipment requirements specified yet.'}
              </Text>
            </View>

            {/* Musical Genres & Bio */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Musical Genres</Text>
              <View style={styles.chipsWrap}>
                {genres.map((genre, idx) => (
                  <View key={idx} style={styles.genreTag}>
                    <Text style={styles.genreTagText}>{genre}</Text>
                  </View>
                ))}
              </View>

              {p?.bio ? (
                <>
                  <Text style={[styles.cardTitle, { marginTop: 12 }]}>About the Band</Text>
                  <Text style={styles.bodyText}>{p.bio}</Text>
                </>
              ) : null}
            </View>

            {/* Performance Video Links */}
            {(p?.youtubeUrl || p?.instagramUrl) && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Live Gig Media</Text>
                <View style={styles.socialButtonsRow}>
                  {p?.youtubeUrl ? (
                    <TouchableOpacity
                      style={styles.socialButton}
                      onPress={() => Linking.openURL(p.youtubeUrl!)}
                    >
                      <Youtube size={18} color="#EF4444" />
                      <Text style={styles.socialButtonText}>Watch on YouTube</Text>
                      <ExternalLink size={14} color="#64748B" />
                    </TouchableOpacity>
                  ) : null}

                  {p?.instagramUrl ? (
                    <TouchableOpacity
                      style={styles.socialButton}
                      onPress={() => Linking.openURL(p.instagramUrl!)}
                    >
                      <Instagram size={18} color="#EC4899" />
                      <Text style={styles.socialButtonText}>Instagram Feed</Text>
                      <ExternalLink size={14} color="#64748B" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            )}
          </>
        )}

        {/* Sign Out Action */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogoutPress}
          activeOpacity={0.8}
        >
          <LogOut size={18} color="#F87171" />
          <Text style={styles.logoutButtonText}>Sign Out of Artist Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0D13'
  },
  scrollContent: {
    padding: 18,
    gap: 16
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12
  },
  helperText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center'
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#EF4444',
    marginTop: 8
  },
  retryButton: {
    backgroundColor: '#F5A623',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12
  },
  retryButtonText: {
    color: '#0B0D13',
    fontWeight: '700',
    fontSize: 14
  },
  heroCard: {
    backgroundColor: '#131722',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    gap: 10
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
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 5
  },
  statusVerified: {
    backgroundColor: '#064E3B',
    borderColor: '#059669',
    borderWidth: 1
  },
  statusVerifiedText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700'
  },
  statusPending: {
    backgroundColor: '#3B270C',
    borderColor: '#F5A623',
    borderWidth: 1
  },
  statusPendingText: {
    color: '#F5A623',
    fontSize: 11,
    fontWeight: '700'
  },
  statusRejected: {
    backgroundColor: '#450A0A',
    borderColor: '#EF4444',
    borderWidth: 1
  },
  statusRejectedText: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: '700'
  },
  artistNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  artistName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6
  },
  editButtonText: {
    color: '#F5A623',
    fontSize: 13,
    fontWeight: '700'
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  locationText: {
    color: '#94A3B8',
    fontSize: 13
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10
  },
  statCard: {
    flex: 1,
    backgroundColor: '#131722',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 4
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  statLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
    textAlign: 'center'
  },
  scheduleShortcutCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#17120E',
    borderWidth: 1,
    borderColor: '#451A03',
    borderRadius: 14,
    padding: 14
  },
  scheduleShortcutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  scheduleIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#261C10',
    justifyContent: 'center',
    alignItems: 'center'
  },
  scheduleShortcutTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700'
  },
  scheduleShortcutSubtitle: {
    color: '#F5A623',
    fontSize: 11,
    marginTop: 2
  },
  card: {
    backgroundColor: '#131722',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    gap: 12
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  cardHeaderWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  bodyText: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 20
  },
  feeHighlight: {
    backgroundColor: '#0B0D13',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    gap: 4
  },
  feeHighlightAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: '#F5A623'
  },
  feeHighlightSubtext: {
    color: '#94A3B8',
    fontSize: 12
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  genreTag: {
    backgroundColor: '#1A1F2E',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8
  },
  genreTagText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500'
  },
  chip: {
    backgroundColor: '#0B0D13',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 12
  },
  chipActive: {
    backgroundColor: '#3B270C',
    borderColor: '#F5A623'
  },
  chipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600'
  },
  chipTextActive: {
    color: '#F5A623',
    fontWeight: '700'
  },
  socialButtonsRow: {
    flexDirection: 'column',
    gap: 10
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0D13',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10
  },
  socialButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1
  },
  formGroup: {
    gap: 6
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8'
  },
  textInput: {
    backgroundColor: '#0B0D13',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14
  },
  feeInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B0D13',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingLeft: 14
  },
  currencyPrefix: {
    color: '#F5A623',
    fontSize: 16,
    fontWeight: '700'
  },
  feeInput: {
    borderWidth: 0,
    flex: 1
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top'
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8
  },
  cancelButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center'
  },
  cancelButtonText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 14
  },
  saveButton: {
    flex: 2,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F5A623',
    justifyContent: 'center',
    alignItems: 'center'
  },
  saveButtonText: {
    color: '#0B0D13',
    fontWeight: '700',
    fontSize: 14
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A1212',
    borderWidth: 1,
    borderColor: '#7F1D1D',
    height: 48,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
    marginBottom: 24
  },
  logoutButtonText: {
    color: '#F87171',
    fontSize: 14,
    fontWeight: '700'
  }
});

export default ArtistStudioScreen;
