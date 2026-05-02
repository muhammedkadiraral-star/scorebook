import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session, User } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './lib/supabase';
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
        <StatusBar style="dark" />
        <ActivityIndicator color="#3B82F6" />
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
          <StatusBar style="dark" />
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
                  <Ionicons name="game-controller" size={24} color={route.name === 'groups' ? '#3B82F6' : '#9CA3AF'} />
                </Pressable>
                <Pressable style={styles.tabItem} onPress={() => setRoute({ name: 'tournaments' })}>
                  <Ionicons name="trophy" size={24} color={route.name === 'tournaments' ? '#3B82F6' : '#9CA3AF'} />
                </Pressable>
                <Pressable 
                  style={styles.tabItem} 
                  onPress={() => {
                    setRoute({ name: 'notifications' });
                    setUnreadCount(0); // Optimistic clear
                  }}
                >
                  <View>
                    <Ionicons name="notifications" size={24} color={route.name === 'notifications' ? '#3B82F6' : '#9CA3AF'} />
                    {unreadCount > 0 && <View style={styles.unreadBadge} />}
                  </View>
                </Pressable>
                <Pressable style={styles.tabItem} onPress={() => setRoute({ name: 'profile' })}>
                  <Ionicons name="person" size={24} color={route.name === 'profile' ? '#3B82F6' : '#9CA3AF'} />
                </Pressable>
              </View>
              <Pressable style={styles.plusButton} onPress={() => setShowPlusModal(true)}>
                <Ionicons name="add" size={32} color="#FFFFFF" />
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
                    <Ionicons name="add-circle-outline" size={24} color="#111827" />
                    <Text style={styles.actionItemText}>Create Group</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
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
                    <Ionicons name="enter-outline" size={24} color="#111827" />
                    <Text style={styles.actionItemText}>Join Group</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
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
                    <Ionicons name="trophy-outline" size={24} color="#111827" />
                    <Text style={styles.actionItemText}>Create Tournament</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
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
                    <Ionicons name="ticket-outline" size={24} color="#111827" />
                    <Text style={styles.actionItemText}>Join Tournament</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
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
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.card}>
        <Text style={styles.title}>{isSignUpMode ? 'Create Account' : 'Welcome Back'}</Text>
        <Text style={styles.subtitle}>
          {isSignUpMode ? 'Sign up with your email and password' : 'Sign in to continue'}
        </Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          placeholderTextColor="#6B7280"
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          placeholderTextColor="#6B7280"
        />

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleAuth}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>{isSignUpMode ? 'Sign Up' : 'Sign In'}</Text>
          )}
        </Pressable>

        <Pressable onPress={() => setIsSignUpMode((prev) => !prev)} disabled={loading}>
          <Text style={styles.toggleText}>
            {isSignUpMode ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1A1A1A',
    marginBottom: 12,
  },
  button: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  toggleText: {
    marginTop: 16,
    textAlign: 'center',
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '500',
  },
  mainTabWrapper: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mainContent: {
    flex: 1,
  },
  tabBarSafeArea: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
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
    backgroundColor: '#F3F4F6',
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
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: '#FFFFFF',
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
    color: '#111827',
  },
  actionDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  actionCancel: {
    marginTop: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
});
