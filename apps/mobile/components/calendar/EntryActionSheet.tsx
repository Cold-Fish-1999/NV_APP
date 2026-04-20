import { useCallback, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Modal,
  Pressable,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { calendarTheme as theme } from "@/lib/calendarTheme";
import { FONT_SANS, FONT_SANS_MEDIUM, FONT_SANS_BOLD } from "@/lib/fonts";
import { useAuth } from "@/contexts/auth";
import { useSubscription } from "@/contexts/subscription";
import { generateSymptomMeta } from "@/lib/api";
import {
  getKeywordsFromEntry,
  symptomCategoryNeedsKeywords,
  type SymptomEntry,
} from "@/types/calendar";

interface EntryActionSheetProps {
  entry: SymptomEntry | null;
  onClose: () => void;
  onUpdateEntry: (
    entryId: string,
    nextSummary: string,
    keywords?: string[] | null,
    severity?: string,
  ) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
}

export function EntryActionSheet({
  entry,
  onClose,
  onUpdateEntry,
  onDeleteEntry,
}: EntryActionSheetProps) {
  const { session } = useAuth();
  const { status: sub } = useSubscription();
  const { height: screenH } = useWindowDimensions();
  const slideAnim = useRef(new Animated.Value(screenH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"actions" | "edit">("actions");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entry) {
      setMode("actions");
      setDraft(entry.summary);
      setVisible(true);
      slideAnim.setValue(screenH);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      dismiss();
    }
  }, [entry]);

  const dismiss = useCallback(() => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: screenH,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      setMode("actions");
      onClose();
    });
  }, [onClose, screenH, slideAnim, backdropAnim]);

  const handleEdit = () => {
    if (!entry) return;
    setDraft(entry.summary);
    setMode("edit");
  };

  const handleSave = async () => {
    if (!entry) return;
    const next = draft.trim();
    if (!next) {
      Alert.alert("Notice", "Content cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      let keywords: string[] | undefined = undefined;
      let severity: string | undefined = undefined;
      const needsKw = symptomCategoryNeedsKeywords(entry.category);
      const existingKw = getKeywordsFromEntry(entry);
      if (needsKw && existingKw.length === 0 && sub?.isPro) {
        const auto = await generateSymptomMeta(next, session?.access_token ?? null, {
          category:
            entry.category === "symptom_feeling" || entry.category === "medication_supplement"
              ? entry.category
              : undefined,
        });
        if (auto.keywords.length > 0) {
          keywords = auto.keywords;
          severity = auto.severity;
        }
      }
      await onUpdateEntry(entry.id, next, keywords, severity);
      dismiss();
    } catch (e) {
      Alert.alert("Update failed", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!entry) return;
    const runDelete = async () => {
      setSaving(true);
      try {
        await onDeleteEntry(entry.id);
        dismiss();
      } catch (e) {
        Alert.alert("Delete failed", e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
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

  if (!visible) return null;

  return (
    <Modal transparent visible statusBarTranslucent animationType="none">
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Backdrop */}
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss}>
          <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]} />
        </Pressable>

        {/* Sheet */}
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
        >
          {/* Handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          {/* Card — read-only preview OR inline edit */}
          <View style={[styles.preview, mode === "edit" && styles.previewEditing]}>
            {mode === "edit" ? (
              <TextInput
                style={styles.previewInput}
                value={draft}
                onChangeText={setDraft}
                multiline
                autoFocus
                placeholder="Symptom description…"
                placeholderTextColor={theme.textMuted}
              />
            ) : (
              <Text style={styles.previewText}>{entry?.summary}</Text>
            )}
          </View>

          {mode === "actions" ? (
            <View style={styles.actionsWrap}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleEdit}
                disabled={saving}
                activeOpacity={0.6}
              >
                <View style={[styles.actionIcon, { backgroundColor: "#F0ECE6" }]}>
                  <Ionicons name="pencil-outline" size={18} color={theme.text} />
                </View>
                <Text style={styles.actionLabel}>Edit</Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleDelete}
                disabled={saving}
                activeOpacity={0.6}
              >
                <View style={[styles.actionIcon, { backgroundColor: "#FDECEC" }]}>
                  <Ionicons name="trash-outline" size={18} color="#D94040" />
                </View>
                <Text style={[styles.actionLabel, { color: "#D94040" }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.editButtons}>
              <TouchableOpacity
                style={styles.editBtnCancel}
                onPress={() => setMode("actions")}
                disabled={saving}
              >
                <Text style={styles.editBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editBtnSave, saving && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.editBtnSaveText}>{saving ? "Saving…" : "Save"}</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },

  sheet: {
    backgroundColor: "#FAFAF8",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
  },

  handleWrap: { alignItems: "center", paddingVertical: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#D4D0CA" },

  preview: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 20,
  },
  previewEditing: {
    borderColor: theme.primary,
    borderWidth: 1.5,
  },
  previewText: { fontSize: 15, fontFamily: FONT_SANS, color: theme.text, lineHeight: 23 },
  previewInput: {
    fontSize: 15,
    fontFamily: FONT_SANS,
    color: theme.text,
    lineHeight: 23,
    minHeight: 60,
    textAlignVertical: "top",
    padding: 0,
  },

  actionsWrap: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.border,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  actionLabel: { fontSize: 16, fontWeight: "500", fontFamily: FONT_SANS_MEDIUM, color: theme.text },
  divider: { height: 1, backgroundColor: theme.border, marginLeft: 64 },

  editButtons: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  editBtnCancel: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: theme.bgSecondary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  editBtnCancelText: { fontSize: 15, fontWeight: "500", fontFamily: FONT_SANS_MEDIUM, color: theme.textSecondary },
  editBtnSave: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: theme.primary,
  },
  editBtnSaveText: { fontSize: 15, fontWeight: "600", fontFamily: FONT_SANS_BOLD, color: "#fff" },
});
