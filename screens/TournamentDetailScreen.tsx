import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS, RADIUS, SIZES, SPACING } from '../constants/theme';
import { getGameDisplayName, getGameEmoji } from '../constants/games';
import { FeedbackModal, FeedbackType } from '../components/FeedbackModal';

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
  tempo?: string;
  round_deadline_hours?: number;
  estimated_completion?: string | null;
  started_at?: string | null;
  winner_id?: string | null;
  completed_at?: string | null;
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
  player_home: string | null;
  player_away: string | null;
  score_home: number | null;
  score_away: number | null;
  winner: string | null;
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

type DeleteTournamentRpcResponse = {
  success: boolean;
  tournament_id?: string;
  tournament_name?: string;
  message?: string;
  error?: string;
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
  const [scoreHome, setScoreHome] = useState('');
  const [scoreAway, setScoreAway] = useState('');
  const [savingScore, setSavingScore] = useState(false);
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ 
    visible: boolean; 
    type: FeedbackType; 
    title: string; 
    message: string; 
    primaryButtonText?: string;
    secondaryButtonText?: string;
    onPrimaryPress?: () => void; 
    onSecondaryPress?: () => void;
  } | null>(null);

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

    matches.filter(m => m.status === 'completed' && m.score_confirmed === true).forEach(m => {
      if (!m.player_home || !m.player_away) return;
      const s1 = m.score_home ?? 0;
      const s2 = m.score_away ?? 0;

      const p1 = stats[m.player_home];
      const p2 = stats[m.player_away];
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

  const leagueChampion = useMemo(() => {
    if (tournament?.format !== 'league') return null;
    if (matches.length === 0) return null;
    const allCompleted = matches.every(m => m.status === 'completed');
    if (!allCompleted) return null;
    if (standings.length === 0) return null;
    return standings[0];
  }, [tournament, matches, standings]);

  useEffect(() => {
    if (leagueChampion && tournament && tournament.status !== 'completed') {
      supabase.from('tournaments').update({ 
        status: 'completed', 
        winner_id: leagueChampion.playerId 
      }).eq('id', tournamentId).then(() => loadData());
    }
  }, [leagueChampion]);

  const startTournament = async () => {
    if (!tournament) return;

    if (tournament.format === 'league' && participants.length < 2) {
      Alert.alert('Not enough players', 'League requires at least 2 players.');
      return;
    }
    if (tournament.format === 'knockout' && participants.length < 4) {
      Alert.alert('Cannot start', 'Minimum 4 participants required for knockout.');
      return;
    }

    Alert.alert(
      'Start Tournament?',
      'Players will no longer be able to join after the tournament starts.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            try {
              setStarting(true);

              if (tournament.format === 'league') {
                const { data: existingMatches, error: checkError } = await supabase
                  .from('tournament_matches')
                  .select('id')
                  .eq('tournament_id', tournamentId)
                  .limit(1);

                if (checkError) {
                  console.error('Check match error', checkError);
                  Alert.alert('Error', 'Could not check existing matches.');
                  return;
                }

                if (!existingMatches || existingMatches.length === 0) {
                  const deadlineDate = new Date(Date.now() + (tournament.round_deadline_hours || 24) * 60 * 60 * 1000).toISOString();
                  const newMatches = [];
                  let matchOrder = 1;
                  for (let i = 0; i < participants.length - 1; i++) {
                    for (let j = i + 1; j < participants.length; j++) {
                      newMatches.push({
                        tournament_id: tournamentId,
                        round: 1,
                        match_order: matchOrder++,
                        player_home: participants[i].user_id,
                        player_away: participants[j].user_id,
                        score_home: null,
                        score_away: null,
                        winner: null,
                        status: 'pending',
                        deadline: deadlineDate
                      });
                    }
                  }

                  const { error: insertError } = await supabase
                    .from('tournament_matches')
                    .insert(newMatches);

                  if (insertError) {
                    console.error('Insert match error', insertError);
                    Alert.alert('Error', 'Could not generate fixtures.');
                    return;
                  }
                }
              } else if (tournament.format === 'knockout') {
                const len = participants.length;
                if ((len & (len - 1)) !== 0) {
                  Alert.alert('Cannot start', 'Knockout format currently requires participant count to be a power of 2 (e.g. 4, 8, 16).');
                  setStarting(false);
                  return;
                }

                const { data: existingMatches, error: checkError } = await supabase
                  .from('tournament_matches')
                  .select('id')
                  .eq('tournament_id', tournamentId)
                  .limit(1);

                if (checkError) {
                  console.error('Check match error', checkError);
                  Alert.alert('Error', 'Could not check existing matches.');
                  return;
                }

                if (!existingMatches || existingMatches.length === 0) {
                  const deadlineDate = new Date(Date.now() + (tournament.round_deadline_hours || 24) * 60 * 60 * 1000).toISOString();
                  
                  const sortedParticipants = [...participants].sort((a, b) => {
                    if (a.seed !== null && a.seed !== undefined && b.seed !== null && b.seed !== undefined) return a.seed - b.seed;
                    if (a.seed !== null && a.seed !== undefined) return -1;
                    if (b.seed !== null && b.seed !== undefined) return 1;
                    const aTime = a.joined_at ? new Date(a.joined_at).getTime() : 0;
                    const bTime = b.joined_at ? new Date(b.joined_at).getTime() : 0;
                    return aTime - bTime;
                  });

                  const newMatches = [];
                  const n = sortedParticipants.length;
                  for (let i = 0; i < n / 2; i++) {
                    newMatches.push({
                      tournament_id: tournamentId,
                      round: 1,
                      match_order: i + 1,
                      player_home: sortedParticipants[i].user_id,
                      player_away: sortedParticipants[n - 1 - i].user_id,
                      score_home: null,
                      score_away: null,
                      winner: null,
                      status: 'pending',
                      deadline: deadlineDate
                    });
                  }

                  const { error: insertError } = await supabase
                    .from('tournament_matches')
                    .insert(newMatches);

                  if (insertError) {
                    console.error('Insert match error', insertError);
                    Alert.alert('Error', 'Could not generate knockout bracket.');
                    return;
                  }
                }
              }

              const { error: tError } = await supabase
                .from('tournaments')
                .update({ 
                  status: 'in_progress',
                  started_at: new Date().toISOString()
                })
                .eq('id', tournamentId);
                
              if (tError) {
                console.error('Update tournament error', tError);
                Alert.alert('Error', 'Could not start tournament.');
                return;
              }
              
              loadData();
            } catch (error) {
              console.error('Start tournament catch error', error);
              Alert.alert('Error', 'Could not start tournament.');
            } finally {
              setStarting(false);
            }
          }
        }
      ]
    );
  };

  const saveScore = async () => {
    Keyboard.dismiss();

    if (!userId) {
      Alert.alert('Error', 'User session not found.');
      return;
    }

    if (!scoreModalMatch || !scoreHome || !scoreAway) return;
    const s1 = parseInt(scoreHome);
    const s2 = parseInt(scoreAway);
    if (isNaN(s1) || isNaN(s2)) return;

    setSavingScore(true);
    try {
      const winnerId = s1 > s2 ? scoreModalMatch.player_home : scoreModalMatch.player_away;
      
      const now = new Date().toISOString();
      const { error: matchError } = await supabase.from('tournament_matches').update({
        score_home: s1,
        score_away: s2,
        winner: s1 === s2 ? null : winnerId,
        status: 'pending_confirmation',
        played_at: null,
        score_submitted_by: userId,
        score_submitted_at: now,
        score_confirmed: false,
        confirmed_by: null,
        confirmed_at: null,
        disputed_by: null,
        disputed_at: null,
        dispute_reason: null,
      }).eq('id', scoreModalMatch.id);

      if (matchError) throw matchError;

      let opponentId = null;
      if (userId === scoreModalMatch.player_home) {
        opponentId = scoreModalMatch.player_away;
      } else if (userId === scoreModalMatch.player_away) {
        opponentId = scoreModalMatch.player_home;
      }

      const homeName = participants.find(p => p.user_id === scoreModalMatch.player_home)?.display_name ?? 'Home';
      const awayName = participants.find(p => p.user_id === scoreModalMatch.player_away)?.display_name ?? 'Away';
      const submitterName = participants.find(p => p.user_id === userId)?.display_name ?? 'A player';

      if (opponentId) {
        const { error: notifError } = await supabase.from('notifications').insert({
          user_id: opponentId,
          type: 'tournament_score_confirmation',
          title: 'Confirm match result',
          message: `${submitterName} submitted a result: ${homeName} ${s1} - ${s2} ${awayName}.`,
          tournament_match_id: scoreModalMatch.id,
          match_id: null,
          group_id: null,
          created_by: userId,
          is_read: false
        } as any);
        
        if (notifError) console.error('Notification insert error:', notifError);
      } else {
        const notifPayloads = [];
        if (scoreModalMatch.player_home && scoreModalMatch.player_home !== userId) {
          notifPayloads.push({
            user_id: scoreModalMatch.player_home,
            type: 'tournament_score_confirmation',
            title: 'Confirm match result',
            message: `${submitterName} submitted a result: ${homeName} ${s1} - ${s2} ${awayName}.`,
            tournament_match_id: scoreModalMatch.id,
            match_id: null,
            group_id: null,
            created_by: userId,
            is_read: false
          });
        }
        if (scoreModalMatch.player_away && scoreModalMatch.player_away !== userId) {
          notifPayloads.push({
            user_id: scoreModalMatch.player_away,
            type: 'tournament_score_confirmation',
            title: 'Confirm match result',
            message: `${submitterName} submitted a result: ${homeName} ${s1} - ${s2} ${awayName}.`,
            tournament_match_id: scoreModalMatch.id,
            match_id: null,
            group_id: null,
            created_by: userId,
            is_read: false
          });
        }
        
        if (notifPayloads.length > 0) {
          const { error: notifError } = await supabase.from('notifications').insert(notifPayloads as any);
          if (notifError) console.error('Notification insert error:', notifError);
        }
      }

      setScoreModalMatch(null);
      loadData();
      setFeedback({ visible: true, type: 'success', title: 'Result submitted', message: 'Waiting for opponent confirmation.' });
    } catch (error) {
      console.error('Save score error:', error);
      setFeedback({ visible: true, type: 'error', title: 'Error', message: 'Could not save score.' });
    } finally {
      setSavingScore(false);
    }
  };

  const handleConfirmResult = async (match: TournamentMatch) => {
    try {
      const now = new Date().toISOString();
      const { error: matchError } = await supabase.from('tournament_matches').update({
        status: 'completed',
        score_confirmed: true,
        confirmed_by: userId,
        confirmed_at: now,
        played_at: now,
      }).eq('id', match.id);

      if (matchError) throw matchError;

      const opponentName = participants.find(p => p.user_id === userId)?.display_name ?? 'The opponent';

      if (match.score_submitted_by) {
        const { error: notifError } = await supabase.from('notifications').insert({
          user_id: match.score_submitted_by,
          type: 'tournament_score_confirmed',
          title: 'Result confirmed',
          message: `${opponentName} confirmed the match result.`,
          tournament_match_id: match.id,
          match_id: null,
          group_id: null,
          created_by: userId,
          is_read: false
        } as any);
        if (notifError) console.error('Notification insert error:', notifError);
      }

      if (tournament?.format === 'knockout') {
        const currentRound = match.round;
        const { data: roundMatches } = await supabase
          .from('tournament_matches')
          .select('*')
          .eq('tournament_id', tournamentId)
          .eq('round', currentRound);

        const allCompleted = (roundMatches ?? []).every(m => (m.status === 'completed' && m.score_confirmed) || m.id === match.id);
        
        if (allCompleted) {
          const winners = (roundMatches ?? []).map(m => m.id === match.id ? match.winner : m.winner);
          if (winners.length > 1) {
            const nextMatches = [];
            for (let i = 0; i < winners.length / 2; i++) {
              nextMatches.push({
                tournament_id: tournamentId,
                round: currentRound + 1,
                match_order: i + 1,
                player_home: winners[i * 2],
                player_away: winners[i * 2 + 1],
                status: 'pending',
              });
            }
            await supabase.from('tournament_matches').insert(nextMatches);
          } else {
            await supabase.from('tournaments').update({ 
              status: 'completed',
              winner_id: match.winner,
              completed_at: new Date().toISOString()
            }).eq('id', tournamentId);
          }
        }
      } else {
        const { data: allMatches } = await supabase.from('tournament_matches').select('id, status, score_confirmed').eq('tournament_id', tournamentId);
        const allDone = (allMatches ?? []).every(m => (m.status === 'completed' && m.score_confirmed) || m.id === match.id);
        if (allDone) {
          await supabase.from('tournaments').update({ status: 'completed' }).eq('id', tournamentId);
        }
      }

      loadData();
    } catch (error) {
      console.error('Confirm error:', error);
      Alert.alert('Error', 'Could not confirm result.');
    }
  };

  const handleDisputeResult = async (match: TournamentMatch) => {
    try {
      const now = new Date().toISOString();
      const { error: matchError } = await supabase.from('tournament_matches').update({
        status: 'disputed',
        score_confirmed: false,
        disputed_by: userId,
        disputed_at: now,
      }).eq('id', match.id);

      if (matchError) throw matchError;

      const opponentName = participants.find(p => p.user_id === userId)?.display_name ?? 'The opponent';

      if (match.score_submitted_by) {
        const { error: notifError } = await supabase.from('notifications').insert({
          user_id: match.score_submitted_by,
          type: 'tournament_score_disputed',
          title: 'Result disputed',
          message: `${opponentName} disputed the match result. Please review and resubmit.`,
          tournament_match_id: match.id,
          match_id: null,
          group_id: null,
          created_by: userId,
          is_read: false
        } as any);
        if (notifError) console.error('Notification insert error:', notifError);
      }

      loadData();
    } catch (error) {
      console.error('Dispute error:', error);
      Alert.alert('Error', 'Could not dispute result.');
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

  const handleDelete = () => {
    setShowSettings(false);
    if (!tournament) return;
    
    setTimeout(() => {
      Alert.alert(
        'Delete Tournament?',
        'This will permanently delete the tournament, its players, fixtures, and results. This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                setDeleting(true);
                const { data, error } = await supabase.rpc('delete_tournament_as_creator', {
                  p_tournament_id: tournament.id,
                });

                if (error) {
                  console.error('Delete tournament RPC error:', error);
                  Alert.alert('Delete failed', error.message || 'Could not delete tournament.');
                  return;
                }

                const response = data as DeleteTournamentRpcResponse;

                if (response && response.success === false) {
                  Alert.alert('Delete failed', response.message || 'Could not delete tournament.');
                  return;
                }

                Alert.alert('Tournament deleted', response?.message || 'Tournament deleted successfully.');
                onBack();
              } catch (error: any) {
                console.error('Delete tournament catch error:', error);
                Alert.alert('Delete failed', error?.message || 'Could not delete tournament.');
              } finally {
                setDeleting(false);
              }
            },
          },
        ]
      );
    }, 400);
  };

  const renderMatchCard = (item: TournamentMatch) => {
    const p1 = participants.find(p => p.user_id === item.player_home);
    const p2 = participants.find(p => p.user_id === item.player_away);
    const isMyMatch = (item.player_home === userId || item.player_away === userId) && item.status === 'pending';
    const isWinner1 = item.winner === item.player_home;
    const isWinner2 = item.winner === item.player_away;
    const isCompleted = item.status === 'completed';
    const isPendingConfirmation = item.status === 'pending_confirmation';
    const isDisputed = item.status === 'disputed';
    const hasScores = isCompleted || isPendingConfirmation || isDisputed;

    let submitterId = item.score_submitted_by;
    let opponentId = null;
    if (submitterId === item.player_home) opponentId = item.player_away;
    else if (submitterId === item.player_away) opponentId = item.player_home;

    const isSubmitter = userId === submitterId;
    const isConfirmationOpponent = userId === opponentId;

    return (
      <View key={item.id} style={styles.matchCard}>
        {isCompleted && (
          <View style={styles.matchStatusBadge}>
            <Text style={styles.matchStatusText}>Completed</Text>
          </View>
        )}
        {isPendingConfirmation && (
          <View style={[styles.matchStatusBadge, { backgroundColor: COLORS.surface }]}>
            <Text style={[styles.matchStatusText, { color: COLORS.warning }]}>Pending Confirmation</Text>
          </View>
        )}
        {isDisputed && (
          <View style={[styles.matchStatusBadge, { backgroundColor: COLORS.surface }]}>
            <Text style={[styles.matchStatusText, { color: COLORS.error }]}>Disputed</Text>
          </View>
        )}

        <View style={styles.matchContent}>
          <View style={styles.matchPlayersCol}>
            <Text style={[styles.matchPlayer, isWinner1 && isCompleted && styles.matchWinner]} numberOfLines={1}>{p1?.display_name ?? 'TBD'}</Text>
            <Text style={[styles.matchPlayer, isWinner2 && isCompleted && styles.matchWinner]} numberOfLines={1}>{p2?.display_name ?? 'TBD'}</Text>
          </View>
          <View style={styles.matchScoresCol}>
            <Text style={[styles.matchScore, isWinner1 && isCompleted && styles.matchWinner]}>{hasScores ? item.score_home : '-'}</Text>
            <Text style={[styles.matchScore, isWinner2 && isCompleted && styles.matchWinner]}>{hasScores ? item.score_away : '-'}</Text>
          </View>
        </View>

        {isPendingConfirmation && (
          <View style={styles.matchActionContainer}>
            {isConfirmationOpponent ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable style={[styles.scoreAction, { flex: 1, backgroundColor: COLORS.success }]} onPress={() => {
                  setFeedback({
                    visible: true,
                    type: 'info',
                    title: 'Confirm result?',
                    message: 'This will finalize the match result.',
                    primaryButtonText: 'Confirm',
                    secondaryButtonText: 'Cancel',
                    onPrimaryPress: () => {
                      setFeedback(null);
                      handleConfirmResult(item);
                    },
                    onSecondaryPress: () => setFeedback(null)
                  });
                }}>
                  <Text style={[styles.scoreActionText, { color: COLORS.textInverse }]}>Confirm</Text>
                </Pressable>
                <Pressable style={[styles.scoreAction, { flex: 1, backgroundColor: COLORS.error }]} onPress={() => {
                  setFeedback({
                    visible: true,
                    type: 'warning',
                    title: 'Dispute result?',
                    message: 'The submitter will be notified and can edit the score.',
                    primaryButtonText: 'Dispute',
                    secondaryButtonText: 'Cancel',
                    onPrimaryPress: () => {
                      setFeedback(null);
                      handleDisputeResult(item);
                    },
                    onSecondaryPress: () => setFeedback(null)
                  });
                }}>
                  <Text style={[styles.scoreActionText, { color: COLORS.textInverse }]}>Dispute</Text>
                </Pressable>
              </View>
            ) : isSubmitter ? (
              <View style={styles.passiveAction}>
                <Text style={styles.passiveActionText}>Waiting for opponent confirmation</Text>
              </View>
            ) : (
              <View style={styles.passiveAction}>
                <Text style={styles.passiveActionText}>Pending confirmation</Text>
              </View>
            )}
          </View>
        )}

        {isDisputed && (
          <View style={styles.matchActionContainer}>
            {isSubmitter ? (
              <Pressable style={styles.scoreAction} onPress={() => { setScoreModalMatch(item); setScoreHome(item.score_home?.toString() || ''); setScoreAway(item.score_away?.toString() || ''); }}>
                <Text style={styles.scoreActionText}>Resubmit Score</Text>
              </Pressable>
            ) : (
              <View style={styles.passiveAction}>
                <Text style={styles.passiveActionText}>Waiting for updated result.</Text>
              </View>
            )}
          </View>
        )}

        {item.status === 'pending' && (
          <View style={styles.matchActionContainer}>
            {isMyMatch ? (
              <Pressable style={styles.scoreAction} onPress={() => { setScoreModalMatch(item); setScoreHome(''); setScoreAway(''); }}>
                <Text style={styles.scoreActionText}>Enter Score</Text>
              </Pressable>
            ) : (
              <View style={styles.passiveAction}>
                <Text style={styles.passiveActionText}>Waiting for players...</Text>
              </View>
            )}
          </View>
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} indicatorStyle="white">
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
              <Text style={styles.infoLabel}>PACE</Text>
              <Text style={styles.infoValue}>{(tournament?.tempo || 'normal').toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.infoTop}>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>EST. COMPLETION</Text>
              <Text style={[styles.infoValue, { fontSize: 13, color: COLORS.textSecondary }]}>
                {tournament?.estimated_completion || `${tournament?.round_deadline_hours || 24}h per round`}
              </Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>VISIBILITY</Text>
              <Text style={[styles.infoValue, { fontSize: 13, color: COLORS.textSecondary }]}>{tournament?.is_public ? 'PUBLIC' : 'PRIVATE'}</Text>
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

        {/* Start Button (Admin) */}
        {isCreator && tournament?.status === 'open' && (
          <Pressable 
            style={[styles.mainBtn, { marginBottom: 20 }]} 
            onPress={startTournament}
            disabled={starting}
          >
            {starting ? (
              <ActivityIndicator color={COLORS.textInverse} />
            ) : (
              <Text style={styles.mainBtnText}>Start Tournament</Text>
            )}
          </Pressable>
        )}

        {/* Champion UI */}
        {((tournament?.status === 'completed' && tournament.winner_id) || leagueChampion) && (
          <View style={[styles.infoCard, { marginTop: 0, paddingVertical: 16, alignItems: 'center', borderColor: COLORS.warning, borderWidth: 1 }]}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.warning, letterSpacing: 1, marginBottom: 4 }}>🏆 CHAMPION</Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.textPrimary }}>
              {leagueChampion ? leagueChampion.name : (participants.find(p => p.user_id === tournament?.winner_id)?.display_name ?? 'Champion selected')}
            </Text>
          </View>
        )}

        {/* Tabs */}
        <View style={styles.tabs}>
          <Pressable style={[styles.tab, activeTab === 'bracket' && styles.tabActive]} onPress={() => setActiveTab('bracket')}>
            <Text style={[styles.tabText, activeTab === 'bracket' && styles.tabTextActive]}>
              {tournament?.format === 'league' ? 'Matches' : 'Bracket'}
            </Text>
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
            {participants.map((p, index) => {
              const participantKey = p.id || p.user_id || `participant-${index}`;
              return (
                <View key={participantKey} style={styles.participantItem}>
                  <View style={styles.avatar}><Text>{p.avatar_url ?? p.display_name.charAt(0)}</Text></View>
                  <Text style={styles.participantName}>{p.display_name}</Text>
                  {p.user_id === tournament?.created_by && <View style={styles.creatorBadge}><Text style={styles.creatorBadgeText}>Creator</Text></View>}
                </View>
              );
            })}
            
            {tournament?.status === 'open' && !isParticipant && participants.length < (tournament?.max_participants ?? 0) && (
              <View style={styles.actions}>
                <Pressable style={styles.mainBtn} onPress={async () => {
                  const { error } = await supabase.from('tournament_participants').insert({ tournament_id: tournamentId, user_id: userId, seed: participants.length + 1 });
                  if (!error) loadData();
                }}><Text style={styles.mainBtnText}>Join Tournament</Text></Pressable>
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
          </View>
        )}

        {activeTab === 'bracket' && (
          <View style={styles.tabContent}>
            {tournament?.status === 'open' ? (
              <Text style={styles.emptyText}>
                {tournament?.format === 'league' ? 'Matches will appear once tournament starts' : 'Bracket will appear once tournament starts'}
              </Text>
            ) : (
              tournament?.format === 'knockout' ? (
                <View style={styles.bracketContainer}>
                  {(() => {
                    const maxRound = Math.max(...matches.map(m => m.round), 1);
                    const roundsArray = Array.from({ length: maxRound }, (_, i) => i + 1);
                    
                    return roundsArray.map(round => {
                      const roundMatches = matches.filter(m => m.round === round);
                      if (roundMatches.length === 0) return null;

                      let label = `ROUND ${round}`;
                      if (roundMatches.length === 1) label = 'FINAL';
                      else if (roundMatches.length === 2) label = 'SEMI FINALS';
                      else if (roundMatches.length === 4) label = 'QUARTER FINALS';
                      else if (roundMatches.length === 8) label = 'ROUND OF 16';

                      return (
                        <View key={round} style={styles.roundGroup}>
                          <Text style={styles.roundLabel}>{label}</Text>
                          {roundMatches.map(m => <View key={m.id}>{renderMatchCard(m)}</View>)}
                        </View>
                      );
                    });
                  })()}
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
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView 
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Enter Score</Text>
              <View style={styles.scoreRow}>
                <View style={styles.scoreInputGroup}>
                  <Text style={styles.playerName}>{participants.find(p => p.user_id === scoreModalMatch?.player_home)?.display_name}</Text>
                  <TextInput 
                    style={styles.scoreInput} 
                    value={scoreHome} 
                    onChangeText={setScoreHome} 
                    keyboardType="number-pad" 
                    placeholder="0"
                    returnKeyType="done"
                    blurOnSubmit={true}
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>
                <Text style={styles.vsText}>VS</Text>
                <View style={styles.scoreInputGroup}>
                  <Text style={styles.playerName}>{participants.find(p => p.user_id === scoreModalMatch?.player_away)?.display_name}</Text>
                  <TextInput 
                    style={styles.scoreInput} 
                    value={scoreAway} 
                    onChangeText={setScoreAway} 
                    keyboardType="number-pad" 
                    placeholder="0"
                    returnKeyType="done"
                    blurOnSubmit={true}
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>
              </View>
              <View style={styles.modalActions}>
                <Pressable style={styles.cancelBtn} onPress={() => { Keyboard.dismiss(); setScoreModalMatch(null); }}><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
                <Pressable style={styles.saveBtn} onPress={saveScore} disabled={savingScore}>
                  {savingScore ? <ActivityIndicator color={COLORS.textInverse} /> : <Text style={styles.saveBtnText}>Save Result</Text>}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
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

            {isCreator && (
              <>
                <View style={styles.actionDivider} />
                <Pressable style={styles.actionItem} onPress={handleDelete} disabled={deleting}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {deleting ? (
                      <ActivityIndicator color={COLORS.error} size={24} />
                    ) : (
                      <Ionicons name="trash-outline" size={24} color={COLORS.error} />
                    )}
                    <Text style={[styles.actionItemText, { color: COLORS.error }]}>
                      {deleting ? 'Deleting...' : 'Delete Tournament'}
                    </Text>
                  </View>
                  {!deleting && <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />}
                </Pressable>
              </>
            )}

            <Pressable style={styles.actionCancel} onPress={() => setShowSettings(false)}>
              <Text style={styles.actionCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <FeedbackModal
        visible={feedback?.visible || false}
        type={feedback?.type || 'info'}
        title={feedback?.title || ''}
        message={feedback?.message || ''}
        primaryButtonText={feedback?.primaryButtonText}
        secondaryButtonText={feedback?.secondaryButtonText}
        onPrimaryPress={feedback?.onPrimaryPress || (() => setFeedback(null))}
        onSecondaryPress={feedback?.onSecondaryPress}
        onClose={() => setFeedback(null)}
      />
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
  tabTextActive: { color: COLORS.textInverse },
  tabContent: { gap: 12 },
  participantItem: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  participantName: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  creatorBadge: { backgroundColor: COLORS.primaryMuted, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  creatorBadgeText: { fontSize: 10, color: COLORS.primary, fontWeight: '700' },
  actions: { marginTop: 12, gap: 12 },
  mainBtn: { height: 52, backgroundColor: COLORS.primary, borderRadius: RADIUS.button, justifyContent: 'center', alignItems: 'center' },
  mainBtnText: { color: COLORS.textInverse, fontSize: 16, fontWeight: '700' },
  tableHeader: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tableRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.surface },
  championRow: { backgroundColor: COLORS.warningMuted, borderRadius: 8 },
  tableCol: { flex: 1, fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },
  matchesTitle: { fontSize: 16, fontWeight: '700', marginTop: 16 },
  matchCard: { padding: 16, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  matchStatusBadge: { alignSelf: 'flex-start', backgroundColor: COLORS.surface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 12 },
  matchStatusText: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase' },
  matchContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  matchPlayersCol: { flex: 1, gap: 12 },
  matchScoresCol: { alignItems: 'flex-end', gap: 12, paddingLeft: 16 },
  matchPlayer: { fontSize: 16, fontWeight: '600', color: COLORS.textSecondary },
  matchWinner: { color: COLORS.success, fontWeight: '700' },
  matchScore: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
  matchActionContainer: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.surface },
  scoreAction: { backgroundColor: COLORS.primaryMuted, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  scoreActionText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  passiveAction: { alignItems: 'center', paddingVertical: 8 },
  passiveActionText: { fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic' },
  roundGroup: { marginTop: 16, gap: 8 },
  roundLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 1, marginBottom: 4 },
  emptyText: { textAlign: 'center', marginTop: 40, color: COLORS.textMuted },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  bracketContainer: { gap: 24 },
  leagueMatches: { gap: 12 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 32 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center', marginBottom: 24 },
  scoreInputGroup: { flex: 1, alignItems: 'center', gap: 8 },
  playerName: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
  scoreInput: { width: 64, height: 64, backgroundColor: COLORS.backgroundSecondary, borderRadius: 16, fontSize: 28, fontWeight: '800', textAlign: 'center', color: COLORS.textPrimary },
  vsText: { fontSize: 14, fontWeight: '800', color: COLORS.textMuted },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: COLORS.backgroundSecondary, justifyContent: 'center', alignItems: 'center' },
  cancelBtnText: { fontWeight: '700', color: COLORS.textSecondary },
  saveBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { fontWeight: '700', color: COLORS.textInverse },
  actionSheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, width: '100%' },
  actionItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  actionItemText: { fontSize: 17, fontWeight: '600' },
  actionDivider: { height: 1, backgroundColor: COLORS.border },
  actionCancel: { marginTop: 16, height: 52, borderRadius: RADIUS.button, backgroundColor: COLORS.backgroundSecondary, justifyContent: 'center', alignItems: 'center' },
  actionCancelText: { fontSize: 16, fontWeight: '700', color: COLORS.textSecondary },
});
