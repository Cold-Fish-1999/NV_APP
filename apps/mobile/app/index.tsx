import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/auth";
import { hasCompletedOnboarding } from "./onboarding";
import { getOnboardingSurvey } from "./onboarding";

export default function Index() {
  const router = useRouter();
  const { state } = useAuth();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    hasCompletedOnboarding().then(setOnboardingDone);
  }, []);

  useEffect(() => {
    if (state === "loading" || onboardingDone === null) return;
    if (onboardingDone) {
      if (state === "authenticated") {
        router.replace("/(tabs)");
      } else {
        router.replace("/login");
      }
      return;
    }
    getOnboardingSurvey().then((survey) => {
      if (survey && Object.keys(survey).length > 0) {
        router.replace("/pricing");
      } else {
        router.replace("/onboarding");
      }
    });
  }, [state, onboardingDone, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#e07c3c" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9faf5",
  },
});
