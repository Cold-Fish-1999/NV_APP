import { forwardRef, useImperativeHandle, useRef } from "react";
import { Text, TouchableOpacity, StyleSheet, ScrollView, Animated } from "react-native";
import { formatDateShort, formatWeekday } from "@/lib/dateUtils";
import type { DayAggregated } from "@/lib/calendarService";
import { calendarTheme as theme } from "@/lib/calendarTheme";

export const ROW_HEIGHT = 70;

interface DateSidebarProps {
  days: DayAggregated[];
  selectedDate: string | null;
  selectionOpacity?: Animated.AnimatedInterpolation<number>;
  onSelectDate: (date: string) => void;
  onScrollSync?: (offsetY: number) => void;
}

export const DateSidebar = forwardRef<{ scrollTo: (y: number) => void }, DateSidebarProps>(
  function DateSidebar({ days, selectedDate, selectionOpacity, onSelectDate, onScrollSync }, ref) {
    const scrollRef = useRef<ScrollView>(null);
    const isProgrammatic = useRef(false);

    useImperativeHandle(ref, () => ({
      scrollTo: (y: number) => {
        isProgrammatic.current = true;
        scrollRef.current?.scrollTo({ y, animated: false });
        setTimeout(() => { isProgrammatic.current = false; }, 50);
      },
    }));

    return (
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
        onScroll={(e) => {
          if (isProgrammatic.current) return;
          onScrollSync?.(e.nativeEvent.contentOffset.y);
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
      {days.map((d) => {
          const isSelected = d.date === selectedDate;
          return (
            <TouchableOpacity
              key={d.date}
              style={styles.row}
              onPress={() => onSelectDate(d.date)}
              activeOpacity={0.7}
            >
              {isSelected && (
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    styles.rowSelectedBg,
                    selectionOpacity !== undefined
                      ? { opacity: selectionOpacity }
                      : undefined,
                  ]}
                  pointerEvents="none"
                />
              )}
              <Text style={[styles.date, isSelected && styles.textSelected]}>
                {formatDateShort(d.date)}
              </Text>
              <Text style={[styles.weekday, isSelected && styles.textSelected]}>
                {formatWeekday(d.date)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bgSecondary },
  content: { paddingTop: 0, paddingBottom: 14 },
  row: {
    height: ROW_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: 14,
    marginHorizontal: 8,
    borderRadius: 10,
  },
  rowSelected: {},
  rowSelectedBg: {
    backgroundColor: "#fafafa",
    borderRadius: 8,
    shadowColor: "#2D2D2D",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  date: { fontSize: 14, fontWeight: "600", color: theme.textSecondary },
  weekday: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  textSelected: { color: theme.primary },
});
