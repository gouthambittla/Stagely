import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../services/api';
import { Search, MapPin, CheckCircle, Calendar, Sparkles, RefreshCw, AlertCircle } from 'lucide-react-native';

const CATEGORY_FILTERS = ['All', 'Band', 'Solo Musician', 'Singer', 'DJ', 'Acoustic Duo'];

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

  const fetchArtists = async () => {
    setError(null);
    try {
      const categoryParam = selectedCategory !== 'All' ? selectedCategory : undefined;
      const res = await api.getArtists({
        location: 'Hyderabad',
        category: categoryParam,
        search: searchQuery.trim() || undefined
      });
      setArtists(res.artists);
    } catch (err: any) {
      setError(err.message || 'Unable to load artists. Please check network.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!initialArtists) {
      fetchArtists();
    }
  }, [selectedCategory]);

  const onSearchSubmit = () => {
    fetchArtists();
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
        <View style={styles.cardHeader}>
          <View style={styles.titleRow}>
            <Text style={styles.artistName} numberOfLines={1}>
              {item.artistName}
            </Text>
            {item.verificationStatus === 'VERIFIED' && (
              <View style={styles.verifiedBadge}>
                <CheckCircle size={13} color="#10B981" />
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
            {genres.slice(0, 3).map((genre, idx) => (
              <View key={idx} style={styles.genreTag}>
                <Text style={styles.genreTagText}>{genre}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.feeLabel}>Starting from</Text>
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

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Search size={18} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search band name, genre, guitar, vocal..."
            placeholderTextColor="#475569"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={onSearchSubmit}
            returnKeyType="search"
          />
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
            No verified {selectedCategory !== 'All' ? selectedCategory : 'artists'} match your search in Hyderabad right now.
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setSearchQuery('');
              setSelectedCategory('All');
            }}
          >
            <Text style={styles.retryText}>Clear Filters</Text>
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
  searchBar: {
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
    paddingVertical: 3,
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
  }
});

export default ExploreScreen;
