import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { storageSetItem } from "@/lib/storage";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FONT_SANS, FONT_SANS_BOLD, FONT_SERIF } from "@/lib/fonts";

const THEME = {
  bg: "#f9faf5",
  text: "#2d2d2d",
  textMuted: "#6b6b6b",
  accent: "#e07c3c",
};

const AI_VALUE_BULLETS = [
  "Notice patterns",
  "Understand symptoms",
  "Spot potential risks earlier",
  "Track chronic conditions",
];

const PLAN_CARD = {
  prime: {
    name: "Prime",
    tagline: "Good for everyday health tracking",
    features: [
      "Unlimited AI Interaction",
      "Limited image & document analysis",
      "Weekly AI health report",
      "Limited health context from medical records",
    ],
    monthly: { price: "$9.99 / month", note: "after 7-day free trial" },
    yearly: { price: "$79.99 / year", note: "($6.67 / month)" },
    cta: "Start Prime Free Trial",
  },
  pro: {
    name: "Pro",
    tagline: "Best for deep AI health insights",
    badge: "Most Popular",
    features: [
      "Unlimited AI Interaction (fair use)",
      "Unlimited image & document analysis",
      "Daily AI health report",
      "Unlimited health context from medical records",
    ],
    anchor: "81% users choose Pro for deeper health insights.",
    monthly: { price: "$14.99 / month", note: "after 7-day free trial" },
    yearly: { price: "$129.99 / year", note: "($10.83 / month)" },
    cta: "Start Pro Free Trial",
  },
} as const;

