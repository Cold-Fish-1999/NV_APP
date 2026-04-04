import { View, Text, StyleSheet } from "react-native";

interface Bar {
  label: string;
  count: number;
}

interface Props {
  bars: Bar[];
  monthLabels?: string[];
  height?: number;
}

const COLOR_ZERO = "#F1EFE8";
const COLOR_LOW = "#F5C4B3";
const COLOR_HIGH = "#D85A30";

function interpolateColor(ratio: number): string {
  if (ratio <= 0) return COLOR_ZERO;

  const lowR = 0xf5, lowG = 0xc4, lowB = 0xb3;
  const highR = 0xd8, highG = 0x5a, highB = 0x30;
  const r = Math.round(lowR + (highR - lowR) * ratio);
  const g = Math.round(lowG + (highG - lowG) * ratio);
  const b = Math.round(lowB + (highB - lowB) * ratio);
  return `rgb(${r},${g},${b})`;
}

export function BarChart({ bars, monthLabels, height = 100 }: Props) {
  const maxCount = Math.max(...bars.map((b) => b.count), 1);

  return (
    <View>
      <View style={[styles.chartRow, { height }]}>
        {bars.map((bar, i) => {
          const ratio = bar.count / maxCount;
          const barH = Math.max(bar.count > 0 ? ratio * height * 0.85 : 6, 4);
          const color = bar.count === 0 ? COLOR_ZERO : interpolateColor(ratio);

          return (
            <View key={i} style={styles.barCol}>
              <View style={{ flex: 1 }} />
              <View
                style={[
                  styles.bar,
                  {
                    height: barH,
                    backgroundColor: color,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      {monthLabels && monthLabels.length > 0 && (
        <View style={styles.monthLabelRow}>
          {monthLabels.map((label, i) => (
            <Text key={i} style={styles.monthLabel}>
              {label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    paddingHorizontal: 2,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
  },
  bar: {
    width: "80%",
    borderRadius: 3,
    minWidth: 6,
    maxWidth: 24,
  },
  monthLabelRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 6,
  },
  monthLabel: {
    fontSize: 11,
    color: "#9A9A9A",
    fontWeight: "500",
  },
});
