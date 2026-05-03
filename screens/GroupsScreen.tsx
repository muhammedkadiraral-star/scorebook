import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS, RADIUS, SIZES, SPACING } from '../constants/theme';
import { getGameDisplayName, getGameEmoji } from '../constants/games';

type Group = {
  id: string;
  name: string;
  game_type: string;
  _count: {
    group_members: number;
  };
};

type GroupsScreenProps = {
  userId: string;
  onOpenGroup: (group: { id: string; name: string }) => void;
};

export function GroupsScreen({ userId, onOpenGroup }: GroupsScreenProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchGroups = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('groups')
        .select(`
          id,
          name,
          game_type,
          group_members!inner(user_id),
          _count:group_members(count)
        `)
        .eq('group_members.user_id', userId);

      if (error) throw error;
      setGroups((data ?? []) as unknown as Group[]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not fetch groups.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  const onRefresh = () => {
    setRefreshing(true);
    void fetchGroups();
  };

  const renderGroupItem = ({ item }: { item: Group }) => {
    const memberCount = item._count?.group_members ?? 0;
    const gameName = getGameDisplayName(item.game_type);
    const emoji = getGameEmoji(item.game_type);

    return (
      <Pressable
        style={({ pressed }) => [styles.groupCard, pressed && styles.pressed]}
        onPress={() => onOpenGroup({ id: item.id, name: item.name })}
      >
        <View style={styles.emojiContainer}>
          <Text style={styles.emojiText}>{emoji}</Text>
        </View>
        <View style={styles.groupInfo}>
          <Text style={styles.groupName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.groupSubtitle}>
            {memberCount} {memberCount === 1 ? 'member' : 'members'} · {gameName}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
      </Pressable>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="people-outline" size={48} color={COLORS.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>No groups yet</Text>
      <Text style={styles.emptySubtitle}>Create a group or join one with a code to start tracking scores.</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Groups</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={renderGroupItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          onRefresh={onRefresh}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
          indicatorStyle="white"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    fontSize: SIZES.title,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: SPACING.screenPadding,
    paddingBottom: 100,
    flexGrow: 1,
  },
  groupCard: {
    height: 100,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  pressed: {
    backgroundColor: COLORS.surface,
  },
  emojiContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  emojiText: {
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: SIZES.sectionTitle,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: SIZES.body,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
