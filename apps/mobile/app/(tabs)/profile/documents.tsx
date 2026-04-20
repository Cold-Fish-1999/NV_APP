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
  Pressable,
  Keyboard,
  TouchableWithoutFeedback,
  Animated,
  Easing,
  LayoutAnimation,
  UIManager,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useHeaderHeight } from "@/components/SharedHeader";
import { fontSerif, FONT_SANS,FONT_SANS_SEMIBOLD, FONT_SANS_MEDIUM, FONT_SANS_BOLD } from "@/lib/fonts";
import { useAuth } from "@/contexts/auth";
import { useSubscription } from "@/contexts/subscription";
import { showUpgradePrompt } from "@/lib/showUpgradePrompt";
import { supabase } from "@/lib/supabase";
import {
  analyzeProfileDocumentUploads,
  scheduleDocumentContextRefreshAfterDelete,
} from "@/lib/api";
import { Picker } from "@react-native-picker/picker";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import {
  createProfileDocumentUploads,
  deleteProfileDocumentRecord,
  fetchProfileDocumentUploads,
  updateProfileDocumentRecordSummary,
  updateProfileDocumentRecordMeta,
  DOC_CATEGORY_LABELS,
  DOC_CATEGORY_ORDER,
  normalizeDocCategory,
  type ProfileDocumentUpload,
  type DocCategory,
} from "@/lib/profileService";
import {
  CLIENT_UPLOAD_MAX_EDGE,
  MAX_CONTEXTS_PER_USER,
  MAX_DOCUMENT_FILES_PER_RECORD,
  MAX_IMAGES_PER_RECORD,
  MAX_UPLOADS_PER_ROLLING_WEEK,
  MAX_UPLOADS_PER_UTC_DAY,
  countDistinctContexts,
  countUploadsInRollingUtcWeek,
  countUploadsOnSameUtcDayAs,
  mapProfileDocumentLimitError,
} from "@/lib/docUploadLimits";
import { guessDocumentPreviewKind, type DocumentPreviewKind } from "@/lib/documentPreviewUtils";
import { keyboardLiftForCard } from "@/lib/keyboardCardLift";
import {
  computeFabBottom,
  computeCardBottomAboveFab,
  FAB_SIZE_PX,
  FAB_FROM_RIGHT_PX,
  CARD_FROM_LEFT_PX,
  CARD_FROM_RIGHT_PX,
} from "@/lib/fabCardLayout";
import { DocumentPreviewModal } from "@/components/documents/DocumentPreviewModal";

const DEFAULT_CATEGORY: DocCategory = "other";
const UPLOAD_CATEGORIES: { value: DocCategory; label: string }[] = DOC_CATEGORY_ORDER.map((value) => ({
  value,
  label: DOC_CATEGORY_LABELS[value],
}));

