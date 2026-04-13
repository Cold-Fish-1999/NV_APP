import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Image,
  ActivityIndicator,
  ScrollView,
  Linking,
  Platform,
  Dimensions,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { DocumentPreviewKind } from "@/lib/documentPreviewUtils";
import { FONT_SANS, FONT_SANS_MEDIUM, FONT_SANS_BOLD } from "@/lib/fonts";

const { width: WIN_W, height: WIN_H } = Dimensions.get("window");

type Props = {
  visible: boolean;
  onClose: () => void;
  uri: string | null;
  kind: DocumentPreviewKind;
  title?: string;
};

export function DocumentPreviewModal({ visible, onClose, uri, kind, title }: Props) {
  const insets = useSafeAreaInsets();
  const [textBody, setTextBody] = useState<string | null>(null);
  const [textErr, setTextErr] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(true);

  useEffect(() => {
    if (visible && kind === "pdf" && uri) setPdfLoading(true);
  }, [visible, uri, kind]);

  useEffect(() => {
    if (!visible || !uri) {
      setTextBody(null);
      setTextErr(false);
      setPdfLoading(true);
      return;
    }
    if (kind !== "text") {
      setTextBody(null);
      setTextErr(false);
      return;
    }
    let cancelled = false;
    setTextBody(null);
    setTextErr(false);
    (async () => {
      try {
        const res = await fetch(uri);
        if (!res.ok) throw new Error(String(res.status));
        const t = await res.text();
        if (!cancelled) setTextBody(t.length > 500_000 ? `${t.slice(0, 500_000)}\n\n…` : t);
      } catch {
        if (!cancelled) setTextErr(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, uri, kind]);

  const openExternally = useCallback(() => {
    if (uri) void Linking.openURL(uri);
  }, [uri]);

  if (!uri) return null;

  const headerBottom = Math.max(insets.top, 12);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: headerBottom }]}>
        <View style={styles.toolbar}>
          <Text style={styles.toolbarTitle} numberOfLines={1}>
            {title ?? "Preview"}
          </Text>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.body}>
          {kind === "image" ? (
            <View style={styles.imageWrap}>
              <Image source={{ uri }} style={styles.image} resizeMode="contain" />
            </View>
          ) : null}

          {kind === "pdf" ? (
            <View style={styles.webWrap}>
              <WebView
                source={{ uri }}
                style={styles.webview}
                onLoadStart={() => setPdfLoading(true)}
                onLoadEnd={() => setPdfLoading(false)}
                onError={() => setPdfLoading(false)}
                originWhitelist={["*", "file://", "http://", "https://"]}
                allowFileAccess
                allowUniversalAccessFromFileURLs={Platform.OS === "android"}
                mixedContentMode="always"
              />
              {pdfLoading ? (
                <View style={styles.pdfLoadingOverlay} pointerEvents="none">
                  <ActivityIndicator size="large" color="#e07c3c" />
                  <Text style={styles.hint}>Loading PDF…</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {kind === "text" ? (
            <ScrollView style={styles.textScroll} contentContainerStyle={styles.textScrollContent}>
              {textBody === null && !textErr ? (
                <View style={styles.centered}>
                  <ActivityIndicator size="large" color="#e07c3c" />
                  <Text style={styles.hint}>Loading text…</Text>
                </View>
              ) : null}
              {textErr ? (
                <Text style={styles.fallbackText}>Could not load this file. Try opening externally.</Text>
              ) : null}
              {textBody !== null ? <Text style={styles.textMono}>{textBody}</Text> : null}
            </ScrollView>
          ) : null}

          {(kind === "office" || kind === "unknown") && (
            <View style={styles.fallback}>
              <Ionicons name="document-text-outline" size={48} color="rgba(255,255,255,0.5)" />
              <Text style={styles.fallbackText}>
                {kind === "office"
                  ? "Word documents can’t be previewed in the app."
                  : "Preview isn’t available for this file type."}
              </Text>
              <Pressable style={styles.openBtn} onPress={openExternally}>
                <Text style={styles.openBtnText}>Open in browser</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.94)",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  toolbarTitle: {
    flex: 1,
    marginRight: 12,
    fontSize: 16,
    color: "#fff",
    fontFamily: FONT_SANS_MEDIUM,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    flex: 1,
  },
  imageWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: WIN_W,
    height: WIN_H * 0.72,
  },
  webWrap: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  webview: {
    flex: 1,
    width: WIN_W,
    backgroundColor: "#fff",
  },
  pdfLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(0,0,0,0.35)",
    zIndex: 4,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  hint: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontFamily: FONT_SANS,
  },
  textScroll: {
    flex: 1,
  },
  textScrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  textMono: {
    color: "#e8e8e8",
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  fallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
  fallbackText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    fontFamily: FONT_SANS,
  },
  openBtn: {
    marginTop: 8,
    backgroundColor: "#e07c3c",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  openBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: FONT_SANS_BOLD,
  },
});
