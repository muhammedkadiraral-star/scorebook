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

type GroupRow = {
  groups: {
    id: string;
    name: string;
    game_type: string;
  } | null;
};

type MatchRow = {
  id: string;
  group_id: string;
  player_home: string;
  player_away: string;
  score_home: number;
  score_away: number;
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
  const [groups, setGroups] = useState<{ id: string; name: string; gameType: string; winRate: number }[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [rivalsInfo, setRivalsInfo] = useState<Record<string, { name: string; avatarUrl: string | null }>>({});
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: profileData, error: profileError }, { data: groupData, error: groupError }, { data: matchData, error: matchError }] =
        await Promise.all([
          supabase.from('users').select('display_name, avatar_url').eq('id', userId).maybeSingle(),
          supabase.from('group_members').select('groups(id, name, game_type)').eq('user_id', userId),
          supabase
            .from('matches')
            .select('id, group_id, player_home, player_away, score_home, score_away')
            .or(`player_home.eq.${userId},player_away.eq.${userId}`),
        ]);

      if (profileError) throw profileError;
      if (groupError) throw groupError;
      if (matchError) throw matchError;

      setDisplayName(profileData?.display_name ?? 'Player');
      setAvatarUrl(profileData?.avatar_url ?? null);

      const parsedGroups = ((groupData ?? []) as unknown as GroupRow[])
        .map((row) => row.groups)
        .filter((group): group is NonNullable<GroupRow['groups']> => Boolean(group));

      const allMatches = (matchData ?? []) as MatchRow[];
      setMatches(allMatches);

      const groupsWithRates = parsedGroups.map((group) => {
        const groupMatches = allMatches.filter((match) => match.group_id === group.id);
        if (groupMatches.length === 0) {
          return { id: group.id, name: group.name, gameType: group.game_type, winRate: 0 };
        }

        let wins = 0;
        groupMatches.forEach((match) => {
          const myScore = match.player_home === userId ? match.score_home : match.score_away;
          const oppScore = match.player_home === userId ? match.score_away : match.score_home;
          if (myScore > oppScore) wins += 1;
        });

        return {
          id: group.id,
          name: group.name,
          gameType: group.game_type,
          winRate: (wins / groupMatches.length) * 100,
        };
      });
      setGroups(groupsWithRates);

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

    return Object.values(map).sort((a, b) => b.matches - a.matches);
  }, [matches, rivalsInfo, userId]);

  const initial = displayName.trim().charAt(0).toUpperCase() || 'P';

  const renderStatCard = (value: string | number, label: string) => (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.avatarContainer} onPress={() => setShowAvatarModal(true)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{avatarUrl ?? initial}</Text>
            </View>
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={16} color="#FFFFFF" />
            </View>
          </Pressable>
          <Text style={styles.name}>{displayName}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overall Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statsRow}>
              {renderStatCard(overall.total, 'Matches')}
              {renderStatCard(overall.wins, 'Wins')}
              {renderStatCard(overall.losses, 'Losses')}
            </View>
            <View style={styles.statsRow}>
              {renderStatCard(overall.draws, 'Draws')}
              {renderStatCard(`${overall.winRate.toFixed(1)}%`, 'Win Rate')}
              {renderStatCard(overall.goalsFor, 'Goals')}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>All Groups</Text>
          {groups.length === 0 ? (
            <Text style={styles.mutedText}>No groups yet.</Text>
          ) : (
            groups.map((group) => {
              const emoji = getGameEmoji(group.gameType);
              const gameName = getGameDisplayName(group.gameType);
              return (
                <View key={group.id} style={styles.groupCard}>
                  <View style={styles.groupEmojiContainer}>
                    <Text style={styles.groupEmojiText}>{emoji}</Text>
                  </View>
                  <View style={styles.groupInfo}>
                    <Text style={styles.groupName}>{group.name}</Text>
                    <Text style={styles.groupSubtitle}>Win Rate: {group.winRate.toFixed(1)}% · {gameName}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Rivals</Text>
          {topRivals.length === 0 ? (
            <Text style={styles.mutedText}>No rival data yet.</Text>
          ) : (
            topRivals.map((rival, index) => {
              const info = rivalsInfo[rival.rivalId];
              const rivalInitial = (info?.name ?? 'P').trim().charAt(0).toUpperCase();
              const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];

              return (
                <View key={rival.rivalId} style={styles.rivalCard}>
                  <View style={[styles.rivalAvatar, { backgroundColor: avatarColor }]}>
                    <Text style={styles.rivalAvatarText}>{info?.avatarUrl ?? rivalInitial}</Text>
                  </View>
                  <View style={styles.rivalInfo}>
                    <Text style={styles.rivalName}>{rival.rivalName}</Text>
                    <Text style={styles.rivalSubtitle}>{rival.matches} {rival.matches === 1 ? 'match' : 'matches'} played</Text>
                  </View>
                  <View style={styles.rivalBadges}>
                    <View style={[styles.statPill, styles.winPill]}>
                      <Text style={[styles.statPillText, styles.winPillText]}>{rival.wins}W</Text>
                    </View>
                    <View style={[styles.statPill, styles.lossPill]}>
                      <Text style={[styles.statPillText, styles.lossPillText]}>{rival.losses}L</Text>
                    </View>
                    <View style={[styles.statPill, styles.drawPill]}>
                      <Text style={[styles.statPillText, styles.drawPillText]}>{rival.draws}D</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <Pressable style={styles.signOutButton} onPress={onSignOut} disabled={loadingSignOut}>
          {loadingSignOut ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.signOutText}>Sign Out</Text>}
        </Pressable>
      </ScrollView>

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
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
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
  content: {
    padding: SPACING.screenPadding,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
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
    borderColor: '#FFFFFF',
  },
  name: {
    fontSize: SIZES.title,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  section: {
    marginBottom: SPACING.sectionGap,
  },
  sectionTitle: {
    fontSize: SIZES.sectionTitle,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  statsGrid: {
    gap: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
  },
  groupEmojiContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  groupEmojiText: {
    fontSize: 24,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: SIZES.cardTitle,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  groupSubtitle: {
    fontSize: SIZES.secondary,
    color: COLORS.textSecondary,
  },
  rivalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  rivalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rivalAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  rivalInfo: {
    flex: 1,
  },
  rivalName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  rivalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  rivalBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  statPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 32,
    alignItems: 'center',
  },
  statPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  winPill: {
    backgroundColor: '#DCFCE7',
  },
  winPillText: {
    color: '#16A34A',
  },
  lossPill: {
    backgroundColor: '#FEE2E2',
  },
  lossPillText: {
    color: '#DC2626',
  },
  drawPill: {
    backgroundColor: '#FEF3C7',
  },
  drawPillText: {
    color: '#D97706',
  },
  signOutButton: {
    height: 52,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.button,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  signOutText: {
    color: COLORS.error,
    fontSize: 16,
    fontWeight: '700',
  },
  mutedText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
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
    borderColor: '#FFFFFF',
  },
});
