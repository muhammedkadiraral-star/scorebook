import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS, RADIUS, SIZES, SPACING } from '../constants/theme';
import { getGameDisplayName, getGameEmoji } from '../constants/games';

type CreateGroupScreenProps = {
  userId: string;
  gameType: string;
  onBack: () => void;
  onCreated: () => void;
};

export function CreateGroupScreen({ userId, gameType, onBack, onCreated }: CreateGroupScreenProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);

    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const { data, error } = await supabase
        .from('groups')
        .insert({
          name: name.trim(),
          game_type: gameType,
          invite_code: code,
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;

      const { error: memberError } = await supabase
        .from('group_members')
        .insert({
          group_id: data.id,
          user_id: userId,
          role: 'admin',
        });

      if (memberError) throw memberError;

      setInviteCode(code);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create group.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  const gameName = getGameDisplayName(gameType);
  const emoji = getGameEmoji(gameType);

  if (inviteCode) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContent}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={80} color={COLORS.success} />
          </View>
          <Text style={styles.successTitle}>Group Created!</Text>
          <Text style={styles.successSubtitle}>Share this code with your friends so they can join your group.</Text>
          
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>INVITE CODE</Text>
            <Text style={styles.codeValue}>{inviteCode}</Text>
          </View>

          <Pressable style={styles.doneButton} onPress={onBack}>
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Create Group</Text>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.content}>
        <View style={styles.selectedGameCard}>
          <View style={styles.gameIconContainer}>
            <Text style={styles.gameEmoji}>{emoji}</Text>
          </View>
          <View style={styles.gameInfo}>
            <Text style={styles.gameLabel}>Selected Game</Text>
            <Text style={styles.gameNameText}>{gameName}</Text>
          </View>
          <Ionicons name="lock-closed" size={20} color={COLORS.textMuted} />
        </View>

        <Text style={styles.inputLabel}>Group Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Weekend FIFA League"
          placeholderTextColor={COLORS.textMuted}
          value={name}
          onChangeText={setName}
          autoFocus
        />

        <View style={styles.spacer} />

        <Pressable
          style={[styles.createButton, (!name.trim() || loading) && styles.disabledButton]}
          onPress={handleCreate}
          disabled={!name.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.createButtonText}>Create Group</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  content: {
    flex: 1,
    padding: SPACING.screenPadding,
  },
  selectedGameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: 16,
    marginBottom: 24,
  },
  gameIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  gameEmoji: {
    fontSize: 24,
  },
  gameInfo: {
    flex: 1,
  },
  gameLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  gameNameText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  input: {
    height: 52,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    paddingHorizontal: 16,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  spacer: {
    flex: 1,
  },
  createButton: {
    height: 52,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: COLORS.textMuted,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  successContent: {
    flex: 1,
    padding: SPACING.screenPadding,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIcon: {
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  successSubtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 40,
  },
  codeCard: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: 24,
    alignItems: 'center',
    marginBottom: 40,
  },
  codeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  codeValue: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 4,
  },
  doneButton: {
    width: '100%',
    height: 52,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
