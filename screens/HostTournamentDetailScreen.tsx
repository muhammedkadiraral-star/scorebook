import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { FeedbackModal } from '../components/FeedbackModal';

type HostTournamentDetailScreenProps = {
  userId: string;
  hostTournamentId: string;
  hostTournamentName: string;
  onBack: () => void;
};

type HostTournament = {
  id: string;
  name: string;
  format: 'knockout' | 'league';
  status: string;
  points_for_win: number;
  points_for_draw: number;
  points_for_loss: number;
  winner_player_id: string | null;
};

type HostPlayer = {
  id: string;
  display_name: string;
  seed: number;
};

type HostMatch = {
  id: string;
  host_tournament_id: string;
  round: number;
  match_order: number;
  player_home_id: string;
  player_away_id: string;
  score_home: number | null;
  score_away: number | null;
  winner_player_id: string | null;
  status: string;
};

export function HostTournamentDetailScreen({ userId, hostTournamentId, hostTournamentName, onBack }: HostTournamentDetailScreenProps) {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [tournament, setTournament] = useState<HostTournament | null>(null);
  const [players, setPlayers] = useState<HostPlayer[]>([]);
  const [matches, setMatches] = useState<HostMatch[]>([]);
  const [activeTab, setActiveTab] = useState<'matches' | 'table' | 'players'>('matches');
  
  // Feedback Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    primaryAction?: () => void;
    primaryText?: string;
    secondaryText?: string;
  }>({
    type: 'info',
    title: '',
    message: '',
  });

  // Score Entry State
  const [scoreModalVisible, setScoreModalVisible] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<HostMatch | null>(null);
  const [homeScoreInput, setHomeScoreInput] = useState('');
  const [awayScoreInput, setAwayScoreInput] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, pRes, mRes] = await Promise.all([
        supabase.from('host_tournaments').select('*').eq('id', hostTournamentId).single(),
        supabase.from('host_tournament_players').select('*').eq('host_tournament_id', hostTournamentId).order('seed'),
        supabase.from('host_tournament_matches').select('*').eq('host_tournament_id', hostTournamentId).order('round').order('match_order'),
      ]);

      if (tRes.error) throw tRes.error;
      if (pRes.error) throw pRes.error;
      if (mRes.error) throw mRes.error;

      setTournament(tRes.data);
      setPlayers(pRes.data || []);
      setMatches(mRes.data || []);
      if (mRes.data && mRes.data.length === 0) {
        setActiveTab('players');
      }
    } catch (error) {
      console.error('Error loading host tournament data:', error);
    } finally {
      setLoading(false);
    }
  }, [hostTournamentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const standings = useMemo(() => {
    if (!tournament || tournament.format !== 'league') return [];

    const pWin = tournament.points_for_win ?? 3;
    const pDraw = tournament.points_for_draw ?? 1;
    const pLoss = tournament.points_for_loss ?? 0;

    const stats: Record<string, {
      id: string;
      name: string;
      played: number;
      won: number;
      drawn: number;
      lost: number;
      gf: number;
      ga: number;
      gd: number;
      pts: number;
    }> = {};

    players.forEach(p => {
      stats[p.id] = {
        id: p.id,
        name: p.display_name,
        played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0
      };
    });

    matches.forEach(m => {
      if (m.status === 'completed' || (m.score_home !== null && m.score_away !== null)) {
        const homeId = m.player_home_id;
        const awayId = m.player_away_id;
        const sh = m.score_home || 0;
        const sa = m.score_away || 0;

        if (stats[homeId] && stats[awayId]) {
          stats[homeId].played++;
          stats[awayId].played++;
          stats[homeId].gf += sh;
          stats[homeId].ga += sa;
          stats[awayId].gf += sa;
          stats[awayId].ga += sh;

          if (sh > sa) {
            stats[homeId].won++;
            stats[awayId].lost++;
            stats[homeId].pts += pWin;
            stats[awayId].pts += pLoss;
          } else if (sh < sa) {
            stats[awayId].won++;
            stats[homeId].lost++;
            stats[awayId].pts += pWin;
            stats[homeId].pts += pLoss;
          } else {
            stats[homeId].drawn++;
            stats[awayId].drawn++;
            stats[homeId].pts += pDraw;
            stats[awayId].pts += pDraw;
          }

          stats[homeId].gd = stats[homeId].gf - stats[homeId].ga;
          stats[awayId].gd = stats[awayId].gf - stats[awayId].ga;
        }
      }
    });

    return Object.values(stats).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.name.localeCompare(b.name);
    });
  }, [tournament, players, matches]);

  const showModal = (type: 'success'|'error'|'warning'|'info', title: string, message: string, primaryAction?: () => void, primaryText?: string, secondaryText?: string) => {
    setModalConfig({ type, title, message, primaryAction, primaryText, secondaryText });
    setModalVisible(true);
  };

  const handleStartTournament = () => {
    showModal(
      'info',
      'Start Host Tournament?',
      'Fixtures will be generated and guest players can no longer be edited.',
      executeStartTournament,
      'Start',
      'Cancel'
    );
  };

  const executeStartTournament = async () => {
    setModalVisible(false);
    if (!tournament) return;

    if (tournament.format === 'league' && players.length < 2) {
      showModal('error', 'Validation Error', 'League requires at least 2 players.');
      return;
    }

    if (tournament.format === 'knockout') {
      if (players.length < 4) {
        showModal('error', 'Validation Error', 'Knockout requires at least 4 players.');
        return;
      }
      const len = players.length;
      if ((len & (len - 1)) !== 0) {
        showModal('error', 'Validation Error', 'Knockout requires 4, 8, or 16 players (must be a power of 2).');
        return;
      }
    }

    setActionLoading(true);
    try {
      let matchInserts: any[] = [];
      let matchOrder = 1;

      if (tournament.format === 'league') {
        for (let i = 0; i < players.length; i++) {
          for (let j = i + 1; j < players.length; j++) {
            matchInserts.push({
              host_tournament_id: hostTournamentId,
              round: 1,
              match_order: matchOrder++,
              player_home_id: players[i].id,
              player_away_id: players[j].id,
              status: 'pending'
            });
          }
        }
      } else if (tournament.format === 'knockout') {
        const sorted = [...players].sort((a, b) => a.seed - b.seed);
        const numMatches = sorted.length / 2;
        for (let i = 0; i < numMatches; i++) {
          matchInserts.push({
            host_tournament_id: hostTournamentId,
            round: 1,
            match_order: matchOrder++,
            player_home_id: sorted[i].id,
            player_away_id: sorted[sorted.length - 1 - i].id,
            status: 'pending'
          });
        }
      }

      const { data: existingMatches, error: checkError } = await supabase
        .from('host_tournament_matches')
        .select('id')
        .eq('host_tournament_id', hostTournamentId)
        .limit(1);
      
      if (checkError) throw checkError;

      if (!existingMatches || existingMatches.length === 0) {
        const { error: insertError } = await supabase
          .from('host_tournament_matches')
          .insert(matchInserts);
        if (insertError) throw insertError;
      }

      const { error: updateError } = await supabase
        .from('host_tournaments')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', hostTournamentId);
      if (updateError) throw updateError;

      await loadData();
      setActiveTab('matches');
    } catch (error: any) {
      console.error('Error starting tournament:', error);
      showModal('error', 'Error', 'Could not generate fixtures.');
    } finally {
      setActionLoading(false);
    }
  };

  const checkKnockoutProgression = async (currentRound: number) => {
    if (!tournament || tournament.format !== 'knockout') return;

    const { data: roundMatches, error: fetchError } = await supabase
      .from('host_tournament_matches')
      .select('*')
      .eq('host_tournament_id', hostTournamentId)
      .eq('round', currentRound)
      .order('match_order');

    if (fetchError) throw fetchError;

    const allCompleted = roundMatches?.every(m => m.status === 'completed');
    if (!allCompleted) return;

    const winners = roundMatches.map(m => m.winner_player_id).filter(id => id !== null);

    if (winners.length > 1) {
      const nextRound = currentRound + 1;
      const { data: existingNext, error: checkError } = await supabase
        .from('host_tournament_matches')
        .select('id')
        .eq('host_tournament_id', hostTournamentId)
        .eq('round', nextRound)
        .limit(1);
        
      if (checkError) throw checkError;
      if (existingNext && existingNext.length > 0) return;

      const nextMatches = [];
      for (let i = 0; i < winners.length; i += 2) {
        if (winners[i] && winners[i+1]) {
          nextMatches.push({
            host_tournament_id: hostTournamentId,
            round: nextRound,
            match_order: (i / 2) + 1,
            player_home_id: winners[i],
            player_away_id: winners[i+1],
            status: 'pending'
          });
        }
      }

      if (nextMatches.length > 0) {
        const { error: insertError } = await supabase
          .from('host_tournament_matches')
          .insert(nextMatches);
        if (insertError) throw insertError;
      }
    } else if (winners.length === 1) {
      const { error: updateError } = await supabase
        .from('host_tournaments')
        .update({
          status: 'completed',
          winner_player_id: winners[0],
          completed_at: new Date().toISOString()
        })
        .eq('id', hostTournamentId);
        
      if (updateError) throw updateError;
    }
  };

  const getRoundLabel = (round: number) => {
    if (!players.length) return `Round ${round}`;
    const totalRounds = Math.log2(players.length);
    const distanceToFinal = totalRounds - round;

    switch (distanceToFinal) {
      case 0: return 'Final';
      case 1: return 'Semi Finals';
      case 2: return 'Quarter Finals';
      case 3: return 'Round of 16';
      case 4: return 'Round of 32';
      default: return `Round ${round}`;
    }
  };

  const openScoreModal = (match: HostMatch) => {
    if (tournament?.format === 'knockout') {
      const hasAdvanced = matches.some(m => m.round === match.round + 1);
      if (hasAdvanced) {
        showModal(
          'warning',
          'Cannot edit match',
          'This match already advanced players to the next round. You cannot edit scores in previous rounds.'
        );
        return;
      }
    }
    setSelectedMatch(match);
    setHomeScoreInput(match.score_home?.toString() || '');
    setAwayScoreInput(match.score_away?.toString() || '');
    setScoreModalVisible(true);
  };

  const handleSaveScore = async () => {
    if (!selectedMatch || !tournament) return;

    const sh = parseInt(homeScoreInput, 10);
    const sa = parseInt(awayScoreInput, 10);

    if (isNaN(sh) || isNaN(sa) || sh < 0 || sa < 0) {
      showModal('error', 'Invalid Score', 'Please enter valid non-negative numbers.');
      return;
    }

    if (tournament.format === 'knockout' && sh === sa) {
      showModal('error', 'Winner required', 'Knockout matches cannot end in a draw.');
      return;
    }

    setActionLoading(true);
    try {
      let winnerId = null;
      if (sh > sa) winnerId = selectedMatch.player_home_id;
      else if (sa > sh) winnerId = selectedMatch.player_away_id;

      const { error } = await supabase
        .from('host_tournament_matches')
        .update({
          score_home: sh,
          score_away: sa,
          winner_player_id: winnerId,
          status: 'completed',
          played_at: new Date().toISOString(),
        })
        .eq('id', selectedMatch.id);

      if (error) throw error;

      setScoreModalVisible(false);
      await checkKnockoutProgression(selectedMatch.round);
      await loadData();
    } catch (error: any) {
      console.error('Error saving score:', error);
      showModal('error', 'Error', 'Could not save score.');
    } finally {
      setActionLoading(false);
    }
  };

  const getPlayerName = (id: string) => {
    return players.find(p => p.id === id)?.display_name || 'Unknown';
  };

  if (loading && !tournament) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  const renderMatchCard = (m: HostMatch) => {
    const homeName = getPlayerName(m.player_home_id);
    const awayName = getPlayerName(m.player_away_id);
    const isCompleted = m.status === 'completed';
    const homeWinner = isCompleted && m.winner_player_id === m.player_home_id;
    const awayWinner = isCompleted && m.winner_player_id === m.player_away_id;

    return (
      <Pressable 
        key={m.id} 
        style={styles.matchCard}
        onPress={() => openScoreModal(m)}
      >
        <View style={styles.matchHeader}>
          <View style={[styles.matchBadge, isCompleted && styles.matchBadgeCompleted]}>
            <Text style={[styles.matchBadgeText, isCompleted && styles.matchBadgeTextCompleted]}>
              {isCompleted ? 'COMPLETED' : 'PENDING'}
            </Text>
          </View>
        </View>

        <View style={styles.teamsContainer}>
          <View style={styles.teamRow}>
            <Text style={[styles.teamName, homeWinner && styles.winnerName]} numberOfLines={1}>
              {homeWinner && <Ionicons name="trophy" size={14} color={COLORS.primary} />} {homeName}
            </Text>
            <Text style={[styles.scoreText, isCompleted && styles.scoreTextCompleted]}>
              {isCompleted ? m.score_home : '-'}
            </Text>
          </View>
          <View style={styles.teamRow}>
            <Text style={[styles.teamName, awayWinner && styles.winnerName]} numberOfLines={1}>
              {awayWinner && <Ionicons name="trophy" size={14} color={COLORS.primary} />} {awayName}
            </Text>
            <Text style={[styles.scoreText, isCompleted && styles.scoreTextCompleted]}>
              {isCompleted ? m.score_away : '-'}
            </Text>
          </View>
        </View>

        {!isCompleted && (
          <View style={styles.cardFooter}>
            <Text style={styles.ctaText}>Enter Score</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{tournament?.name || hostTournamentName}</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Start Button */}
        {tournament?.status === 'draft' && (
          <Pressable 
            style={styles.startButton} 
            onPress={handleStartTournament}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color={COLORS.textInverse} />
            ) : (
              <Text style={styles.startButtonText}>Start Tournament</Text>
            )}
          </Pressable>
        )}

        {/* Champion Banner */}
        {tournament?.status === 'completed' && tournament.winner_player_id && (
          <View style={styles.championCard}>
            <View style={styles.championIconContainer}>
              <Ionicons name="trophy" size={32} color={COLORS.primary} />
            </View>
            <View style={styles.championInfo}>
              <Text style={styles.championLabel}>🏆 CHAMPION</Text>
              <Text style={styles.championName}>{getPlayerName(tournament.winner_player_id)}</Text>
            </View>
          </View>
        )}

        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoTop}>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>STATUS</Text>
              <Text style={[styles.infoValue, { color: COLORS.primary }]}>
                {tournament?.status?.toUpperCase() || 'DRAFT'}
              </Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>FORMAT</Text>
              <Text style={styles.infoValue}>{tournament?.format?.toUpperCase()}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>PLAYERS</Text>
              <Text style={styles.infoValue}>{players.length}</Text>
            </View>
          </View>
        </View>

        {/* Tabs */}
        {(tournament?.status !== 'draft' || matches.length > 0) && (
          <View style={styles.tabContainer}>
            <Pressable 
              style={[styles.tab, activeTab === 'matches' && styles.tabActive]} 
              onPress={() => setActiveTab('matches')}
            >
              <Text style={[styles.tabText, activeTab === 'matches' && styles.tabTextActive]}>
                {tournament?.format === 'league' ? 'Matches' : 'Bracket'}
              </Text>
            </Pressable>
            {tournament?.format === 'league' && (
              <Pressable 
                style={[styles.tab, activeTab === 'table' && styles.tabActive]} 
                onPress={() => setActiveTab('table')}
              >
                <Text style={[styles.tabText, activeTab === 'table' && styles.tabTextActive]}>Table</Text>
              </Pressable>
            )}
            <Pressable 
              style={[styles.tab, activeTab === 'players' && styles.tabActive]} 
              onPress={() => setActiveTab('players')}
            >
              <Text style={[styles.tabText, activeTab === 'players' && styles.tabTextActive]}>Players</Text>
            </Pressable>
          </View>
        )}

        {/* Placeholder for Draft if no matches */}
        {tournament?.status === 'draft' && matches.length === 0 && activeTab === 'matches' && (
          <View style={styles.placeholderCard}>
            <Ionicons name="construct-outline" size={32} color={COLORS.primary} style={{ marginBottom: 12 }} />
            <Text style={styles.placeholderTitle}>Draft Mode</Text>
            <Text style={styles.placeholderText}>
              Add guest players and start the tournament to generate fixtures.
            </Text>
          </View>
        )}

        {/* Tab Content */}
        {activeTab === 'matches' && matches.length > 0 && (
          <View style={styles.matchesList}>
            {tournament?.format === 'knockout' ? (
              // Group by Round for Knockout
              Array.from(new Set(matches.map(m => m.round))).sort((a, b) => a - b).map(round => (
                <View key={`round-${round}`} style={styles.roundSection}>
                  <Text style={styles.roundTitle}>{getRoundLabel(round)}</Text>
                  <View style={styles.roundMatches}>
                    {matches.filter(m => m.round === round).map(renderMatchCard)}
                  </View>
                </View>
              ))
            ) : (
              // Standard List for League
              matches.map(renderMatchCard)
            )}
          </View>
        )}

        {activeTab === 'table' && tournament?.format === 'league' && (
          <View style={styles.tableContainer}>
            <Text style={styles.scoringRuleText}>
              Scoring: Win {tournament.points_for_win ?? 3} · Draw {tournament.points_for_draw ?? 1} · Loss {tournament.points_for_loss ?? 0}
            </Text>
            
            <View style={styles.tableCard}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableCell, styles.cellRank]}>#</Text>
                <Text style={[styles.tableCell, styles.cellPlayer]}>Player</Text>
                <Text style={[styles.tableCell, styles.cellStat]}>P</Text>
                <Text style={[styles.tableCell, styles.cellStat]}>W</Text>
                <Text style={[styles.tableCell, styles.cellStat]}>D</Text>
                <Text style={[styles.tableCell, styles.cellStat]}>L</Text>
                <Text style={[styles.tableCell, styles.cellStat]}>GD</Text>
                <Text style={[styles.tableCell, styles.cellPts]}>Pts</Text>
              </View>
              
              {standings.map((row, index) => (
                <View key={row.id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                  <Text style={[styles.tableCell, styles.cellRank]}>{index + 1}</Text>
                  <Text style={[styles.tableCell, styles.cellPlayer]} numberOfLines={1}>{row.name}</Text>
                  <Text style={[styles.tableCell, styles.cellStat]}>{row.played}</Text>
                  <Text style={[styles.tableCell, styles.cellStat]}>{row.won}</Text>
                  <Text style={[styles.tableCell, styles.cellStat]}>{row.drawn}</Text>
                  <Text style={[styles.tableCell, styles.cellStat]}>{row.lost}</Text>
                  <Text style={[styles.tableCell, styles.cellStat]}>{row.gd > 0 ? `+${row.gd}` : row.gd}</Text>
                  <Text style={[styles.tableCell, styles.cellPts]}>{row.pts}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {activeTab === 'players' && (
          <View style={styles.playersList}>
            {players.map((p) => (
              <View key={p.id} style={styles.playerItem}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{p.display_name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.playerName}>{p.display_name}</Text>
                <View style={styles.seedBadge}>
                  <Text style={styles.seedText}>Seed {p.seed}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      <FeedbackModal
        visible={modalVisible}
        type={modalConfig.type}
        title={modalConfig.title}
        message={modalConfig.message}
        primaryButtonText={modalConfig.primaryText || 'OK'}
        onPrimaryPress={() => {
          if (modalConfig.primaryAction) {
            modalConfig.primaryAction();
          } else {
            setModalVisible(false);
          }
        }}
        secondaryButtonText={modalConfig.secondaryText}
        onSecondaryPress={() => setModalVisible(false)}
        onClose={() => setModalVisible(false)}
      />

      {/* Score Entry Modal */}
      <Modal
        visible={scoreModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setScoreModalVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setScoreModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ width: '100%' }}
          >
            <Pressable style={styles.scoreSheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>
                  {selectedMatch?.status === 'completed' ? 'Edit Score' : 'Enter Score'}
                </Text>
                <Pressable onPress={() => setScoreModalVisible(false)}>
                  <Ionicons name="close" size={24} color={COLORS.textMuted} />
                </Pressable>
              </View>

              <View style={styles.scoreInputContainer}>
                <View style={styles.scoreRow}>
                  <Text style={styles.scorePlayerName} numberOfLines={1}>
                    {selectedMatch ? getPlayerName(selectedMatch.player_home_id) : ''}
                  </Text>
                  <TextInput
                    style={styles.scoreInputLarge}
                    keyboardType="number-pad"
                    value={homeScoreInput}
                    onChangeText={setHomeScoreInput}
                    placeholder="0"
                    placeholderTextColor={COLORS.textMuted}
                    autoFocus
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.scoreDivider} />

                <View style={styles.scoreRow}>
                  <Text style={styles.scorePlayerName} numberOfLines={1}>
                    {selectedMatch ? getPlayerName(selectedMatch.player_away_id) : ''}
                  </Text>
                  <TextInput
                    style={styles.scoreInputLarge}
                    keyboardType="number-pad"
                    value={awayScoreInput}
                    onChangeText={setAwayScoreInput}
                    placeholder="0"
                    placeholderTextColor={COLORS.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={handleSaveScore}
                  />
                </View>
              </View>

              <Pressable 
                style={[styles.saveButton, actionLoading && styles.disabledButton]}
                onPress={handleSaveScore}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color={COLORS.textInverse} />
                ) : (
                  <Text style={styles.saveButtonText}>Save Result</Text>
                )}
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  headerButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'center' },
  content: { padding: SPACING.screenPadding, paddingBottom: 40 },
  startButton: { backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: RADIUS.button, alignItems: 'center', marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  startButtonText: { color: COLORS.textInverse, fontSize: 17, fontWeight: '700' },
  infoCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.card, padding: 20, borderWidth: 1, borderColor: COLORS.border, marginBottom: 24 },
  infoTop: { flexDirection: 'row', justifyContent: 'space-between' },
  infoCol: { flex: 1, alignItems: 'center' },
  infoLabel: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted, marginBottom: 4 },
  infoValue: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  tabContainer: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 12, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: COLORS.cardHover, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.primary },
  placeholderCard: { backgroundColor: COLORS.primaryMuted, borderRadius: RADIUS.card, padding: 24, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: COLORS.primary },
  placeholderTitle: { fontSize: 18, fontWeight: '700', color: COLORS.primary, marginBottom: 8 },
  placeholderText: { fontSize: 14, color: COLORS.textPrimary, textAlign: 'center', lineHeight: 20 },
  matchesList: { gap: 12 },
  matchCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.card, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  matchHeader: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  matchBadge: { backgroundColor: COLORS.surface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  matchBadgeCompleted: { backgroundColor: COLORS.primaryMuted },
  matchBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary },
  matchBadgeTextCompleted: { color: COLORS.primary },
  teamsContainer: { gap: 12 },
  teamRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamName: { flex: 1, fontSize: 16, fontWeight: '600', color: COLORS.textPrimary, marginRight: 16 },
  winnerName: { color: COLORS.primary, fontWeight: '700' },
  scoreText: { fontSize: 18, fontWeight: '700', color: COLORS.textMuted, width: 30, textAlign: 'center' },
  scoreTextCompleted: { color: COLORS.textPrimary },
  cardFooter: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 },
  ctaText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  tableContainer: { flex: 1 },
  scoringRuleText: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 12, textAlign: 'center', fontStyle: 'italic' },
  tableCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tableRowAlt: { backgroundColor: COLORS.surface },
  tableHeader: { backgroundColor: COLORS.surface, borderBottomWidth: 2, borderBottomColor: COLORS.border },
  tableCell: { fontSize: 13, color: COLORS.textPrimary, textAlign: 'center' },
  cellRank: { width: 24, fontWeight: '600', color: COLORS.textSecondary },
  cellPlayer: { flex: 1, textAlign: 'left', fontWeight: '600', paddingLeft: 4 },
  cellStat: { width: 28, color: COLORS.textSecondary },
  cellPts: { width: 32, fontWeight: '800', color: COLORS.primary },
  playersList: { gap: 12 },
  playerItem: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: COLORS.card, borderRadius: RADIUS.input, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 16, fontWeight: '700', color: COLORS.textSecondary },
  playerName: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  seedBadge: { backgroundColor: COLORS.surface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  seedText: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  scoreSheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  scoreInputContainer: { gap: 20, marginBottom: 32 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  scorePlayerName: { flex: 1, fontSize: 17, fontWeight: '600', color: COLORS.textPrimary },
  scoreInputLarge: { backgroundColor: COLORS.surface, width: 80, height: 60, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, textAlign: 'center', fontSize: 28, fontWeight: '700', color: COLORS.primary },
  scoreDivider: { height: 1, backgroundColor: COLORS.border },
  saveButton: { height: 56, backgroundColor: COLORS.primary, borderRadius: RADIUS.button, justifyContent: 'center', alignItems: 'center' },
  saveButtonText: { color: COLORS.textInverse, fontSize: 17, fontWeight: '700' },
  disabledButton: { opacity: 0.7 },
  championCard: { backgroundColor: COLORS.primaryMuted, borderRadius: RADIUS.card, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: COLORS.primary },
  championIconContainer: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center', marginRight: 16, borderWidth: 1, borderColor: COLORS.primary },
  championInfo: { flex: 1 },
  championLabel: { fontSize: 12, fontWeight: '800', color: COLORS.primary, marginBottom: 4 },
  championName: { fontSize: 24, fontWeight: '700', color: COLORS.textPrimary },
  roundSection: { marginBottom: 24 },
  roundTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  roundMatches: { gap: 12 },
});
