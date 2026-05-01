import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { GroupsScreen } from './screens/GroupsScreen';
import { GroupDetailScreen, type GroupMemberOption } from './screens/GroupDetailScreen';
import { NewMatchScreen } from './screens/NewMatchScreen';
import { SetNameScreen } from './screens/SetNameScreen';
import { ProfileScreen } from './screens/ProfileScreen';

type AppRoute =
  | { name: 'groups' }
  | { name: 'profile' }
  | { name: 'groupDetail'; groupId: string; groupName: string }
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
        <ActivityIndicator color="#6C5CE7" />
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

    if (route.name === 'profile') {
      return (
        <ProfileScreen
          userId={session.user.id}
          onBack={() => setRoute({ name: 'groups' })}
          onSignOut={handleSignOut}
          loadingSignOut={loading}
        />
      );
    }

    return (
      <GroupsScreen
        userId={session.user.id}
        onSignOut={handleSignOut}
        loadingSignOut={loading}
        onOpenProfile={() => setRoute({ name: 'profile' })}
        onOpenGroup={(group) =>
          setRoute({
            name: 'groupDetail',
            groupId: group.id,
            groupName: group.name,
          })
        }
      />
    );
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
          placeholderTextColor="#9AA0A6"
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          placeholderTextColor="#9AA0A6"
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
    shadowColor: '#1A1A1A',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F1F1F',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6F6F76',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F1F1F',
    marginBottom: 12,
  },
  button: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#6C5CE7',
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
    color: '#6C5CE7',
    fontSize: 14,
    fontWeight: '500',
  },
});
