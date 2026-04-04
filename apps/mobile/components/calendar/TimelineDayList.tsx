import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  Alert,
  TextInput,
  Keyboard,
} from "react-native";
import { calendarTheme as theme, severityColors } from "@/lib/calendarTheme";
import { formatWeekday, formatTime, toLocalDateStr } from "@/lib/dateUtils";
import type { DayAggregated } from "@/lib/calendarService";
import type { SymptomEntry } from "@/types/calendar";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MAX_INLINE_TAGS = 3;

/* ------------------------------------------------------------------ */
/*  Data: collapse empty days, insert month separators, protect Today */
/* ------------------------------------------------------------------ */

type TLItem =
  | { kind: "day"; day: DayAggregated; isToday: boolean }
  | { kind: "gap"; count: number }
  | { kind: "monthSep"; label: string; isFirst: boolean };

function monthOf(dateStr: string) {
  return new Date(dateStr + "T12:00:00").getMonth();
}

function buildItems(days: DayAggregated[], todayStr: string): TLItem[] {
  const out: TLItem[] = [];
  let lastMonth = -1;
  let gapN = 0;
  let gapMonth = -1;
  let isFirstMonth = true;

  const emitMonth = (month: number) => {
    out.push({ kind: "monthSep", label: MONTH_ABBR[month], isFirst: isFirstMonth });
    isFirstMonth = false;
    lastMonth = month;
  };

  const flushGap = () => {
    if (!gapN) return;
    if (gapMonth !== lastMonth) emitMonth(gapMonth);
    out.push({ kind: "gap", count: gapN });
    gapN = 0;
  };

  for (const d of days) {
    const m = monthOf(d.date);
    const isToday = d.date === todayStr;

    if (d.entries.length === 0 && !isToday) {
      if (gapN > 0 && m !== gapMonth) flushGap();
      if (!gapN) gapMonth = m;
      gapN++;
    } else {
      flushGap();
      if (m !== lastMonth) emitMonth(m);
      out.push({ kind: "day", day: d, isToday });
    }
  }
  flushGap();
  return out;
}

/* ------------------------------------------------------------------ */
/*  Inline entry ellipsis menu                                        */
/* ------------------------------------------------------------------ */

