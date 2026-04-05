import { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { getTimeSlotForEntry, formatTime, formatDateWithWeekday } from "@/lib/dateUtils";
import { calendarTheme as theme } from "@/lib/calendarTheme";
import { TimelineEntry } from "./TimelineEntry";
import { EntryActionSheet } from "./EntryActionSheet";
import { TagPills } from "./TagPills";
import { TemperatureLineChart } from "./TemperatureLineChart";
import { fetchDayWeather, weatherCodeToLabel } from "@/lib/weatherApi";
import { useUserLocation } from "@/lib/useUserLocation";
import type { SymptomEntry } from "@/types/calendar";
import { TIME_SLOTS } from "@/lib/dateUtils";
import { FONT_SANS, FONT_SANS_MEDIUM, FONT_SANS_BOLD } from "@/lib/fonts";

interface DayDetailViewProps {
  date: string;
  entries: SymptomEntry[];
  aggregatedTags: { tag: string; count: number }[];
  onUpdateEntry: (entryId: string, nextSummary: string) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
  inline?: boolean;
}

function formatSlotTime(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

export function DayDetailView({
  date,
  entries,
  aggregatedTags,
  onUpdateEntry,
  onDeleteEntry,
  inline,
}: DayDetailViewProps) {
  const [weather, setWeather] = useState<Awaited<ReturnType<typeof fetchDayWeather>> | "loading">("loading");
  const [activeEntry, setActiveEntry] = useState<SymptomEntry | null>(null);
  const userCoords = useUserLocation();

  useEffect(() => {
    setWeather("loading");
    let cancelled = false;
    fetchDayWeather(date, userCoords).then((w) => {
      if (!cancelled) setWeather(w ?? null);
    });
    return () => { cancelled = true; };
  }, [date, userCoords]);

  const handleLongPress = useCallback((entry: SymptomEntry) => {
    setActiveEntry(entry);
  }, []);

  const handleSheetClose = useCallback(() => {
    setActiveEntry(null);
  }, []);

  const bySlot = new Map<string, SymptomEntry[]>();
  for (const s of TIME_SLOTS) bySlot.set(s.key, []);
  for (const e of entries) {
    const slot = getTimeSlotForEntry(e.created_at);
    bySlot.get(slot)?.push(e);
  }

  const body = (
    <>
      <View style={styles.header}>
        <Text style={styles.dateText}>{formatDateWithWeekday(date)}</Text>
        <TagPills tags={aggregatedTags} maxShow={5} />
        <View style={styles.weatherSection}>
          {weather === "loading" ? (
            <View style={styles.weatherLoading}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={styles.weatherLoadingText}>Loading weather</Text>
            </View>
          ) : weather ? (
            <>
              <View style={styles.weatherLabelRow}>
                <Text style={styles.weatherLabel}>{weatherCodeToLabel(weather.weatherCode)}</Text>
                <Text style={styles.tempRange}>
                  {Math.round(weather.tempMin)}° to {Math.round(weather.tempMax)}°
                </Text>
              </View>
              <TemperatureLineChart
                hourly={weather.hourly}
                tempMin={weather.tempMin}
                tempMax={weather.tempMax}
              />
            </>
          ) : null}
        </View>
      </View>
      <View style={styles.timeline}>
        {TIME_SLOTS.map((slot, slotIdx) => {
          const slotEntries = bySlot.get(slot.key) ?? [];
          const isLastSlot = slotIdx === TIME_SLOTS.length - 1;
          const hasEntries = slotEntries.length > 0;

          return (
            <View key={slot.key} style={styles.slotBlock}>
              <View style={styles.timelineRow}>
                <View style={styles.timeCol}>
                  <View style={styles.timeCell}>
                    <Text style={styles.timeText}>{formatSlotTime(slot.startHour)}</Text>
                    <View style={styles.nodeDot} />
                  </View>
                  <View style={styles.lineSegment} />
                </View>
                <View style={styles.contentCol}>
                  <Text style={styles.slotLabel}>{slot.label}</Text>
                </View>
              </View>

              {slotEntries.map((e, entryIdx) => {
                const showLine = !(entryIdx === slotEntries.length - 1 && isLastSlot);

                return (
                  <View key={e.id} style={[styles.timelineRow, styles.entryRow]}>
                    <View style={styles.timeCol}>
                      <View style={styles.timeCell}>
                        <Text style={styles.timeText}>{formatTime(e.created_at)}</Text>
                        <View style={styles.entryDot} />
                      </View>
                      {showLine ? <View style={styles.lineSegment} /> : <View style={styles.linePlaceholder} />}
                    </View>
                    <View style={styles.contentCol}>
                      <TimelineEntry
                        entry={e}
                        onLongPress={handleLongPress}
                      />
                    </View>
                  </View>
                );
              })}

              {!hasEntries && !isLastSlot && (
                <View style={styles.timelineRow}>
                  <View style={styles.timeCol}>
                    <View style={styles.timeCell} />
                    <View style={[styles.lineSegment, { minHeight: 28 }]} />
                  </View>
                  <View style={styles.contentCol} />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </>
  );

  return (
    <View style={inline ? styles.containerInline : styles.container}>
      {inline ? (
        <View style={styles.contentInline}>{body}</View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {body}
        </ScrollView>
      )}

      <EntryActionSheet
        entry={activeEntry}
        onClose={handleSheetClose}
        onUpdateEntry={onUpdateEntry}
        onDeleteEntry={onDeleteEntry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  containerInline: { backgroundColor: theme.bgCard },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  contentInline: { padding: 16, paddingBottom: 20 },
  header: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  dateText: { fontSize: 18, fontWeight: "600", fontFamily: FONT_SANS_BOLD, color: theme.text, marginBottom: 8 },
  weatherSection: { marginTop: 12 },
  weatherLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  weatherLabel: { fontSize: 13, fontFamily: FONT_SANS, color: theme.textSecondary },
  tempRange: { fontSize: 13, fontFamily: FONT_SANS, color: theme.textMuted },
  weatherLoading: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  weatherLoadingText: { fontSize: 13, fontFamily: FONT_SANS, color: theme.textMuted },
  timeline: {},
  slotBlock: { marginBottom: 24 },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  entryRow: { marginBottom: 12 },
  timeCol: {
    width: 52,
    alignItems: "flex-end",
  },
  timeCell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  timeText: {
    fontSize: 13,
    fontWeight: "500",
    fontFamily: FONT_SANS_MEDIUM,
    color: theme.textSecondary,
    width: 48,
    textAlign: "right",
    lineHeight: 18,
  },
  nodeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.primary,
  },
  entryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.primaryMuted,
  },
  lineSegment: {
    width: 2,
    flex: 1,
    minHeight: 20,
    backgroundColor: theme.border,
    marginLeft: "auto",
    marginRight: 3,
  },
  linePlaceholder: {
    width: 2,
    height: 6,
    backgroundColor: "transparent",
    marginLeft: "auto",
    marginRight: 3,
  },
  contentCol: { flex: 1, marginLeft: 12 },
  slotLabel: { fontSize: 14, fontWeight: "500", fontFamily: FONT_SANS_MEDIUM, color: theme.text, marginBottom: 12 },
});