export default function PricingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth * 0.78;
  const cardGap = 12;
  const paddingH = 24;
  const primeCardOffset = paddingH + cardWidth + cardGap;
  const snapOffsets = [0, primeCardOffset];
  const cardScrollRef = useRef<ScrollView>(null);

  const [planBilling, setPlanBilling] = useState<{ pro: "monthly" | "yearly"; prime: "monthly" | "yearly" }>({
    pro: "yearly",
    prime: "yearly",
  });
  const [selectedPlan, setSelectedPlan] = useState<"prime" | "pro">("pro");

  const handleStartTrial = async () => {
    await storageSetItem("nvapp_onboarding_done", "1");
    await storageSetItem("nvapp_selected_plan", selectedPlan);
    await storageSetItem("nvapp_selected_billing", planBilling[selectedPlan]);
    router.replace("/login");
  };

  const updateSelectedFromOffset = (offset: number) => {
    const index = offset < primeCardOffset / 2 ? 0 : 1;
    setSelectedPlan(index === 0 ? "pro" : "prime");
  };

  const handleCardScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    updateSelectedFromOffset(e.nativeEvent.contentOffset.x);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      cardScrollRef.current?.scrollTo({ x: 0, animated: false });
    }, 50);
    return () => clearTimeout(t);
  }, []);

  const BillingOptionBlocks = ({ plan }: { plan: "prime" | "pro" }) => {
    const p = PLAN_CARD[plan];
    const billing = planBilling[plan];
    const monthlyPrice = p.monthly.price.split(" ")[0];
    const yearlyPrice = p.yearly.price.split(" ")[0];
    return (
      <View style={styles.billingOptionBlocks}>
        <Pressable
          style={[
            styles.billingOptionBlock,
            billing === "monthly" && styles.billingOptionBlockSelected,
          ]}
          onPress={() => setPlanBilling((prev) => ({ ...prev, [plan]: "monthly" }))}
        >
          <View style={[styles.billingRadio, billing === "monthly" && styles.billingRadioSelected]} />
          <Text style={styles.billingBlockPrice}>{monthlyPrice}</Text>
          <Text style={styles.billingBlockCycle}>Billed monthly</Text>
        </Pressable>
        <Pressable
          style={[
            styles.billingOptionBlock,
            styles.billingOptionBlockYearly,
            billing === "yearly" && styles.billingOptionBlockSelected,
          ]}
          onPress={() => setPlanBilling((prev) => ({ ...prev, [plan]: "yearly" }))}
        >
          <View style={[styles.billingRadio, billing === "yearly" && styles.billingRadioSelected]} />
          <View style={styles.billingSaveBadge}>
            <Text style={styles.billingSaveBadgeText}>Save 35%</Text>
          </View>
          <Text style={styles.billingBlockPrice}>{yearlyPrice}</Text>
          <Text style={styles.billingBlockCycle}>Billed annually</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Hero */}
      <View style={[styles.section, { paddingTop: 24 + insets.top }]}>
        <Text style={styles.heroTitle}>Understand your body with AI</Text>
        <Text style={styles.heroSubtitle}>
          Track symptoms, discover patterns, and get personalized health insights.
        </Text>
      </View>

      {/* 2. AI Value Proof */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI helps connect the dots</Text>
        {AI_VALUE_BULLETS.map((b, i) => (
          <View key={i} style={styles.bulletRow}>
            <Text style={styles.bulletIcon}>✓</Text>
            <Text style={styles.bulletText}>{b}</Text>
          </View>
        ))}
      </View>

      {/* 3. Plan Cards - 滑动切换 */}
      <View style={styles.section}>
        <ScrollView
          ref={cardScrollRef}
          horizontal
          pagingEnabled={false}
          snapToOffsets={snapOffsets}
          snapToAlignment="start"
          decelerationRate={0.92}
          showsHorizontalScrollIndicator={false}
          onScroll={(e) => updateSelectedFromOffset(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleCardScroll}
          onScrollEndDrag={handleCardScroll}
          style={styles.cardScroll}
          contentContainerStyle={[
            styles.cardScrollContent,
            { paddingHorizontal: paddingH },
          ]}
        >
          {/* Pro Card - 第一页 */}
          <View
            style={[
              styles.planCard,
              styles.planCardPro,
              { width: cardWidth, marginRight: cardGap },
              selectedPlan === "pro" && styles.planCardSelected,
            ]}
          >
            <View style={styles.mostPopularBadge}>
              <Text style={styles.mostPopularText}>{PLAN_CARD.pro.badge}</Text>
            </View>
            <View style={styles.planCardContent}>
              <Text style={styles.planName}>{PLAN_CARD.pro.name}</Text>
              <Text style={styles.planTagline}>{PLAN_CARD.pro.tagline}</Text>
              <View style={styles.featuresWrap}>
                {PLAN_CARD.pro.features.map((f, i) => (
                  <Text key={i} style={styles.feature}>✓ {f}</Text>
                ))}
              </View>
              <Text style={styles.anchorText}>{PLAN_CARD.pro.anchor}</Text>
            </View>
            <BillingOptionBlocks plan="pro" />
          </View>

          {/* Prime Card - 第二页 */}
          <View
            style={[
              styles.planCard,
              { width: cardWidth },
              selectedPlan === "prime" && styles.planCardSelected,
            ]}
          >
            <View style={styles.planCardContent}>
              <Text style={styles.planName}>{PLAN_CARD.prime.name}</Text>
              <Text style={styles.planTagline}>{PLAN_CARD.prime.tagline}</Text>
              <View style={styles.featuresWrap}>
                {PLAN_CARD.prime.features.map((f, i) => (
                  <Text key={i} style={styles.feature}>✓ {f}</Text>
                ))}
              </View>
            </View>
            <BillingOptionBlocks plan="prime" />
          </View>
        </ScrollView>
      </View>

      {/* 4. CTA */}
      <View style={styles.section}>
        <Text style={styles.freeFallbackCompact}>
          Don't want to continue after the trial? No worries — you'll switch to Free with basic logging and limited AI.
        </Text>
        <TouchableOpacity style={styles.ctaBtn} onPress={handleStartTrial} activeOpacity={0.8}>
          <Text style={styles.ctaBtnText}>
            Start 7-day {selectedPlan === "pro" ? "Pro" : "Prime"} Free Trial
          </Text>
        </TouchableOpacity>
        <Text style={styles.ctaSub}>No payment today · 7-day free trial · Cancel anytime</Text>
      </View>

      {/* 5. Footer */}
      <View style={styles.footer}>
        <TouchableOpacity onPress={() => {}}>
          <Text style={styles.footerLink}>Terms of Service</Text>
        </TouchableOpacity>
        <Text style={styles.footerDot}>·</Text>
        <TouchableOpacity onPress={() => {}}>
          <Text style={styles.footerLink}>Privacy Policy</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  content: { paddingHorizontal: 24 },
  section: { marginBottom: 20 },
  heroTitle: {
    fontSize: 26,
    fontFamily: FONT_SERIF,
    fontWeight: "600",
    color: THEME.text,
    lineHeight: 34,
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 16,
    fontFamily: FONT_SERIF,
    color: THEME.textMuted,
    lineHeight: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONT_SERIF,
    fontWeight: "600",
    color: THEME.text,
    marginBottom: 14,
  },
  bulletRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  bulletIcon: { fontSize: 16, color: THEME.accent, marginRight: 10 },
  bulletText: { fontSize: 15, fontFamily: FONT_SERIF, color: THEME.text },
  billingOptionBlocks: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  billingOptionBlock: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: "#e8e8e6",
    minHeight: 90,
  },
  billingOptionBlockSelected: {
    borderColor: THEME.accent,
    backgroundColor: "#fefaf8",
  },
  billingOptionBlockYearly: {
    position: "relative",
  },
  billingRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#ccc",
    marginBottom: 8,
  },
  billingRadioSelected: {
    borderColor: THEME.accent,
    backgroundColor: THEME.accent,
  },
  billingBlockPrice: {
    fontSize: 18,
    fontFamily: FONT_SANS_BOLD,
    fontWeight: "600",
    color: THEME.text,
    marginBottom: 4,
  },
  billingBlockCycle: {
    fontSize: 12,
    fontFamily: FONT_SANS,
    color: THEME.textMuted,
  },
  billingSaveBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: THEME.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  billingSaveBadgeText: {
    fontSize: 10,
    fontFamily: FONT_SANS_BOLD,
    fontWeight: "600",
    color: "#fff",
  },
  cardScroll: { marginHorizontal: -24 },
  cardScrollContent: {
    alignItems: "stretch",
  },
  planCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    borderWidth: 2,
    borderColor: "transparent",
    minHeight: 340,
    justifyContent: "space-between",
    position: "relative",
  },
  planCardContent: {
    flex: 1,
  },
  planCardPro: {
    backgroundColor: "#fefaf8",
  },
  planCardSelected: {
    borderWidth: 2,
    borderColor: THEME.accent,
    shadowColor: THEME.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  mostPopularBadge: {
    position: "absolute",
    top: 12,
    right: 18,
    zIndex: 1,
  },
  mostPopularText: {
    fontSize: 11,
    fontFamily: FONT_SANS_BOLD,
    fontWeight: "600",
    color: THEME.accent,
  },
  planName: {
    fontSize: 22,
    fontFamily: FONT_SERIF,
    fontWeight: "600",
    color: THEME.text,
    marginBottom: 2,
  },
  planTagline: {
    fontSize: 13,
    fontFamily: FONT_SERIF,
    color: THEME.textMuted,
    marginBottom: 10,
  },
  featuresWrap: { marginBottom: 10 },
  feature: {
    fontSize: 13,
    fontFamily: FONT_SERIF,
    color: THEME.text,
    marginBottom: 6,
  },
  anchorText: {
    fontSize: 13,
    fontFamily: FONT_SERIF,
    fontStyle: "italic",
    color: THEME.textMuted,
    marginBottom: 12,
  },
  freeFallbackCompact: {
    fontSize: 12,
    fontFamily: FONT_SERIF,
    color: THEME.textMuted,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 12,
  },
  ctaBtn: {
    height: 52,
    backgroundColor: THEME.accent,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  ctaBtnText: {
    fontSize: 17,
    fontFamily: FONT_SANS_BOLD,
    fontWeight: "600",
    color: "#fff",
  },
  ctaSub: {
    fontSize: 13,
    fontFamily: FONT_SANS,
    color: THEME.textMuted,
    textAlign: "center",
    marginTop: 10,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  footerLink: {
    fontSize: 13,
    fontFamily: FONT_SANS,
    color: THEME.accent,
  },
  footerDot: {
    fontSize: 13,
    color: THEME.textMuted,
  },
});
