/**
 * App-wide font families.
 *
 * Sans-serif (UI / buttons / labels / user input):  DM Sans
 * Serif – Latin (AI replies, EN/ES/FR):             Lora
 * Serif – Chinese (AI replies, ZH):                 Noto Serif SC
 *
 * Fonts are loaded in app/_layout.tsx via expo-font.
 * Use the string constants below as fontFamily values.
 */

import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import {
  Lora_400Regular,
  Lora_500Medium,
  Lora_600SemiBold,
  Lora_700Bold,
  Lora_400Regular_Italic,
} from "@expo-google-fonts/lora";
import {
  NotoSerifSC_400Regular,
  NotoSerifSC_500Medium,
  NotoSerifSC_700Bold,
} from "@expo-google-fonts/noto-serif-sc";

/** Map passed to useFonts() in root layout */
export const FONT_MAP = {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  Lora_400Regular,
  Lora_500Medium,
  Lora_600SemiBold,
  Lora_700Bold,
  Lora_400Regular_Italic,
  NotoSerifSC_400Regular,
  NotoSerifSC_500Medium,
  NotoSerifSC_700Bold,
};

// ── Sans-serif (DM Sans) ────────────────────────────────────

export const FONT_SANS = "DMSans_400Regular";
export const FONT_SANS_MEDIUM = "DMSans_500Medium";
export const FONT_SANS_SEMIBOLD = "DMSans_600SemiBold";
export const FONT_SANS_BOLD = "DMSans_600SemiBold";

// ── Serif (Lora for Latin, Noto Serif SC for Chinese) ───────

export const FONT_SERIF = "Lora_400Regular";
export const FONT_SERIF_MEDIUM = "Lora_500Medium";
export const FONT_SERIF_SEMIBOLD = "Lora_600SemiBold";
export const FONT_SERIF_BOLD = "Lora_700Bold";
export const FONT_SERIF_ITALIC = "Lora_400Regular_Italic";

export const FONT_SERIF_ZH = "NotoSerifSC_400Regular";
export const FONT_SERIF_ZH_MEDIUM = "NotoSerifSC_500Medium";
export const FONT_SERIF_ZH_BOLD = "NotoSerifSC_700Bold";

// ── Dynamic helper ──────────────────────────────────────────

const ZH_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf]/;

/**
 * Pick the correct serif font based on text content.
 * Chinese text → Noto Serif SC, otherwise → Lora.
 */
export function fontSerif(text?: string | null): string {
  if (text && ZH_REGEX.test(text)) return FONT_SERIF_ZH;
  return FONT_SERIF;
}

export function fontSerifBold(text?: string | null): string {
  if (text && ZH_REGEX.test(text)) return FONT_SERIF_ZH_BOLD;
  return FONT_SERIF_BOLD;
}
