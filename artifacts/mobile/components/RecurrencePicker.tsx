import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { describeRecurrence, type RecurrenceRule } from "@/utils/recurrence";

interface Props {
  /** Undefined means "doesn't repeat" — the same convention as Reminder.recurrence. */
  value: RecurrenceRule | undefined;
  /**
   * The date this recurrence is set against. Preset labels ("Weekly on
   * Thursday", "Monthly on the 18th") are generated from this via
   * describeRecurrence — never hardcode a weekday/day-of-month name here.
   */
  anchorDate: Date;
  onChange: (rule: RecurrenceRule | undefined) => void;
}

type CustomUnit = "days" | "weeks" | "months" | "years";

const CUSTOM_UNIT_TO_FREQ: Record<CustomUnit, RecurrenceRule["freq"]> = {
  days: "daily",
  weeks: "weekly",
  months: "monthly",
  years: "yearly",
};

const WEEKDAY_STRIP_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/** Presentation-only. Does not know whether it renders inside a bottom sheet
 * (QuickAddInput) or inline in a card (add-reminder's RepeatRow) — both
 * containers pass the same props and get the identical control, per the
 * plan's "do not build a third implementation" rule. */
export default function RecurrencePicker({ value, anchorDate, onChange }: Props) {
  const colors = useColors();
  // "Custom…" is a distinct UI mode, not merely "any rule with interval > 1" —
  // a plain "Weekly" (interval 1) selected via a preset and a "Custom" weekly
  // rule the user built with the stepper render the identical RecurrenceRule,
  // so this has to be its own piece of state, not derived from `value`.
  const [customMode, setCustomMode] = useState(false);

  const presetDaily: RecurrenceRule = { freq: "daily", interval: 1 };
  const presetWeekly: RecurrenceRule = {
    freq: "weekly",
    interval: 1,
    byWeekday: [anchorDate.getDay()],
  };
  const presetMonthly: RecurrenceRule = { freq: "monthly", interval: 1 };
  const presetYearly: RecurrenceRule = { freq: "yearly", interval: 1 };

  const isSameRule = (a: RecurrenceRule | undefined, b: RecurrenceRule): boolean => {
    if (!a) return false;
    if (a.freq !== b.freq || a.interval !== b.interval) return false;
    const aw = a.byWeekday ?? [];
    const bw = b.byWeekday ?? [];
    if (aw.length !== bw.length) return false;
    return aw.every((d) => bw.includes(d));
  };

  // Only a plain interval-1 preset with no chosen weekday list beyond the
  // anchor's own weekday counts as "this preset" — anything else (interval
  // > 1, an explicit multi-weekday selection) is "Custom" even if the freq
  // matches, since the presets list has no row for it.
  const matchesPreset = (preset: RecurrenceRule): boolean =>
    !customMode && isSameRule(value, preset);

  const selectPreset = (rule: RecurrenceRule | undefined) => {
    setCustomMode(false);
    onChange(rule);
  };

  const enterCustomMode = () => {
    setCustomMode(true);
    if (!value) {
      onChange({ freq: "daily", interval: 2 });
    }
  };

  const customUnit: CustomUnit =
    value?.freq === "weekly"
      ? "weeks"
      : value?.freq === "monthly"
        ? "months"
        : value?.freq === "yearly"
          ? "years"
          : "days";

  const setCustomInterval = (interval: number) => {
    if (interval < 1 || !value) return;
    onChange({ ...value, interval });
  };

  const setCustomUnit = (unit: CustomUnit) => {
    if (!value) return;
    const freq = CUSTOM_UNIT_TO_FREQ[unit];
    // Switching unit while custom starts that unit's own rule fresh rather
    // than carrying over a byWeekday list that only makes sense for weekly.
    onChange(freq === "weekly" ? { freq, interval: value.interval, byWeekday: [] } : { freq, interval: value.interval });
  };

  const toggleWeekday = (day: number) => {
    if (!value || value.freq !== "weekly") return;
    const current = value.byWeekday ?? [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    onChange({ ...value, byWeekday: next });
  };

  const styles = StyleSheet.create({
    option: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionLabel: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    customRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingVertical: 16,
    },
    stepperBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    stepperValue: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      minWidth: 24,
      textAlign: "center",
    },
    unitBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.muted,
    },
    unitBtnText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    weekdaySection: {
      paddingTop: 4,
      paddingBottom: 12,
    },
    weekdayLabel: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginBottom: 8,
    },
    weekdayStrip: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    weekdayCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.muted,
    },
    weekdayCircleSelected: {
      backgroundColor: colors.primary,
    },
    weekdayText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    weekdayTextSelected: {
      color: colors.primaryForeground,
    },
  });

  const renderOption = (
    testID: string,
    label: string,
    selected: boolean,
    onPress: () => void
  ) => (
    <Pressable
      key={testID}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={styles.option}
      onPress={onPress}
    >
      <Text style={styles.optionLabel}>{label}</Text>
      {selected && <Feather name="check" size={18} color={colors.primary} />}
    </Pressable>
  );

  return (
    <View>
      {renderOption("repeat-option-none", "Doesn't repeat", !value, () => selectPreset(undefined))}
      {renderOption("repeat-option-daily", describeRecurrence(presetDaily), matchesPreset(presetDaily), () =>
        selectPreset(presetDaily)
      )}
      {renderOption(
        "repeat-option-weekly",
        describeRecurrence(presetWeekly, anchorDate),
        matchesPreset(presetWeekly),
        () => selectPreset(presetWeekly)
      )}
      {renderOption(
        "repeat-option-monthly",
        describeRecurrence(presetMonthly, anchorDate),
        matchesPreset(presetMonthly),
        () => selectPreset(presetMonthly)
      )}
      {renderOption(
        "repeat-option-yearly",
        describeRecurrence(presetYearly, anchorDate),
        matchesPreset(presetYearly),
        () => selectPreset(presetYearly)
      )}
      {renderOption("repeat-option-custom", "Custom…", customMode, enterCustomMode)}

      {customMode && value && (
        <>
          <View style={styles.customRow}>
            <Text style={styles.optionLabel}>Every</Text>
            <Pressable
              testID="repeat-interval-minus"
              style={styles.stepperBtn}
              onPress={() => setCustomInterval(value.interval - 1)}
              hitSlop={8}
            >
              <Feather name="minus" size={16} color={colors.foreground} />
            </Pressable>
            <Text style={styles.stepperValue}>{value.interval}</Text>
            <Pressable
              testID="repeat-interval-plus"
              style={styles.stepperBtn}
              onPress={() => setCustomInterval(value.interval + 1)}
              hitSlop={8}
            >
              <Feather name="plus" size={16} color={colors.foreground} />
            </Pressable>
            {(["days", "weeks", "months", "years"] as CustomUnit[]).map((unit) => (
              <Pressable
                key={unit}
                testID={`repeat-unit-${unit}`}
                style={[styles.unitBtn, customUnit === unit && { backgroundColor: colors.primary }]}
                onPress={() => setCustomUnit(unit)}
              >
                <Text
                  style={[
                    styles.unitBtnText,
                    customUnit === unit && { color: colors.primaryForeground },
                  ]}
                >
                  {unit}
                </Text>
              </Pressable>
            ))}
          </View>

          {value.freq === "weekly" && (
            <View style={styles.weekdaySection}>
              <Text style={styles.weekdayLabel}>Repeat on:</Text>
              <View style={styles.weekdayStrip}>
                {WEEKDAY_STRIP_LABELS.map((label, day) => {
                  const selected = (value.byWeekday ?? []).includes(day);
                  return (
                    <Pressable
                      key={day}
                      testID={`repeat-weekday-${day}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={[styles.weekdayCircle, selected && styles.weekdayCircleSelected]}
                      onPress={() => toggleWeekday(day)}
                    >
                      <Text style={[styles.weekdayText, selected && styles.weekdayTextSelected]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}
