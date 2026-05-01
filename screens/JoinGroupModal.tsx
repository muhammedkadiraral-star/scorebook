import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';

type JoinGroupModalProps = {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onJoined: () => Promise<void>;
};

type GroupLookup = {
  id: string;
  name: string;
};

export function JoinGroupModal({ visible, userId, onClose, onJoined }: JoinGroupModalProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      setInviteCode('');
      setLoading(false);
    }
  }, [visible]);

  const handleJoin = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      Alert.alert('Missing code', 'Please enter an invite code.');
      return;
    }

    setLoading(true);
    try {
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .select('id, name')
        .eq('invite_code', code)
        .single();

      if (groupError) throw groupError;

      const typedGroup = groupData as GroupLookup;
      const { error: memberError } = await supabase.from('group_members').insert({
        group_id: typedGroup.id,
        user_id: userId,
      });

      if (memberError) throw memberError;

      await onJoined();
      Alert.alert('Joined group', `You joined "${typedGroup.name}".`);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not join group.';
      Alert.alert('Join group error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.title}>Join with Code</Text>
          <TextInput
            value={inviteCode}
            onChangeText={setInviteCode}
            placeholder="Enter invite code"
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
            placeholderTextColor="#9AA0A6"
          />

          <View style={styles.buttonRow}>
            <Pressable style={styles.secondaryButton} onPress={onClose} disabled={loading}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={handleJoin} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Join</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F1F1F',
    marginBottom: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F1F1F',
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#6C5CE7',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#6C5CE7',
    fontSize: 15,
    fontWeight: '600',
  },
});
