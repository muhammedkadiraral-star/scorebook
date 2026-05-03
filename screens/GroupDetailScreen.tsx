import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS, RADIUS, SIZES, SPACING } from '../constants/theme';

export type GroupMemberOption = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

type TabKey = 'matches' | 'leaderboard' | 'h2h';
type PickerTarget = 'a' | 'b' | null;

type MatchRow = {
  id: string;
  player_home: string;
  player_away: string;
  team_home: string | null;
  team_away: string | null;
  score_home: number;
  score_away: number;
  created_at: string;
  home: { display_name: string | null; avatar_url: string | null } | null;
  away: { display_name: string | null; avatar_url: string | null } | null;
};

type GroupDetailScreenProps = {
  groupId: string;
  groupName: string;
  userId: string;
  onBack: () => void;
  onAddMatch: (members: GroupMemberOption[]) => void;
};

type GroupMemberRecord = { user_id: string; users: { display_name: string | null; avatar_url: string | null } | null };

type LeaderboardRow = {
  playerId: string;
  name: string;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
  winRate: number;
  avatarUrl: string | null;
};

export function GroupDetailScreen({ groupId, groupName, userId, onBack, onAddMatch }: GroupDetailScreenProps) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('matches');
  const [inviteCode, setInviteCode] = useState('------');
  const [members, setMembers] = useState<GroupMemberOption[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [playerAId, setPlayerAId] = useState<string | null>(null);
  const [playerBId, setPlayerBId] = useState<string | null>(null);
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const loadGroupDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: groupData, error: groupError }, { data: membersData, error: membersError }, { data: matchesData, error: matchesError }, { data: { user: authUser } }] =
        await Promise.all([
          supabase.from('groups').select('*, created_by').eq('id', groupId).single(),
          supabase
            .from('group_members')
            .select(`user_id, users (display_name, avatar_url)`)
            .eq('group_id', groupId),
          supabase
            .from('matches')
            .select('*, home:users!player_home(display_name, avatar_url), away:users!player_away(display_name, avatar_url)')
            .eq('group_id', groupId)
            .order('created_at', { ascending: false }),
          supabase.auth.getUser(),
        ]);

      if (groupError) throw groupError;
      if (membersError) throw membersError;
      if (matchesError) throw matchesError;

      const rawMembers = (membersData ?? []) as unknown as GroupMemberRecord[];
      const parsedMembers = rawMembers.map((row) => ({
        id: row.user_id,
        displayName: row.users?.display_name ?? 'Unknown Player',
        avatarUrl: row.users?.avatar_url ?? null,
      }));

      const resolvedInviteCode =
        (groupData as { invite_code?: string | null; code?: string | null } | null)?.invite_code ??
        (groupData as { invite_code?: string | null; code?: string | null } | null)?.code ??
        '------';

      setInviteCode(resolvedInviteCode);
      setCreatedBy(groupData?.created_by ?? null);
      setMembers(parsedMembers);
      setMatches((matchesData ?? []) as MatchRow[]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load group detail.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void loadGroupDetail();
  }, [loadGroupDetail]);

  const memberNameMap = useMemo(() => {
    return members.reduce<Record<string, string>>((acc, member) => {
      acc[member.id] = member.displayName;
      return acc;
    }, {});
  }, [members]);

  const memberAvatarMap = useMemo(() => {
    return members.reduce<Record<string, string | null>>((acc, member) => {
      acc[member.id] = member.avatarUrl;
      return acc;
    }, {});
  }, [members]);

  const leaderboardRows = useMemo<LeaderboardRow[]>(() => {
    const stats = members.reduce<Record<string, LeaderboardRow>>((acc, member) => {
      acc[member.id] = {
        playerId: member.id,
        name: member.displayName,
        wins: 0,
        losses: 0,
        draws: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        winRate: 0,
        avatarUrl: member.avatarUrl,
      };
      return acc;
    }, {});

    matches.forEach((match) => {
      const homeId = match.player_home;
      const awayId = match.player_away;
      const homeScore = match.score_home ?? 0;
      const awayScore = match.score_away ?? 0;

      if (!stats[homeId] || !stats[awayId]) return;

      stats[homeId].goalsFor += homeScore;
      stats[homeId].goalsAgainst += awayScore;
      stats[awayId].goalsFor += awayScore;
      stats[awayId].goalsAgainst += homeScore;

      if (homeScore > awayScore) {
        stats[homeId].wins += 1;
        stats[awayId].losses += 1;
      } else if (awayScore > homeScore) {
        stats[awayId].wins += 1;
        stats[homeId].losses += 1;
      } else {
        stats[homeId].draws += 1;
        stats[awayId].draws += 1;
      }
    });

    return Object.values(stats)
      .map((row) => {
        const played = row.wins + row.losses + row.draws;
        const winRate = played > 0 ? (row.wins / played) * 100 : 0;
        return { ...row, winRate };
      })
      .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
  }, [matches, members]);

  const playerAName = useMemo(
    () => members.find((member) => member.id === playerAId)?.displayName ?? 'Select Player A',
    [members, playerAId]
  );
  const playerBName = useMemo(
    () => members.find((member) => member.id === playerBId)?.displayName ?? 'Select Player B',
    [members, playerBId]
  );

  const headToHead = useMemo(() => {
    if (!playerAId || !playerBId) return null;
    const between = matches.filter(
      (match) =>
        (match.player_home === playerAId && match.player_away === playerBId) ||
        (match.player_home === playerBId && match.player_away === playerAId)
    );
    let aWins = 0, bWins = 0, draws = 0, aGoals = 0, bGoals = 0;
    between.forEach((match) => {
      const aScore = match.player_home === playerAId ? match.score_home : match.score_away;
      const bScore = match.player_home === playerAId ? match.score_away : match.score_home;
      aGoals += aScore; bGoals += bScore;
      if (aScore > bScore) aWins += 1; else if (bScore > aScore) bWins += 1; else draws += 1;
    });
    return { between, total: between.length, aWins, bWins, draws, aGoals, bGoals };
  }, [matches, playerAId, playerBId]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join my group on ScoreBook! Use invite code: ${inviteCode}`,
      });
      setShowSettings(false);
    } catch (error) {
      console.log(error);
    }
  };

  const handleLeave = () => {
    setShowSettings(false);
    Alert.alert(
      'Leave Group?',
      'Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('group_members')
                .delete()
                .eq('group_id', groupId)
                .eq('user_id', userId);
              if (error) throw error;
              onBack();
            } catch (error) {
              Alert.alert('Error', 'Could not leave group.');
            }
          },
        },
      ]
    );
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

  const renderMatchCard = (item: MatchRow) => {
    const homeName = item.home?.display_name ?? memberNameMap[item.player_home] ?? 'Home';
    const awayName = item.away?.display_name ?? memberNameMap[item.player_away] ?? 'Away';
    const homeAvatar = item.home?.avatar_url ?? memberAvatarMap[item.player_home] ?? null;
    const awayAvatar = item.away?.avatar_url ?? memberAvatarMap[item.player_away] ?? null;
    const homeWon = item.score_home > item.score_away;
    const awayWon = item.score_away > item.score_home;
    const isDraw = item.score_home === item.score_away;

    return (
      <View key={item.id} style={styles.matchCard}>
        <View style={styles.matchSide}>
          {renderAvatar(homeAvatar, homeName, 32)}
          <Text style={[styles.matchPlayerName, homeWon && styles.winnerName]} numberOfLines={1}>{homeName}</Text>
          <Text style={[styles.matchScore, homeWon && styles.winnerScore, isDraw && styles.drawScore]}>{item.score_home}</Text>
        </View>
        <View style={styles.matchVS}><Text style={styles.vsText}>VS</Text></View>
        <View style={styles.matchSide}>
          <Text style={[styles.matchScore, awayWon && styles.winnerScore, isDraw && styles.drawScore]}>{item.score_away}</Text>
          <Text style={[styles.matchPlayerName, awayWon && styles.winnerName]} numberOfLines={1}>{awayName}</Text>
          {renderAvatar(awayAvatar, awayName, 32)}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={onBack}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.title}>{groupName}</Text>
          <Text style={styles.inviteCode}>Code: {inviteCode}</Text>
        </View>
        <Pressable style={styles.headerBtn} onPress={() => setShowSettings(true)}>
          <Ionicons name="ellipsis-horizontal" size={24} color={COLORS.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.tabContainer}>
        <View style={styles.tabPill}>
          {(['matches', 'leaderboard', 'h2h'] as TabKey[]).map((tab) => (
            <Pressable key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'matches' ? 'Matches' : tab === 'leaderboard' ? 'Leaderboard' : 'H2H'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View> : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} indicatorStyle="white">
          {activeTab === 'matches' && (
            <View style={styles.section}>
              {matches.length === 0 ? <Text style={styles.emptyText}>No matches recorded yet.</Text> : matches.map(renderMatchCard)}
            </View>
          )}

          {activeTab === 'leaderboard' && (
            <View style={styles.section}>
              {leaderboardRows.map((row, idx) => (
                <View key={row.playerId} style={[styles.leaderboardRow, idx % 2 === 1 && styles.rowAlt]}>
                  <Text style={styles.rankText}>#{idx + 1}</Text>
                  {renderAvatar(row.avatarUrl, row.name, 28)}
                  <Text style={styles.lbName} numberOfLines={1}>{row.name}</Text>
                  <View style={styles.lbStats}>
                    <Text style={styles.lbWinRate}>{row.winRate.toFixed(0)}%</Text>
                    <Text style={styles.lbWLD}>{row.wins}-{row.draws}-{row.losses}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {activeTab === 'h2h' && (
            <View style={styles.section}>
              <View style={styles.h2hSelectors}>
                <Pressable style={styles.h2hPicker} onPress={() => setPickerTarget('a')}><Text style={styles.h2hPickerText} numberOfLines={1}>{playerAName}</Text></Pressable>
                <Text style={styles.h2hVS}>vs</Text>
                <Pressable style={styles.h2hPicker} onPress={() => setPickerTarget('b')}><Text style={styles.h2hPickerText} numberOfLines={1}>{playerBName}</Text></Pressable>
              </View>
              {headToHead ? (
                <View style={styles.h2hResultCard}>
                  <View style={styles.h2hStatRow}>
                    <View style={styles.h2hStatSide}><Text style={styles.h2hStatValue}>{headToHead.aWins}</Text><Text style={styles.h2hStatLabel}>Wins</Text></View>
                    <View style={styles.h2hStatSide}><Text style={styles.h2hStatValue}>{headToHead.draws}</Text><Text style={styles.h2hStatLabel}>Draws</Text></View>
                    <View style={styles.h2hStatSide}><Text style={styles.h2hStatValue}>{headToHead.bWins}</Text><Text style={styles.h2hStatLabel}>Wins</Text></View>
                  </View>
                  <View style={styles.h2hBarContainer}>
                    <View style={[styles.h2hBarPart, { flex: Math.max(0.1, headToHead.aWins), backgroundColor: COLORS.primary }]} />
                    <View style={[styles.h2hBarPart, { flex: Math.max(0.1, headToHead.draws), backgroundColor: COLORS.textMuted }]} />
                    <View style={[styles.h2hBarPart, { flex: Math.max(0.1, headToHead.bWins), backgroundColor: COLORS.error }]} />
                  </View>
                  <View style={{ marginTop: 24 }}>{headToHead.between.map(renderMatchCard)}</View>
                </View>
              ) : <Text style={styles.emptyText}>Select two players to compare stats.</Text>}
            </View>
          )}
        </ScrollView>
      )}

      {activeTab === 'matches' && (
        <Pressable style={styles.fab} onPress={() => onAddMatch(members)}>
          <Ionicons name="add" size={32} color={COLORS.textInverse} />
        </Pressable>
      )}

      <Modal visible={pickerTarget !== null} transparent animationType="slide" onRequestClose={() => setPickerTarget(null)}>
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Select Player</Text><Pressable onPress={() => setPickerTarget(null)}><Ionicons name="close" size={24} color={COLORS.textSecondary} /></Pressable></View>
          <ScrollView style={{ maxHeight: 300 }}>{members.map((m) => (
            <Pressable key={m.id} style={styles.modalItem} onPress={() => { if (pickerTarget === 'a') setPlayerAId(m.id); else setPlayerBId(m.id); setPickerTarget(null); }}>
              {renderAvatar(m.avatarUrl, m.displayName, 32)}
              <Text style={styles.modalItemText}>{m.displayName}</Text>
            </Pressable>
          ))}</ScrollView>
        </View></View>
      </Modal>

      {/* Settings Action Modal */}
      <Modal visible={showSettings} transparent animationType="fade" onRequestClose={() => setShowSettings(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSettings(false)}>
          <View style={styles.actionSheet}>
            <Pressable style={styles.actionItem} onPress={handleShare}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name="share-outline" size={24} color={COLORS.primary} />
                <Text style={[styles.actionItemText, { color: COLORS.primary }]}>Share Group</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
            </Pressable>

            <View style={styles.actionDivider} />

            <Pressable style={styles.actionItem} onPress={handleLeave}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name="log-out-outline" size={24} color={COLORS.error} />
                <Text style={[styles.actionItemText, { color: COLORS.error }]}>Leave Group</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
            </Pressable>

            <Pressable style={styles.actionCancel} onPress={() => setShowSettings(false)}>
              <Text style={styles.actionCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  headerBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerContent: { flex: 1, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  inviteCode: { fontSize: 12, color: COLORS.primary, fontWeight: '600', marginTop: 2 },
  tabContainer: { paddingHorizontal: SPACING.screenPadding, paddingVertical: 12 },
  tabPill: { height: 48, backgroundColor: COLORS.surface, borderRadius: RADIUS.pill, flexDirection: 'row', padding: 4 },
  tab: { flex: 1, borderRadius: RADIUS.pill, justifyContent: 'center', alignItems: 'center' },
  tabActive: { backgroundColor: COLORS.card, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: SPACING.screenPadding, paddingBottom: 100 },
  section: { gap: 12 },
  matchCard: { height: 80, backgroundColor: COLORS.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  matchSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  matchPlayerName: { flex: 1, fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  winnerName: { color: COLORS.textPrimary, fontWeight: '700' },
  matchScore: { fontSize: 20, fontWeight: '800', color: COLORS.textMuted, width: 30, textAlign: 'center' },
  winnerScore: { color: COLORS.success },
  drawScore: { color: COLORS.warning },
  matchVS: { paddingHorizontal: 12 },
  vsText: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted },
  leaderboardRow: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderRadius: 12, gap: 12 },
  rowAlt: { backgroundColor: COLORS.backgroundSecondary },
  rankText: { fontSize: 14, fontWeight: '700', color: COLORS.textMuted, width: 24 },
  lbName: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  lbStats: { alignItems: 'flex-end' },
  lbWinRate: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  lbWLD: { fontSize: 10, color: COLORS.textMuted },
  emptyText: { textAlign: 'center', color: COLORS.textMuted, marginTop: 40 },
  h2hSelectors: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  h2hPicker: { flex: 1, height: 48, backgroundColor: COLORS.surface, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 12 },
  h2hPickerText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'center' },
  h2hVS: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted },
  h2hResultCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border, padding: 20 },
  h2hStatRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  h2hStatSide: { alignItems: 'center', flex: 1 },
  h2hStatValue: { fontSize: 24, fontWeight: '800', color: COLORS.textPrimary },
  h2hStatLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  h2hBarContainer: { height: 8, borderRadius: 4, flexDirection: 'row', overflow: 'hidden' },
  h2hBarPart: { height: '100%' },
  fab: { position: 'absolute', right: 24, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  modalItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalItemText: { fontSize: 16, color: COLORS.textPrimary },
  actionSheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, width: '100%' },
  actionItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  actionItemText: { fontSize: 17, fontWeight: '600' },
  actionDivider: { height: 1, backgroundColor: COLORS.border },
  actionCancel: { marginTop: 16, height: 52, borderRadius: RADIUS.button, backgroundColor: COLORS.backgroundSecondary, justifyContent: 'center', alignItems: 'center' },
  actionCancelText: { fontSize: 16, fontWeight: '700', color: COLORS.textSecondary },
});
