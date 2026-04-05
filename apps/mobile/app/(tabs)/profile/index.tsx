import { useState, useEffect, useCallback, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@/components/SharedHeader";
import { fontSerif, FONT_SANS, FONT_SANS_MEDIUM, FONT_SANS_BOLD } from "@/lib/fonts";
import { useAuth } from "@/contexts/auth";
import { useSubscription } from "@/contexts/subscription";
import { supabase } from "@/lib/supabase";
import {
  fetchHealthProfile,
  fetchUserDocumentContext,
  upsertHealthProfile,
  deriveProfileDisplayFromSurvey,
  fetchLatestHealthSummaries,
  fetchWeeklySnapshots,
  PROFILE_DISPLAY_KEYS,
  HEALTH_SUMMARY_LEVELS,
  type HealthProfile,
  type UserDocumentContext,
  type ProfileDisplay,
  type ProfileDisplayKey,
  type HealthSummary,
  type HealthSummaryLevel,
} from "@/lib/profileService";
import { getOnboardingSurvey } from "@/app/onboarding";
import type { OnboardingSurvey } from "@/lib/onboardingInsight";

const PROFILE_FIELD_LABELS: Record<ProfileDisplayKey, string> = {
  age_range: "Age",
  gender: "Gender",
  occupation: "Job",
  smoking: "Smoking",
  alcohol: "Alcohol",
  health_concerns: "Health concerns",
  chronic_conditions: "Chronic conditions",
  family_history: "Family history",
  medications: "Medications & supplements",
  activity_level: "Activity",
  sleep_quality: "Sleep",
};

const SUMMARY_LEVEL_LABELS: Record<HealthSummaryLevel, string> = {
  rolling_weekly: "Rolling Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly (3 mo)",
  biannual: "Biannual (6 mo)",
};

function getDefaultDisplay(): ProfileDisplay {
  return Object.fromEntries(PROFILE_DISPLAY_KEYS.map((k) => [k, ""])) as ProfileDisplay;
}

type GroupType = "basic" | "lifestyle" | "health";
const PROFILE_GROUPS: { key: string; title: string; fields: ProfileDisplayKey[]; type: GroupType }[] = [
  { key: "basic", title: "BASIC", fields: ["age_range", "gender", "occupation"], type: "basic" },
  { key: "lifestyle", title: "LIFESTYLE", fields: ["smoking", "alcohol", "activity_level", "sleep_quality"], type: "lifestyle" },
  { key: "health", title: "HEALTH", fields: ["health_concerns", "chronic_conditions", "medications", "family_history"], type: "health" },
];

const BASIC_OPTIONS: Partial<Record<ProfileDisplayKey, string[]>> = {
  age_range: ["13-18", "18-25", "25-35", "35-45", "45-60", "60-75", "75+"],
  gender: ["Male", "Female", "Other"],
};

const LIFESTYLE_OPTIONS: Partial<Record<ProfileDisplayKey, string[]>> = {
  smoking: ["Never", "Occasionally", "Regularly"],
  alcohol: ["Rarely", "Occasionally", "Regularly"],
  activity_level: ["Rarely", "Occasionally", "Regularly"],
  sleep_quality: ["Good", "Fair", "Poor"],
};

function parseTags(val: string | undefined): string[] {
  return (val ?? "").split(/[,、]/).map((s) => s.trim()).filter(Boolean);
}

const LIFESTYLE_COMPAT: Record<string, string> = {
  "Mostly sedentary": "Rarely",
  "Light activity": "Occasionally",
  "Moderate exercise": "Occasionally",
  "Very active": "Regularly",
  "Very good": "Good",
  "Very poor": "Poor",
};

const HEALTH_NOISE = new Set([
  "Currently taking", "None", "No",
  "Yes", "Not sure",
  "Yes — add details in Profile",
]);

const FLOAT_TAB_H = 52;

export default function ProfileScreen() {
  const router = useRouter();
  const headerH = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const tabClearance = (insets.bottom > 0 ? insets.bottom - 12 : 12) + FLOAT_TAB_H;
  const { state, session } = useAuth();
  const { status, setTier } = useSubscription();
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [docContext, setDocContext] = useState<UserDocumentContext | null>(null);
  const [docCount, setDocCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [tagInputKey, setTagInputKey] = useState<ProfileDisplayKey | null>(null);

  const [form, setForm] = useState<ProfileDisplay>(getDefaultDisplay());
  const [editInitialForm, setEditInitialForm] = useState<ProfileDisplay>(getDefaultDisplay());
  const [healthSummaries, setHealthSummaries] = useState<Record<HealthSummaryLevel, HealthSummary | null>>({
    rolling_weekly: null, monthly: null, quarterly: null, biannual: null,
  });
  const [weeklySnapshots, setWeeklySnapshots] = useState<HealthSummary[]>([]);
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  /** 避免 useFocusEffect 依赖 profile 导致：拉取完成 → profile 引用变 → effect 重跑 → 无限「下拉刷新」 */
  const skipFocusSilentRefreshRef = useRef(true);

  const loadProfile = useCallback(async (silent = false) => {
    if (!session?.user?.id) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [p, dc, storedSurvey, hs, ws] = await Promise.all([
        fetchHealthProfile(session.user.id),
        fetchUserDocumentContext(session.user.id),
        getOnboardingSurvey(),
        fetchLatestHealthSummaries(session.user.id),
        fetchWeeklySnapshots(session.user.id),
      ]);
      setProfile(p);
      setDocContext(dc);
      setHealthSummaries(hs);
      setWeeklySnapshots(ws);

      const { count } = await supabase
        .from("profile_document_uploads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.user.id);
      setDocCount(count ?? 0);
      const mergedSurvey: OnboardingSurvey = {
        ...storedSurvey,
        ...(p?.onboarding_survey ?? {}),
      };
      const derived = deriveProfileDisplayFromSurvey(mergedSurvey);
      const next: ProfileDisplay = {};
      for (const key of PROFILE_DISPLAY_KEYS) {
        next[key] = p?.profile_display?.[key] ?? derived[key] ?? "";
      }
      if (p?.occupation != null && p.occupation !== "") {
        next.occupation = p.occupation;
      }

      for (const k of ["activity_level", "sleep_quality"] as const) {
        const v = next[k] ?? "";
        if (v in LIFESTYLE_COMPAT) next[k] = LIFESTYLE_COMPAT[v];
      }
      for (const k of ["medications", "family_history"] as const) {
        const cleaned = parseTags(next[k]).filter((t) => !HEALTH_NOISE.has(t));
        next[k] = cleaned.join(", ");
      }
      for (const k of ["health_concerns", "chronic_conditions"] as const) {
        next[k] = parseTags(next[k]).join(", ");
      }

      setForm(next);
    } catch (e) {
      console.error("load profile:", e);
    } finally {
      if (!silent) setLoading(false);
      else setRefreshing(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (state === "authenticated" && session?.user?.id) {
      loadProfile();
    } else {
      setLoading(false);
      setProfile(null);
    }
  }, [state, session?.user?.id, loadProfile]);

  useEffect(() => {
    skipFocusSilentRefreshRef.current = true;
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (state !== "authenticated" || !session?.user?.id) return;
      // 首次进入本页由上方 useEffect 负责 load；仅「从子页返回」时再静默刷新，且不把 profile 放进依赖以免死循环
      if (skipFocusSilentRefreshRef.current) {
        skipFocusSilentRefreshRef.current = false;
        return;
      }
      void loadProfile(true);
    }, [state, session?.user?.id, loadProfile])
  );

  const saveProfile = async () => {
    if (!session?.user?.id) return;
    setSaving(true);
    try {
      const profileDisplay: ProfileDisplay = {};
      for (const key of PROFILE_DISPLAY_KEYS) {
        const v = form[key];
        if (v != null && v.trim() !== "") profileDisplay[key] = v.trim();
      }
      await upsertHealthProfile(session.user.id, {
        profile_display: profileDisplay,
        occupation: form.occupation?.trim() || null,
        gender: form.gender?.trim() || null,
        family_history: form.family_history?.trim() || null,
      });
      setEditingGroup(null);
      await loadProfile();
    } catch (e) {
      console.error("save profile:", e);
      Alert.alert("Save failed", String(e));
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const goLogin = () => router.replace("/login");

  const goToDocuments = () => router.push("/(tabs)/profile/documents");

  const addTag = (key: ProfileDisplayKey) => {
    const trimmed = tagInput.trim();
    if (!trimmed) { setTagInputKey(null); setTagInput(""); return; }
    const tags = parseTags(form[key]);
    if (tags.includes(trimmed)) { setTagInput(""); return; }
    tags.push(trimmed);
    setForm((prev) => ({ ...prev, [key]: tags.join(", ") }));
    setTagInput("");
    setTagInputKey(null);
  };

  const removeTag = (key: ProfileDisplayKey, tag: string) => {
    const tags = parseTags(form[key]).filter((t) => t !== tag);
    setForm((prev) => ({ ...prev, [key]: tags.join(", ") }));
  };

  if (state !== "authenticated") {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.title}>Health Profile</Text>
        <Text style={styles.hint}>Sign in to view and edit your health information</Text>
        <TouchableOpacity style={styles.btnIn} onPress={goLogin}>
          <Text style={styles.btnTextIn}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={PROFILE_THEME.accent} />
      </View>
    );
  }

  const tier = status?.tier ?? "free";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingTop: headerH + 12, paddingBottom: tabClearance + 20 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadProfile(true)}
        />
      }
    >
      {PROFILE_GROUPS.map((group) => {
        const isEditing = editingGroup === group.key;
        return (
          <Pressable
            key={group.key}
            style={[styles.card, isEditing && styles.cardEditing]}
            onLongPress={() => {
              if (isEditing) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setEditInitialForm({ ...form });
              setEditingGroup(group.key);
            }}
            delayLongPress={400}
          >
            <Text style={styles.cardTitle}>{group.title}</Text>

            {group.type === "basic" && group.fields.map((key, i) => {
              const opts = BASIC_OPTIONS[key];
              const current = form[key]?.trim() ?? "";
              return (
                <View key={key}>
                  {opts ? (
                    <View style={styles.lifestyleRow}>
                      <Text style={styles.lifestyleLabel}>{PROFILE_FIELD_LABELS[key]}</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.scrollChips}
                      >
                        {isEditing ? (
                          opts.map((opt) => {
                            const selected = current.toLowerCase() === opt.toLowerCase();
                            return (
                              <TouchableOpacity
                                key={opt}
                                style={[styles.chip, selected && styles.chipOn]}
                                onPress={() => setForm((prev) => ({ ...prev, [key]: opt }))}
                                activeOpacity={0.65}
                              >
                                <Text style={[styles.chipText, selected && styles.chipTextOn]}>{opt}</Text>
                              </TouchableOpacity>
                            );
                          })
                        ) : (
                          current ? (
                            <View style={[styles.chip, styles.chipOn]}>
                              <Text style={[styles.chipText, styles.chipTextOn]}>{current}</Text>
                            </View>
                          ) : (
                            <Text style={styles.tagEmpty}>—</Text>
                          )
                        )}
                      </ScrollView>
                    </View>
                  ) : isEditing ? (
                    <View style={styles.lifestyleRow}>
                      <Text style={styles.lifestyleLabel}>{PROFILE_FIELD_LABELS[key]}</Text>
                      <View style={{ flex: 1, alignItems: "flex-end" }}>
                        <TextInput
                          style={styles.inlineInput}
                          value={form[key] ?? ""}
                          onChangeText={(t) => setForm((prev) => ({ ...prev, [key]: t }))}
                          placeholder="Enter…"
                          placeholderTextColor={PROFILE_THEME.textSecondary}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.lifestyleRow}>
                      <Text style={styles.lifestyleLabel}>{PROFILE_FIELD_LABELS[key]}</Text>
                      <View style={{ flex: 1, alignItems: "flex-end" }}>
                        {current ? (
                          <View style={[styles.chip, styles.chipOn]}>
                            <Text style={[styles.chipText, styles.chipTextOn]}>{current}</Text>
                          </View>
                        ) : (
                          <Text style={styles.tagEmpty}>—</Text>
                        )}
                      </View>
                    </View>
                  )}
                  {i < group.fields.length - 1 && <View style={styles.separator} />}
                </View>
              );
            })}

            {group.type === "lifestyle" && group.fields.map((key, i) => {
              const opts = LIFESTYLE_OPTIONS[key] ?? [];
              const current = form[key]?.trim() ?? "";
              return (
                <View key={key}>
                  <View style={styles.lifestyleRow}>
                    <Text style={styles.lifestyleLabel}>{PROFILE_FIELD_LABELS[key]}</Text>
                    <View style={styles.lifestyleChips}>
                      {isEditing ? (
                        opts.map((opt) => {
                          const selected = current.toLowerCase() === opt.toLowerCase();
                          return (
                            <TouchableOpacity
                              key={opt}
                              style={[styles.chip, selected && styles.chipOn]}
                              onPress={() => setForm((prev) => ({ ...prev, [key]: opt }))}
                              activeOpacity={0.65}
                            >
                              <Text style={[styles.chipText, selected && styles.chipTextOn]}>{opt}</Text>
                            </TouchableOpacity>
                          );
                        })
                      ) : (
                        current ? (
                          <View style={[styles.chip, styles.chipOn]}>
                            <Text style={[styles.chipText, styles.chipTextOn]}>{current}</Text>
                          </View>
                        ) : (
                          <Text style={styles.tagEmpty}>—</Text>
                        )
                      )}
                    </View>
                  </View>
                  {i < group.fields.length - 1 && <View style={styles.separator} />}
                </View>
              );
            })}

            {group.type === "health" && group.fields.map((key, i) => {
              const tags = parseTags(form[key]);
              return (
                <View key={key}>
                  <View style={styles.tagField}>
                    <Text style={styles.tagLabel}>{PROFILE_FIELD_LABELS[key]}</Text>
                    <View style={styles.tagWrap}>
                      {tags.length === 0 && !isEditing && (
                        <Text style={styles.tagEmpty}>—</Text>
                      )}
                      {tags.map((tag) => (
                        <TouchableOpacity
                          key={tag}
                          style={[styles.chip, isEditing && styles.chipOn, key === "family_history" && styles.chipWarn]}
                          onPress={isEditing ? () => removeTag(key, tag) : undefined}
                          disabled={!isEditing}
                          activeOpacity={0.65}
                        >
                          <Text style={[styles.chipText, isEditing && styles.chipTextOn, key === "family_history" && styles.chipWarnText]}>{tag}</Text>
                          {isEditing && (
                            <Ionicons name="close" size={11} color={PROFILE_THEME.accent} style={styles.chipRemove} />
                          )}
                        </TouchableOpacity>
                      ))}
                      {isEditing && (
                        <>
                          <TouchableOpacity
                            style={[styles.chipAdd, tagInputKey === key && styles.chipOn]}
                            onPress={() => { setTagInputKey(tagInputKey === key ? null : key); setTagInput(""); }}
                            activeOpacity={0.65}
                          >
                            <Ionicons name="add" size={13} color={tagInputKey === key ? PROFILE_THEME.accent : PROFILE_THEME.textSecondary} />
                          </TouchableOpacity>
                          {tagInputKey === key && (
                            <>
                              <TextInput
                                style={styles.tagInputField}
                                value={tagInput}
                                onChangeText={setTagInput}
                                placeholder="Add tag"
                                placeholderTextColor={PROFILE_THEME.textSecondary}
                                onSubmitEditing={() => addTag(key)}
                                returnKeyType="done"
                                blurOnSubmit={false}
                                autoFocus
                              />
                              <TouchableOpacity
                                style={styles.tagConfirmBtn}
                                onPress={() => addTag(key)}
                              >
                                <Ionicons name="checkmark" size={12} color="#fff" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.tagCancelBtn}
                                onPress={() => { setTagInputKey(null); setTagInput(""); }}
                              >
                                <Ionicons name="close" size={12} color={PROFILE_THEME.textSecondary} />
                              </TouchableOpacity>
                            </>
                          )}
                        </>
                      )}
                    </View>
                  </View>
                  {i < group.fields.length - 1 && <View style={styles.separator} />}
                </View>
              );
            })}

            {isEditing && (
              <View style={styles.cardFooterActions}>
                <TouchableOpacity
                  style={styles.circleBtn}
                  onPress={() => { setEditingGroup(null); setForm(editInitialForm); setTagInput(""); setTagInputKey(null); }}
                  disabled={saving}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={15} color={PROFILE_THEME.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.circleBtn, styles.circleBtnSave]}
                  onPress={saveProfile}
                  disabled={saving}
                  activeOpacity={0.7}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="checkmark" size={15} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        );
      })}

      <TouchableOpacity style={styles.docEntryBtn} onPress={goToDocuments} activeOpacity={0.7}>
        <View style={styles.docEntryRow}>
          <Ionicons name="document-text-outline" size={22} color={PROFILE_THEME.accent} />
          <View style={styles.docEntryContent}>
            <Text style={styles.docEntryTitle}>Documents</Text>
            {docCount > 0 ? (
              <Text style={styles.docEntryCount}>
                {docCount} health {docCount === 1 ? "record" : "records"} uploaded
              </Text>
            ) : (
              <Text style={styles.docEntryEmpty}>
                No medical records yet — tap to upload
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color={PROFILE_THEME.textSecondary} />
        </View>
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subscription (Test)</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Current tier</Text>
          <Text style={styles.value}>
            {tier === "free" ? "Free" : tier === "prime" ? "Prime" : "Pro"}
          </Text>
        </View>
        <View style={styles.mockRow}>
          <TouchableOpacity
            style={[styles.mockBtn, tier === "pro" && styles.mockBtnActive]}
            onPress={() => setTier("pro")}
          >
            <Text style={[styles.mockBtnText, tier === "pro" && styles.mockBtnTextActive]}>
              Set Pro
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mockBtn, tier === "prime" && styles.mockBtnActive]}
            onPress={() => setTier("prime")}
          >
            <Text style={[styles.mockBtnText, tier === "prime" && styles.mockBtnTextActive]}>
              Set Prime
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mockBtn, tier === "free" && styles.mockBtnActive]}
            onPress={() => setTier("free")}
          >
            <Text style={[styles.mockBtnText, tier === "free" && styles.mockBtnTextActive]}>
              Set Free
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Document context (debug)</Text>
        <Text style={styles.sectionHint}>
          From user_document_context (updates when you upload/delete docs via the pipeline). Chat context will be wired separately.
        </Text>
        <View style={styles.field}>
          <Text style={styles.label}>Updated at</Text>
          <Text style={styles.value}>
            {docContext?.updated_at ? new Date(docContext.updated_at).toLocaleString() : "—"}
          </Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Model</Text>
          <Text style={styles.value}>{docContext?.generated_by_model || "—"}</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Docs summary</Text>
          <Text style={styles.value}>{docContext?.docs_summary || "—"}</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Risk flags</Text>
          <Text style={styles.value}>
            {docContext?.risk_flags?.length ? docContext.risk_flags.join(" / ") : "—"}
          </Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Docs items</Text>
          <Text style={styles.uidValue}>
            {Array.isArray(docContext?.docs_items)
              ? `${docContext.docs_items.length} item(s)`
              : "—"}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Health Memory</Text>
        {HEALTH_SUMMARY_LEVELS.map((level) => {
          const s = healthSummaries[level];
          const expanded = expandedLevels.has(level);
          return (
            <TouchableOpacity
              key={level}
              style={styles.memoryCard}
              onPress={() => setExpandedLevels((prev) => {
                const next = new Set(prev);
                next.has(level) ? next.delete(level) : next.add(level);
                return next;
              })}
              activeOpacity={0.7}
            >
              <View style={styles.memoryCardHeader}>
                <View style={styles.memoryLevelRow}>
                  <View style={[styles.memoryDot, s ? styles.memoryDotActive : styles.memoryDotEmpty]} />
                  <Text style={styles.memoryLevel}>{SUMMARY_LEVEL_LABELS[level]}</Text>
                </View>
                {s && (
                  <Ionicons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={PROFILE_THEME.textSecondary}
                  />
                )}
              </View>
              {s ? (
                <>
                  <Text style={styles.memoryWindow}>
                    {s.window_start} → {s.window_end}
                  </Text>
                  {s.stats && (
                    <View style={styles.memoryStatsRow}>
                      <Text style={styles.memoryStat}>{s.stats.log_count} logs</Text>
                      <Text style={styles.memoryStat}>sev: {s.stats.avg_severity}</Text>
                      <Text style={[
                        styles.memoryStat,
                        s.stats.trend === "improving" && styles.memoryTrendGood,
                        s.stats.trend === "worsening" && styles.memoryTrendBad,
                      ]}>
                        {s.stats.trend === "improving" ? "↗ improving" : s.stats.trend === "worsening" ? "↘ worsening" : "→ stable"}
                      </Text>
                    </View>
                  )}
                  {expanded && (
                    <View style={styles.memoryExpandedBody}>
                      <Text style={[styles.memorySummaryText, { fontFamily: fontSerif(s.summary ?? undefined) }]}>{s.summary || "—"}</Text>
                      {s.stats?.top_tags && s.stats.top_tags.length > 0 && (
                        <View style={styles.memoryTagsRow}>
                          {s.stats.top_tags.map((tag) => (
                            <View key={tag} style={styles.memoryTag}>
                              <Text style={styles.memoryTagText}>{tag}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </>
              ) : (
                <Text style={styles.memoryEmpty}>No data yet</Text>
              )}
            </TouchableOpacity>
          );
        })}

        {weeklySnapshots.length > 0 && (
          <View style={styles.memorySnapshotsSection}>
            <Text style={styles.memorySnapshotsTitle}>Weekly Snapshots (archive)</Text>
            {weeklySnapshots.map((ws) => (
              <TouchableOpacity
                key={ws.id}
                style={styles.memoryCard}
                onPress={() => setExpandedLevels((prev) => {
                  const next = new Set(prev);
                  next.has(ws.id) ? next.delete(ws.id) : next.add(ws.id);
                  return next;
                })}
                activeOpacity={0.7}
              >
                <View style={styles.memoryCardHeader}>
                  <Text style={styles.memoryWindow}>
                    {ws.window_start} → {ws.window_end}
                  </Text>
                  <Ionicons
                    name={expandedLevels.has(ws.id) ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={PROFILE_THEME.textSecondary}
                  />
                </View>
                {ws.stats && (
                  <View style={styles.memoryStatsRow}>
                    <Text style={styles.memoryStat}>{ws.stats.log_count} logs</Text>
                    <Text style={styles.memoryStat}>sev: {ws.stats.avg_severity}</Text>
                  </View>
                )}
                {expandedLevels.has(ws.id) && (
                  <Text style={[styles.memorySummaryText, { fontFamily: fontSerif(ws.summary ?? undefined) }]}>{ws.summary || "—"}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.uidBox}>
        <Text style={styles.uidLabel}>User UID</Text>
        <Text style={styles.uidValue} selectable>
          {session?.user?.id ?? ""}
        </Text>
      </View>

      <TouchableOpacity style={styles.btnOut} onPress={logout}>
        <Text style={styles.btnTextOut}>Sign out</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// Claude 风格：暖白背景、珊瑚橙强调、极简克制
const PROFILE_THEME = {
  bg: "#f9faf5",
  bgCard: "#f5f5f3",
  border: "#e8e8e6",
  text: "#1a1a1a",
  textSecondary: "#9a9a9a",
  accent: "#e07c3c",
  accentMuted: "#c9a88a",
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PROFILE_THEME.bg },
  centered: { justifyContent: "center", alignItems: "center" },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },
  title: { fontSize: 24, fontWeight: "600", marginBottom: 4, color: PROFILE_THEME.text, fontFamily: FONT_SANS_BOLD },
  hint: { fontSize: 16, color: PROFILE_THEME.textSecondary, marginBottom: 16, fontFamily: FONT_SANS_BOLD },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: PROFILE_THEME.border,
  },
  cardEditing: {
    borderColor: PROFILE_THEME.accent + "40",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "#3a3a38",
    textTransform: "uppercase",
    marginBottom: 12,
    fontFamily: FONT_SANS_BOLD,
  },
  cardFooterActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  circleBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: PROFILE_THEME.border + "60",
    alignItems: "center",
    justifyContent: "center",
  },
  circleBtnSave: {
    backgroundColor: PROFILE_THEME.accent,
  },

  lifestyleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  lifestyleLabel: {
    fontSize: 13,
    color: PROFILE_THEME.textSecondary,
    width: 70,
    flexShrink: 0,
    fontFamily: FONT_SANS,
  },
  lifestyleChips: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "flex-end",
  },
  scrollChips: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "flex-end",
    flexGrow: 1,
  },
  fieldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 10,
  },
  fieldLabel: {
    fontSize: 14,
    color: PROFILE_THEME.textSecondary,
    flex: 0.45,
    fontFamily: FONT_SANS,
  },
  fieldValue: {
    fontSize: 14,
    color: PROFILE_THEME.text,
    flex: 0.55,
    textAlign: "right",
    lineHeight: 20,
    fontFamily: FONT_SANS,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: PROFILE_THEME.border,
  },
  tagField: {
    paddingVertical: 10,
  },
  tagLabel: {
    fontSize: 13,
    color: PROFILE_THEME.textSecondary,
    marginBottom: 8,
    fontFamily: FONT_SANS,
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  tagEmpty: {
    fontSize: 13,
    color: PROFILE_THEME.textSecondary,
    fontFamily: FONT_SANS,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.015)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
    maxWidth: "100%",
  },
  chipOn: {
    backgroundColor: PROFILE_THEME.accent + "18",
  },
  chipWarn: {
    backgroundColor: "#fef0e5",
  },
  chipText: {
    fontSize: 13,
    color: PROFILE_THEME.textSecondary,
    fontWeight: "400",
    flexShrink: 1,
    fontFamily: FONT_SANS,
  },
  chipTextOn: {
    color: PROFILE_THEME.accent,
    fontWeight: "600",
    fontFamily: FONT_SANS,
  },
  chipWarnText: {
    color: PROFILE_THEME.accent,
    fontWeight: "500",
    fontFamily: FONT_SANS_MEDIUM,
  },
  chipRemove: {
    marginLeft: 0,
  },
  chipAdd: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  tagInputField: {
    height: 28,
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.04)",
    fontSize: 13,
    color: PROFILE_THEME.text,
    minWidth: 120,
    maxWidth: 160,
    fontFamily: FONT_SANS,
  },
  tagConfirmBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: PROFILE_THEME.accent,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  tagCancelBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },

  inlineInput: {
    width: 120,
    fontSize: 13,
    color: PROFILE_THEME.textSecondary,
    backgroundColor: PROFILE_THEME.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PROFILE_THEME.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: "right",
    fontFamily: FONT_SANS,
  },

  editField: {
    paddingVertical: 8,
  },
  editFieldLabel: {
    fontSize: 13,
    color: PROFILE_THEME.textSecondary,
    marginBottom: 6,
    fontFamily: FONT_SANS,
  },
  section: {
    backgroundColor: PROFILE_THEME.bgCard,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: PROFILE_THEME.border,
  },
  sectionHeaderRow: {
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: PROFILE_THEME.text,
    marginBottom: 14,
    fontFamily: FONT_SANS_BOLD,
  },
  sectionHint: {
    fontSize: 14,
    color: PROFILE_THEME.textSecondary,
    marginBottom: 16,
    fontFamily: FONT_SANS,
  },
  mockRow: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 8 },
  mockBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: PROFILE_THEME.bg,
    borderWidth: 1,
    borderColor: PROFILE_THEME.border,
  },
  mockBtnActive: { backgroundColor: PROFILE_THEME.accent, borderColor: PROFILE_THEME.accent },
  mockBtnText: { fontSize: 14, color: PROFILE_THEME.textSecondary, fontFamily: FONT_SANS },
  mockBtnTextActive: { color: "#fff", fontWeight: "500", fontFamily: FONT_SANS_MEDIUM },
  mockBtnClear: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#f0f0ee",
    borderWidth: 1,
    borderColor: PROFILE_THEME.border,
  },
  mockBtnClearText: { fontSize: 14, color: PROFILE_THEME.textSecondary, fontFamily: FONT_SANS },
  field: { marginBottom: 16 },
  label: { fontSize: 14, color: PROFILE_THEME.textSecondary, marginBottom: 6, fontFamily: FONT_SANS },
  value: { fontSize: 14, color: PROFILE_THEME.text, lineHeight: 20, fontFamily: FONT_SANS },
  input: {
    backgroundColor: PROFILE_THEME.bg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: PROFILE_THEME.text,
    borderWidth: 1,
    borderColor: PROFILE_THEME.border,
    fontFamily: FONT_SANS,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" as const },
  pickerRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  docEntryBtn: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: PROFILE_THEME.border,
  },
  docEntryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  docEntryContent: {
    flex: 1,
  },
  docEntryTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: PROFILE_THEME.text,
    fontFamily: FONT_SANS_BOLD,
  },
  docEntryCount: {
    fontSize: 12,
    color: PROFILE_THEME.accent,
    marginTop: 2,
    fontFamily: FONT_SANS,
  },
  docEntryEmpty: {
    fontSize: 12,
    color: PROFILE_THEME.textSecondary,
    marginTop: 2,
    fontStyle: "italic",
    fontFamily: FONT_SANS,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: PROFILE_THEME.accent },
  btnSecondary: {
    backgroundColor: PROFILE_THEME.bgCard,
    borderWidth: 1,
    borderColor: PROFILE_THEME.border,
  },
  btnTextPrimary: { color: "#fff", fontSize: 16, fontWeight: "600", fontFamily: FONT_SANS_BOLD },
  btnTextSecondary: { color: PROFILE_THEME.textSecondary, fontSize: 16, fontWeight: "600", fontFamily: FONT_SANS_BOLD },
  btnIn: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: PROFILE_THEME.accent,
  },
  btnOut: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: PROFILE_THEME.bgCard,
    alignSelf: "stretch",
    alignItems: "center",
    borderWidth: 1,
    borderColor: PROFILE_THEME.border,
  },
  btnTextIn: { color: "#fff", fontSize: 16, fontWeight: "600", fontFamily: FONT_SANS_BOLD },
  btnTextOut: { color: PROFILE_THEME.textSecondary, fontSize: 16, fontWeight: "600", fontFamily: FONT_SANS_BOLD },
  uidBox: {
    backgroundColor: PROFILE_THEME.bgCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: PROFILE_THEME.border,
  },
  uidLabel: { fontSize: 12, color: PROFILE_THEME.textSecondary, marginBottom: 4, fontFamily: FONT_SANS },
  uidValue: {
    fontSize: 12,
    color: PROFILE_THEME.textSecondary,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  memoryCard: {
    backgroundColor: PROFILE_THEME.bg,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: PROFILE_THEME.border,
  },
  memoryCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  memoryLevelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  memoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  memoryDotActive: {
    backgroundColor: "#4caf80",
  },
  memoryDotEmpty: {
    backgroundColor: PROFILE_THEME.border,
  },
  memoryLevel: {
    fontSize: 15,
    fontWeight: "600",
    color: PROFILE_THEME.text,
    fontFamily: FONT_SANS_BOLD,
  },
  memoryWindow: {
    fontSize: 12,
    color: PROFILE_THEME.textSecondary,
    marginTop: 4,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  memoryStatsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
    flexWrap: "wrap",
  },
  memoryStat: {
    fontSize: 12,
    color: PROFILE_THEME.textSecondary,
    fontFamily: FONT_SANS,
  },
  memoryTrendGood: { color: "#4caf80" },
  memoryTrendBad: { color: "#e05c5c" },
  memoryEmpty: {
    fontSize: 13,
    color: PROFILE_THEME.textSecondary,
    marginTop: 4,
    fontStyle: "italic",
    fontFamily: FONT_SANS,
  },
  memoryExpandedBody: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: PROFILE_THEME.border,
  },
  memorySummaryText: {
    fontSize: 14,
    color: PROFILE_THEME.text,
    lineHeight: 20,
  },
  memoryTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  memoryTag: {
    backgroundColor: PROFILE_THEME.border + "80",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  memoryTagText: {
    fontSize: 11,
    color: PROFILE_THEME.textSecondary,
    fontFamily: FONT_SANS,
  },
  memorySnapshotsSection: {
    marginTop: 12,
  },
  memorySnapshotsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: PROFILE_THEME.textSecondary,
    marginBottom: 8,
    fontFamily: FONT_SANS_BOLD,
  },
});
