import { View, Text, StyleSheet } from "react-native";
import { FONT_SANS_BOLD } from "@/lib/fonts";
import Svg, { Circle } from "react-native-svg";

interface Segment {
  name: string;
  count: number;
}

interface Props {
  segments: Segment[];
  total?: number;
}

const COLORS = ["#C27C5B", "#D4A96A", "#B5756A", "#C9A88C", "#A68A7B", "#C4B5A5"];
const SIZE = 120;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DonutChart({ segments, total: totalOverride }: Props) {
  const total = totalOverride ?? segments.reduce((s, seg) => s + seg.count, 0);
  if (total === 0) return null;

  let accumulated = 0;

  return (
    <View style={styles.row}>
      <View style={styles.chartWrap}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* Background circle */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="#F1EFE8"
            strokeWidth={STROKE}
            fill="none"
          />
          {/* Segments drawn in reverse so first segment is on top */}
          {[...segments].reverse().map((seg, revIdx) => {
            const idx = segments.length - 1 - revIdx;
            const segAccum = segments
              .slice(0, idx)
              .reduce((s, x) => s + x.count, 0);
            const ratio = seg.count / total;
            const dash = ratio * CIRCUMFERENCE;
            const offset = CIRCUMFERENCE - (segAccum / total) * CIRCUMFERENCE;
            return (
              <Circle
                key={idx}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                stroke={COLORS[idx % COLORS.length]}
                strokeWidth={STROKE}
                fill="none"
                strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                rotation={-90}
                origin={`${SIZE / 2}, ${SIZE / 2}`}
              />
            );
          })}
        </Svg>
        <View style={styles.centerLabel}>
          <Text style={styles.centerCount}>{total}</Text>
          <Text style={styles.centerText}>total</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {segments.map((seg, i) => (
          <View key={seg.name} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: COLORS[i % COLORS.length] }]} />
            <Text style={styles.legendName} numberOfLines={1}>
              {seg.name}
            </Text>
            <Text style={styles.legendCount}>{seg.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  chartWrap: {
    width: SIZE,
    height: SIZE,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  centerLabel: {
    position: "absolute",
    alignItems: "center",
  },
  centerCount: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2D2D2D",
    fontFamily: FONT_SANS_BOLD,
  },
  centerText: {
    fontSize: 11,
    color: "#9A9A9A",
    marginTop: -2,
  },
  legend: {
    flex: 1,
    gap: 6,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendName: {
    fontSize: 13,
    color: "#4A4A4A",
    flex: 1,
  },
  legendCount: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2D2D2D",
    minWidth: 20,
    textAlign: "right",
    fontFamily: FONT_SANS_BOLD,
  },
});
