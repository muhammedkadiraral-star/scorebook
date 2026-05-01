import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';

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
      <View style={styles.card}>
        <Text style={styles.title}>Set your name</Text>
        <Text style={styles.subtitle}>Choose a display name your friends can recognize.</Text>

        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Display name"
          style={styles.input}
          autoCapitalize="words"
          autoCorrect={false}
          placeholderTextColor="#9AA0A6"
        />

        <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleContinue} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Continue</Text>}
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
});
