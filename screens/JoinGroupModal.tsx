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

type JoinGroupModalProps = {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onJoined: () => void;
};

export function JoinGroupModal({ visible, userId, onClose, onJoined }: JoinGroupModalProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);

    try {
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('id, name')
        .eq('invite_code', trimmed)
        .maybeSingle();

      if (groupError) throw groupError;
      if (!group) {
        Alert.alert('Invalid code', 'No group found with this invite code.');
        return;
      }

      const { data: existing, error: existingError } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', group.id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing) {
        Alert.alert('Already a member', `You are already in the group "${group.name}".`);
        onJoined();
        onClose();
        return;
      }

      const { error: memberError } = await supabase
        .from('group_members')
        .insert({
          group_id: group.id,
          user_id: userId,
          role: 'member',
        });

      if (memberError) throw memberError;

      Alert.alert('Joined', `Successfully joined "${group.name}".`);
      setCode('');
      onJoined();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Join Group</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Invite Code</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="e.g. AB1234"
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
              {loading ? <ActivityIndicator color={COLORS.textInverse} /> : <Text style={styles.joinButtonText}>Join Group</Text>}
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