const DOCUMENT_EXTENSIONS = new Set(["pdf", "docx", "doc", "txt", "md"]);

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function buildYearOptions(): number[] {
  const cur = new Date().getFullYear();
  const out: number[] = [];
  for (let y = cur; y >= cur - 30; y--) out.push(y);
  return out;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatDateChip(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

type DraftImage = {
  localId: string;
  uri: string;
  base64?: string | null;
  mimeType: string;
  ext: string;
};

function isDocumentDraft(d: DraftImage): boolean {
  return DOCUMENT_EXTENSIONS.has(d.ext.toLowerCase());
}

export default function ProfileDocumentsScreen() {
  const router = useRouter();
  const { state, session } = useAuth();
  const { status } = useSubscription();
  const isFree = status?.tier === "free";
  const [documents, setDocuments] = useState<ProfileDocumentUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftImages, setDraftImages] = useState<DraftImage[]>([]);
  const [draftCategory, setDraftCategory] = useState<DocCategory>(DEFAULT_CATEGORY);
  const [draftReportDate, setDraftReportDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [backgroundText, setBackgroundText] = useState("");
  const [recordingDocs, setRecordingDocs] = useState(false);
  const [savingDocRecordId, setSavingDocRecordId] = useState<string | null>(null);
  const [deletingDocRecordId, setDeletingDocRecordId] = useState<string | null>(null);
  const [editingDocRecordId, setEditingDocRecordId] = useState<string | null>(null);
  const [docSummaryDraft, setDocSummaryDraft] = useState("");
  const [editCategory, setEditCategory] = useState<DocCategory>(DEFAULT_CATEGORY);
  const [editReportDate, setEditReportDate] = useState(new Date());
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [docPreviewUrls, setDocPreviewUrls] = useState<Record<string, string>>({});
  const [filePreview, setFilePreview] = useState<{
    uri: string;
    kind: DocumentPreviewKind;
    title: string;
  } | null>(null);

  const openFilePreview = useCallback((uri: string, mime: string | null, filenameOrPath: string) => {
    setFilePreview({
      uri,
      kind: guessDocumentPreviewKind(mime, filenameOrPath),
      title: filenameOrPath.includes("/") ? filenameOrPath.split("/").pop() ?? "File" : filenameOrPath,
    });
  }, []);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pendingAiRecordIds, setPendingAiRecordIds] = useState<Set<string>>(new Set());
  const [longPressRecordId, setLongPressRecordId] = useState<string | null>(null);
  const [showTimeRecordId, setShowTimeRecordId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const headerH = useHeaderHeight();
  const uploadSlideAnim = useRef(new Animated.Value(1)).current;
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
      setShowDatePicker(false);
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
      const isAiError = !isAiAnalyzing && sorted.some((x) => x.status === "error");
      return {
        recordId,
        createdAt: head.created_at,
        reportDate: head.report_date ?? null,
        category: normalizeDocCategory(head.category),
        title: groupTitle || "Medical Document",
        summary,
        groupUserSummary,
        groupAiSummary,
        fallbackItemSummary,
        hasGroupSummaries,
        isAiAnalyzing,
        isAiError,
        items: sorted,
      };
    }).sort((a, b) => {
      const da = a.reportDate ?? a.createdAt;
      const db = b.reportDate ?? b.createdAt;
      return +new Date(db) - +new Date(da);
    });
  }, [documents]);

  const groupedByCategory = useMemo(() => {
    const groups = new Map<DocCategory, typeof docRecords>();
    for (const rec of docRecords) {
      const cat = rec.category;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(rec);
    }
    return DOC_CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({
      category: c,
      label: DOC_CATEGORY_LABELS[c],
      records: groups.get(c)!,
    }));
  }, [docRecords]);

  const pickDraftImages = async () => {
    if (draftImages.some(isDocumentDraft)) {
      Alert.alert(
        "Photos or document",
        "Remove the document file first. You can upload either photos (up to 6) or one document file, not both.",
      );
      return;
    }
    const maxPerRecord = MAX_IMAGES_PER_RECORD;
    if (draftImages.length >= maxPerRecord) {
      Alert.alert("Limit reached", `You can add up to ${maxPerRecord} photos in one upload.`);
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

  const pickFile = async () => {
    if (draftImages.some((d) => !isDocumentDraft(d))) {
      Alert.alert(
        "Photos or document",
        "Remove photos first. You can upload either photos (up to 6) or one document file, not both.",
      );
      return;
    }
    if (draftImages.some(isDocumentDraft)) {
      Alert.alert("Limit reached", "Only one document file (PDF/Word) per upload.");
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
      ],
      multiple: false,
    });
    if (result.canceled || !result.assets?.length) return;
    const picked = result.assets.slice(0, MAX_DOCUMENT_FILES_PER_RECORD);
    const next: DraftImage[] = picked.map((asset) => {
      const name = asset.name ?? "file";
      const ext = name.split(".").pop()?.toLowerCase() ?? "pdf";
      const mime = asset.mimeType ?? "application/pdf";
      return {
        localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        uri: asset.uri,
        base64: null,
        mimeType: mime,
        ext,
      };
    });
    setDraftImages((prev) => [...prev, ...next]);
  };

  const removeDraftImage = (localId: string) => {
    setDraftImages((prev) => prev.filter((x) => x.localId !== localId));
  };

  const saveDocRecord = async () => {
    if (!session?.user?.id) return;
    if (draftImages.length === 0) {
      Alert.alert("Notice", "Please select at least one image or file.");
      return;
    }
    const docDrafts = draftImages.filter(isDocumentDraft);
    const imgDrafts = draftImages.filter((d) => !isDocumentDraft(d));
    if (docDrafts.length > 0 && imgDrafts.length > 0) {
      Alert.alert("Invalid selection", "Cannot mix photos and a document file in one upload.");
      return;
    }
    if (docDrafts.length > MAX_DOCUMENT_FILES_PER_RECORD) {
      Alert.alert("Limit reached", "Only one document file per upload.");
      return;
    }
    if (imgDrafts.length > MAX_IMAGES_PER_RECORD) {
      Alert.alert("Limit reached", `At most ${MAX_IMAGES_PER_RECORD} photos per upload.`);
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
        category: DocCategory;
        storage_bucket: string;
        storage_path: string;
        mime_type?: string | null;
        report_date?: string | null;
      }> = [];

      for (const img of draftImages) {
        const path = `${session.user.id}/${recordId}-${img.localId}.${img.ext}`;
        const isDoc = DOCUMENT_EXTENSIONS.has(img.ext.toLowerCase());

        let uploadPayload: ArrayBuffer | Blob;
        let contentType = img.mimeType;

        if (isDoc) {
          const fileRes = await fetch(img.uri);
          if (!fileRes.ok) throw new Error(`Failed to read file: ${fileRes.status}`);
          const fileBuffer = await fileRes.arrayBuffer();
          if (!fileBuffer || fileBuffer.byteLength === 0) {
            throw new Error("File content is empty.");
          }
          uploadPayload = Platform.OS === "web" ? new Blob([fileBuffer], { type: contentType }) : fileBuffer;
        } else {
          const { uri: jpegUri } = await ImageManipulator.manipulateAsync(
            img.uri,
            [{ resize: { width: CLIENT_UPLOAD_MAX_EDGE } }],
            { format: ImageManipulator.SaveFormat.JPEG, compress: 0.85 },
          );
          const fileRes = await fetch(jpegUri);
          if (!fileRes.ok) throw new Error(`Failed to read image: ${fileRes.status}`);
          const fileBuffer = await fileRes.arrayBuffer();
          if (!fileBuffer || fileBuffer.byteLength === 0) {
            throw new Error("Image content is empty. Please select another image and try again.");
          }
          uploadPayload = Platform.OS === "web" ? new Blob([fileBuffer], { type: img.mimeType }) : fileBuffer;
        }

        const { error: uploadErr } = await supabase.storage.from(bucket).upload(path, uploadPayload, {
          contentType,
          upsert: false,
        });
        if (uploadErr) throw uploadErr;
        const dateStr = draftReportDate.toISOString().slice(0, 10);
        payloads.push({
          record_id: recordId,
          category: draftCategory,
          storage_bucket: bucket,
          storage_path: path,
          mime_type: img.mimeType,
          report_date: dateStr,
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
      void analyzeProfileDocumentUploads(uploadIds, token, userBackground || null).catch(async (err) => {
        console.error("AI总结失败:", err);
        for (const uid of uploadIds) {
          await supabase
            .from("profile_document_uploads")
            .update({ status: "error" })
            .eq("id", uid)
            .eq("user_id", session.user.id);
        }
        await loadDocuments();
      });

      setDraftImages([]);
      setBackgroundText("");
      setDraftCategory(DEFAULT_CATEGORY);
      setDraftReportDate(new Date());
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

  const retryAiAnalysis = async (recordId: string) => {
    if (!session?.user?.id) return;
    const items = documents.filter((d) => (d.record_id || d.id) === recordId);
    const uploadIds = items.map((d) => d.id);
    if (uploadIds.length === 0) return;
    for (const uid of uploadIds) {
      await supabase
        .from("profile_document_uploads")
        .update({ status: "processing" })
        .eq("id", uid)
        .eq("user_id", session.user.id);
    }
    await loadDocuments();
    setPendingAiRecordIds((prev) => new Set(prev).add(recordId));
    const remark = items[0]?.group_user_summary?.trim() || "";
    void analyzeProfileDocumentUploads(uploadIds, session.access_token, remark || null).catch(
      async (err) => {
        console.error("AI retry失败:", err);
        for (const uid of uploadIds) {
          await supabase
            .from("profile_document_uploads")
            .update({ status: "error" })
            .eq("id", uid)
            .eq("user_id", session.user.id);
        }
        await loadDocuments();
      },
    );
  };

  const startEditDocSummary = (recordId: string, initialSummary: string, cat: string, repDate: string | null) => {
    setEditingDocRecordId(recordId);
    setDocSummaryDraft(initialSummary.trim());
    setEditCategory(normalizeDocCategory(cat));
    setEditReportDate(repDate ? new Date(repDate + "T12:00:00") : new Date());
  };

  const saveDocSummary = async (recordId: string) => {
    setSavingDocRecordId(recordId);
    try {
      await updateProfileDocumentRecordMeta(recordId, {
        category: editCategory,
        report_date: editReportDate.toISOString().slice(0, 10),
        group_user_summary: docSummaryDraft.trim() || undefined,
      });
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

  const fabBottom = computeFabBottom(insets.bottom);
  const uploadCardBottom = computeCardBottomAboveFab(fabBottom);

  const docModeOn = draftImages.length > 0 && isDocumentDraft(draftImages[0]);
  const imageModeOn = draftImages.length > 0 && !isDocumentDraft(draftImages[0]);
  const photoAddDisabled =
    docModeOn || (imageModeOn && draftImages.length >= MAX_IMAGES_PER_RECORD);
  const fileAddDisabled = imageModeOn || draftImages.some(isDocumentDraft);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingTop: headerH + 12 }]}>
        {docRecords.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="document-text-outline" size={40} color={DOC_THEME.border} />
            <Text style={styles.emptyHint}>
              No medical records yet.{"\n"}Tap + for Health Doc Upload.
            </Text>
          </View>
        ) : (
          groupedByCategory.map((group) => (
            <View key={group.category}>
              <Text style={styles.sectionHeader}>{group.label}</Text>
              {group.records.map((record) => {
            const isEditing = editingDocRecordId === record.recordId;
            const isLongPressed = longPressRecordId === record.recordId;
            const hasAnySummary =
              record.groupUserSummary ||
              record.groupAiSummary ||
              record.fallbackItemSummary;
            const displaySummary = record.groupAiSummary || record.fallbackItemSummary || "";
            const dateStr = record.reportDate
              ? new Date(record.reportDate + "T12:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
              : new Date(record.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

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
                    {record.isAiError && (
                      <Ionicons name="alert-circle" size={16} color="#c0392b" style={styles.titleSpinner} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.docTitle, (record.isAiAnalyzing || record.isAiError) && styles.docTitleMuted, !record.isAiAnalyzing && !record.isAiError && { fontFamily: fontSerif(record.title) }]} numberOfLines={2}>
                        {record.isAiAnalyzing ? "Analyzing…" : record.isAiError ? "Analysis failed" : record.title}
                      </Text>
                      {record.isAiError ? (
                        <TouchableOpacity onPress={() => retryAiAnalysis(record.recordId)}>
                          <Text style={styles.retryLink}>Tap to retry</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.docDate}>{dateStr}</Text>
                      )}
                    </View>
                  </View>

                  {isEditing ? (
                    <View>
                      <View style={styles.categoryRow}>
                        {UPLOAD_CATEGORIES.map((cat) => (
                          <TouchableOpacity
                            key={cat.value}
                            style={[styles.categoryChip, editCategory === cat.value && styles.categoryChipActive]}
                            onPress={() => setEditCategory(cat.value)}
                          >
                            <Text style={[styles.categoryChipText, editCategory === cat.value && styles.categoryChipTextActive]}>
                              {cat.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TouchableOpacity
                        style={styles.datePickerBtn}
                        onPress={() => {
                          LayoutAnimation.configureNext(
                            LayoutAnimation.create(280, "easeInEaseOut", "opacity"),
                          );
                          setShowEditDatePicker((v) => !v);
                        }}
                      >
                        <Ionicons name="calendar-outline" size={14} color={DOC_THEME.textSecondary} />
                        <Text style={styles.datePickerText}>
                          {formatDateChip(editReportDate)}
                        </Text>
                        <Ionicons
                          name={showEditDatePicker ? "chevron-up" : "chevron-down"}
                          size={12}
                          color={DOC_THEME.textSecondary}
                        />
                      </TouchableOpacity>
                      {showEditDatePicker && (
                        <View style={styles.pickerRow}>
                          <View style={styles.pickerClip}>
                            <Picker
                              selectedValue={editReportDate.getFullYear()}
                              onValueChange={(v) => {
                                const y = v as number;
                                setEditReportDate((prev) => {
                                  const maxD = daysInMonth(y, prev.getMonth());
                                  return new Date(y, prev.getMonth(), Math.min(prev.getDate(), maxD));
                                });
                              }}
                              style={styles.pickerInner}
                              itemStyle={styles.pickerItemText}
                            >
                              {buildYearOptions().map((y) => (
                                <Picker.Item key={y} label={String(y)} value={y} />
                              ))}
                            </Picker>
                          </View>
                          <View style={styles.pickerClip}>
                            <Picker
                              selectedValue={editReportDate.getMonth()}
                              onValueChange={(v) => {
                                const m = v as number;
                                setEditReportDate((prev) => {
                                  const maxD = daysInMonth(prev.getFullYear(), m);
                                  return new Date(prev.getFullYear(), m, Math.min(prev.getDate(), maxD));
                                });
                              }}
                              style={styles.pickerInner}
                              itemStyle={styles.pickerItemText}
                            >
                              {MONTH_LABELS.map((label, i) => (
                                <Picker.Item key={i} label={label} value={i} />
                              ))}
                            </Picker>
                          </View>
                          <View style={styles.pickerClip}>
                            <Picker
                              selectedValue={editReportDate.getDate()}
                              onValueChange={(v) => {
                                setEditReportDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), v as number));
                              }}
                              style={styles.pickerInner}
                              itemStyle={styles.pickerItemText}
                            >
                              {Array.from(
                                { length: daysInMonth(editReportDate.getFullYear(), editReportDate.getMonth()) },
                                (_, i) => i + 1,
                              ).map((d) => (
                                <Picker.Item key={d} label={String(d)} value={d} />
                              ))}
                            </Picker>
                          </View>
                        </View>
                      )}
                      <TextInput
                        style={styles.noteInput}
                        value={docSummaryDraft}
                        onChangeText={setDocSummaryDraft}
                        multiline
                        placeholder="Add your notes…"
                        placeholderTextColor={DOC_THEME.textSecondary}
                        autoFocus
                      />
                    </View>
                  ) : record.groupUserSummary ? (
                    <Text style={[styles.docNotes, { fontFamily: fontSerif(record.groupUserSummary) }]}>{record.groupUserSummary}</Text>
                  ) : null}

                  {!isEditing && !record.isAiAnalyzing && !record.isAiError && (
                    displaySummary ? (
                      <Text style={[styles.docDesc, { fontFamily: fontSerif(displaySummary) }]}>{displaySummary}</Text>
                    ) : !hasAnySummary ? (
                      <Text style={styles.docDescMuted}>Processing…</Text>
                    ) : null
                  )}

                  {!isEditing && record.items.some((img) => docPreviewUrls[img.id]) && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbScroll}>
                      <View style={styles.thumbRow}>
                        {record.items.map((img) => {
                          const url = docPreviewUrls[img.id];
                          if (!url) return null;
                          const kind = guessDocumentPreviewKind(img.mime_type, img.storage_path);
                          return (
                            <TouchableOpacity
                              key={img.id}
                              onPress={() => openFilePreview(url, img.mime_type, img.storage_path)}
                              activeOpacity={0.8}
                            >
                              {kind === "image" ? (
                                <Image source={{ uri: url }} style={styles.thumbImage} resizeMode="cover" />
                              ) : (
                                <View style={[styles.thumbImage, styles.thumbDocTile]}>
                                  <Ionicons
                                    name={kind === "pdf" ? "document-text" : "document-outline"}
                                    size={22}
                                    color={DOC_THEME.textSecondary}
                                  />
                                  <Text style={styles.thumbDocExt} numberOfLines={1}>
                                    {(img.storage_path.split(".").pop() ?? "file").toUpperCase()}
                                  </Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
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
                              startEditDocSummary(record.recordId, record.groupUserSummary || "", record.category, record.reportDate);
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

              </View>
            );
          })}
            </View>
          ))
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

          <View
            style={styles.uploadCardWrap}
            pointerEvents="box-none"
          >
            <Animated.View
              style={[
                styles.uploadCard,
                { bottom: uploadCardBottom },
                { transform: [
                  { translateY: uploadSlideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 400] }) },
                  { translateY: kbAnim },
                ] },
              ]}
            >
              <BlurView intensity={72} tint="light" style={StyleSheet.absoluteFill} />
              <View style={styles.uploadGlassShine} pointerEvents="none" />
              <View style={styles.uploadGlassFog} pointerEvents="none" />
              <View style={styles.uploadGlassEdge} pointerEvents="none" />

              {recordingDocs ? (
                <View style={styles.uploadBusyOverlay}>
                  <ActivityIndicator size="large" color={DOC_THEME.accent} />
                  <Text style={styles.uploadBusyText}>Uploading…</Text>
                </View>
              ) : null}

              <View style={styles.uploadTopRow}>
                <Text style={styles.uploadCardTitle} numberOfLines={1}>
                  Health Doc Upload
                </Text>
                <TouchableOpacity
                  style={styles.uploadDateChip}
                  onPress={() => {
                    LayoutAnimation.configureNext(
                      LayoutAnimation.create(280, "easeInEaseOut", "opacity"),
                    );
                    setShowDatePicker((v) => !v);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.uploadDateChipText}>
                    {formatDateChip(draftReportDate)}
                  </Text>
                  <Ionicons
                    name={showDatePicker ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={DOC_THEME.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <View style={styles.pickerRow}>
                  <View style={styles.pickerClip}>
                    <Picker
                      selectedValue={draftReportDate.getFullYear()}
                      onValueChange={(v) => {
                        const y = v as number;
                        setDraftReportDate((prev) => {
                          const maxD = daysInMonth(y, prev.getMonth());
                          return new Date(y, prev.getMonth(), Math.min(prev.getDate(), maxD));
                        });
                      }}
                      style={styles.pickerInner}
                      itemStyle={styles.pickerItemText}
                    >
                      {buildYearOptions().map((y) => (
                        <Picker.Item key={y} label={String(y)} value={y} />
                      ))}
                    </Picker>
                  </View>
                  <View style={styles.pickerClip}>
                    <Picker
                      selectedValue={draftReportDate.getMonth()}
                      onValueChange={(v) => {
                        const m = v as number;
                        setDraftReportDate((prev) => {
                          const maxD = daysInMonth(prev.getFullYear(), m);
                          return new Date(prev.getFullYear(), m, Math.min(prev.getDate(), maxD));
                        });
                      }}
                      style={styles.pickerInner}
                      itemStyle={styles.pickerItemText}
                    >
                      {MONTH_LABELS.map((label, i) => (
                        <Picker.Item key={i} label={label} value={i} />
                      ))}
                    </Picker>
                  </View>
                  <View style={styles.pickerClip}>
                    <Picker
                      selectedValue={draftReportDate.getDate()}
                      onValueChange={(v) => {
                        setDraftReportDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), v as number));
                      }}
                      style={styles.pickerInner}
                      itemStyle={styles.pickerItemText}
                    >
                      {Array.from(
                        { length: daysInMonth(draftReportDate.getFullYear(), draftReportDate.getMonth()) },
                        (_, i) => i + 1,
                      ).map((d) => (
                        <Picker.Item key={d} label={String(d)} value={d} />
                      ))}
                    </Picker>
                  </View>
                </View>
              )}

              <Text style={styles.uploadSectionLabel}>Category</Text>
              <View style={styles.categoryRow}>
                {UPLOAD_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[styles.categoryChip, draftCategory === cat.value && styles.categoryChipActive]}
                    onPress={() => setDraftCategory(cat.value)}
                  >
                    <Text style={[styles.categoryChipText, draftCategory === cat.value && styles.categoryChipTextActive]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.draftListContent}
              >
                <View style={styles.previewRow}>
                  {draftImages.map((img) => {
                    const isDocExt = isDocumentDraft(img);
                    return (
                      <View key={img.localId} style={styles.draftItem}>
                        {isDocExt ? (
                          <TouchableOpacity
                            onPress={() => openFilePreview(img.uri, img.mimeType, `file.${img.ext}`)}
                            activeOpacity={0.85}
                          >
                            <View style={[styles.previewImage, styles.docPreviewPlaceholder]}>
                              <Ionicons name="document-text-outline" size={24} color={DOC_THEME.textSecondary} />
                              <Text style={styles.docExtLabel}>.{img.ext}</Text>
                            </View>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            onPress={() => openFilePreview(img.uri, img.mimeType, `file.${img.ext}`)}
                            activeOpacity={1}
                          >
                            <Image source={{ uri: img.uri }} style={styles.previewImage} resizeMode="cover" />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.removeBadge} onPress={() => removeDraftImage(img.localId)}>
                          <Text style={styles.removeBadgeText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                  <TouchableOpacity
                    style={[styles.addTile, photoAddDisabled && styles.addTileDisabled]}
                    onPress={pickDraftImages}
                    disabled={photoAddDisabled}
                    activeOpacity={photoAddDisabled ? 1 : 0.7}
                  >
                    <Ionicons
                      name="image-outline"
                      size={18}
                      color={photoAddDisabled ? DOC_THEME.border : DOC_THEME.textSecondary}
                    />
                    <Text style={[styles.addTileLabel, photoAddDisabled && styles.addTileLabelDisabled]}>Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.addTile, fileAddDisabled && styles.addTileDisabled]}
                    onPress={pickFile}
                    disabled={fileAddDisabled}
                    activeOpacity={fileAddDisabled ? 1 : 0.7}
                  >
                    <Ionicons
                      name="document-outline"
                      size={18}
                      color={fileAddDisabled ? DOC_THEME.border : DOC_THEME.textSecondary}
                    />
                    <Text style={[styles.addTileLabel, fileAddDisabled && styles.addTileLabelDisabled]}>File</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              <Text style={[styles.uploadSectionLabel, styles.uploadSectionLabelSpaced]}>Notes (optional)</Text>
              <TextInput
                style={styles.uploadNoteInput}
                value={backgroundText}
                onChangeText={setBackgroundText}
                placeholder="Context for AI (symptoms, doctor, meds…)"
                placeholderTextColor={DOC_THEME.textSecondary}
                multiline
                numberOfLines={3}
              />
            </Animated.View>
          </View>
        </>
      )}

      <DocumentPreviewModal
        visible={!!filePreview}
        onClose={() => setFilePreview(null)}
        uri={filePreview?.uri ?? null}
        kind={filePreview?.kind ?? "unknown"}
        title={filePreview?.title}
      />
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
  sectionHeader: {
    fontSize: 14,
    fontWeight: "700",
    color: DOC_THEME.text,
    fontFamily: FONT_SANS_BOLD,
    marginTop: 16,
    marginBottom: 8,
    marginHorizontal: 4,
  },
  docDate: {
    fontSize: 11,
    color: DOC_THEME.textSecondary,
    fontFamily: FONT_SANS,
    marginTop: 2,
  },
  retryLink: {
    fontSize: 11,
    color: DOC_THEME.accent,
    fontFamily: FONT_SANS_MEDIUM,
    marginTop: 2,
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
  thumbDocTile: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: DOC_THEME.bgCard,
    borderWidth: 1,
    borderColor: DOC_THEME.border,
  },
  thumbDocExt: {
    fontSize: 9,
    fontWeight: "700",
    color: DOC_THEME.textSecondary,
    fontFamily: FONT_SANS,
    maxWidth: 52,
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
    right: FAB_FROM_RIGHT_PX,
    width: FAB_SIZE_PX,
    height: FAB_SIZE_PX,
    borderRadius: FAB_SIZE_PX / 2,
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
    left: CARD_FROM_LEFT_PX,
    right: CARD_FROM_RIGHT_PX,
    borderRadius: 20,
    overflow: "hidden",
    padding: 14,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.5)",
  },
  uploadGlassShine: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.52)",
    borderRadius: 20,
  },
  uploadGlassFog: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.22)",
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
  uploadBusyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.88)",
    zIndex: 25,
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
    borderRadius: 20,
  },
  uploadBusyText: {
    fontSize: 15,
    color: DOC_THEME.text,
    fontFamily: FONT_SANS_MEDIUM,
  },
  uploadTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  uploadCardTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: DOC_THEME.text,
    fontFamily: FONT_SANS_SEMIBOLD,
  },
  uploadDateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.06)",
  },
  uploadDateChipText: {
    fontSize: 12,
    color: DOC_THEME.text,
    fontFamily: FONT_SANS_MEDIUM,
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
    width: 100,
    height: 216,
    marginTop: -55,
  },
  pickerItemText: {
    fontSize: 14,
    fontFamily: FONT_SANS_MEDIUM,
  },
  uploadSectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: DOC_THEME.textSecondary,
    marginBottom: 6,
    fontFamily: FONT_SANS_MEDIUM,
  },
  uploadSectionLabelSpaced: {
    marginTop: 10,
  },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  categoryChipActive: {
    backgroundColor: DOC_THEME.accent,
  },
  categoryChipText: {
    fontSize: 13,
    color: DOC_THEME.textSecondary,
    fontFamily: FONT_SANS,
  },
  categoryChipTextActive: {
    color: "#fff",
  },
  datePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 4,
  },
  datePickerText: {
    fontSize: 13,
    color: DOC_THEME.textSecondary,
    fontFamily: FONT_SANS,
  },
  uploadNoteInput: {
    marginTop: 0,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: DOC_THEME.text,
    minHeight: 72,
    textAlignVertical: "top" as const,
    fontFamily: FONT_SANS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.06)",
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
    gap: 4,
  },
  addTileLabel: {
    fontSize: 10,
    color: DOC_THEME.textSecondary,
    fontFamily: FONT_SANS,
  },
  addTileDisabled: {
    opacity: 0.45,
    borderColor: DOC_THEME.border,
  },
  addTileLabelDisabled: {
    color: DOC_THEME.border,
  },
  docPreviewPlaceholder: {
    backgroundColor: DOC_THEME.bgCard,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  docExtLabel: {
    fontSize: 10,
    color: DOC_THEME.textSecondary,
    fontFamily: FONT_SANS,
    fontWeight: "600",
    backgroundColor: DOC_THEME.bgCard,
  },
  previewRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  previewImage: {
    width: 84,
    height: 84,
    borderRadius: 8,
    backgroundColor: DOC_THEME.border,
  },
});
