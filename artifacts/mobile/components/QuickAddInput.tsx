import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as chrono from "chrono-node";
import { useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";

function roundToNext5(d: Date): Date {
  const ms = 1000 * 60 * 5;
  return new Date(Math.ceil((d.getTime() + 60000) / ms) * ms);
}

function parseNaturalLanguage(text: string): { title: string; date: Date | null } {
  if (!text.trim()) return { title: "", date: null };
  const now = new Date();
  const results = chrono.parse(text, now, { forwardDate: true });
  if (results.length === 0) return { title: text.trim(), date: null };
  const parsed = results[0];
  const date = parsed.date();
  let title = text;
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i];
    title = title.slice(0, r.index) + title.slice(r.index + r.text.length);
  }
  title = title
    .replace(/\s+/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .trim();
  return { title: title || text.trim(), date };
}

function formatDatePill(d: Date): string {
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear();

  if (isToday) return "Today";
  if (isTomorrow) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatTimePill(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  onSaved?: () => void;
}

export default function QuickAddInput({ onSaved }: Props) {
  const colors = useColors();
  const { addReminder } = useReminders();

  const [input, setInput] = useState("");
  const [parsedTitle, setParsedTitle] = useState("");
  const [parsedDate, setParsedDate] = useState<Date | null>(null);
  const [alarm, setAlarm] = useState(true);
  const [saving, setSaving] = useState(false);

  const pillAnim = useRef(new Animated.Value(0)).current;
  const pillTranslate = useRef(new Animated.Value(-6)).current;

  useEffect(() => {
    const { title, date } = parseNaturalLanguage(input);
    setParsedTitle(title);
    setParsedDate(date);

    if (date) {
      Animated.parallel([
        Animated.spring(pillAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 }),
        Animated.spring(pillTranslate, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(pillAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(pillTranslate, { toValue: -6, duration: 140, useNativeDriver: true }),
      ]).start();
    }
  }, [input]);

  const handleSave = async () => {
    const title = parsedTitle || input.trim();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const date = parsedDate ?? roundToNext5(new Date());
      await addReminder({
        title: title.trim(),
        description: "",
        datetime: date.toISOString(),
        alarm,
      });
      setInput("");
      setParsedTitle("");
      setParsedDate(null);
      setAlarm(true);
      onSaved?.();
    } catch {
      // silent — the list will just not update
    } finally {
      setSaving(false);
    }
  };

  const canSave = !saving && !!(parsedTitle || input.trim());

  const styles = StyleSheet.create({
    wrapper: {
      marginHorizontal: 20,
      marginBottom: 12,
    },
    bar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === "web" ? 12 : 10,
      gap: 8,
      ...(Platform.OS === "web"
        ? { boxShadow: "0 2px 12px rgba(99,102,241,0.08)" }
        : {
            shadowColor: "#6366f1",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 3,
          }),
    },
    textInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      paddingVertical: 0,
      ...(Platform.OS === "web" ? { outlineStyle: "none" } as any : {}),
    },
    alarmBtn: {
      padding: 4,
    },
    saveBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: canSave ? colors.primary : colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    pillRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 8,
      paddingHorizontal: 4,
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.primary + "18",
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    pillText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    pillDivider: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
  });

  return (
    <View style={styles.wrapper}>
      <View style={styles.bar}>
        <Feather name="plus-circle" size={18} color={colors.mutedForeground} />
        <TextInput
          style={styles.textInput}
          placeholder='Add a reminder… "Call mom tomorrow at 3pm"'
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={setInput}
          returnKeyType="done"
          onSubmitEditing={handleSave}
          blurOnSubmit={false}
          maxLength={300}
          editable={!saving}
        />
        <Pressable
          style={styles.alarmBtn}
          onPress={() => {
            setAlarm((a) => !a);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          hitSlop={8}
        >
          <Feather
            name={alarm ? "bell" : "bell-off"}
            size={16}
            color={alarm ? colors.primary : colors.mutedForeground}
          />
        </Pressable>
        <Pressable
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={!canSave}
          hitSlop={4}
        >
          <Feather name="check" size={16} color={canSave ? colors.primaryForeground : colors.mutedForeground} />
        </Pressable>
      </View>

      <Animated.View
        style={[
          styles.pillRow,
          {
            opacity: pillAnim,
            transform: [{ translateY: pillTranslate }],
            pointerEvents: "none",
          },
        ]}
      >
        {parsedDate && (
          <>
            <View style={styles.pill}>
              <Feather name="calendar" size={11} color={colors.primary} />
              <Text style={styles.pillText}>{formatDatePill(parsedDate)}</Text>
            </View>
            <Text style={styles.pillDivider}>·</Text>
            <View style={styles.pill}>
              <Feather name="clock" size={11} color={colors.primary} />
              <Text style={styles.pillText}>{formatTimePill(parsedDate)}</Text>
            </View>
          </>
        )}
      </Animated.View>
    </View>
  );
}
