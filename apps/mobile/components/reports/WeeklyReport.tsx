import { View, Text, StyleSheet } from "react-native";
import { FONT_SANS, FONT_SANS_BOLD, FONT_SANS_SEMIBOLD } from "@/lib/fonts";
import { CollapsibleSection } from "./CollapsibleSection";
import { SymptomTrendNav } from "./SymptomTrendNav";
import { ThingsToWatch } from "./ThingsToWatch";
import type { WeeklyReportRow } from "@/lib/reportService";

interface Props {
  report: WeeklyReportRow;
}

export function WeeklyReport({ report }: Props) {
  const d = report.data;

  return (
    <View style={styles.body}>
      {/* Stats row */}
      <View style={styles.statsRow}>
        <StatCell value={d.total_records} label="Records" />
        <StatCell value={d.distinct_types} label="Types" />
        <StatCell value={capitalize(d.avg_severity)} label="Avg severity" />
      </View>

      <View style={styles.divider} />

      {/* Symptom summary */}
      <CollapsibleSection title="Symptom summary">
        <View style={styles.pillRow}>
          {d.top_symptoms.slice(0, 5).map((s) => (
            <View key={s.name} style={styles.symptomPill}>
              <Text style={styles.symptomPillText}>
                {s.name} ×{s.count}
              </Text>
            </View>
          ))}
        </View>
      </CollapsibleSection>

      <View style={styles.divider} />

      {/* Symptom trends */}
      <CollapsibleSection title="Symptom trends">
        <SymptomTrendNav
          items={d.symptom_trends.map((s) => ({ ...s, description: "" }))}
          barHeight={80}
        />
      </CollapsibleSection>

      <View style={styles.divider} />

      {/* Severity */}
      <CollapsibleSection
        title="Severity"
      >
        <View style={styles.severityWrap}>
          <SeverityBar label="High" count={d.severity_breakdown.high} total={d.total_records} color="#C27C5B" />
          <SeverityBar label="Medium" count={d.severity_breakdown.medium} total={d.total_records} color="#D4A96A" />
          <SeverityBar label="Low" count={d.severity_breakdown.low} total={d.total_records} color="#A68A7B" />
        </View>
      </CollapsibleSection>

      {/* Things to watch */}
      {d.things_to_watch.length > 0 && (
        <View style={styles.watchWrap}>
          <ThingsToWatch items={d.things_to_watch} />
        </View>
      )}
    </View>
  );
}

function StatCell({
  value,
  label,
}: {
  value: number | string;
  label: string;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SeverityBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <View style={styles.sevRow}>
      <Text style={styles.sevLabel}>{label}</Text>
      <View style={styles.sevBarBg}>
        <View
          style={[
            styles.sevBarFill,
            { width: `${Math.max(pct, 2)}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={styles.sevCount}>{count}</Text>
    </View>
  );
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const styles = StyleSheet.create({
  body: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: 0.5,
    borderTopWidth: 0,
    borderColor: "#E8E4DC",
    padding: 18,
    paddingTop: 6,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  statCell: { flex: 1 },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#2D2D2D",
    marginTop: 6,
    fontFamily: FONT_SANS_BOLD,
  },
  statLabel: { fontSize: 13, color: "#9A9A9A", marginTop: 2, fontFamily: FONT_SANS },
  divider: { height: 1, backgroundColor: "#F0ECE6" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  symptomPill: {
    backgroundColor: "#FEF0E8",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  symptomPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#D85A30",
    fontFamily: FONT_SANS,
  },
  severityWrap: { gap: 10 },
  sevRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  sevLabel: { fontSize: 13, color: "#6B6B6B", width: 52, fontFamily: FONT_SANS },
  sevBarBg: {
    flex: 1,
    height: 10,
    backgroundColor: "#F0ECE6",
    borderRadius: 5,
    overflow: "hidden",
  },
  sevBarFill: { height: 10, borderRadius: 5 },
  sevCount: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2D2D2D",
    width: 24,
    textAlign: "right",
    fontFamily: FONT_SANS_SEMIBOLD,
  },
  watchWrap: { marginTop: 8 },
});
