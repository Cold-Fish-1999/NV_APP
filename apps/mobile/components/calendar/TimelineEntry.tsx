import { View, Text, StyleSheet, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { calendarTheme as theme } from "@/lib/calendarTheme";
import { fontSerif } from "@/lib/fonts";
import type { SymptomEntry } from "@/types/calendar";

interface TimelineEntryProps {
  entry: SymptomEntry;
  onLongPress: (entry: SymptomEntry) => void;
}

export function TimelineEntry({ entry, onLongPress }: TimelineEntryProps) {
  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress(entry);
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        style={({ pressed }) => [styles.entryCard, pressed && styles.entryCardPressed]}
        onLongPress={handleLongPress}
        delayLongPress={350}
      >
        <Text style={[styles.summary, { fontFamily: fontSerif(entry.summary) }]}>{entry.summary}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 2 },
  entryCard: {
    backgroundColor: theme.bgCard,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  entryCardPressed: {
    backgroundColor: theme.bgHover,
    transform: [{ scale: 0.98 }],
  },
  summary: { fontSize: 15, color: theme.text, lineHeight: 23 },
});
