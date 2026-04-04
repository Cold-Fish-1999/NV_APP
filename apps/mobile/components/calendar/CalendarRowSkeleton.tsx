import { View, StyleSheet } from "react-native";
import { calendarTheme as theme } from "@/lib/calendarTheme";

export function CalendarRowSkeleton() {
  return (
    <View style={styles.row}>
      <View style={[styles.left, styles.skeleton]} />
      <View style={[styles.right, styles.skeleton]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.bgCard,
  },
  left: { width: "25%", height: 36, marginRight: 14 },
  right: { flex: 1, height: 28 },
  skeleton: { backgroundColor: theme.bgSecondary, borderRadius: 8 },
});
