import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { formatDateShort, formatWeekday } from "@/lib/dateUtils";
import { TagPills } from "./TagPills";
import type { DayAggregated } from "@/lib/calendarService";
import { FONT_SANS_BOLD } from "@/lib/fonts";

interface CalendarRowProps {
  day: DayAggregated;
  onPress: () => void;
}

export function CalendarRow({ day, onPress }: CalendarRowProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.left}>
        <Text style={styles.date}>{formatDateShort(day.date)}</Text>
        <Text style={styles.weekday}>{formatWeekday(day.date)}</Text>
      </View>
      <View style={styles.right}>
        <TagPills tags={day.aggregatedTags} maxShow={5} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  left: { width: "25%", paddingRight: 12 },
  right: { flex: 1 },
  date: { fontSize: 16, fontWeight: "600", fontFamily: FONT_SANS_BOLD, color: "#1e293b" },
  weekday: { fontSize: 13, color: "#64748b", marginTop: 2 },
});
