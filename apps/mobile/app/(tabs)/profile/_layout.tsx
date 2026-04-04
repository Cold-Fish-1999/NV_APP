import { Stack } from "expo-router";
import { SharedHeader } from "@/components/SharedHeader";
import { SubscriptionBadge } from "@/components/SubscriptionBadge";

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        header: ({ route }) => {
          const titles: Record<string, string> = { index: "Profile", documents: "Documents" };
          return (
            <SharedHeader
              title={titles[route.name] ?? "Profile"}
              rightComponent={<SubscriptionBadge />}
              backgroundColor="#f9faf5"
              showBack={route.name === "documents"}
            />
          );
        },
        contentStyle: { backgroundColor: "#f9faf5" },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="documents" />
    </Stack>
  );
}
