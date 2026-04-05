import { View, Text, StyleSheet } from "react-native";
import { FONT_SANS_BOLD } from "@/lib/fonts";
import { useSubscription } from "@/contexts/subscription";

const ACCENT = "#e07c3c";

export function SubscriptionBadge() {
  const { status } = useSubscription();
  const tier = status?.tier ?? "free";

  return (
    <View style={[styles.badge, styles[`badge_${tier}` as keyof typeof styles]]}>
      <Text style={[styles.text, styles[`text_${tier}` as keyof typeof styles]]}>
        {tier === "free" ? "Free" : tier === "prime" ? "Prime" : "Pro"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  badge_free: {
    backgroundColor: "#f0f0ee",
  },
  badge_prime: {
    backgroundColor: "#e8f4fd",
    borderWidth: 1,
    borderColor: "#5ba3e8",
  },
  badge_pro: {
    backgroundColor: "#fef5f0",
    borderWidth: 1,
    borderColor: ACCENT,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: FONT_SANS_BOLD,
  },
  text_free: {
    color: "#9a9a9a",
  },
  text_prime: {
    color: "#2a7ab8",
  },
  text_pro: {
    color: ACCENT,
  },
});
