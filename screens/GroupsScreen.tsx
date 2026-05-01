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
import { supabase } from '../lib/supabase';
import { CreateGroupModal } from './CreateGroupModal';
import { JoinGroupModal } from './JoinGroupModal';

type Group = {
  id: string;
  name: string;
  game_type: string;
  memberCount: number;
};

type GroupsScreenProps = {
  userId: string;
  onSignOut: () => Promise<void>;
  loadingSignOut: boolean;
  onOpenGroup: (group: { id: string; name: string }) => void;
  onOpenProfile: () => void;
};

type MemberGroupRow = {
  groups: {
    id: string;
    name: string;
    game_type: string | null;
  } | null;
};

type GroupMemberRow = {
  group_id: string;
};

export function GroupsScreen({ userId, onSignOut, loadingSignOut, onOpenGroup, onOpenProfile }: GroupsScreenProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [createVisible, setCreateVisible] = useState(false);
  const [joinVisible, setJoinVisible] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const { data: membershipData, error: membershipError } = await supabase
        .from('group_members')
        .select(
          `
          groups (
            id,
            name,
            game_type
          )
        `
        )
        .eq('user_id', userId);

      if (membershipError) throw membershipError;

      const parsedMemberships = (membershipData ?? []) as MemberGroupRow[];
      const rawGroups = parsedMemberships
        .map((row) => row.groups)
        .filter((group): group is NonNullable<MemberGroupRow['groups']> => Boolean(group));

      if (rawGroups.length === 0) {
        setGroups([]);
        return;
      }

      const groupIds = rawGroups.map((group) => group.id);
      const { data: membersData, error: membersError } = await supabase
        .from('group_members')
        .select('group_id')
        .in('group_id', groupIds);

      if (membersError) throw membersError;

      const memberRows = (membersData ?? []) as GroupMemberRow[];
      const counts = memberRows.reduce<Record<string, number>>((acc, row) => {
        acc[row.group_id] = (acc[row.group_id] ?? 0) + 1;
        return acc;
      }, {});

      const nextGroups = rawGroups.map((group) => ({
        id: group.id,
        name: group.name,
        game_type: group.game_type ?? 'FIFA',
        memberCount: counts[group.id] ?? 0,
      }));

      setGroups(nextGroups);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load groups.';
      Alert.alert('Groups error', message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const renderGroupCard = ({ item }: { item: Group }) => (
    <Pressable style={styles.groupCard} onPress={() => onOpenGroup({ id: item.id, name: item.name })}>
      <Text style={styles.groupName}>{item.name}</Text>
      <Text style={styles.groupMeta}>{item.memberCount} members</Text>
      <Text style={styles.groupMeta}>Game: {item.game_type}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>My Groups</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={onOpenProfile}>
            <Text style={styles.profileText}>Profile</Text>
          </Pressable>
          <Pressable onPress={onSignOut} disabled={loadingSignOut}>
            <Text style={styles.signOutText}>{loadingSignOut ? 'Signing out...' : 'Sign Out'}</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#6C5CE7" />
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={renderGroupCard}
          ListEmptyComponent={<Text style={styles.emptyText}>You are not in any groups yet.</Text>}
          contentContainerStyle={groups.length === 0 ? styles.emptyWrap : styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.footerButtons}>
        <Pressable style={styles.secondaryButton} onPress={() => setJoinVisible(true)}>
          <Text style={styles.secondaryButtonText}>Join with Code</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={() => setCreateVisible(true)}>
          <Text style={styles.primaryButtonText}>Create New Group</Text>
        </Pressable>
      </View>

      <CreateGroupModal
        visible={createVisible}
        userId={userId}
        onClose={() => setCreateVisible(false)}
        onCreated={loadGroups}
      />
      <JoinGroupModal
        visible={joinVisible}
        userId={userId}
        onClose={() => setJoinVisible(false)}
        onJoined={loadGroups}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F1F1F',
  },
  signOutText: {
    color: '#6C5CE7',
    fontWeight: '600',
    fontSize: 14,
  },
  profileText: {
    color: '#6C5CE7',
    fontWeight: '600',
    fontSize: 14,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 12,
    gap: 12,
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E9E9EF',
    padding: 16,
    marginBottom: 12,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F1F1F',
    marginBottom: 6,
  },
  groupMeta: {
    fontSize: 14,
    color: '#6F6F76',
  },
  emptyWrap: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#6F6F76',
    fontSize: 15,
    textAlign: 'center',
  },
  footerButtons: {
    gap: 10,
    marginTop: 8,
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#6C5CE7',
    fontSize: 16,
    fontWeight: '600',
  },
});
