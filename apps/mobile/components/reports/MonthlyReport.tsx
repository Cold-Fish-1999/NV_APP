import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { FONT_SANS, FONT_SANS_BOLD } from "@/lib/fonts";
import { SymptomTrendNav } from "./SymptomTrendNav";
import { DonutChart } from "./DonutChart";
import { ThingsToWatch } from "./ThingsToWatch";
import type { MonthlyReportRow } from "@/lib/reportService";

interface Props {
  report: MonthlyReportRow;
}

type TabKey = "symptoms" | "medications";

function deriveMonthLabels(
  breakdown: Array<{ label: string; count: number }>,
): string[] {
  if (!breakdown || breakdown.length === 0) return [];
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const b of breakdown) {
    const month = b.label.split(" ")[0];
    if (!seen.has(month)) {
      seen.add(month);
      labels.push(month);
    }
  }
  return labels;
}

export function MonthlyReport({ report }: Props) {
  const d = report.data;
  const [tab, setTab] = useState<TabKey>("symptoms");
  const hasMeds = (d.medication_trends?.length ?? 0) > 0;
  const monthLabels =
    d.top_symptoms.length > 0
      ? deriveMonthLabels(d.top_symptoms[0].weekly_breakdown ?? [])
      : [];

  return (
    <View style={styles.body}>
      {/* Stats row (symptom_feeling only) */}
      <View style={styles.statsRow}>
        <StatCell value={d.total_records} label="Records" />
        <StatCell value={d.distinct_types} label="Types" />
        <StatCell value={d.active_days} label="Active days" />
      </View>

      {/* Comparison pill */}
      {d.vs_prev_month_pct !== null && (
        <View style={styles.compRow}>
          <CompPill label="vs last month" pct={d.vs_prev_month_pct} />
        </View>
      )}

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

      {tab === "symptoms" ? (
        <>
          {/* Symptom trends */}
          {d.top_symptoms.length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>Symptom trends</Text>
              <SymptomTrendNav
                items={d.top_symptoms.map((s) => ({
                  name: s.name,
                  trend: s.trend,
                  description: s.description,
                  weekly_breakdown: s.weekly_breakdown,
                }))}
                monthLabels={monthLabels}
                barHeight={100}
              />
            </>
          )}

          {/* Breakdown donut */}
          {d.breakdown.length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>Breakdown this month</Text>
              <DonutChart segments={d.breakdown} total={d.total_records} />
            </>
          )}
        </>
      ) : (
        <>
          {/* Medication trends */}
          {(d.medication_trends?.length ?? 0) > 0 ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>Medication trends</Text>
              <SymptomTrendNav
                items={(d.medication_trends ?? []).map((s) => ({
                  name: s.name,
                  trend: s.trend,
                  description: s.description,
                  weekly_breakdown: s.weekly_breakdown,
                }))}
                monthLabels={monthLabels}
                barHeight={100}
              />
            </>
          ) : (
            <>
              <View style={styles.divider} />
              <Text style={styles.emptyHint}>No medication data for trends</Text>
            </>
          )}
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

function CompPill({ label, pct }: { label: string; pct: number }) {
  const isDown = pct < 0;
  const arrow = isDown ? "↓" : pct > 0 ? "↑" : "";
  const color = isDown ? "#3B6D11" : pct > 0 ? "#A32D2D" : "#6B6B6B";
  const bg = isDown ? "#EAF3DE" : pct > 0 ? "#FCEBEB" : "#F0ECE6";

  return (
    <View style={[styles.compPill, { backgroundColor: bg }]}>
      <Text style={styles.compLabel}>{label}</Text>
      <Text style={[styles.compPct, { color }]}>
        {arrow} {Math.abs(Math.round(pct))}%{" "}
        {isDown ? "fewer" : pct > 0 ? "more" : ""}
      </Text>
    </View>
  );
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
  compRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  compPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  compLabel: { fontSize: 13, color: "#6B6B6B", fontFamily: FONT_SANS },
  compPct: { fontSize: 13, fontWeight: "700", fontFamily: FONT_SANS_BOLD },
  tabRow: {
    flexDirection: "row",
    gap: 0,
    marginBottom: 4,
    marginTop: 8,
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
  divider: {
    height: 1,
    backgroundColor: "#F0ECE6",
    marginVertical: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2D2D2D",
    marginBottom: 14,
    fontFamily: FONT_SANS_BOLD,
  },
  emptyHint: {
    fontSize: 13,
    color: "#9A9A9A",
    fontFamily: FONT_SANS,
    fontStyle: "italic",
    marginTop: 14,
  },
  watchWrap: { marginTop: 8 },
});
