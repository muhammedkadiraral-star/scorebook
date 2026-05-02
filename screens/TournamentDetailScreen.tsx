import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS, RADIUS, SIZES, SPACING } from '../constants/theme';
import { getGameDisplayName, getGameEmoji } from '../constants/games';

type TournamentDetailScreenProps = {
  userId: string;
  tournamentId: string;
  tournamentName: string;
  onBack: () => void;
};

type Tournament = {
  id: string;
  name: string;
  description: string | null;
  rules: string | null;
  game_type: string;
  format: 'knockout' | 'league';
  max_participants: number;
  status: 'open' | 'in_progress' | 'completed';
  invite_code: string;
  is_public: boolean;
  created_by: string;
};

type Participant = {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  seed: number;
};

type TournamentMatch = {
  id: string;
  round: number;
  match_order: number;
  player1_id: string | null;
  player2_id: string | null;
  score1: number | null;
  score2: number | null;
  winner_id: string | null;
  status: 'pending' | 'completed';
};

type LeagueStanding = {
  playerId: string;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
};

export function TournamentDetailScreen({ userId, tournamentId, onBack }: TournamentDetailScreenProps) {
  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [activeTab, setActiveTab] = useState<'bracket' | 'participants' | 'table'>('bracket');
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Score modal state
  const [scoreModalMatch, setScoreModalMatch] = useState<TournamentMatch | null>(null);
  const [score1, setScore1] = useState('');
  const [score2, setScore2] = useState('');
  const [savingScore, setSavingScore] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: tData, error: tError }, { data: pData, error: pError }, { data: mData, error: mError }] = 
        await Promise.all([
          supabase.from('tournaments').select('*, created_by').eq('id', tournamentId).single(),
          supabase.from('tournament_participants').select('*, users(display_name, avatar_url)').eq('tournament_id', tournamentId),
          supabase.from('tournament_matches').select('*').eq('tournament_id', tournamentId).order('round').order('match_order'),
        ]);

      if (tError) throw tError;
      if (pError) throw pError;
      if (mError) throw mError;

      setTournament(tData);
      setParticipants((pData ?? []).map(p => ({
        id: p.id,
        user_id: p.user_id,
        display_name: p.users?.display_name ?? 'Unknown',
        avatar_url: p.users?.avatar_url ?? null,
        seed: p.seed,
      })));
      setMatches(mData ?? []);
      
      if (tData.format === 'league') {
        setActiveTab('table');
      }
    } catch (error) {
      console.error('Error loading tournament data:', error);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const isParticipant = useMemo(() => participants.some(p => p.user_id === userId), [participants, userId]);
  const isCreator = !!tournament?.created_by && !!userId && tournament.created_by === userId;

  const standings = useMemo<LeagueStanding[]>(() => {
    if (tournament?.format !== 'league') return [];
    
    const stats: Record<string, LeagueStanding> = {};
    participants.forEach(p => {
      stats[p.user_id] = {
        playerId: p.user_id,
        name: p.display_name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0,
      };
    });

    matches.filter(m => m.status === 'completed').forEach(m => {
      if (!m.player1_id || !m.player2_id) return;
      const s1 = m.score1 ?? 0;
      const s2 = m.score2 ?? 0;

      const p1 = stats[m.player1_id];
      const p2 = stats[m.player2_id];
      if (!p1 || !p2) return;

      p1.played += 1; p2.played += 1;
      p1.gf += s1; p1.ga += s2;
      p2.gf += s2; p2.ga += s1;
      p1.gd = p1.gf - p1.ga;
      p2.gd = p2.gf - p2.ga;

      if (s1 > s2) {
        p1.wins += 1; p1.pts += 3;
        p2.losses += 1;
      } else if (s2 > s1) {
        p2.wins += 1; p2.pts += 3;
        p1.losses += 1;
      } else {
        p1.draws += 1; p1.pts += 1;
        p2.draws += 1; p2.pts += 1;
      }
    });

    return Object.values(stats).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  }, [participants, matches, tournament]);

  const startTournament = async () => {
    if (!tournament || participants.length < (tournament.format === 'league' ? 3 : 4)) {
      Alert.alert('Cannot start', `Minimum ${tournament?.format === 'league' ? 3 : 4} participants required.`);
      return;
    }

    try {
      setLoading(true);
      const { error: tError } = await supabase.from('tournaments').update({ status: 'in_progress' }).eq('id', tournamentId);
      if (tError) throw tError;

      const shuffled = [...participants].sort(() => Math.random() - 0.5);
      const newMatches = [];

      if (tournament.format === 'knockout') {
        const round1Count = participants.length === 16 ? 8 : participants.length >= 8 ? 4 : 2;
        for (let i = 0; i < round1Count; i++) {
          newMatches.push({
            tournament_id: tournamentId,
            round: 1,
            match_order: i + 1,
            player1_id: shuffled[i * 2]?.user_id ?? null,
            player2_id: shuffled[i * 2 + 1]?.user_id ?? null,
            status: 'pending',
          });
        }
      } else {
        // Round-robin for League
        for (let i = 0; i < shuffled.length; i++) {
          for (let j = i + 1; j < shuffled.length; j++) {
            newMatches.push({
              tournament_id: tournamentId,
              round: 1,
              match_order: newMatches.length + 1,
              player1_id: shuffled[i].user_id,
              player2_id: shuffled[j].user_id,
              status: 'pending',
            });
          }
        }
      }

      const { error: mError } = await supabase.from('tournament_matches').insert(newMatches);
      if (mError) throw mError;

      loadData();
    } catch (error) {
      Alert.alert('Error', 'Could not start tournament.');
    } finally {
      setLoading(false);
    }
  };

  const saveScore = async () => {
    if (!scoreModalMatch || !score1 || !score2) return;
    const s1 = parseInt(score1);
    const s2 = parseInt(score2);
    if (isNaN(s1) || isNaN(s2)) return;

    setSavingScore(true);
    try {
      const winnerId = s1 > s2 ? scoreModalMatch.player1_id : scoreModalMatch.player2_id;
      
      const { error: matchError } = await supabase.from('tournament_matches').update({
        score1: s1,
        score2: s2,
        winner_id: s1 === s2 ? null : winnerId,
        status: 'completed',
      }).eq('id', scoreModalMatch.id);

      if (matchError) throw matchError;

      if (tournament?.format === 'knockout') {
        // Knockout logic: advance winners
        const currentRound = scoreModalMatch.round;
        const { data: roundMatches } = await supabase
          .from('tournament_matches')
          .select('*')
          .eq('tournament_id', tournamentId)
          .eq('round', currentRound);

        const allCompleted = (roundMatches ?? []).every(m => m.status === 'completed' || m.id === scoreModalMatch.id);
        
        if (allCompleted) {
          const winners = (roundMatches ?? []).map(m => m.id === scoreModalMatch.id ? winnerId : m.winner_id);
          if (winners.length > 1) {
            const nextMatches = [];
            for (let i = 0; i < winners.length / 2; i++) {
              nextMatches.push({
                tournament_id: tournamentId,
                round: currentRound + 1,
                match_order: i + 1,
                player1_id: winners[i * 2],
                player2_id: winners[i * 2 + 1],
                status: 'pending',
              });
            }
            await supabase.from('tournament_matches').insert(nextMatches);
          } else {
            await supabase.from('tournaments').update({ status: 'completed' }).eq('id', tournamentId);
          }
        }
      } else {
        // League logic: check if all matches finished
        const { data: allMatches } = await supabase.from('tournament_matches').select('id, status').eq('tournament_id', tournamentId);
        const allDone = (allMatches ?? []).every(m => m.status === 'completed' || m.id === scoreModalMatch.id);
        if (allDone) {
          await supabase.from('tournaments').update({ status: 'completed' }).eq('id', tournamentId);
        }
      }

      setScoreModalMatch(null);
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Could not save score.');
    } finally {
      setSavingScore(false);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join my tournament on ScoreBook! Use invite code: ${tournament?.invite_code}`,
      });
      setShowSettings(false);
    } catch (error) {
      console.log(error);
    }
  };

  const handleLeave = () => {
    setShowSettings(false);
    Alert.alert(
      'Leave Tournament?',
      'Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('tournament_participants')
                .delete()
                .eq('tournament_id', tournamentId)
                .eq('user_id', userId);
              if (error) throw error;
              onBack();
            } catch (error) {
              Alert.alert('Error', 'Could not leave tournament.');
            }
          },
        },
      ]
    );
  };

  const renderMatchCard = (item: TournamentMatch) => {
    const p1 = participants.find(p => p.user_id === item.player1_id);
    const p2 = participants.find(p => p.user_id === item.player2_id);
    const isMyMatch = (item.player1_id === userId || item.player2_id === userId) && item.status === 'pending';
    const isWinner1 = item.winner_id === item.player1_id;
    const isWinner2 = item.winner_id === item.player2_id;

    return (
      <View key={item.id} style={styles.matchCard}>
        <View style={styles.matchRow}>
          <Text style={[styles.matchPlayer, isWinner1 && styles.matchWinner]}>{p1?.display_name ?? 'TBD'}</Text>
          <Text style={styles.matchScore}>{item.status === 'completed' ? item.score1 : '-'}</Text>
        </View>
        <View style={styles.matchDivider} />
        <View style={styles.matchRow}>
          <Text style={[styles.matchPlayer, isWinner2 && styles.matchWinner]}>{p2?.display_name ?? 'TBD'}</Text>
          <Text style={styles.matchScore}>{item.status === 'completed' ? item.score2 : '-'}</Text>
        </View>
        {isMyMatch && (
          <Pressable style={styles.scoreAction} onPress={() => { setScoreModalMatch(item); setScore1(''); setScore2(''); }}>
            <Text style={styles.scoreActionText}>Enter Score</Text>
          </Pressable>
        )}
      </View>
    );
  };

  if (loading && !tournament) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={onBack}><Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} /></Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.title} numberOfLines={1}>{tournament?.name}</Text>
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitle}>{getGameEmoji(tournament?.game_type ?? '')} {getGameDisplayName(tournament?.game_type ?? '')}</Text>
            <View style={styles.formatBadge}><Text style={styles.formatBadgeText}>{tournament?.format.toUpperCase()}</Text></View>
          </View>
        </View>
        <Pressable style={styles.headerBtn} onPress={() => setShowSettings(true)}>
          <Ionicons name="ellipsis-horizontal" size={24} color={COLORS.textPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoTop}>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>STATUS</Text>
              <Text style={[styles.infoValue, { color: tournament?.status === 'open' ? COLORS.success : tournament?.status === 'in_progress' ? COLORS.primary : COLORS.textMuted }]}>
                {tournament?.status.toUpperCase()}
              </Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>PLAYERS</Text>
              <Text style={styles.infoValue}>{participants.length}/{tournament?.max_participants}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>VISIBILITY</Text>
              <Text style={styles.infoValue}>{tournament?.is_public ? 'PUBLIC' : 'PRIVATE'}</Text>
            </View>
          </View>

          {tournament?.description && <Text style={styles.description}>{tournament.description}</Text>}

          {tournament?.rules && (
            <View style={styles.rulesContainer}>
              <Pressable style={styles.rulesHeader} onPress={() => setShowRules(!showRules)}>
                <Text style={styles.rulesTitle}>Rules</Text>
                <Ionicons name={showRules ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textSecondary} />
              </Pressable>
              {showRules && <Text style={styles.rulesText}>{tournament.rules}</Text>}
            </View>
          )}

          <View style={styles.inviteRow}>
            <Text style={styles.inviteLabel}>Invite Code: <Text style={styles.inviteCode}>{tournament?.invite_code}</Text></Text>
            <Pressable onPress={() => Alert.alert('Copied', 'Code copied')}><Ionicons name="copy-outline" size={16} color={COLORS.primary} /></Pressable>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <Pressable style={[styles.tab, activeTab === 'bracket' && styles.tabActive]} onPress={() => setActiveTab('bracket')}>
            <Text style={[styles.tabText, activeTab === 'bracket' && styles.tabTextActive]}>Bracket</Text>
          </Pressable>
          {tournament?.format === 'league' && (
            <Pressable style={[styles.tab, activeTab === 'table' && styles.tabActive]} onPress={() => setActiveTab('table')}>
              <Text style={[styles.tabText, activeTab === 'table' && styles.tabTextActive]}>Table</Text>
            </Pressable>
          )}
          <Pressable style={[styles.tab, activeTab === 'participants' && styles.tabActive]} onPress={() => setActiveTab('participants')}>
            <Text style={[styles.tabText, activeTab === 'participants' && styles.tabTextActive]}>Players</Text>
          </Pressable>
        </View>

        {/* Content */}
        {activeTab === 'participants' && (
          <View style={styles.tabContent}>
            {participants.map(p => (
              <View key={p.id} style={styles.participantItem}>
                <View style={styles.avatar}><Text>{p.avatar_url ?? p.display_name.charAt(0)}</Text></View>
                <Text style={styles.participantName}>{p.display_name}</Text>
                {p.user_id === tournament?.created_by && <View style={styles.creatorBadge}><Text style={styles.creatorBadgeText}>Creator</Text></View>}
              </View>
            ))}
            
            {tournament?.status === 'open' && (
              <View style={styles.actions}>
                {!isParticipant && participants.length < (tournament?.max_participants ?? 0) && (
                  <Pressable style={styles.mainBtn} onPress={async () => {
                    const { error } = await supabase.from('tournament_participants').insert({ tournament_id: tournamentId, user_id: userId, seed: participants.length + 1 });
                    if (!error) loadData();
                  }}><Text style={styles.mainBtnText}>Join Tournament</Text></Pressable>
                )}
                {isCreator && participants.length >= (tournament?.format === 'league' ? 3 : 4) && (
                  <Pressable style={[styles.mainBtn, { backgroundColor: COLORS.success }]} onPress={startTournament}>
                    <Text style={styles.mainBtnText}>Start Tournament</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}

        {activeTab === 'table' && (
          <View style={styles.tabContent}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCol, { flex: 0.5 }]}>#</Text>
              <Text style={[styles.tableCol, { flex: 2 }]}>Player</Text>
              <Text style={styles.tableCol}>P</Text>
              <Text style={styles.tableCol}>W</Text>
              <Text style={styles.tableCol}>GD</Text>
              <Text style={[styles.tableCol, { fontWeight: '700' }]}>Pts</Text>
            </View>
            {standings.map((s, idx) => (
              <View key={s.playerId} style={[styles.tableRow, tournament?.status === 'completed' && idx === 0 && styles.championRow]}>
                <Text style={[styles.tableCol, { flex: 0.5 }]}>{idx + 1}</Text>
                <Text style={[styles.tableCol, { flex: 2 }]} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.tableCol}>{s.played}</Text>
                <Text style={styles.tableCol}>{s.wins}</Text>
                <Text style={styles.tableCol}>{s.gd}</Text>
                <Text style={[styles.tableCol, { fontWeight: '700', color: COLORS.primary }]}>{s.pts}</Text>
              </View>
            ))}
            
            <Text style={styles.matchesTitle}>Matches</Text>
            {matches.map(m => <View key={m.id}>{renderMatchCard(m)}</View>)}
          </View>
        )}

        {activeTab === 'bracket' && (
          <View style={styles.tabContent}>
            {tournament?.status === 'open' ? (
              <Text style={styles.emptyText}>Bracket will appear once tournament starts</Text>
            ) : (
              tournament?.format === 'knockout' ? (
                <View style={styles.bracketContainer}>
                  {[1, 2, 3].map(round => {
                    const roundMatches = matches.filter(m => m.round === round);
                    if (roundMatches.length === 0) return null;
                    return (
                      <View key={round} style={styles.roundGroup}>
                        <Text style={styles.roundLabel}>{round === 1 ? 'QUARTER FINALS' : round === 2 ? 'SEMI FINALS' : 'FINAL'}</Text>
                        {roundMatches.map(m => <View key={m.id}>{renderMatchCard(m)}</View>)}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.leagueMatches}>
                  {matches.map(m => <View key={m.id}>{renderMatchCard(m)}</View>)}
                </View>
              )
            )}
          </View>
        )}
      </ScrollView>

      {/* Score Modal */}
      <Modal visible={!!scoreModalMatch} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter Score</Text>
            <View style={styles.scoreRow}>
              <View style={styles.scoreInputGroup}>
                <Text style={styles.playerName}>{participants.find(p => p.user_id === scoreModalMatch?.player1_id)?.display_name}</Text>
                <TextInput style={styles.scoreInput} value={score1} onChangeText={setScore1} keyboardType="number-pad" placeholder="0" />
              </View>
              <Text style={styles.vsText}>VS</Text>
              <View style={styles.scoreInputGroup}>
                <Text style={styles.playerName}>{participants.find(p => p.user_id === scoreModalMatch?.player2_id)?.display_name}</Text>
                <TextInput style={styles.scoreInput} value={score2} onChangeText={setScore2} keyboardType="number-pad" placeholder="0" />
              </View>
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setScoreModalMatch(null)}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
              <Pressable style={styles.saveBtn} onPress={saveScore} disabled={savingScore}>
                {savingScore ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Save Result</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Settings Action Modal */}
      <Modal visible={showSettings} transparent animationType="fade" onRequestClose={() => setShowSettings(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSettings(false)}>
          <View style={styles.actionSheet}>
            <Pressable style={styles.actionItem} onPress={handleShare}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name="share-outline" size={24} color={COLORS.primary} />
                <Text style={[styles.actionItemText, { color: COLORS.primary }]}>Share Tournament</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
            </Pressable>

            <View style={styles.actionDivider} />

            <Pressable style={styles.actionItem} onPress={handleLeave}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name="log-out-outline" size={24} color={COLORS.error} />
                <Text style={[styles.actionItemText, { color: COLORS.error }]}>Leave Tournament</Text>
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
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  subtitle: { fontSize: 13, color: COLORS.textSecondary },
  formatBadge: { backgroundColor: COLORS.surface, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  formatBadgeText: { fontSize: 9, fontWeight: '800', color: COLORS.textMuted },
  scrollContent: { padding: SPACING.screenPadding, paddingBottom: 40 },
  infoCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.border, marginBottom: 24 },
  infoTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  infoCol: { flex: 1 },
  infoLabel: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted, marginBottom: 4 },
  infoValue: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  description: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 16 },
  rulesContainer: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, marginBottom: 16 },
  rulesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rulesTitle: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  rulesText: { fontSize: 13, color: COLORS.textSecondary, marginTop: 8, lineHeight: 18 },
  inviteRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 16 },
  inviteLabel: { fontSize: 13, color: COLORS.textSecondary },
  inviteCode: { fontWeight: '800', color: COLORS.primary },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  tab: { flex: 1, height: 40, borderRadius: 10, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center' },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  tabTextActive: { color: '#FFFFFF' },
  tabContent: { gap: 12 },
  participantItem: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  participantName: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  creatorBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  creatorBadgeText: { fontSize: 10, color: COLORS.primary, fontWeight: '700' },
  actions: { marginTop: 12, gap: 12 },
  mainBtn: { height: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.button, justifyContent: 'center', alignItems: 'center' },
  mainBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  tableHeader: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tableRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.surface },
  championRow: { backgroundColor: '#FEFCE8', borderRadius: 8 },
  tableCol: { flex: 1, fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },
  matchesTitle: { fontSize: 16, fontWeight: '700', marginTop: 16 },
  matchCard: { padding: 12, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  matchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  matchPlayer: { fontSize: 14, color: COLORS.textSecondary },
  matchWinner: { fontWeight: '700', color: COLORS.success },
  matchScore: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  matchDivider: { height: 1, backgroundColor: COLORS.surface, marginVertical: 8 },
  scoreAction: { marginTop: 8, paddingVertical: 6, backgroundColor: COLORS.surface, borderRadius: 8, alignItems: 'center' },
  scoreActionText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  roundGroup: { marginTop: 16, gap: 8 },
  roundLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 1, marginBottom: 4 },
  emptyText: { textAlign: 'center', marginTop: 40, color: COLORS.textMuted },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  bracketContainer: { gap: 24 },
  leagueMatches: { gap: 12 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 32 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center', marginBottom: 24 },
  scoreInputGroup: { flex: 1, alignItems: 'center', gap: 8 },
  playerName: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
  scoreInput: { width: 64, height: 64, backgroundColor: COLORS.surface, borderRadius: 16, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  vsText: { fontSize: 14, fontWeight: '800', color: COLORS.textMuted },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center' },
  cancelBtnText: { fontWeight: '700', color: COLORS.textSecondary },
  saveBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { fontWeight: '700', color: '#FFF' },
  actionSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, width: '100%' },
  actionItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  actionItemText: { fontSize: 17, fontWeight: '600' },
  actionDivider: { height: 1, backgroundColor: COLORS.border },
  actionCancel: { marginTop: 16, height: 52, borderRadius: RADIUS.button, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center' },
  actionCancelText: { fontSize: 16, fontWeight: '700', color: COLORS.textSecondary },
});
