import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from "react-native";
import { calendarTheme as theme } from "@/lib/calendarTheme";
import { FONT_SANS_MEDIUM } from "@/lib/fonts";

const RANGE_OPTIONS = [7, 14, 30, 60, 90, 180, 365] as const;

function formatRangeLabel(days: number): string {
  if (days === 30) return "Last 1 month";
  if (days === 180) return "Last 6 months";
  if (days === 365) return "Last 1 year";
  return `Last ${days} days`;
}

interface CalendarRangeHeaderProps {
  rangeDays: number;
  formatLabel: (days: number) => string;
  onSelect: (days: number) => void;
}

export function CalendarRangeHeader({
  rangeDays,
  formatLabel,
  onSelect,
}: CalendarRangeHeaderProps) {
  const [visible, setVisible] = useState(false);

  const handleSelect = (days: number) => {
    onSelect(days);
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setVisible(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.triggerText}>{formatLabel(rangeDays)}</Text>
        <Text style={styles.caret}>▼</Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <View style={styles.dropdown} onStartShouldSetResponder={() => true}>
            {RANGE_OPTIONS.map((r) => {
              const active = r === rangeDays;
              return (
                <TouchableOpacity
                  key={r}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => handleSelect(r)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {formatRangeLabel(r)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minWidth: 110,
    height: 28,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.bgCard,
  },
  triggerText: { fontSize: 14, fontFamily: FONT_SANS_MEDIUM, color: theme.text, fontWeight: "500" },
  caret: { fontSize: 10, fontFamily: FONT_SANS_MEDIUM, color: theme.textMuted },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 56,
    paddingRight: 16,
  },
  dropdown: {
    backgroundColor: theme.bgCard,
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 140,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  optionActive: { backgroundColor: theme.primaryLight },
  optionText: { fontSize: 15, fontFamily: FONT_SANS_MEDIUM, color: theme.text },
  optionTextActive: { color: theme.primary, fontWeight: "500", fontFamily: FONT_SANS_MEDIUM },
});
