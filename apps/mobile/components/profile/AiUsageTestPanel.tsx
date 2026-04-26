import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FONT_SANS, FONT_SANS_MEDIUM } from "@/lib/fonts";
import {
  fetchAiUsageSummary,
  type AiUsageSummary,
  type AiUsageEventDetail,
} from "@/lib/api";

const THEME = {
  bg: "#fff",
  border: "#e8e8e6",
  text: "#1a1a1a",
  muted: "#9a9a9a",
  accent: "#e07c3c",
  openai: "#10a37f",
  anthropic: "#d4a574",
};

function fmt(n: number) {
  return n.toLocaleString();
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function providerColor(p: string) {
  if (p === "openai") return THEME.openai;
  if (p === "anthropic") return THEME.anthropic;
  return THEME.muted;
}

function showEventDetail(ev: AiUsageEventDetail) {
  const lines = [
    `id: ${ev.id}`,
    `time: ${ev.createdAt}`,
    `provider: ${ev.provider}`,
    `model: ${ev.model}`,
    `feature: ${ev.feature}`,
    `source: ${ev.source}`,
    `tokens: in ${fmt(ev.inputTokens)} · out ${fmt(ev.outputTokens)}`,
    ev.metadata
      ? `metadata:\n${JSON.stringify(ev.metadata, null, 2)}`
      : "metadata: —",
  ];
  Alert.alert("Usage event", lines.join("\n\n"), [{ text: "OK" }], {
    userInterfaceStyle: "light",
  });
}

export function AiUsageTestPanel({
  accessToken,
}: {
  accessToken: string | null | undefined;
}) {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AiUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      setError("No session");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAiUsageSummary(accessToken, days, {
        includeEventDetails: true,
        eventLimit: 200,
      });
      if (res == null) {
        setError("Failed to load (check API / migration)");
        setData(null);
      } else {
        setData(res);
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const events = data?.events ?? [];

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="analytics-outline" size={20} color={THEME.accent} />
          <Text style={styles.title}>AI token usage (test)</Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={THEME.muted}
        />
      </TouchableOpacity>
      <Text style={styles.hint}>
        OpenAI vs Anthropic from <Text style={styles.code}>ai_usage_events</Text> — dev only
      </Text>

      <View style={styles.dayRow}>
        {[7, 30, 90].map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.dayChip, days === d && styles.dayChipOn]}
            onPress={() => setDays(d)}
          >
            <Text style={[styles.dayChipText, days === d && styles.dayChipTextOn]}>{d}d</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.refreshBtn} onPress={() => void load()}>
          <Ionicons name="refresh" size={18} color={THEME.accent} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={THEME.accent} />
      ) : error ? (
        <Text style={styles.err}>{error}</Text>
      ) : data ? (
        <>
          <View style={styles.rowBig}>
            <Text style={styles.muted}>Range</Text>
            <Text style={styles.val}>
              {data.days}d · {data.totalCalls} calls
            </Text>
          </View>
          <View style={styles.rowBig}>
            <Text style={styles.muted}>Total tokens</Text>
            <Text style={styles.val}>
              in {fmt(data.totalInputTokens)} · out {fmt(data.totalOutputTokens)}
            </Text>
          </View>

          <View style={styles.providerBlock}>
            <Text style={[styles.providerLabel, { color: THEME.openai }]}>OpenAI</Text>
            <Text style={styles.providerNums}>
              in {fmt(data.byProvider.openai.inputTokens)} · out{" "}
              {fmt(data.byProvider.openai.outputTokens)} · {data.byProvider.openai.calls} calls
            </Text>
          </View>
          <View style={styles.providerBlock}>
            <Text style={[styles.providerLabel, { color: THEME.anthropic }]}>Anthropic (Claude)</Text>
            <Text style={styles.providerNums}>
              in {fmt(data.byProvider.anthropic.inputTokens)} · out{" "}
              {fmt(data.byProvider.anthropic.outputTokens)} · {data.byProvider.anthropic.calls}{" "}
              calls
            </Text>
          </View>

          {expanded && (
            <>
              {Object.keys(data.byFeature).length > 0 && (
                <View style={styles.featureSection}>
                  <Text style={styles.featureTitle}>By feature</Text>
                  {Object.entries(data.byFeature)
                    .sort((a, b) => b[1].calls - a[1].calls)
                    .map(([name, v]) => (
                      <View key={name} style={styles.featureRow}>
                        <Text style={styles.featureName} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={styles.featureNums}>
                          in {fmt(v.inputTokens)} · out {fmt(v.outputTokens)} · {v.calls}×
                        </Text>
                      </View>
                    ))}
                </View>
              )}

              <Text style={styles.eventsTitle}>
                Events (newest first, max {data.eventLimit ?? events.length})
              </Text>
              {events.length === 0 ? (
                <Text style={styles.eventsEmpty}>No rows in range (metering not wired yet?)</Text>
              ) : (
                <ScrollView
                  style={styles.eventsScroll}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
                  {events.map((ev) => (
                    <TouchableOpacity
                      key={ev.id}
                      style={styles.eventRow}
                      onPress={() => showEventDetail(ev)}
                      activeOpacity={0.65}
                    >
                      <View style={styles.eventTop}>
                        <Text style={styles.eventTime}>{formatTime(ev.createdAt)}</Text>
                        <Text
                          style={[styles.eventProvider, { color: providerColor(ev.provider) }]}
                        >
                          {ev.provider}
                        </Text>
                      </View>
                      <Text style={styles.eventModel} numberOfLines={1}>
                        {ev.model}
                      </Text>
                      <Text style={styles.eventMeta}>
                        {ev.feature} · in {fmt(ev.inputTokens)} · out {fmt(ev.outputTokens)} ·{" "}
                        {ev.source}
                      </Text>
                      {ev.metadata && Object.keys(ev.metadata).length > 0 ? (
                        <Text style={styles.eventJsonHint} numberOfLines={2}>
                          {JSON.stringify(ev.metadata)}
                        </Text>
                      ) : null}
                      <Text style={styles.eventTap}>Tap for full detail</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: THEME.bg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: THEME.text,
    fontFamily: FONT_SANS_MEDIUM,
  },
  hint: {
    fontSize: 12,
    color: THEME.muted,
    marginTop: 6,
    marginBottom: 10,
    fontFamily: FONT_SANS,
  },
  code: { fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#f0f0ed",
  },
  dayChipOn: { backgroundColor: "rgba(224,124,60,0.2)" },
  dayChipText: { fontSize: 13, color: THEME.muted, fontFamily: FONT_SANS },
  dayChipTextOn: { color: THEME.accent, fontWeight: "600" },
  refreshBtn: { marginLeft: "auto", padding: 6 },
  loader: { marginVertical: 12 },
  err: { color: "#b33", fontSize: 13, fontFamily: FONT_SANS },
  rowBig: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  muted: { fontSize: 13, color: THEME.muted, fontFamily: FONT_SANS },
  val: { fontSize: 13, color: THEME.text, fontFamily: FONT_SANS },
  providerBlock: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: THEME.border },
  providerLabel: { fontSize: 13, fontWeight: "600", fontFamily: FONT_SANS_MEDIUM, marginBottom: 4 },
  providerNums: { fontSize: 13, color: THEME.text, fontFamily: FONT_SANS },
  featureSection: { marginTop: 12 },
  featureTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.muted,
    marginBottom: 8,
    fontFamily: FONT_SANS_MEDIUM,
  },
  featureRow: { marginBottom: 6 },
  featureName: { fontSize: 12, color: THEME.muted, fontFamily: FONT_SANS },
  featureNums: { fontSize: 12, color: THEME.text, fontFamily: FONT_SANS },
  eventsTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.muted,
    marginTop: 14,
    marginBottom: 8,
    fontFamily: FONT_SANS_MEDIUM,
  },
  eventsEmpty: { fontSize: 12, color: THEME.muted, fontStyle: "italic", fontFamily: FONT_SANS },
  eventsScroll: { maxHeight: 320 },
  eventRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
    backgroundColor: "#f7f7f4",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.border,
  },
  eventTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eventTime: { fontSize: 12, color: THEME.muted, fontFamily: FONT_SANS },
  eventProvider: { fontSize: 12, fontWeight: "700", fontFamily: FONT_SANS_MEDIUM },
  eventModel: { fontSize: 12, color: THEME.text, marginTop: 4, fontFamily: FONT_SANS },
  eventMeta: { fontSize: 11, color: THEME.muted, marginTop: 4, fontFamily: FONT_SANS },
  eventJsonHint: { fontSize: 10, color: THEME.muted, marginTop: 4, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
  eventTap: { fontSize: 10, color: THEME.accent, marginTop: 6, fontFamily: FONT_SANS },
});
