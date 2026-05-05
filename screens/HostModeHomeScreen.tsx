import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

type HostModeHomeScreenProps = {
  userId: string;
  onBack: () => void;
  onCreateNew: () => void;
  onOpenTournament: (id: string, name: string) => void;
};

type HostTournament = {
  id: string;
  name: string;
  format: 'knockout' | 'league';
  status: string;
  created_at: string;
  playerCount: number;
};

export function HostModeHomeScreen({ userId, onBack, onCreateNew, onOpenTournament }: HostModeHomeScreenProps) {
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<HostTournament[]>([]);

  useEffect(() => {
    const fetchTournaments = async () => {
      setLoading(true);
      try {
        const { data: tData, error: tError } = await supabase
          .from('host_tournaments')
          .select('*')
          .eq('host_id', userId)
          .order('created_at', { ascending: false });

        if (tError) throw tError;

        if (!tData || tData.length === 0) {
          setTournaments([]);
          return;
        }

        const ids = tData.map(t => t.id);
        const { data: pData, error: pError } = await supabase
          .from('host_tournament_players')
          .select('host_tournament_id')
          .in('host_tournament_id', ids);

        if (pError) throw pError;

        const counts: Record<string, number> = {};
        pData?.forEach(p => {
          counts[p.host_tournament_id] = (counts[p.host_tournament_id] || 0) + 1;
        });

        const enriched = tData.map(t => ({
          ...t,
          playerCount: counts[t.id] || 0,
        }));

        setTournaments(enriched);
      } catch (error) {
        console.error('Error fetching host tournaments:', error);
        Alert.alert('Error', 'Could not load your tournaments.');
      } finally {
        setLoading(false);
      }
    };

    void fetchTournaments();
  }, [userId]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Host Mode</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Run tournaments from one device. Add guests, manage fixtures, and enter scores yourself.
        </Text>

        <Pressable style={styles.createButton} onPress={onCreateNew}>
          <Ionicons name="add-circle" size={20} color={COLORS.textInverse} />
          <Text style={styles.createButtonText}>Create Host Tournament</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>My Hosted Tournaments</Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
          </View>
        ) : tournaments.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-circle-outline" size={64} color={COLORS.textMuted} />
            <Text style={styles.emptyStateTitle}>No hosted tournaments yet</Text>
            <Text style={styles.emptyStateText}>
              Create one to run a tournament with guest players from your phone.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {tournaments.map(t => {
              const date = new Date(t.created_at).toLocaleDateString();
              return (
                <Pressable 
                  key={t.id} 
                  style={styles.card} 
                  onPress={() => onOpenTournament(t.id, t.name)}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{t.name}</Text>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>{t.status.toUpperCase()}</Text>
                    </View>
                  </View>
                  <View style={styles.cardRow}>
                    <View style={styles.infoCol}>
                      <Ionicons name="trophy-outline" size={16} color={COLORS.textMuted} />
                      <Text style={styles.infoText}>{t.format === 'league' ? 'League' : 'Knockout'}</Text>
                    </View>
                    <View style={styles.infoCol}>
                      <Ionicons name="people-outline" size={16} color={COLORS.textMuted} />
                      <Text style={styles.infoText}>{t.playerCount} Guests</Text>
                    </View>
                    <View style={styles.infoCol}>
                      <Ionicons name="calendar-outline" size={16} color={COLORS.textMuted} />
                      <Text style={styles.infoText}>{date}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  headerButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary },
  content: { padding: SPACING.screenPadding, paddingBottom: 40 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 24, textAlign: 'center' },
  createButton: { flexDirection: 'row', height: 56, backgroundColor: COLORS.primary, borderRadius: RADIUS.button, justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 32 },
  createButtonText: { color: COLORS.textInverse, fontSize: 16, fontWeight: '700' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 16 },
  center: { alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, backgroundColor: COLORS.surface, borderRadius: RADIUS.card },
  emptyStateTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary, marginTop: 16, marginBottom: 8 },
  emptyStateText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: 24 },
  list: { gap: 12 },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.card, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, marginRight: 12 },
  statusBadge: { backgroundColor: COLORS.surface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '800', color: COLORS.primary },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoCol: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
});
