import { Stack } from "expo-router";
import { CalendarHeaderProvider } from "@/contexts/calendarHeader";
import { SharedHeader } from "@/components/SharedHeader";
import { SubscriptionBadge } from "@/components/SubscriptionBadge";
import { calendarTheme as theme } from "@/lib/calendarTheme";

function CalendarCustomHeader() {
  return <SharedHeader title="Calendar" rightComponent={<SubscriptionBadge />} />;
}

export default function CalendarLayout() {
  return (
    <CalendarHeaderProvider>
      <Stack
        screenOptions={{
          headerShown: true,
          header: () => <CalendarCustomHeader />,
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="index" />
      </Stack>
    </CalendarHeaderProvider>
  );
}
