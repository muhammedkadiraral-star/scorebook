import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';

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

export function ProfileScreen({ userId, onBack, onSignOut, loadingSignOut }: ProfileScreenProps) {
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('Player');
  const [groups, setGroups] = useState<{ id: string; name: string; winRate: number }[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [rivalNames, setRivalNames] = useState<Record<string, string>>({});

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: profileData, error: profileError }, { data: groupData, error: groupError }, { data: matchData, error: matchError }] =
        await Promise.all([
          supabase.from('users').select('display_name').eq('id', userId).maybeSingle(),
          supabase.from('group_members').select('groups(id, name)').eq('user_id', userId),
          supabase
            .from('matches')
            .select('id, group_id, player_home, player_away, score_home, score_away')
            .or(`player_home.eq.${userId},player_away.eq.${userId}`),
        ]);

      if (profileError) throw profileError;
      if (groupError) throw groupError;
      if (matchError) throw matchError;

      setDisplayName(profileData?.display_name ?? 'Player');

      const parsedGroups = ((groupData ?? []) as GroupRow[])
        .map((row) => row.groups)
        .filter((group): group is NonNullable<GroupRow['groups']> => Boolean(group));

      const allMatches = (matchData ?? []) as MatchRow[];
      setMatches(allMatches);

      const groupsWithRates = parsedGroups.map((group) => {
        const groupMatches = allMatches.filter((match) => match.group_id === group.id);
        if (groupMatches.length === 0) {
          return { id: group.id, name: group.name, winRate: 0 };
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
          .select('id, display_name')
          .in('id', rivalIds);
        if (rivalsError) throw rivalsError;

        const nextNames = (rivalsData ?? []).reduce<Record<string, string>>((acc, row: any) => {
          acc[row.id] = row.display_name ?? 'Unknown Player';
          return acc;
        }, {});
        setRivalNames(nextNames);
      } else {
        setRivalNames({});
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
          rivalName: rivalNames[rivalId] ?? 'Unknown Player',
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
  }, [matches, rivalNames, userId]);

  const initial = displayName.trim().charAt(0).toUpperCase() || 'P';

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color="#6C5CE7" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable onPress={onBack}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.headerCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.name}>{displayName}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>All Groups</Text>
          {groups.length === 0 ? (
            <Text style={styles.mutedText}>No groups yet.</Text>
          ) : (
            groups.map((group) => (
              <View key={group.id} style={styles.itemCard}>
                <Text style={styles.itemTitle}>{group.name}</Text>
                <Text style={styles.itemMeta}>Win Rate: {group.winRate.toFixed(1)}%</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overall Stats</Text>
          <View style={styles.itemCard}>
            <Text style={styles.itemMeta}>Total Matches: {overall.total}</Text>
            <Text style={styles.itemMeta}>Wins: {overall.wins}</Text>
            <Text style={styles.itemMeta}>Losses: {overall.losses}</Text>
            <Text style={styles.itemMeta}>Draws: {overall.draws}</Text>
            <Text style={styles.itemMeta}>Win Rate: {overall.winRate.toFixed(1)}%</Text>
            <Text style={styles.itemMeta}>Goals Scored: {overall.goalsFor}</Text>
            <Text style={styles.itemMeta}>Goals Conceded: {overall.goalsAgainst}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Rivals</Text>
          {topRivals.length === 0 ? (
            <Text style={styles.mutedText}>No rival data yet.</Text>
          ) : (
            topRivals.map((rival) => (
              <View key={rival.rivalId} style={styles.itemCard}>
                <Text style={styles.itemTitle}>{rival.rivalName}</Text>
                <Text style={styles.itemMeta}>
                  {rival.matches} matches - W:{rival.wins} L:{rival.losses} D:{rival.draws}
                </Text>
              </View>
            ))
          )}
        </View>

        <Pressable style={[styles.signOutButton, loadingSignOut && styles.buttonDisabled]} onPress={onSignOut} disabled={loadingSignOut}>
          <Text style={styles.signOutButtonText}>{loadingSignOut ? 'Signing out...' : 'Sign Out'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 20,
    paddingBottom: 28,
  },
  backText: {
    color: '#6C5CE7',
    fontWeight: '600',
    marginBottom: 12,
  },
  headerCard: {
    alignItems: 'center',
    marginBottom: 18,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '700',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F1F1F',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F1F1F',
    marginBottom: 8,
  },
  itemCard: {
    borderWidth: 1,
    borderColor: '#E9E9EF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F1F1F',
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 14,
    color: '#5F5F69',
    marginBottom: 2,
  },
  mutedText: {
    color: '#6F6F76',
    fontSize: 14,
  },
  signOutButton: {
    marginTop: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signOutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
