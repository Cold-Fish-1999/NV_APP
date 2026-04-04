import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

export default function AuthCallbackScreen() {
  useEffect(() => {
    // Session is handled in AuthProvider deep-link parser; this page only avoids empty route.
    const t = setTimeout(() => {
      router.replace("/(tabs)");
    }, 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color="#e07c3c" />
      <Text style={styles.text}>Completing sign in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9faf5",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  text: {
    fontSize: 14,
    color: "#9a9a9a",
  },
});
