import { View, Text, StyleSheet } from "react-native";
import { calendarTheme as theme } from "@/lib/calendarTheme";

export function EmptyState({ message = "No records yet" }: { message?: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 56,
  },
  text: { fontSize: 15, color: theme.textMuted },
});
