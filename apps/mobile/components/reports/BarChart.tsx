import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { FONT_SANS_MEDIUM } from "@/lib/fonts";

interface Bar {
  label: string;
  count: number;
}

interface Props {
  bars: Bar[];
  monthLabels?: string[];
  height?: number;
}

const LR = 0xf5, LG = 0xc4, LB = 0xb3;
const HR = 0xd8, HG = 0x5a, HB = 0x30;

function interpolateColor(ratio: number): string {
  const r = Math.round(LR + (HR - LR) * ratio);
  const g = Math.round(LG + (HG - LG) * ratio);
  const b = Math.round(LB + (HB - LB) * ratio);
  return `rgb(${r},${g},${b})`;
}

function monthBoundaries(bars: Bar[]): { index: number; month: string }[] {
  const breaks: { index: number; month: string }[] = [];
  let prev = "";
  for (let i = 0; i < bars.length; i++) {
    const parts = bars[i].label.split(" ");
    if (parts.length < 2) return [];
    const month = parts[0];
    if (month !== prev) {
      breaks.push({ index: i, month });
      prev = month;
    }
  }
  return breaks.length > 1 ? breaks : [];
}

const MIN_SCALE = 3;
const COLOR_STEPS = [1, 2, 3, 4, 5];

export function BarChart({ bars, height = 100 }: Props) {
  const dataMax = Math.max(...bars.map((b) => b.count), 0);
  const scaleMax = Math.max(dataMax, MIN_SCALE);
  const breaks = monthBoundaries(bars);
  const sepAt = new Set(breaks.slice(1).map((b) => b.index));

  return (
    <View>
      <View style={[styles.chartRow, { height }]}>
        {bars.map((bar, i) => {
          const heightRatio = bar.count / scaleMax;
          const barH = heightRatio * height * 0.85;
          const colorRatio = Math.min(bar.count / MIN_SCALE, 1);
          return (
            <React.Fragment key={i}>
              {sepAt.has(i) && <View style={[styles.monthSep, { height }]} />}
              <View style={styles.barCol}>
                <View style={{ flex: 1 }} />
                {bar.count === 0 ? (
                  <View style={styles.zeroDot} />
                ) : (
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max(barH, 4),
                        backgroundColor: interpolateColor(colorRatio),
                      },
                    ]}
                  />
                )}
              </View>
            </React.Fragment>
          );
        })}
      </View>

      {breaks.length > 0 && (
        <View style={styles.monthRow}>
          {breaks.map((mb, i) => {
            const next = breaks[i + 1]?.index ?? bars.length;
            return (
              <View key={i} style={{ flex: next - mb.index }}>
                <Text style={styles.monthLabel}>{mb.month}</Text>
              </View>
            );
          })}
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
  zeroDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E8E4DC",
  },
  monthSep: {
    width: 1,
    backgroundColor: "#E8E4DC",
  },
  monthRow: {
    flexDirection: "row",
    marginTop: 6,
    paddingHorizontal: 2,
  },
  monthLabel: {
    fontSize: 11,
    color: "#9A9A9A",
    fontWeight: "500",
    fontFamily: FONT_SANS_MEDIUM,
  },
});
