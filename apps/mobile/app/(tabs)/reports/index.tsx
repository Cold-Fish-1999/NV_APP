import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@/components/SharedHeader";
import { useAuth } from "@/contexts/auth";
import { useSubscription } from "@/contexts/subscription";
import { useReportTab } from "@/contexts/reportTab";
import {
  fetchAllWeeklyReports,
  fetchAllMonthlyReports,
  type WeeklyReportRow,
  type MonthlyReportRow,
} from "@/lib/reportService";
import { WeeklyReport } from "@/components/reports/WeeklyReport";
import { MonthlyReport } from "@/components/reports/MonthlyReport";
import { PaywallOverlay } from "@/components/reports/PaywallOverlay";

const TREND_BADGE = {
  improving: { label: "↑ Improving", bg: "#EAF3DE", color: "#3B6D11" },
  stable: { label: "→ Stable", bg: "#F0ECE6", color: "#6B6B6B" },
  worsening: { label: "↓ Worsening", bg: "#FCEBEB", color: "#A32D2D" },
} as const;

function formatWeekRange(start: string, end: string): string {
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  const months = [
    "Jan","Feb","Mar","Apr","May","Jun",
    "Jul","Aug","Sep","Oct","Nov","Dec",
  ];
  if (s.getMonth() === e.getMonth()) {
    return `${months[s.getMonth()]} ${s.getDate()} – ${e.getDate()}`;
  }
  return `${months[s.getMonth()]} ${s.getDate()} – ${months[e.getMonth()]} ${e.getDate()}`;
}

const FLOAT_TAB_H = 52;

export default function ReportsScreen() {
  const headerH = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const tabClearance = (insets.bottom > 0 ? insets.bottom - 12 : 12) + FLOAT_TAB_H;
  const { session } = useAuth();
  const { status: subStatus, isLoading: subLoading } = useSubscription();
  const { activeTab } = useReportTab();
  const [allWeekly, setAllWeekly] = useState<WeeklyReportRow[]>([]);
  const [allMonthly, setAllMonthly] = useState<MonthlyReportRow[]>([]);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isPaid = subStatus?.isPro === true;

  const loadReports = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      const [w, m] = await Promise.all([
        fetchAllWeeklyReports(),
        fetchAllMonthlyReports(),
      ]);
      setAllWeekly(w);
      setAllMonthly(m);
      setExpandedWeek(w[0]?.week_start ?? null);
      setExpandedMonth(m[0]?.report_month ?? null);
    } catch (e) {
      console.error("[reports] load error:", e);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useFocusEffect(
    useCallback(() => {
      loadReports();
    }, [loadReports])
  );

  const toggleWeek = useCallback((weekStart: string) => {
    setExpandedWeek((prev) => (prev === weekStart ? null : weekStart));
  }, []);

  const toggleMonth = useCallback((month: string) => {
    setExpandedMonth((prev) => (prev === month ? null : month));
  }, []);

  if (subLoading || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#D85A30" />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.contentWrap}>
        {!isPaid && <PaywallOverlay />}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingTop: headerH, paddingBottom: tabClearance + 20 }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={isPaid}
        >
          {activeTab === "Weekly" ? (
            allWeekly.length > 0 ? (
              allWeekly.map((r) => {
                const isOpen = expandedWeek === r.week_start;
                return (
                  <View key={r.week_start} style={styles.accordionItem}>
                    <WeeklyAccordionHeader
                      report={r}
                      isOpen={isOpen}
                      onPress={() => toggleWeek(r.week_start)}
                    />
                    {isOpen && <WeeklyReport report={r} />}
                  </View>
                );
              })
            ) : (
              <EmptyReport message="No weekly report yet. Reports are generated every Monday." />
            )
          ) : allMonthly.length > 0 ? (
            allMonthly.map((r) => {
              const isOpen = expandedMonth === r.report_month;
              return (
                <View key={r.report_month} style={styles.accordionItem}>
                  <MonthlyAccordionHeader
                    report={r}
                    isOpen={isOpen}
                    onPress={() => toggleMonth(r.report_month)}
                  />
                  {isOpen && <MonthlyReport report={r} />}
                </View>
              );
            })
          ) : (
            <EmptyReport message="No monthly report yet. Reports are generated on the first Monday of each month." />
          )}
        </ScrollView>
      </View>
    </View>
  );
}

/* ── Accordion Headers ─────────────────────────────────── */

function WeeklyAccordionHeader({
  report,
  isOpen,
  onPress,
}: {
  report: WeeklyReportRow;
  isOpen: boolean;
  onPress: () => void;
}) {
  const d = report.data;
  const range = formatWeekRange(report.week_start, report.week_end);
  const trendCfg =
    TREND_BADGE[d.overall_trend as keyof typeof TREND_BADGE] ?? TREND_BADGE.stable;

  return (
    <TouchableOpacity
      style={[styles.accordionHeader, isOpen && styles.accordionHeaderOpen]}
      activeOpacity={0.6}
      onPress={onPress}
    >
      <View style={styles.accordionLeft}>
        <Text style={[styles.accordionTitle, isOpen && styles.accordionTitleOpen]}>
          {range}
        </Text>
        <Text style={styles.accordionSub}>
          {d.total_records} records · {d.distinct_types} types
        </Text>
      </View>
      <View style={styles.accordionRight}>
        <View style={[styles.trendBadge, { backgroundColor: trendCfg.bg }]}>
          <Text style={[styles.trendBadgeText, { color: trendCfg.color }]}>
            {trendCfg.label}
          </Text>
        </View>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={18}
          color="#B0B0B0"
        />
      </View>
    </TouchableOpacity>
  );
}

function MonthlyAccordionHeader({
  report,
  isOpen,
  onPress,
}: {
  report: MonthlyReportRow;
  isOpen: boolean;
  onPress: () => void;
}) {
  const d = report.data;

  return (
    <TouchableOpacity
      style={[styles.accordionHeader, isOpen && styles.accordionHeaderOpen]}
      activeOpacity={0.6}
      onPress={onPress}
    >
      <View style={styles.accordionLeft}>
        <Text style={[styles.accordionTitle, isOpen && styles.accordionTitleOpen]}>
          {d.month_label || report.report_month}
        </Text>
        <Text style={styles.accordionSub}>
          {d.total_records} records · {d.active_days} active days
        </Text>
      </View>
      <View style={styles.accordionRight}>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={18}
          color="#B0B0B0"
        />
      </View>
    </TouchableOpacity>
  );
}

function EmptyReport({ message }: { message: string }) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

/* ── Styles ────────────────────────────────────────────── */

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f9faf5" },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9faf5",
  },
  contentWrap: {
    flex: 1,
    position: "relative",
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  accordionItem: {
    marginBottom: 10,
  },
  accordionHeader: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: "#E8E4DC",
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  accordionHeaderOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    backgroundColor: "#FFF9F5",
  },
  accordionLeft: {
    flex: 1,
    marginRight: 12,
  },
  accordionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2D2D2D",
  },
  accordionTitleOpen: {
    color: "#D85A30",
  },
  accordionSub: {
    fontSize: 12,
    color: "#9A9A9A",
    marginTop: 2,
  },
  accordionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trendBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  trendBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  emptyWrap: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#9A9A9A",
    textAlign: "center",
    lineHeight: 22,
  },
});
