import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export function PaywallOverlay() {
  const router = useRouter();

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Ionicons name="lock-closed" size={32} color="#D85A30" />
        <Text style={styles.title}>Reports are a Pro feature</Text>
        <Text style={styles.subtitle}>
          Upgrade to unlock weekly and monthly health reports with AI insights.
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => router.push("/pricing")}
          activeOpacity={0.7}
        >
          <Text style={styles.btnText}>Upgrade</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: "rgba(245,240,234,0.88)",
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2D2D2D",
    marginTop: 14,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B6B6B",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 21,
  },
  btn: {
    marginTop: 20,
    backgroundColor: "#D85A30",
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  btnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
