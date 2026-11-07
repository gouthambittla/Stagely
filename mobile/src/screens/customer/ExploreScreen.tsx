import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ArtistFilterParams } from '../../services/api';
import {
  Search,
  MapPin,
  CheckCircle,
  Calendar,
  Sparkles,
  RefreshCw,
  AlertCircle,
  SlidersHorizontal,
  X,
  ShieldCheck
} from 'lucide-react-native';

const CATEGORY_FILTERS = ['All', 'Band', 'Solo Musician', 'Singer', 'DJ', 'Acoustic Duo'];
const GENRE_OPTIONS = ['Telugu Rock', 'Bollywood', 'Acoustic', 'Sufi', 'Pop', 'Fusion', 'Indie'];

type BudgetTierKey = 'ALL' | 'UNDER_20K' | '20K_40K' | '40K_70K' | 'ABOVE_70K';

interface BudgetTier {
  key: BudgetTierKey;
  label: string;
  minFee?: number;
  maxFee?: number;
}

const BUDGET_TIERS: BudgetTier[] = [
  { key: 'ALL', label: 'All Budgets' },
  { key: 'UNDER_20K', label: '< ₹20K', maxFee: 20000 },
  { key: '20K_40K', label: '₹20K–₹40K', minFee: 20000, maxFee: 40000 },
  { key: '40K_70K', label: '₹40K–₹70K', minFee: 40000, maxFee: 70000 },
  { key: 'ABOVE_70K', label: '₹70K+', minFee: 70000 }
];

function getNext15Days(): { dateStr: string; displayLabel: string; dayName: string }[] {
  const days: { dateStr: string; displayLabel: string; dayName: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 15; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString('en-US', { weekday: 'short' });
    const displayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    days.push({ dateStr, displayLabel, dayName });
  }
  return days;
}

interface ExploreScreenProps {
  onSelectArtist: (artist: any) => void;
  initialArtists?: any[];
}

