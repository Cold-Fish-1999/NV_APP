import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  Animated,
  LayoutAnimation,
  UIManager,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { useAuth } from "@/contexts/auth";
import { useSubscription } from "@/contexts/subscription";
import { transcribeAudio, generateSymptomMeta } from "@/lib/api";
import {
  createSymptomSummary,
  addUserKeywordPreset,
  deleteUserKeywordPreset,
  initUserKeywordPresetsIfEmpty,
  DEFAULT_PRESET_KEYWORDS,
} from "@/lib/calendarService";
import { calendarTheme as theme } from "@/lib/calendarTheme";
import { toLocalDateStr } from "@/lib/dateUtils";

const MAX_DAYS_AGO = 7;
const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/* ------------------------------------------------------------------ */
/*  Date & hour list builders                                          */
/* ------------------------------------------------------------------ */

interface DateItem { label: string; localDate: string }

function buildDates(): DateItem[] {
  const out: DateItem[] = [];
  for (let off = 0; off < MAX_DAYS_AGO; off++) {
    const d = new Date();
    d.setDate(d.getDate() - off);
    const label =
      off === 0 ? "Today" : off === 1 ? "Yesterday" : `${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`;
    out.push({ label, localDate: toLocalDateStr(d) });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Compact iOS-style wheel picker                                     */
/* ------------------------------------------------------------------ */

const SLOT_H = 26;
const VIS = 3;
const WHEEL_H = SLOT_H * VIS;
const WHEEL_PAD = SLOT_H;
const LOOP_COPIES = 5;

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

function WheelItem({ label, scrollY, idx }: { label: string; scrollY: Animated.Value; idx: number }) {
  const center = idx * SLOT_H;
  const dist = Animated.subtract(scrollY, center);
  const opacity = dist.interpolate({
    inputRange: [-SLOT_H * 1.5, -SLOT_H * 0.5, 0, SLOT_H * 0.5, SLOT_H * 1.5],
    outputRange: [0, 0.35, 1, 0.35, 0],
    extrapolate: "clamp",
  });
  const scale = dist.interpolate({
    inputRange: [-SLOT_H * 1.5, 0, SLOT_H * 1.5],
    outputRange: [0.82, 1, 0.82],
    extrapolate: "clamp",
  });
  const rotateX = dist.interpolate({
    inputRange: [-SLOT_H * 1.5, 0, SLOT_H * 1.5],
    outputRange: ["55deg", "0deg", "-55deg"],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      style={[whl.item, { opacity, transform: [{ perspective: 500 }, { rotateX }, { scale }] }]}
    >
      <Text style={whl.txt}>{label}</Text>
    </Animated.View>
  );
}

function WheelPicker({
  items, index, onChange, loop = false,
}: {
  items: string[]; index: number; onChange: (i: number) => void; loop?: boolean;
}) {
  const n = items.length;
  const display = useMemo(
    () => (loop ? Array.from({ length: n * LOOP_COPIES }, (_, i) => items[i % n]) : items),
    [items, loop, n],
  );
  const loopOff = loop ? n * Math.floor(LOOP_COPIES / 2) : 0;
  const initIdx = loopOff + index;
  const ref = useRef<ScrollView>(null);
  const mounted = useRef(false);
  const scrollY = useRef(new Animated.Value(initIdx * SLOT_H)).current;
  const lastIdx = useRef(initIdx);

  useEffect(() => {
    if (!mounted.current) {
      setTimeout(() => ref.current?.scrollTo({ y: initIdx * SLOT_H, animated: false }), 40);
      mounted.current = true;
    }
  }, [initIdx]);

  useEffect(() => {
    if (mounted.current) {
      const target = loopOff + index;
      if (target !== lastIdx.current) {
        lastIdx.current = target;
        ref.current?.scrollTo({ y: target * SLOT_H, animated: true });
      }
    }
  }, [index, loopOff]);

  const settle = useCallback(
    (e: any) => {
      const raw = Math.round(e.nativeEvent.contentOffset.y / SLOT_H);
      if (loop) {
        const norm = ((raw % n) + n) % n;
        const mid = n * Math.floor(LOOP_COPIES / 2) + norm;
        if (raw < n || raw >= n * (LOOP_COPIES - 1)) {
          lastIdx.current = mid;
          ref.current?.scrollTo({ y: mid * SLOT_H, animated: false });
        }
        onChange(norm);
      } else {
        const c = Math.max(0, Math.min(raw, n - 1));
        lastIdx.current = c;
        onChange(c);
      }
    },
    [n, onChange, loop],
  );

  return (
    <View style={whl.wrap}>
      <View style={whl.lineTop} pointerEvents="none" />
      <View style={whl.lineBot} pointerEvents="none" />
      <AnimatedScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={SLOT_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: WHEEL_PAD }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
        nestedScrollEnabled
      >
        {display.map((label, i) => (
          <WheelItem key={i} label={label} scrollY={scrollY} idx={i} />
        ))}
      </AnimatedScrollView>
    </View>
  );
}

const whl = StyleSheet.create({
  wrap: { flex: 1, height: WHEEL_H, overflow: "hidden" },
  lineTop: {
    position: "absolute", top: WHEEL_PAD, left: 2, right: 2,
    height: StyleSheet.hairlineWidth, backgroundColor: theme.border, zIndex: 10, opacity: 0.45,
  },
  lineBot: {
    position: "absolute", top: WHEEL_PAD + SLOT_H, left: 2, right: 2,
    height: StyleSheet.hairlineWidth, backgroundColor: theme.border, zIndex: 10, opacity: 0.45,
  },
  item: { height: SLOT_H, justifyContent: "center", alignItems: "center" },
  txt: { fontSize: 13, color: theme.text, fontWeight: "500", fontVariant: ["tabular-nums"] },
});

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface AddSymptomFabProps {
  onCreated: () => void;
  initialDate?: string;
}

const FLOAT_TAB_H = 52;

export function AddSymptomFab({ onCreated, initialDate }: AddSymptomFabProps) {
  const { session } = useAuth();
  const { status: sub } = useSubscription();
  const insets = useSafeAreaInsets();
  const tabBottom = insets.bottom > 0 ? insets.bottom - 12 : 12;
  const fabBottom = tabBottom + FLOAT_TAB_H + 16;
  const cardBottom = fabBottom + FAB_SIZE + 10;

  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dateIndex, setDateIndex] = useState(0);
  const [hourIndex, setHourIndex] = useState(0);
  const [content, setContent] = useState("");
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [inputOpen, setInputOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [presetKeywords, setPresetKeywords] = useState<string[]>(DEFAULT_PRESET_KEYWORDS);
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const [recording, setRecording] = useState<Awaited<ReturnType<typeof Audio.Recording.createAsync>>["recording"] | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  const inputWidthAnim = useRef(new Animated.Value(0)).current;
  const inputOpacityAnim = useRef(new Animated.Value(0)).current;
  const customInputRef = useRef<TextInput>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentInputRef = useRef<TextInput>(null);
  const cardAnim = useRef(new Animated.Value(400)).current;

  const dates = useMemo(() => (expanded ? buildDates() : []), [expanded]);
  const allHours = useMemo(() => {
    const out: string[] = [];
    for (let h = 0; h <= 23; h++) out.push(`${h.toString().padStart(2, "0")}:00`);
    return out;
  }, []);

  const selectedDateLabel = dates[dateIndex]?.label ?? "Today";
  const selectedHourLabel = allHours[hourIndex] ?? `${new Date().getHours().toString().padStart(2, "0")}:00`;

  const onDateChange = useCallback((i: number) => { setDateIndex(i); }, []);

  const togglePicker = useCallback(() => {
    LayoutAnimation.configureNext({
      duration: 250,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
    setPickerOpen((p) => !p);
  }, []);

  const toggleKeyword = useCallback((kw: string) => {
    setSelectedKeywords((prev) =>
      prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw],
    );
  }, []);

  /* ---- presets ---- */
  const loadPresets = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const list = await initUserKeywordPresetsIfEmpty(session.user.id);
      setPresetKeywords(list);
    } catch {
      setPresetKeywords(DEFAULT_PRESET_KEYWORDS);
    } finally {
      setPresetsLoaded(true);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (session?.user?.id && expanded && !presetsLoaded) loadPresets();
  }, [session?.user?.id, expanded, presetsLoaded, loadPresets]);

  /* ---- open / close ---- */
  const openForm = useCallback(() => {
    Keyboard.dismiss();
    setPresetsLoaded(false);
    setContent("");
    setSelectedKeywords([]);
    setInputOpen(false);
    setCustomInput("");
    setPickerOpen(false);

    let startDateIdx = 0;
    if (initialDate) {
      const freshDates = buildDates();
      const found = freshDates.findIndex((d) => d.localDate === initialDate);
      if (found >= 0) startDateIdx = found;
    }
    setDateIndex(startDateIdx);
    setHourIndex(new Date().getHours());

    cardAnim.setValue(400);
    setExpanded(true);
    requestAnimationFrame(() => {
      Animated.spring(cardAnim, {
        toValue: 0, damping: 24, stiffness: 220, useNativeDriver: true,
      }).start();
    });
  }, [initialDate, cardAnim]);

  const closeForm = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(cardAnim, {
      toValue: 400, duration: 160, useNativeDriver: true,
    }).start(() => setExpanded(false));
  }, [cardAnim]);

  /* ---- keywords ---- */
  const addKeyword = useCallback((kw: string) => {
    const k = kw.trim();
    if (!k) return;
    setSelectedKeywords((p) => (p.includes(k) ? p : [...p, k]));
  }, []);

  const removeKeyword = useCallback((kw: string) => {
    setSelectedKeywords((p) => p.filter((k) => k !== kw));
  }, []);

  const removePresetKeyword = useCallback(
    async (kw: string) => {
      if (!session?.user?.id) return;
      Alert.alert("Remove preset", `Remove "${kw}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove", style: "destructive",
          onPress: async () => {
            try {
              await deleteUserKeywordPreset(session.user!.id, kw);
              setPresetKeywords((p) => p.filter((k) => k !== kw));
              removeKeyword(kw);
            } catch (e) {
              Alert.alert("Failed", e instanceof Error ? e.message : String(e));
            }
          },
        },
      ]);
    },
    [session?.user?.id, removeKeyword],
  );

  const openCustomInput = useCallback(() => {
    setInputOpen(true);
    Animated.parallel([
      Animated.timing(inputWidthAnim, { toValue: 100, duration: 200, useNativeDriver: false }),
      Animated.timing(inputOpacityAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
    ]).start(() => customInputRef.current?.focus());
  }, [inputWidthAnim, inputOpacityAnim]);

  const closeCustomInput = useCallback(() => {
    if (blurTimeoutRef.current) { clearTimeout(blurTimeoutRef.current); blurTimeoutRef.current = null; }
    setInputOpen(false);
    setCustomInput("");
    Animated.parallel([
      Animated.timing(inputWidthAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
      Animated.timing(inputOpacityAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start();
    Keyboard.dismiss();
  }, [inputWidthAnim, inputOpacityAnim]);

  const confirmCustomInput = useCallback(async () => {
    if (blurTimeoutRef.current) { clearTimeout(blurTimeoutRef.current); blurTimeoutRef.current = null; }
    const kw = customInput.trim();
    if (!kw) { closeCustomInput(); return; }
    addKeyword(kw);
    closeCustomInput();
    if (session?.user?.id) {
      try {
        await addUserKeywordPreset(session.user.id, kw);
        setPresetKeywords((p) => (p.includes(kw) ? p : [...p, kw]));
      } catch { /* already added */ }
    }
  }, [customInput, addKeyword, closeCustomInput, session?.user?.id]);

  const handleCustomInputBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(closeCustomInput, 150);
  }, [closeCustomInput]);

  /* ---- recording ---- */
  const startRecording = useCallback(async () => {
    if (recording || transcribing) return;
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) { Alert.alert("Microphone access required"); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const created = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(created.recording);
    } catch (e) {
      Alert.alert("Recording failed", e instanceof Error ? e.message : String(e));
    }
  }, [recording, transcribing]);

  const stopRecordingAndTranscribe = useCallback(async () => {
    if (!recording || transcribing) return;
    setTranscribing(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) throw new Error("Recording file missing");
      const { text } = await transcribeAudio(uri, session?.access_token);
      const t = text.trim();
      if (t) setContent((p) => (p.trim() ? `${p.trim()} ${t}` : t));
      else Alert.alert("Notice", "No speech recognized.");
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : String(e));
    } finally {
      setTranscribing(false);
    }
  }, [recording, transcribing, session?.access_token]);

  useEffect(() => {
    return () => { recording?.stopAndUnloadAsync().catch(() => {}); };
  }, [recording]);

  /* ---- submit ---- */
  const handleSubmit = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed) { Alert.alert("Notice", "Please enter the content."); return; }
    if (!session?.user?.id) return;
    setSubmitting(true);
    try {
      const dateItem = dates[dateIndex] ?? dates[0];
      if (!dateItem) return;
      const hour = hourIndex;

      let kw = selectedKeywords.length > 0 ? selectedKeywords : undefined;
      let sev = "medium";

      if (!kw && sub?.isPro) {
        const auto = await generateSymptomMeta(trimmed, session.access_token);
        if (auto.keywords.length > 0) kw = auto.keywords;
        sev = auto.severity;
      }

      const recordedAt = new Date(
        `${dateItem.localDate}T${hour.toString().padStart(2, "0")}:00:00`,
      ).toISOString();
      await createSymptomSummary(session.user.id, {
        local_date: dateItem.localDate,
        summary: trimmed,
        tags: kw && kw.length > 0 ? ["symptom", ...kw] : ["symptom"],
        symptom_keywords: kw,
        severity: sev,
        recorded_at: recordedAt,
      });
      setExpanded(false);
      setContent("");
      setSelectedKeywords([]);
      onCreated();
    } catch (e) {
      Alert.alert("Record failed", e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [session?.user?.id, session?.access_token, sub?.isPro, dates, dateIndex, hourIndex, content, selectedKeywords, onCreated]);

  const handleFabPress = useCallback(() => {
    if (!expanded) { openForm(); return; }
    if (!content.trim()) {
      Alert.alert("提示", "请先输入症状描述");
      contentInputRef.current?.focus();
      return;
    }
    handleSubmit();
  }, [expanded, openForm, content, handleSubmit]);

  /* ---- render ---- */
  return (
    <>
      {expanded && (
        <>
          <Animated.View
            style={[$.overlay, { opacity: cardAnim.interpolate({ inputRange: [0, 400], outputRange: [1, 0] }) }]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={closeForm} />
          </Animated.View>

          <Animated.View style={[$.cardPos, { bottom: cardBottom, transform: [{ translateY: cardAnim }] }]}>
            <BlurView intensity={40} tint="light" style={$.card}>
              <View style={$.glassShine} pointerEvents="none" />
              <View style={$.glassEdge} pointerEvents="none" />
              {/* ---- timestamp ---- */}
              <TouchableOpacity style={$.meta} onPress={togglePicker} activeOpacity={0.6}>
                <Text style={$.metaText}>{selectedDateLabel} · {selectedHourLabel}</Text>
                <Ionicons name={pickerOpen ? "chevron-up" : "chevron-down"} size={10} color={theme.textMuted} />
              </TouchableOpacity>

              {pickerOpen && dates.length > 0 && (
                <View style={$.wheelRow}>
                  <WheelPicker items={dates.map((d) => d.label)} index={dateIndex} onChange={onDateChange} />
                  <WheelPicker items={allHours} index={hourIndex} onChange={setHourIndex} loop />
                </View>
              )}

              {/* ---- input ---- */}
              <View style={$.inputWrap}>
                <TextInput
                  ref={contentInputRef}
                  style={$.input}
                  value={content}
                  onChangeText={setContent}
                  placeholder="How are you feeling?"
                  placeholderTextColor="#C4BBAE"
                  multiline
                />
                <TouchableOpacity
                  style={$.micBtn}
                  onPressIn={startRecording}
                  onPressOut={stopRecordingAndTranscribe}
                  disabled={transcribing}
                  activeOpacity={0.6}
                >
                  {transcribing ? (
                    <ActivityIndicator size="small" color={theme.textMuted} />
                  ) : (
                    <Ionicons
                      name={recording ? "mic" : "mic-outline"}
                      size={24}
                      color={recording ? theme.primary : theme.textMuted}
                    />
                  )}
                </TouchableOpacity>
              </View>

              {/* ---- divider ---- */}
              <View style={$.divider} />

              {/* ---- tags ---- */}
              <View style={$.tagRow}>
                {presetKeywords.map((kw) => {
                  const sel = selectedKeywords.includes(kw);
                  return (
                    <TouchableOpacity
                      key={kw}
                      style={[$.chip, sel && $.chipOn]}
                      onPress={() => toggleKeyword(kw)}
                      onLongPress={() => removePresetKeyword(kw)}
                      activeOpacity={0.65}
                    >
                      <Text style={[$.chipTxt, sel && $.chipTxtOn]}>{kw}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={[$.chipAdd, inputOpen && $.chipAddOn]}
                  onPress={inputOpen ? undefined : openCustomInput}
                  disabled={inputOpen}
                  activeOpacity={0.65}
                >
                  <Ionicons name="add" size={13} color={inputOpen ? theme.primary : theme.textMuted} />
                </TouchableOpacity>
                <Animated.View style={[$.customWrap, { width: inputWidthAnim, opacity: inputOpacityAnim }]}>
                  <TextInput
                    ref={customInputRef}
                    style={$.customInput}
                    value={customInput}
                    onChangeText={setCustomInput}
                    placeholder="Add tag"
                    placeholderTextColor={theme.textMuted}
                    onSubmitEditing={confirmCustomInput}
                    onBlur={handleCustomInputBlur}
                    returnKeyType="done"
                    blurOnSubmit
                  />
                </Animated.View>
                {inputOpen && (
                  <>
                    <TouchableOpacity style={$.confirmKw} onPress={confirmCustomInput}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={$.cancelKw} onPress={closeCustomInput}>
                      <Ionicons name="close" size={12} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </BlurView>
          </Animated.View>
        </>
      )}

      {/* FAB */}
      <TouchableOpacity style={[$.fab, { bottom: fabBottom }]} onPress={handleFabPress} activeOpacity={0.8}>
        {submitting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name={expanded ? "checkmark" : "add"} size={expanded ? 26 : 24} color="#fff" />
        )}
      </TouchableOpacity>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const FAB_SIZE = 52;

const $ = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 100,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.15)",
    zIndex: 50,
  },

  cardPos: {
    position: "absolute",
    left: 10,
    right: 10,
    maxHeight: "72%",
    zIndex: 60,
  },
  card: {
    borderRadius: 20,
    overflow: "hidden",
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.75)",
    borderLeftColor: "rgba(255,255,255,0.5)",
    borderRightColor: "rgba(255,255,255,0.2)",
    borderBottomColor: "rgba(0,0,0,0.04)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 8,
  },
  glassShine: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  glassEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 19,
    borderWidth: 1,
    borderTopColor: "rgba(255,255,255,0.35)",
    borderLeftColor: "rgba(255,255,255,0.2)",
    borderRightColor: "rgba(255,255,255,0.08)",
    borderBottomColor: "transparent",
  },

  /* ---- timestamp ---- */
  meta: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 3,
    marginBottom: 20,
  },
  metaText: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.textMuted,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.2,
  },

  /* ---- wheels ---- */
  wheelRow: {
    flexDirection: "row",
    height: WHEEL_H,
    marginBottom: 12,
    marginHorizontal: 80,
  },

  /* ---- input ---- */
  inputWrap: {
    position: "relative",
    minHeight: 120,
    marginBottom: 10,
    paddingRight: 32,
  },
  input: {
    fontSize: 16,
    color: theme.text,
    padding: 0,
    lineHeight: 22,
    fontWeight: "400",
    minHeight: 72,
    textAlignVertical: "top" as const,
  },
  micBtn: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },

  /* ---- divider ---- */
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.border,
    marginBottom: 8,
    opacity: 0.4,
  },

  /* ---- tags ---- */
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
    marginBottom: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.015)",
    justifyContent: "center",
    alignItems: "center",
  },
  chipOn: {
    backgroundColor: theme.primaryLight,
  },
  chipTxt: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.textSecondary,
    fontWeight: "400",
  },
  chipTxtOn: {
    color: theme.primary,
    fontWeight: "600",
  },
  chipAdd: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  chipAddOn: { backgroundColor: theme.primaryLight },
  customWrap: { overflow: "hidden" },
  customInput: {
    height: 28,
    width: "100%",
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.04)",
    fontSize: 13,
    lineHeight: 18,
    color: theme.text,
    opacity:0.4,
  },
  confirmKw: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelKw: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
});
