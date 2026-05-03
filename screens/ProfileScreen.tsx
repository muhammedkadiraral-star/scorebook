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
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS, RADIUS, SIZES, SPACING } from '../constants/theme';
import { getGameDisplayName, getGameEmoji } from '../constants/games';

type ProfileScreenProps = {
  userId: string;
  onBack: () => void;
  onSignOut: () => Promise<void>;
  loadingSignOut: boolean;
};

type MatchRow = {
  id: string;
  group_id: string;
  player_home: string;
  player_away: string;
  score_home: number;
  score_away: number;
  created_at: string;
  groups: {
    name: string;
    game_type: string;
  } | null;
};

type RivalStat = {
  rivalId: string;
  rivalName: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
};

const AVATAR_OPTIONS = ['😎', '👨‍💼', '👩‍💼', '🧔', '👨‍🦰', '👩‍🦰', '🧑‍💻', '👨‍🎨', '👩‍🔬', '🥷', '🧙‍♂️', '👨‍🚀', '🦸‍♂️', '🦸‍♀️', '🤴'];
const AVATAR_COLORS = [
  '#FEE2E2', '#FEF3C7', '#D1FAE5', '#DBEAFE', '#F3E8FF',
  '#FFE4E6', '#FFEDD5', '#ECFCCB', '#E0F2FE', '#FAE8FF',
  '#FCE7F3', '#FEF9C3', '#DCFCE7', '#CFFAFE', '#F5F3FF'
];

