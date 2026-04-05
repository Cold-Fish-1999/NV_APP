import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { FlatList as FlatListType } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Modal,
  Pressable,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Audio } from "expo-av";
import { BlurView } from "expo-blur";
import Markdown from "react-native-markdown-display";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import {
  FONT_SANS,
  FONT_SANS_MEDIUM,
  FONT_SANS_BOLD,
  FONT_SERIF,
  FONT_SERIF_BOLD,
  fontSerif,
  fontSerifBold,
} from "@/lib/fonts";
import { useHeaderHeight } from "@/components/SharedHeader";
import { useAuth } from "@/contexts/auth";
import { useSubscription } from "@/contexts/subscription";
import { showUpgradePrompt } from "@/lib/showUpgradePrompt";
import { FREE_DAILY_MESSAGE_LIMIT, FREE_MAX_MESSAGE_LENGTH } from "@/lib/freeUserLimits";
import { supabase } from "@/lib/supabase";
import { sendChatMessage, fetchChatMessages, transcribeAudio } from "@/lib/api";
import { filterRecent24h, loadChatCache, saveChatCache, clearChatCache } from "@/lib/chatCache";
import { CLIENT_UPLOAD_MAX_EDGE, MAX_CHAT_IMAGES_PER_MESSAGE } from "@/lib/docUploadLimits";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  imageUrls?: string[];
  imagePaths?: Array<{ bucket: string; path: string }>;
  deepAnalysis?: boolean;
};

type PendingImage = {
  localId: string;
  uri: string;
  base64?: string | null;
  mimeType: string;
  ext: string;
  uploadedUrl?: string;
  remotePath?: { bucket: string; path: string };
};

const MIN_RECORDING_MS = 300;

