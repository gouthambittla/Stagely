import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldCheck,
  ShieldX,
  MapPin,
  ExternalLink,
  RefreshCw,
  LogOut,
  Sparkles
} from 'lucide-react-native';

export const AdminVerificationScreen: React.FC = () => {
  const { logout } = useAuth();
  const [pendingArtists, setPendingArtists] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const fetchPending = async () => {
    try {
      const res = await api.getPendingArtists();
      setPendingArtists(res.pendingArtists || []);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to fetch pending applications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleVerify = async (artistId: number, status: 'VERIFIED' | 'REJECTED') => {
    setProcessingId(artistId);
    try {
      await api.verifyArtist(artistId, status);
      Alert.alert(
        'Artist Updated',
        `Artist has been ${status === 'VERIFIED' ? 'approved and made live' : 'rejected'}.`
      );
      fetchPending();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Verification update failed');
    } finally {
      setProcessingId(null);
    }
  };

  const renderArtistApplication = ({ item }: { item: any }) => {
    const isProcessing = processingId === item.id;
    const genres: string[] =
      typeof item.genres === 'string' ? JSON.parse(item.genres) : item.genres || [];

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.artistName}>{item.artistName}</Text>
            <Text style={styles.category}>{item.category} • {item.location}</Text>
          </View>
          <View style={styles.pendingTag}>
            <Text style={styles.pendingTagText}>PENDING</Text>
          </View>
        </View>

        <View style={styles.feeRow}>
          <Text style={styles.feeLabel}>Stated Performance Fee:</Text>
          <Text style={styles.feeAmount}>₹{item.baseFee?.toLocaleString('en-IN')}</Text>
        </View>

        {genres.length > 0 && (
          <View style={styles.genresRow}>
            {genres.map((g, idx) => (
              <View key={idx} style={styles.genrePill}>
                <Text style={styles.genreText}>{g}</Text>
              </View>
            ))}
          </View>
        )}

        {item.bio ? <Text style={styles.bioText}>{item.bio}</Text> : null}

        {item.requirements ? (
          <View style={styles.reqBox}>
            <Text style={styles.reqTitle}>Technical Rider:</Text>
            <Text style={styles.reqText}>{item.requirements}</Text>
          </View>
        ) : null}

        {/* Media Verification Links */}
        <View style={styles.linksRow}>
          {item.youtubeUrl ? (
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => Linking.openURL(item.youtubeUrl)}
            >
              <ExternalLink size={14} color="#F5A623" />
              <Text style={styles.linkButtonText}>YouTube Reel</Text>
            </TouchableOpacity>
          ) : null}

          {item.instagramUrl ? (
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => Linking.openURL(item.instagramUrl)}
            >
              <ExternalLink size={14} color="#F5A623" />
              <Text style={styles.linkButtonText}>Instagram</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={() => handleVerify(item.id, 'REJECTED')}
            disabled={isProcessing}
          >
            <ShieldX size={16} color="#F87171" />
            <Text style={styles.rejectText}>Reject</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton]}
            onPress={() => handleVerify(item.id, 'VERIFIED')}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#0B0D13" />
            ) : (
              <>
                <ShieldCheck size={16} color="#0B0D13" />
                <Text style={styles.approveText}>Approve & Make Live</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>Admin Verification</Text>
          <Text style={styles.screenSubtitle}>Curate & vet performing artists</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <LogOut size={16} color="#EF4444" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      ) : pendingArtists.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Sparkles size={40} color="#10B981" />
          <Text style={styles.emptyHeading}>All Caught Up!</Text>
          <Text style={styles.emptySubtitle}>
            There are no pending artist verification applications at this moment.
          </Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={fetchPending}>
            <RefreshCw size={16} color="#0B0D13" />
            <Text style={styles.refreshBtnText}>Check Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={pendingArtists}
          keyExtractor={item => item.id.toString()}
          renderItem={renderArtistApplication}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchPending();
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
  artistName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  category: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2
  },
  pendingTag: {
    backgroundColor: '#451A03',
    borderColor: '#78350F',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  pendingTagText: {
    color: '#F5A623',
    fontSize: 11,
    fontWeight: '700'
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  feeLabel: {
    color: '#94A3B8',
    fontSize: 13
  },
  feeAmount: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800'
  },
  genresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  genrePill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  genreText: {
    color: '#CBD5E1',
    fontSize: 12
  },
  bioText: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18
  },
  reqBox: {
    backgroundColor: '#0B0D13',
    padding: 10,
    borderRadius: 8,
    gap: 4
  },
  reqTitle: {
    color: '#F5A623',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  reqText: {
    color: '#CBD5E1',
    fontSize: 12
  },
  linksRow: {
    flexDirection: 'row',
    gap: 10
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C150A',
    borderColor: '#78350F',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6
  },
  linkButtonText: {
    color: '#F5A623',
    fontSize: 12,
    fontWeight: '600'
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6
  },
  actionButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6
  },
  approveButton: {
    backgroundColor: '#F5A623'
  },
  approveText: {
    color: '#0B0D13',
    fontSize: 13,
    fontWeight: '700'
  },
  rejectButton: {
    backgroundColor: '#260F0F',
    borderColor: '#7F1D1D',
    borderWidth: 1
  },
  rejectText: {
    color: '#F87171',
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
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  emptySubtitle: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5A623',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    marginTop: 10
  },
  refreshBtnText: {
    color: '#0B0D13',
    fontSize: 14,
    fontWeight: '700'
  }
});

export default AdminVerificationScreen;
