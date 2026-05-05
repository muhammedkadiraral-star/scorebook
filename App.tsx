import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session, User } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './lib/supabase';
import { COLORS, RADIUS, SIZES, SPACING } from './constants/theme';
import { GroupsScreen } from './screens/GroupsScreen';
import { GroupDetailScreen, type GroupMemberOption } from './screens/GroupDetailScreen';
import { NewMatchScreen } from './screens/NewMatchScreen';
import { SetNameScreen } from './screens/SetNameScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { GameSelectScreen } from './screens/GameSelectScreen';
import { CreateGroupScreen } from './screens/CreateGroupScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { JoinGroupModal } from './screens/JoinGroupModal';
import { JoinTournamentModal } from './screens/JoinTournamentModal';
import { TournamentsScreen } from './screens/TournamentsScreen';
import { CreateTournamentScreen } from './screens/CreateTournamentScreen';
import { TournamentDetailScreen } from './screens/TournamentDetailScreen';
import { CreateHostTournamentScreen } from './screens/CreateHostTournamentScreen';
import { HostTournamentDetailScreen } from './screens/HostTournamentDetailScreen';
import { HostModeHomeScreen } from './screens/HostModeHomeScreen';

type AppRoute =
  | { name: 'groups' }
  | { name: 'notifications' }
  | { name: 'profile' }
  | { name: 'tournaments' }
  | { name: 'gameSelect'; target: 'group' | 'tournament' }
  | { name: 'createGroup'; gameType: string }
  | { name: 'createTournament'; gameType: string }
  | { name: 'groupDetail'; groupId: string; groupName: string }
  | { name: 'tournamentDetail'; tournamentId: string; tournamentName: string }
  | { name: 'hostModeHome' }
  | { name: 'createHostTournament' }
  | { name: 'hostTournamentDetail'; hostTournamentId: string; hostTournamentName: string }
  | { name: 'newMatch'; groupId: string; groupName: string; members: GroupMemberOption[] };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingUserRecord, setCheckingUserRecord] = useState(false);
  const [needsDisplayName, setNeedsDisplayName] = useState(false);
  const [route, setRoute] = useState<AppRoute>({ name: 'groups' });

  // Tab state modals
  const [showPlusModal, setShowPlusModal] = useState(false);
  const [joinVisible, setJoinVisible] = useState(false);
  const [joinTournamentVisible, setJoinTournamentVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const ensurePublicUserRecord = async (authUser: User) => {
    const fallbackName = authUser.email ?? `user-${authUser.id.slice(0, 8)}`;
    const { data: existingUser, error: lookupError } = await supabase
      .from('users')
      .select('id')
      .eq('id', authUser.id)
      .maybeSingle();

    if (lookupError) {
      Alert.alert('Debug', JSON.stringify(lookupError));
      throw lookupError;
    }

    if (!existingUser) {
      const { error: insertError } = await supabase.from('users').upsert(
        {
          id: authUser.id,
          display_name: fallbackName,
        },
        { onConflict: 'id' }
      );
      if (insertError) {
        Alert.alert('Debug', JSON.stringify(insertError));
        throw insertError;
      }
    }
  };

  const checkDisplayNameStatus = async (authUser: User) => {
    const { data, error } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', authUser.id)
      .maybeSingle();
    if (error) throw error;

    const displayName = data?.display_name?.trim() ?? '';
    const email = authUser.email?.trim().toLowerCase() ?? '';
    const shouldSetName = displayName.length === 0 || displayName.toLowerCase() === email;
    setNeedsDisplayName(shouldSetName);
  };

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncPublicUser = async () => {
      if (!session?.user) {
        setCheckingUserRecord(false);
        setNeedsDisplayName(false);
        return;
      }

      setCheckingUserRecord(true);
      try {
        await ensurePublicUserRecord(session.user);
        await checkDisplayNameStatus(session.user);
      } catch (error) {
        console.error('Failed ensuring public.users record:', error);
        const message = error instanceof Error ? error.message : 'Could not sync user profile.';
        Alert.alert('Profile sync error', message);
      } finally {
        if (!cancelled) {
          setCheckingUserRecord(false);
        }
      }
    };

    void syncPublicUser();

    return () => {
      cancelled = true;
    };
  }, [session]);

  const fetchUnreadCount = async () => {
    if (!session?.user) return;
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .eq('is_read', false);
      
      if (error) throw error;
      setUnreadCount(count ?? 0);
    } catch (err) {
      console.error('Error fetching unread count:', err);
    }
  };

  useEffect(() => {
    if (!session?.user) return;
    
    void fetchUnreadCount();
    const interval = setInterval(() => {
      void fetchUnreadCount();
    }, 30000);

    return () => clearInterval(interval);
  }, [session?.user]);

  const handleAuth = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      Alert.alert('Missing info', 'Please fill in email and password.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUpMode) {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPassword,
        });
        if (error) throw error;

        if (data.user) {
          await ensurePublicUserRecord(data.user);
        }

        Alert.alert('Account created', 'Check your email to confirm your account.');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPassword,
        });
        if (error) throw error;

        if (data.user) {
          await ensurePublicUserRecord(data.user);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      Alert.alert('Auth error', message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setRoute({ name: 'groups' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sign out.';
      Alert.alert('Sign out error', message);
    } finally {
      setLoading(false);
    }
  };

  if (session && checkingUserRecord) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (session) {
    if (needsDisplayName) {
      return (
        <SetNameScreen
          userId={session.user.id}
          onCompleted={() => {
            setNeedsDisplayName(false);
            setRoute({ name: 'groups' });
          }}
        />
      );
    }

    if (route.name === 'groupDetail') {
      return (
        <GroupDetailScreen
          groupId={route.groupId}
          groupName={route.groupName}
          userId={session.user.id}
          onBack={() => setRoute({ name: 'groups' })}
          onAddMatch={(members) =>
            setRoute({
              name: 'newMatch',
              groupId: route.groupId,
              groupName: route.groupName,
              members,
            })
          }
        />
      );
    }

    if (route.name === 'newMatch') {
      return (
        <NewMatchScreen
          groupId={route.groupId}
          groupName={route.groupName}
          members={route.members}
          onBack={() =>
            setRoute({
              name: 'groupDetail',
              groupId: route.groupId,
              groupName: route.groupName,
            })
          }
          onSaved={() =>
            setRoute({
              name: 'groupDetail',
              groupId: route.groupId,
              groupName: route.groupName,
            })
          }
        />
      );
    }

    if (route.name === 'gameSelect') {
      return (
        <GameSelectScreen
          userId={session.user.id}
          onBack={() => setRoute({ name: 'groups' })}
          onSelectGame={(gameName) => {
            if (route.target === 'tournament') {
              setRoute({ name: 'createTournament', gameType: gameName });
            } else {
              setRoute({ name: 'createGroup', gameType: gameName });
            }
          }}
        />
      );
    }

    if (route.name === 'createTournament') {
      return (
        <CreateTournamentScreen
          userId={session.user.id}
          gameType={route.gameType}
          onBack={() => setRoute({ name: 'tournaments' })}
          onCreated={() => setRoute({ name: 'tournaments' })}
        />
      );
    }

    if (route.name === 'tournamentDetail') {
      return (
        <TournamentDetailScreen
          userId={session.user.id}
          tournamentId={route.tournamentId}
          tournamentName={route.tournamentName}
          onBack={() => setRoute({ name: 'tournaments' })}
        />
      );
    }

    if (route.name === 'hostModeHome') {
      return (
        <HostModeHomeScreen
          userId={session.user.id}
          onBack={() => setRoute({ name: 'tournaments' })}
          onCreateNew={() => setRoute({ name: 'createHostTournament' })}
          onOpenTournament={(id, name) => setRoute({ name: 'hostTournamentDetail', hostTournamentId: id, hostTournamentName: name })}
        />
      );
    }

    if (route.name === 'createHostTournament') {
      return (
        <CreateHostTournamentScreen
          userId={session.user.id}
          onBack={() => setRoute({ name: 'hostModeHome' })}
          onCreated={(id, name) => setRoute({ name: 'hostTournamentDetail', hostTournamentId: id, hostTournamentName: name })}
        />
      );
    }

    if (route.name === 'hostTournamentDetail') {
      return (
        <HostTournamentDetailScreen
          userId={session.user.id}
          hostTournamentId={route.hostTournamentId}
          hostTournamentName={route.hostTournamentName}
          onBack={() => setRoute({ name: 'hostModeHome' })}
        />
      );
    }

    if (route.name === 'createGroup') {
      return (
        <CreateGroupScreen
          userId={session.user.id}
          gameType={route.gameType}
          onBack={() => setRoute({ name: 'groups' })}
          onCreated={async () => {}}
        />
      );
    }

    if (route.name === 'groups' || route.name === 'profile' || route.name === 'notifications' || route.name === 'tournaments') {
      return (
        <View style={styles.mainTabWrapper}>
          <StatusBar style="light" />
          <View style={styles.mainContent}>
            {route.name === 'groups' && (
              <GroupsScreen
                userId={session.user.id}
                onOpenGroup={(group) =>
                  setRoute({
                    name: 'groupDetail',
                    groupId: group.id,
                    groupName: group.name,
                  })
                }
              />
            )}
            {route.name === 'profile' && (
              <ProfileScreen
                userId={session.user.id}
                onBack={() => setRoute({ name: 'groups' })}
                onSignOut={handleSignOut}
                loadingSignOut={loading}
              />
            )}
            {route.name === 'notifications' && <NotificationsScreen />}
            {route.name === 'tournaments' && (
              <TournamentsScreen
                userId={session.user.id}
                onOpenTournament={(t) =>
                  setRoute({
                    name: 'tournamentDetail',
                    tournamentId: t.id,
                    tournamentName: t.name,
                  })
                }
              />
            )}
          </View>

          {/* Bottom Tab Bar */}
          <SafeAreaView style={styles.tabBarSafeArea}>
            <View style={styles.tabBarContainer}>
              <View style={styles.tabPill}>
                <Pressable style={styles.tabItem} onPress={() => setRoute({ name: 'groups' })}>
                  <Ionicons name="game-controller" size={24} color={route.name === 'groups' ? COLORS.primary : COLORS.textMuted} />
                </Pressable>
                <Pressable style={styles.tabItem} onPress={() => setRoute({ name: 'tournaments' })}>
                  <Ionicons name="trophy" size={24} color={route.name === 'tournaments' ? COLORS.primary : COLORS.textMuted} />
                </Pressable>
                <Pressable 
                  style={styles.tabItem} 
                  onPress={() => {
                    setRoute({ name: 'notifications' });
                    setUnreadCount(0); // Optimistic clear
                  }}
                >
                  <View>
                    <Ionicons name="notifications" size={24} color={route.name === 'notifications' ? COLORS.primary : COLORS.textMuted} />
                    {unreadCount > 0 && <View style={styles.unreadBadge} />}
                  </View>
                </Pressable>
                <Pressable style={styles.tabItem} onPress={() => setRoute({ name: 'profile' })}>
                  <Ionicons name="person" size={24} color={route.name === 'profile' ? COLORS.primary : COLORS.textMuted} />
                </Pressable>
              </View>
              <Pressable style={styles.plusButton} onPress={() => setShowPlusModal(true)}>
                <Ionicons name="add" size={32} color={COLORS.textInverse} />
              </Pressable>
            </View>
          </SafeAreaView>

          {/* Plus Action Modal */}
          <Modal visible={showPlusModal} transparent animationType="slide" onRequestClose={() => setShowPlusModal(false)}>
            <Pressable style={styles.modalOverlay} onPress={() => setShowPlusModal(false)}>
              <Pressable style={styles.actionSheet} onPress={(e) => e.stopPropagation()}>
                <Pressable
                  style={styles.actionItem}
                  onPress={() => {
                    setShowPlusModal(false);
                    setRoute({ name: 'gameSelect', target: 'group' });
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Ionicons name="add-circle-outline" size={24} color={COLORS.primary} />
                    <Text style={styles.actionItemText}>Create Group</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
                </Pressable>
                <View style={styles.actionDivider} />
                <Pressable
                  style={styles.actionItem}
                  onPress={() => {
                    setShowPlusModal(false);
                    setJoinVisible(true);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Ionicons name="enter-outline" size={24} color={COLORS.primary} />
                    <Text style={styles.actionItemText}>Join Group</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
                </Pressable>
                <View style={styles.actionDivider} />
                <Pressable
                  style={styles.actionItem}
                  onPress={() => {
                    setShowPlusModal(false);
                    setRoute({ name: 'gameSelect', target: 'tournament' });
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Ionicons name="trophy-outline" size={24} color={COLORS.primary} />
                    <Text style={styles.actionItemText}>Create Tournament</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
                </Pressable>
                <View style={styles.actionDivider} />
                <Pressable
                  style={styles.actionItem}
                  onPress={() => {
                    setShowPlusModal(false);
                    setJoinTournamentVisible(true);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Ionicons name="ticket-outline" size={24} color={COLORS.primary} />
                    <Text style={styles.actionItemText}>Join Tournament</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
                </Pressable>
                <View style={styles.actionDivider} />
                <Pressable
                  style={styles.actionItem}
                  onPress={() => {
                    setShowPlusModal(false);
                    setRoute({ name: 'hostModeHome' });
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Ionicons name="people-outline" size={24} color={COLORS.primary} />
                    <Text style={styles.actionItemText}>Host Mode</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
                </Pressable>
                <Pressable style={styles.actionCancel} onPress={() => setShowPlusModal(false)}>
                  <Text style={styles.actionCancelText}>Cancel</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>

          <JoinGroupModal
            visible={joinVisible}
            userId={session.user.id}
            onClose={() => setJoinVisible(false)}
            onJoined={async () => {
              setRoute({ name: 'groups' });
            }}
          />

          <JoinTournamentModal
            visible={joinTournamentVisible}
            userId={session.user.id}
            onClose={() => setJoinTournamentVisible(false)}
            onJoined={(id, name) => {
              setRoute({ name: 'tournamentDetail', tournamentId: id, tournamentName: name });
            }}
          />
        </View>
      );
    }
  }

  return (
    <SafeAreaView style={styles.authContainer}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.authContent}>
          <View style={styles.brandArea}>
            <View style={{ flexDirection: 'row' }}>
              <Text style={styles.logoPart1}>Score</Text>
              <Text style={styles.logoPart2}>Book</Text>
            </View>
            <Text style={styles.tagline}>
              {isSignUpMode ? 'Your games. Your stats. Your legacy.' : 'Track. Compete. Prove it.'}
            </Text>
          </View>

          <Pressable
            style={styles.appleButton}
            onPress={() => Alert.alert('Coming soon', 'Apple sign-in will be available soon.')}
          >
            <Ionicons name="logo-apple" size={20} color="#111" />
            <Text style={styles.appleButtonText}>Continue with Apple</Text>
          </Pressable>

          <Pressable
            style={styles.googleButton}
            onPress={() => Alert.alert('Coming soon', 'Google sign-in will be available soon.')}
          >
            <Ionicons name="logo-google" size={18} color="#4285F4" />
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>
              {isSignUpMode ? 'or sign up with email' : 'or'}
            </Text>
            <View style={styles.dividerLine} />
          </View>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.authInput}
            placeholderTextColor={COLORS.textMuted}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.authInput, { marginTop: 10 }]}
            placeholderTextColor={COLORS.textMuted}
          />

          <Pressable
            style={[styles.primaryButton, loading && { opacity: 0.7 }]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.textInverse} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isSignUpMode ? 'Create account' : 'Sign in'}
              </Text>
            )}
          </Pressable>

          {isSignUpMode && (
            <Text style={styles.termsText}>
              By signing up, you agree to our Terms and Privacy Policy.
            </Text>
          )}
        </View>

        <View style={styles.authFooter}>
          <Pressable onPress={() => setIsSignUpMode((prev) => !prev)}>
            <Text style={styles.toggleText}>
              {isSignUpMode ? (
                <>
                  <Text style={{ color: COLORS.textMuted }}>Already have an account? </Text>
                  <Text style={{ color: COLORS.primary, fontWeight: '500' }}>Sign in</Text>
                </>
              ) : (
                <>
                  <Text style={{ color: COLORS.textMuted }}>Don't have an account? </Text>
                  <Text style={{ color: COLORS.primary, fontWeight: '500' }}>Sign up</Text>
                </>
              )}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  authContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  brandArea: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoPart1: {
    color: COLORS.textPrimary,
    fontSize: 32,
    fontWeight: '700',
  },
  logoPart2: {
    color: COLORS.primary,
    fontSize: 32,
    fontWeight: '700',
  },
  tagline: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 6,
  },
  appleButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.appleButton,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  appleButtonText: {
    color: COLORS.appleButtonText,
    fontWeight: '500',
    fontSize: 15,
  },
  googleButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.googleButton,
    borderWidth: 0.5,
    borderColor: COLORS.googleButtonBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  googleButtonText: {
    color: COLORS.googleButtonText,
    fontWeight: '500',
    fontSize: 15,
  },
  dividerRow: {
    marginVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginHorizontal: 12,
  },
  authInput: {
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  primaryButtonText: {
    color: COLORS.textInverse,
    fontSize: 16,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 12,
  },
  authFooter: {
    paddingHorizontal: 24,
    paddingBottom: 36,
  },
  toggleText: {
    textAlign: 'center',
    fontSize: 14,
  },
  mainTabWrapper: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  mainContent: {
    flex: 1,
  },
  tabBarSafeArea: {
    backgroundColor: COLORS.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  tabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 16,
  },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 28,
    height: 64,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabItem: {
    padding: 10,
  },
  plusButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  actionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 64,
  },
  actionItemText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  actionDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  actionCancel: {
    marginTop: 16,
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.error,
    borderWidth: 1,
    borderColor: COLORS.backgroundSecondary,
  },
});
