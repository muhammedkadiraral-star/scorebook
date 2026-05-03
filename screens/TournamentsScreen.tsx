import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS, RADIUS, SIZES, SPACING } from '../constants/theme';
import { GAMES, getGameDisplayName, getGameEmoji } from '../constants/games';

type Tournament = {
  id: string;
  name: string;
  game_type: string;
  status: 'open' | 'in_progress' | 'completed';
  format: string;
  max_participants: number;
  current_participants: number;
  is_public: boolean;
  created_by: string;
  creator_name?: string;
};

type TournamentsScreenProps = {
  userId: string;
  onOpenTournament: (t: Tournament) => void;
};

export function TournamentsScreen({ userId, onOpenTournament }: TournamentsScreenProps) {
  const [myTournaments, setMyTournaments] = useState<Tournament[]>([]);
  const [openTournaments, setOpenTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedGameFilter, setSelectedGameFilter] = useState('All');

  const fetchTournaments = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch my participations
      const { data: participations, error: partError } = await supabase
        .from('tournament_participants')
        .select('tournament_id')
        .eq('user_id', userId);
      
      if (partError) throw partError;
      const joinedIds = participations.map(p => p.tournament_id);

      // 2. Fetch my tournaments (created or joined)
      const { data: myData, error: myError } = await supabase
        .from('tournaments')
        .select('*, users!created_by(display_name), tournament_participants(count)')
        .or(`created_by.eq.${userId}${joinedIds.length > 0 ? `,id.in.(${joinedIds.join(',')})` : ''}`)
        .order('created_at', { ascending: false });

      if (myError) throw myError;

      // 3. Fetch open public tournaments
      const { data: openData, error: openError } = await supabase
        .from('tournaments')
        .select('*, users!created_by(display_name), tournament_participants(count)')
        .eq('is_public', true)
        .eq('status', 'open')
        .not('created_by', 'eq', userId)
        .order('created_at', { ascending: false });

      if (openError) throw openError;

      const formatTournament = (t: any): Tournament => ({
        ...t,
        current_participants: t.tournament_participants?.[0]?.count ?? 0,
        creator_name: t.users?.display_name ?? 'Unknown',
      });

      const formattedMy = (myData ?? []).map(formatTournament);
      const formattedOpen = (openData ?? [])
        .filter(t => !joinedIds.includes(t.id))
        .map(formatTournament);

      setMyTournaments(formattedMy);
      setOpenTournaments(formattedOpen);
    } catch (error) {
      console.error('Error fetching tournaments:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchTournaments();
  }, [fetchTournaments]);

  const handleSearch = async () => {
    const code = searchText.trim().toUpperCase();
    if (code.length === 8) {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('tournaments')
          .select('*, users!created_by(display_name), tournament_participants(count)')
          .eq('invite_code', code)
          .maybeSingle();

        if (data) {
          const formatted = {
            ...data,
            current_participants: data.tournament_participants?.[0]?.count ?? 0,
            creator_name: data.users?.display_name ?? 'Unknown',
          };
          onOpenTournament(formatted as Tournament);
          setSearchText('');
        }
      } catch (error) {
        console.error('Error searching by code:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const filteredMy = useMemo(() => {
    return myTournaments.filter(t => 
      t.name.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [myTournaments, searchText]);

  const filteredDiscover = useMemo(() => {
    return openTournaments.filter(t => {
      const matchesSearch = t.name.toLowerCase().includes(searchText.toLowerCase());
      const matchesFilter = selectedGameFilter === 'All' || t.game_type === selectedGameFilter;
      return matchesSearch && matchesFilter;
    });
  }, [openTournaments, searchText, selectedGameFilter]);

  const joinTournament = async (t: Tournament) => {
    try {
      const { error } = await supabase.from('tournament_participants').insert({
        tournament_id: t.id,
        user_id: userId,
        seed: t.current_participants + 1,
      });
      if (error) throw error;
      fetchTournaments();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not join tournament.';
      Alert.alert('Error', message);
    }
  };

  const renderBadge = (status: Tournament['status']) => {
    let bgColor = COLORS.surface;
    let textColor = COLORS.textSecondary;
    let label = status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');

    if (status === 'open') {
      bgColor = COLORS.successMuted;
      textColor = COLORS.success;
    } else if (status === 'in_progress') {
      bgColor = COLORS.primaryMuted;
      textColor = COLORS.primary;
    } else if (status === 'completed') {
      bgColor = COLORS.surface;
      textColor = COLORS.textMuted;
    }

    return (
      <View style={[styles.badge, { backgroundColor: bgColor }]}>
        <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
      </View>
    );
  };

  const renderTournamentCard = ({ item, showJoin }: { item: Tournament, showJoin?: boolean }) => (
    <Pressable style={styles.card} onPress={() => onOpenTournament(item)}>
      <View style={styles.cardTop}>
        <View style={styles.gameIconContainer}>
          <Text style={styles.gameEmoji}>{getGameEmoji(item.game_type)}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
        {renderBadge(item.status)}
      </View>
      
      <Text style={styles.cardSubtitle}>
        {item.current_participants}/{item.max_participants} players · {getGameDisplayName(item.game_type)} · {item.format.charAt(0).toUpperCase() + item.format.slice(1)}
      </Text>
      
      <View style={styles.cardFooter}>
        <Text style={styles.creatorText}>Created by {item.creator_name}</Text>
        {showJoin && item.status === 'open' && (
          <Pressable style={styles.joinBtn} onPress={() => joinTournament(item)}>
            <Text style={styles.joinBtnText}>Join</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );

  const gameFilters = ['All', ...GAMES.map(g => g.gameType)];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tournaments</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search tournaments or enter invite code"
          placeholderTextColor={COLORS.textMuted}
          value={searchText}
          onChangeText={setSearchText}
          autoCapitalize="none"
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} indicatorStyle="white">
          {/* My Tournaments */}
          <Text style={styles.sectionHeader}>My Tournaments</Text>
          {filteredMy.length === 0 ? (
            <Text style={styles.emptyText}>You haven't joined any tournaments yet</Text>
          ) : (
            filteredMy.map(t => <View key={t.id}>{renderTournamentCard({ item: t })}</View>)
          )}

          {/* Discover */}
          <Text style={styles.sectionHeader}>Discover</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContainer}>
            {gameFilters.map(game => (
              <Pressable
                key={game}
                style={[styles.filterChip, selectedGameFilter === game && styles.filterChipActive]}
                onPress={() => setSelectedGameFilter(game)}
              >
                <Text style={[styles.filterText, selectedGameFilter === game && styles.filterTextActive]}>
                  {game === 'All' ? 'All' : getGameDisplayName(game)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {filteredDiscover.length === 0 ? (
            <View style={styles.emptyDiscover}>
              <Ionicons name="trophy-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyDiscoverText}>No public tournaments found</Text>
            </View>
          ) : (
            filteredDiscover.map(t => <View key={t.id}>{renderTournamentCard({ item: t, showJoin: true })}</View>)
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACING.screenPadding, paddingTop: 12, paddingBottom: 16 },
  title: { fontSize: SIZES.title, fontWeight: '700', color: COLORS.textPrimary },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginHorizontal: SPACING.screenPadding,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 8,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary },
  scrollContent: { paddingBottom: 40 },
  sectionHeader: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: COLORS.textPrimary, 
    marginTop: 24, 
    marginBottom: 12,
    marginHorizontal: SPACING.screenPadding 
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { marginHorizontal: SPACING.screenPadding, color: COLORS.textMuted, fontSize: 14 },
  filterContainer: { paddingHorizontal: SPACING.screenPadding, marginBottom: 16, gap: 8 },
  filterChip: { 
    paddingHorizontal: 16, 
    paddingVertical: 8, 
    borderRadius: 20, 
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipActive: { backgroundColor: COLORS.primaryMuted, borderColor: COLORS.primary },
  filterText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  filterTextActive: { color: COLORS.primary },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginHorizontal: SPACING.screenPadding,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  gameIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  gameEmoji: { fontSize: 20 },
  cardTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: COLORS.textPrimary },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardSubtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 12 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  creatorText: { fontSize: 13, color: COLORS.textMuted },
  joinBtn: { 
    paddingHorizontal: 16, 
    paddingVertical: 6, 
    borderRadius: 8, 
    backgroundColor: COLORS.primary 
  },
  joinBtnText: { color: COLORS.textInverse, fontSize: 13, fontWeight: '700' },
  emptyDiscover: { alignItems: 'center', marginTop: 40, gap: 12 },
  emptyDiscoverText: { color: COLORS.textMuted, fontSize: 14 },
});
