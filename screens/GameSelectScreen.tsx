import { useEffect, useState } from 'react';
import {
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
import { GAMES } from '../constants/games';

type GameSelectScreenProps = {
  userId: string;
  onBack: () => void;
  onSelectGame: (gameType: string) => void;
};

export function GameSelectScreen({ userId, onBack, onSelectGame }: GameSelectScreenProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const { data, error } = await supabase
          .from('groups')
          .select('game_type, group_members!inner(user_id)')
          .eq('group_members.user_id', userId);

        if (error) throw error;

        const nextCounts: Record<string, number> = {};
        (data ?? []).forEach((row) => {
          nextCounts[row.game_type] = (nextCounts[row.game_type] ?? 0) + 1;
        });
        setCounts(nextCounts);
      } catch (err) {
        console.error('Count fetch error:', err);
      }
    };
    void fetchCounts();
  }, [userId]);

  const renderGameRow = ({ item }: { item: (typeof GAMES)[0] }) => {
    const count = counts[item.gameType] ?? 0;

    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        onPress={() => onSelectGame(item.gameType)}
      >
        <View style={styles.emojiContainer}>
          <Text style={styles.emojiText}>{item.emoji}</Text>
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.gameName}>{item.displayName}</Text>
          {count > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{count}</Text>
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={onBack}>
          <Ionicons name="close" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Select Game</Text>
        <View style={styles.headerButton} />
      </View>

      <FlatList
        data={GAMES}
        keyExtractor={(item) => item.key}
        renderItem={renderGameRow}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  list: {
    paddingBottom: 40,
  },
  row: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.screenPadding,
  },
  pressed: {
    backgroundColor: COLORS.surface,
  },
  emojiContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  emojiText: {
    fontSize: 20,
  },
  rowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: 12,
  },
  gameName: {
    fontSize: 17,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  badge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: SPACING.screenPadding + 40 + 16, // Icon width + margin
  },
});
