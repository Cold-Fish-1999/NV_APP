import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Dimensions,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Animated,
  Easing,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useHeaderHeight } from "@/components/SharedHeader";
import { fontSerif, FONT_SANS, FONT_SANS_MEDIUM, FONT_SANS_BOLD } from "@/lib/fonts";
import { useAuth } from "@/contexts/auth";
import { useSubscription } from "@/contexts/subscription";
import { showUpgradePrompt } from "@/lib/showUpgradePrompt";
import { supabase } from "@/lib/supabase";
import {
  analyzeProfileDocumentUploads,
  scheduleDocumentContextRefreshAfterDelete,
} from "@/lib/api";
import {
  createProfileDocumentUploads,
  deleteProfileDocumentRecord,
  fetchProfileDocumentUploads,
  updateProfileDocumentRecordSummary,
  type ProfileDocumentUpload,
} from "@/lib/profileService";
import {
  CLIENT_UPLOAD_MAX_EDGE,
  MAX_CONTEXTS_PER_USER,
  MAX_IMAGES_PER_RECORD,
  MAX_UPLOADS_PER_ROLLING_WEEK,
  MAX_UPLOADS_PER_UTC_DAY,
  countDistinctContexts,
  countUploadsInRollingUtcWeek,
  countUploadsOnSameUtcDayAs,
  mapProfileDocumentLimitError,
} from "@/lib/docUploadLimits";

const DEFAULT_CATEGORY: ProfileDocumentUpload["category"] = "other_app";

type DraftImage = {
  localId: string;
  uri: string;
  base64?: string | null;
  mimeType: string;
  ext: string;
};