export const ExploreScreen: React.FC<ExploreScreenProps> = ({ onSelectArtist, initialArtists }) => {
  const [artists, setArtists] = useState<any[]>(initialArtists || []);
  const [loading, setLoading] = useState<boolean>(!initialArtists);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Filter Modal State
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedBudgetTier, setSelectedBudgetTier] = useState<BudgetTierKey>('ALL');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  // Draft Filter State while modal is open
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [draftBudgetTier, setDraftBudgetTier] = useState<BudgetTierKey>('ALL');
  const [draftGenres, setDraftGenres] = useState<string[]>([]);

  const fifteenDays = useMemo(() => getNext15Days(), []);

  // Compute active filters count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedDate) count++;
    if (selectedBudgetTier !== 'ALL') count++;
    if (selectedGenres.length > 0) count++;
    return count;
  }, [selectedDate, selectedBudgetTier, selectedGenres]);

  const fetchArtists = useCallback(async () => {
    setError(null);
    try {
      const categoryParam = selectedCategory !== 'All' ? selectedCategory : undefined;
      const budgetTier = BUDGET_TIERS.find(t => t.key === selectedBudgetTier);

      const params: ArtistFilterParams = {
        location: 'Hyderabad',
        category: categoryParam,
        search: searchQuery.trim() || undefined,
        date: selectedDate || undefined,
        minFee: budgetTier?.minFee,
        maxFee: budgetTier?.maxFee,
        genres: selectedGenres.length > 0 ? selectedGenres.join(',') : undefined
      };

      const res = await api.getArtists(params);
      setArtists(res.artists);
    } catch (err: any) {
      setError(err.message || 'Unable to load artists. Please check network.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory, searchQuery, selectedDate, selectedBudgetTier, selectedGenres]);

  useEffect(() => {
    if (!initialArtists) {
      fetchArtists();
    }
  }, [fetchArtists]);

  const onSearchSubmit = () => {
    fetchArtists();
  };

  const openFilterModal = () => {
    setDraftDate(selectedDate);
    setDraftBudgetTier(selectedBudgetTier);
    setDraftGenres([...selectedGenres]);
    setIsFilterModalOpen(true);
  };

  const applyFilters = () => {
    setSelectedDate(draftDate);
    setSelectedBudgetTier(draftBudgetTier);
    setSelectedGenres([...draftGenres]);
    setIsFilterModalOpen(false);
  };

  const clearAllFilters = () => {
    setDraftDate(null);
    setDraftBudgetTier('ALL');
    setDraftGenres([]);
    setSelectedDate(null);
    setSelectedBudgetTier('ALL');
    setSelectedGenres([]);
    setIsFilterModalOpen(false);
  };

  const toggleGenreDraft = (genre: string) => {
    if (draftGenres.includes(genre)) {
      setDraftGenres(draftGenres.filter(g => g !== genre));
    } else {
      setDraftGenres([...draftGenres, genre]);
    }
  };

  const renderArtistCard = ({ item }: { item: any }) => {
    const genres: string[] = typeof item.genres === 'string' ? JSON.parse(item.genres) : item.genres || [];
    const openSlotsCount = item.availabilitySlots ? item.availabilitySlots.filter((s: any) => !s.isBooked).length : 0;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.88}
        onPress={() => onSelectArtist(item)}
      >
        {/* Verified Trust Banner */}
        {item.verificationStatus === 'VERIFIED' && (
          <View style={styles.trustBanner}>
            <ShieldCheck size={14} color="#10B981" />
            <Text style={styles.trustBannerText}>Stagely Verified • Auditioned Live Stage Sound</Text>
          </View>
        )}

        <View style={styles.cardHeader}>
          <View style={styles.titleRow}>
            <Text style={styles.artistName} numberOfLines={1}>
              {item.artistName}
            </Text>
            {item.verificationStatus === 'VERIFIED' && (
              <View style={styles.verifiedBadge}>
                <CheckCircle size={12} color="#10B981" />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            )}
          </View>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{item.category}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <MapPin size={13} color="#64748B" />
            <Text style={styles.metaText}>{item.location}</Text>
          </View>
          <View style={styles.metaItem}>
            <Calendar size={13} color="#F5A623" />
            <Text style={[styles.metaText, { color: '#F5A623', fontWeight: '600' }]}>
              {openSlotsCount} slots available
            </Text>
          </View>
        </View>

        {genres.length > 0 && (
          <View style={styles.genreTagsRow}>
            {genres.slice(0, 4).map((genre, idx) => (
              <View key={idx} style={styles.genreTag}>
                <Text style={styles.genreTagText}>{genre}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.feeLabel}>Standard 2-Hr Fee</Text>
            <Text style={styles.feeAmount}>₹{item.baseFee.toLocaleString('en-IN')}</Text>
          </View>
          <TouchableOpacity
            style={styles.bookButton}
            onPress={() => onSelectArtist(item)}
            activeOpacity={0.85}
          >
            <Text style={styles.bookButtonText}>Book Artist</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Search Header */}
      <View style={styles.header}>
        <View style={styles.locationHeader}>
          <MapPin size={16} color="#F5A623" />
          <Text style={styles.locationTitle}>Hyderabad Live Scene</Text>
        </View>
        <Text style={styles.screenHeading}>Find & Book Artists</Text>

        {/* Search Bar & Filter Button */}
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Search size={18} color="#64748B" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search band name, genre, guitar..."
              placeholderTextColor="#475569"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={onSearchSubmit}
              returnKeyType="search"
            />
          </View>

          <TouchableOpacity
            style={[styles.filterIconButton, activeFilterCount > 0 && styles.filterIconButtonActive]}
            onPress={openFilterModal}
            activeOpacity={0.8}
          >
            <SlidersHorizontal size={18} color={activeFilterCount > 0 ? '#0B0D13' : '#F5A623'} />
            {activeFilterCount > 0 && (
              <View style={styles.badgeIndicator}>
                <Text style={styles.badgeIndicatorText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Category Filter Chips */}
        <View style={styles.filterList}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={CATEGORY_FILTERS}
            keyExtractor={item => item}
            renderItem={({ item }) => {
              const active = selectedCategory === item;
              return (
                <TouchableOpacity
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setSelectedCategory(item)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>

      {/* 4 Screen States */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
          <Text style={styles.centerText}>Loading verified artists in Hyderabad...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <AlertCircle size={40} color="#EF4444" />
          <Text style={styles.errorTitle}>Failed to load catalog</Text>
          <Text style={styles.centerText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchArtists}>
            <RefreshCw size={16} color="#FFFFFF" />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : artists.length === 0 ? (
        <View style={styles.centerContainer}>
          <Sparkles size={40} color="#475569" />
          <Text style={styles.emptyTitle}>No verified artists found</Text>
          <Text style={styles.centerText}>
            No verified acts match your current search and filters in Hyderabad.
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setSearchQuery('');
              setSelectedCategory('All');
              clearAllFilters();
            }}
          >
            <Text style={styles.retryText}>Clear All Filters</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={artists}
          keyExtractor={item => item.id.toString()}
          renderItem={renderArtistCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchArtists();
              }}
              tintColor="#F5A623"
            />
          }
        />
      )}

      {/* Slide-Up Filter Modal */}
      <Modal
        visible={isFilterModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsFilterModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Filter Artists</Text>
                <Text style={styles.modalSubtitle}>Hyderabad Metropolitan Area</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsFilterModalOpen(false)}
                style={styles.closeButton}
              >
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Date Availability Section */}
              <View style={styles.sectionGroup}>
                <View style={styles.sectionHeader}>
                  <Calendar size={16} color="#F5A623" />
                  <Text style={styles.sectionTitle}>Date Availability</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
                  <TouchableOpacity
                    style={[styles.dateChip, !draftDate && styles.dateChipActive]}
                    onPress={() => setDraftDate(null)}
                  >
                    <Text style={[styles.dateChipDay, !draftDate && styles.dateChipTextActive]}>Any</Text>
                    <Text style={[styles.dateChipDate, !draftDate && styles.dateChipTextActive]}>Date</Text>
                  </TouchableOpacity>
                  {fifteenDays.map((day) => {
                    const isSelected = draftDate === day.dateStr;
                    return (
                      <TouchableOpacity
                        key={day.dateStr}
                        style={[styles.dateChip, isSelected && styles.dateChipActive]}
                        onPress={() => setDraftDate(isSelected ? null : day.dateStr)}
                      >
                        <Text style={[styles.dateChipDay, isSelected && styles.dateChipTextActive]}>
                          {day.dayName}
                        </Text>
                        <Text style={[styles.dateChipDate, isSelected && styles.dateChipTextActive]}>
                          {day.displayLabel}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Budget Brackets Section */}
              <View style={styles.sectionGroup}>
                <Text style={styles.sectionTitle}>Budget Range (INR ₹)</Text>
                <View style={styles.chipsWrap}>
                  {BUDGET_TIERS.map((tier) => {
                    const isSelected = draftBudgetTier === tier.key;
                    return (
                      <TouchableOpacity
                        key={tier.key}
                        style={[styles.chip, isSelected && styles.chipActive]}
                        onPress={() => setDraftBudgetTier(tier.key)}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                          {tier.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Genres Section */}
              <View style={styles.sectionGroup}>
                <Text style={styles.sectionTitle}>Genres (Multi-Select)</Text>
                <View style={styles.chipsWrap}>
                  {GENRE_OPTIONS.map((genre) => {
                    const isSelected = draftGenres.includes(genre);
                    return (
                      <TouchableOpacity
                        key={genre}
                        style={[styles.chip, isSelected && styles.chipActive]}
                        onPress={() => toggleGenreDraft(genre)}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                          {genre}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalClearButton}
                onPress={clearAllFilters}
              >
                <Text style={styles.modalClearText}>Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalApplyButton}
                onPress={applyFilters}
              >
                <Text style={styles.modalApplyText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 12
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  locationTitle: {
    color: '#F5A623',
    fontSize: 13,
    fontWeight: '700'
  },
  screenHeading: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    gap: 8
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14
  },
  filterIconButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#131722',
    borderWidth: 1,
    borderColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative'
  },
  filterIconButtonActive: {
    backgroundColor: '#F5A623',
    borderColor: '#F5A623'
  },
  badgeIndicator: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center'
  },
  badgeIndicatorText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800'
  },
  filterList: {
    paddingVertical: 2
  },
  filterChip: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 8
  },
  filterChipActive: {
    backgroundColor: '#3B270C',
    borderColor: '#F5A623'
  },
  filterChipText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600'
  },
  filterChipTextActive: {
    color: '#F5A623',
    fontWeight: '700'
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
  trustBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064E3B22',
    borderColor: '#05966955',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6
  },
  trustBannerText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700'
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  titleRow: {
    flex: 1,
    gap: 6
  },
  artistName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064E3B',
    borderColor: '#059669',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 4,
    alignSelf: 'flex-start'
  },
  verifiedText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700'
  },
  categoryBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8
  },
  categoryBadgeText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600'
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  metaText: {
    color: '#94A3B8',
    fontSize: 13
  },
  genreTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  genreTag: {
    backgroundColor: '#1A1F2E',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  genreTagText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500'
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 12,
    marginTop: 4
  },
  feeLabel: {
    color: '#64748B',
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600'
  },
  feeAmount: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800'
  },
  bookButton: {
    backgroundColor: '#F5A623',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10
  },
  bookButtonText: {
    color: '#0B0D13',
    fontSize: 14,
    fontWeight: '700'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12
  },
  centerText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#EF4444'
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    marginTop: 8
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600'
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end'
  },
  modalContainer: {
    backgroundColor: '#131722',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: '#1E293B'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalBody: {
    padding: 20,
    gap: 20
  },
  sectionGroup: {
    gap: 10
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E2E8F0'
  },
  dateScroll: {
    gap: 8,
    paddingVertical: 4
  },
  dateChip: {
    backgroundColor: '#0B0D13',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    minWidth: 64
  },
  dateChipActive: {
    backgroundColor: '#3B270C',
    borderColor: '#F5A623'
  },
  dateChipDay: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600'
  },
  dateChipDate: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
    marginTop: 2
  },
  dateChipTextActive: {
    color: '#F5A623'
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    backgroundColor: '#0B0D13',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16
  },
  chipActive: {
    backgroundColor: '#3B270C',
    borderColor: '#F5A623'
  },
  chipText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600'
  },
  chipTextActive: {
    color: '#F5A623',
    fontWeight: '700'
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    gap: 12
  },
  modalClearButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalClearText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600'
  },
  modalApplyButton: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F5A623',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalApplyText: {
    color: '#0B0D13',
    fontSize: 15,
    fontWeight: '700'
  }
});

export default ExploreScreen;
