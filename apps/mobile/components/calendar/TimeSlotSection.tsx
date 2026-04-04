import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Platform } from "react-native";
import { formatTime } from "@/lib/dateUtils";
import { calendarTheme as theme } from "@/lib/calendarTheme";
import type { SymptomEntry } from "@/types/calendar";
import { TIME_SLOTS } from "@/lib/dateUtils";

interface TimeSlotSectionProps {
  slotKey: string;
  entries: SymptomEntry[];
  onUpdateEntry: (entryId: string, nextSummary: string) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
}

const SLOT_BG_COLORS: Record<string, string> = {
  morning: "#eef6ff",
  afternoon: "#fff8ee",
  evening: "#f8f2ff",
  night: "#f2f4f8",
};

const SLOT_TITLE_COLORS: Record<string, string> = {
  morning: "#1d4ed8",
  afternoon: "#b45309",
  evening: "#6d28d9",
  night: "#475569",
};

export function TimeSlotSection({
  slotKey,
  entries,
  onUpdateEntry,
  onDeleteEntry,
}: TimeSlotSectionProps) {
  const config = TIME_SLOTS.find((s) => s.key === slotKey);
  const slotBg = SLOT_BG_COLORS[slotKey] ?? theme.bgSecondary;
  const slotTitleColor = SLOT_TITLE_COLORS[slotKey] ?? theme.textSecondary;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftSummary, setDraftSummary] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  if (!config || entries.length === 0) return null;

  const startEdit = (e: SymptomEntry) => {
    setEditingId(e.id);
    setExpandedId(e.id);
    setDraftSummary(e.summary);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftSummary("");
  };

  const confirmUpdate = (entryId: string) => {
    const next = draftSummary.trim();
    if (!next) {
      Alert.alert("Notice", "Content cannot be empty.");
      return;
    }
    const runUpdate = async () => {
      setSavingId(entryId);
      try {
        await onUpdateEntry(entryId, next);
        cancelEdit();
      } catch (e) {
        Alert.alert("Update failed", e instanceof Error ? e.message : String(e));
      } finally {
        setSavingId(null);
      }
    };

    if (Platform.OS === "web") {
      const ok = typeof window !== "undefined" ? window.confirm("Save this change?") : true;
      if (ok) void runUpdate();
      return;
    }

    Alert.alert("Confirm update", "Save this change?", [
      { text: "Cancel", style: "cancel" },
      { text: "Save", onPress: () => void runUpdate() },
    ]);
  };

  const confirmDelete = (entryId: string) => {
    const runDelete = async () => {
      setSavingId(entryId);
      try {
        await onDeleteEntry(entryId);
        setExpandedId(null);
      } catch (e) {
        Alert.alert("Delete failed", e instanceof Error ? e.message : String(e));
      } finally {
        setSavingId(null);
      }
    };

    if (Platform.OS === "web") {
      const ok = typeof window !== "undefined" ? window.confirm("This record cannot be recovered. Delete?") : false;
      if (ok) void runDelete();
      return;
    }

    Alert.alert("Confirm delete", "This record cannot be recovered.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void runDelete() },
    ]);
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: slotTitleColor }]}>
        {config.label} ({config.range})
      </Text>
      {entries.map((e) =>
        editingId === e.id ? (
          <View key={e.id} style={[styles.entry, { backgroundColor: slotBg }]}>
            <Text style={styles.time}>{formatTime(e.created_at)}</Text>
            <View style={styles.content}>
              <View style={styles.summaryRow}>
                <TextInput
                  style={styles.input}
                  value={draftSummary}
                  onChangeText={setDraftSummary}
                  multiline
                />
                <View style={styles.iconActionsInline}>
                  <TouchableOpacity
                    style={[styles.iconBtn, styles.iconBtnNeutral]}
                    onPress={cancelEdit}
                    disabled={savingId === e.id}
                  >
                    <Text style={styles.iconTextNeutral}>✕</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.iconBtn, styles.iconBtnNeutral]}
                    onPress={() => confirmUpdate(e.id)}
                    disabled={savingId === e.id}
                  >
                    <Text style={styles.iconTextNeutral}>✓</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View key={e.id} style={[styles.entry, { backgroundColor: slotBg }]}>
            <TouchableOpacity
              style={styles.entryMain}
              activeOpacity={0.8}
              onPress={() => setExpandedId((prev) => (prev === e.id ? null : e.id))}
            >
              <Text style={styles.time}>{formatTime(e.created_at)}</Text>
              <View style={styles.content}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summary}>{e.summary}</Text>
                  {expandedId === e.id && (
                    <View style={styles.iconActionsInline}>
                      <TouchableOpacity
                        style={[styles.iconBtn, styles.iconBtnNeutral]}
                        onPress={() => startEdit(e)}
                        disabled={savingId === e.id}
                      >
                        <Text style={styles.iconTextNeutral}>✎</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.iconBtn, styles.iconBtnNeutral]}
                        onPress={() => confirmDelete(e.id)}
                        disabled={savingId === e.id}
                      >
                        <Text style={styles.iconTextNeutral}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 14, fontWeight: "600", marginBottom: 12 },
  entry: {
    flexDirection: "row",
    marginBottom: 10,
    paddingLeft: 14,
    paddingVertical: 10,
    paddingRight: 10,
    borderLeftWidth: 3,
    borderLeftColor: theme.border,
    alignItems: "flex-start",
    borderRadius: 12,
  },
  entryMain: { flex: 1, flexDirection: "row", alignItems: "flex-start" },
  time: { fontSize: 12, color: theme.textMuted, width:36, marginRight: 10 },
  content: { flex: 1 },
  summaryRow: { flexDirection: "row", alignItems: "flex-start" },
  summary: { flex: 1, fontSize: 15, color: theme.text, lineHeight: 23 },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.text,
    backgroundColor: theme.bgCard,
    minHeight: 64,
    textAlignVertical: "top",
    flex: 1,
  },
  iconActionsInline: { flexDirection: "row", gap: 6, marginLeft: 10, marginTop: 2 },
  iconBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnNeutral: { backgroundColor: theme.bgSecondary, borderWidth: 1, borderColor: theme.border },
  iconTextNeutral: { fontSize: 12, color: theme.textSecondary, fontWeight: "600" },
});
