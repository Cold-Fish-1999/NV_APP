import { useCallback } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider } from "@/contexts/auth";
import { SubscriptionProvider } from "@/contexts/subscription";
import { FONT_MAP } from "@/lib/fonts";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts(FONT_MAP);

  const onLayoutReady = useCallback(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutReady}>
      <SafeAreaProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </SubscriptionProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </View>
  );
}
