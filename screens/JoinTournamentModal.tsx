import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS, RADIUS, SIZES, SPACING } from '../constants/theme';
import { FeedbackModal, FeedbackType } from '../components/FeedbackModal';

type JoinTournamentModalProps = {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onJoined: (tournamentId: string, tournamentName: string) => void;
};

export function JoinTournamentModal({ visible, userId, onClose, onJoined }: JoinTournamentModalProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ visible: boolean; type: FeedbackType; title: string; message: string; onPrimaryPress?: () => void } | null>(null);

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);

    try {
      const { data, error: rpcError } = await supabase.rpc('join_tournament_by_invite_code', {
        p_invite_code: trimmed
      });

      if (rpcError || (data && data.success === false)) {
        if (rpcError) console.error('Join tournament RPC error:', rpcError);
        
        if (data?.error === 'already_started') {
          setFeedback({ visible: true, type: 'warning', title: "Tournament already started", message: data?.message || "You can no longer join this tournament because it has already started." });
        } else if (data?.error === 'completed') {
          setFeedback({ visible: true, type: 'warning', title: "Tournament completed", message: data?.message || "You can no longer join this tournament because it has already ended." });
        } else if (data?.error === 'not_found') {
          setFeedback({ visible: true, type: 'error', title: "Invalid code", message: data?.message || "Check the invite code and try again." });
        } else if (data?.error === 'full') {
          setFeedback({ visible: true, type: 'warning', title: "Tournament full", message: data?.message || "This tournament has reached its maximum capacity." });
        } else {
          setFeedback({ visible: true, type: 'error', title: "Could not join tournament", message: data?.message || rpcError?.message || "Please try again." });
        }
        setLoading(false);
        return;
      }

      if (data?.success === true) {
        if (data.already_joined) {
          setFeedback({
            visible: true,
            type: 'info',
            title: 'Already Joined',
            message: 'You are already in this tournament.',
            onPrimaryPress: () => {
              setFeedback(null);
              if (data.tournament_id && data.tournament_name) {
                onJoined(data.tournament_id, data.tournament_name);
              }
              onClose();
            }
          });
        } else {
          setFeedback({
            visible: true,
            type: 'success',
            title: 'Success',
            message: `You have joined "${data.tournament_name}"!`,
            onPrimaryPress: () => {
              setFeedback(null);
              setCode('');
              if (data.tournament_id && data.tournament_name) {
                onJoined(data.tournament_id, data.tournament_name);
              }
              onClose();
            }
          });
        }
      }
    } catch (error) {
      setFeedback({ visible: true, type: 'error', title: 'Error', message: 'An unexpected error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.overlayBackground}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
              <View style={styles.header}>
                <Text style={styles.title}>Join Tournament</Text>
                <Pressable onPress={onClose}>
                  <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                </Pressable>
              </View>

              <View style={styles.form}>
                <Text style={styles.label}>Invite Code</Text>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="Enter invite code"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  style={styles.input}
                />

                <Pressable
                  style={[styles.joinButton, (!code.trim() || loading) && styles.disabledButton]}
                  onPress={handleJoin}
                  disabled={!code.trim() || loading}
                >
                  {loading ? <ActivityIndicator color={COLORS.textInverse} /> : <Text style={styles.joinButtonText}>Join Tournament</Text>}
                </Pressable>
              </View>
            </Pressable>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <FeedbackModal
        visible={feedback?.visible || false}
        type={feedback?.type || 'info'}
        title={feedback?.title || ''}
        message={feedback?.message || ''}
        onPrimaryPress={feedback?.onPrimaryPress || (() => setFeedback(null))}
        onClose={() => setFeedback(null)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayBackground: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: -8,
  },
  input: {
    height: 52,
    backgroundColor: COLORS.backgroundSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    paddingHorizontal: 16,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  joinButton: {
    height: 52,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.button,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  disabledButton: {
    backgroundColor: COLORS.textMuted,
  },
  joinButtonText: {
    color: COLORS.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
});
