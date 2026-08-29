import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ALL_PERSONAS } from "@/constants/personas";
import { useColors } from "@/hooks/useColors";
import { PersonaProfile, PersonaType } from "@/types/persona";

interface Props {
  visible: boolean;
  activePersona: PersonaType;
  onSelectPersona?: (persona: PersonaType) => void | Promise<void>;
  onClose: () => void;
}

export default function PersonaComparisonSheet({
  visible,
  activePersona,
  onSelectPersona,
  onClose,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<PersonaType>(activePersona);

  // Update selected when sheet opens or activePersona changes
  React.useEffect(() => {
    if (visible) {
      setSelected(activePersona);
    }
  }, [visible, activePersona]);

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: "90%",
      paddingTop: 16,
      paddingBottom: Platform.OS === "ios" ? insets.bottom + 12 : 24,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 12,
    },
    header: {
      paddingHorizontal: 20,
      paddingBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    closeBtn: {
      padding: 4,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 24,
    },
    intro: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 19,
      marginBottom: 16,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 14,
    },
    cardActive: {
      borderColor: colors.primary,
      backgroundColor: colors.card,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    cardTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    badge: {
      fontSize: 22,
    },
    cardName: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    activeTag: {
      backgroundColor: colors.primary + "20",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    activeTagText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    tagline: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
      marginBottom: 8,
    },
    description: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 18,
      marginBottom: 12,
    },
    tableContainer: {
      backgroundColor: colors.muted + "80",
      borderRadius: 12,
      padding: 12,
      gap: 8,
    },
    tableRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    tableLabel: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    tableValue: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    selectBtn: {
      marginTop: 12,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: "center",
    },
    selectBtnText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    footerBtn: {
      marginHorizontal: 20,
      marginTop: 8,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: "center",
    },
    footerBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
  });

  const handleSelect = async (profile: PersonaProfile) => {
    setSelected(profile.id);
    if (onSelectPersona) {
      await onSelectPersona(profile.id);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Reminder Styles & Adaptations</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              testID="persona-comparison-close"
              style={styles.closeBtn}
            >
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            testID="persona-comparison-scroll"
          >
            <Text style={styles.intro}>
              RemindMe adapts your notification urgency, advance lead time, snooze
              intervals, and follow-up style according to your habits. Tap any profile
              below to switch to it directly.
            </Text>

            {ALL_PERSONAS.map((profile) => {
              const isActive = selected === profile.id;
              return (
                <Pressable
                  key={profile.id}
                  style={[styles.card, isActive && styles.cardActive]}
                  onPress={() => handleSelect(profile)}
                  testID={`persona-card-${profile.id}`}
                  accessibilityRole="button"
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.badge}>{profile.badge}</Text>
                      <Text style={styles.cardName}>{profile.name}</Text>
                    </View>
                    {isActive && (
                      <View style={styles.activeTag}>
                        <Text style={styles.activeTagText}>Active</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.tagline}>{profile.tagline}</Text>
                  <Text style={styles.description}>{profile.description}</Text>

                  <View style={styles.tableContainer}>
                    <View style={styles.tableRow}>
                      <Text style={styles.tableLabel}>Advance Lead Time</Text>
                      <Text style={styles.tableValue}>
                        {profile.adaptations.leadTimeMinutes === 0
                          ? "On time (0 min)"
                          : `${profile.adaptations.leadTimeMinutes} min early`}
                      </Text>
                    </View>
                    <View style={styles.tableRow}>
                      <Text style={styles.tableLabel}>Alarm Sound & Vibrate</Text>
                      <Text style={styles.tableValue}>
                        {profile.adaptations.alarm ? "Sound ON" : "Sound OFF"} •{" "}
                        {profile.adaptations.vibration ? "Vibrate ON" : "Vibrate OFF"}
                      </Text>
                    </View>
                    <View style={styles.tableRow}>
                      <Text style={styles.tableLabel}>Default Snooze</Text>
                      <Text style={styles.tableValue}>
                        {profile.adaptations.defaultSnoozeMinutes} minutes
                      </Text>
                    </View>
                    <View style={styles.tableRow}>
                      <Text style={styles.tableLabel}>Follow-up Tone</Text>
                      <Text style={styles.tableValue}>
                        {profile.adaptations.tone}
                      </Text>
                    </View>
                  </View>

                  {!isActive && onSelectPersona && (
                    <Pressable
                      style={styles.selectBtn}
                      onPress={() => handleSelect(profile)}
                      testID={`persona-select-btn-${profile.id}`}
                    >
                      <Text style={styles.selectBtnText}>Switch to {profile.name}</Text>
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            style={styles.footerBtn}
            onPress={onClose}
            testID="persona-comparison-done"
          >
            <Text style={styles.footerBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
