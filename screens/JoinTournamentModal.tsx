import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS, RADIUS, SIZES, SPACING } from '../constants/theme';

type JoinTournamentModalProps = {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onJoined: (tournamentId: string, tournamentName: string) => void;
};

export function JoinTournamentModal({ visible, userId, onClose, onJoined }: JoinTournamentModalProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);

    try {
      const { data: tournament, error: tError } = await supabase
        .from('tournaments')
        .select('id, name')
        .eq('invite_code', trimmed)
        .single();

      if (tError || !tournament) {
        Alert.alert('Tournament not found', 'Check the invite code and try again.');
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;

      if (!currentUserId) {
        Alert.alert('Error', 'User not authenticated.');
        setLoading(false);
        return;
      }

      const { error: joinError } = await supabase.from('tournament_participants').insert({
        tournament_id: tournament.id,
        user_id: currentUserId,
        status: 'registered'
      });

      if (joinError) {
        if (joinError.code === '23505') {
          Alert.alert('Already Joined', 'You are already in this tournament.');
          onJoined(tournament.id, tournament.name);
          onClose();
        } else {
          Alert.alert('Error', joinError.message);
        }
      } else {
        Alert.alert('Success', `You have joined "${tournament.name}"!`);
        setCode('');
        onJoined(tournament.id, tournament.name);
        onClose();
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Join Tournament</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Invite Code</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Enter invite code"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.input}
            />

            <Pressable
              style={[styles.joinButton, (!code.trim() || loading) && styles.disabledButton]}
              onPress={handleJoin}
              disabled={!code.trim() || loading}
            >
              {loading ? <ActivityIndicator color={COLORS.textInverse} /> : <Text style={styles.joinButtonText}>Join Tournament</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: -8,
  },
  input: {
    height: 52,
    backgroundColor: COLORS.backgroundSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    paddingHorizontal: 16,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  joinButton: {
    height: 52,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.button,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  disabledButton: {
    backgroundColor: COLORS.textMuted,
  },
  joinButtonText: {
    color: COLORS.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
});
