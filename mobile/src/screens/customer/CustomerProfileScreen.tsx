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
  RefreshControl
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { api, UserProfileResponse } from '../../services/api';
import {
  User as UserIcon,
  MapPin,
  Building,
  Phone,
  Mail,
  Edit3,
  CheckCircle2,
  Calendar,
  LogOut,
  AlertCircle
} from 'lucide-react-native';

export const CustomerProfileScreen: React.FC = () => {
  const { user: authUser, logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<UserProfileResponse | null>(null);

  // Edit Mode State
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formVenueName, setFormVenueName] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formContactPhone, setFormContactPhone] = useState('');

  const fetchProfile = useCallback(async () => {
    try {
      setError(null);
      const res = await api.getProfile();
      setProfileData(res);
      setFormName(res.user.name || '');
      setFormVenueName(res.user.venueName || '');
      setFormCity(res.user.city || '');
      setFormContactPhone(res.user.contactPhone || '');
    } catch (err: any) {
      console.error('Failed to load customer profile:', err);
      setError(err?.message || 'Could not load your profile. Please check connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfile();
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await api.updateProfile({
        name: formName.trim() || undefined,
        venueName: formVenueName.trim() || undefined,
        city: formCity.trim() || undefined,
        contactPhone: formContactPhone.trim() || undefined
      });

      if (profileData) {
        setProfileData({
          ...profileData,
          user: {
            ...profileData.user,
            ...res.user
          }
        });
      }
      setIsEditing(false);
      Alert.alert('Profile Updated', 'Your venue and contact details have been saved.');
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Unable to save profile changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoutPress = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to log out of Stagely?',
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
          <Text style={styles.helperText}>Loading your profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // State 2: Error
  if (error && !profileData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <AlertCircle size={44} color="#EF4444" />
          <Text style={styles.errorTitle}>Failed to load profile</Text>
          <Text style={styles.helperText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchProfile}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const u = profileData?.user;
  const stats = profileData?.stats || { activeBookingsCount: 0, completedBookingsCount: 0 };
  const initials = (u?.name || authUser?.name || 'Customer')
    .split(' ')
    .map(p => p[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F5A623" />}
      >
        {/* Header Avatar & Name */}
        <View style={styles.header}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.headerTextGroup}>
            <Text style={styles.userName}>{u?.name || 'Venue Host'}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>CUSTOMER / EVENT HOST</Text>
            </View>
          </View>
          {!isEditing && (
            <TouchableOpacity
              style={styles.editIconButton}
              onPress={() => setIsEditing(true)}
              activeOpacity={0.8}
            >
              <Edit3 size={18} color="#F5A623" />
            </TouchableOpacity>
          )}
        </View>

        {/* Stats Summary Cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Calendar size={20} color="#F5A623" />
            <Text style={styles.statNumber}>{stats.activeBookingsCount}</Text>
            <Text style={styles.statLabel}>Active Gigs</Text>
          </View>

          <View style={styles.statCard}>
            <CheckCircle2 size={20} color="#10B981" />
            <Text style={styles.statNumber}>{stats.completedBookingsCount}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
        </View>

        {/* Profile Details or Edit Form */}
        {isEditing ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Edit Host Profile</Text>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Vikram Reddy"
                placeholderTextColor="#64748B"
                value={formName}
                onChangeText={setFormName}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Venue / Organization Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Aura Brewery & Kitchen"
                placeholderTextColor="#64748B"
                value={formVenueName}
                onChangeText={setFormVenueName}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Locality / City</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Jubilee Hills, Hyderabad"
                placeholderTextColor="#64748B"
                value={formCity}
                onChangeText={setFormCity}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Event-Day Contact Phone</Text>
              <TextInput
                style={styles.textInput}
                placeholder="+919876543210"
                placeholderTextColor="#64748B"
                keyboardType="phone-pad"
                value={formContactPhone}
                onChangeText={setFormContactPhone}
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setFormName(u?.name || '');
                  setFormVenueName(u?.venueName || '');
                  setFormCity(u?.city || '');
                  setFormContactPhone(u?.contactPhone || '');
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
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Venue & Contact Details</Text>

            <View style={styles.infoRow}>
              <Building size={18} color="#94A3B8" />
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>Primary Venue</Text>
                <Text style={styles.infoValue}>
                  {u?.venueName || 'Not configured (Tap edit to set)'}
                </Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <MapPin size={18} color="#94A3B8" />
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>Locality / Area</Text>
                <Text style={styles.infoValue}>
                  {u?.city || 'Hyderabad (City-wide coverage)'}
                </Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Phone size={18} color="#94A3B8" />
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>Event Coordination Phone</Text>
                <Text style={styles.infoValue}>
                  {u?.contactPhone || u?.phone || 'Not provided'}
                </Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Mail size={18} color="#94A3B8" />
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>Account Login Email</Text>
                <Text style={styles.infoValue}>{u?.email || 'N/A'}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Sign Out Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogoutPress}
          activeOpacity={0.8}
        >
          <LogOut size={18} color="#F87171" />
          <Text style={styles.logoutButtonText}>Sign Out</Text>
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
    padding: 20,
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
    color: '#F87171',
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131722',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    gap: 14
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B270C',
    borderWidth: 1,
    borderColor: '#F5A623',
    justifyContent: 'center',
    alignItems: 'center'
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F5A623'
  },
  headerTextGroup: {
    flex: 1,
    gap: 4
  },
  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  roleBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start'
  },
  roleBadgeText: {
    color: '#F5A623',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  editIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center'
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12
  },
  statCard: {
    flex: 1,
    backgroundColor: '#131722',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 6
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  statLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600'
  },
  card: {
    backgroundColor: '#131722',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    gap: 16
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingBottom: 10
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  infoCol: {
    flex: 1
  },
  infoLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600'
  },
  infoValue: {
    fontSize: 14,
    color: '#E2E8F0',
    fontWeight: '500',
    marginTop: 2
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
    marginTop: 12,
    marginBottom: 20
  },
  logoutButtonText: {
    color: '#F87171',
    fontSize: 15,
    fontWeight: '700'
  }
});

export default CustomerProfileScreen;