function ThinkingIndicator({ deep }: { deep?: boolean }) {
  return (
    <View style={styles.thinkingRow}>
      <ActivityIndicator size="small" color={CHAT_THEME.accent} />
      {deep && <Text style={styles.thinkingLabel}>Thinking deeper …</Text>}
    </View>
  );
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${month}-${day} ${h}:${m}`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const today = new Date();
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}

const FLOAT_TAB_H = 52;

export default function ChatScreen() {
  const router = useRouter();
  const headerH = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const tabClearance = (insets.bottom > 0 ? insets.bottom - 12 : 12) + FLOAT_TAB_H;
  const { session } = useAuth();
  const { status } = useSubscription();
  const isFree = status?.tier === "free";
  const mockTier = null;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [recordingStartAt, setRecordingStartAt] = useState<number | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [inputHeight, setInputHeight] = useState(38);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showTimeForIds, setShowTimeForIds] = useState<Set<string>>(new Set());
  const [uploadingImages, setUploadingImages] = useState(false);
  const [deepThinking, setDeepThinking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);
  const flatListRef = useRef<FlatListType<Message>>(null);
  const deepThinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      });
    });
    return () => sub.remove();
  }, []);

  const showHoldToTalk =
    !isInputFocused && input.trim().length === 0 && pendingImages.length === 0;

  const defaultPlaceholder = useMemo(
    () => ["How are you feeling today?", "What health questions can I help with?"][Math.floor(Math.random() * 2)],
    []
  );

  const toggleMessageTime = useCallback((id: string) => {
    setShowTimeForIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const dedupeMessages = useCallback((
    rows: { id: string; role: string; content: string; created_at: string; meta?: { imagePaths?: Array<{ bucket: string; path: string }>; deepAnalysis?: boolean } }[]
  ) => {
    const seen = new Set<string>();
    const byId = rows
      .filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      })
      .map((r) => ({
        id: r.id,
        role: r.role as "user" | "assistant",
        content: r.content,
        createdAt: r.created_at,
        imagePaths: r.meta?.imagePaths,
        deepAnalysis: r.meta?.deepAnalysis,
      }));
    const result: typeof byId = [];
    for (let i = 0; i < byId.length; i++) {
      const curr = byId[i];
      if (result.length >= 2 && i >= 2) {
        const prev = byId[i - 1];
        const r0 = result[result.length - 2];
        const r1 = result[result.length - 1];
        if (
          prev.role === r0.role && prev.content === r0.content &&
          curr.role === r1.role && curr.content === r1.content
        ) {
          result.pop();
          continue;
        }
      }
      result.push(curr);
    }
    return result;
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      const prevId = lastUserIdRef.current;
      lastUserIdRef.current = null;
      if (prevId) void clearChatCache(prevId);
      setMessages([]);
      setLoadingHistory(false);
      return;
    }
    const userId = session.user.id;
    lastUserIdRef.current = userId;
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    setLoadingHistory(true);
    fetchChatMessages(undefined, sinceIso)
      .then(async (rows) => {
        if (rows.length > 0) {
          const deduped = dedupeMessages(rows);
          const hydrated = await Promise.all(
            deduped.map(async (m) => {
              const paths = m.imagePaths;
              if (!paths?.length) return { ...m, imageUrls: undefined as string[] | undefined };
              const urls: string[] = [];
              for (const p of paths) {
                const { data } = await supabase.storage.from(p.bucket).createSignedUrl(p.path, 3600);
                if (data?.signedUrl) urls.push(data.signedUrl);
              }
              return { ...m, imageUrls: urls.length > 0 ? urls : undefined };
            })
          );
          setMessages(hydrated);
          return;
        }
        return loadChatCache(userId).then((cached) => {
          if (cached.length > 0) {
            const mapped = cached.map((c) => ({ id: c.id, role: c.role, content: c.content, created_at: c.createdAt, meta: undefined }));
            setMessages(dedupeMessages(mapped));
          }
        });
      })
      .catch(() =>
        loadChatCache(userId).then((cached) => {
          if (cached.length > 0) {
            const mapped = cached.map((c) => ({ id: c.id, role: c.role, content: c.content, created_at: c.createdAt, meta: undefined }));
            setMessages(dedupeMessages(mapped));
          }
        })
      )
      .finally(() => setLoadingHistory(false));
  }, [session?.user?.id, dedupeMessages]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const toCache = filterRecent24h(messages).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    }));
    void saveChatCache(session.user.id, toCache);
  }, [messages, session?.user?.id]);

  const pickImage = useCallback(async () => {
    if (isFree) {
      showUpgradePrompt("chat_image", router);
      return;
    }
    const maxPerChat = MAX_CHAT_IMAGES_PER_MESSAGE;
    if (pendingImages.length >= maxPerChat) {
      Alert.alert(
        "Limit reached",
        `You can attach up to ${MAX_CHAT_IMAGES_PER_MESSAGE} images per message.`
      );
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Please allow photo library access.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const remaining = maxPerChat - pendingImages.length;
    const assets = result.assets.slice(0, remaining);
    const next: PendingImage[] = [];
    for (const a of assets) {
      try {
        const { uri: jpegUri } = await ImageManipulator.manipulateAsync(
          a.uri,
          [{ resize: { width: CLIENT_UPLOAD_MAX_EDGE } }],
          {
            format: ImageManipulator.SaveFormat.JPEG,
            compress: 0.85,
          }
        );
        next.push({
          localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          uri: jpegUri,
          base64: null,
          mimeType: "image/jpeg",
          ext: "jpg",
        });
      } catch {
        continue;
      }
    }
    if (next.length > 0) setPendingImages((prev) => [...prev, ...next]);
    if (result.assets.length > assets.length) {
      Alert.alert(
        "Limit reached",
        `Only the first ${remaining} selected image(s) were added.`
      );
    }
  }, [isFree, router, pendingImages.length]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const toUpload = pendingImages.filter((p) => !p.remotePath);
    if (toUpload.length === 0) return;
    let cancelled = false;
    const run = async () => {
      setUploadingImages(true);
      try {
        const bucket = "profile-documents";
        const ts = Date.now();
        const uploaded: Array<{
          localId: string;
          url: string;
          path: { bucket: string; path: string };
        }> = [];
        for (const img of toUpload) {
          const path = `${session.user.id}/chat/${ts}-${img.localId}.${img.ext}`;
          let buf: ArrayBuffer;
          const res = await fetch(img.uri);
          buf = await res.arrayBuffer();
          const payload = Platform.OS === "web" ? new Blob([buf], { type: img.mimeType }) : buf;
          const { error } = await supabase.storage.from(bucket).upload(path, payload, {
            contentType: img.mimeType,
            upsert: false,
          });
          if (error) throw error;
          const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
          if (data?.signedUrl) {
            uploaded.push({
              localId: img.localId,
              url: data.signedUrl,
              path: { bucket, path },
            });
          }
        }
        if (cancelled) return;
        if (uploaded.length > 0) {
          setPendingImages((prev) =>
            prev.map((p) => {
              const u = uploaded.find((x) => x.localId === p.localId);
              return u ? { ...p, uploadedUrl: u.url, remotePath: u.path } : p;
            })
          );
        }
      } catch (e) {
        if (!cancelled) {
          Alert.alert(
            "Image upload failed",
            e instanceof Error ? e.message : String(e)
          );
        }
      } finally {
        if (!cancelled) {
          setUploadingImages(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [pendingImages, session?.user?.id]);

  const removePendingImage = useCallback((localId: string) => {
    setPendingImages((prev) => prev.filter((p) => p.localId !== localId));
  }, []);

  const sendText = useCallback(async (text: string, images?: PendingImage[]) => {
    const cleanText = text.trim();
    const imgs = images ?? pendingImages;
    if ((!cleanText && imgs.length === 0) || loading) return;

    if (isFree) {
      if (imgs.length > 0) {
        showUpgradePrompt("chat_image", router);
        return;
      }
      const todayUserCount = messages.filter((m) => m.role === "user" && isToday(m.createdAt)).length;
      if (todayUserCount >= FREE_DAILY_MESSAGE_LIMIT) {
        showUpgradePrompt("daily_limit", router);
        return;
      }
      if (cleanText.length > FREE_MAX_MESSAGE_LENGTH) {
        showUpgradePrompt("message_length", router);
        return;
      }
    }

    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();
    const nowIso = new Date().toISOString();
    const displayContent = cleanText || (imgs.length > 0 ? `[${imgs.length} image(s)]` : "");
    const userMsg: Message = { id: userMsgId, role: "user", content: displayContent, createdAt: nowIso };
    const assistantMsg: Message = { id: assistantMsgId, role: "assistant", content: "", createdAt: nowIso };
    setMessages((prev) => filterRecent24h([...prev, userMsg, assistantMsg]));
    setLoading(true);
    setDeepThinking(false);
    if (deepThinkTimerRef.current) clearTimeout(deepThinkTimerRef.current);
    deepThinkTimerRef.current = setTimeout(() => setDeepThinking(true), 4000);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);

    let imageUrls: string[] = [];
    let imagePaths: { bucket: string; path: string }[] = [];
    try {
      if (imgs.length > 0) {
        const notReady = imgs.filter((img) => !img.uploadedUrl || !img.remotePath);
        if (notReady.length > 0) {
          Alert.alert("Image uploading", "Please wait for image upload to finish, then send.");
          setLoading(false);
          return;
        }
        imageUrls = imgs
          .map((img) => img.uploadedUrl)
          .filter((u): u is string => typeof u === "string" && u.length > 0);
        imagePaths = imgs
          .map((img) => img.remotePath)
          .filter((p): p is { bucket: string; path: string } => !!p);
        setPendingImages([]);
        setMessages((prev) =>
          prev.map((m) => (m.id === userMsgId ? { ...m, imageUrls } : m))
        );
      }

      const { reply, deepAnalysis } = await sendChatMessage(
        cleanText,
        session?.access_token,
        imageUrls,
        imagePaths,
        mockTier
      );
      if (deepThinkTimerRef.current) clearTimeout(deepThinkTimerRef.current);
      setDeepThinking(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: reply, deepAnalysis }
            : m
        )
      );
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (e) {
      if (deepThinkTimerRef.current) clearTimeout(deepThinkTimerRef.current);
      setDeepThinking(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `Request failed: ${e instanceof Error ? e.message : String(e)}` }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, [
    isFree,
    loading,
    messages,
    mockTier,
    pendingImages,
    setUploadingImages,
    router,
    session?.access_token,
    session?.user?.id,
  ]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && pendingImages.length === 0) || loading) return;
    setInput("");
    setInputHeight(38);
    await sendText(text || "Please help me analyze this image", pendingImages.length > 0 ? pendingImages : undefined);
  }, [input, loading, pendingImages, sendText]);

  const stopRecordingAndTranscribe = useCallback(async () => {
    if (!recording || transcribing) return;
    setTranscribing(true);
    try {
      const duration = recordingStartAt ? Date.now() - recordingStartAt : 0;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setRecordingStartAt(null);
      if (duration > 0 && duration < MIN_RECORDING_MS) return;
      if (!uri) throw new Error("录音文件生成失败");
      const { text } = await transcribeAudio(uri, session?.access_token);
      const speechText = text.trim();
      if (speechText) {
        setInput((prev) => (prev.trim() ? `${prev.trim()} ${speechText}` : speechText));
      } else {
        Alert.alert("Notice", "No valid speech content was recognized.");
      }
    } catch (e) {
      Alert.alert("Speech recognition failed", e instanceof Error ? e.message : String(e));
    } finally {
      setTranscribing(false);
    }
  }, [recording, recordingStartAt, session?.access_token, transcribing]);

  const startRecording = useCallback(async () => {
    if (recording || transcribing) return;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Microphone access required", "Please allow microphone access in system settings.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const created = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(created.recording);
      setRecordingStartAt(Date.now());
    } catch (e) {
      Alert.alert("Recording failed to start", e instanceof Error ? e.message : String(e));
    }
  }, [recording, transcribing]);

  useEffect(() => {
    return () => {
      if (recording) recording.stopAndUnloadAsync().catch(() => {});
      setRecordingStartAt(null);
    };
  }, [recording]);

  const mdStylesBase = useMemo(() => ({
    paragraph: { marginTop: 0, marginBottom: 8 },
    heading1: { fontSize: 22, fontWeight: "700" as const, marginBottom: 8, marginTop: 12, color: CHAT_THEME.assistantText, fontFamily: FONT_SERIF_BOLD },
    heading2: { fontSize: 19, fontWeight: "600" as const, marginBottom: 6, marginTop: 10, color: CHAT_THEME.assistantText, fontFamily: FONT_SERIF_BOLD },
    heading3: { fontSize: 17, fontWeight: "600" as const, marginBottom: 4, marginTop: 8, color: CHAT_THEME.assistantText, fontFamily: FONT_SERIF_BOLD },
    strong: { fontWeight: "600" as const },
    em: { fontStyle: "italic" as const },
    link: { color: CHAT_THEME.accent, textDecorationLine: "none" as const },
    blockquote: { backgroundColor: "rgba(0,0,0,0.03)", borderLeftWidth: 3, borderLeftColor: CHAT_THEME.accent, paddingHorizontal: 12, paddingVertical: 4, marginVertical: 6 },
    code_inline: { backgroundColor: "rgba(0,0,0,0.05)", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 14 },
    fence: { backgroundColor: "rgba(0,0,0,0.04)", borderRadius: 8, padding: 12, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 13, lineHeight: 20, marginVertical: 8 },
    code_block: { backgroundColor: "rgba(0,0,0,0.04)", borderRadius: 8, padding: 12, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 13, lineHeight: 20, marginVertical: 8 },
    bullet_list: { marginVertical: 4 },
    ordered_list: { marginVertical: 4 },
    list_item: { marginVertical: 2 },
    hr: { backgroundColor: CHAT_THEME.border, height: 1, marginVertical: 12 },
  }), []);

  const getMdStyles = useCallback((text: string) => ({
    ...mdStylesBase,
    body: { color: CHAT_THEME.assistantText, fontSize: 16, lineHeight: 26, fontFamily: fontSerif(text) },
    strong: { fontWeight: "700" as const, fontFamily: fontSerifBold(text) },
  }), [mdStylesBase]);

  const renderItem = useCallback(
    ({ item }: { item: Message }) => {
      const isUser = item.role === "user";
      const isEmptyAssistant = !isUser && !(item.content?.trim());
      const showLoading = isEmptyAssistant && loading;
      const showTime = showTimeForIds.has(item.id);
      return (
        <Pressable style={styles.bubbleWrap} onPress={() => toggleMessageTime(item.id)}>
          <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
            {isUser ? (
              <View style={styles.userBubble}>
                {item.imageUrls && item.imageUrls.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.msgImagesRow}>
                    {item.imageUrls.map((url, i) => (
                      <Pressable key={i} onPress={() => setPreviewImage(url)}>
                        <Image source={{ uri: url }} style={styles.msgImage} resizeMode="cover" />
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
                {item.content && item.content.trim() ? (
                  <Text style={styles.userText}>{item.content}</Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.assistantContent}>
                {item.imageUrls && item.imageUrls.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.msgImagesRow}>
                    {item.imageUrls.map((url, i) => (
                      <Pressable key={i} onPress={() => setPreviewImage(url)}>
                        <Image source={{ uri: url }} style={styles.msgImage} resizeMode="cover" />
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
                {showLoading ? (
                  <ThinkingIndicator deep={deepThinking} />
                ) : item.content && item.content.trim() ? (
                  <>
                    {item.deepAnalysis && (
                      <Text style={styles.deepAnalysisLabel}>
                        ✦ Based on your full health history
                      </Text>
                    )}
                    <Markdown style={getMdStyles(item.content)}>{item.content}</Markdown>
                    <TouchableOpacity
                      style={styles.copyIcon}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => {
                        Clipboard.setStringAsync(item.content);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setCopiedId(item.id);
                        setTimeout(() => setCopiedId((prev) => prev === item.id ? null : prev), 1500);
                      }}
                      activeOpacity={0.5}
                    >
                      <Ionicons
                        name={copiedId === item.id ? "checkmark" : "copy-outline"}
                        size={14}
                        color={copiedId === item.id ? CHAT_THEME.accent : CHAT_THEME.muted}
                      />
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>
            )}
          </View>
          {showTime && (
            <Text style={[styles.timeText, isUser ? styles.userTimeText : styles.assistantTimeText]}>
              {formatMessageTime(item.createdAt)}
            </Text>
          )}
        </Pressable>
      );
    },
    [loading, deepThinking, copiedId, showTimeForIds, toggleMessageTime]
  );

  const inputPadBottom = tabClearance + 20;

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingTop: headerH, paddingBottom: inputPadBottom + 100 }, messages.length === 0 && styles.listEmpty]}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !loadingHistory ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>I'm Ala, your AI health agent.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loadingHistory ? (
            <View style={[styles.bubbleWrap, styles.assistantRow]}>
              <View style={styles.assistantContent}>
                <ActivityIndicator size="small" color={CHAT_THEME.muted} />
              </View>
            </View>
          ) : null
        }
      />

      <KeyboardAvoidingView
        style={styles.inputFloat}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
        pointerEvents="box-none"
      >
        <View style={[styles.inputBox, { marginBottom: inputPadBottom }]}>
          <BlurView intensity={40} tint="systemChromeMaterialLight" style={StyleSheet.absoluteFill} />
          <View style={styles.inputGlassShine} pointerEvents="none" />
          <View style={styles.inputGlassEdge} pointerEvents="none" />
          {pendingImages.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.inputBoxImages}
              contentContainerStyle={styles.inputBoxImagesContent}
            >
              {pendingImages.map((p) => (
                <View key={p.localId} style={styles.inputBoxImageItem}>
                  <Image source={{ uri: p.uri }} style={styles.inputBoxImage} resizeMode="cover" />
                  {uploadingImages && (
                    <View style={styles.inputBoxImageUploadingOverlay}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.inputBoxImageRemove}
                    onPress={() => removePendingImage(p.localId)}
                  >
                    <Text style={styles.inputBoxImageRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View style={[styles.inputContentRow, { minHeight: inputHeight + 12 }]}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.input, { height: Math.min(Math.max(inputHeight, 38), 188) }]}
                placeholder={defaultPlaceholder}
                placeholderTextColor={CHAT_THEME.muted}
                {...(Platform.OS === "android" && { includeFontPadding: false })}
                value={input}
                onChangeText={(t) => {
                  setInput(t);
                  if (t.trim().length === 0) setInputHeight(38);
                }}
                onSubmitEditing={sendMessage}
                returnKeyType="send"
                editable={!loading && !transcribing}
                multiline
                textAlign="left"
                textAlignVertical={inputHeight <= 38 ? "center" : "top"}
                blurOnSubmit={false}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                onContentSizeChange={(e) => {
                  if (input.trim().length === 0) return;
                  const h = e.nativeEvent.contentSize.height;
                  setInputHeight(Math.min(Math.max(h + 14, 38), 160));
                }}
              />
              {input.trim().length > 0 && (
                <Text
                  style={styles.inputMeasure}
                  onLayout={(e) => {
                    const h = e.nativeEvent.layout.height;
                    if (h > 0) setInputHeight(Math.min(Math.max(h, 38), 160));
                  }}
                >
                  {input}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.inputButtonRow}>
            <TouchableOpacity
              style={[styles.inputBoxBtn, (loading || transcribing) && styles.inputBoxBtnDisabled]}
              onPress={pickImage}
              disabled={loading || transcribing}
            >
              <Text style={styles.inputBoxBtnPlus}>+</Text>
            </TouchableOpacity>
            <View style={styles.inputButtonSpacer} />
            {showHoldToTalk ? (
              <TouchableOpacity
                style={[
                  styles.holdToTalkBtn,
                  (loading || transcribing) && styles.inputBoxBtnDisabled,
                  recording && styles.holdToTalkBtnPressed,
                ]}
                onPressIn={startRecording}
                onPressOut={stopRecordingAndTranscribe}
                disabled={loading || transcribing}
              >
                <Text style={styles.holdToTalkBtnText}>
                  {transcribing ? "Transcribing" : recording ? "Release to end" : "Hold to talk"}
                </Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={[
                    styles.inputBoxMicBtn,
                    (loading || transcribing) && styles.inputBoxBtnDisabled,
                    recording && styles.inputBoxMicBtnRecording,
                  ]}
                  onPressIn={startRecording}
                  onPressOut={stopRecordingAndTranscribe}
                  disabled={loading || transcribing}
                >
                  <Ionicons
                    name="mic-outline"
                    size={26}
                    color={recording ? CHAT_THEME.accent : CHAT_THEME.muted}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.inputBoxSendBtn,
                    ((!input.trim() && pendingImages.length === 0) || loading || uploadingImages) &&
                      styles.inputBoxSendBtnDisabled,
                  ]}
                  onPress={sendMessage}
                  disabled={(!input.trim() && pendingImages.length === 0) || loading || uploadingImages}
                >
                  <Text style={styles.inputBoxSendBtnText}>↑</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={!!previewImage} transparent animationType="fade">
        <Pressable style={styles.imagePreviewOverlay} onPress={() => setPreviewImage(null)}>
          {previewImage && (
            <Image source={{ uri: previewImage }} style={styles.imagePreview} resizeMode="contain" />
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

// Claude 风格：极简、克制、内容优先。暖白背景、深色用户气泡、AI 裸文字、无装饰
const CHAT_THEME = {
  bg: "#f9faf5",
  bgInput: "#f5f5f3",
  border: "#e8e8e6",
  userBubble: "#eeeeec",
  userText: "#1a1a1a",
  assistantText: "#1a1a1a",
  muted: "#9a9a9a",
  time: "#b3b3b0",
  accent: "#e07c3c",
  accentMuted: "#c9a88a",
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CHAT_THEME.bg },
  list: { padding: 20, paddingBottom: 12, maxWidth: 720, alignSelf: "center", width: "100%" },
  listEmpty: { flexGrow: 1 },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyStateText: {
    fontSize: 26,
    fontFamily: FONT_SERIF,
    color: "#2d2d2d",
    fontWeight: "400",
    textAlign: "center",
    lineHeight: 36,
  },
  bubbleWrap: { marginBottom: 20 },
  messageRow: { flexDirection: "row", alignItems: "flex-end" },
  userRow: { justifyContent: "flex-end" },
  assistantRow: { justifyContent: "flex-start" },
  userBubble: {
    maxWidth: "85%",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    backgroundColor: CHAT_THEME.userBubble,
  },
  assistantContent: {
    maxWidth: "100%",
    paddingRight: 0,
  },
  userText: { color: CHAT_THEME.userText, fontSize: 16, lineHeight: 26, fontWeight: "400", fontFamily: FONT_SANS },
  assistantText: {
    color: CHAT_THEME.assistantText,
    fontSize: 16,
    lineHeight: 26,
    fontWeight: "400",
  },
  deepAnalysisLabel: {
    fontSize: 12,
    color: CHAT_THEME.accent,
    fontWeight: "600",
    marginBottom: 6,
    letterSpacing: 0.3,
    fontFamily: FONT_SANS_BOLD,
  },
  copyIcon: {
    alignSelf: "flex-start",
    marginTop: 4,
    padding: 2,
    opacity: 0.5,
  },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  thinkingLabel: {
    fontSize: 13,
    color: CHAT_THEME.accent,
    fontWeight: "500",
    letterSpacing: 0.15,
    fontFamily: FONT_SANS_MEDIUM,
  },
  timeText: { fontSize: 12, marginTop: 6, color: CHAT_THEME.time, fontFamily: FONT_SANS },
  userTimeText: { textAlign: "right", paddingRight: 4 },
  assistantTimeText: { textAlign: "left", paddingLeft: 0 },
  msgImagesRow: { marginBottom: 8 },
  msgImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: CHAT_THEME.border,
  },
  _typingDotsLegacy: {
    display: "none",
  },
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  imagePreview: { width: "100%", height: "100%" },

  inputFloat: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  inputBox: {
    flexDirection: "column",
    minHeight: 76,
    marginHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.8)",
    borderLeftColor: "rgba(255,255,255,0.55)",
    borderRightColor: "rgba(255,255,255,0.25)",
    borderBottomColor: "rgba(0,0,0,0.04)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  inputGlassShine: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.2)",
    zIndex: 1,
  },
  inputGlassEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 23,
    borderWidth: 1,
    borderTopColor: "rgba(255,255,255,0.4)",
    borderLeftColor: "rgba(255,255,255,0.25)",
    borderRightColor: "rgba(255,255,255,0.1)",
    borderBottomColor: "transparent",
    zIndex: 1,
  },
  inputBoxImages: { maxHeight: 148 },
  inputBoxImagesContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  inputBoxImageItem: {
    position: "relative",
    width: 56,
    height: 56,
    overflow: "hidden",
    borderRadius: 10,
  },
  inputBoxImage: { width: 56, height: 56, backgroundColor: CHAT_THEME.border },
  inputBoxImageUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  inputContentRow: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    justifyContent: "center",
  },
  inputButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    paddingBottom: 8,
    gap: 6,
  },
  inputButtonSpacer: { flex: 1 },
  holdToTalkBtn: {
    width: 100,
    height: 40,
    borderRadius: 12,
    backgroundColor: CHAT_THEME.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  holdToTalkBtnPressed: { backgroundColor: "#c96a2a" },
  holdToTalkBtnText: { fontSize: 14, color: "#fff", fontWeight: "500", fontFamily: FONT_SANS_MEDIUM },
  inputBoxBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  inputBoxBtnPlus: { fontSize: 24, color: CHAT_THEME.muted, fontWeight: "300", lineHeight: 24, fontFamily: FONT_SANS },
  inputBoxBtnDisabled: { opacity: 0.5 },
  inputBoxSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginLeft: 8,
    backgroundColor: CHAT_THEME.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  inputBoxSendBtnText: { color: "#fff", fontSize: 16, fontWeight: "600", fontFamily: FONT_SANS_BOLD },
  inputBoxSendBtnDisabled: { backgroundColor: CHAT_THEME.accentMuted, opacity: 0.6 },
  inputBoxMicBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  inputBoxMicBtnRecording: { backgroundColor: "rgba(201,74,42,0.2)" },
  inputBoxImageRemove: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  inputBoxImageRemoveText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  inputWrapper: { flex: 1, position: "relative", minWidth: 0 },
  input: {
    paddingHorizontal: 7,
    paddingTop: 7,
    paddingBottom: 0,
    backgroundColor: "transparent",
    fontSize: 16,
    lineHeight: 24,
    color: CHAT_THEME.assistantText,
    fontFamily: FONT_SANS,
  },
  inputMeasure: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    opacity: 0,
    pointerEvents: "none",
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 10,
    fontFamily: FONT_SANS,
  },

});
