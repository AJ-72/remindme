import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useColors } from "@/hooks/useColors";
import { getFontFamily } from "@/utils/getFontFamily";

/** Matches the reminder title cap; a display name never needs more. */
export const MAX_NAME_LENGTH = 40;

interface Props {
  visible: boolean;
  /** Seeds the field when editing an existing name. */
  initialName?: string;
  /** Skip is offered on first launch; Settings edits get Cancel instead. */
  skippable?: boolean;
  onSave: (name: string) => void | Promise<void>;
  onDismiss: () => void;
  /**
   * An extra link under Skip. First launch uses it for "I've used Reminders
   * before" (B3 Drive restore) - only offered on an empty install.
   */
  secondaryAction?: { label: string; onPress: () => void; testID: string };
}

/**
 * Asks for the user's own name. Used both by first-launch onboarding and by
 * the Settings row, which is why saving and dismissing are separate callbacks -
 * onboarding has to record that the prompt was SEEN even when it was skipped,
 * and Settings has no such bookkeeping.
 */
export default function NameSheet({
  visible,
  initialName = "",
  skippable = false,
  onSave,
  onDismiss,
  secondaryAction,
}: Props) {
  const colors = useColors();
  const [name, setName] = useState(initialName);

  // Re-seed each time it opens. Without this the sheet keeps whatever was
  // typed during a previous cancelled edit.
  useEffect(() => {
    if (visible) setName(initialName);
  }, [visible, initialName]);

  const styles = StyleSheet.create({
    flex: {
      flex: 1,
    },
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: Platform.OS === "ios" ? 40 : 28,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 4,
    },
    message: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 18,
      lineHeight: 20,
    },
    input: {
      fontSize: 16,
      color: colors.foreground,
      backgroundColor: colors.muted,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 18,
    },
    saveBtn: {
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: "center",
    },
    saveBtnDisabled: {
      backgroundColor: colors.muted,
    },
    saveText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    saveTextDisabled: {
      color: colors.mutedForeground,
    },
    secondaryBtn: {
      borderRadius: 12,
      paddingVertical: 12,
      marginTop: 10,
      borderWidth: 1.5,
      borderColor: colors.primary,
      alignItems: "center",
    },
    secondaryText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    dismissBtn: {
      paddingVertical: 12,
      alignItems: "center",
      marginTop: 4,
    },
    dismissText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
  });

  const canSave = !!name.trim();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      {/* The field sits at the bottom of a bottom sheet, so the soft keyboard
          covers the thing the user is typing into. RN's own
          KeyboardAvoidingView does not work inside an Android Modal - the
          modal gets its own window and never receives the soft-input resize -
          so this uses the same library ContactPickerModal already relies on. */}
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <Pressable
        style={styles.overlay}
        onPress={onDismiss}
        testID="name-sheet-overlay"
      >
        <Pressable onPress={() => {}} style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>What should we call you?</Text>
          <Text style={styles.message}>
            Used to greet you, and to sign the reminders you send other people.
            It stays on this phone.
          </Text>
          <TextInput
            style={[styles.input, { fontFamily: getFontFamily(name, "400Regular") }]}
            placeholder="Your name"
            placeholderTextColor={colors.mutedForeground}
            value={name}
            onChangeText={setName}
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => canSave && onSave(name)}
            testID="name-sheet-input"
          />
          <Pressable
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={() => onSave(name)}
            disabled={!canSave}
            testID="name-sheet-save"
          >
            <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>
              Continue
            </Text>
          </Pressable>
          {/* An outlined button, not a text link: a returning user who
              misses it starts from an empty app and may never find the
              restore again (device feedback, 2026-09-25). */}
          {secondaryAction && (
            <Pressable
              style={styles.secondaryBtn}
              onPress={secondaryAction.onPress}
              testID={secondaryAction.testID}
            >
              <Text style={styles.secondaryText}>{secondaryAction.label}</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.dismissBtn}
            onPress={onDismiss}
            testID="name-sheet-dismiss"
          >
            <Text style={styles.dismissText}>{skippable ? "Skip" : "Cancel"}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
