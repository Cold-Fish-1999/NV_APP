import { Alert } from "react-native";
import type { Router } from "expo-router";
import { getUpgradeMessage, type UpgradeReason } from "./freeUserLimits";

/**
 * 免费用户碰壁时弹出升级提示，点击「升级解锁」跳转定价页
 * daily_limit 时额外提供「去日历」按钮，引导用户手动录入症状
 */
export function showUpgradePrompt(
  reason: UpgradeReason,
  router: { push: Router["push"] }
): void {
  const message = getUpgradeMessage(reason);
  const buttons: Parameters<typeof Alert.alert>[2] = [
    { text: "Later", style: "cancel" },
    {
      text: "Upgrade",
      onPress: () => router.push("/pricing"),
    },
  ];
  if (reason === "daily_limit") {
    buttons.splice(1, 0, {
      text: "Go to Calendar",
      onPress: () => router.push("/(tabs)/calendar"),
    });
  }
  Alert.alert("Upgrade to unlock", message, buttons);
}