function InlineEntryRow({
  entry,
  isLastEntry,
  isLastItem,
  onUpdate,
  onDelete,
}: {
  entry: SymptomEntry;
  isLastEntry: boolean;
  isLastItem: boolean;
  onUpdate: (id: string, s: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.summary);
  const [saving, setSaving] = useState(false);

  const hideBottomLine = isLastEntry && isLastItem;

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      Alert.alert("Notice", "Content cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      await onUpdate(entry.id, trimmed);
      setEditing(false);
      setMenuOpen(false);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    const run = async () => {
      setSaving(true);
      try {
        await onDelete(entry.id);
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Delete this record?")) void run();
      return;
    }
    Alert.alert("Delete", "This record cannot be recovered.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void run() },
    ]);
  };

  return (
    <View style={styles.entryOuter}>
      <View style={styles.entryRow}>
        <View style={styles.entryLeftCol}>
          <Text style={styles.entryTime}>{formatTime(entry.created_at)}</Text>
        </View>
        <View style={styles.rail}>
          <View style={styles.entryLineTop} />
          <View style={styles.entryDot} />
          <View style={[styles.lineBot, hideBottomLine && styles.lineHidden]} />
        </View>
        <View style={styles.entryContent}>
          {editing ? (
            <View style={styles.editWrap}>
              <TextInput
                style={styles.editInput}
                value={draft}
                onChangeText={setDraft}
                multiline
                autoFocus
                placeholderTextColor={theme.textMuted}
              />
              <View style={styles.editActions}>
                <Pressable
                  onPress={() => { setEditing(false); setDraft(entry.summary); Keyboard.dismiss(); }}
                  style={styles.editBtn}
                >
                  <Text style={styles.editBtnCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  style={[styles.editBtn, styles.editBtnSave, saving && { opacity: 0.5 }]}
                  disabled={saving}
                >
                  <Text style={styles.editBtnSaveText}>{saving ? "…" : "Save"}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>{entry.summary}</Text>
              <Pressable
                onPress={() => setMenuOpen((p) => !p)}
                hitSlop={12}
                style={styles.ellipsisBtn}
              >
                <Text style={styles.ellipsis}>⋯</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {menuOpen && !editing && (
        <View style={styles.entryRow}>
          <View style={styles.entryLeftCol} />
          <View style={styles.rail}>
            <View style={[styles.lineFull, hideBottomLine && styles.lineHidden]} />
          </View>
          <View style={styles.menuWrap}>
            <Pressable
              onPress={() => { setEditing(true); setMenuOpen(false); setDraft(entry.summary); }}
              style={styles.menuItem}
            >
              <Text style={styles.menuText}>Edit</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable onPress={handleDelete} style={styles.menuItem}>
              <Text style={[styles.menuText, styles.menuTextDanger]}>Delete</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

interface TimelineDayListProps {
  days: DayAggregated[];
  onUpdateEntry: (entryId: string, nextSummary: string) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
  headerComponent?: React.ReactNode;
}

export function TimelineDayList({
  days,
  onUpdateEntry,
  onDeleteEntry,
  headerComponent,
}: TimelineDayListProps) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const todayStr = useMemo(() => toLocalDateStr(), []);
  const items = useMemo(() => buildItems(days, todayStr), [days, todayStr]);

  const toggle = useCallback((date: string) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        250,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    );
    setExpandedDate((prev) => (prev === date ? null : date));
  }, []);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {headerComponent}
      {items.map((item, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === items.length - 1;

        /* ---- month separator ---- */
        if (item.kind === "monthSep") {
          return (
            <View
              key={`ms-${item.label}-${idx}`}
              style={[styles.monthRow, !item.isFirst && styles.monthRowSpaced]}
            >
              <View style={styles.leftCol} />
              <View style={styles.rail}>
                <View
                  style={[styles.lineFull, isFirst && styles.lineHidden]}
                />
              </View>
              <View style={styles.rightCol} />
              {/* Absolute month label — spans across columns, not clipped */}
              <Text style={styles.monthLabel}>{item.label}</Text>
            </View>
          );
        }

        /* ---- gap row ---- */
        if (item.kind === "gap") {
          return (
            <View key={`gap-${idx}`}>
              <View style={styles.gapRow}>
                <View style={styles.leftCol} />
                <View style={styles.rail}>
                  <View style={styles.lineTopGap} />
                  <View style={styles.dotEmpty} />
                  <View
                    style={[styles.lineBot, isLast && styles.lineHidden]}
                  />
                </View>
                <View style={[styles.rightCol, styles.gapRightCol]}>
                  <Text style={styles.gapText}>
                    {item.count} {item.count === 1 ? "day" : "days"} · all good
                  </Text>
                </View>
              </View>
            </View>
          );
        }

        /* ---- day row (record or today) ---- */
        const day = item.day;
        const hasEntries = day.entries.length > 0;
        const isOpen = hasEntries && expandedDate === day.date;
        const dateNum = new Date(day.date + "T12:00:00").getDate();
        const tags = day.aggregatedTags;
        const visibleTags = tags.slice(0, MAX_INLINE_TAGS);
        const extraCount = tags.length - MAX_INLINE_TAGS;

        return (
          <View key={day.date}>
            <View style={styles.recordRow}>
              <View style={styles.leftCol}>
                <Text style={[styles.dateNum, item.isToday && styles.todayText]}>
                  {dateNum}
                </Text>
                <Text style={[styles.weekday, item.isToday && styles.todayText]}>
                  {formatWeekday(day.date)}
                </Text>
              </View>

              {/* Rail */}
              <View style={styles.rail}>
                <View style={styles.lineTopRecord} />
                {item.isToday && !hasEntries ? (
                  <View style={styles.todayRing} />
                ) : (
                  <View style={styles.dotActive} />
                )}
                <View
                  style={[
                    styles.lineBot,
                    !isOpen && isLast && styles.lineHidden,
                  ]}
                />
              </View>

              {/* Right: tags (if has entries) or empty today hint */}
              {hasEntries ? (
                <Pressable
                  onPress={() => toggle(day.date)}
                  style={({ pressed }) => [
                    styles.rightCol,
                    styles.recordRightCol,
                    pressed && styles.rightColPressed,
                  ]}
                  android_ripple={{ color: theme.primaryLight }}
                >
                  <View style={styles.tagsRow}>
                    {visibleTags.map(({ tag, severity }) => {
                      const sc = severity ? severityColors[severity] : undefined;
                      return (
                        <View
                          key={tag}
                          style={[styles.pill, sc && { backgroundColor: sc.bg }]}
                        >
                          <Text
                            style={[styles.pillText, sc && { color: sc.text }]}
                            numberOfLines={1}
                          >
                            {tag}
                          </Text>
                        </View>
                      );
                    })}
                    {extraCount > 0 && (
                      <View style={[styles.pill, styles.pillExtra]}>
                        <Text style={styles.pillExtraText}>+{extraCount}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.chevron, isOpen && styles.chevronOpen]}>
                    ›
                  </Text>
                </Pressable>
              ) : (
                <View style={[styles.rightCol, styles.todayRightCol]}>
                  <Text style={styles.todayHint}>No records yet</Text>
                </View>
              )}
            </View>

            {/* Expanded entries */}
            {isOpen &&
              day.entries.map((entry, eIdx) => (
                <InlineEntryRow
                  key={entry.id}
                  entry={entry}
                  isLastEntry={eIdx === day.entries.length - 1}
                  isLastItem={isLast}
                  onUpdate={onUpdateEntry}
                  onDelete={onDeleteEntry}
                />
              ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

const DOT_ACTIVE = 11;
const DOT_EMPTY = 7;
const DOT_ENTRY = 6;
const TODAY_RING = 13;
const HALO = DOT_ACTIVE + 6;
const LINE_W = 1.5;
const LEFT_W = 62;
const RAIL_W = 28;

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100 },

  /* ---- Month separator ---- */
  monthRow: {
    flexDirection: "row",
    height: 36,
    position: "relative",
    overflow: "visible",
  },
  monthRowSpaced: { height: 56 },
  monthLabel: {
    position: "absolute",
    left: 4,
    bottom: 0,
    fontSize: 40,
    fontWeight: "800",
    color: theme.primary,
    opacity: 0.15,
    letterSpacing: -1,
  },

  /* ---- Row variants ---- */
  recordRow: { flexDirection: "row", minHeight: 62 },
  gapRow: { flexDirection: "row", minHeight: 40 },

  /* ---- Left column ---- */
  leftCol: {
    width: LEFT_W,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 6,
  },
  dateNum: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.text,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  weekday: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 1,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  todayText: {
    color: theme.primary,
  },

  /* ---- Rail ---- */
  rail: { width: RAIL_W, alignItems: "center" },
  lineTopRecord: { width: LINE_W, height: 22, backgroundColor: theme.border },
  lineTopGap: { width: LINE_W, height: 16, backgroundColor: theme.border },
  lineBot: { width: LINE_W, flex: 1, minHeight: 12, backgroundColor: theme.border },
  lineFull: { width: LINE_W, flex: 1, backgroundColor: theme.border },
  lineHidden: { backgroundColor: "transparent" },

  dotActive: {
    width: DOT_ACTIVE,
    height: DOT_ACTIVE,
    borderRadius: DOT_ACTIVE / 2,
    backgroundColor: theme.primary,
  },
  haloBorder: {
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    backgroundColor: theme.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  todayRing: {
    width: TODAY_RING,
    height: TODAY_RING,
    borderRadius: TODAY_RING / 2,
    borderWidth: 2,
    borderColor: theme.primary,
    backgroundColor: "transparent",
  },
  dotEmpty: {
    width: DOT_EMPTY,
    height: DOT_EMPTY,
    borderRadius: DOT_EMPTY / 2,
    backgroundColor: theme.textMuted,
    opacity: 0.4,
  },

  /* ---- Right column ---- */
  rightCol: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 10,
    paddingRight: 12,
  },
  recordRightCol: { paddingVertical: 12, borderRadius: 8 },
  gapRightCol: { paddingVertical: 8 },
  todayRightCol: { paddingVertical: 12 },
  rightColPressed: { backgroundColor: theme.bgHover },

  todayHint: {
    fontSize: 14,
    color: theme.textMuted,
    fontStyle: "italic",
  },

  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 },
  pill: {
    backgroundColor: theme.pillBg,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  pillText: { fontSize: 13, color: theme.pillText, maxWidth: 80 },
  pillExtra: { backgroundColor: theme.bgSecondary },
  pillExtraText: { fontSize: 12, color: theme.textMuted, fontWeight: "500" },

  chevron: {
    fontSize: 18,
    color: theme.textMuted,
    marginLeft: 4,
    transform: [{ rotate: "0deg" }],
  },
  chevronOpen: { transform: [{ rotate: "90deg" }] },

  gapText: { fontSize: 14, color: theme.textMuted, fontStyle: "italic" },

  /* ---- Inline entry rows (expanded) ---- */
  entryOuter: {},
  entryRow: { flexDirection: "row", minHeight: 46 },

  entryLeftCol: {
    width: LEFT_W,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 6,
  },
  entryTime: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.textMuted,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.2,
  },

  entryLineTop: { width: LINE_W, flex: 2, backgroundColor: theme.border },
  entryDot: {
    width: DOT_ENTRY,
    height: DOT_ENTRY,
    borderRadius: DOT_ENTRY / 2,
    backgroundColor: theme.primaryMuted,
  },

  entryContent: {
    flex: 1,
    justifyContent: "center",
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 6,
  },

  summaryRow: { flexDirection: "row", alignItems: "flex-start" },
  summaryText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: theme.text,
    letterSpacing: -0.1,
  },

  ellipsisBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
    marginTop: -1,
  },
  ellipsis: {
    fontSize: 16,
    color: theme.textMuted,
    opacity: 0.4,
    fontWeight: "600",
    letterSpacing: 1,
  },

  /* ---- Popover menu ---- */
  menuWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 10,
    paddingVertical: 4,
    gap: 0,
  },
  menuItem: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 },
  menuText: { fontSize: 13, fontWeight: "500", color: theme.textSecondary },
  menuTextDanger: { color: "#C0392B" },
  menuDivider: { width: 1, height: 14, backgroundColor: theme.border },

  /* ---- Inline edit ---- */
  editWrap: { paddingLeft: 10, paddingRight: 8, paddingVertical: 6, flex: 1 },
  editInput: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.text,
    borderBottomWidth: 1,
    borderBottomColor: theme.primaryMuted,
    paddingBottom: 6,
    paddingTop: 0,
    minHeight: 28,
  },
  editActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 },
  editBtnCancel: { fontSize: 13, fontWeight: "500", color: theme.textSecondary },
  editBtnSave: { backgroundColor: theme.primary },
  editBtnSaveText: { fontSize: 13, fontWeight: "600", color: "#fff" },
});
