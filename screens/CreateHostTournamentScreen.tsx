import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import { COLORS, RADIUS, SPACING } from '../constants/theme';

type CreateHostTournamentScreenProps = {
  userId: string;
  onBack: () => void;
  onCreated: (id: string, name: string) => void;
};

export function CreateHostTournamentScreen({ userId, onBack, onCreated }: CreateHostTournamentScreenProps) {
  const [name, setName] = useState('');
  const [format, setFormat] = useState<'knockout' | 'league'>('league');
  const [players, setPlayers] = useState<string[]>(['', '']);
  const [loading, setLoading] = useState(false);

  // Scoring States
  const [scoringType, setScoringType] = useState<'default' | 'custom'>('default');
  const [winPoints, setWinPoints] = useState('3');
  const [drawPoints, setDrawPoints] = useState('1');
  const [lossPoints, setLossPoints] = useState('0');

  const handleAddPlayer = () => {
    setPlayers([...players, '']);
  };

  const handleRemovePlayer = (index: number) => {
    const newPlayers = [...players];
    newPlayers.splice(index, 1);
    setPlayers(newPlayers);
  };

  const handlePlayerNameChange = (text: string, index: number) => {
    const newPlayers = [...players];
    newPlayers[index] = text;
    setPlayers(newPlayers);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Validation Error', 'Tournament name cannot be empty.');
      return;
    }

    const validPlayers = players.map(p => p.trim()).filter(p => p.length > 0);
    
    let pWin = 3, pDraw = 1, pLoss = 0;

    if (format === 'league') {
      if (validPlayers.length < 2) {
        Alert.alert('Validation Error', 'League format requires at least 2 guest players.');
        return;
      }

      if (scoringType === 'custom') {
        pWin = parseInt(winPoints, 10);
        pDraw = parseInt(drawPoints, 10);
        pLoss = parseInt(lossPoints, 10);

        if (isNaN(pWin) || isNaN(pDraw) || isNaN(pLoss) || pWin < 0 || pDraw < 0 || pLoss < 0) {
          Alert.alert('Validation Error', 'Points must be non-negative integers.');
          return;
        }

        if (pWin <= pDraw) {
          Alert.alert('Validation Error', 'Win points must be greater than Draw points.');
          return;
        }

        if (pDraw < pLoss) {
          Alert.alert('Validation Error', 'Draw points must be greater than or equal to Loss points.');
          return;
        }
      }
    }

    if (format === 'knockout') {
      if (validPlayers.length < 4) {
        Alert.alert('Validation Error', 'Knockout format requires at least 4 guest players.');
        return;
      }
      
      const len = validPlayers.length;
      if ((len & (len - 1)) !== 0) {
        Alert.alert('Validation Error', 'Knockout format requires the number of players to be a power of 2 (4, 8, 16, etc).');
        return;
      }
    }

    const uniquePlayers = new Set(validPlayers);
    if (uniquePlayers.size !== validPlayers.length) {
      Alert.alert('Validation Error', 'Guest player names must be unique.');
      return;
    }

    setLoading(true);

    try {
      const { data: tournamentData, error: tournamentError } = await supabase
        .from('host_tournaments')
        .insert({
          host_id: userId,
          name: trimmedName,
          format: format,
          status: 'draft',
          game_type: null,
          tempo: 'normal',
          round_deadline_hours: 24,
          points_for_win: pWin,
          points_for_draw: pDraw,
          points_for_loss: pLoss,
        })
        .select()
        .single();

      if (tournamentError) throw tournamentError;

      const playerInserts = validPlayers.map((playerName, index) => ({
        host_tournament_id: tournamentData.id,
        display_name: playerName,
        seed: index + 1,
        status: 'active',
      }));

      const { error: playersError } = await supabase
        .from('host_tournament_players')
        .insert(playerInserts);

      if (playersError) {
        console.error('Error inserting players:', playersError);
        throw playersError;
      }

      onCreated(tournamentData.id, tournamentData.name);
    } catch (error: any) {
      console.error('Create host tournament error:', error);
      Alert.alert('Error', error.message || 'Could not create host tournament.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable style={styles.headerButton} onPress={onBack}>
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Host Mode</Text>
          <View style={styles.headerButton} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} indicatorStyle="white">
          <Text style={styles.description}>
            Run a tournament directly from your device. Add your friends as guest players. No accounts needed.
          </Text>

          {/* Name */}
          <Text style={styles.inputLabel}>Tournament Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Game Night Cup"
            placeholderTextColor={COLORS.textMuted}
            value={name}
            onChangeText={setName}
            autoCorrect={false}
          />

          {/* Format Selection */}
          <Text style={styles.inputLabel}>Tournament Format</Text>
          <View style={styles.formatRow}>
            <Pressable 
              style={[styles.formatCard, format === 'league' && styles.formatCardActive]}
              onPress={() => setFormat('league')}
            >
              <Text style={styles.formatIcon}>📊</Text>
              <Text style={styles.formatTitle}>League</Text>
              <Text style={styles.formatSubtitle}>Everyone plays everyone</Text>
            </Pressable>
            <Pressable 
              style={[styles.formatCard, format === 'knockout' && styles.formatCardActive]}
              onPress={() => setFormat('knockout')}
            >
              <Text style={styles.formatIcon}>🏆</Text>
              <Text style={styles.formatTitle}>Knockout</Text>
              <Text style={styles.formatSubtitle}>Single elimination</Text>
            </Pressable>
          </View>

          {/* Scoring System (Only for League) */}
          {format === 'league' && (
            <>
              <Text style={styles.inputLabel}>Scoring System</Text>
              <View style={styles.formatRow}>
                <Pressable 
                  style={[styles.formatCard, scoringType === 'default' && styles.formatCardActive]}
                  onPress={() => setScoringType('default')}
                >
                  <Text style={styles.formatTitle}>Default</Text>
                  <Text style={styles.formatSubtitle}>Win 3 · Draw 1 · Loss 0</Text>
                </Pressable>
                <Pressable 
                  style={[styles.formatCard, scoringType === 'custom' && styles.formatCardActive]}
                  onPress={() => setScoringType('custom')}
                >
                  <Text style={styles.formatTitle}>Custom</Text>
                  <Text style={styles.formatSubtitle}>Set your own points</Text>
                </Pressable>
              </View>

              {scoringType === 'custom' && (
                <View style={styles.customScoringContainer}>
                  <View style={styles.scoreInputGroup}>
                    <Text style={styles.scoreInputLabel}>Win</Text>
                    <TextInput 
                      style={styles.scoreInput}
                      keyboardType="numeric"
                      value={winPoints}
                      onChangeText={setWinPoints}
                      maxLength={2}
                    />
                  </View>
                  <View style={styles.scoreInputGroup}>
                    <Text style={styles.scoreInputLabel}>Draw</Text>
                    <TextInput 
                      style={styles.scoreInput}
                      keyboardType="numeric"
                      value={drawPoints}
                      onChangeText={setDrawPoints}
                      maxLength={2}
                    />
                  </View>
                  <View style={styles.scoreInputGroup}>
                    <Text style={styles.scoreInputLabel}>Loss</Text>
                    <TextInput 
                      style={styles.scoreInput}
                      keyboardType="numeric"
                      value={lossPoints}
                      onChangeText={setLossPoints}
                      maxLength={2}
                    />
                  </View>
                </View>
              )}
            </>
          )}

          {/* Guest Players */}
          <View style={styles.playersHeader}>
            <Text style={styles.inputLabel}>Guest Players ({players.filter(p => p.trim().length > 0).length})</Text>
            <Pressable style={styles.addButton} onPress={handleAddPlayer}>
              <Ionicons name="add-circle" size={20} color={COLORS.primary} />
              <Text style={styles.addButtonText}>Add Player</Text>
            </Pressable>
          </View>

          <View style={styles.playersList}>
            {players.map((player, index) => (
              <View key={`player-${index}`} style={styles.playerInputRow}>
                <View style={styles.playerIndex}>
                  <Text style={styles.playerIndexText}>{index + 1}</Text>
                </View>
                <TextInput
                  style={styles.playerInput}
                  placeholder="Player Name"
                  placeholderTextColor={COLORS.textMuted}
                  value={player}
                  onChangeText={(text) => handlePlayerNameChange(text, index)}
                  autoCorrect={false}
                  returnKeyType="done"
                />
                {players.length > 2 && (
                  <Pressable style={styles.removeButton} onPress={() => handleRemovePlayer(index)}>
                    <Ionicons name="close-circle" size={24} color={COLORS.error} />
                  </Pressable>
                )}
              </View>
            ))}
          </View>

          <View style={styles.spacer} />

          <Pressable
            style={[styles.createButton, (!name.trim() || loading) && styles.disabledButton]}
            onPress={handleCreate}
            disabled={!name.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.textInverse} />
            ) : (
              <Text style={styles.createButtonText}>Create & Start</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  headerButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary },
  content: { padding: SPACING.screenPadding },
  description: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 24, lineHeight: 20 },
  inputLabel: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.input, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: COLORS.textPrimary },
  formatRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  formatCard: { flex: 1, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  formatCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryMuted },
  formatIcon: { fontSize: 24, marginBottom: 8 },
  formatTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 },
  formatSubtitle: { fontSize: 12, color: COLORS.textSecondary },
  customScoringContainer: { flexDirection: 'row', gap: 12, marginTop: 12, backgroundColor: COLORS.surface, padding: 16, borderRadius: RADIUS.card },
  scoreInputGroup: { flex: 1 },
  scoreInputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 6, textAlign: 'center' },
  scoreInput: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.input, paddingVertical: 10, fontSize: 16, color: COLORS.textPrimary, textAlign: 'center' },
  playersHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primaryMuted, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addButtonText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  playersList: { marginTop: 12, gap: 12 },
  playerInputRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playerIndex: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center' },
  playerIndexText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  playerInput: { flex: 1, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.input, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: COLORS.textPrimary },
  removeButton: { padding: 4 },
  spacer: { height: 40 },
  createButton: { height: 56, backgroundColor: COLORS.primary, borderRadius: RADIUS.button, justifyContent: 'center', alignItems: 'center', marginBottom: 40 },
  disabledButton: { backgroundColor: COLORS.textMuted },
  createButtonText: { color: COLORS.textInverse, fontSize: 17, fontWeight: '700' },
});
