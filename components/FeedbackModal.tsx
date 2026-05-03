import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../constants/theme';

export type FeedbackType = 'success' | 'error' | 'warning' | 'info';

export type FeedbackModalProps = {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message: string;
  primaryButtonText?: string;
  onPrimaryPress?: () => void;
  secondaryButtonText?: string;
  onSecondaryPress?: () => void;
  onClose?: () => void;
};

export function FeedbackModal({
  visible,
  type,
  title,
  message,
  primaryButtonText = 'OK',
  onPrimaryPress,
  secondaryButtonText,
  onSecondaryPress,
  onClose,
}: FeedbackModalProps) {
  const scaleValue = useRef(new Animated.Value(0.9)).current;
  const opacityValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleValue, {
          toValue: 1,
          useNativeDriver: true,
          tension: 65,
          friction: 7,
        }),
        Animated.timing(opacityValue, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleValue, {
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacityValue, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, scaleValue, opacityValue]);

  if (!visible && opacityValue._value === 0) return null;

  const getThemeColors = () => {
    switch (type) {
      case 'success':
        return { icon: 'checkmark-circle', color: COLORS.success, bg: COLORS.successMuted };
      case 'error':
        return { icon: 'close-circle', color: COLORS.error, bg: COLORS.errorMuted };
      case 'warning':
        return { icon: 'warning', color: COLORS.warning, bg: COLORS.warningMuted };
      case 'info':
      default:
        return { icon: 'information-circle', color: COLORS.primary, bg: COLORS.primaryMuted };
    }
  };

  const theme = getThemeColors();

  const handlePrimaryPress = () => {
    if (onPrimaryPress) onPrimaryPress();
    else if (onClose) onClose();
  };

  const handleSecondaryPress = () => {
    if (onSecondaryPress) onSecondaryPress();
    else if (onClose) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: opacityValue }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.content, { transform: [{ scale: scaleValue }] }]}>
          
          <View style={[styles.iconContainer, { backgroundColor: theme.bg }]}>
            <Ionicons name={theme.icon as any} size={32} color={theme.color} />
          </View>
          
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.buttonContainer}>
            {secondaryButtonText && (
              <Pressable style={styles.secondaryButton} onPress={handleSecondaryPress}>
                <Text style={styles.secondaryButtonText}>{secondaryButtonText}</Text>
              </Pressable>
            )}
            <Pressable 
              style={[styles.primaryButton, { flex: secondaryButtonText ? 1 : undefined, width: secondaryButtonText ? undefined : '100%', backgroundColor: type === 'error' ? COLORS.error : COLORS.primary }]} 
              onPress={handlePrimaryPress}
            >
              <Text style={styles.primaryButtonText}>{primaryButtonText}</Text>
            </Pressable>
          </View>

        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  primaryButton: {
    height: 52,
    borderRadius: RADIUS.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: COLORS.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: COLORS.backgroundSecondary,
    height: 52,
    borderRadius: RADIUS.button,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  secondaryButtonText: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
