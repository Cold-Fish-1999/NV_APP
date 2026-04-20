import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  LayoutAnimation,
  UIManager,
  Platform,
  Alert,
  TextInput,
  Keyboard,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { calendarTheme as theme, severityColors } from "@/lib/calendarTheme";
import { formatWeekday, formatTime, toLocalDateStr } from "@/lib/dateUtils";
import { fontSerif, FONT_SANS, FONT_SANS_MEDIUM, FONT_SANS_BOLD } from "@/lib/fonts";
import Svg, { Path, Circle } from "react-native-svg";
import { fetchDayWeather, weatherCodeToLabel, type DayWeather } from "@/lib/weatherApi";
import { useUserLocation } from "@/lib/useUserLocation";
import type { DayAggregated } from "@/lib/calendarService";
import { generateSymptomMeta } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { useSubscription } from "@/contexts/subscription";
import {
  symptomCategoryNeedsKeywords,
  getKeywordsFromEntry,
  type SymptomEntry,
} from "@/types/calendar";

function WeatherIcon({ code, size = 18, color = "#9A9A9A" }: { code: number; size?: number; color?: string }) {
  const s = size;
  const sw = 1.5;
  if (code === 0) {
    // Clear — sun
    return (
      <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth={sw} />
        <Path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      </Svg>
    );
  }
  if (code <= 3) {
    // Cloudy
    return (
      <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <Path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  if (code <= 49) {
    // Foggy
    return (
      <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <Path d="M4 14h16M4 18h12M6 10h12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      </Svg>
    );
  }
  if (code <= 69) {
    // Rain
    return (
      <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <Path d="M16 13V7a4 4 0 0 0-8 0v1H6a3 3 0 0 0 0 6h10a3 3 0 0 0 0-6z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M8 19v2M12 19v2M16 19v2" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      </Svg>
    );
  }
  if (code <= 79) {
    // Snow
    return (
      <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <Path d="M16 13V7a4 4 0 0 0-8 0v1H6a3 3 0 0 0 0 6h10a3 3 0 0 0 0-6z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx="8" cy="20" r="1" fill={color} />
        <Circle cx="12" cy="20" r="1" fill={color} />
        <Circle cx="16" cy="20" r="1" fill={color} />
      </Svg>
    );
  }
  // Showers / Thunderstorm / default — cloud
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13 16l-2 4h4l-2 4" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

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

const MAX_INLINE_TAGS = 5;

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
  onUpdate: (
    id: string,
    s: string,
    keywords?: string[] | null,
    severity?: string,
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { session } = useAuth();
  const { status: sub } = useSubscription();
  const needsKw = symptomCategoryNeedsKeywords(entry.category);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.summary);
  const [draftKeywords, setDraftKeywords] = useState<string[]>(() => getKeywordsFromEntry(entry));
  const [customTag, setCustomTag] = useState("");
  const [tagAddOpen, setTagAddOpen] = useState(false);
  const tagInputRef = useRef<TextInput>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) return;
    setDraft(entry.summary);
    setDraftKeywords(getKeywordsFromEntry(entry));
    setTagAddOpen(false);
    setCustomTag("");
  }, [entry, editing]);

  useEffect(() => {
    if (!tagAddOpen) return;
    const id = requestAnimationFrame(() => tagInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [tagAddOpen]);

  const displayTags = getKeywordsFromEntry(entry);

  const removeDraftKeyword = (k: string) => {
    setDraftKeywords((prev) => prev.filter((x) => x !== k));
  };

  const closeTagAddBar = useCallback(() => {
    setTagAddOpen(false);
    setCustomTag("");
    Keyboard.dismiss();
  }, []);

  const confirmTagAdd = useCallback(() => {
    const t = customTag.trim();
    if (!t) {
      closeTagAddBar();
      return;
    }
    const lower = t.toLowerCase();
    setDraftKeywords((prev) => {
      if (prev.some((x) => x.toLowerCase() === lower)) return prev;
      return [...prev, t];
    });
    setCustomTag("");
    setTagAddOpen(false);
    Keyboard.dismiss();
  }, [customTag, closeTagAddBar]);

  const hideBottomLine = isLastEntry && isLastItem;

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      Alert.alert("Notice", "Content cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      let kwList: string[] | undefined = needsKw ? [...draftKeywords] : undefined;
      let severityOut: string | undefined = undefined;
      if (needsKw && draftKeywords.length === 0 && sub?.isPro) {
        const auto = await generateSymptomMeta(trimmed, session?.access_token ?? null, {
          category:
            entry.category === "symptom_feeling" || entry.category === "medication_supplement"
              ? entry.category
              : undefined,
        });
        if (auto.keywords.length > 0) {
          kwList = auto.keywords;
          severityOut = auto.severity;
        }
      }
      await onUpdate(entry.id, trimmed, kwList, severityOut);
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
                style={[styles.editInput, { fontFamily: fontSerif(draft) }]}
                value={draft}
                onChangeText={setDraft}
                multiline
                autoFocus
                placeholderTextColor={theme.textMuted}
                textAlignVertical="top"
              />
              {needsKw ? (
                <View style={styles.kwEditBlock}>
                  <Text style={styles.kwEditHint}>Keywords</Text>
                  <View style={styles.kwTagRow}>
                    {draftKeywords.map((tag) => {
                      const sc = entry.severity ? severityColors[entry.severity] : undefined;
                      return (
                        <View
                          key={tag}
                          style={[styles.kwChipRemovable, sc && { backgroundColor: sc.bg }]}
                        >
                          <Text
                            style={[styles.kwChipRemovableTxt, sc && { color: sc.text }]}
                            numberOfLines={1}
                          >
                            {tag}
                          </Text>
                          <Pressable
                            onPress={() => removeDraftKeyword(tag)}
                            hitSlop={10}
                            style={styles.kwChipCloseHit}
                          >
                            <Ionicons name="close" size={13} color={sc?.text ?? theme.textSecondary} />
                          </Pressable>
                        </View>
                      );
                    })}
                    <TouchableOpacity
                      style={[styles.kwChipAdd, tagAddOpen && styles.kwChipAddOn]}
                      onPress={() => {
                        if (!tagAddOpen) setTagAddOpen(true);
                      }}
                      disabled={tagAddOpen}
                      activeOpacity={0.65}
                    >
                      <Ionicons
                        name="add"
                        size={15}
                        color={tagAddOpen ? theme.primary : theme.textMuted}
                      />
                    </TouchableOpacity>
                    {tagAddOpen ? (
                      <>
                        <TextInput
                          ref={tagInputRef}
                          style={styles.kwCustomInput}
                          value={customTag}
                          onChangeText={setCustomTag}
                          placeholder="Add tag"
                          placeholderTextColor={theme.textMuted}
                          onSubmitEditing={confirmTagAdd}
                          returnKeyType="done"
                          blurOnSubmit={false}
                          textAlignVertical="center"
                        />
                        <TouchableOpacity style={styles.kwConfirmKw} onPress={confirmTagAdd} activeOpacity={0.7}>
                          <Ionicons name="checkmark" size={14} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.kwCancelKw} onPress={closeTagAddBar} activeOpacity={0.7}>
                          <Ionicons name="close" size={14} color={theme.textSecondary} />
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </View>
                </View>
              ) : null}
              <View style={styles.editActions}>
                <Pressable
                  onPress={() => {
                    setEditing(false);
                    setDraft(entry.summary);
                    setDraftKeywords(getKeywordsFromEntry(entry));
                    setCustomTag("");
                    setTagAddOpen(false);
                    Keyboard.dismiss();
                  }}
                  disabled={saving}
                  style={[styles.menuItem, saving && { opacity: 0.5 }]}
                >
                  <Text style={styles.menuText}>Cancel</Text>
                </Pressable>
                <View style={styles.menuDivider} />
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={[styles.menuItem, saving && { opacity: 0.5 }]}
                >
                  <Text style={[styles.menuText, styles.editSaveMenuText]}>
                    {saving ? "…" : "Save"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryText, { fontFamily: fontSerif(entry.summary) }]}>{entry.summary}</Text>
                <Pressable
                  onPress={() => setMenuOpen((p) => !p)}
                  hitSlop={12}
                  style={styles.ellipsisBtn}
                >
                  <Text style={styles.ellipsis}>⋯</Text>
                </Pressable>
              </View>
              {displayTags.length > 0 ? (
                <View style={styles.entryTagsRow}>
                  {displayTags.map((tag) => {
                    const sc = entry.severity ? severityColors[entry.severity] : undefined;
                    return (
                      <View key={tag} style={[styles.pill, sc && { backgroundColor: sc.bg }]}>
                        <Text style={[styles.pillText, sc && { color: sc.text }]} numberOfLines={1}>{tag}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
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
              onPress={() => {
                setEditing(true);
                setMenuOpen(false);
                setDraft(entry.summary);
                setDraftKeywords(getKeywordsFromEntry(entry));
                setCustomTag("");
                setTagAddOpen(false);
              }}
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
  onUpdateEntry: (
    entryId: string,
    nextSummary: string,
    keywords?: string[] | null,
    severity?: string,
  ) => Promise<void>;
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
  const [weatherCache, setWeatherCache] = useState<Record<string, DayWeather | null>>({});
  const [weatherLoading, setWeatherLoading] = useState<string | null>(null);
  const userCoords = useUserLocation();
  const fetchedRef = useRef<Set<string>>(new Set());
  const todayStr = useMemo(() => toLocalDateStr(), []);
  const items = useMemo(() => buildItems(days, todayStr), [days, todayStr]);

  useEffect(() => {
    if (!expandedDate || fetchedRef.current.has(expandedDate)) return;
    fetchedRef.current.add(expandedDate);
    setWeatherLoading(expandedDate);
    const dateToFetch = expandedDate;
    fetchDayWeather(dateToFetch, userCoords).then((w) => {
      console.log("[weather]", dateToFetch, "coords:", userCoords, "result:", w ? `${w.tempMin}-${w.tempMax}°` : "null");
      setWeatherCache((prev) => ({ ...prev, [dateToFetch]: w }));
      setWeatherLoading((prev) => (prev === dateToFetch ? null : prev));
    });
  }, [expandedDate, userCoords]);

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

              {/* Right: tags (if has entries, hidden when expanded) or empty today hint */}
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
                  {!isOpen ? (
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
                  ) : (
                    <View style={styles.weatherRow}>
                      {weatherLoading === day.date || !(day.date in weatherCache) ? (
                        <ActivityIndicator size="small" color={theme.textMuted} />
                      ) : weatherCache[day.date] ? (
                        <>
                          <WeatherIcon code={weatherCache[day.date]!.weatherCode} size={18} color="#9A9A9A" />
                          <Text style={styles.weatherTemp}>
                            {Math.round(weatherCache[day.date]!.tempMin)}° – {Math.round(weatherCache[day.date]!.tempMax)}°
                          </Text>
                          {weatherCache[day.date]!.city ? (
                            <Text style={styles.weatherCity}>{weatherCache[day.date]!.city}</Text>
                          ) : null}
                        </>
                      ) : (
                        <Text style={styles.weatherCity}>Weather unavailable</Text>
                      )}
                    </View>
                  )}
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
    fontFamily: FONT_SANS_BOLD,
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
    fontFamily: FONT_SANS_BOLD,
    color: theme.text,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  weekday: {
    fontSize: 12,
    fontFamily: FONT_SANS,
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
    fontFamily: FONT_SANS,
    color: theme.textMuted,
    fontStyle: "italic",
  },

  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1, maxHeight: 56, overflow: "hidden" as const },
  pill: {
    backgroundColor: theme.pillBg,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  pillText: { fontSize: 13, fontFamily: FONT_SANS, color: theme.pillText, maxWidth: 120 },
  weatherRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  weatherTemp: { fontSize: 13, fontFamily: FONT_SANS, color: theme.text},
  weatherCity: { fontSize: 13, fontFamily: FONT_SANS, color: theme.textMuted },
  entryTagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 6 },
  pillExtra: { backgroundColor: theme.bgSecondary },
  pillExtraText: { fontSize: 13, fontFamily: FONT_SANS_MEDIUM, color: theme.textMuted, fontWeight: "500" },

  chevron: {
    fontSize: 18,
    fontFamily: FONT_SANS,
    color: theme.textMuted,
    marginLeft: 4,
    transform: [{ rotate: "0deg" }],
  },
  chevronOpen: { transform: [{ rotate: "90deg" }] },

  gapText: { fontSize: 14, fontFamily: FONT_SANS, color: theme.textMuted, fontStyle: "italic" },

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
    fontFamily: FONT_SANS_MEDIUM,
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
    fontFamily: FONT_SANS_BOLD,
    color: theme.textMuted,
    opacity: 0.4,
    fontWeight: "600",
    letterSpacing: 1,
  },

  /* ---- Popover menu（Edit/Delete）与编辑态 Cancel/Save 共用字号与右对齐 ---- */
  menuWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 4,
    gap: 0,
  },
  menuItem: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 },
  menuText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    fontFamily: FONT_SANS_MEDIUM,
    color: theme.textSecondary,
  },
  menuTextDanger: { color: "#C0392B" },
  menuDivider: { width: 1, height: 16, backgroundColor: theme.border },

  /* ---- Inline edit：编辑态正文比列表略大 ---- */
  editWrap: { paddingLeft: 10, paddingRight: 8, paddingVertical: 6, flex: 1 },
  editInput: {
    fontSize: 16,
    lineHeight: 25,
    fontFamily: FONT_SANS,
    color: theme.text,
    letterSpacing: -0.1,
    fontWeight: "400",
    borderBottomWidth: 1,
    borderBottomColor: theme.primaryMuted,
    paddingBottom: 4,
    paddingTop: 0,
    /** 单行时与下划线对齐；多行会随内容增高 */
    minHeight: 34,
  },
  /** 与 ⋯ 菜单里 Edit / Delete 同系文字按钮 */
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
  },
  editSaveMenuText: {
    color: theme.primary,
  },

  kwEditBlock: { marginTop: 10 },
  kwEditHint: {
    fontSize: 11,
    fontFamily: FONT_SANS_MEDIUM,
    color: theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 16,
  },
  /** 与 Add Health Record 的 tag 行一致：flexWrap + 底部加词条 */
  kwTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  /** 胶囊高度与 Add tag 输入框 kwCustomInput.height 对齐 */
  kwChipRemovable: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "100%",
    height: 32,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 0,
    borderRadius: 16,
    backgroundColor: theme.primaryLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.06)",
  },
  kwChipRemovableTxt: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FONT_SANS,
    fontWeight: "400",
    letterSpacing: -0.1,
    color: theme.text,
  },
  kwChipCloseHit: {
    paddingLeft: 4,
    paddingVertical: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  kwChipAdd: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  kwChipAddOn: {
    backgroundColor: theme.primaryLight,
  },
  kwCustomInput: {
    height: 32,
    maxWidth: 194,
    minWidth: 144,
    flexGrow: 0,
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.04)",
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FONT_SANS,
    color: theme.text,
  },
  kwConfirmKw: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  kwCancelKw: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
});
