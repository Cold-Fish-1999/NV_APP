/**
 * Claude-inspired 设计语言：温暖、克制、以人为本
 * 奶油米色背景 + 珊瑚橙/铜棕主色
 */
export const calendarTheme = {
  // 背景
  bg: "#f9faf5",
  bgSecondary: "#F5F0E8",
  bgCard: "#FFFFFF",
  bgHover: "#F8F4EF",

  // 主色（与 chat 一致的珊瑚红 #e07c3c）
  primary: "#e07c3c",
  primaryMuted: "#e9a070",
  primaryLight: "#f5e0d6",

  // 文字
  text: "#2D2D2D",
  textSecondary: "#6B6B6B",
  textMuted: "#9A9A9A",

  // 边框
  border: "#E8E2DA",
  borderLight: "#F0ECE6",

  // 标签/胶囊
  pillBg: "#F0ECE6",
  pillText: "#5C5C5C",

  // 贡献图（与 chat 一致的珊瑚红系）
  contributionEmpty: "#EBE6E0",
  contributionLow: "#f0d4c4",
  contributionMid: "#e9a070",
  contributionHigh: "#e07c3c",
  contributionMax: "#c96a2a",

  // 阴影
  shadow: "rgba(45, 45, 45, 0.06)",
  shadowSm: "rgba(45, 45, 45, 0.04)",

  // 时段颜色（Log Symptom 时间胶囊）
  timeSlotMorning: "#f5a623",
  timeSlotAfternoon: "#7ed321",
  timeSlotEvening: "#bd10e0",
  timeSlotNight: "#4a90d9",
};

/** Severity → pill background / text color pairs */
export const severityColors: Record<string, { bg: string; text: string }> = {
  high: { bg: "#FDECEC", text: "#C0392B" },
  medium: { bg: "#FDF0E6", text: "#D4790A" },
  low: { bg: "#FDF6E3", text: "#B8860B" },
  positive: { bg: "#E8F5EE", text: "#3D8B5A" },
};
