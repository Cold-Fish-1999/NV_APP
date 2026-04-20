/** 与底部 Tab 栏高度一致（用于 FAB 垫在 Tab 之上） */
export const FLOAT_TAB_BAR_HEIGHT = 52;

/** 圆形添加按钮尺寸 */
export const FAB_SIZE_PX = 52;

/**
 * FAB 距屏幕右边缘 — 调整添加按钮水平位置主要改这里。
 */
export const FAB_FROM_RIGHT_PX = 30;

/** FAB 在 Tab 栏上方的额外间距 */
export const FAB_ABOVE_TAB_OFFSET_PX = 16;

/** 无刘海设备时与底部的基准间距 */
export const FAB_FALLBACK_BOTTOM_INSET_PX = 12;

/** 有安全区时从 bottom inset 里减去的量（与 Tab 视觉对齐） */
export const FAB_SAFE_AREA_TRIM_PX = 12;1

/**
 * 卡片底边与 FAB 顶边之间的空隙 — 两页 Health 卡片共用。
 * 想拉近/拉远卡片与按钮，主要改这里。
 */
export const FAB_TO_CARD_VERTICAL_GAP_PX = 10;

/**
 * 卡片左缘距屏幕；右缘与 FAB 右缘对齐（卡片在按钮左上方展开）。
 */
export const CARD_FROM_LEFT_PX = 10;

/** 与 FAB 右对齐，保持与 FAB_FROM_RIGHT_PX 一致 */
export const CARD_FROM_RIGHT_PX = FAB_FROM_RIGHT_PX;

export function tabBarClearance(bottomInset: number): number {
  return bottomInset > 0 ? bottomInset - FAB_SAFE_AREA_TRIM_PX : FAB_FALLBACK_BOTTOM_INSET_PX;
}

/** 添加按钮 `bottom` 样式值 */
export function computeFabBottom(bottomInset: number): number {
  return tabBarClearance(bottomInset) + FLOAT_TAB_BAR_HEIGHT + FAB_ABOVE_TAB_OFFSET_PX;
}

/** 弹层卡片 `bottom`（卡片底边在 FAB 顶边之上 FAB_TO_CARD_VERTICAL_GAP_PX） */
export function computeCardBottomAboveFab(fabBottom: number): number {
  return fabBottom + FAB_SIZE_PX + FAB_TO_CARD_VERTICAL_GAP_PX;
}

export function computeFabCardMaxHeight(fabBottom: number, topInset: number, screenH: number): number {
  const cardBottom = computeCardBottomAboveFab(fabBottom);
  return screenH - cardBottom - topInset - 12;
}
