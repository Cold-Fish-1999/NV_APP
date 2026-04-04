import { Tabs } from "expo-router";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { BlurView } from "expo-blur";
import { BottomTabBar, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { calendarTheme as theme } from "@/lib/calendarTheme";
import { SharedHeader } from "@/components/SharedHeader";
import { SubscriptionBadge } from "@/components/SubscriptionBadge";

export const FLOATING_TAB_H = 58;
const FLOATING_TAB_W = 320;
export const FLOATING_TAB_RADIUS = FLOATING_TAB_H / 2;
const ICON_SIZE = 27;

function TabBarBg() {
  return (
    <View style={tb.shadowWrap}>
      <View style={tb.clip}>
        <BlurView
          intensity={30}
          tint="systemChromeMaterialLight"
          style={StyleSheet.absoluteFill}
        />
        <View style={tb.shine} pointerEvents="none" />
        <View style={tb.edge} pointerEvents="none" />
      </View>
    </View>
  );
}

function renderTabBar(props: BottomTabBarProps) {
  return (
    <BottomTabBar
      {...props}
      insets={{ top: 0, bottom: 0, left: 0, right: 0 }}
    />
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const tabBottom = insets.bottom > 0 ? insets.bottom - 12 : 12;
  const tabMarginH = Math.round((screenW - FLOATING_TAB_W) / 2);

  return (
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        tabBarActiveTintColor: "#e07c3c",
        tabBarInactiveTintColor: "#9a9a9a",
        tabBarShowLabel: false,
        tabBarStyle: {
          position: "absolute",
          bottom: tabBottom,
          left: 0,
          right: 0,
          marginLeft: tabMarginH,
          marginRight: tabMarginH,
          height: FLOATING_TAB_H,
          paddingBottom: 0,
          paddingTop: 0,
          paddingHorizontal: 0,
          borderTopWidth: 0,
          backgroundColor: "transparent",
          elevation: 0,
        },
        tabBarItemStyle: {
          flex: 1,
          height: FLOATING_TAB_H,
        },
        tabBarIconStyle: {
          marginTop: "auto",
          marginBottom: "auto",
        },
        tabBarBackground: () => <TabBarBg />,
        headerShown: true,
        header: ({ route }) => {
          const titles: Record<string, string> = {
            index: "Chat",
            profile: "Profile",
          };
          const title = titles[route.name] ?? route.name;
          const showBadge = route.name === "index";
          return (
            <SharedHeader
              title={title}
              rightComponent={showBadge ? <SubscriptionBadge /> : undefined}
            />
          );
        },
      }}
    >
      <Tabs.Screen
        name="calendar"
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="calendar-outline" size={ICON_SIZE} color={color} />
          ),
          headerShown: false,
          sceneStyle: { backgroundColor: theme.bg },
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="chatbubble-outline" size={ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="stats-chart-outline" size={ICON_SIZE} color={color} />
          ),
          headerShown: false,
          sceneStyle: { backgroundColor: theme.bg },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="person-outline" size={ICON_SIZE} color={color} />
          ),
          headerShown: false,
          sceneStyle: { backgroundColor: theme.bg },
        }}
      />
    </Tabs>
  );
}

const tb = StyleSheet.create({
  shadowWrap: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: FLOATING_TAB_RADIUS,
    backgroundColor: "rgba(255,255,255,0.01)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
  },
  clip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: FLOATING_TAB_RADIUS,
    overflow: "hidden",
  },
  shine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: FLOATING_TAB_H / 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  edge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: FLOATING_TAB_RADIUS,
    borderWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.75)",
    borderLeftColor: "rgba(255,255,255,0.45)",
    borderRightColor: "rgba(255,255,255,0.2)",
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
});