export function ProfileScreen({ userId, onSignOut, loadingSignOut }: ProfileScreenProps) {
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('Player');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [rivalsInfo, setRivalsInfo] = useState<Record<string, { name: string; avatarUrl: string | null }>>({});
  
  const [activeTab, setActiveTab] = useState<'recent' | 'stats' | 'rivals'>('recent');
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: profileData, error: profileError }, { data: matchData, error: matchError }] =
        await Promise.all([
          supabase.from('users').select('display_name, avatar_url, created_at').eq('id', userId).maybeSingle(),
          supabase
            .from('matches')
            .select('id, group_id, player_home, player_away, score_home, score_away, created_at, groups(name, game_type)')
            .or(`player_home.eq.${userId},player_away.eq.${userId}`)
            .order('created_at', { ascending: false }),
        ]);

      if (profileError) throw profileError;
      if (matchError) throw matchError;

      setDisplayName(profileData?.display_name ?? 'Player');
      setAvatarUrl(profileData?.avatar_url ?? null);
      setCreatedAt(profileData?.created_at ?? null);

      const allMatches = (matchData ?? []) as unknown as MatchRow[];
      setMatches(allMatches);

      const rivalIds = Array.from(
        new Set(
          allMatches.map((match) => (match.player_home === userId ? match.player_away : match.player_home)).filter((id) => id && id !== userId)
        )
      );

      if (rivalIds.length > 0) {
        const { data: rivalsData, error: rivalsError } = await supabase
          .from('users')
          .select('id, display_name, avatar_url')
          .in('id', rivalIds);
        if (rivalsError) throw rivalsError;

        const nextInfo = (rivalsData ?? []).reduce<Record<string, { name: string; avatarUrl: string | null }>>((acc, row: any) => {
          acc[row.id] = {
            name: row.display_name ?? 'Unknown Player',
            avatarUrl: row.avatar_url ?? null,
          };
          return acc;
        }, {});
        setRivalsInfo(nextInfo);
      } else {
        setRivalsInfo({});
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load profile.';
      Alert.alert('Profile error', message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSelectAvatar = async (emoji: string) => {
    setSavingAvatar(true);
    try {
      const { error } = await supabase.from('users').update({ avatar_url: emoji }).eq('id', userId);
      if (error) throw error;
      setAvatarUrl(emoji);
      setShowAvatarModal(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save avatar.';
      Alert.alert('Error', message);
    } finally {
      setSavingAvatar(false);
    }
  };

  const overall = useMemo(() => {
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;

    matches.forEach((match) => {
      const myScore = match.player_home === userId ? match.score_home : match.score_away;
      const oppScore = match.player_home === userId ? match.score_away : match.score_home;
      goalsFor += myScore;
      goalsAgainst += oppScore;
      if (myScore > oppScore) wins += 1;
      else if (myScore < oppScore) losses += 1;
      else draws += 1;
    });

    const total = matches.length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;

    return { total, wins, losses, draws, goalsFor, goalsAgainst, winRate };
  }, [matches, userId]);

  const recentMatches = useMemo(() => matches.slice(0, 10), [matches]);

  const gameStats = useMemo(() => {
    const map: Record<string, { gameType: string; name: string; matches: number; wins: number; losses: number; draws: number }> = {};

    matches.forEach(match => {
      const gt = match.groups?.game_type;
      if (!gt) return;

      if (!map[gt]) {
        map[gt] = { gameType: gt, name: getGameDisplayName(gt), matches: 0, wins: 0, losses: 0, draws: 0 };
      }

      const myScore = match.player_home === userId ? match.score_home : match.score_away;
      const oppScore = match.player_home === userId ? match.score_away : match.score_home;

      map[gt].matches += 1;
      if (myScore > oppScore) map[gt].wins += 1;
      else if (myScore < oppScore) map[gt].losses += 1;
      else map[gt].draws += 1;
    });

    return Object.values(map)
      .map(stat => ({
        ...stat,
        winRate: stat.matches > 0 ? (stat.wins / stat.matches) * 100 : 0
      }))
      .sort((a, b) => b.matches - a.matches);
  }, [matches, userId]);

  const topRivals = useMemo<RivalStat[]>(() => {
    const map: Record<string, RivalStat> = {};

    matches.forEach((match) => {
      const rivalId = match.player_home === userId ? match.player_away : match.player_home;
      if (!rivalId || rivalId === userId) return;

      const myScore = match.player_home === userId ? match.score_home : match.score_away;
      const oppScore = match.player_home === userId ? match.score_away : match.score_home;

      if (!map[rivalId]) {
        map[rivalId] = {
          rivalId,
          rivalName: rivalsInfo[rivalId]?.name ?? 'Unknown Player',
          matches: 0,
          wins: 0,
          losses: 0,
          draws: 0,
        };
      }

      map[rivalId].matches += 1;
      if (myScore > oppScore) map[rivalId].wins += 1;
      else if (myScore < oppScore) map[rivalId].losses += 1;
      else map[rivalId].draws += 1;
    });

    return Object.values(map).sort((a, b) => b.matches - a.matches).slice(0, 5);
  }, [matches, rivalsInfo, userId]);

  const initial = displayName.trim().charAt(0).toUpperCase() || 'P';

  const renderMemberSince = () => {
    if (!createdAt) return null;
    const date = new Date(createdAt);
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    return <Text style={styles.memberSince}>Member since {month} {year}</Text>;
  };

  const getRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 172800) return 'Yesterday';
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} indicatorStyle="white">
        
        {/* HEADER */}
        <View style={styles.header}>
          <Pressable style={styles.avatarContainer} onPress={() => setShowAvatarModal(true)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{avatarUrl ?? initial}</Text>
            </View>
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={16} color={COLORS.textInverse} />
            </View>
          </Pressable>
          <Text style={styles.name}>{displayName}</Text>
          {renderMemberSince()}
        </View>

        {/* OVERALL STATS CARD */}
        <View style={styles.overallStatsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              <Text style={styles.statValue}>{overall.total}</Text>
              <Text style={styles.statLabel}>Matches</Text>
            </View>
            <View style={[styles.statCell, styles.cellBorderLeft, styles.cellBorderRight]}>
              <Text style={[styles.statValue, { color: COLORS.success }]}>{overall.wins}</Text>
              <Text style={styles.statLabel}>Wins</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statValue, { color: COLORS.error }]}>{overall.losses}</Text>
              <Text style={styles.statLabel}>Losses</Text>
            </View>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              <Text style={[styles.statValue, { color: COLORS.warning }]}>{overall.draws}</Text>
              <Text style={styles.statLabel}>Draws</Text>
            </View>
            <View style={[styles.statCell, styles.cellBorderLeft, styles.cellBorderRight]}>
              <Text style={[styles.statValue, { color: COLORS.primary }]}>{overall.winRate.toFixed(1)}%</Text>
              <Text style={styles.statLabel}>Win Rate</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statValue}>{overall.goalsFor}</Text>
              <Text style={styles.statLabel}>Goals</Text>
            </View>
          </View>
        </View>

        {/* TAB SELECTOR */}
        <View style={styles.tabSelector}>
          <Pressable 
            style={[styles.tabButton, activeTab === 'recent' && styles.tabButtonActive]} 
            onPress={() => setActiveTab('recent')}
          >
            <Text style={[styles.tabText, activeTab === 'recent' && styles.tabTextActive]}>Recent</Text>
          </Pressable>
          <Pressable 
            style={[styles.tabButton, activeTab === 'stats' && styles.tabButtonActive]} 
            onPress={() => setActiveTab('stats')}
          >
            <Text style={[styles.tabText, activeTab === 'stats' && styles.tabTextActive]}>Stats</Text>
          </Pressable>
          <Pressable 
            style={[styles.tabButton, activeTab === 'rivals' && styles.tabButtonActive]} 
            onPress={() => setActiveTab('rivals')}
          >
            <Text style={[styles.tabText, activeTab === 'rivals' && styles.tabTextActive]}>Rivals</Text>
          </Pressable>
        </View>

        {/* TAB CONTENT */}
        <View style={styles.tabContent}>
          {/* RECENT TAB */}
          {activeTab === 'recent' && (
            <View>
              {recentMatches.length === 0 ? (
                <Text style={styles.emptyText}>No matches yet. Start playing!</Text>
              ) : (
                recentMatches.map((match) => {
                  const isHome = match.player_home === userId;
                  const myScore = isHome ? match.score_home : match.score_away;
                  const oppScore = isHome ? match.score_away : match.score_home;
                  
                  const oppId = isHome ? match.player_away : match.player_home;
                  const oppName = rivalsInfo[oppId]?.name ?? 'Unknown Player';
                  
                  const isWin = myScore > oppScore;
                  const isLoss = myScore < oppScore;
                  const resultColor = isWin ? COLORS.success : (isLoss ? COLORS.error : COLORS.warning);

                  return (
                    <View key={match.id} style={styles.recentCard}>
                      <View style={[styles.resultIndicator, { backgroundColor: resultColor }]} />
                      <View style={styles.recentContent}>
                        <View style={styles.recentHeader}>
                          <Text style={styles.recentGroupText}>
                            {getGameEmoji(match.groups?.game_type || '')} {match.groups?.name || 'Unknown Group'}
                          </Text>
                          <Text style={styles.recentTimeText}>{getRelativeTime(match.created_at)}</Text>
                        </View>
                        <View style={styles.recentScoreboard}>
                          <Text style={[styles.recentPlayerText, { color: COLORS.textPrimary, fontWeight: '600' }]} numberOfLines={1}>
                            {displayName}
                          </Text>
                          <View style={styles.recentScoreWrapper}>
                            <Text style={styles.recentScoreText}>{myScore} - {oppScore}</Text>
                          </View>
                          <Text style={[styles.recentPlayerText, { color: COLORS.textSecondary, textAlign: 'right' }]} numberOfLines={1}>
                            {oppName}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* STATS TAB */}
          {activeTab === 'stats' && (
            <View>
              {gameStats.length === 0 ? (
                <Text style={styles.emptyText}>No stats available.</Text>
              ) : (
                gameStats.map((stat) => (
                  <View key={stat.gameType} style={styles.gameStatCard}>
                    <Text style={styles.gameStatTitle}>{getGameEmoji(stat.gameType)} {stat.name}</Text>
                    <View style={styles.gameStatRow}>
                      <View style={styles.gameStatCol}><Text style={styles.gameStatVal}>{stat.matches}</Text><Text style={styles.gameStatLbl}>Matches</Text></View>
                      <View style={styles.gameStatCol}><Text style={styles.gameStatVal}>{stat.wins}</Text><Text style={styles.gameStatLbl}>W</Text></View>
                      <View style={styles.gameStatCol}><Text style={styles.gameStatVal}>{stat.losses}</Text><Text style={styles.gameStatLbl}>L</Text></View>
                      <View style={styles.gameStatCol}><Text style={styles.gameStatVal}>{stat.draws}</Text><Text style={styles.gameStatLbl}>D</Text></View>
                      <View style={styles.gameStatCol}><Text style={[styles.gameStatVal, { color: COLORS.primary }]}>{stat.winRate.toFixed(0)}%</Text><Text style={styles.gameStatLbl}>Rate</Text></View>
                    </View>
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${stat.winRate}%` }]} />
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* RIVALS TAB */}
          {activeTab === 'rivals' && (
            <View>
              {topRivals.length === 0 ? (
                <Text style={styles.emptyText}>No rival data yet.</Text>
              ) : (
                topRivals.map((rival, index) => {
                  const info = rivalsInfo[rival.rivalId];
                  const rivalInitial = (info?.name ?? 'P').trim().charAt(0).toUpperCase();
                  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
                  
                  const winPct = (rival.wins / rival.matches) * 100;
                  const lossPct = (rival.losses / rival.matches) * 100;
                  const drawPct = (rival.draws / rival.matches) * 100;

                  return (
                    <View key={rival.rivalId} style={styles.rivalCard}>
                      <View style={styles.rivalTopRow}>
                        <View style={[styles.rivalAvatar, { backgroundColor: COLORS.primaryMuted }]}>
                          <Text style={styles.rivalAvatarText}>{info?.avatarUrl ?? rivalInitial}</Text>
                        </View>
                        <View style={styles.rivalInfo}>
                          <Text style={styles.rivalName}>{rival.rivalName}</Text>
                          <Text style={styles.rivalSubtitle}>{rival.matches} matches played</Text>
                        </View>
                        <View style={styles.rivalBadges}>
                          <View style={[styles.statPill, styles.winPill]}><Text style={styles.winPillText}>{rival.wins}W</Text></View>
                          <View style={[styles.statPill, styles.lossPill]}><Text style={styles.lossPillText}>{rival.losses}L</Text></View>
                          <View style={[styles.statPill, styles.drawPill]}><Text style={styles.drawPillText}>{rival.draws}D</Text></View>
                        </View>
                      </View>
                      <View style={styles.stackedBar}>
                        {winPct > 0 && <View style={[styles.barSegment, { backgroundColor: COLORS.success, width: `${winPct}%` }]} />}
                        {drawPct > 0 && <View style={[styles.barSegment, { backgroundColor: COLORS.warning, width: `${drawPct}%` }]} />}
                        {lossPct > 0 && <View style={[styles.barSegment, { backgroundColor: COLORS.error, width: `${lossPct}%` }]} />}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </View>

        {/* SIGN OUT */}
        <Pressable style={styles.signOutButton} onPress={onSignOut} disabled={loadingSignOut}>
          {loadingSignOut ? <ActivityIndicator color={COLORS.error} /> : <Text style={styles.signOutText}>Sign Out</Text>}
        </Pressable>
      </ScrollView>

      {/* AVATAR MODAL */}
      <Modal visible={showAvatarModal} transparent animationType="slide" onRequestClose={() => setShowAvatarModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => !savingAvatar && setShowAvatarModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Avatar</Text>
              <Pressable onPress={() => !savingAvatar && setShowAvatarModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.avatarGrid}>
              {AVATAR_OPTIONS.map((emoji, index) => {
                const isSelected = avatarUrl === emoji;
                const bgColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
                return (
                  <Pressable
                    key={emoji}
                    style={[styles.avatarOption, { backgroundColor: bgColor }, isSelected && styles.avatarSelected]}
                    onPress={() => handleSelectAvatar(emoji)}
                    disabled={savingAvatar}
                  >
                    <Text style={styles.avatarOptionText}>{emoji}</Text>
                    {isSelected && (
                      <View style={styles.checkBadge}>
                        <Ionicons name="checkmark" size={14} color={COLORS.textInverse} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: SPACING.screenPadding,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 12,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatarText: {
    fontSize: 48,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  name: {
    fontSize: SIZES.title,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  memberSince: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  overallStatsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
  },
  statsDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  statCell: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellBorderLeft: {
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  cellBorderRight: {
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  tabSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  tabTextActive: {
    color: COLORS.textInverse,
  },
  tabContent: {
    minHeight: 300,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 32,
  },
  recentCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    marginBottom: 8,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  resultIndicator: {
    width: 4,
  },
  recentContent: {
    flex: 1,
    padding: 12,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  recentGroupText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  recentTimeText: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  recentScoreboard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentPlayerText: {
    flex: 1,
    fontSize: 14,
  },
  recentScoreWrapper: {
    paddingHorizontal: 12,
  },
  recentScoreText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },
  gameStatCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  gameStatTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  gameStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  gameStatCol: {
    alignItems: 'center',
  },
  gameStatVal: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  gameStatLbl: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  rivalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  rivalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  rivalAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rivalAvatarText: {
    fontSize: 18,
  },
  rivalInfo: {
    flex: 1,
  },
  rivalName: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  rivalSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  rivalBadges: {
    flexDirection: 'row',
    gap: 4,
  },
  statPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    minWidth: 28,
    alignItems: 'center',
  },
  winPill: { backgroundColor: COLORS.successMuted },
  winPillText: { color: COLORS.success, fontSize: 11, fontWeight: '700' },
  lossPill: { backgroundColor: COLORS.errorMuted },
  lossPillText: { color: COLORS.error, fontSize: 11, fontWeight: '700' },
  drawPill: { backgroundColor: COLORS.warningMuted },
  drawPillText: { color: COLORS.warning, fontSize: 11, fontWeight: '700' },
  stackedBar: {
    height: 3,
    borderRadius: 2,
    flexDirection: 'row',
    overflow: 'hidden',
    width: '100%',
  },
  barSegment: {
    height: '100%',
  },
  signOutButton: {
    height: 48,
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  signOutText: {
    color: COLORS.error,
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    paddingBottom: 20,
  },
  avatarOption: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  avatarSelected: {
    borderColor: COLORS.primary,
  },
  avatarOptionText: {
    fontSize: 40,
  },
  checkBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: COLORS.success,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.card,
  },
});
