import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { formatDatetime } from "@/utils/formatDatetime";
import type { RecurrencePreview } from "@/utils/recurrencePreviews";

// Read-only stand-in for a recurring reminder's next occurrence(s). Not a
// Pressable and has no delete/complete affordance -- there is no separate
// Reminder record behind it (see recurrencePreviews.ts), so nothing here can
// be individually acted on. Dimmed relative to ReminderCard so a glance
// doesn't mistake "this will show up" for "this is due".

const staticStyles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    opacity: 0.6,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 15,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  timeText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  continuesText: {
    fontSize: 11,
    marginTop: 6,
  },
});

interface Props {
  preview: RecurrencePreview;
}

function RecurrencePreviewCard({ preview }: Props) {
  const colors = useColors();

  return (
    <View
      testID={`recurrence-preview-${preview.id}`}
      style={[
        staticStyles.card,
        { backgroundColor: colors.card, borderRadius: colors.radiusCard, borderColor: colors.border },
      ]}
    >
      <Feather name="repeat" size={16} color={colors.mutedForeground} />
      <View style={staticStyles.content}>
        <Text style={[staticStyles.title, { color: colors.mutedForeground }]} numberOfLines={1}>
          {preview.title}
        </Text>
        <View style={staticStyles.timeRow}>
          <Feather name="clock" size={11} color={colors.mutedForeground} />
          <Text style={[staticStyles.timeText, { color: colors.mutedForeground }]}>
            {formatDatetime(preview.datetime)}
          </Text>
        </View>
        {preview.continuesLabel && (
          <Text
            testID="recurrence-preview-continues"
            style={[staticStyles.continuesText, { color: colors.mutedForeground }]}
          >
            {preview.continuesLabel} — continues after this
          </Text>
        )}
      </View>
    </View>
  );
}

export default React.memo(RecurrencePreviewCard);
