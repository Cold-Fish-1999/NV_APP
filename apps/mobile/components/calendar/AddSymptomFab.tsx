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
  Dimensions,
  Animated,
  LayoutAnimation,
  UIManager,
  Platform,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
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
import { FONT_SANS, FONT_SANS_MEDIUM, FONT_SANS_BOLD } from "@/lib/fonts";
import {
  SYMPTOM_RECORD_CATEGORY_OPTIONS,
  symptomCategoryNeedsKeywords,
  type SymptomRecordCategory,
} from "@/types/calendar";
import { keyboardLiftForCard } from "@/lib/keyboardCardLift";
import {
  computeFabBottom,
  computeCardBottomAboveFab,
  computeFabCardMaxHeight,
  FAB_SIZE_PX,
  FAB_FROM_RIGHT_PX,
  CARD_FROM_LEFT_PX,
  CARD_FROM_RIGHT_PX,
} from "@/lib/fabCardLayout";

const MAX_DAYS_AGO = 7;

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Build the 7 day options: Today, Yesterday, Apr 10, … */
interface DayOption { label: string; date: Date }

function buildDayOptions(): DayOption[] {
  const out: DayOption[] = [];
  const now = new Date();
  for (let i = 0; i < MAX_DAYS_AGO; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const label =
      i === 0 ? "Today" : i === 1 ? "Yesterday" : `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
    out.push({ label, date: d });
  }
  return out;
}

/** Hour labels: "00:00" … "23:00" */
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: i.toString().padStart(2, "0") + ":00",
}));

/** Find which dayOption index matches a Date, fallback 0 (today) */
function dayIndexFromDate(d: Date, days: DayOption[]): number {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const ds = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  const s = ds(d);
  const idx = days.findIndex((o) => ds(o.date) === s);
  return idx >= 0 ? idx : 0;
}

function formatWhenChip(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const timeStr = `${pad(d.getHours())}:00`;
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const ds = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  if (ds(d) === ds(today)) return `Today · ${timeStr}`;
  if (ds(d) === ds(yesterday)) return `Yesterday · ${timeStr}`;
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()} · ${timeStr}`;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface AddSymptomFabProps {
  onCreated: () => void;
  initialDate?: string;
}

export function AddSymptomFab({ onCreated, initialDate }: AddSymptomFabProps) {
  const { session } = useAuth();
  const { status: sub } = useSubscription();
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get("window").height;
  const kbAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        const lift = keyboardLiftForCard(e.endCoordinates.height, insets.bottom);
        Animated.timing(kbAnim, {
          toValue: -lift,
          duration: e.duration ?? 250,
          useNativeDriver: true,
        }).start();
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      (e) => {
        Animated.timing(kbAnim, {
          toValue: 0,
          duration: e.duration ?? 250,
          useNativeDriver: true,
        }).start();
      },
    );
    return () => { show.remove(); hide.remove(); };
  }, [insets.bottom, kbAnim]);

  const fabBottom = computeFabBottom(insets.bottom);
  const cardBottom = computeCardBottomAboveFab(fabBottom);
  const cardMaxH = computeFabCardMaxHeight(fabBottom, insets.top, screenH);

  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [when, setWhen] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d;
  });
  const [recordCategory, setRecordCategory] = useState<SymptomRecordCategory>("symptom_feeling");
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

  const needsKeywordRow = symptomCategoryNeedsKeywords(recordCategory);

  const dayOptions = useMemo(() => buildDayOptions(), []);
  const selectedDay = dayIndexFromDate(when, dayOptions);
  const selectedHour = when.getHours();

  /** Clamp hour if today: can't pick a future hour */
  const maxHourForDay = selectedDay === 0 ? new Date().getHours() : 23;

  const onDayChange = useCallback(
    (idx: number) => {
      setWhen((prev) => {
        const d = new Date(dayOptions[idx].date);
        let h = prev.getHours();
        // clamp hour if switching to today
        if (idx === 0) h = Math.min(h, new Date().getHours());
        d.setHours(h, 0, 0, 0);
        return d;
      });
    },
    [dayOptions],
  );

  const onHourChange = useCallback(
    (hour: number) => {
      setWhen((prev) => {
        const d = new Date(prev);
        d.setHours(hour, 0, 0, 0);
        return d;
      });
    },
    [],
  );

  const contentPlaceholder = useMemo(() => {
    switch (recordCategory) {
      case "medication_supplement":
        return "Medications or supplements (name, dose…)";
      case "diet":
        return "Food or drinks…";
      case "behavior_treatment":
        return "Activity, visit, therapy…";
      default:
        return "How are you feeling?";
    }
  }, [recordCategory]);

  const togglePicker = useCallback(() => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(280, "easeInEaseOut", "opacity"),
    );
    setPickerOpen((prev) => !prev);
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
    setRecordCategory("symptom_feeling");
    setSelectedKeywords([]);
    setInputOpen(false);
    setCustomInput("");
    setPickerOpen(false);

    const now = new Date();
    const w = new Date(now);
    w.setMinutes(0, 0, 0);
    if (initialDate) {
      const [y, m, d] = initialDate.split("-").map(Number);
      if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
        w.setFullYear(y, m - 1, d);
        w.setHours(now.getHours(), 0, 0, 0);
      }
    }
    setWhen(w);

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
    setPickerOpen(false);
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
      const w = when;
      const local_date = toLocalDateStr(w);

      const needsKw = symptomCategoryNeedsKeywords(recordCategory);
      let kw: string[] | undefined =
        needsKw && selectedKeywords.length > 0 ? [...selectedKeywords] : undefined;
      let sev = "medium";

      if (needsKw && (!kw || kw.length === 0) && sub?.isPro) {
        const auto = await generateSymptomMeta(trimmed, session.access_token, {
          category:
            recordCategory === "symptom_feeling" || recordCategory === "medication_supplement"
              ? recordCategory
              : undefined,
        });
        if (auto.keywords.length > 0) kw = auto.keywords;
        sev = auto.severity;
      }

      const tagsForDb = needsKw ? (kw ?? []) : [];
      const symptomKeywordsForMeta = needsKw ? kw?.filter((k) => k.trim()) : undefined;

      const recordedAt = new Date(
        w.getFullYear(),
        w.getMonth(),
        w.getDate(),
        w.getHours(),
        w.getMinutes(),
        w.getSeconds(),
        0,
      ).toISOString();
      await createSymptomSummary(session.user.id, {
        local_date,
        summary: trimmed,
        category: recordCategory,
        tags: tagsForDb,
        symptom_keywords: symptomKeywordsForMeta,
        severity: sev,
        recorded_at: recordedAt,
      });
      setExpanded(false);
      setContent("");
      setSelectedKeywords([]);
      setRecordCategory("symptom_feeling");
      onCreated();
    } catch (e) {
      Alert.alert("Record failed", e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [
    session?.user?.id,
    session?.access_token,
    sub?.isPro,
    when,
    content,
    selectedKeywords,
    recordCategory,
    onCreated,
  ]);

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

          <Animated.View style={[$.cardPos, { bottom: cardBottom, maxHeight: cardMaxH, transform: [{ translateY: cardAnim }, { translateY: kbAnim }] }]}>
            <View style={$.card}>
              <BlurView intensity={72} tint="light" style={StyleSheet.absoluteFill} />
              <View style={$.glassShine} pointerEvents="none" />
              <View style={$.glassFog} pointerEvents="none" />
              <View style={$.glassEdge} pointerEvents="none" />
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={$.cardScrollContent}
              >
                <View style={$.topRow}>
                  <Text style={$.cardTitle} numberOfLines={1}>
                    Add Health Record
                  </Text>
                  <TouchableOpacity style={$.dateChip} onPress={togglePicker} activeOpacity={0.65}>
                    <Text style={$.dateChipText} numberOfLines={1}>
                      {formatWhenChip(when)}
                    </Text>
                    <Ionicons
                      name={pickerOpen ? "chevron-up" : "chevron-down"}
                      size={14}
                      color={theme.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                {pickerOpen ? (
                  <View style={$.pickerRow}>
                    <View style={$.pickerClip}>
                      <Picker
                        selectedValue={selectedDay}
                        onValueChange={(v) => onDayChange(v as number)}
                        style={$.pickerInner}
                        itemStyle={$.pickerItemText}
                      >
                        {dayOptions.map((opt, i) => (
                          <Picker.Item key={i} label={opt.label} value={i} />
                        ))}
                      </Picker>
                    </View>
                    <View style={$.pickerClip}>
                      <Picker
                        selectedValue={selectedHour}
                        onValueChange={(v) => onHourChange(v as number)}
                        style={$.pickerInner}
                        itemStyle={$.pickerItemText}
                      >
                        {HOUR_OPTIONS.map((opt) => (
                          <Picker.Item
                            key={opt.value}
                            label={opt.label}
                            value={opt.value}
                            color={opt.value > maxHourForDay ? "#ccc" : undefined}
                            enabled={opt.value <= maxHourForDay}
                          />
                        ))}
                      </Picker>
                    </View>
                  </View>
                ) : null}

                <Text style={$.sectionLabel}>Record Type</Text>
                <View style={$.categoryGrid}>
                  {SYMPTOM_RECORD_CATEGORY_OPTIONS.map((opt) => {
                    const on = recordCategory === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[$.catChip, on && $.catChipOn]}
                        onPress={() => {
                          setSelectedKeywords([]);
                          setRecordCategory(opt.value);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[$.catChipTxt, on && $.catChipTxtOn]} numberOfLines={2}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* ---- input ---- */}
                <View style={$.inputWrap}>
                  <TextInput
                    ref={contentInputRef}
                    style={$.input}
                    value={content}
                    onChangeText={setContent}
                    placeholder={contentPlaceholder}
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

                {/* ---- keywords (symptom & medication only) ---- */}
                {needsKeywordRow ? (
                  <>
                    {sub?.isPro ? (
                      <Text style={$.autoKwHint}>Prime/Pro: leave keywords empty to auto-generate.</Text>
                    ) : null}
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
                  </>
                ) : (
                  <Text style={$.keywordSkipHint}>
                    No keywords for this type — timeline uses your note only.
                  </Text>
                )}
              </ScrollView>
            </View>
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

const $ = StyleSheet.create({
  fab: {
    position: "absolute",
    right: FAB_FROM_RIGHT_PX,
    width: FAB_SIZE_PX,
    height: FAB_SIZE_PX,
    borderRadius: FAB_SIZE_PX / 2,
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
    left: CARD_FROM_LEFT_PX,
    right: CARD_FROM_RIGHT_PX,
    zIndex: 60,
  },
  card: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.5)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 8,
  },
  cardScrollContent: {
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 14,
  },
  glassShine: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.52)",
    borderRadius: 20,
  },
  glassFog: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  glassEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    borderWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.6)",
    borderLeftColor: "rgba(255,255,255,0.3)",
    borderRightColor: "rgba(255,255,255,0.1)",
    borderBottomColor: "rgba(255,255,255,0.05)",
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: theme.text,
    fontFamily: FONT_SANS_BOLD,
  },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "58%",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.06)",
  },
  dateChipText: {
    flexShrink: 1,
    fontSize: 12,
    color: theme.text,
    fontFamily: FONT_SANS_MEDIUM,
    fontVariant: ["tabular-nums"],
  },
  pickerRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
    marginBottom: 8,
  },
  pickerClip: {
    height: 105,
    overflow: "hidden",
  },
  pickerInner: {
    width: 130,
    height: 216,
    marginTop: -55,
  },
  pickerItemText: {
    fontSize: 14,
    fontFamily: FONT_SANS_MEDIUM,
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.textSecondary,
    marginBottom: 6,
    fontFamily: FONT_SANS_MEDIUM,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
    justifyContent: "space-between",
  },
  catChip: {
    width: "48%",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  catChipOn: {
    backgroundColor: theme.primaryLight,
  },
  catChipTxt: {
    fontSize: 11,
    fontFamily: FONT_SANS_MEDIUM,
    color: theme.textSecondary,
    lineHeight: 14,
  },
  catChipTxtOn: {
    color: theme.primary,
    fontFamily: FONT_SANS_BOLD,
  },
  keywordSkipHint: {
    fontSize: 12,
    color: theme.textMuted,
    fontFamily: FONT_SANS,
    marginBottom: 8,
    lineHeight: 17,
  },
  autoKwHint: {
    fontSize: 11,
    color: theme.textMuted,
    fontFamily: FONT_SANS,
    marginBottom: 6,
    lineHeight: 15,
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
    fontFamily: FONT_SANS,
    color: theme.textSecondary,
    fontWeight: "400",
  },
  chipTxtOn: {
    fontFamily: FONT_SANS_BOLD,
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
