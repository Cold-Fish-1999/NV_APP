import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
  up: { label: "↑ Worsening", bg: "#FCEBEB", color: "#A32D2D" },
} as const;

export function SymptomTrendNav({ items, monthLabels, barHeight }: Props) {
  const [idx, setIdx] = useState(0);
  if (!items || items.length === 0) return null;

  const current = items[idx];
  const bars = current.weeks ?? current.weekly_breakdown ?? [];
  const trendKey = (current.trend || "same") as keyof typeof TREND_BADGE;
  const badge = TREND_BADGE[trendKey] ?? TREND_BADGE.same;

  const prev = () => setIdx((i) => (i > 0 ? i - 1 : items.length - 1));
  const next = () => setIdx((i) => (i < items.length - 1 ? i + 1 : 0));

  return (
    <View>
      {/* Nav row */}
      <View style={styles.navRow}>
        <TouchableOpacity onPress={prev} hitSlop={12} activeOpacity={0.5}>
          <Ionicons name="chevron-back" size={20} color="#9A9A9A" />
        </TouchableOpacity>
        <Text style={styles.symptomName}>{current.name}</Text>
        <TouchableOpacity onPress={next} hitSlop={12} activeOpacity={0.5}>
          <Ionicons name="chevron-forward" size={20} color="#9A9A9A" />
        </TouchableOpacity>
      </View>

      {/* Dot indicators */}
      <View style={styles.dotsRow}>
        {items.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === idx && styles.dotActive]}
          />
        ))}
      </View>

      {/* Trend badge + description */}
      <View style={styles.trendRow}>
        <View style={[styles.trendBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.trendBadgeText, { color: badge.color }]}>
            {badge.label}
          </Text>
        </View>
        {current.description ? (
          <Text style={styles.trendDesc}>{current.description}</Text>
        ) : null}
      </View>

      {/* Bar chart */}
      {bars.length > 0 && (
        <View style={styles.chartWrap}>
          <BarChart
            bars={bars}
            monthLabels={monthLabels}
            height={barHeight}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 4,
  },
  symptomName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#2D2D2D",
    minWidth: 100,
    textAlign: "center",
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
    marginTop: 8,
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
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  trendBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  trendBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  trendDesc: {
    fontSize: 13,
    color: "#6B6B6B",
    flex: 1,
  },
  chartWrap: {
    marginTop: 12,
  },
});
