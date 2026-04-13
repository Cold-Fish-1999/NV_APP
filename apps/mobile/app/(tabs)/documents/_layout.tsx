import { Stack } from "expo-router";
import { SharedHeader } from "@/components/SharedHeader";
import { SubscriptionBadge } from "@/components/SubscriptionBadge";

export default function DocumentsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        header: () => (
          <SharedHeader
            title="Documents"
            rightComponent={<SubscriptionBadge />}
            backgroundColor="#f9faf5"
          />
        ),
        contentStyle: { backgroundColor: "#f9faf5" },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
