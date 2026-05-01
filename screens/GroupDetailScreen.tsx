import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

export type GroupMemberOption = {
  id: string;
  displayName: string;
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
  home: { display_name: string | null } | null;
  away: { display_name: string | null } | null;
};

type GroupDetailScreenProps = {
  groupId: string;
  groupName: string;
  onBack: () => void;
  onAddMatch: (members: GroupMemberOption[]) => void;
};

type GroupMemberRecord = { user_id: string; users: { display_name: string | null } | null };

type LeaderboardRow = {
  playerId: string;
  name: string;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
  winRate: number;
};

export function GroupDetailScreen({ groupId, groupName, onBack, onAddMatch }: GroupDetailScreenProps) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('matches');
  const [inviteCode, setInviteCode] = useState('------');
  const [members, setMembers] = useState<GroupMemberOption[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [playerAId, setPlayerAId] = useState<string | null>(null);
  const [playerBId, setPlayerBId] = useState<string | null>(null);

  const loadGroupDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: groupData, error: groupError }, { data: membersData, error: membersError }, { data: matchesData, error: matchesError }] =
        await Promise.all([
          supabase.from('groups').select('*').eq('id', groupId).single(),
          supabase
            .from('group_members')
            .select(
              `
              user_id,
              users (
                display_name
              )
            `
            )
            .eq('group_id', groupId),
          supabase
            .from('matches')
            .select('*, home:users!player_home(display_name), away:users!player_away(display_name)')
            .eq('group_id', groupId)
            .order('created_at', { ascending: false }),
        ]);

      if (groupError) throw groupError;
      if (membersError) throw membersError;
      if (matchesError) throw matchesError;

      const rawMembers = (membersData ?? []) as GroupMemberRecord[];
      const parsedMembers = rawMembers.map((row) => ({
        id: row.user_id,
        displayName: row.users?.display_name ?? 'Unknown Player',
      }));

      const resolvedInviteCode =
        (groupData as { invite_code?: string | null; code?: string | null } | null)?.invite_code ??
        (groupData as { invite_code?: string | null; code?: string | null } | null)?.code ??
        '------';

      setInviteCode(resolvedInviteCode);
      setMembers(parsedMembers);
      setMatches((matchesData ?? []) as MatchRow[]);
    } catch (error) {
      Alert.alert('Debug', JSON.stringify(error));
      const message = error instanceof Error ? error.message : 'Could not load group detail.';
      Alert.alert('Group detail error', message);
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
      };
      return acc;
    }, {});

    matches.forEach((match) => {
      const homeId = match.player_home;
      const awayId = match.player_away;
      const homeScore = match.score_home ?? 0;
      const awayScore = match.score_away ?? 0;

      if (!stats[homeId]) {
        stats[homeId] = {
          playerId: homeId,
          name: match.home?.display_name ?? memberNameMap[homeId] ?? 'Unknown Player',
          wins: 0,
          losses: 0,
          draws: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          winRate: 0,
        };
      }
      if (!stats[awayId]) {
        stats[awayId] = {
          playerId: awayId,
          name: match.away?.display_name ?? memberNameMap[awayId] ?? 'Unknown Player',
          wins: 0,
          losses: 0,
          draws: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          winRate: 0,
        };
      }

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
  }, [matches, members, memberNameMap]);

  const playerAName = useMemo(
    () => members.find((member) => member.id === playerAId)?.displayName ?? 'Select Player A',
    [members, playerAId]
  );
  const playerBName = useMemo(
    () => members.find((member) => member.id === playerBId)?.displayName ?? 'Select Player B',
    [members, playerBId]
  );

  const headToHead = useMemo(() => {
    if (!playerAId || !playerBId) {
      return null;
    }

    const between = matches.filter(
      (match) =>
        (match.player_home === playerAId && match.player_away === playerBId) ||
        (match.player_home === playerBId && match.player_away === playerAId)
    );

    let aWins = 0;
    let bWins = 0;
    let draws = 0;
    let aGoals = 0;
    let bGoals = 0;

    between.forEach((match) => {
      const aScore = match.player_home === playerAId ? match.score_home : match.score_away;
      const bScore = match.player_home === playerAId ? match.score_away : match.score_home;

      aGoals += aScore;
      bGoals += bScore;

      if (aScore > bScore) aWins += 1;
      else if (bScore > aScore) bWins += 1;
      else draws += 1;
    });

    return {
      between,
      total: between.length,
      aWins,
      bWins,
      draws,
      aGoals,
      bGoals,
    };
  }, [matches, playerAId, playerBId]);

  const selectH2HPlayer = (memberId: string) => {
    if (pickerTarget === 'a') setPlayerAId(memberId);
    if (pickerTarget === 'b') setPlayerBId(memberId);
    setPickerTarget(null);
  };

  const renderMatchCard = (item: MatchRow) => {
    const homeName = item.home?.display_name ?? memberNameMap[item.player_home] ?? 'Home';
    const awayName = item.away?.display_name ?? memberNameMap[item.player_away] ?? 'Away';
    const dateText = new Date(item.created_at).toLocaleDateString();

    return (
      <View key={item.id} style={styles.matchCard}>
        <Text style={styles.matchPlayers}>{homeName} vs {awayName}</Text>
        <Text style={styles.matchScore}>
          {item.score_home} - {item.score_away}
        </Text>
        <Text style={styles.matchTeams}>{item.team_home ?? '-'} vs {item.team_away ?? '-'}</Text>
        <Text style={styles.matchDate}>{dateText}</Text>
      </View>
    );
  };

  const totalH2H = headToHead?.total ?? 0;
  const aBarPct = totalH2H > 0 ? (headToHead!.aWins / totalH2H) * 100 : 0;
  const drawBarPct = totalH2H > 0 ? (headToHead!.draws / totalH2H) * 100 : 0;
  const bBarPct = totalH2H > 0 ? (headToHead!.bWins / totalH2H) * 100 : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>

      <View style={styles.headerCard}>
        <Text style={styles.title}>{groupName}</Text>
        <Text style={styles.inviteCode}>Invite Code: {inviteCode}</Text>
      </View>

      <View style={styles.tabRow}>
        <Pressable style={[styles.tab, activeTab === 'matches' && styles.tabActive]} onPress={() => setActiveTab('matches')}>
          <Text style={[styles.tabText, activeTab === 'matches' && styles.tabTextActive]}>Matches</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'leaderboard' && styles.tabActive]}
          onPress={() => setActiveTab('leaderboard')}
        >
          <Text style={[styles.tabText, activeTab === 'leaderboard' && styles.tabTextActive]}>Leaderboard</Text>
        </Pressable>
        <Pressable style={[styles.tab, activeTab === 'h2h' && styles.tabActive]} onPress={() => setActiveTab('h2h')}>
          <Text style={[styles.tabText, activeTab === 'h2h' && styles.tabTextActive]}>Head-to-Head</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#6C5CE7" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {activeTab === 'matches' ? (
            <>
              <Text style={styles.sectionTitle}>{matches.length > 0 ? 'Recent Matches' : 'No matches yet'}</Text>
              {matches.map((match) => renderMatchCard(match))}
              <View style={styles.memberSection}>
                <Text style={styles.sectionTitle}>Members</Text>
                {members.map((member) => (
                  <Text key={member.id} style={styles.memberName}>
                    - {member.displayName}
                  </Text>
                ))}
              </View>
            </>
          ) : null}

          {activeTab === 'leaderboard' ? (
            <>
              <Text style={styles.sectionTitle}>Leaderboard</Text>
              {leaderboardRows.map((row, index) => (
                <View key={row.playerId} style={styles.leaderboardCard}>
                  <Text style={styles.leaderboardName}>
                    #{index + 1} {row.name}
                  </Text>
                  <Text style={styles.leaderboardMeta}>
                    W:{row.wins} L:{row.losses} D:{row.draws}
                  </Text>
                  <Text style={styles.leaderboardMeta}>
                    GF:{row.goalsFor} GA:{row.goalsAgainst}
                  </Text>
                  <Text style={styles.leaderboardMeta}>Win Rate: {row.winRate.toFixed(1)}%</Text>
                </View>
              ))}
            </>
          ) : null}

          {activeTab === 'h2h' ? (
            <>
              <Text style={styles.sectionTitle}>Head-to-Head</Text>
              <View style={styles.h2hSelectors}>
                <Pressable style={styles.selector} onPress={() => setPickerTarget('a')}>
                  <Text style={styles.selectorText}>{playerAName}</Text>
                </Pressable>
                <Pressable style={styles.selector} onPress={() => setPickerTarget('b')}>
                  <Text style={styles.selectorText}>{playerBName}</Text>
                </Pressable>
              </View>

              {headToHead ? (
                <>
                  <View style={styles.h2hCard}>
                    <Text style={styles.h2hText}>Total matches: {headToHead.total}</Text>
                    <Text style={styles.h2hText}>
                      {playerAName}: {headToHead.aWins} wins
                    </Text>
                    <Text style={styles.h2hText}>
                      {playerBName}: {headToHead.bWins} wins
                    </Text>
                    <Text style={styles.h2hText}>Draws: {headToHead.draws}</Text>
                    <Text style={styles.h2hText}>
                      Goals: {playerAName} {headToHead.aGoals} - {headToHead.bGoals} {playerBName}
                    </Text>

                    <View style={styles.distributionBar}>
                      <View style={[styles.barA, { flex: aBarPct }]} />
                      <View style={[styles.barDraw, { flex: drawBarPct }]} />
                      <View style={[styles.barB, { flex: bBarPct }]} />
                    </View>
                  </View>

                  <Text style={styles.sectionTitle}>Matches Between Them</Text>
                  {headToHead.between.map((match) => renderMatchCard(match))}
                </>
              ) : (
                <Text style={styles.h2hHint}>Select two players to see head-to-head stats.</Text>
              )}
            </>
          ) : null}
        </ScrollView>
      )}

      {activeTab === 'matches' ? (
        <Pressable style={styles.fab} onPress={() => onAddMatch(members)}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      ) : null}

      <Modal visible={pickerTarget !== null} transparent animationType="slide" onRequestClose={() => setPickerTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Player</Text>
            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {members.map((member) => (
                <Pressable key={member.id} style={styles.modalItem} onPress={() => selectH2HPlayer(member.id)}>
                  <Text style={styles.modalItemText}>{member.displayName}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.closeModalButton} onPress={() => setPickerTarget(null)}>
              <Text style={styles.closeModalText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  headerRow: {
    marginBottom: 12,
  },
  backText: {
    color: '#6C5CE7',
    fontSize: 15,
    fontWeight: '600',
  },
  headerCard: {
    borderWidth: 1,
    borderColor: '#E9E9EF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F1F1F',
    marginBottom: 6,
  },
  inviteCode: {
    color: '#6C5CE7',
    fontSize: 14,
    fontWeight: '600',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D9DAE5',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#6C5CE7',
    borderColor: '#6C5CE7',
  },
  tabText: {
    color: '#6C5CE7',
    fontWeight: '600',
    fontSize: 13,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 90,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F1F1F',
    marginBottom: 10,
  },
  matchCard: {
    borderWidth: 1,
    borderColor: '#E9E9EF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  matchPlayers: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F1F1F',
    marginBottom: 6,
  },
  matchScore: {
    fontSize: 22,
    fontWeight: '800',
    color: '#6C5CE7',
    marginBottom: 4,
  },
  matchTeams: {
    fontSize: 14,
    color: '#6F6F76',
    marginBottom: 4,
  },
  matchDate: {
    fontSize: 12,
    color: '#999AA3',
  },
  memberSection: {
    marginTop: 14,
    marginBottom: 20,
  },
  memberName: {
    fontSize: 14,
    color: '#333333',
    marginBottom: 4,
  },
  leaderboardCard: {
    borderWidth: 1,
    borderColor: '#E9E9EF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  leaderboardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F1F1F',
    marginBottom: 4,
  },
  leaderboardMeta: {
    fontSize: 13,
    color: '#5D5D67',
    marginBottom: 2,
  },
  h2hSelectors: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  selector: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D9DAE5',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  selectorText: {
    color: '#1F1F1F',
    fontSize: 14,
  },
  h2hCard: {
    borderWidth: 1,
    borderColor: '#E9E9EF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  h2hText: {
    fontSize: 14,
    color: '#333333',
    marginBottom: 4,
  },
  h2hHint: {
    fontSize: 14,
    color: '#6F6F76',
  },
  distributionBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 10,
    backgroundColor: '#EEEFF6',
  },
  barA: {
    backgroundColor: '#6C5CE7',
  },
  barDraw: {
    backgroundColor: '#B7B8C9',
  },
  barB: {
    backgroundColor: '#1F1F1F',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F1F1F',
    marginBottom: 10,
  },
  modalList: {
    maxHeight: 280,
  },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEF4',
  },
  modalItemText: {
    fontSize: 16,
    color: '#333333',
  },
  closeModalButton: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 10,
  },
  closeModalText: {
    color: '#6C5CE7',
    fontWeight: '600',
  },
});
