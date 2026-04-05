import { View, Text, StyleSheet } from "react-native";
import { FONT_SERIF, FONT_SANS_SEMIBOLD,FONT_SANS_BOLD, fontSerif,FONT_SERIF_SEMIBOLD, FONT_SERIF_BOLD } from "@/lib/fonts";

interface WatchItem {
  symptom: string;
  risk: "high" | "medium" | "low";
  cause: string;
  tip?: string;
}

interface Props {
  items: WatchItem[];
}

const RISK_CONFIG = {
  high: { dotColor: "#D85A30", label: "High risk", labelBg: "#FCEBEB", labelColor: "#A32D2D" },
  medium: { dotColor: "#E6A817", label: "Monitor", labelBg: "#FFF5DC", labelColor: "#8B6914" },
  low: { dotColor: "#9A9A9A", label: "Stable", labelBg: "#F0ECE6", labelColor: "#6B6B6B" },
};

export function ThingsToWatch({ items }: Props) {
  if (!items || items.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Things to watch</Text>
      {items.map((item, i) => {
        const cfg = RISK_CONFIG[item.risk] ?? RISK_CONFIG.low;
        return (
          <View key={`${item.symptom}-${i}`}>
            {i > 0 && <View style={styles.divider} />}
            <View style={styles.item}>
              <View style={styles.itemHeader}>
                <View style={[styles.dot, { backgroundColor: cfg.dotColor }]} />
                <Text style={styles.symptomName}>{item.symptom}</Text>
                <View style={[styles.badge, { backgroundColor: cfg.labelBg }]}>
                  <Text style={[styles.badgeText, { color: cfg.labelColor }]}>
                    {cfg.label}
                  </Text>
                </View>
              </View>
              <Text style={[styles.cause, { fontFamily: fontSerif(item.cause) }]}>{item.cause}</Text>
              {item.tip ? (
                <View style={styles.tipBox}>
                  <Text style={[styles.tipText, { fontFamily: fontSerif(item.tip) }]}>{item.tip}</Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FDF6F2",
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: "#F0997B",
    padding: 18,
    marginTop: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#D85A30",
    marginBottom: 14,
    fontFamily: FONT_SERIF_SEMIBOLD,
  },
  divider: {
    height: 1,
    backgroundColor: "#F0DDD3",
    marginVertical: 14,
  },
  item: {},
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  symptomName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2D2D2D",
    flex: 1,
    fontFamily: FONT_SERIF_SEMIBOLD,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: FONT_SANS_SEMIBOLD,
  },
  cause: {
    fontSize: 13,
    color: "#4A4A4A",
    lineHeight: 20,
    marginLeft: 16,
    marginTop: 2,
  },
  tipBox: {
    marginTop: 8,
    marginLeft: 16,
    backgroundColor: "#EAF3DE",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tipText: {
    fontSize: 13,
    color: "#3B6D11",
    lineHeight: 19,
  },
});
