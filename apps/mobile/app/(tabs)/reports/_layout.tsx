import { Stack } from "expo-router";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SharedHeader } from "@/components/SharedHeader";
import { ReportTabProvider, useReportTab } from "@/contexts/reportTab";

function SegmentedControl() {
  const { activeTab, setActiveTab, tabs } = useReportTab();
  return (
    <View style={seg.wrap}>
      {tabs.map((t) => {
        const active = activeTab === t;
        return (
          <TouchableOpacity
            key={t}
            onPress={() => setActiveTab(t)}
            activeOpacity={0.7}
            style={[seg.item, active && seg.itemActive]}
          >
            <Text style={[seg.text, active && seg.textActive]}>{t}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ReportsHeader() {
  return (
    <SharedHeader title="Reports" rightComponent={<SegmentedControl />} backgroundColor="#f9faf5" />
  );
}

export default function ReportsLayout() {
  return (
    <ReportTabProvider>
      <Stack
        screenOptions={{
          headerShown: true,
          header: () => <ReportsHeader />,
          contentStyle: { backgroundColor: "#f9faf5" },
        }}
      >
        <Stack.Screen name="index" />
      </Stack>
    </ReportTabProvider>
  );
}

const seg = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 8,
    padding: 2,
  },
  item: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  itemActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  text: {
    fontSize: 13,
    fontWeight: "500",
    color: "#999",
  },
  textActive: {
    color: "#2D2D2D",
    fontWeight: "600",
  },
});
