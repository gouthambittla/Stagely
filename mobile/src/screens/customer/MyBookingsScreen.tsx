import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../services/api';
import { Calendar, Clock, MessageSquare, MapPin, Sparkles, AlertCircle, RefreshCw } from 'lucide-react-native';

interface MyBookingsScreenProps {
  onOpenChat: (booking: any) => void;
  onExplore: () => void;
}

export const MyBookingsScreen: React.FC<MyBookingsScreenProps> = ({ onOpenChat, onExplore }) => {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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

  const renderBookingCard = ({ item }: { item: any }) => {
    const statusTheme = getStatusColor(item.status);
    const artist = item.artist || {};
    const slot = item.slot || {};

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
    color: '#94A3B8',
    marginTop: 2
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700'
  },
  detailsBox: {
    backgroundColor: '#0B0D13',
    padding: 12,
    borderRadius: 10,
    gap: 8
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  detailText: {
    color: '#CBD5E1',
    fontSize: 13
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5A623',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6
  },
  chatButtonText: {
    color: '#0B0D13',
    fontSize: 13,
    fontWeight: '700'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12
  },
  loadingText: {
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
  actionButton: {
    backgroundColor: '#F5A623',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8
  },
  actionButtonText: {
    color: '#0B0D13',
    fontSize: 14,
    fontWeight: '700'
  }
});

export default MyBookingsScreen;
