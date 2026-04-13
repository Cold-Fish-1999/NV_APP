import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { FONT_SANS, FONT_SANS_BOLD, FONT_SANS_SEMIBOLD } from "@/lib/fonts";
import { CollapsibleSection } from "./CollapsibleSection";
import { SymptomTrendNav } from "./SymptomTrendNav";
import { ThingsToWatch } from "./ThingsToWatch";
import type { WeeklyReportRow } from "@/lib/reportService";

interface Props {
  report: WeeklyReportRow;
}

type TabKey = "symptoms" | "medications";

export function WeeklyReport({ report }: Props) {
  const d = report.data;
  const [tab, setTab] = useState<TabKey>("symptoms");
  const hasMeds = (d.medication_summary?.length ?? 0) > 0 || (d.medication_trends?.length ?? 0) > 0;

  return (
    <View style={styles.body}>
      {/* Stats row (symptom_feeling only) */}
      <View style={styles.statsRow}>
        <StatCell value={d.total_records} label="Records" />
        <StatCell value={d.distinct_types} label="Types" />
        <StatCell value={capitalize(d.avg_severity)} label="Avg severity" />
      </View>

      {/* Tab switch */}
      {hasMeds && (
        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setTab("symptoms")}
            style={[styles.tabBtn, tab === "symptoms" && styles.tabBtnActive]}
          >
            <Text style={[styles.tabText, tab === "symptoms" && styles.tabTextActive]}>
              Symptoms
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab("medications")}
            style={[styles.tabBtn, tab === "medications" && styles.tabBtnActive]}
          >
            <Text style={[styles.tabText, tab === "medications" && styles.tabTextActive]}>
              Medications
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.divider} />

      {tab === "symptoms" ? (
        <>
          {/* Symptom summary */}
          <CollapsibleSection title="Symptom summary" defaultOpen>
            <View style={styles.pillRow}>
              {d.top_symptoms.slice(0, 5).map((s) => (
                <View key={s.name} style={styles.symptomPill}>
                  <Text style={styles.symptomPillText}>
                    {s.name} x{s.count}
                  </Text>
                </View>
              ))}
              {d.top_symptoms.length === 0 && (
                <Text style={styles.emptyHint}>No symptoms this week</Text>
              )}
            </View>
          </CollapsibleSection>

          <View style={styles.divider} />

          {/* Symptom trends */}
          <CollapsibleSection title="Symptom trends" defaultOpen>
            {d.symptom_trends.length > 0 ? (
              <SymptomTrendNav
                items={d.symptom_trends.map((s) => ({ ...s, description: "" }))}
                barHeight={80}
              />
            ) : (
              <Text style={styles.emptyHint}>Not enough data for trends</Text>
            )}
          </CollapsibleSection>

          <View style={styles.divider} />

          {/* Severity */}
          <CollapsibleSection title="Severity">
            <View style={styles.severityWrap}>
              <SeverityBar label="High" count={d.severity_breakdown.high} total={d.total_records} color="#C27C5B" />
              <SeverityBar label="Medium" count={d.severity_breakdown.medium} total={d.total_records} color="#D4A96A" />
              <SeverityBar label="Low" count={d.severity_breakdown.low} total={d.total_records} color="#A68A7B" />
            </View>
          </CollapsibleSection>
        </>
      ) : (
        <>
          {/* Medication summary */}
          <CollapsibleSection title="Medication summary" defaultOpen>
            <View style={styles.pillRow}>
              {(d.medication_summary ?? []).slice(0, 5).map((s) => (
                <View key={s.name} style={styles.medPill}>
                  <Text style={styles.medPillText}>
                    {s.name} x{s.count}
                  </Text>
                </View>
              ))}
              {(d.medication_summary?.length ?? 0) === 0 && (
                <Text style={styles.emptyHint}>No medications this week</Text>
              )}
            </View>
          </CollapsibleSection>

          <View style={styles.divider} />

          {/* Medication trends */}
          <CollapsibleSection title="Medication trends" defaultOpen>
            {(d.medication_trends?.length ?? 0) > 0 ? (
              <SymptomTrendNav
                items={(d.medication_trends ?? []).map((s) => ({ ...s, description: "" }))}
                barHeight={80}
              />
            ) : (
              <Text style={styles.emptyHint}>Not enough data for trends</Text>
            )}
          </CollapsibleSection>
        </>
      )}

      {/* Things to watch */}
      {d.things_to_watch.length > 0 && (
        <View style={styles.watchWrap}>
          <ThingsToWatch items={d.things_to_watch} />
        </View>
      )}
    </View>
  );
}

function StatCell({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SeverityBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <View style={styles.sevRow}>
      <Text style={styles.sevLabel}>{label}</Text>
      <View style={styles.sevBarBg}>
        <View style={[styles.sevBarFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: color }]} />
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
  tabRow: {
    flexDirection: "row",
    gap: 0,
    marginBottom: 4,
    backgroundColor: "#F0ECE6",
    borderRadius: 10,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: "center",
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: "#fff",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9A9A9A",
    fontFamily: FONT_SANS,
  },
  tabTextActive: {
    color: "#2D2D2D",
  },
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
  medPill: {
    backgroundColor: "#EAF3DE",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  medPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3B6D11",
    fontFamily: FONT_SANS,
  },
  emptyHint: {
    fontSize: 13,
    color: "#9A9A9A",
    fontFamily: FONT_SANS,
    fontStyle: "italic",
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
