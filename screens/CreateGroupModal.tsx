import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';

type CreateGroupModalProps = {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
};

const GAME_TYPES = ['FIFA', 'PES', 'Other'] as const;

const generateInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

export function CreateGroupModal({ visible, userId, onClose, onCreated }: CreateGroupModalProps) {
  const [groupName, setGroupName] = useState('');
  const [gameType, setGameType] = useState<(typeof GAME_TYPES)[number]>('FIFA');
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setGroupName('');
      setGameType('FIFA');
      setInviteCode(null);
      setLoading(false);
    }
  }, [visible]);

  const handleCreate = async () => {
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      Alert.alert('Missing name', 'Please enter a group name.');
      return;
    }

    setLoading(true);
    try {
      const nextInviteCode = generateInviteCode();
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: trimmedName,
          game_type: gameType,
          invite_code: nextInviteCode,
        })
        .select('id, invite_code')
        .single();

      if (groupError) {
        Alert.alert('Debug', JSON.stringify(groupError));
        throw groupError;
      }

      const { error: memberError } = await supabase.from('group_members').insert({
        group_id: groupData.id,
        user_id: userId,
      });

      if (memberError) {
        Alert.alert('Debug', JSON.stringify(memberError));
        throw memberError;
      }

      setInviteCode(groupData.invite_code ?? nextInviteCode);
      await onCreated();
    } catch (error) {
      Alert.alert('Debug', JSON.stringify(error));
      const message = error instanceof Error ? error.message : 'Could not create group.';
      Alert.alert('Create group error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {inviteCode ? (
            <>
              <Text style={styles.title}>Group Created</Text>
              <Text style={styles.helperText}>Share this invite code with friends:</Text>
              <Text style={styles.codeText}>{inviteCode}</Text>
              <Pressable style={styles.primaryButton} onPress={onClose}>
                <Text style={styles.primaryButtonText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Create New Group</Text>
              <TextInput
                value={groupName}
                onChangeText={setGroupName}
                placeholder="Group name"
                style={styles.input}
                placeholderTextColor="#9AA0A6"
              />

              <Text style={styles.fieldLabel}>Game Type</Text>
              <View style={styles.gameTypeRow}>
                {GAME_TYPES.map((type) => (
                  <Pressable
                    key={type}
                    style={[styles.gameChip, gameType === type && styles.gameChipActive]}
                    onPress={() => setGameType(type)}
                  >
                    <Text style={[styles.gameChipText, gameType === type && styles.gameChipTextActive]}>{type}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.buttonRow}>
                <Pressable style={styles.secondaryButton} onPress={onClose} disabled={loading}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={handleCreate} disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Create</Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
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
  helperText: {
    color: '#6F6F76',
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F1F1F',
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 14,
    color: '#6F6F76',
    marginBottom: 8,
  },
  gameTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  gameChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D8D8E5',
  },
  gameChipActive: {
    backgroundColor: '#6C5CE7',
    borderColor: '#6C5CE7',
  },
  gameChipText: {
    color: '#6F6F76',
    fontWeight: '600',
  },
  gameChipTextActive: {
    color: '#FFFFFF',
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
  codeText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#6C5CE7',
    letterSpacing: 3,
    textAlign: 'center',
    marginVertical: 16,
  },
});
