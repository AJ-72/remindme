import { Feather } from "@expo/vector-icons";
import React from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

/**
 * The app's in-house replacement for `Alert.alert` - the platform alert box
 * ignores the theme, dark mode and fonts, so every message and choice uses
 * this bottom sheet instead (same shape as `ConfirmSheet`). Drive it through
 * `useAppDialog()`, which turns a choice into an awaited value.
 */

export type DialogTone = "info" | "success" | "warning" | "error";

export interface DialogButton {
  text: string;
  value: string;
  style?: "default" | "cancel" | "destructive";
}

export interface DialogOptions {
  title: string;
  message?: string;
  tone?: DialogTone;
  /** Defaults to a single "OK". */
  buttons?: DialogButton[];
}

const TONE_ICON: Record<DialogTone, keyof typeof Feather.glyphMap> = {
  info: "info",
  success: "check-circle",
  warning: "alert-triangle",
  error: "alert-circle",
};

interface Props {
  visible: boolean;
  options: DialogOptions | null;
  onSelect: (value: string) => void;
  onDismiss: () => void;
}

export default function AppDialog({ visible, options, onSelect, onDismiss }: Props) {
  const colors = useColors();
  if (!options) return null;

  const buttons = options.buttons?.length ? options.buttons : [{ text: "OK", value: "ok" }];
  const toneColor = {
    info: colors.primary,
    success: colors.success,
    warning: colors.warning,
    error: colors.destructive,
  } as const;
  // Two choices sit side by side (cancel left); one or three-plus stack,
  // actions first and the cancel choice last, where the thumb expects it.
  const stacked = buttons.length !== 2;
  const ordered = stacked
    ? [...buttons.filter((b) => b.style !== "cancel"), ...buttons.filter((b) => b.style === "cancel")]
    : [...buttons.filter((b) => b.style === "cancel"), ...buttons.filter((b) => b.style !== "cancel")];

  const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
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
    header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    title: { flex: 1, fontSize: 17, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    message: {
      fontSize: 14,
      lineHeight: 20,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
    },
    buttons: { flexDirection: stacked ? "column" : "row", gap: 12, marginTop: 20 },
    btn: { paddingVertical: 13, borderRadius: 12, alignItems: "center", flex: stacked ? undefined : 1 },
    btnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  });

  const btnColors = (b: DialogButton) =>
    b.style === "cancel"
      ? { bg: colors.muted, fg: colors.mutedForeground }
      : b.style === "destructive"
        ? { bg: colors.destructive, fg: colors.destructiveForeground }
        : { bg: colors.primary, fg: colors.primaryForeground };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss} testID="app-dialog-overlay">
        <Pressable onPress={() => {}} style={styles.sheet} testID="app-dialog">
          <View style={styles.handle} />
          <View style={styles.header}>
            {options.tone && (
              <View style={styles.iconWrap}>
                <Feather name={TONE_ICON[options.tone]} size={20} color={toneColor[options.tone]} />
              </View>
            )}
            <Text style={styles.title} testID="app-dialog-title">
              {options.title}
            </Text>
          </View>
          {options.message ? (
            <Text style={styles.message} testID="app-dialog-message">
              {options.message}
            </Text>
          ) : null}
          <View style={styles.buttons}>
            {ordered.map((b) => {
              const c = btnColors(b);
              return (
                <Pressable
                  key={b.value}
                  style={[styles.btn, { backgroundColor: c.bg }]}
                  onPress={() => onSelect(b.value)}
                  accessibilityRole="button"
                  testID={`app-dialog-btn-${b.value}`}
                >
                  <Text style={[styles.btnText, { color: c.fg }]}>{b.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
