import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/contexts/auth";
import { SubscriptionProvider } from "@/contexts/subscription";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SubscriptionProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </SubscriptionProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
