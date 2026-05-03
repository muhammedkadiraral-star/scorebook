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

type JoinGroupRpcResponse = {
  success: boolean;
  already_member?: boolean;
  group_id?: string;
  group_name?: string;
  message?: string;
  error?: string;
};

  const handleJoin = async () => {
    const normalizedCode = code.trim().toUpperCase();

    if (!normalizedCode) {
      Alert.alert('Missing code', 'Please enter an invite code.');
      return;
    }
    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('join_group_by_invite_code', {
        p_invite_code: normalizedCode,
      });

      console.log('join_group_by_invite_code response:', { data, error });

      if (error) {
        console.error('Join group RPC error:', error);
        Alert.alert('Join failed', error.message || 'Could not join group.');
        return;
      }

      if (!data || data.success === false) {
        Alert.alert(
          'Join failed',
          data?.message || 'No group found with this invite code.'
        );
        return;
      }

      if (data.already_member) {
        Alert.alert(
          'Already joined',
          data.message || 'You are already a member of this group.'
        );
      } else {
        Alert.alert(
          'Joined group',
          data.group_name ? `You joined ${data.group_name}.` : 'You joined the group.'
        );
      }

      setCode('');
      onJoined();
      onClose();
    } catch (error: any) {
      console.error('Join group catch block error:', error);
      const message = error?.message || 'Something went wrong.';
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
