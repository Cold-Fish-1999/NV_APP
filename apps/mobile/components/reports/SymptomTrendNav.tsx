import { useState, useRef, useMemo } from "react";
import { View, Text, StyleSheet, Animated, PanResponder } from "react-native";
import { FONT_SANS_BOLD, fontSerif } from "@/lib/fonts";
import { BarChart } from "./BarChart";

interface TrendItem {
  name: string;
  trend: "up" | "same" | "dn" | string;
  description: string;
  weeks?: Array<{ label: string; count: number }>;
  weekly_breakdown?: Array<{ label: string; count: number }>;
}

interface Props {
  items: TrendItem[];
  monthLabels?: string[];
  barHeight?: number;
}

const TREND_BADGE = {
  dn: { label: "↓ Improving", bg: "#EAF3DE", color: "#3B6D11" },
  same: { label: "→ Stable", bg: "#F0ECE6", color: "#6B6B6B" },
  up: { label: "Needs attention", bg: "#FCEBEB", color: "#A32D2D" },
} as const;

const SWIPE_THRESHOLD = 50;

export function SymptomTrendNav({ items, barHeight }: Props) {
  const [idx, setIdx] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const idxRef = useRef(0);
  const lenRef = useRef(items?.length ?? 0);
  lenRef.current = items?.length ?? 0;
  const busy = useRef(false);

  const panResponder = useMemo(() => {
    const go = (next: number, dir: number) => {
      if (busy.current) return;
      busy.current = true;
      Animated.timing(slideAnim, {
        toValue: -dir * 300,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        idxRef.current = next;
        setIdx(next);
        slideAnim.setValue(dir * 300);
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }).start(() => {
          busy.current = false;
        });
      });
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 10,
      onPanResponderTerminationRequest: () => true,
      onPanResponderRelease: (_, gs) => {
        const i = idxRef.current;
        const len = lenRef.current;
        if (gs.dx < -SWIPE_THRESHOLD && i < len - 1) go(i + 1, 1);
        else if (gs.dx > SWIPE_THRESHOLD && i > 0) go(i - 1, -1);
      },
    });
  }, [slideAnim]);

  if (!items || items.length === 0) return null;

  const cur = items[idx];
  const bars = cur.weeks ?? cur.weekly_breakdown ?? [];
  const trendKey = (cur.trend || "same") as keyof typeof TREND_BADGE;
  const badge = TREND_BADGE[trendKey] ?? TREND_BADGE.same;

  return (
    <View>
      <View style={styles.swipeClip}>
        <Animated.View
          style={{ transform: [{ translateX: slideAnim }] }}
          {...panResponder.panHandlers}
        >
          <View style={styles.topRow}>
            <Text style={styles.symptomName} numberOfLines={1}>
              {cur.name}
            </Text>
            <View style={[styles.trendBadge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.trendBadgeText, { color: badge.color }]}>
                {badge.label}
              </Text>
            </View>
          </View>

          {cur.description ? (
            <Text
              style={[
                styles.description,
                { fontFamily: fontSerif(cur.description) },
              ]}
            >
              {cur.description}
            </Text>
          ) : null}

          {bars.length > 0 && (
            <View style={styles.chartWrap}>
              <BarChart bars={bars} height={barHeight} />
            </View>
          )}
        </Animated.View>
      </View>

      {items.length > 1 && (
        <View style={styles.dotsRow}>
          {items.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === idx && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  swipeClip: {
    overflow: "hidden",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  symptomName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2D2D2D",
    flex: 1,
    fontFamily: FONT_SANS_BOLD,
  },
  trendBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginLeft: 8,
  },
  trendBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: FONT_SANS_BOLD,
  },
  description: {
    fontSize: 13,
    color: "#6B6B6B",
    marginTop: 4,
  },
  chartWrap: {
    marginTop: 12,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E0DCD6",
  },
  dotActive: {
    backgroundColor: "#D85A30",
  },
});
