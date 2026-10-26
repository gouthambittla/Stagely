import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Send } from 'lucide-react-native';

interface ChatScreenProps {
  booking: any;
  onBack: () => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({ booking, onBack }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);

  const fetchMessages = async () => {
    try {
      const res = await api.getMessages(booking.id);
      setMessages(res.messages || []);
    } catch (err: any) {
      console.warn('Failed to load messages', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 4000); // Poll messages
    return () => clearInterval(interval);
  }, [booking.id]);

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const content = inputText.trim();
    setInputText('');

    // Optimistic UI update
    const tempMessage = {
      id: Date.now(),
      senderId: user?.id,
      content,
      createdAt: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempMessage]);

    setSending(true);
    try {
      await api.sendMessage(booking.id, content);
      fetchMessages();
    } catch (err: any) {
      console.warn('Failed to send message', err.message);
    } finally {
      setSending(false);
    }
  };

  const renderMessageBubble = ({ item }: { item: any }) => {
    const isMe = item.senderId === user?.id;

    return (
      <View style={[styles.bubbleRow, isMe ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
            {item.content}
          </Text>
          <Text style={styles.bubbleTime}>
            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  const title =
    user?.role === 'CUSTOMER'
      ? booking.artist?.artistName || 'Artist'
      : booking.customer?.email || 'Booker';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.headerSubtitle}>Event: {booking.eventType || 'Live Performance'}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#F5A623" />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              Start coordinating sound requirements, set times, and stage directions here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={item => item.id.toString()}
            renderItem={renderMessageBubble}
            contentContainerStyle={styles.messagesList}
          />
        )}

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Type message..."
            placeholderTextColor="#64748B"
            value={inputText}
            onChangeText={setInputText}
          />
          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim()}
          >
            <Send size={18} color="#0B0D13" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94A3B8'
  },
  messagesList: {
    padding: 16,
    gap: 12
  },
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 2
  },
  bubbleRowRight: {
    justifyContent: 'flex-end'
  },
  bubbleRowLeft: {
    justifyContent: 'flex-start'
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16
  },
  bubbleMe: {
    backgroundColor: '#F5A623',
    borderBottomRightRadius: 4
  },
  bubbleThem: {
    backgroundColor: '#1E293B',
    borderBottomLeftRadius: 4
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20
  },
  bubbleTextMe: {
    color: '#0B0D13',
    fontWeight: '500'
  },
  bubbleTextThem: {
    color: '#FFFFFF'
  },
  bubbleTime: {
    fontSize: 10,
    color: '#475569',
    marginTop: 4,
    alignSelf: 'flex-end'
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    backgroundColor: '#131722',
    gap: 10
  },
  input: {
    flex: 1,
    backgroundColor: '#0B0D13',
    color: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 100
  },
  sendButton: {
    backgroundColor: '#F5A623',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  sendButtonDisabled: {
    opacity: 0.4
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
    padding: 32
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18
  }
});

export default ChatScreen;
