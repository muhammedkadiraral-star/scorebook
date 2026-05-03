import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS, RADIUS, SIZES, SPACING } from '../constants/theme';
import { getGameDisplayName, getGameEmoji } from '../constants/games';

type CreateTournamentScreenProps = {
  userId: string;
  gameType: string;
  onBack: () => void;
  onCreated: () => void;
};

export function CreateTournamentScreen({ userId, gameType, onBack, onCreated }: CreateTournamentScreenProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [format, setFormat] = useState<'knockout' | 'league'>('knockout');
  const [maxParticipants, setMaxParticipants] = useState(8);
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const knockoutOptions = [4, 8, 16];
  const leagueOptions = [3, 4, 5, 6, 8, 10];
  const participantsOptions = format === 'knockout' ? knockoutOptions : leagueOptions;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);

    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const { data, error } = await supabase
        .from('tournaments')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          rules: rules.trim() || null,
          game_type: gameType,
          format: format,
          max_participants: maxParticipants,
          is_public: isPublic,
          status: 'open',
          invite_code: code,
          created_by: userId,
          start_date: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Automatically join as participant
      const { error: partError } = await supabase
        .from('tournament_participants')
        .insert({
          tournament_id: data.id,
          user_id: userId,
          seed: 1,
        });

      if (partError) throw partError;

      setInviteCode(code);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create tournament.';
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
            <Ionicons name="trophy" size={80} color={COLORS.warning} />
          </View>
          <Text style={styles.successTitle}>Tournament Created!</Text>
          <Text style={styles.successSubtitle}>Share this code with your friends so they can join your tournament.</Text>
          
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>INVITE CODE</Text>
            <Text style={styles.codeValue}>{inviteCode}</Text>
          </View>

          <Pressable style={styles.doneButton} onPress={onCreated}>
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
        <Text style={styles.headerTitle}>Create Tournament</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} indicatorStyle="white">
        {/* Selected Game */}
        <Text style={styles.smallLabel}>Selected game</Text>
        <View style={styles.selectedGameCard}>
          <View style={styles.gameIconContainer}>
            <Text style={styles.gameEmoji}>{emoji}</Text>
          </View>
          <View style={styles.gameInfo}>
            <Text style={styles.gameNameText}>{gameName}</Text>
          </View>
          <Ionicons name="lock-closed" size={20} color={COLORS.textMuted} />
        </View>

        {/* Name */}
        <Text style={styles.inputLabel}>Tournament Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Saturday FIFA Cup"
          placeholderTextColor={COLORS.textMuted}
          value={name}
          onChangeText={setName}
        />

        {/* Description */}
        <Text style={styles.inputLabel}>Description (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Describe your tournament..."
          placeholderTextColor={COLORS.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        {/* Format Selection */}
        <Text style={styles.inputLabel}>Tournament Format</Text>
        <View style={styles.formatRow}>
          <Pressable 
            style={[styles.formatCard, format === 'knockout' && styles.formatCardActive]}
            onPress={() => {
              setFormat('knockout');
              if (!knockoutOptions.includes(maxParticipants)) setMaxParticipants(8);
            }}
          >
            <Text style={styles.formatIcon}>🏆</Text>
            <Text style={styles.formatTitle}>Knockout</Text>
            <Text style={styles.formatSubtitle}>Single elimination bracket</Text>
          </Pressable>
          <Pressable 
            style={[styles.formatCard, format === 'league' && styles.formatCardActive]}
            onPress={() => {
              setFormat('league');
              if (!leagueOptions.includes(maxParticipants)) setMaxParticipants(6);
            }}
          >
            <Text style={styles.formatIcon}>📊</Text>
            <Text style={styles.formatTitle}>League</Text>
            <Text style={styles.formatSubtitle}>Everyone plays everyone</Text>
          </Pressable>
        </View>

        {/* Max Participants */}
        <Text style={styles.inputLabel}>Max Participants</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.participantsRow}>
          {participantsOptions.map((num) => (
            <Pressable
              key={num}
              style={[styles.pill, maxParticipants === num && styles.pillActive]}
              onPress={() => setMaxParticipants(num)}
            >
              <Text style={[styles.pillText, maxParticipants === num && styles.pillTextActive]}>
                {num} Players
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Visibility */}
        <Text style={styles.inputLabel}>Visibility</Text>
        <View style={styles.segmentedControl}>
          <Pressable 
            style={[styles.segment, isPublic && styles.segmentActive]} 
            onPress={() => setIsPublic(true)}
          >
            <Text style={[styles.segmentText, isPublic && styles.segmentTextActive]}>Public 🌍</Text>
          </Pressable>
          <Pressable 
            style={[styles.segment, !isPublic && styles.segmentActive]} 
            onPress={() => setIsPublic(false)}
          >
            <Text style={[styles.segmentText, !isPublic && styles.segmentTextActive]}>Private 🔒</Text>
          </Pressable>
        </View>
        <Text style={styles.hintText}>
          {isPublic ? 'Anyone can find and join this tournament' : 'Only people with invite code can join'}
        </Text>

        {/* Rules */}
        <Text style={styles.inputLabel}>Rules (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="e.g. Extra time will be played, penalty shootout if needed..."
          placeholderTextColor={COLORS.textMuted}
          value={rules}
          onChangeText={setRules}
          multiline
          numberOfLines={3}
        />

        <View style={styles.spacer} />

        <Pressable
          style={[styles.createButton, (!name.trim() || loading) && styles.disabledButton]}
          onPress={handleCreate}
          disabled={!name.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.textInverse} />
          ) : (
            <Text style={styles.createButtonText}>Create Tournament</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  headerButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary },
  content: { padding: SPACING.screenPadding },
  smallLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 },
  selectedGameCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: RADIUS.card, padding: 16, marginBottom: 24 },
  gameIconContainer: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  gameEmoji: { fontSize: 20 },
  gameInfo: { flex: 1 },
  gameNameText: { fontSize: 17, fontWeight: '600', color: COLORS.textPrimary },
  inputLabel: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 8, marginTop: 20 },
  input: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.input, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: COLORS.textPrimary },
  textArea: { height: 100, textAlignVertical: 'top' },
  formatRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  formatCard: { flex: 1, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  formatCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryMuted },
  formatIcon: { fontSize: 24, marginBottom: 8 },
  formatTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 },
  formatSubtitle: { fontSize: 12, color: COLORS.textSecondary },
  participantsRow: { gap: 8, marginTop: 4 },
  pill: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface },
  pillActive: { backgroundColor: COLORS.primary },
  pillText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  pillTextActive: { color: COLORS.textInverse },
  segmentedControl: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 12, padding: 4, marginTop: 4 },
  segment: { flex: 1, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: COLORS.cardHover, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 2 },
  segmentText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  segmentTextActive: { color: COLORS.primary },
  hintText: { fontSize: 12, color: COLORS.textSecondary, marginTop: 8 },
  spacer: { height: 60 },
  createButton: { height: 56, backgroundColor: COLORS.primary, borderRadius: RADIUS.button, justifyContent: 'center', alignItems: 'center', marginBottom: 40 },
  disabledButton: { backgroundColor: COLORS.textMuted },
  createButtonText: { color: COLORS.textInverse, fontSize: 17, fontWeight: '700' },
  successContent: { flex: 1, padding: SPACING.screenPadding, alignItems: 'center', justifyContent: 'center' },
  successIcon: { marginBottom: 24 },
  successTitle: { fontSize: 28, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12 },
  successSubtitle: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 40 },
  codeCard: { width: '100%', backgroundColor: COLORS.surface, borderRadius: RADIUS.card, padding: 24, alignItems: 'center', marginBottom: 40 },
  codeLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1, marginBottom: 12 },
  codeValue: { fontSize: 40, fontWeight: '800', color: COLORS.primary, letterSpacing: 4 },
  doneButton: { width: '100%', height: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.button, justifyContent: 'center', alignItems: 'center' },
  doneButtonText: { color: COLORS.textInverse, fontSize: 16, fontWeight: '700' },
});
