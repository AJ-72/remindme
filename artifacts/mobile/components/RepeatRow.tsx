import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { describeRecurrence, type RecurrenceRule } from "@/utils/recurrence";
import RecurrencePicker from "@/components/RecurrencePicker";

interface Props {
  value: RecurrenceRule | undefined;
  anchorDate: Date;
  onChange: (rule: RecurrenceRule | undefined) => void;
  /** True when the value came from the typed title (matches the Date/Time
   * rows' "auto" vs. "tap to set" badge convention exactly). */
  wasParsed: boolean;
  /** This row sits last in the "Parsed as" card — the caller passes
   * previewRowLast so Time (which used to be last) hands that style off. */
  isLast?: boolean;
  previewRowStyle: object;
  previewRowLastStyle: object;
}

/** The add-reminder screen's "Repeats" row: same anatomy as its Date/Time
 * rows (icon + label + value + auto/tap-to-set badge), expanding the shared
 * RecurrencePicker inline when tapped — this screen's established idiom for
 * every picker (see pickerMode === "date" rendering pickerWrap inline). */
export default function RepeatRow({
  value,
  anchorDate,
  onChange,
  wasParsed,
  isLast,
  previewRowStyle,
  previewRowLastStyle,
}: Props) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  const styles = StyleSheet.create({
    parsedBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: colors.primary + "18",
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    parsedBadgeText: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    editBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    editBadgeText: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    previewLabel: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginLeft: 8,
      marginRight: 8,
    },
    previewValueHighlight: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    pickerWrap: {
      paddingTop: 4,
      paddingBottom: 8,
    },
  });

  const label = value ? describeRecurrence(value, anchorDate) : "Doesn't repeat";

  return (
    <>
      <Pressable
        testID="repeat-row"
        style={isLast ? previewRowLastStyle : previewRowStyle}
        onPress={() => setExpanded((e) => !e)}
      >
        <Feather name="repeat" size={16} color={colors.primary} />
        <Text style={styles.previewLabel}>Repeats</Text>
        <Text style={styles.previewValueHighlight}>{label}</Text>
        {value && wasParsed ? (
          <View style={styles.parsedBadge}>
            <Feather name="zap" size={10} color={colors.primary} />
            <Text style={styles.parsedBadgeText}>auto</Text>
          </View>
        ) : (
          <View style={styles.editBadge}>
            <Feather name="edit-2" size={12} color={colors.mutedForeground} />
            <Text style={styles.editBadgeText}>tap to set</Text>
          </View>
        )}
      </Pressable>

      {expanded && (
        <View style={styles.pickerWrap}>
          <RecurrencePicker value={value} anchorDate={anchorDate} onChange={onChange} />
        </View>
      )}
    </>
  );
}
