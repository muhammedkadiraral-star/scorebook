import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { analyzeMatchPhoto } from '../lib/openai';
import { supabase } from '../lib/supabase';
import type { GroupMemberOption } from './GroupDetailScreen';
import { COLORS, RADIUS, SIZES, SPACING } from '../constants/theme';

type NewMatchScreenProps = {
  groupId: string;
  groupName: string;
  members: GroupMemberOption[];
  onBack: () => void;
  onSaved: () => void;
};

type PickerTarget = 'home' | 'away' | null;
type GroupMembershipRow = { user_id: string; users: { id: string; display_name: string | null; avatar_url: string | null } | null };
type GroupMemberOnlyRow = { user_id: string };
type UserRow = { id: string; display_name: string | null; avatar_url: string | null };

export function NewMatchScreen({ groupId, groupName, members: initialMembers, onBack, onSaved }: NewMatchScreenProps) {
  const [members, setMembers] = useState<GroupMemberOption[]>(initialMembers);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);

  const [homePlayerId, setHomePlayerId] = useState('');
  const [awayPlayerId, setAwayPlayerId] = useState('');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);

  const [guestName, setGuestName] = useState('');
  const [addingGuest, setAddingGuest] = useState(false);
  const [saving, setSaving] = useState(false);

  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const selectedHomePlayer = useMemo(
    () => members.find((member) => member.id === homePlayerId),
    [homePlayerId, members]
  );
  const selectedAwayPlayer = useMemo(
    () => members.find((member) => member.id === awayPlayerId),
    [awayPlayerId, members]
  );

  const loadMembers = async () => {
    setLoadingMembers(true);
    try {
      const { data, error } = await supabase
        .from('group_members')
        .select('user_id, users(id, display_name, avatar_url)')
        .eq('group_id', groupId);

      if (error) throw error;

      let nextMembers = ((data ?? []) as unknown as GroupMembershipRow[]).map((row) => ({
        id: row.user_id,
        displayName: row.users?.display_name ?? 'Unknown Player',
        avatarUrl: row.users?.avatar_url ?? null,
      }));

      if (nextMembers.length === 0 || nextMembers.every((member) => member.displayName === 'Unknown Player')) {
        const { data: membershipRows, error: membershipError } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', groupId);
        if (membershipError) throw membershipError;

        const memberIds = ((membershipRows ?? []) as GroupMemberOnlyRow[]).map((row) => row.user_id);
        if (memberIds.length > 0) {
          const { data: allUsers, error: usersError } = await supabase.from('users').select('*');
          if (usersError) throw usersError;

          const users = (allUsers ?? []) as UserRow[];
          const userMap = users.reduce<Record<string, UserRow>>((acc, user) => {
            acc[user.id] = user;
            return acc;
          }, {});

          nextMembers = memberIds.map((id) => ({
            id,
            displayName: userMap[id]?.display_name ?? 'Unknown Player',
            avatarUrl: userMap[id]?.avatar_url ?? null,
          }));
        }
      }

      setMembers(nextMembers);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not fetch group members.';
      Alert.alert('Error', message);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    void loadMembers();
  }, [groupId]);

  const selectPlayer = (memberId: string) => {
    if (pickerTarget === 'home') setHomePlayerId(memberId);
    if (pickerTarget === 'away') setAwayPlayerId(memberId);
    setPickerTarget(null);
  };

  const addGuest = async () => {
    const trimmed = guestName.trim();
    if (!trimmed) return;

    setAddingGuest(true);
    try {
      const guestId = Crypto.randomUUID();
      const { error: userError } = await supabase.from('users').insert({ id: guestId, display_name: trimmed });
      if (userError) throw userError;

      const { error: memberError } = await supabase.from('group_members').insert({ group_id: groupId, user_id: guestId });
      if (memberError) throw memberError;

      setMembers((prev) => [{ id: guestId, displayName: trimmed, avatarUrl: null }, ...prev]);
      setGuestName('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add guest player.';
      Alert.alert('Error', message);
    } finally {
      setAddingGuest(false);
    }
  };

  const changeScore = (side: 'home' | 'away', delta: number) => {
    if (side === 'home') setHomeScore((prev) => Math.max(0, prev + delta));
    else setAwayScore((prev) => Math.max(0, prev + delta));
  };

  const parseScore = (value: string) => {
    const numeric = value.replace(/[^0-9]/g, '');
    return numeric.length > 0 ? Number(numeric) : 0;
  };

  const handleImageResult = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets || result.assets.length === 0) return;
    const imageUri = result.assets[0].uri;
    setPhotoPreview(imageUri);
    setPhotoLoading(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' });
      const data = await analyzeMatchPhoto(base64);
      if (data.error) Alert.alert('Scan Failed', data.error);
      else {
        if (data.home_team) setHomeTeam(data.home_team);
        if (data.away_team) setAwayTeam(data.away_team);
        if (typeof data.score_home === 'number') setHomeScore(data.score_home);
        if (typeof data.score_away === 'number') setAwayScore(data.score_away);
      }
    } catch (error) {
      Alert.alert('Scan error', error instanceof Error ? error.message : 'Could not analyze photo.');
    } finally {
      setPhotoLoading(false);
    }
  };

  const scanMatchResult = async () => {
    Alert.alert('Scan Match Result', 'Choose an option', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return;
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
          handleImageResult(result);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') return;
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
          handleImageResult(result);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const saveMatch = async () => {
    if (!homePlayerId || !awayPlayerId) {
      Alert.alert('Missing players', 'Please select home and away players.');
      return;
    }
    setSaving(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('No authenticated user found.');

      const { data: newMatch, error: matchInsertError } = await supabase.from('matches').insert({
        group_id: groupId,
        player_home: homePlayerId,
        player_away: awayPlayerId,
        team_home: homeTeam.trim() || null,
        team_away: awayTeam.trim() || null,
        score_home: homeScore,
        score_away: awayScore,
        recorded_by: authUser.id,
        match_type: '1v1',
      }).select().single();

      if (matchInsertError) throw matchInsertError;

      // Create notification for the other player
      const opponentId = authUser.id === homePlayerId ? awayPlayerId : homePlayerId;
      const recorderName = members.find(m => m.id === authUser.id)?.displayName ?? 'Someone';
      const homePlayerName = selectedHomePlayer?.displayName ?? 'Home Player';
      const awayPlayerName = selectedAwayPlayer?.displayName ?? 'Away Player';
      const homeTeamStr = homeTeam.trim();
      const awayTeamStr = awayTeam.trim();
      const hasTeams = homeTeamStr !== '' && homeTeamStr !== 'No Team' && awayTeamStr !== '' && awayTeamStr !== 'No Team';

      const notifTitle = 'New Match Recorded';
      const notifMessage = hasTeams
        ? `${recorderName} recorded a match: ${homePlayerName} ${homeScore}-${awayScore} ${awayPlayerName} (${homeTeamStr} vs ${awayTeamStr})`
        : `${recorderName} recorded a match: ${homePlayerName} ${homeScore}-${awayScore} ${awayPlayerName}`;

      await supabase.from('notifications').insert({
        user_id: opponentId,
        type: 'match_added',
        title: notifTitle,
        message: notifMessage,
        match_id: newMatch.id,
        group_id: groupId,
        created_by: authUser.id,
      });

      Alert.alert('Success', 'Match saved successfully');
      onSaved();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not save match.');
    } finally {
      setSaving(false);
    }
  };

  const renderAvatar = (avatarUrl: string | null, name: string, size = 32) => {
    if (avatarUrl) {
      return (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: size * 0.6 }}>{avatarUrl}</Text>
        </View>
      );
    }
    const initial = name.trim().charAt(0).toUpperCase() || 'P';
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.borderLight, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: size * 0.45, color: COLORS.primary, fontWeight: '700' }}>{initial}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>New Match</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} indicatorStyle="white">
        <View style={styles.playerSelectionRow}>
          <View style={styles.playerCol}>
            <Text style={styles.label}>Home Player</Text>
            <Pressable style={styles.selector} onPress={() => setPickerTarget('home')}>
              {selectedHomePlayer ? (
                <View style={styles.selectedPlayer}>
                  {renderAvatar(selectedHomePlayer.avatarUrl, selectedHomePlayer.displayName, 24)}
                  <Text style={styles.selectorText} numberOfLines={1}>{selectedHomePlayer.displayName}</Text>
                </View>
              ) : (
                <Text style={styles.placeholderText}>Select Player</Text>
              )}
            </Pressable>
          </View>
          <View style={styles.playerCol}>
            <Text style={styles.label}>Away Player</Text>
            <Pressable style={styles.selector} onPress={() => setPickerTarget('away')}>
              {selectedAwayPlayer ? (
                <View style={styles.selectedPlayer}>
                  {renderAvatar(selectedAwayPlayer.avatarUrl, selectedAwayPlayer.displayName, 24)}
                  <Text style={styles.selectorText} numberOfLines={1}>{selectedAwayPlayer.displayName}</Text>
                </View>
              ) : (
                <Text style={styles.placeholderText}>Select Player</Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.teamsRow}>
          <View style={styles.playerCol}>
            <Text style={styles.label}>Home Team</Text>
            <TextInput value={homeTeam} onChangeText={setHomeTeam} style={styles.input} placeholder="e.g. Real Madrid" placeholderTextColor={COLORS.textMuted} />
          </View>
          <View style={styles.playerCol}>
            <Text style={styles.label}>Away Team</Text>
            <TextInput value={awayTeam} onChangeText={setAwayTeam} style={styles.input} placeholder="e.g. Man City" placeholderTextColor={COLORS.textMuted} />
          </View>
        </View>

        <View style={styles.scoreSection}>
          <Text style={styles.label}>Score</Text>
          <View style={styles.scoreRow}>
            <View style={styles.scoreColumn}>
              <Text style={styles.scoreLabel}>Home</Text>
              <View style={styles.scoreCounter}>
                <Pressable style={styles.scoreBtn} onPress={() => changeScore('home', -1)}><Ionicons name="remove" size={24} color={COLORS.textInverse} /></Pressable>
                <TextInput value={String(homeScore)} onChangeText={(v) => setHomeScore(parseScore(v))} keyboardType="number-pad" style={styles.scoreInput} selectTextOnFocus />
                <Pressable style={styles.scoreBtn} onPress={() => changeScore('home', 1)}><Ionicons name="add" size={24} color={COLORS.textInverse} /></Pressable>
              </View>
            </View>
            <View style={styles.scoreColumn}>
              <Text style={styles.scoreLabel}>Away</Text>
              <View style={styles.scoreCounter}>
                <Pressable style={styles.scoreBtn} onPress={() => changeScore('away', -1)}><Ionicons name="remove" size={24} color={COLORS.textInverse} /></Pressable>
                <TextInput value={String(awayScore)} onChangeText={(v) => setAwayScore(parseScore(v))} keyboardType="number-pad" style={styles.scoreInput} selectTextOnFocus />
                <Pressable style={styles.scoreBtn} onPress={() => changeScore('away', 1)}><Ionicons name="add" size={24} color={COLORS.textInverse} /></Pressable>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable style={styles.scanButton} onPress={scanMatchResult} disabled={photoLoading}>
          {photoLoading ? <ActivityIndicator color={COLORS.primary} /> : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="camera-outline" size={20} color={COLORS.primary} />
              <Text style={styles.scanButtonText}>Scan Match Result</Text>
            </View>
          )}
        </Pressable>

        {photoPreview && <Image source={{ uri: photoPreview }} style={styles.photoPreview} resizeMode="cover" />}

        <View style={styles.footer}>
          <Pressable style={[styles.saveButton, saving && styles.saveDisabled]} onPress={saveMatch} disabled={saving}>
            {saving ? <ActivityIndicator color={COLORS.textInverse} /> : <Text style={styles.saveText}>Save Match</Text>}
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={pickerTarget !== null} transparent animationType="slide" onRequestClose={() => setPickerTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Player</Text>
              <Pressable onPress={() => setPickerTarget(null)}><Ionicons name="close" size={24} color={COLORS.textSecondary} /></Pressable>
            </View>

            {loadingMembers ? <ActivityIndicator color={COLORS.primary} /> : (
              <ScrollView style={styles.memberList} showsVerticalScrollIndicator={false}>
                {members.map((member) => (
                  <Pressable key={member.id} style={styles.memberItem} onPress={() => selectPlayer(member.id)}>
                    {renderAvatar(member.avatarUrl, member.displayName, 32)}
                    <Text style={styles.memberText}>{member.displayName}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <View style={styles.guestForm}>
              <TextInput value={guestName} onChangeText={setGuestName} placeholder="Guest name" style={styles.guestInput} placeholderTextColor={COLORS.textMuted} />
              <Pressable style={styles.guestAddBtn} onPress={addGuest} disabled={addingGuest}>
                <Text style={styles.guestAddBtnText}>{addingGuest ? '...' : 'Add'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  headerButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary },
  content: { padding: SPACING.screenPadding },
  label: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 8 },
  playerSelectionRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  playerCol: { flex: 1 },
  selector: { height: 52, backgroundColor: COLORS.surface, borderRadius: RADIUS.input, paddingHorizontal: 12, justifyContent: 'center' },
  selectedPlayer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectorText: { color: COLORS.textPrimary, fontWeight: '500', fontSize: 14, flex: 1 },
  placeholderText: { color: COLORS.textMuted, fontSize: 14 },
  teamsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  input: { height: 52, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.input, paddingHorizontal: 12, fontSize: 14, color: COLORS.textPrimary },
  scoreSection: { marginBottom: 24 },
  scoreRow: { flexDirection: 'row', gap: 24 },
  scoreColumn: { flex: 1, alignItems: 'center' },
  scoreLabel: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 8, fontWeight: '500' },
  scoreCounter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  scoreInput: { width: 50, height: 44, fontSize: 24, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { marginHorizontal: 12, color: COLORS.textMuted, fontWeight: '600', fontSize: 12 },
  scanButton: { height: 52, borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.button, justifyContent: 'center', alignItems: 'center' },
  scanButtonText: { color: COLORS.primary, fontWeight: '700', fontSize: 15 },
  photoPreview: { width: '100%', height: 180, borderRadius: 16, marginTop: 16 },
  footer: { marginTop: 32, marginBottom: 40 },
  saveButton: { height: 56, backgroundColor: COLORS.primary, borderRadius: RADIUS.button, justifyContent: 'center', alignItems: 'center' },
  saveDisabled: { opacity: 0.7 },
  saveText: { color: COLORS.textInverse, fontSize: 17, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  memberList: { maxHeight: 300 },
  memberItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  memberText: { fontSize: 16, color: COLORS.textPrimary },
  guestForm: { flexDirection: 'row', gap: 12, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.border },
  guestInput: { flex: 1, height: 44, backgroundColor: COLORS.backgroundSecondary, borderRadius: 12, paddingHorizontal: 12, fontSize: 14, color: COLORS.textPrimary },
  guestAddBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 16, height: 44, borderRadius: 12, justifyContent: 'center' },
  guestAddBtnText: { color: COLORS.textInverse, fontWeight: '700' }
});
