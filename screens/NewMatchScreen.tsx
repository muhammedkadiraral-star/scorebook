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
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { analyzeMatchPhoto } from '../lib/openai';
import { supabase } from '../lib/supabase';
import type { GroupMemberOption } from './GroupDetailScreen';

type NewMatchScreenProps = {
  groupId: string;
  groupName: string;
  members: GroupMemberOption[];
  onBack: () => void;
  onSaved: () => void;
};

type PickerTarget = 'home' | 'away' | null;
type GroupMembershipRow = { user_id: string; users: { id: string; display_name: string | null } | null };
type GroupMemberOnlyRow = { user_id: string };
type UserRow = { id: string; display_name: string | null };

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

  const selectedHomeName = useMemo(
    () => members.find((member) => member.id === homePlayerId)?.displayName ?? 'Tap to select',
    [homePlayerId, members]
  );
  const selectedAwayName = useMemo(
    () => members.find((member) => member.id === awayPlayerId)?.displayName ?? 'Tap to select',
    [awayPlayerId, members]
  );

  const loadMembers = async () => {
    setLoadingMembers(true);
    try {
      // Preferred query approach from your request.
      const { data, error } = await supabase
        .from('group_members')
        .select('user_id, users(id, display_name)')
        .eq('group_id', groupId);

      if (error) throw error;

      let nextMembers = ((data ?? []) as GroupMembershipRow[]).map((row) => ({
        id: row.user_id,
        displayName: row.users?.display_name ?? 'Unknown Player',
      }));

      // Fallback approach: fetch users separately and match membership.
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
          const userMap = users.reduce<Record<string, string>>((acc, user) => {
            acc[user.id] = user.display_name ?? 'Unknown Player';
            return acc;
          }, {});

          nextMembers = memberIds.map((id) => ({
            id,
            displayName: userMap[id] ?? 'Unknown Player',
          }));
        }
      }

      setMembers(nextMembers);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not fetch group members.';
      Alert.alert('Member fetch error', message);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    void loadMembers();
  }, [groupId]);

  useEffect(() => {
    if (pickerTarget) {
      Alert.alert('Debug', `Members found: ${members.length}`);
    }
  }, [pickerTarget, members.length]);

  const selectPlayer = (memberId: string) => {
    if (pickerTarget === 'home') setHomePlayerId(memberId);
    if (pickerTarget === 'away') setAwayPlayerId(memberId);
    setPickerTarget(null);
  };

  const addGuest = async () => {
    const trimmed = guestName.trim();
    if (!trimmed) {
      Alert.alert('Missing name', 'Type a guest name first.');
      return;
    }

    setAddingGuest(true);
    try {
      const guestId = Crypto.randomUUID();

      const { error: userError } = await supabase.from('users').insert({
        id: guestId,
        display_name: trimmed,
      });
      if (userError) throw userError;

      const { error: memberError } = await supabase.from('group_members').insert({
        group_id: groupId,
        user_id: guestId,
      });
      if (memberError) throw memberError;

      setMembers((prev) => [{ id: guestId, displayName: trimmed }, ...prev]);
      setGuestName('');
      Alert.alert('Guest added', `"${trimmed}" added to this group.`);
    } catch (error) {
      Alert.alert('Debug Guest Error', JSON.stringify(error));
      const message = error instanceof Error ? error.message : 'Could not add guest player.';
      Alert.alert('Guest error', message);
    } finally {
      setAddingGuest(false);
    }
  };

  const changeScore = (side: 'home' | 'away', delta: number) => {
    if (side === 'home') {
      setHomeScore((prev) => Math.max(0, prev + delta));
      return;
    }
    setAwayScore((prev) => Math.max(0, prev + delta));
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
      
      if (data.error) {
        Alert.alert('Scan Failed', data.error);
      } else {
        if (data.home_team) setHomeTeam(data.home_team);
        if (data.away_team) setAwayTeam(data.away_team);
        if (typeof data.score_home === 'number') setHomeScore(data.score_home);
        if (typeof data.score_away === 'number') setAwayScore(data.score_away);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not analyze photo.';
      Alert.alert('Scan error', message);
    } finally {
      setPhotoLoading(false);
    }
  };

  const scanMatchResult = async () => {
    Alert.alert(
      'Scan Match Result',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission needed', 'Camera permission is required');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              quality: 0.8,
            });
            handleImageResult(result);
          }
        },
        {
          text: 'Choose from Library',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission needed', 'Media library permission is required');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              quality: 0.8,
            });
            handleImageResult(result);
          }
        },
        {
          text: 'Cancel',
          style: 'cancel'
        }
      ]
    );
  };

  const saveMatch = async () => {
    if (!homePlayerId || !awayPlayerId) {
      Alert.alert('Missing players', 'Please select home and away players.');
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        throw new Error('No authenticated user found.');
      }

      const { error } = await supabase.from('matches').insert({
        group_id: groupId,
        player_home: homePlayerId,
        player_away: awayPlayerId,
        team_home: homeTeam.trim() || null,
        team_away: awayTeam.trim() || null,
        score_home: homeScore,
        score_away: awayScore,
        recorded_by: authUser.id,
        match_type: '1v1',
      });

      if (error) throw error;
      Alert.alert('Saved', 'Match added successfully.');
      onSaved();
    } catch (error) {
      Alert.alert('Debug', JSON.stringify(error));
      const message = error instanceof Error ? error.message : 'Could not save match.';
      Alert.alert('Save error', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>Back</Text>
        </Pressable>

        <Text style={styles.title}>New Match</Text>
        <Text style={styles.subtitle}>{groupName}</Text>

        <View style={styles.playerRow}>
          <View style={styles.playerColumn}>
            <Text style={styles.label}>Home Player</Text>
            <Pressable style={styles.selector} onPress={() => setPickerTarget('home')}>
              <Text style={styles.selectorText}>{selectedHomeName}</Text>
            </Pressable>
          </View>
          <View style={styles.playerColumn}>
            <Text style={styles.label}>Away Player</Text>
            <Pressable style={styles.selector} onPress={() => setPickerTarget('away')}>
              <Text style={styles.selectorText}>{selectedAwayName}</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.label}>Home Team</Text>
        <TextInput value={homeTeam} onChangeText={setHomeTeam} style={styles.input} placeholder="Home team" />

        <Text style={styles.label}>Away Team</Text>
        <TextInput value={awayTeam} onChangeText={setAwayTeam} style={styles.input} placeholder="Away team" />

        <Text style={styles.label}>Score</Text>
        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreName}>Home</Text>
            <TextInput
              value={String(homeScore)}
              onChangeText={(value) => setHomeScore(parseScore(value))}
              keyboardType="number-pad"
              style={styles.scoreInput}
              selectTextOnFocus
            />
            <View style={styles.scoreActions}>
              <Pressable style={styles.scoreButton} onPress={() => changeScore('home', -1)}>
                <Text style={styles.scoreButtonText}>-</Text>
              </Pressable>
              <Pressable style={styles.scoreButton} onPress={() => changeScore('home', 1)}>
                <Text style={styles.scoreButtonText}>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.scoreBox}>
            <Text style={styles.scoreName}>Away</Text>
            <TextInput
              value={String(awayScore)}
              onChangeText={(value) => setAwayScore(parseScore(value))}
              keyboardType="number-pad"
              style={styles.scoreInput}
              selectTextOnFocus
            />
            <View style={styles.scoreActions}>
              <Pressable style={styles.scoreButton} onPress={() => changeScore('away', -1)}>
                <Text style={styles.scoreButtonText}>-</Text>
              </Pressable>
              <Pressable style={styles.scoreButton} onPress={() => changeScore('away', 1)}>
                <Text style={styles.scoreButtonText}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable style={styles.scanButton} onPress={scanMatchResult} disabled={photoLoading}>
          {photoLoading ? (
            <ActivityIndicator color="#6C5CE7" />
          ) : (
            <Text style={styles.scanButtonText}>📸 Scan Match Result</Text>
          )}
        </Pressable>

        {photoPreview && (
          <Image source={{ uri: photoPreview }} style={styles.photoPreview} resizeMode="contain" />
        )}

        <Pressable style={[styles.saveButton, saving && styles.saveDisabled]} onPress={saveMatch} disabled={saving}>
          <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Match'}</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={pickerTarget !== null} transparent animationType="slide" onRequestClose={() => setPickerTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Player</Text>

            {loadingMembers ? (
              <ActivityIndicator color="#6C5CE7" />
            ) : members.length === 0 ? (
              <Text style={styles.emptyText}>No members found for this group.</Text>
            ) : (
              <ScrollView style={styles.memberList} showsVerticalScrollIndicator={false}>
                {members.map((member) => (
                  <Pressable key={member.id} style={styles.memberItem} onPress={() => selectPlayer(member.id)}>
                    <Text style={styles.memberText}>{member.displayName}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <View style={styles.guestWrap}>
              <TextInput
                value={guestName}
                onChangeText={setGuestName}
                placeholder="Guest player name"
                style={styles.guestInput}
                placeholderTextColor="#9AA0A6"
              />
              <Pressable style={styles.guestButton} onPress={addGuest}>
                <Text style={styles.guestButtonText}>{addingGuest ? 'Adding...' : 'Add Guest'}</Text>
              </Pressable>
            </View>

            <Pressable style={styles.closeButton} onPress={() => setPickerTarget(null)}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 20, paddingBottom: 30 },
  back: { color: '#6C5CE7', fontWeight: '600', marginBottom: 10 },
  title: { fontSize: 26, fontWeight: '700', color: '#1F1F1F' },
  subtitle: { color: '#6F6F76', marginBottom: 16 },
  playerRow: { flexDirection: 'row', gap: 10 },
  playerColumn: { flex: 1 },
  label: { color: '#333333', fontWeight: '600', marginBottom: 6, marginTop: 8 },
  selector: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectorText: { color: '#1F1F1F' },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#1F1F1F',
  },
  scoreRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  scoreBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E9E9EF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  scoreName: { color: '#6F6F76', marginBottom: 6 },
  scoreInput: {
    width: 80,
    height: 46,
    borderWidth: 1,
    borderColor: '#D7D8E0',
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 24,
    color: '#6C5CE7',
    fontWeight: '700',
    marginBottom: 8,
    paddingVertical: 0,
  },
  scoreActions: { flexDirection: 'row', gap: 8 },
  scoreButton: {
    width: 38,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#6C5CE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreButtonText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { marginHorizontal: 10, color: '#6F6F76', fontWeight: '600' },
  scanButton: {
    borderWidth: 1,
    borderColor: '#6C5CE7',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F7FF',
    marginBottom: 16,
  },
  scanButtonText: { color: '#6C5CE7', fontSize: 16, fontWeight: '600' },
  photoPreview: {
    width: '100%',
    height: 150,
    borderRadius: 12,
    marginBottom: 16,
  },
  saveButton: {
    marginTop: 18,
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveDisabled: { opacity: 0.75 },
  saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '75%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1F1F1F', marginBottom: 10 },
  memberList: { maxHeight: 250 },
  memberItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EEEEF4' },
  memberText: { fontSize: 16, color: '#333333' },
  emptyText: { color: '#6F6F76', marginVertical: 8 },
  guestWrap: { marginTop: 12, gap: 8 },
  guestInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  guestButton: {
    borderWidth: 1,
    borderColor: '#6C5CE7',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  guestButtonText: { color: '#6C5CE7', fontWeight: '600' },
  closeButton: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  closeText: { color: '#6C5CE7', fontWeight: '600' },
});
