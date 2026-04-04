import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/contexts/auth";
import { supabase } from "@/lib/supabase";
import {
  canSendMagicLink,
  recordMagicLinkSent,
  getRemainingCooldownSeconds,
} from "@/lib/rateLimit";

export default function LoginScreen() {
  const { state } = useAuth();
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (state === "authenticated") router.replace("/(tabs)");
  }, [state]);

  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  const sendOtpCode = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (!canSendMagicLink(trimmed)) {
      const sec = getRemainingCooldownSeconds(trimmed);
      Alert.alert(
        "Too many requests",
        `Please try again in ${sec} seconds`
      );
      return;
    }
    setLoading(true);
    setSent(false);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
      });
      if (error) throw error;
      recordMagicLinkSent(trimmed);
      setSent(true);
      setOtpCode("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isRateLimit = /rate limit|too many/i.test(msg);
      Alert.alert(
        isRateLimit ? "Too many requests" : "Send failed",
        isRateLimit
          ? "Please try again later"
          : msg
      );
    } finally {
      setLoading(false);
    }
  };

  const verifyOtpCode = async () => {
    const trimmedEmail = email.trim();
    const input = otpCode.trim();
    if (!trimmedEmail) {
      Alert.alert("Email required", "Please enter your email first.");
      return;
    }
    if (!input) {
      Alert.alert("Code required", "Please enter the verification code from your email.");
      return;
    }
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: input,
        type: "email",
      });
      if (error) throw error;
      router.replace("/(tabs)");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Verification failed", msg);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.hint}>Enter your email to receive a verification code</Text>
        {sent ? (
          <>
            <Text style={styles.sent}>Code sent. Check your email.</Text>
            <Text style={styles.sentHint}>Enter the verification code from your email</Text>
            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              placeholderTextColor={LOGIN_THEME.muted}
              value={otpCode}
              onChangeText={setOtpCode}
              autoCapitalize="none"
              keyboardType="number-pad"
              editable={!verifying}
            />
            <TouchableOpacity
              style={[styles.btn, verifying && styles.btnDisabled]}
              onPress={verifyOtpCode}
              disabled={verifying}
            >
              {verifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Verify and sign in</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.resendBtn}
              onPress={sendOtpCode}
              disabled={loading}
            >
              <Text style={styles.resendText}>Resend</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={LOGIN_THEME.muted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={sendOtpCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Send code</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const LOGIN_THEME = {
  bg: "#f9faf5",
  border: "#e8e8e6",
  text: "#1a1a1a",
  muted: "#9a9a9a",
  accent: "#e07c3c",
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LOGIN_THEME.bg },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  title: { fontSize: 28, fontWeight: "600", marginBottom: 8, color: LOGIN_THEME.text },
  hint: { fontSize: 15, color: LOGIN_THEME.muted, marginBottom: 28, lineHeight: 22 },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: LOGIN_THEME.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: "#fff",
    color: LOGIN_THEME.text,
  },
  btn: {
    height: 48,
    backgroundColor: LOGIN_THEME.accent,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  sent: { color: "#2d7d46", fontSize: 15, marginBottom: 8 },
  sentHint: { fontSize: 13, color: LOGIN_THEME.muted, marginBottom: 12 },
  resendBtn: { marginTop: 12, alignItems: "center" },
  resendText: { fontSize: 13, color: LOGIN_THEME.accent, fontWeight: "500" },
});
