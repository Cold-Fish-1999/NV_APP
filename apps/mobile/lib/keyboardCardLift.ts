import { Platform } from "react-native";

/**
 * iOS：从「键盘高度驱动的 translateY」里再减去的像素。
 * 数值越大，卡片整体上移越少（更贴近键盘、离状态栏更远）。
 * 真机若仍偏高/偏低，只调这一处即可。
 */
export const IOS_KEYBOARD_CARD_TRIM_PX = 100;




export function keyboardLiftForCard(
  keyboardHeight: number,
  safeBottomInset: number,
): number {
  const raw = Math.max(0, keyboardHeight - safeBottomInset);
  if (Platform.OS !== "ios") return raw;
  return Math.max(0, raw - IOS_KEYBOARD_CARD_TRIM_PX);
}
