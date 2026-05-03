import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { COLORS, RADIUS, SIZES, SPACING } from '../constants/theme';

type SetNameScreenProps = {
  userId: string;
  onCompleted: () => void;
};

export function SetNameScreen({ userId, onCompleted }: SetNameScreenProps) {
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      Alert.alert('Missing name', 'Please enter your display name.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ display_name: trimmedName })
        .eq('id', userId);

      if (error) throw error;
      onCompleted();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save display name.';
      Alert.alert('Set name error', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <Text style={styles.title}>What should we call you?</Text>
        <Text style={styles.subtitle}>Choose a display name your friends can recognize.</Text>

        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Display name"
          style={styles.input}
          autoCapitalize="words"
          autoCorrect={false}
          placeholderTextColor="#4B5563"
        />

        <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleContinue} disabled={saving}>
          {saving ? <ActivityIndicator color={COLORS.textInverse} /> : <Text style={styles.buttonText}>Continue</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 24,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: COLORS.textPrimary,
    marginBottom: 20,
  },
  button: {
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: COLORS.textInverse,
    fontSize: 16,
    fontWeight: '600',
  },
});
