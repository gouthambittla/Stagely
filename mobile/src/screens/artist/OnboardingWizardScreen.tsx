import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  Music,
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Youtube,
  Instagram
} from 'lucide-react-native';

const CATEGORIES = ['Band', 'Solo Musician', 'Singer', 'DJ', 'Acoustic Duo', 'Dancer'];
const POPULAR_GENRES = ['Tollywood Retro', 'Fusion Rock', 'Indie Pop', 'Sufi', 'Blues & Jazz', 'Carnatic Progressive', 'Bollywood Live'];

export const OnboardingWizardScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const { refreshUser } = useAuth();
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);

  // Form Fields
  const [artistName, setArtistName] = useState('');
  const [category, setCategory] = useState('Band');
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['Fusion Rock']);
  const [location, setLocation] = useState('Hyderabad');
  const [baseFee, setBaseFee] = useState('25000');
  const [bio, setBio] = useState('');
  const [requirements, setRequirements] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');

  // 15-day availability generator
  const generateInitialSlots = () => {
    const slots = [];
    const today = new Date();
    for (let i = 1; i <= 15; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      // Select weekend dates by default
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      slots.push({
        date: dateStr,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        formattedDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        selected: isWeekend,
        startTime: '20:00',
        endTime: '23:00'
      });
    }
    return slots;
  };

  const [scheduleSlots, setScheduleSlots] = useState(generateInitialSlots());

  const toggleGenre = (genre: string) => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter(g => g !== genre));
    } else {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  const toggleSlot = (index: number) => {
    const copy = [...scheduleSlots];
    copy[index].selected = !copy[index].selected;
    setScheduleSlots(copy);
  };

  const handleSubmit = async () => {
    if (!artistName.trim() || !baseFee.trim()) {
      Alert.alert('Required Fields', 'Please provide your Stage/Band Name and Performance Fee.');
      return;
    }

    setLoading(true);
    try {
      const activeSlots = scheduleSlots
        .filter(s => s.selected)
        .map(s => ({
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime
        }));

      await api.onboardArtist({
        artistName: artistName.trim(),
        category,
        genres: selectedGenres,
        location: location.trim(),
        baseFee: parseInt(baseFee, 10),
        bio: bio.trim(),
        requirements: requirements.trim(),
        youtubeUrl: youtubeUrl.trim(),
        instagramUrl: instagramUrl.trim(),
        availableSlots: activeSlots
      });

      await refreshUser();
      setSubmitted(true);
    } catch (err: any) {
      Alert.alert('Onboarding Error', err.message || 'Failed to submit onboarding profile.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successCard}>
          <View style={styles.shieldIconCircle}>
            <ShieldAlert size={48} color="#F5A623" />
          </View>
          <Text style={styles.successTitle}>Application Submitted!</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>Status: PENDING VERIFICATION</Text>
          </View>
          <Text style={styles.successDescription}>
            Thank you, <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{artistName}</Text>! To guarantee authentic talent and prevent fraud in Hyderabad, our curation team will personally review your profile and contact you within 24 hours.
          </Text>
          <Text style={styles.successSubnote}>
            Once verified, your profile with verified badge and open calendar will go live in the public catalog for venues to book.
          </Text>

          <TouchableOpacity
            style={styles.doneButton}
            onPress={onComplete}
            activeOpacity={0.85}
          >
            <Text style={styles.doneButtonText}>Go to Artist Dashboard</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Artist Setup ({step}/3)</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(step / 3) * 100}%` }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepHeading}>Basic Artist Information</Text>
            <Text style={styles.stepSubheading}>Tell us about your musical persona or band.</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Stage / Band Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Jammers Hyderabad, Deccan Collective"
                placeholderTextColor="#475569"
                value={artistName}
                onChangeText={setArtistName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Primary Category</Text>
              <View style={styles.chipsRow}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, category === cat && styles.chipActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Genres (Select all that apply)</Text>
              <View style={styles.chipsRow}>
                {POPULAR_GENRES.map(genre => {
                  const active = selectedGenres.includes(genre);
                  return (
                    <TouchableOpacity
                      key={genre}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => toggleGenre(genre)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {genre}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Base City *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Hyderabad"
                  placeholderTextColor="#475569"
                  value={location}
                  onChangeText={setLocation}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Standard Fee (₹) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="25000"
                  placeholderTextColor="#475569"
                  keyboardType="numeric"
                  value={baseFee}
                  onChangeText={setBaseFee}
                />
              </View>
            </View>

            <TouchableOpacity style={styles.nextButton} onPress={() => setStep(2)}>
              <Text style={styles.nextButtonText}>Next: Tech & Bio</Text>
              <ArrowRight size={18} color="#0B0D13" />
            </TouchableOpacity>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepHeading}>Stage Requirements & Bio</Text>
            <Text style={styles.stepSubheading}>
              Specify your technical rider so bookers know what sound equipment is required.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bio / Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Briefly describe your musical style, experience, and performance highlights..."
                placeholderTextColor="#475569"
                multiline
                numberOfLines={3}
                value={bio}
                onChangeText={setBio}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Sound & Stage Equipment Requirements</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="e.g. 2 Vocal Mics, 1 Drum Kit, Stereo PA with 2 stage monitors. We bring our own guitars."
                placeholderTextColor="#475569"
                multiline
                numberOfLines={3}
                value={requirements}
                onChangeText={setRequirements}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>YouTube Performance Reel Link</Text>
              <TextInput
                style={styles.input}
                placeholder="https://youtube.com/@yourband"
                placeholderTextColor="#475569"
                autoCapitalize="none"
                value={youtubeUrl}
                onChangeText={setYoutubeUrl}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Instagram Handle</Text>
              <TextInput
                style={styles.input}
                placeholder="https://instagram.com/yourhandle"
                placeholderTextColor="#475569"
                autoCapitalize="none"
                value={instagramUrl}
                onChangeText={setInstagramUrl}
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.backButton} onPress={() => setStep(1)}>
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.nextButton, { flex: 1 }]} onPress={() => setStep(3)}>
                <Text style={styles.nextButtonText}>Next: 15-Day Schedule</Text>
                <ArrowRight size={18} color="#0B0D13" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepHeading}>Rolling 15-Day Availability</Text>
            <Text style={styles.stepSubheading}>
              Select the dates you are available to perform over the next 15 days. Bookers can only request open dates.
            </Text>

            <View style={styles.slotsGrid}>
              {scheduleSlots.map((slot, idx) => (
                <TouchableOpacity
                  key={slot.date}
                  style={[styles.slotCard, slot.selected && styles.slotCardActive]}
                  onPress={() => toggleSlot(idx)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.slotDay, slot.selected && styles.slotTextActive]}>
                    {slot.dayName}
                  </Text>
                  <Text style={[styles.slotDate, slot.selected && styles.slotTextActive]}>
                    {slot.formattedDate}
                  </Text>
                  <View style={[styles.slotStatus, slot.selected && styles.slotStatusActive]}>
                    <Text style={[styles.slotStatusText, slot.selected && styles.slotStatusTextActive]}>
                      {slot.selected ? 'Available' : 'Closed'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.backButton} onPress={() => setStep(2)}>
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextButton, { flex: 1, backgroundColor: '#F5A623' }]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#0B0D13" />
                ) : (
                  <Text style={styles.nextButtonText}>Submit Application</Text>
                )}
              </TouchableOpacity>
            </View>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10
  },
  progressBar: {
    height: 4,
    backgroundColor: '#1E293B',
    borderRadius: 2
  },
  progressFill: {
    height: 4,
    backgroundColor: '#F5A623',
    borderRadius: 2
  },
  scrollContent: {
    padding: 20
  },
  stepContainer: {
    gap: 18
  },
  stepHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  stepSubheading: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
    marginTop: -8,
    marginBottom: 8
  },
  inputGroup: {
    gap: 6
  },
  label: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600'
  },
  input: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top'
  },
  row: {
    flexDirection: 'row',
    gap: 12
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20
  },
  chipActive: {
    backgroundColor: '#3B270C',
    borderColor: '#F5A623'
  },
  chipText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500'
  },
  chipTextActive: {
    color: '#F5A623',
    fontWeight: '700'
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  slotCard: {
    width: '31%',
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    gap: 4
  },
  slotCardActive: {
    backgroundColor: '#1A1813',
    borderColor: '#F5A623'
  },
  slotDay: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  slotDate: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700'
  },
  slotTextActive: {
    color: '#FFFFFF'
  },
  slotStatus: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#1E293B',
    marginTop: 4
  },
  slotStatusActive: {
    backgroundColor: '#451A03'
  },
  slotStatusText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600'
  },
  slotStatusTextActive: {
    color: '#F5A623'
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16
  },
  backButton: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 20,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  backButtonText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600'
  },
  nextButton: {
    backgroundColor: '#F5A623',
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 12
  },
  nextButtonText: {
    color: '#0B0D13',
    fontSize: 15,
    fontWeight: '700'
  },
  successCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16
  },
  shieldIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#3B270C',
    borderColor: '#F5A623',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  statusPill: {
    backgroundColor: '#451A03',
    borderColor: '#78350F',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20
  },
  statusPillText: {
    color: '#F5A623',
    fontSize: 13,
    fontWeight: '700'
  },
  successDescription: {
    color: '#CBD5E1',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22
  },
  successSubnote: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: '90%'
  },
  doneButton: {
    backgroundColor: '#F5A623',
    paddingHorizontal: 28,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    width: '100%'
  },
  doneButtonText: {
    color: '#0B0D13',
    fontSize: 16,
    fontWeight: '700'
  }
});

export default OnboardingWizardScreen;
