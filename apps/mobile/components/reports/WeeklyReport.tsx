import { View, Text, StyleSheet } from "react-native";
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
        <StatCell value={capitalize(d.avg_severity)} label="Avg severity" large />
      </View>

      <View style={styles.divider} />

      {/* Top symptoms */}
      <CollapsibleSection
        title="Top symptoms"
        subtitle={d.top_symptoms.map((s) => s.name).join(", ")}
      >
        <View style={styles.pillRow}>
          {d.top_symptoms.map((s) => (
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
      <CollapsibleSection title="Symptom trends" subtitle="vs previous weeks">
        <SymptomTrendNav items={d.symptom_trends} barHeight={80} />
      </CollapsibleSection>

      <View style={styles.divider} />

      {/* Severity */}
      <CollapsibleSection
        title="Severity"
        subtitle={`Mostly ${d.avg_severity} · ${d.severity_breakdown.high} high`}
      >
        <View style={styles.severityWrap}>
          <SeverityBar label="High" count={d.severity_breakdown.high} total={d.total_records} color="#D85A30" />
          <SeverityBar label="Medium" count={d.severity_breakdown.medium} total={d.total_records} color="#E6A817" />
          <SeverityBar label="Low" count={d.severity_breakdown.low} total={d.total_records} color="#7ED321" />
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
  large,
}: {
  value: number | string;
  label: string;
  large?: boolean;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, large && styles.statValueLarge]}>
        {value}
      </Text>
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
  statValue: { fontSize: 26, fontWeight: "700", color: "#2D2D2D" },
  statValueLarge: { fontSize: 22 },
  statLabel: { fontSize: 12, color: "#9A9A9A", marginTop: 2 },
  divider: { height: 1, backgroundColor: "#F0ECE6" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  symptomPill: {
    backgroundColor: "#EAF3DE",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  symptomPillText: { fontSize: 13, fontWeight: "600", color: "#3B6D11" },
  severityWrap: { gap: 10 },
  sevRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  sevLabel: { fontSize: 13, color: "#6B6B6B", width: 52 },
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
  },
  watchWrap: { marginTop: 8 },
});
