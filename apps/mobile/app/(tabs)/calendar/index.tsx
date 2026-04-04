import { useState, useEffect, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/auth";
import {
  fetchSymptomSummaries,
  groupByDateAndAggregate,
  generateDateRange,
  updateSymptomSummary,
  deleteSymptomSummary,
  type DayAggregated,
} from "@/lib/calendarService";
import { CalendarRowSkeleton } from "@/components/calendar/CalendarRowSkeleton";
import { EmptyState } from "@/components/calendar/EmptyState";
import { ContributionMiniCalendar } from "@/components/calendar/ContributionMiniCalendar";
import { AddSymptomFab } from "@/components/calendar/AddSymptomFab";
import { TimelineDayList } from "@/components/calendar/TimelineDayList";
import { aggregateTags, toLocalDateStr } from "@/lib/dateUtils";
import { calendarTheme as theme } from "@/lib/calendarTheme";
import { useCalendarHeader } from "@/contexts/calendarHeader";
import { useHeaderHeight } from "@/components/SharedHeader";

function getDateRangeForDays(count: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - count + 1);
  return {
    from: toLocalDateStr(from),
    to: toLocalDateStr(to),
  };
}

export default function CalendarScreen() {
  const router = useRouter();
  const { session, state } = useAuth();
  const { rangeDays } = useCalendarHeader();
  const [days, setDays] = useState<DayAggregated[]>([]);
  const [loading, setLoading] = useState(true);

  const userId = session?.user?.id;
  const headerH = useHeaderHeight();

  const loadRange = useCallback(
    async (targetRangeDays: number) => {
      if (!userId) return;
      setLoading(true);
      try {
        const { from, to } = getDateRangeForDays(targetRangeDays);
        const dateRange = generateDateRange(from, to);
        const entries = await fetchSymptomSummaries(userId, from, to);
        const grouped = groupByDateAndAggregate(entries, dateRange, 5);
        setDays(grouped);
      } catch (e) {
        console.error("calendar load:", e);
        setDays([]);
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    if (state === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (userId) loadRange(rangeDays);
    else setLoading(false);
  }, [userId, state, loadRange, rangeDays, router]);

  useFocusEffect(
    useCallback(() => {
      if (userId) loadRange(rangeDays);
    }, [userId, loadRange, rangeDays]),
  );

  const handleUpdateEntry = useCallback(
    async (entryId: string, nextSummary: string) => {
      await updateSymptomSummary(entryId, nextSummary);
      setDays((prev) =>
        prev.map((d) => {
          const match = d.entries.find((e) => e.id === entryId);
          if (!match) return d;
          const nextEntries = d.entries.map((e) =>
            e.id === entryId ? { ...e, summary: nextSummary } : e,
          );
          return {
            ...d,
            entries: nextEntries,
            aggregatedTags: aggregateTags(nextEntries, 5),
          };
        }),
      );
    },
    [],
  );

  const handleDeleteEntry = useCallback(async (entryId: string) => {
    await deleteSymptomSummary(entryId);
    setDays((prev) =>
      prev.map((d) => {
        if (!d.entries.some((e) => e.id === entryId)) return d;
        const nextEntries = d.entries.filter((e) => e.id !== entryId);
        return {
          ...d,
          entries: nextEntries,
          aggregatedTags: aggregateTags(nextEntries, 5),
        };
      }),
    );
  }, []);

  if (loading && days.length === 0) {
    return (
      <View style={styles.loadingWrap}>
        {[...Array(8)].map((_, i) => (
          <CalendarRowSkeleton key={i} />
        ))}
      </View>
    );
  }

  if (days.length === 0) {
    return (
      <View style={styles.page}>
        <EmptyState message="No calendar records yet" />
        {userId && <AddSymptomFab onCreated={() => loadRange(rangeDays)} />}
      </View>
    );
  }

  const heatMapHeader = (
    <View style={[styles.miniCalendarWrap, { paddingTop: headerH + 4 }]}>
      <ContributionMiniCalendar days={days} />
    </View>
  );

  return (
    <View style={styles.page}>
      <TimelineDayList
        days={days}
        onUpdateEntry={handleUpdateEntry}
        onDeleteEntry={handleDeleteEntry}
        headerComponent={heatMapHeader}
      />

      {userId && <AddSymptomFab onCreated={() => loadRange(rangeDays)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.bg },
  loadingWrap: { flex: 1, backgroundColor: theme.bg },
  miniCalendarWrap: {
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
});
