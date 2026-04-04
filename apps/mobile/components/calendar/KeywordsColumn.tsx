import { forwardRef, useImperativeHandle, useRef } from "react";
import { View, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { TagPills } from "./TagPills";
import type { DayAggregated } from "@/lib/calendarService";
import { ROW_HEIGHT } from "./DateSidebar";
import { calendarTheme as theme } from "@/lib/calendarTheme";

interface KeywordsColumnProps {
  days: DayAggregated[];
  onScrollSync: (offsetY: number) => void;
  onDayPress: (date: string) => void;
  onEndReached?: () => void;
  ListFooterComponent?: React.ReactNode;
}

export const KeywordsColumn = forwardRef<{ scrollTo: (y: number) => void }, KeywordsColumnProps>(
  function KeywordsColumn({ days, onScrollSync, onDayPress, onEndReached, ListFooterComponent }, ref) {
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
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          onScrollSync(contentOffset.y);
          if (onEndReached && contentSize.height > 0 && contentOffset.y + layoutMeasurement.height >= contentSize.height - 100) {
            onEndReached();
          }
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {days.map((d) => (
          <TouchableOpacity
            key={d.date}
            style={styles.row}
            onPress={() => onDayPress(d.date)}
            activeOpacity={0.7}
          >
            <TagPills tags={d.aggregatedTags} maxShow={5} />
          </TouchableOpacity>
        ))}
        {ListFooterComponent}
      </ScrollView>
    );
  }
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 0, paddingBottom: 14 },
  row: {
    height: ROW_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.bgCard,
  },
});
