import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { calendarTheme as theme } from "@/lib/calendarTheme";

interface SharedHeaderProps {
  title: string;
  leftComponent?: React.ReactNode;
  rightComponent?: React.ReactNode;
  backgroundColor?: string;
  showBack?: boolean;
}

export const HEADER_ROW_H = 44;
export const HEADER_PAD_BOTTOM = 8;
const FADE_H = 14;

export function useHeaderHeight() {
  const insets = useSafeAreaInsets();
  return insets.top + HEADER_ROW_H + HEADER_PAD_BOTTOM;
}

export function SharedHeader({
  title,
  leftComponent,
  rightComponent,
  backgroundColor = theme.bg,
  showBack,
}: SharedHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const headerH = insets.top + HEADER_ROW_H + HEADER_PAD_BOTTOM;

  const backBtn = showBack ? (
    <TouchableOpacity
      style={$.backBtn}
      onPress={() => router.back()}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Ionicons name="chevron-back" size={24} color={theme.text} />
    </TouchableOpacity>
  ) : null;

  const hasLeft = !!(leftComponent ?? backBtn);

  return (
    <View style={[$.wrap, { height: headerH, paddingTop: insets.top }]} pointerEvents="box-none">
      {/* Solid background covering status bar + header row (minus fade zone) */}
      <View style={[$.solidBg, { height: headerH - FADE_H, backgroundColor }]} />

      {/* Gradient fade inside the bottom of the header area */}
      <View style={[$.fade, { top: headerH - FADE_H }]} pointerEvents="none">
        <Svg width="100%" height={FADE_H}>
          <Defs>
            <SvgGrad id="hfade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={backgroundColor} stopOpacity={1} />
              <Stop offset="1" stopColor={backgroundColor} stopOpacity={0} />
            </SvgGrad>
          </Defs>
          <Rect x="0" y="0" width="100%" height={FADE_H} fill="url(#hfade)" />
        </Svg>
      </View>

      {/* Header content row */}
      <View style={$.row} pointerEvents="box-none">
        <View style={[$.side, !hasLeft && $.sideEmpty]}>{leftComponent ?? backBtn}</View>
        <Text style={$.title} numberOfLines={1}>{title}</Text>
        <View style={[$.side, $.sideRight, !rightComponent && $.sideEmpty]}>{rightComponent}</View>
      </View>
    </View>
  );
}

const $ = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  solidBg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    height: FADE_H,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: HEADER_ROW_H,
    paddingHorizontal: 12,
  },
  side: { minWidth: 40, alignItems: "flex-start" },
  sideRight: { alignItems: "flex-end" },
  sideEmpty: { minWidth: 0, width: 0 },
  backBtn: { padding: 4 },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: theme.text,
    flex: 1,
    textAlign: "left",
    lineHeight: 24,
  },
});
