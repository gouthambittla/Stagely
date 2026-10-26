import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Calendar, Save, Check } from 'lucide-react-native';

export const ScheduleManagerScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const generateNext15Days = () => {
    const days = [];
    const today = new Date();
    const existingSlots: any[] = user?.artistProfile?.availabilitySlots || [];

    for (let i = 1; i <= 15; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const match = existingSlots.find(s => s.date === dateStr);

      days.push({
        date: dateStr,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        formattedDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        isOpen: match ? !match.isBooked : d.getDay() === 0 || d.getDay() === 6,
        isBooked: match ? match.isBooked : false,
        startTime: match ? match.startTime : '20:00',
        endTime: match ? match.endTime : '23:00'
      });
    }
    return days;
  };

  const [days, setDays] = useState(generateNext15Days());

  const toggleDay = (idx: number) => {
    if (days[idx].isBooked) {
      Alert.alert('Slot Already Booked', 'This date has an accepted booking and cannot be closed.');
      return;
    }
    const copy = [...days];
    copy[idx].isOpen = !copy[idx].isOpen;
    setDays(copy);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const activeSlots = days
        .filter(d => d.isOpen && !d.isBooked)
        .map(d => ({
          date: d.date,
          startTime: d.startTime,
          endTime: d.endTime
        }));

      await api.updateSchedule(activeSlots);
      await refreshUser();
      Alert.alert('Saved!', 'Your 15-day availability has been updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update calendar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>15-Day Schedule Manager</Text>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#0B0D13" />
          ) : (
            <Text style={styles.saveBtnText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.helperText}>
          Tap on dates to toggle between Open for Bookings and Closed. Booked performance slots are locked.
        </Text>

        <View style={styles.grid}>
          {days.map((day, idx) => (
            <TouchableOpacity
              key={day.date}
              style={[
                styles.dayCard,
                day.isOpen && styles.dayCardOpen,
                day.isBooked && styles.dayCardBooked
              ]}
              onPress={() => toggleDay(idx)}
              activeOpacity={0.8}
            >
              <Text style={styles.dayName}>{day.dayName}</Text>
              <Text style={[styles.dayDate, day.isOpen && styles.textGold]}>
                {day.formattedDate}
              </Text>
              <View
                style={[
                  styles.pill,
                  day.isBooked
                    ? styles.pillBooked
                    : day.isOpen
                    ? styles.pillOpen
                    : styles.pillClosed
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    day.isBooked
                      ? styles.pillTextBooked
                      : day.isOpen
                      ? styles.pillTextOpen
                      : styles.pillTextClosed
                  ]}
                >
                  {day.isBooked ? 'Booked' : day.isOpen ? 'Open' : 'Closed'}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
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
  backBtn: {
    padding: 6
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  saveBtn: {
    backgroundColor: '#F5A623',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8
  },
  saveBtnText: {
    color: '#0B0D13',
    fontSize: 13,
    fontWeight: '700'
  },
  content: {
    padding: 16,
    gap: 16
  },
  helperText: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  dayCard: {
    width: '31%',
    backgroundColor: '#131722',
    borderColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4
  },
  dayCardOpen: {
    backgroundColor: '#1C160B',
    borderColor: '#F5A623'
  },
  dayCardBooked: {
    backgroundColor: '#260D0D',
    borderColor: '#7F1D1D'
  },
  dayName: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  dayDate: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '700'
  },
  textGold: {
    color: '#FFFFFF'
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4
  },
  pillOpen: {
    backgroundColor: '#451A03'
  },
  pillClosed: {
    backgroundColor: '#1E293B'
  },
  pillBooked: {
    backgroundColor: '#450A0A'
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700'
  },
  pillTextOpen: {
    color: '#F5A623'
  },
  pillTextClosed: {
    color: '#64748B'
  },
  pillTextBooked: {
    color: '#F87171'
  }
});

export default ScheduleManagerScreen;
