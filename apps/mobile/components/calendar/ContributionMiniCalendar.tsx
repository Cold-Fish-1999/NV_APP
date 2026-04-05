import { useState, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  LayoutAnimation,
  UIManager,
  Platform,
} from "react-native";
import type { DayAggregated } from "@/lib/calendarService";
import { calendarTheme as theme } from "@/lib/calendarTheme";
import { FONT_SANS_MEDIUM, FONT_SANS_BOLD } from "@/lib/fonts";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH_NAMES = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

interface Props {
  days: DayAggregated[];
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function getWeekDates(offset: number): string[] {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow + offset * 7);
  const result: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    result.push(toDateStr(d));
  }
  return result;
}

function getMonthGrid(year: number, month: number): (string | null)[][] {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const rows: (string | null)[][] = [];
  let row: (string | null)[] = Array(7).fill(null);
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month, day);
    const dow = (d.getDay() + 6) % 7;
    row[dow] = toDateStr(d);
    if (dow === 6 || day === lastDay) {
      rows.push(row);
      row = Array(7).fill(null);
    }
  }
  return rows;
}

function targetMonth(offset: number): { year: number; month: number } {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return { year: t.getFullYear(), month: t.getMonth() };
}

const ANIM_CONFIG = {
  duration: 220,
  create: { type: "easeInEaseOut" as const, property: "opacity" as const },
  update: { type: "easeInEaseOut" as const },
  delete: { type: "easeInEaseOut" as const, property: "opacity" as const },
};

export function ContributionMiniCalendar({ days }: Props) {
  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const countMap = useMemo(
    () => new Map(days.map((d) => [d.date, d.entries.length])),
    [days],
  );

  const [expanded, setExpanded] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const touchRef = useRef({ x: 0, y: 0, t: 0 });

  const dotStyleFor = useCallback(
    (date: string) => {
      const count = countMap.get(date) ?? 0;
      if (date === todayStr) return styles.dotToday;
      if (date > todayStr) return styles.dotFuture;
      if (count > 0) return styles.dotRecorded;
      return styles.dotPastEmpty;
    },
    [countMap, todayStr],
  );

  const handleTap = useCallback(() => {
    LayoutAnimation.configureNext(ANIM_CONFIG);
    if (!expanded) {
      const dates = getWeekDates(weekOffset);
      const anchor = new Date(dates[0] + "T12:00:00");
      const now = new Date();
      setMonthOffset(
        (anchor.getFullYear() - now.getFullYear()) * 12 +
          anchor.getMonth() -
          now.getMonth(),
      );
    }
    setExpanded((p) => !p);
  }, [expanded, weekOffset]);

  const handleSwipe = useCallback(
    (dir: "left" | "right") => {
      LayoutAnimation.configureNext(ANIM_CONFIG);
      const delta = dir === "right" ? -1 : 1;
      if (expanded) {
        setMonthOffset((p) => Math.min(Math.max(p + delta, -11), 0));
      } else {
        setWeekOffset((p) => Math.min(Math.max(p + delta, -25), 0));
      }
    },
    [expanded],
  );

  const onGrant = useCallback((e: any) => {
    touchRef.current = {
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
      t: Date.now(),
    };
  }, []);

  const onRelease = useCallback(
    (e: any) => {
      const dx = e.nativeEvent.pageX - touchRef.current.x;
      const dy = Math.abs(e.nativeEvent.pageY - touchRef.current.y);
      const dt = Date.now() - touchRef.current.t;
      if (Math.abs(dx) < 10 && dy < 10 && dt < 300) {
        handleTap();
      } else if (Math.abs(dx) > 40 && dy < 60) {
        handleSwipe(dx > 0 ? "right" : "left");
      }
    },
    [handleTap, handleSwipe],
  );

  const responderProps = {
    onStartShouldSetResponder: () => true,
    onResponderGrant: onGrant,
    onResponderRelease: onRelease,
  };

  const weekDates = !expanded ? getWeekDates(weekOffset) : [];
  const monthData = expanded ? targetMonth(monthOffset) : null;
  const grid = monthData ? getMonthGrid(monthData.year, monthData.month) : [];

  return (
    <View style={styles.container} {...responderProps}>
      {/* Weekday labels — fixed position, never moves */}
      <View style={styles.row}>
        {WEEKDAY_LABELS.map((l, i) => (
          <View key={i} style={styles.col}>
            <Text style={styles.label}>{l}</Text>
          </View>
        ))}
      </View>

      {/* Week mode: single dot row */}
      {!expanded && (
        <View style={[styles.row, styles.dotRow]}>
          {weekDates.map((date) => (
            <View key={date} style={styles.col}>
              <View style={[styles.dot, dotStyleFor(date)]} />
            </View>
          ))}
        </View>
      )}

      {/* Month mode: dot grid + watermark */}
      {expanded && monthData && (
        <View style={styles.monthBody}>
          <Text style={styles.watermark}>
            {MONTH_NAMES[monthData.month]}
            {"\n"}
            {monthData.year}
          </Text>
          {grid.map((gRow, rIdx) => (
            <View key={rIdx} style={[styles.row, styles.dotRow]}>
              {gRow.map((date, cIdx) => (
                <View key={cIdx} style={styles.col}>
                  {date ? (
                    <View style={[styles.dot, dotStyleFor(date)]} />
                  ) : (
                    <View style={styles.dotPlaceholder} />
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const DOT = 42;

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
  },

  row: {
    flexDirection: "row",
  },
  col: {
    flex: 1,
    alignItems: "center",
  },

  label: {
    fontSize: 10,
    fontWeight: "500",
    fontFamily: FONT_SANS_MEDIUM,
    color: theme.textMuted,
    letterSpacing: 0.4,
    marginBottom: 8,
  },

  dotRow: {
    marginBottom: 10,
  },

  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
  dotPlaceholder: {
    width: DOT,
    height: DOT,
  },

  monthBody: {
    position: "relative",
  },
  watermark: {
    position: "absolute",
    top: 4,
    left: 6,
    fontSize: 28,
    fontWeight: "800",
    fontFamily: FONT_SANS_BOLD,
    color: theme.textMuted,
    opacity: 0.08,
    letterSpacing: 1,
    textAlign: "left",
    lineHeight: 30,
  },

  dotToday: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: theme.primary,
  },
  dotRecorded: {
    backgroundColor: theme.primary,
  },
  dotPastEmpty: {
    backgroundColor: "#E0DCD6",
  },
  dotFuture: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: theme.border,
  },
});