export default function ProfileDocumentsScreen() {
  const router = useRouter();
  const { state, session } = useAuth();
  const { status } = useSubscription();
  const isFree = status?.tier === "free";
  const [documents, setDocuments] = useState<ProfileDocumentUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftImages, setDraftImages] = useState<DraftImage[]>([]);
  const [backgroundText, setBackgroundText] = useState("");
  const [recordingDocs, setRecordingDocs] = useState(false);
  const [savingDocRecordId, setSavingDocRecordId] = useState<string | null>(null);
  const [deletingDocRecordId, setDeletingDocRecordId] = useState<string | null>(null);
  const [editingDocRecordId, setEditingDocRecordId] = useState<string | null>(null);
  const [docSummaryDraft, setDocSummaryDraft] = useState("");
  const [docPreviewUrls, setDocPreviewUrls] = useState<Record<string, string>>({});
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pendingAiRecordIds, setPendingAiRecordIds] = useState<Set<string>>(new Set());
  const [longPressRecordId, setLongPressRecordId] = useState<string | null>(null);
  const [showTimeRecordId, setShowTimeRecordId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const headerH = useHeaderHeight();
  const uploadSlideAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (showUploadModal) {
      uploadSlideAnim.setValue(1);
      Animated.spring(uploadSlideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 24,
        stiffness: 200,
      }).start();
    }
  }, [showUploadModal, uploadSlideAnim]);

  const closeUploadModal = useCallback(() => {
    Animated.timing(uploadSlideAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start(() => {
      setShowUploadModal(false);
      uploadSlideAnim.setValue(1);
    });
  }, [uploadSlideAnim]);

  const hydrateDocPreviews = useCallback(async (docs: ProfileDocumentUpload[]) => {
    if (!docs.length) {
      setDocPreviewUrls({});
      return;
    }
    const pairs = await Promise.all(
      docs.map(async (doc) => {
        const { data, error } = await supabase
          .storage
          .from(doc.storage_bucket)
          .createSignedUrl(doc.storage_path, 60 * 60);
        if (error || !data?.signedUrl) return [doc.id, ""] as const;
        return [doc.id, data.signedUrl] as const;
      })
    );
    setDocPreviewUrls(Object.fromEntries(pairs.filter(([, url]) => Boolean(url))));
  }, []);

  const loadDocuments = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      const docs = await fetchProfileDocumentUploads(session.user.id);
      setDocuments(docs);
      void hydrateDocPreviews(docs);
    } catch (e) {
      console.error("load documents:", e);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, hydrateDocPreviews]);

  useEffect(() => {
    if (state === "authenticated" && session?.user?.id) {
      loadDocuments();
    } else {
      setLoading(false);
    }
  }, [state, session?.user?.id, loadDocuments]);

  // 轮询 AI 分析完成，自动刷新展示
  useEffect(() => {
    if (pendingAiRecordIds.size === 0 || !session?.user?.id) return;
    const poll = async () => {
      const docs = await fetchProfileDocumentUploads(session.user.id);
      const byRecord = new Map<string, ProfileDocumentUpload[]>();
      for (const d of docs) {
        const k = d.record_id || d.id;
        if (!byRecord.has(k)) byRecord.set(k, []);
        byRecord.get(k)!.push(d);
      }
      setDocuments(docs);
      void hydrateDocPreviews(docs);
      setPendingAiRecordIds((prev) => {
        const next = new Set(prev);
        for (const rid of prev) {
          const items = byRecord.get(rid) ?? [];
          const hasAiSummary = items.some((x) => (x.group_ai_summary ?? "").trim());
          const allReady = items.every((x) => x.status === "ready");
          if (hasAiSummary || allReady || items.length === 0) next.delete(rid);
        }
        return next;
      });
    };
    const id = setInterval(poll, 2500);
    poll();
    return () => clearInterval(id);
  }, [pendingAiRecordIds.size, session?.user?.id, hydrateDocPreviews]);

  const docRecords = useMemo(() => {
    const map = new Map<string, ProfileDocumentUpload[]>();
    for (const doc of documents) {
      const key = doc.record_id || doc.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(doc);
    }
    return Array.from(map.entries()).map(([recordId, items]) => {
      const sorted = [...items].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      const head = sorted[0];
      const fallbackItemSummary =
        sorted.map((x) => (x.user_summary ?? x.ai_summary ?? "").trim()).find((x) => x.length > 0) ?? "";
      const groupTitle = (head.group_title ?? "").trim();
      const groupUserSummary = (head.group_user_summary ?? "").trim();
      const groupAiSummary = (head.group_ai_summary ?? "").trim();
      const summary =
        groupUserSummary || groupAiSummary || fallbackItemSummary;
      const hasGroupSummaries = groupUserSummary || groupAiSummary;
      const isAiAnalyzing = sorted.some((x) => x.status === "processing");
      return {
        recordId,
        createdAt: head.created_at,
        title: groupTitle || "Medical Document",
        summary,
        groupUserSummary,
        groupAiSummary,
        fallbackItemSummary,
        hasGroupSummaries,
        isAiAnalyzing,
        items: sorted,
      };
    }).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [documents]);

  const pickDraftImages = async () => {
    const maxPerRecord = MAX_IMAGES_PER_RECORD;
    if (draftImages.length >= maxPerRecord) {
      Alert.alert("Limit reached", `Each document record can include up to ${MAX_IMAGES_PER_RECORD} images.`);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Please allow photo library access to upload.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.92,
      base64: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const remaining = maxPerRecord - draftImages.length;
    const picked = result.assets.slice(0, remaining);
    const next = picked.map((asset) => {
      const ext = (asset.fileName?.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ext.match(/^[a-z0-9]+$/) ? ext : "jpg";
      const mime = (asset.mimeType ?? "").toLowerCase();
      const isHeicLike =
        mime === "image/heic" ||
        mime === "image/heif" ||
        safeExt === "heic" ||
        safeExt === "heif";
      const finalExt = isHeicLike ? "jpg" : safeExt;
      const finalMime = isHeicLike ? "image/jpeg" : asset.mimeType ?? `image/${finalExt}`;
      return {
        localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        uri: asset.uri,
        base64: asset.base64 ?? null,
        mimeType: finalMime,
        ext: finalExt,
      } satisfies DraftImage;
    });
    setDraftImages((prev) => [...prev, ...next]);
    if (result.assets.length > picked.length) {
      Alert.alert("Limit reached", `Only the first ${remaining} image(s) were added for this document.`);
    }
  };

  const removeDraftImage = (localId: string) => {
    setDraftImages((prev) => prev.filter((x) => x.localId !== localId));
  };

  const saveDocRecord = async () => {
    if (!session?.user?.id) return;
    if (draftImages.length === 0) {
      Alert.alert("Notice", "Please select at least one image.");
      return;
    }
    const nowMs = Date.now();
    const n = draftImages.length;
    if (countDistinctContexts(documents) >= MAX_CONTEXTS_PER_USER) {
      Alert.alert(
        "Limit reached",
        `You can have at most ${MAX_CONTEXTS_PER_USER} document records. Delete one to add a new record.`
      );
      return;
    }
    const todayCount = countUploadsOnSameUtcDayAs(documents, nowMs);
    if (todayCount + n > MAX_UPLOADS_PER_UTC_DAY) {
      Alert.alert(
        "Daily limit",
        `You can upload at most ${MAX_UPLOADS_PER_UTC_DAY} images per UTC day (${todayCount} already today).`
      );
      return;
    }
    const weekCount = countUploadsInRollingUtcWeek(documents, nowMs);
    if (weekCount + n > MAX_UPLOADS_PER_ROLLING_WEEK) {
      Alert.alert(
        "Weekly limit",
        `You can upload at most ${MAX_UPLOADS_PER_ROLLING_WEEK} images in any rolling 7-day window (${weekCount} in the last 7 days).`
      );
      return;
    }
    setRecordingDocs(true);
    try {
      const bucket = "profile-documents";
      const recordId = `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const payloads: Array<{
        record_id: string;
        category: ProfileDocumentUpload["category"];
        storage_bucket: string;
        storage_path: string;
        mime_type?: string | null;
      }> = [];

      for (const img of draftImages) {
        const path = `${session.user.id}/${recordId}-${img.localId}.${img.ext}`;
        // 统一转成 JPEG，避免 HEIC/HEIF 在服务端无法解析
        const { uri: jpegUri } = await ImageManipulator.manipulateAsync(
          img.uri,
          [{ resize: { width: CLIENT_UPLOAD_MAX_EDGE } }],
          {
            format: ImageManipulator.SaveFormat.JPEG,
            compress: 0.85,
          }
        );

        // 始终以转换后的 JPEG 作为上传源，避免 base64 仍是 HEIC 的情况
        const fileRes = await fetch(jpegUri);
        if (!fileRes.ok) throw new Error(`Failed to read image: ${fileRes.status}`);
        const fileBuffer = await fileRes.arrayBuffer();
        if (!fileBuffer || fileBuffer.byteLength === 0) {
          throw new Error("Image content is empty. Please select another image and try again.");
        }
        const uploadPayload =
          Platform.OS === "web" ? new Blob([fileBuffer], { type: img.mimeType }) : fileBuffer;
        const { error: uploadErr } = await supabase.storage.from(bucket).upload(path, uploadPayload, {
          contentType: img.mimeType,
          upsert: false,
        });
        if (uploadErr) throw uploadErr;
        payloads.push({
          record_id: recordId,
          category: DEFAULT_CATEGORY,
          storage_bucket: bucket,
          storage_path: path,
          mime_type: img.mimeType,
        });
      }

      const createdRows = await createProfileDocumentUploads(session.user.id, payloads);

      const userBackground = backgroundText.trim();
      if (userBackground) {
        try {
          await updateProfileDocumentRecordSummary(recordId, userBackground);
        } catch {
          // 忽略背景信息保存失败
        }
      }

      // AI 分析异步执行，不阻塞前端；备注与图片一起传给 AI 生成 context 描述
      const uploadIds = createdRows.map((r) => r.id);
      const token = session.access_token;
      void analyzeProfileDocumentUploads(uploadIds, token, userBackground || null).catch((err) =>
        console.error("AI总结失败:", err)
      );

      setDraftImages([]);
      setBackgroundText("");
      closeUploadModal();
      await loadDocuments();
      setPendingAiRecordIds((prev) => new Set(prev).add(recordId));
      Alert.alert("Uploaded", "Successfully uploaded. AI is analyzing.");
    } catch (e: unknown) {
      console.error("记录失败:", e);
      const raw =
        typeof e === "object" && e !== null && "message" in e
          ? String((e as { message: string }).message)
          : e instanceof Error
            ? e.message
            : String(e);
      const details =
        typeof e === "object" && e !== null && "details" in e
          ? String((e as { details?: string }).details ?? "")
          : "";
      const msg = mapProfileDocumentLimitError(`${raw} ${details}`);
      Alert.alert("Upload failed", msg);
    } finally {
      setRecordingDocs(false);
    }
  };

  const startEditDocSummary = (recordId: string, initialSummary: string) => {
    setEditingDocRecordId(recordId);
    setDocSummaryDraft(initialSummary.trim());
  };

  const saveDocSummary = async (recordId: string) => {
    const nextSummary = docSummaryDraft.trim();
    if (!nextSummary) {
      Alert.alert("Notice", "Summary cannot be empty.");
      return;
    }
    setSavingDocRecordId(recordId);
    try {
      await updateProfileDocumentRecordSummary(recordId, nextSummary);
      await loadDocuments();
      setEditingDocRecordId(null);
      setDocSummaryDraft("");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    } finally {
      setSavingDocRecordId(null);
    }
  };

  const performDeleteDocRecord = async (recordId: string) => {
    setDeletingDocRecordId(recordId);
    try {
      const items = documents.filter((d) => (d.record_id || d.id) === recordId);
      setDocuments((prev) => prev.filter((d) => (d.record_id || d.id) !== recordId));
      setDocPreviewUrls((prev) => {
        const next = { ...prev };
        for (const item of items) delete next[item.id];
        return next;
      });

      await deleteProfileDocumentRecord(
        recordId,
        items.map((x) => x.id)
      );

      if (items.length > 0) {
        const bucket = items[0].storage_bucket;
        const paths = items.map((x) => x.storage_path);
        void supabase.storage.from(bucket).remove(paths).catch(() => undefined);
      }
      const wasHealthDoc = items.some((x) =>
        (x.group_title ?? "") !== "Not a health document" && (x.ai_summary ?? "").trim() !== ""
      );
      if (wasHealthDoc) {
        void scheduleDocumentContextRefreshAfterDelete(session?.access_token).catch(() => undefined);
      }

      Alert.alert("Deleted", "Record has been deleted.");
    } catch (e) {
      await loadDocuments();
      Alert.alert("Delete failed", e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingDocRecordId(null);
    }
  };

  const deleteDocRecord = (recordId: string) => {
    if (Platform.OS === "web") {
      const ok =
        typeof window !== "undefined"
          ? window.confirm("This record and its images cannot be recovered. Delete?")
          : false;
      if (ok) void performDeleteDocRecord(recordId);
      return;
    }
    Alert.alert("Confirm delete", "This record and its images cannot be recovered.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void performDeleteDocRecord(recordId),
      },
    ]);
  };

  if (state !== "authenticated") {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.title}>Documents</Text>
        <Text style={styles.hint}>Please sign in to use</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#e07c3c" />
      </View>
    );
  }

  const fabBottom = (insets.bottom > 0 ? insets.bottom - 12 : 12) + 52 + 16;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingTop: headerH + 12 }]}>
        {docRecords.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="document-text-outline" size={40} color={DOC_THEME.border} />
            <Text style={styles.emptyHint}>
              No medical records yet.{"\n"}Tap + to upload lab reports, prescriptions, or health app screenshots.
            </Text>
          </View>
        ) : (
          docRecords.map((record) => {
            const isEditing = editingDocRecordId === record.recordId;
            const isLongPressed = longPressRecordId === record.recordId;
            const hasAnySummary =
              record.groupUserSummary ||
              record.groupAiSummary ||
              record.fallbackItemSummary;
            const displaySummary = record.groupAiSummary || record.fallbackItemSummary || "";
            const dateStr = new Date(record.createdAt).toLocaleDateString(undefined, {
              year: "numeric", month: "short", day: "numeric",
            });

            return (
              <View key={record.recordId} style={styles.docCardWrap}>
                <Pressable
                  style={[styles.docCard, isLongPressed && styles.docCardActive]}
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setLongPressRecordId(isLongPressed ? null : record.recordId);
                  }}
                  onPress={() => setShowTimeRecordId(
                    showTimeRecordId === record.recordId ? null : record.recordId
                  )}
                  delayLongPress={400}
                >
                  <View style={styles.titleRow}>
                    {record.isAiAnalyzing && (
                      <ActivityIndicator size="small" color={DOC_THEME.accent} style={styles.titleSpinner} />
                    )}
                    <Text style={[styles.docTitle, record.isAiAnalyzing && styles.docTitleMuted, !record.isAiAnalyzing && { fontFamily: fontSerif(record.title) }]} numberOfLines={2}>
                      {record.isAiAnalyzing ? "Analyzing…" : record.title}
                    </Text>
                  </View>

                  {isEditing ? (
                    <TextInput
                      style={styles.noteInput}
                      value={docSummaryDraft}
                      onChangeText={setDocSummaryDraft}
                      multiline
                      placeholder="Add your notes…"
                      placeholderTextColor={DOC_THEME.textSecondary}
                      autoFocus
                    />
                  ) : record.groupUserSummary ? (
                    <Text style={[styles.docNotes, { fontFamily: fontSerif(record.groupUserSummary) }]}>{record.groupUserSummary}</Text>
                  ) : null}

                  {!isEditing && !record.isAiAnalyzing && (
                    displaySummary ? (
                      <Text style={[styles.docDesc, { fontFamily: fontSerif(displaySummary) }]}>{displaySummary}</Text>
                    ) : !hasAnySummary ? (
                      <Text style={styles.docDescMuted}>Processing…</Text>
                    ) : null
                  )}

                  {!isEditing && record.items.some((img) => docPreviewUrls[img.id]) && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbScroll}>
                      <View style={styles.thumbRow}>
                        {record.items.map((img) =>
                          docPreviewUrls[img.id] ? (
                            <TouchableOpacity
                              key={img.id}
                              onPress={() => setViewImageUrl(docPreviewUrls[img.id])}
                              activeOpacity={0.8}
                            >
                              <Image
                                source={{ uri: docPreviewUrls[img.id] }}
                                style={styles.thumbImage}
                                resizeMode="cover"
                              />
                            </TouchableOpacity>
                          ) : null
                        )}
                      </View>
                    </ScrollView>
                  )}

                  {(isLongPressed || isEditing) && (
                    <View style={styles.longPressActions}>
                      {isEditing ? (
                        <>
                          <TouchableOpacity
                            style={styles.circleBtn}
                            onPress={() => { setEditingDocRecordId(null); setDocSummaryDraft(""); }}
                          >
                            <Ionicons name="arrow-undo-outline" size={15} color={DOC_THEME.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.circleBtn, styles.circleBtnSave]}
                            onPress={() => saveDocSummary(record.recordId)}
                            disabled={savingDocRecordId === record.recordId}
                          >
                            {savingDocRecordId === record.recordId ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Ionicons name="checkmark" size={15} color="#fff" />
                            )}
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <TouchableOpacity
                            style={styles.circleBtn}
                            onPress={() => setLongPressRecordId(null)}
                          >
                            <Ionicons name="arrow-undo-outline" size={15} color={DOC_THEME.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.circleBtn, styles.circleBtnEdit]}
                            onPress={() => {
                              startEditDocSummary(record.recordId, record.groupUserSummary || "");
                              setLongPressRecordId(null);
                            }}
                          >
                            <Ionicons name="create-outline" size={15} color="#fff" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.circleBtn, styles.circleBtnDelete]}
                            onPress={() => {
                              setLongPressRecordId(null);
                              deleteDocRecord(record.recordId);
                            }}
                            disabled={deletingDocRecordId === record.recordId}
                          >
                            <Ionicons name="trash-outline" size={15} color="#fff" />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}
                </Pressable>

                {showTimeRecordId === record.recordId && (
                  <Text style={styles.docDate}>{dateStr}</Text>
                )}
              </View>
            );
          })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { bottom: fabBottom }]}
        onPress={() => {
          if (recordingDocs) return;
          if (showUploadModal) {
            if (draftImages.length > 0) {
              saveDocRecord();
            } else {
              closeUploadModal();
            }
            return;
          }
          if (isFree) {
            showUpgradePrompt("upload_document", router);
            return;
          }
          setShowUploadModal(true);
        }}
        disabled={recordingDocs}
        activeOpacity={0.8}
      >
        {recordingDocs ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons
            name={showUploadModal && draftImages.length > 0 ? "checkmark" : showUploadModal ? "close" : "add"}
            size={24}
            color="#fff"
          />
        )}
      </TouchableOpacity>

      {showUploadModal && (
        <>
          <Animated.View
            style={[styles.uploadOverlay, { opacity: uploadSlideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={closeUploadModal} />
          </Animated.View>

          <KeyboardAvoidingView
            style={styles.uploadCardWrap}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
            pointerEvents="box-none"
          >
            <Animated.View
              style={[
                styles.uploadCard,
                { bottom: fabBottom + 52 + 12 },
                { transform: [{ translateY: uploadSlideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 400] }) }] },
              ]}
            >
              <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
              <View style={styles.uploadGlassShine} pointerEvents="none" />
              <View style={styles.uploadGlassEdge} pointerEvents="none" />

              <Text style={styles.uploadHint}>
                Upload lab reports, prescriptions, or health app screenshots for AI analysis
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.draftListContent}
              >
                <View style={styles.previewRow}>
                  {draftImages.map((img) => (
                    <View key={img.localId} style={styles.draftItem}>
                      <TouchableOpacity onPress={() => setViewImageUrl(img.uri)} activeOpacity={1}>
                        <Image source={{ uri: img.uri }} style={styles.previewImage} resizeMode="cover" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.removeBadge} onPress={() => removeDraftImage(img.localId)}>
                        <Text style={styles.removeBadgeText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addTile} onPress={pickDraftImages}>
                    <Ionicons name="add" size={20} color={DOC_THEME.textSecondary} />
                  </TouchableOpacity>
                </View>
              </ScrollView>

              {draftImages.length > 0 && (
                <TextInput
                  style={styles.uploadNoteInput}
                  value={backgroundText}
                  onChangeText={setBackgroundText}
                  placeholder="Add notes (optional)…"
                  placeholderTextColor={DOC_THEME.textSecondary}
                  multiline
                  numberOfLines={2}
                />
              )}
            </Animated.View>
          </KeyboardAvoidingView>
        </>
      )}

      <Modal
        visible={!!viewImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setViewImageUrl(null)}
      >
        <Pressable
          style={styles.imageModalOverlay}
          onPress={() => setViewImageUrl(null)}
        >
          <View style={styles.imageModalContent}>
            {viewImageUrl ? (
              <Image
                source={{ uri: viewImageUrl }}
                style={styles.imageModalImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.imageModalClose}
            onPress={() => setViewImageUrl(null)}
          >
            <Text style={styles.imageModalCloseText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </View>
  );
}

const DOC_THEME = {
  bg: "#f9faf5",
  bgCard: "#f5f5f3",
  border: "#e8e8e6",
  text: "#1a1a1a",
  textSecondary: "#9a9a9a",
  accent: "#e07c3c",
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DOC_THEME.bg },
  centered: { justifyContent: "center", alignItems: "center" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },
  title: { fontSize: 24, fontWeight: "600", marginBottom: 8, color: DOC_THEME.text, fontFamily: FONT_SANS_BOLD },
  hint: { fontSize: 14, color: DOC_THEME.textSecondary, fontFamily: FONT_SANS },

  emptyWrap: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyHint: {
    fontSize: 14,
    color: DOC_THEME.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    fontFamily: FONT_SANS,
  },

  docCardWrap: {
    marginBottom: 12,
  },
  docCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: DOC_THEME.border,
  },
  docCardActive: {
    borderColor: DOC_THEME.accent + "40",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleSpinner: {
    marginRight: 8,
  },
  docTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: DOC_THEME.text,
    lineHeight: 20,
    flexShrink: 1,
    fontFamily: FONT_SANS_BOLD,
  },
  docTitleMuted: {
    color: DOC_THEME.textSecondary,
  },
  docDesc: {
    fontSize: 13,
    color: DOC_THEME.textSecondary,
    lineHeight: 18,
    marginTop: 6,
  },
  docDescMuted: {
    fontSize: 13,
    color: DOC_THEME.textSecondary,
    fontStyle: "italic",
    marginTop: 6,
    fontFamily: FONT_SANS,
  },
  docNotes: {
    fontSize: 13,
    color: DOC_THEME.accent,
    marginTop: 6,
    lineHeight: 18,
  },
  noteInput: {
    marginTop: 6,
    backgroundColor: DOC_THEME.bg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: DOC_THEME.text,
    borderWidth: 1,
    borderColor: DOC_THEME.border,
    minHeight: 36,
    textAlignVertical: "top" as const,
    fontFamily: FONT_SANS,
  },
  thumbScroll: {
    marginTop: 10,
  },
  thumbRow: {
    flexDirection: "row",
    gap: 6,
  },
  thumbImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: DOC_THEME.border,
  },
  docDate: {
    fontSize: 11,
    color: DOC_THEME.textSecondary,
    textAlign: "right",
    marginTop: 4,
    marginRight: 4,
    fontFamily: FONT_SANS,
  },
  longPressActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  circleBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: DOC_THEME.border + "60",
    alignItems: "center",
    justifyContent: "center",
  },
  circleBtnSave: {
    backgroundColor: DOC_THEME.accent,
  },
  circleBtnEdit: {
    backgroundColor: DOC_THEME.accent,
  },
  circleBtnDelete: {
    backgroundColor: "#dc2626",
  },

  fab: {
    position: "absolute",
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: DOC_THEME.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 20,
  },

  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.15)",
    zIndex: 10,
  },
  uploadCardWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 11,
    pointerEvents: "box-none",
  },
  uploadCard: {
    position: "absolute",
    right: 16,
    left: 16,
    borderRadius: 20,
    overflow: "hidden",
    padding: 14,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.5)",
  },
  uploadGlassShine: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
  },
  uploadGlassEdge: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 20,
    borderWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.6)",
    borderLeftColor: "rgba(255,255,255,0.3)",
    borderRightColor: "rgba(255,255,255,0.1)",
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  uploadHint: {
    fontSize: 12,
    color: DOC_THEME.textSecondary,
    lineHeight: 16,
    marginBottom: 10,
    fontFamily: FONT_SANS,
  },
  uploadNoteInput: {
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: DOC_THEME.text,
    minHeight: 36,
    textAlignVertical: "top" as const,
    fontFamily: FONT_SANS,
  },
  draftListContent: { paddingVertical: 4, paddingRight: 8 },
  draftItem: { position: "relative" },
  removeBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(239,68,68,0.95)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  removeBadgeText: { color: "#fff", fontSize: 16, lineHeight: 18, fontWeight: "700", fontFamily: FONT_SANS_BOLD },
  addTile: {
    width: 84,
    height: 84,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DOC_THEME.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DOC_THEME.bgCard,
  },
  previewRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  previewImage: {
    width: 84,
    height: 84,
    borderRadius: 8,
    backgroundColor: DOC_THEME.border,
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageModalContent: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  imageModalImage: {
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height * 0.8,
  },
  imageModalClose: {
    position: "absolute",
    bottom: 48,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  imageModalCloseText: { color: "#fff", fontSize: 16, fontWeight: "600", fontFamily: FONT_SANS_BOLD },
});
