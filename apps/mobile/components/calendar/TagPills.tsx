import { View, Text, StyleSheet } from "react-native";
import { calendarTheme as theme, severityColors } from "@/lib/calendarTheme";
import { FONT_SANS } from "@/lib/fonts";

interface TagPillsProps {
  tags: { tag: string; count: number; severity?: string | null }[];
  maxShow?: number;
}

export function TagPills({ tags, maxShow = 5}: TagPillsProps) {
  const show = tags.slice(0, maxShow);
  if (show.length === 0) {
    return (
      <View style={styles.placeholderWrap}>
        <Text style={styles.placeholder}>All is well</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {show.map(({ tag, severity }) => {
        const sc = severity ? severityColors[severity] : undefined;
        return (
          <View
            key={tag}
            style={[styles.pill, sc && { backgroundColor: sc.bg }]}
          >
            <Text
              style={[styles.text, sc && { color: sc.text }]}
              numberOfLines={1}
            >
              {tag}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, maxHeight: 60 },
  placeholderWrap: { opacity: 0.7 },
  placeholder: {
    fontSize: 13,
    fontFamily: FONT_SANS,
    color: "rgba(45, 45, 45, 0.38)",
    letterSpacing: 1,
    fontWeight: "400",
  },
  pill: {
    backgroundColor: theme.pillBg,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  text: { fontSize: 13, fontFamily: FONT_SANS, color: theme.pillText, maxWidth: 120 },
});
