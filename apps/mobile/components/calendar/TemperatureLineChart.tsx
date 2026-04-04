import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";
import { calendarTheme as theme } from "@/lib/calendarTheme";

interface TemperatureLineChartProps {
  hourly: { hour: number; temp: number }[];
  tempMin: number;
  tempMax: number;
}

const CHART_HEIGHT = 48;
const PAD = { top: 6, right: 8, bottom: 6, left: 8 };

export function TemperatureLineChart({
  hourly,
  tempMin,
  tempMax,
}: TemperatureLineChartProps) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width * 0.55, 220);

  if (hourly.length < 2) return null;

  const innerW = chartWidth - PAD.left - PAD.right;
  const innerH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const tempRange = Math.max(tempMax - tempMin, 2);
  const baseTemp = tempMin;

  const points = hourly.map((h, i) => {
    const x = PAD.left + (i / (hourly.length - 1)) * innerW;
    const ratio = Math.max(0, Math.min(1, (h.temp - baseTemp) / tempRange));
    const y = PAD.top + innerH - ratio * innerH;
    return { x, y };
  });

  const subdiv = 8;
  const dense: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 0; k < subdiv; k++) {
      const t = k / subdiv;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      dense.push({ x, y });
    }
  }
  dense.push(points[points.length - 1]);

  const pathD = dense.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");

  return (
    <View style={styles.wrap}>
      <View style={styles.chartRow}>
        <Svg width={chartWidth} height={CHART_HEIGHT}>
          <Path
            d={pathD}
            fill="none"
            stroke={theme.primary}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <View style={styles.tempCol}>
          <Text style={styles.tempLabel}>{Math.round(tempMax)}°</Text>
          <Text style={styles.tempLabel}>{Math.round(tempMin)}°</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  chartRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tempCol: { height: CHART_HEIGHT, justifyContent: "space-between", paddingVertical: 4 },
  tempLabel: { fontSize: 11, color: theme.textMuted },
});
